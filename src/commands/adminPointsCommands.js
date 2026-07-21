const {
    PermissionFlagsBits,
    SlashCommandBuilder
} = require("discord.js");

const { logToChannel } = require("../services/logger");
const {
    ADMIN_POINT_OPERATIONS,
    AdminPointError,
    MAX_ADMIN_POINT_AMOUNT,
    createAdminPointsService
} = require("../services/adminPointsService");
const {
    createErrorEmbed,
    createInfoEmbed,
    createSuccessEmbed
} = require("../utils/embedFactory");

const ADMIN_POINTS_DENIED_MESSAGE = "⛔ Nie masz uprawnień do zarządzania Punktami Poligonu.";
const ADMIN_POINTS_FAILURE_MESSAGE = "❌ Nie udało się zmienić Punktów Poligonu. Sprawdź logi bota.";

function getDefaultUpdateRankingMessage() {
    return require("../services/rankingService").updateRankingMessage;
}

function getAllowedAdminIds(env = process.env) {
    return new Set(
        String(env.ADMIN_USER_IDS || "")
            .split(",")
            .map((id) => id.trim())
            .filter(Boolean)
    );
}

function hasPermissionFlag(interaction, permissionFlag) {
    const permissions = interaction.memberPermissions || interaction.member?.permissions;

    if (!permissions?.has) {
        return false;
    }

    return permissions.has(permissionFlag);
}

// Wymaga uprawnienia Discord oraz opcjonalnej allowlisty ADMIN_USER_IDS.
function hasAdminPointPermission(interaction, env = process.env) {
    const hasDiscordPermission = hasPermissionFlag(interaction, PermissionFlagsBits.Administrator)
        || hasPermissionFlag(interaction, PermissionFlagsBits.ManageGuild);

    if (!hasDiscordPermission) {
        return false;
    }

    const allowedAdminIds = getAllowedAdminIds(env);

    if (allowedAdminIds.size === 0) {
        return true;
    }

    return allowedAdminIds.has(interaction.user.id);
}

function getUserLabel(user) {
    return user.tag || user.username || user.id;
}

function getOperationLabel(operation) {
    if (operation === ADMIN_POINT_OPERATIONS.ADD) {
        return "Dodano";
    }

    if (operation === ADMIN_POINT_OPERATIONS.SUBTRACT) {
        return "Odjęto";
    }

    return "Ustawiono";
}

function truncateText(value, maxLength = 120) {
    const text = String(value || "Nie podano");

    if (text.length <= maxLength) {
        return text;
    }

    return `${text.slice(0, maxLength - 3)}...`;
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

async function sendNoPermission(interaction) {
    await editOrReply(interaction, {
        embeds: [
            createErrorEmbed({
                title: "⛔ Brak uprawnień",
                description: ADMIN_POINTS_DENIED_MESSAGE
            })
        ]
    });
}

function createAdminPointsSuccessEmbed({ rankingUpdated, result, targetUser }) {
    return createSuccessEmbed({
        title: "✅ Zmieniono Punkty Poligonu",
        description: [
            `Użytkownik: <@${targetUser.id}>`,
            `Operacja: ${getOperationLabel(result.operation)}`,
            `Kwota: ${result.amount} PP`,
            "",
            "Saldo:",
            `${result.balanceAfter} PP`,
            "",
            "Łącznie zdobyte:",
            `${result.totalEarnedAfter} PP`,
            "",
            `Poprzednie saldo: ${result.balanceBefore} PP`,
            `Powód: ${result.reason}`,
            "",
            `Ranking odświeżony: ${rankingUpdated ? "tak" : "nie"}`
        ].join("\n")
    });
}

function createAdminPointsHistoryEmbed(rows, targetUser = null) {
    const title = targetUser
        ? `Historia PP: ${getUserLabel(targetUser)}`
        : "Historia administracyjnych zmian PP";
    const description = rows.length === 0
        ? "Brak zapisanych operacji."
        : rows.map((row) => [
            `#${row.id} • ${row.created_at}`,
            `Cel: ${row.target_discord_id}`,
            `Admin: ${row.admin_discord_id}`,
            `Operacja: ${getOperationLabel(row.operation)} ${row.amount} PP`,
            `Saldo: ${row.balance_before} → ${row.balance_after} PP`,
            `Powód: ${truncateText(row.reason)}`
        ].join("\n")).join("\n\n").slice(0, 3800);

    return createInfoEmbed({
        title,
        description
    });
}

async function refreshRanking(client, updateRanking = getDefaultUpdateRankingMessage(), logger = console) {
    try {
        await updateRanking(client);
        return true;
    } catch (error) {
        logger.error(`[ADMIN_PP] Nie udało się odświeżyć rankingu: ${error.stack || error.message}`);
        return false;
    }
}

async function writeAdminPointsLog({
    client,
    logger = console,
    result,
    sendLogToChannel = logToChannel,
    targetUser,
    adminUser
}) {
    const reason = result.reason || "Nie podano";
    const logMessage = [
        "[ADMIN_PP]",
        `admin=${adminUser.id}`,
        `target=${targetUser.id}`,
        `operation=${result.operation}`,
        `amount=${result.amount}`,
        `before=${result.balanceBefore}`,
        `after=${result.balanceAfter}`,
        `total_earned=${result.totalEarnedAfter}`,
        `reason=${reason}`
    ].join(" ");

    logger.info(logMessage);

    try {
        await sendLogToChannel(
            client,
            [
                "🛡️ Administracyjna zmiana Punktów Poligonu",
                "",
                `Admin: ${getUserLabel(adminUser)} (${adminUser.id})`,
                `Użytkownik: ${getUserLabel(targetUser)} (${targetUser.id})`,
                `Operacja: ${getOperationLabel(result.operation)}`,
                `Kwota: ${result.amount} PP`,
                `Poprzednie saldo: ${result.balanceBefore} PP`,
                `Nowe saldo: ${result.balanceAfter} PP`,
                `Łącznie zdobyte: ${result.totalEarnedAfter} PP`,
                `Powód: ${reason}`
            ].join("\n")
        );
    } catch (error) {
        logger.error(`[ADMIN_PP] Nie udało się wysłać logu kanałowego: ${error.stack || error.message}`);
    }
}

async function handleAdminPointsError({ error, interaction, logger = console }) {
    logger.error(`[ADMIN_PP] Błąd komendy: ${error.stack || error.message}`);

    const description = error instanceof AdminPointError
        ? error.message
        : ADMIN_POINTS_FAILURE_MESSAGE;

    await editOrReply(interaction, {
        embeds: [
            createErrorEmbed({
                title: "❌ Nie zmieniono Punktów Poligonu",
                description
            })
        ],
        components: [],
        files: []
    });
}

const adminPointsCommand = {
    data: new SlashCommandBuilder()
        .setName("admin-punkty")
        .setDescription("Bezpiecznie dodaje, odejmuje albo ustawia Punkty Poligonu użytkownika.")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addUserOption((option) => option
            .setName("użytkownik")
            .setDescription("Użytkownik, którego saldo PP ma zostać zmienione.")
            .setRequired(true))
        .addStringOption((option) => option
            .setName("operacja")
            .setDescription("Rodzaj administracyjnej zmiany PP.")
            .setRequired(true)
            .addChoices(
                {
                    name: "dodaj",
                    value: ADMIN_POINT_OPERATIONS.ADD
                },
                {
                    name: "odejmij",
                    value: ADMIN_POINT_OPERATIONS.SUBTRACT
                },
                {
                    name: "ustaw",
                    value: ADMIN_POINT_OPERATIONS.SET
                }
            ))
        .addIntegerOption((option) => option
            .setName("ilość")
            .setDescription("Dodatnia liczba całkowita PP.")
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(MAX_ADMIN_POINT_AMOUNT))
        .addStringOption((option) => option
            .setName("powód")
            .setDescription("Opcjonalny powód zmiany salda.")
            .setRequired(false)),

    async execute(interaction, dependencies = {}) {
        const logger = dependencies.logger || console;
        let stage = "start";

        try {
            await interaction.deferReply({
                ephemeral: true
            });
            stage = "deferred";

            if (!hasAdminPointPermission(interaction, dependencies.env || process.env)) {
                await sendNoPermission(interaction);
                return;
            }

            const targetUser = interaction.options.getUser("użytkownik", true);
            const operation = interaction.options.getString("operacja", true);
            const amount = interaction.options.getInteger("ilość", true);
            const reason = interaction.options.getString("powód") || null;
            const service = dependencies.adminPointsService || createAdminPointsService(dependencies);

            stage = "database";
            const result = service.changePoints({
                adminUser: interaction.user,
                amount,
                operation,
                reason,
                targetUser
            });

            stage = "ranking";
            const rankingUpdated = await refreshRanking(
                interaction.client,
                dependencies.updateRankingMessage || getDefaultUpdateRankingMessage(),
                logger
            );

            stage = "log";
            await writeAdminPointsLog({
                adminUser: interaction.user,
                client: interaction.client,
                logger,
                result,
                sendLogToChannel: dependencies.logToChannel || logToChannel,
                targetUser
            });

            stage = "reply";
            await interaction.editReply({
                embeds: [
                    createAdminPointsSuccessEmbed({
                        rankingUpdated,
                        result,
                        targetUser
                    })
                ]
            });
        } catch (error) {
            logger.error(`[ADMIN_PP] Etap błędu: ${stage}`);
            await handleAdminPointsError({
                error,
                interaction,
                logger
            });
        }
    }
};

const adminPointsHistoryCommand = {
    data: new SlashCommandBuilder()
        .setName("admin-punkty-historia")
        .setDescription("Pokazuje ostatnie administracyjne zmiany Punktów Poligonu.")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addUserOption((option) => option
            .setName("użytkownik")
            .setDescription("Opcjonalny filtr po użytkowniku.")
            .setRequired(false))
        .addIntegerOption((option) => option
            .setName("limit")
            .setDescription("Liczba wpisów od 1 do 25.")
            .setRequired(false)
            .setMinValue(1)
            .setMaxValue(25)),

    async execute(interaction, dependencies = {}) {
        const logger = dependencies.logger || console;

        try {
            await interaction.deferReply({
                ephemeral: true
            });

            if (!hasAdminPointPermission(interaction, dependencies.env || process.env)) {
                await sendNoPermission(interaction);
                return;
            }

            const targetUser = interaction.options.getUser("użytkownik") || null;
            const limit = interaction.options.getInteger("limit") || 10;
            const service = dependencies.adminPointsService || createAdminPointsService(dependencies);
            const rows = service.listHistory({
                limit,
                targetDiscordId: targetUser?.id || null
            });

            await interaction.editReply({
                embeds: [
                    createAdminPointsHistoryEmbed(rows, targetUser)
                ]
            });
        } catch (error) {
            logger.error(`[ADMIN_PP] Błąd historii: ${error.stack || error.message}`);
            await editOrReply(interaction, {
                embeds: [
                    createErrorEmbed({
                        title: "❌ Nie pobrano historii PP",
                        description: "Nie udało się pobrać historii zmian. Sprawdź logi bota."
                    })
                ],
                components: [],
                files: []
            });
        }
    }
};

module.exports = {
    ADMIN_POINTS_DENIED_MESSAGE,
    commands: [
        adminPointsCommand,
        adminPointsHistoryCommand
    ],
    getAllowedAdminIds,
    hasAdminPointPermission
};
