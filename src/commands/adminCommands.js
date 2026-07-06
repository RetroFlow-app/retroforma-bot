const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    PermissionFlagsBits,
    SlashCommandBuilder
} = require("discord.js");

const config = require("../config/appConfig");
const {
    resetCurrentMission,
    resetCurrentMissionForUser,
    resetPoligon
} = require("../services/adminService");
const { logToChannel } = require("../services/logger");
const { updateRankingMessage } = require("../services/rankingService");
const {
    createErrorEmbed,
    createInfoEmbed,
    createSuccessEmbed
} = require("../utils/embedFactory");

const RESET_POLIGON_CONFIRM_PREFIX = "admin_reset_poligon_confirm";

function getUserLabel(user) {
    return user.tag || user.username || user.id;
}

// Sprawdza, czy użytkownik ma rolę moderatora Poligonu albo uprawnienie Administrator.
function hasAdminPermission(interaction) {
    if (interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
        return true;
    }

    if (!config.reviewRoleId) {
        return false;
    }

    const roles = interaction.member?.roles;

    if (roles?.cache?.has(config.reviewRoleId)) {
        return true;
    }

    if (Array.isArray(roles)) {
        return roles.includes(config.reviewRoleId);
    }

    return false;
}

async function replyNoPermission(interaction) {
    const payload = {
        embeds: [
            createErrorEmbed({
                title: "❌ Brak uprawnień",
                description: "Te komendy może wykonać tylko Moderator Poligonu albo Administrator."
            })
        ],
        ephemeral: true
    };

    if (interaction.deferred || interaction.replied) {
        await interaction.followUp(payload);
        return;
    }

    await interaction.reply(payload);
}

async function refreshRanking(client) {
    try {
        await updateRankingMessage(client);
        return true;
    } catch (error) {
        console.error(`Nie udało się odświeżyć rankingu po resecie admina: ${error.message}`);
        return false;
    }
}

async function writeAdminLog(client, interaction, action, lines) {
    await logToChannel(
        client,
        [
            "🛠️ Panel administratora",
            "",
            `Akcja: ${action}`,
            `Wykonał: ${getUserLabel(interaction.user)} (${interaction.user.id})`,
            "",
            ...lines
        ].join("\n")
    );
}

function createResetMissionSummaryEmbed(result, rankingUpdated) {
    return createSuccessEmbed({
        title: "✅ Misja zresetowana",
        description: [
            `Misja: #${result.missionNumber}`,
            `Usunięte zgłoszenia: ${result.deletedSubmissions}`,
            `Cofnięte zaakceptowane zgłoszenia: ${result.approvedRemoved}`,
            `Przeliczeni użytkownicy: ${result.affectedUsers}`,
            `Ranking odświeżony: ${rankingUpdated ? "tak" : "nie"}`
        ].join("\n")
    });
}

function createResetUserSummaryEmbed(targetUser, result, rankingUpdated) {
    return createSuccessEmbed({
        title: "✅ Użytkownik zresetowany dla aktualnej misji",
        description: [
            `Użytkownik: <@${targetUser.id}>`,
            `Misja: #${result.missionNumber}`,
            `Usunięte zgłoszenia: ${result.deletedSubmissions}`,
            `Cofnięte zaakceptowane zgłoszenia: ${result.approvedRemoved}`,
            `Cofnięte PP: ${result.ppRemoved}`,
            `Cofnięte XP: ${result.xpRemoved}`,
            `Ranking odświeżony: ${rankingUpdated ? "tak" : "nie"}`
        ].join("\n")
    });
}

function createResetPoligonSummaryEmbed(result, rankingUpdated) {
    return createSuccessEmbed({
        title: "✅ Dane testowe Poligonu wyczyszczone",
        description: [
            `Usunięte zgłoszenia: ${result.submissions}`,
            `Usunięci użytkownicy: ${result.users}`,
            `Usunięte odznaki użytkowników: ${result.userBadges}`,
            `Ranking odświeżony: ${rankingUpdated ? "tak" : "nie"}`
        ].join("\n")
    });
}

function createResetPoligonConfirmRow(userId) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`${RESET_POLIGON_CONFIRM_PREFIX}:${userId}`)
            .setLabel("Tak, resetuję dane")
            .setStyle(ButtonStyle.Danger)
    );
}

function parseResetPoligonConfirmCustomId(customId) {
    const [prefix, userId] = String(customId).split(":");

    if (prefix !== RESET_POLIGON_CONFIRM_PREFIX || !userId) {
        return null;
    }

    return {
        userId
    };
}

async function executeWithAdminPermission(interaction, callback) {
    if (!hasAdminPermission(interaction)) {
        await replyNoPermission(interaction);
        return;
    }

    await callback();
}

const resetMissionCommand = {
    data: new SlashCommandBuilder()
        .setName("reset-misja")
        .setDescription("Czyści zgłoszenia z aktualnie otwartej misji Poligonu CAD."),

    async execute(interaction) {
        await executeWithAdminPermission(interaction, async () => {
            await interaction.deferReply({
                ephemeral: true
            });

            try {
                const result = resetCurrentMission();
                const rankingUpdated = await refreshRanking(interaction.client);

                await writeAdminLog(interaction.client, interaction, "/reset-misja", [
                    `Misja: #${result.missionNumber}`,
                    `Usunięte zgłoszenia: ${result.deletedSubmissions}`,
                    `Cofnięte zaakceptowane: ${result.approvedRemoved}`,
                    `Przeliczeni użytkownicy: ${result.affectedUsers}`
                ]);
                await interaction.editReply({
                    embeds: [
                        createResetMissionSummaryEmbed(result, rankingUpdated)
                    ]
                });
            } catch (error) {
                await interaction.editReply({
                    embeds: [
                        createErrorEmbed({
                            title: "❌ Nie zresetowano misji",
                            description: error.message
                        })
                    ]
                });
            }
        });
    }
};

const resetUserCommand = {
    data: new SlashCommandBuilder()
        .setName("reset-uzytkownik")
        .setDescription("Czyści zgłoszenie użytkownika z aktualnej misji i cofa jej nagrody.")
        .addUserOption((option) => option
            .setName("user")
            .setDescription("Użytkownik do zresetowania.")
            .setRequired(true)),

    async execute(interaction) {
        await executeWithAdminPermission(interaction, async () => {
            await interaction.deferReply({
                ephemeral: true
            });

            const targetUser = interaction.options.getUser("user", true);

            try {
                const result = resetCurrentMissionForUser(targetUser.id);
                const rankingUpdated = await refreshRanking(interaction.client);

                await writeAdminLog(interaction.client, interaction, "/reset-uzytkownik", [
                    `Użytkownik: ${getUserLabel(targetUser)} (${targetUser.id})`,
                    `Misja: #${result.missionNumber}`,
                    `Usunięte zgłoszenia: ${result.deletedSubmissions}`,
                    `Cofnięte PP: ${result.ppRemoved}`,
                    `Cofnięte XP: ${result.xpRemoved}`
                ]);
                await interaction.editReply({
                    embeds: [
                        createResetUserSummaryEmbed(targetUser, result, rankingUpdated)
                    ]
                });
            } catch (error) {
                await interaction.editReply({
                    embeds: [
                        createErrorEmbed({
                            title: "❌ Nie zresetowano użytkownika",
                            description: error.message
                        })
                    ]
                });
            }
        });
    }
};

const resetPoligonCommand = {
    data: new SlashCommandBuilder()
        .setName("reset-poligon")
        .setDescription("Czyści wszystkie dane testowe Poligonu CAD po potwierdzeniu."),

    async execute(interaction) {
        await executeWithAdminPermission(interaction, async () => {
            await interaction.reply({
                embeds: [
                    createInfoEmbed({
                        title: "⚠️ Potwierdź reset Poligonu",
                        description: [
                            "Ta operacja usunie dane testowe:",
                            "",
                            "- submissions",
                            "- users",
                            "- odznaki użytkowników",
                            "",
                            "Ranking zostanie odświeżony do pustego stanu."
                        ].join("\n")
                    })
                ],
                components: [
                    createResetPoligonConfirmRow(interaction.user.id)
                ],
                ephemeral: true
            });
        });
    }
};

async function handleAdminButton(interaction) {
    if (!interaction.isButton()) {
        return false;
    }

    const resetConfirm = parseResetPoligonConfirmCustomId(interaction.customId);

    if (!resetConfirm) {
        return false;
    }

    if (!hasAdminPermission(interaction)) {
        await replyNoPermission(interaction);
        return true;
    }

    if (resetConfirm.userId !== interaction.user.id) {
        await interaction.reply({
            embeds: [
                createErrorEmbed({
                    title: "❌ Nieprawidłowe potwierdzenie",
                    description: "Ten przycisk należy do innej sesji resetu."
                })
            ],
            ephemeral: true
        });
        return true;
    }

    await interaction.deferUpdate();

    try {
        const result = resetPoligon();
        const rankingUpdated = await refreshRanking(interaction.client);

        await writeAdminLog(interaction.client, interaction, "/reset-poligon", [
            `Usunięte zgłoszenia: ${result.submissions}`,
            `Usunięci użytkownicy: ${result.users}`,
            `Usunięte odznaki użytkowników: ${result.userBadges}`
        ]);
        await interaction.editReply({
            embeds: [
                createResetPoligonSummaryEmbed(result, rankingUpdated)
            ],
            components: []
        });
    } catch (error) {
        await interaction.editReply({
            embeds: [
                createErrorEmbed({
                    title: "❌ Nie zresetowano Poligonu",
                    description: error.message
                })
            ],
            components: []
        });
    }

    return true;
}

module.exports = {
    commands: [
        resetMissionCommand,
        resetUserCommand,
        resetPoligonCommand
    ],
    handleAdminButton
};
