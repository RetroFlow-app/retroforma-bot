const { SlashCommandBuilder } = require("discord.js");

const { createShopPayload } = require("../services/shopViewService");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("sklep")
        .setDescription("Otwórz sklep RetroForma i kup przedmioty za PP."),

    // Pokazuje sklep jako prywatny panel użytkownika.
    async execute(interaction) {
        await interaction.deferReply({
            ephemeral: true
        });

        await interaction.editReply(
            createShopPayload(interaction.member || interaction.user)
        );
    }
};
