const { AttachmentBuilder, SlashCommandBuilder } = require("discord.js");

const { getProfileData } = require("../services/profileService");
const { createProfileCard } = require("../services/profileCardService");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("profil")
        .setDescription("Pokaż swój profil kadeta Poligonu CAD."),

    // Generuje profil użytkownika jako obraz PNG.
    async execute(interaction) {
        await interaction.deferReply();

        try {
            const member = interaction.member || interaction.user;
            const profile = getProfileData(member);

            if (typeof interaction.user.displayAvatarURL === "function") {
                profile.avatarUrl = interaction.user.displayAvatarURL({
                    extension: "png",
                    size: 256
                });
            }

            const profileCard = await createProfileCard(profile);
            const attachment = new AttachmentBuilder(profileCard, {
                name: "profil-kadeta.png"
            });

            await interaction.editReply({
                files: [attachment]
            });
        } catch (error) {
            if (error.code === "CANVAS_NOT_INSTALLED") {
                await interaction.editReply(
                    "Moduł profilu wymaga biblioteki canvas. Wykonaj: `npm install canvas`"
                );
                return;
            }

            console.error(`Nie udało się wygenerować profilu: ${error.message}`);
            await interaction.editReply("Nie udało się wygenerować profilu kadeta.");
        }
    }
};
