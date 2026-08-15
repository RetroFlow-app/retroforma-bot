const {
    PermissionFlagsBits,
    SlashCommandBuilder
} = require("discord.js");

const { logToChannel } = require("../services/logger");
const {
    ADMIN_XP_OPERATIONS,
    AdminXpError,
    MAX_ADMIN_XP_AMOUNT,
    createAdminXpService
} = require("../services/adminXpService");
const {
    ADMIN_REWARD_NOTIFICATION_FAILED_MESSAGE,
    sendAdminRewardNotification
} = require("../services/adminRewardNotificationService");
const { hasAdminPointPermission } = require("./adminPointsCommands");
const {
    createErrorEmbed,
    createSuccessEmbed
} = require("../utils/embedFactory");

const ADMIN_XP_DENIED_MESSAGE = "⛔ Nie masz uprawnień do wykonania tej operacji.";
const ADMIN_XP_FAILURE_MESSAGE = "❌ Nie udało się zmienić XP użytkownika. Sprawdź logi bota.";

function getUserLabel(user) {
    return user.tag || user.username || user.id;
}

function getOperationLabel(operation) {
    if (operation === ADMIN_XP_OPERATIONS.ADD) {
        return "Dodano";
    }

    if (operation === ADMIN_XP_OPERATIONS.SUBTRACT) {
        return "Odjęto";
    }

    return "Ustawiono";
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
                description: ADMIN_XP_DENIED_MESSAGE
            })
        ]
    });
}

function createAdminXpSuccessEmbed({
    notificationResult = null,
    result,
    targetUser
}) {
    const embed = createSuccessEmbed({
        title: "✅ Zmieniono XP użytkownika",
        description: [
            `Użytkownik: <@${targetUser.id}>`,
            `Operacja: ${getOperationLabel(result.operation)}`,
            `Kwota: ${result.amount} XP`,
            `XP przed: ${result.xpBefore}`,
            `XP po: ${result.xpAfter}`,
            `Poziom przed: ${result.levelBefore}`,
            `Poziom po: ${result.levelAfter}`,
            `Powód: ${result.reason}`
        ].join("\n")
    });

    if (notificationResult && notificationResult.delivered === false) {
        embed.setDescription(`${embed.data.description}\n\n${ADMIN_REWARD_NOTIFICATION_FAILED_MESSAGE}`);
    }

    return embed;
}

async function writeAdminXpLog({
    client,
    logger = console,
    result,
    sendLogToChannel = logToChannel,
    targetUser,
    adminUser
}) {
    const reason = result.reason || "Nie podano";
    logger.info("[ADMIN_XP]", {
        admin: adminUser.id,
        target: targetUser.id,
        operation: result.operation,
        amount: result.amount,
        xpBefore: result.xpBefore,
        xpAfter: result.xpAfter,
        levelBefore: result.levelBefore,
        levelAfter: result.levelAfter,
        reason
    });

    try {
        await sendLogToChannel(
            client,
            [
                "🛡️ Administracyjna zmiana XP",
                "",
                `Admin: ${getUserLabel(adminUser)} (${adminUser.id})`,
                `Użytkownik: ${getUserLabel(targetUser)} (${targetUser.id})`,
                `Operacja: ${getOperationLabel(result.operation)}`,
                `Ilość: ${result.amount} XP`,
                `XP: ${result.xpBefore} → ${result.xpAfter}`,
                `Poziom: ${result.levelBefore} → ${result.levelAfter}`,
                `Powód: ${reason}`
            ].join("\n")
        );
    } catch (error) {
        logger.error(`[ADMIN_XP] Nie udało się wysłać logu kanałowego: ${error.stack || error.message}`);
    }
}

async function handleAdminXpError({ error, interaction, logger = console }) {
    logger.error(`[ADMIN_XP] Błąd komendy: ${error.stack || error.message}`);

    const description = error instanceof AdminXpError
        ? error.message
        : ADMIN_XP_FAILURE_MESSAGE;

    await editOrReply(interaction, {
        embeds: [
            createErrorEmbed({
                title: "❌ Nie zmieniono XP",
                description
            })
        ],
        components: [],
        files: []
    });
}

const adminXpCommand = {
    data: new SlashCommandBuilder()
        .setName("admin-xp")
        .setDescription("Bezpiecznie dodaje, odejmuje albo ustawia XP użytkownika.")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addUserOption((option) => option
            .setName("użytkownik")
            .setDescription("Użytkownik, którego XP ma zostać zmienione.")
            .setRequired(true))
        .addStringOption((option) => option
            .setName("operacja")
            .setDescription("Rodzaj administracyjnej zmiany XP.")
            .setRequired(true)
            .addChoices(
                {
                    name: "dodaj",
                    value: ADMIN_XP_OPERATIONS.ADD
                },
                {
                    name: "odejmij",
                    value: ADMIN_XP_OPERATIONS.SUBTRACT
                },
                {
                    name: "ustaw",
                    value: ADMIN_XP_OPERATIONS.SET
                }
            ))
        .addIntegerOption((option) => option
            .setName("ilość")
            .setDescription("Dodatnia liczba całkowita XP.")
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(MAX_ADMIN_XP_AMOUNT))
        .addStringOption((option) => option
            .setName("powód")
            .setDescription("Opcjonalny powód zmiany XP.")
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
            const service = dependencies.adminXpService || createAdminXpService(dependencies);

            stage = "database";
            const result = service.changeXP({
                adminUser: interaction.user,
                amount,
                operation,
                reason,
                targetUser
            });

            stage = "log";
            await writeAdminXpLog({
                adminUser: interaction.user,
                client: interaction.client,
                logger,
                result,
                sendLogToChannel: dependencies.logToChannel || logToChannel,
                targetUser
            });

            stage = "notification";
            const notificationResult = result.operation === ADMIN_XP_OPERATIONS.ADD
                ? await (dependencies.sendAdminRewardNotification || sendAdminRewardNotification)({
                    client: interaction.client,
                    logger,
                    result,
                    targetUser,
                    type: "XP"
                })
                : null;

            stage = "reply";
            await interaction.editReply({
                embeds: [
                    createAdminXpSuccessEmbed({
                        notificationResult,
                        result,
                        targetUser
                    })
                ]
            });
        } catch (error) {
            logger.error(`[ADMIN_XP] Etap błędu: ${stage}`);
            await handleAdminXpError({
                error,
                interaction,
                logger
            });
        }
    }
};

module.exports = {
    ADMIN_XP_DENIED_MESSAGE,
    commands: [
        adminXpCommand
    ],
    createAdminXpSuccessEmbed
};
