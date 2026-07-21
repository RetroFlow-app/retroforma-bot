const config = require("../config/appConfig");
const adminPanel = require("../commands/adminCommands");
const adminPointsPanel = require("../commands/adminPointsCommands");
const inventoryCommand = require("../commands/inventoryCommand");
const pointsCommand = require("../commands/pointsCommand");
const profileCommand = require("../commands/profileCommand");
const shopCommand = require("../commands/shopCommand");
const { handleInventoryInteraction } = require("./inventoryInteractionHandler");
const { handleShopInteraction } = require("./shopInteractionHandler");
const {
    createRejectReviewModal,
    getRejectReason,
    parseRejectReviewModalCustomId
} = require("../services/reviewModal");
const {
    parseReviewButtonCustomId,
    REVIEW_ACTIONS
} = require("../services/reviewButtons");
const {
    approveSubmission,
    rejectSubmission
} = require("../services/reviewService");

const commands = [
    profileCommand,
    pointsCommand,
    inventoryCommand,
    shopCommand,
    ...adminPanel.commands,
    ...adminPointsPanel.commands
];

// Usuwa stare globalne komendy, żeby /profil działał wyłącznie jako Guild Command.
async function clearGlobalSlashCommands(client) {
    await client.application.commands.set([]);
}

// Pobiera pełne obiekty serwerów, na których można rejestrować komendy.
async function getGuildsForCommandRegistration(client) {
    if (client.guilds.cache.size > 0) {
        return client.guilds.cache;
    }

    const guilds = await client.guilds.fetch();
    const fullGuilds = new Map();

    for (const guild of guilds.values()) {
        fullGuilds.set(guild.id, await client.guilds.fetch(guild.id));
    }

    return fullGuilds;
}

// Rejestruje slash commands jako komendy serwerowe na każdym serwerze bota.
async function registerSlashCommands(client) {
    const commandData = commands.map((command) => command.data.toJSON());
    const guilds = await getGuildsForCommandRegistration(client);

    await clearGlobalSlashCommands(client);

    for (const guild of guilds.values()) {
        await guild.commands.set(commandData);
    }

    console.log(
        `Zarejestrowano guild commands na ${guilds.size} serwerach: ${commands.map((command) => `/${command.data.name}`).join(", ")}`
    );
}

// Sprawdza rolę moderatora bez zakładania konkretnego kształtu obiektu member.roles.
function hasReviewPermission(interaction) {
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
        content: "Nie masz uprawnień.",
        ephemeral: true
    };

    if (interaction.deferred || interaction.replied) {
        await interaction.followUp(payload);
        return;
    }

    await interaction.reply(payload);
}

async function handleSlashCommand(interaction, commandMap) {
    if (!interaction.isChatInputCommand()) {
        return false;
    }

    const command = commandMap.get(interaction.commandName);

    if (!command) {
        return true;
    }

    await command.execute(interaction);
    return true;
}

async function handleReviewButton(interaction) {
    if (!interaction.isButton()) {
        return false;
    }

    const reviewButton = parseReviewButtonCustomId(interaction.customId);

    if (!reviewButton) {
        return false;
    }

    if (!hasReviewPermission(interaction)) {
        await replyNoPermission(interaction);
        return true;
    }

    if (reviewButton.action === REVIEW_ACTIONS.REJECT) {
        await interaction.showModal(
            createRejectReviewModal(reviewButton.submissionId, interaction.message.id)
        );
        return true;
    }

    await interaction.deferUpdate();

    try {
        const result = await approveSubmission({
            client: interaction.client,
            submissionId: reviewButton.submissionId,
            moderator: interaction.user
        });

        try {
            await interaction.message.edit(result.reviewMessagePayload);
        } catch (error) {
            console.error(`Nie udało się zaktualizować wiadomości review: ${error.message}`);
            await interaction.followUp({
                content: "Zgłoszenie zaakceptowane, ale nie udało się zaktualizować wiadomości review.",
                ephemeral: true
            });
        }
    } catch (error) {
        await interaction.followUp({
            content: error.message,
            ephemeral: true
        });
    }

    return true;
}

async function editReviewMessageAfterModal(interaction, reviewMessageId, payload) {
    if (!reviewMessageId) {
        return;
    }

    const channel = interaction.channel || await interaction.client.channels.fetch(config.reviewChannelId);
    const reviewMessage = await channel.messages.fetch(reviewMessageId);

    await reviewMessage.edit(payload);
}

async function handleReviewModal(interaction) {
    if (!interaction.isModalSubmit()) {
        return false;
    }

    const reviewModal = parseRejectReviewModalCustomId(interaction.customId);

    if (!reviewModal) {
        return false;
    }

    if (!hasReviewPermission(interaction)) {
        await replyNoPermission(interaction);
        return true;
    }

    const reason = getRejectReason(interaction);

    if (!reason) {
        await interaction.reply({
            content: "Podaj powód odrzucenia.",
            ephemeral: true
        });
        return true;
    }

    await interaction.deferReply({
        ephemeral: true
    });

    try {
        const result = await rejectSubmission({
            client: interaction.client,
            submissionId: reviewModal.submissionId,
            moderator: interaction.user,
            reason
        });

        try {
            await editReviewMessageAfterModal(
                interaction,
                reviewModal.reviewMessageId,
                result.reviewMessagePayload
            );
        } catch (error) {
            console.error(`Nie udało się zaktualizować wiadomości review: ${error.message}`);
            await interaction.editReply("Zgłoszenie odrzucone, ale nie udało się zaktualizować wiadomości review.");
            return true;
        }

        await interaction.editReply("Zgłoszenie odrzucone.");
    } catch (error) {
        await interaction.editReply(error.message);
    }

    return true;
}

// Podłącza obsługę interactionCreate bez mieszania jej z messageCreate.
function registerCommandHandler(client) {
    const commandMap = new Map(
        commands.map((command) => [command.data.name, command])
    );

    client.on("interactionCreate", async (interaction) => {
        try {
            if (await handleSlashCommand(interaction, commandMap)) {
                return;
            }

            if (await handleReviewButton(interaction)) {
                return;
            }

            if (await adminPanel.handleAdminButton(interaction)) {
                return;
            }

            if (await handleInventoryInteraction(interaction)) {
                return;
            }

            if (await handleShopInteraction(interaction)) {
                return;
            }

            await handleReviewModal(interaction);
        } catch (error) {
            console.error(`Błąd obsługi interakcji: ${error.message}`);
        }
    });
}

module.exports = {
    registerCommandHandler,
    registerSlashCommands
};
