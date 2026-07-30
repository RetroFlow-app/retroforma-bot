const {
    createErrorEmbed,
    createSuccessEmbed
} = require("../utils/embedFactory");
const { replyTemporarily } = require("../utils/temporaryReply");
const {
    EXTREME_SUBMIT_CHANNEL_ID,
    getActiveExtremeMission
} = require("./extremeMissionService");
const { submitForReview } = require("./reviewService");
const { hasUserSubmitted } = require("./submissionService");

const EXTREME_MIN_IMAGE_COUNT = 3;

function getAttachmentArray(attachments) {
    if (!attachments) {
        return [];
    }

    if (typeof attachments.values === "function") {
        return Array.from(attachments.values());
    }

    if (Array.isArray(attachments)) {
        return attachments;
    }

    return [];
}

function isImageAttachment(attachment) {
    const contentType = String(attachment.contentType || attachment.content_type || "").toLowerCase();
    const fileName = String(attachment.name || attachment.url || "").toLowerCase();

    return contentType.startsWith("image/")
        || /\.(png|jpe?g|webp|gif)(\?|$)/i.test(fileName);
}

function countImageAttachments(message) {
    return getAttachmentArray(message.attachments).filter(isImageAttachment).length;
}

async function handleExtremeSubmissionMessage(message, dependencies = {}) {
    if (message.channelId !== EXTREME_SUBMIT_CHANNEL_ID) {
        return false;
    }

    const reply = dependencies.replyTemporarily || replyTemporarily;
    const acceptingMission = (dependencies.getActiveExtremeMission || getActiveExtremeMission)(dependencies);

    if (!acceptingMission) {
        await reply(
            message,
            {
                embeds: [
                    createErrorEmbed({
                        title: "❌ Misja EXTREME zakończona",
                        description: "Aktualnie nie ma aktywnej Misji EXTREME."
                    })
                ]
            }
        );
        return true;
    }

    if (countImageAttachments(message) < EXTREME_MIN_IMAGE_COUNT) {
        await reply(
            message,
            {
                embeds: [
                    createErrorEmbed({
                        title: "❌ Za mało zdjęć",
                        description: "Misja EXTREME wymaga minimum 3 zdjęć projektu umieszczonych w jednej wiadomości."
                    })
                ]
            }
        );
        return true;
    }

    if ((dependencies.hasUserSubmitted || hasUserSubmitted)(message.author.id, acceptingMission.id)) {
        await reply(
            message,
            {
                embeds: [
                    createErrorEmbed({
                        title: "⚠️ Projekt już oddany",
                        description: "Oddałeś już projekt do tej Misji EXTREME."
                    })
                ]
            }
        );
        return true;
    }

    try {
        await (dependencies.submitForReview || submitForReview)({
            client: message.client,
            message,
            mission: acceptingMission
        });
    } catch (error) {
        console.error(`Nie udało się przekazać zgłoszenia EXTREME do weryfikacji: ${error.message}`);
        await reply(
            message,
            {
                embeds: [
                    createErrorEmbed({
                        title: "❌ Nie zapisano zgłoszenia",
                        description: "Nie udało się przekazać projektu EXTREME do weryfikacji. Spróbuj ponownie za chwilę."
                    })
                ]
            }
        );
        return true;
    }

    await message.react("✅");
    await reply(
        message,
        {
            embeds: [
                createSuccessEmbed({
                    title: "✅ Projekt EXTREME przyjęty do weryfikacji",
                    description: "Zgłoszenie trafiło do moderatorów Poligonu."
                })
            ]
        }
    );

    return true;
}

module.exports = {
    EXTREME_MIN_IMAGE_COUNT,
    countImageAttachments,
    handleExtremeSubmissionMessage
};
