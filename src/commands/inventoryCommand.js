const { SlashCommandBuilder } = require("discord.js");

const {
    createInventoryPayloadFromView,
    createInventoryViewModel
} = require("../services/inventoryViewService");

const INVENTORY_ERROR_MESSAGE = "Nie udało się wygenerować ekwipunku. Spróbuj ponownie za chwilę.";

function getLogger(options = {}) {
    return options.logger || console;
}

function logInventoryStep(logger, message) {
    if (typeof logger.info === "function") {
        logger.info(message);
        return;
    }

    logger.log(message);
}

function logInventoryError(logger, stage, error) {
    const stack = error?.stack || String(error);

    console.error(`[INVENTORY] error at stage=${stage}`);
    console.error(stack);

    if (logger !== console && typeof logger.error === "function") {
        logger.error(`[INVENTORY] error at stage=${stage}`);
        logger.error(stack);
    }
}

async function sendInventoryErrorReply(interaction) {
    const payload = {
        content: INVENTORY_ERROR_MESSAGE,
        components: [],
        embeds: [],
        files: [],
        attachments: []
    };

    if (interaction.deferred || interaction.replied) {
        await interaction.editReply(payload);
        return;
    }

    await interaction.reply({
        content: INVENTORY_ERROR_MESSAGE,
        ephemeral: true
    });
}

module.exports = {
    INVENTORY_ERROR_MESSAGE,
    data: new SlashCommandBuilder()
        .setName("ekwipunek")
        .setDescription("Pokaż swoją kolekcję i wyposaż motyw lub ramkę profilu."),

    // Komenda renderuje ekwipunek jako PNG Canvas. Wyposażanie działa przez komponenty Discord.
    async execute(interaction, options = {}) {
        const logger = getLogger(options);
        let stage = "start";

        logInventoryStep(logger, "[INVENTORY] command started");

        try {
            stage = "defer";
            await interaction.deferReply({
                ephemeral: true
            });
            logInventoryStep(logger, "[INVENTORY] deferred");

            const member = interaction.member || interaction.user;
            const buildViewModel = options.createInventoryViewModel || createInventoryViewModel;
            const buildPayload = options.createInventoryPayloadFromView || createInventoryPayloadFromView;

            stage = "data";
            const inventoryViewModel = buildViewModel(member, options);
            logInventoryStep(logger, "[INVENTORY] data loaded");

            stage = "render";
            const payload = buildPayload(member, inventoryViewModel, options);
            logInventoryStep(logger, "[INVENTORY] canvas rendered");

            stage = "reply";
            await interaction.editReply(payload);
            logInventoryStep(logger, "[INVENTORY] reply sent");
        } catch (error) {
            logInventoryError(logger, stage, error);
            await sendInventoryErrorReply(interaction);
        }
    }
};
