const config = require("../config/appConfig");
const { findOpenMission } = require("../services/missionService");
const { submitForReview } = require("../services/reviewService");
const { hasUserSubmitted } = require("../services/submissionService");
const {
    createErrorEmbed,
    createSuccessEmbed
} = require("../utils/embedFactory");
const { replyTemporarily } = require("../utils/temporaryReply");

// Obsługuje wiadomości z kanału zgłoszeń dla aktualnej misji.
async function handleMessageCreate(message) {
    if (message.author.bot) {
        return;
    }

    if (message.channelId !== config.submitChannelId) {
        return;
    }

    const acceptingMission = findOpenMission();

    if (!acceptingMission) {
        await replyTemporarily(
            message,
            {
                embeds: [
                    createErrorEmbed({
                        title: "❌ Misja zakończona",
                        description: "Ta misja została już zakończona. Poczekaj na kolejną misję."
                    })
                ]
            }
        );
        return;
    }

    if (message.attachments.size === 0) {
        await replyTemporarily(
            message,
            {
                embeds: [
                    createErrorEmbed({
                        title: "❌ Brak zdjęcia",
                        description: "Aby oddać projekt musisz dodać przynajmniej jedno zdjęcie."
                    })
                ]
            }
        );
        return;
    }

    if (hasUserSubmitted(message.author.id, acceptingMission.id)) {
        await replyTemporarily(
            message,
            {
                embeds: [
                    createErrorEmbed({
                        title: "⚠️ Projekt już oddany",
                        description: "Oddałeś już projekt do tej misji."
                    })
                ]
            }
        );
        return;
    }

    try {
        await submitForReview({
            client: message.client,
            message,
            mission: acceptingMission
        });
    } catch (error) {
        console.error(`Nie udało się przekazać zgłoszenia do weryfikacji: ${error.message}`);
        await replyTemporarily(
            message,
            {
                embeds: [
                    createErrorEmbed({
                        title: "❌ Nie zapisano zgłoszenia",
                        description: "Nie udało się przekazać projektu do weryfikacji. Spróbuj ponownie za chwilę."
                    })
                ]
            }
        );
        return;
    }

    await message.react("✅");
    await replyTemporarily(
        message,
        {
            embeds: [
                createSuccessEmbed({
                    title: "✅ Projekt przyjęty do weryfikacji",
                    description: "Zgłoszenie trafiło do moderatorów Poligonu."
                })
            ]
        }
    );
}

// Podłącza event messageCreate do klienta Discord.
function registerMessageCreateEvent(client) {
    client.on("messageCreate", async (message) => {
        try {
            await handleMessageCreate(message);
        } catch (error) {
            console.error(`Błąd obsługi zgłoszenia: ${error.message}`);
        }
    });
}

module.exports = {
    registerMessageCreateEvent,
    handleMessageCreate
};
