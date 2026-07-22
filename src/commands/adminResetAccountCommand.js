const crypto = require("node:crypto");
const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    PermissionFlagsBits,
    SlashCommandBuilder
} = require("discord.js");

const { logToChannel } = require("../services/logger");
const {
    ADMIN_RESET_SCOPES,
    AdminResetAccountError,
    createAdminResetAccountService,
    normalizeReason,
    normalizeScope
} = require("../services/adminResetAccountService");
const { updateRankingMessage } = require("../services/rankingService");
const { hasAdminPointPermission } = require("./adminPointsCommands");
const {
    createErrorEmbed,
    createInfoEmbed,
    createSuccessEmbed
} = require("../utils/embedFactory");

const ADMIN_RESET_DENIED_MESSAGE = "⛔ Nie masz uprawnień do wykonania tej operacji.";
const ADMIN_RESET_FAILURE_MESSAGE = "Nie udało się zresetować konta. Sprawdź logi bota.";
const ADMIN_RESET_TIMEOUT_MS = 60_000;
const ADMIN_RESET_CUSTOM_ID_PREFIX = "admin-reset-konto";

const pendingResets = new Map();

function getScopeLabel(scope) {
    if (scope === ADMIN_RESET_SCOPES.ALL) {
        return "wszystko";
    }

    if (scope === ADMIN_RESET_SCOPES.POINTS_ONLY) {
        return "tylko PP";
    }

    if (scope === ADMIN_RESET_SCOPES.PROFILE_ONLY) {
        return "tylko profil";
    }

    return "tylko sklep";
}

function getUserLabel(user) {
    return user.tag || user.username || user.id;
}

function createPendingId() {
    return crypto.randomBytes(6).toString("hex");
}

function createResetCustomId(action, pendingId) {
    return `${ADMIN_RESET_CUSTOM_ID_PREFIX}:${action}:${pendingId}`;
}

function parseAdminResetCustomId(customId) {
    const [prefix, action, pendingId] = String(customId || "").split(":");

    if (prefix !== ADMIN_RESET_CUSTOM_ID_PREFIX || !action || !pendingId) {
        return null;
    }

    if (!["confirm", "cancel"].includes(action)) {
        return null;
    }

    return {
        action,
        pendingId
    };
}

function createConfirmationRow(pendingId, disabled = false) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(createResetCustomId("confirm", pendingId))
            .setLabel("🟢 Potwierdź reset")
            .setStyle(ButtonStyle.Success)
            .setDisabled(disabled),
        new ButtonBuilder()
            .setCustomId(createResetCustomId("cancel", pendingId))
            .setLabel("🔴 Anuluj")
            .setStyle(ButtonStyle.Danger)
            .setDisabled(disabled)
    );
}

function createConfirmationEmbed({ reason, scope, targetUser }) {
    return createInfoEmbed({
        title: "⚠️ Potwierdź reset konta",
        description: [
            "Ta operacja jest nieodwracalna.",
            "",
            `Użytkownik: <@${targetUser.id}>`,
            `Zakres: ${getScopeLabel(scope)}`,
            `Powód: ${reason}`,
            "",
            "Reset zostanie anulowany automatycznie po 60 sekundach."
        ].join("\n")
    });
}

function createSuccessResetEmbed({ reason, scope, targetUser }) {
    return createSuccessEmbed({
        title: "✅ Konto zostało zresetowane.",
        description: [
            `Użytkownik: <@${targetUser.id}>`,
            `Zakres: ${getScopeLabel(scope)}`,
            `Powód: ${reason}`
        ].join("\n")
    });
}

function createCanceledEmbed(description = "Operacja resetu konta została anulowana.") {
    return createInfoEmbed({
        title: "Reset konta anulowany",
        description
    });
}

function createDeniedEmbed() {
    return createErrorEmbed({
        title: "Brak uprawnień",
        description: ADMIN_RESET_DENIED_MESSAGE
    });
}

function createExpiredEmbed() {
    return createErrorEmbed({
        title: "Reset wygasł",
        description: "Potwierdzenie resetu konta wygasło. Uruchom komendę ponownie."
    });
}

async function editOrReply(interaction, payload) {
    if (interaction.deferred || interaction.replied) {
        await interaction.editReply(payload);
        return;
    }

    await interaction.reply({
        ...payload,
        ephemeral: true
    });
}

async function replyNoPermission(interaction) {
    await editOrReply(interaction, {
        embeds: [
            createDeniedEmbed()
        ],
        components: []
    });
}

async function expirePendingReset(pendingId) {
    const pending = pendingResets.get(pendingId);

    if (!pending) {
        return false;
    }

    pendingResets.delete(pendingId);

    try {
        await pending.sourceInteraction.editReply({
            embeds: [
                createCanceledEmbed("Nie potwierdzono resetu w ciągu 60 sekund.")
            ],
            components: []
        });
    } catch (error) {
        const logger = pending.dependencies.logger || console;

        logger.error(`[ADMIN_RESET] Nie udało się oznaczyć resetu jako wygasły: ${error.stack || error.message}`);
    }

    return true;
}

function schedulePendingReset(pending, dependencies = {}) {
    const setTimeoutFn = dependencies.setTimeoutFn || setTimeout;
    const timeoutMs = dependencies.timeoutMs || ADMIN_RESET_TIMEOUT_MS;

    pending.timeoutHandle = setTimeoutFn(() => {
        expirePendingReset(pending.id);
    }, timeoutMs);
}

function clearPendingResetTimer(pending, dependencies = {}) {
    const clearTimeoutFn = dependencies.clearTimeoutFn || clearTimeout;

    if (pending.timeoutHandle) {
        clearTimeoutFn(pending.timeoutHandle);
    }
}

function storePendingReset({
    adminUser,
    dependencies,
    reason,
    scope,
    sourceInteraction,
    targetUser
}) {
    const id = createPendingId();
    const pending = {
        adminUser,
        createdAt: Date.now(),
        dependencies,
        id,
        reason,
        scope,
        sourceInteraction,
        targetUser
    };

    pendingResets.set(id, pending);
    schedulePendingReset(pending, dependencies);

    return pending;
}

function shouldRefreshRanking(scope) {
    return scope !== ADMIN_RESET_SCOPES.SHOP_ONLY;
}

async function refreshRankingIfNeeded({ client, dependencies, scope }) {
    if (!shouldRefreshRanking(scope)) {
        return false;
    }

    const logger = dependencies.logger || console;
    const updateRanking = dependencies.updateRankingMessage || updateRankingMessage;

    try {
        await updateRanking(client);
        return true;
    } catch (error) {
        logger.error(`[ADMIN_RESET] Nie udało się odświeżyć rankingu: ${error.stack || error.message}`);
        return false;
    }
}

async function writeAdminResetLog({
    adminUser,
    client,
    dependencies,
    reason,
    result,
    scope,
    targetUser
}) {
    const logger = dependencies.logger || console;
    const sendLogToChannel = dependencies.logToChannel || logToChannel;
    const logMessage = [
        "[ADMIN_RESET]",
        `admin=${adminUser.id}`,
        `target=${targetUser.id}`,
        `scope=${scope}`,
        `reason=${reason}`
    ].join(" ");

    logger.info(logMessage);

    try {
        await sendLogToChannel(
            client,
            [
                "🛡️ Administracyjny reset konta",
                "",
                `Admin: ${getUserLabel(adminUser)} (${adminUser.id})`,
                `Użytkownik: ${getUserLabel(targetUser)} (${targetUser.id})`,
                `Zakres: ${getScopeLabel(scope)}`,
                `Powód: ${reason}`,
                "",
                `Inventory usunięte: ${result.changes.inventoryDeleted}`,
                `Equipment usunięte: ${result.changes.equipmentDeleted}`,
                `Odznaki usunięte: ${result.changes.badgesDeleted}`
            ].join("\n")
        );
    } catch (error) {
        logger.error(`[ADMIN_RESET] Nie udało się wysłać logu kanałowego: ${error.stack || error.message}`);
    }
}

async function handleResetError({ error, interaction, logger = console }) {
    logger.error(`[ADMIN_RESET] Błąd komendy: ${error.stack || error.message}`);

    const description = error instanceof AdminResetAccountError
        ? error.message
        : ADMIN_RESET_FAILURE_MESSAGE;

    await editOrReply(interaction, {
        embeds: [
            createErrorEmbed({
                title: "Nie zresetowano konta",
                description
            })
        ],
        components: [],
        files: []
    });
}

const adminResetAccountCommand = {
    data: new SlashCommandBuilder()
        .setName("admin-reset-konto")
        .setDescription("Bezpiecznie resetuje konto użytkownika Poligonu CAD po potwierdzeniu.")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addUserOption((option) => option
            .setName("użytkownik")
            .setDescription("Użytkownik, którego konto ma zostać zresetowane.")
            .setRequired(true))
        .addStringOption((option) => option
            .setName("zakres")
            .setDescription("Zakres resetu konta.")
            .setRequired(true)
            .addChoices(
                {
                    name: "wszystko",
                    value: ADMIN_RESET_SCOPES.ALL
                },
                {
                    name: "tylko-pp",
                    value: ADMIN_RESET_SCOPES.POINTS_ONLY
                },
                {
                    name: "tylko-profil",
                    value: ADMIN_RESET_SCOPES.PROFILE_ONLY
                },
                {
                    name: "tylko-sklep",
                    value: ADMIN_RESET_SCOPES.SHOP_ONLY
                }
            ))
        .addStringOption((option) => option
            .setName("powód")
            .setDescription("Opcjonalny powód resetu.")
            .setRequired(false)),

    async execute(interaction, dependencies = {}) {
        const logger = dependencies.logger || console;

        try {
            await interaction.deferReply({
                ephemeral: true
            });

            if (!hasAdminPointPermission(interaction, dependencies.env || process.env)) {
                await replyNoPermission(interaction);
                return;
            }

            const targetUser = interaction.options.getUser("użytkownik", true);
            const scope = normalizeScope(interaction.options.getString("zakres", true));
            const reason = normalizeReason(interaction.options.getString("powód"));
            const pending = storePendingReset({
                adminUser: interaction.user,
                dependencies,
                reason,
                scope,
                sourceInteraction: interaction,
                targetUser
            });

            await interaction.editReply({
                embeds: [
                    createConfirmationEmbed({
                        reason,
                        scope,
                        targetUser
                    })
                ],
                components: [
                    createConfirmationRow(pending.id)
                ]
            });
        } catch (error) {
            await handleResetError({
                error,
                interaction,
                logger
            });
        }
    }
};

async function handleAdminResetButton(interaction, dependencies = {}) {
    if (!interaction.isButton()) {
        return false;
    }

    const resetButton = parseAdminResetCustomId(interaction.customId);

    if (!resetButton) {
        return false;
    }

    const pending = pendingResets.get(resetButton.pendingId);
    const permissionEnv = dependencies.env || pending?.dependencies.env || process.env;

    if (!hasAdminPointPermission(interaction, permissionEnv)) {
        await replyNoPermission(interaction);
        return true;
    }

    if (!pending) {
        await interaction.reply({
            embeds: [
                createExpiredEmbed()
            ],
            ephemeral: true
        });
        return true;
    }

    if (pending.adminUser.id !== interaction.user.id) {
        await interaction.reply({
            embeds: [
                createErrorEmbed({
                    title: "Nieprawidłowe potwierdzenie",
                    description: "Ten reset należy do innej sesji administratora."
                })
            ],
            ephemeral: true
        });
        return true;
    }

    const mergedDependencies = {
        ...pending.dependencies,
        ...dependencies
    };

    if (resetButton.action === "cancel") {
        clearPendingResetTimer(pending, mergedDependencies);
        pendingResets.delete(pending.id);
        await interaction.deferUpdate();
        await interaction.editReply({
            embeds: [
                createCanceledEmbed()
            ],
            components: []
        });
        return true;
    }

    clearPendingResetTimer(pending, mergedDependencies);
    pendingResets.delete(pending.id);
    await interaction.deferUpdate();

    try {
        const service = mergedDependencies.adminResetAccountService
            || createAdminResetAccountService(mergedDependencies);
        const result = service.resetAccount({
            adminUser: pending.adminUser,
            reason: pending.reason,
            scope: pending.scope,
            targetUser: pending.targetUser
        });

        await refreshRankingIfNeeded({
            client: interaction.client,
            dependencies: mergedDependencies,
            scope: pending.scope
        });
        await writeAdminResetLog({
            adminUser: pending.adminUser,
            client: interaction.client,
            dependencies: mergedDependencies,
            reason: result.reason,
            result,
            scope: pending.scope,
            targetUser: pending.targetUser
        });
        await interaction.editReply({
            embeds: [
                createSuccessResetEmbed({
                    reason: result.reason,
                    scope: pending.scope,
                    targetUser: pending.targetUser
                })
            ],
            components: []
        });
    } catch (error) {
        await handleResetError({
            error,
            interaction,
            logger: mergedDependencies.logger || console
        });
    }

    return true;
}

module.exports = {
    ADMIN_RESET_CUSTOM_ID_PREFIX,
    ADMIN_RESET_DENIED_MESSAGE,
    ADMIN_RESET_TIMEOUT_MS,
    command: adminResetAccountCommand,
    commands: [
        adminResetAccountCommand
    ],
    createConfirmationRow,
    expirePendingReset,
    handleAdminResetButton,
    parseAdminResetCustomId,
    pendingResets
};
