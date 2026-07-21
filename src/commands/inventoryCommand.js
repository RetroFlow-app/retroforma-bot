const { SlashCommandBuilder } = require("discord.js");

const { createInventoryPayload } = require("../services/inventoryViewService");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("ekwipunek")
        .setDescription("Pokaż swoją kolekcję i wyposaż motyw lub ramkę profilu."),

    // Komenda renderuje ekwipunek jako PNG Canvas. Wyposażanie działa przez komponenty Discord.
    async execute(interaction, options = {}) {
        const member = interaction.member || interaction.user;

        await interaction.reply({
            ...createInventoryPayload(member, options),
            ephemeral: true
        });
    }
};
