const {
    ActionRowBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle
} = require("discord.js");

const REVIEW_REJECT_MODAL_PREFIX = "review_submission_reject";
const REJECT_REASON_FIELD_ID = "reject_reason";

function buildRejectModalCustomId(submissionId, reviewMessageId) {
    return `${REVIEW_REJECT_MODAL_PREFIX}:${submissionId}:${reviewMessageId || "none"}`;
}

// Tworzy modal, w którym moderator podaje obowiązkowy powód odrzucenia.
function createRejectReviewModal(submissionId, reviewMessageId) {
    const reasonInput = new TextInputBuilder()
        .setCustomId(REJECT_REASON_FIELD_ID)
        .setLabel("Powód odrzucenia")
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setMaxLength(1000);

    return new ModalBuilder()
        .setCustomId(buildRejectModalCustomId(submissionId, reviewMessageId))
        .setTitle("Odrzuć zgłoszenie")
        .addComponents(
            new ActionRowBuilder().addComponents(reasonInput)
        );
}

// Rozpoznaje modal odrzucenia i zwraca ID zgłoszenia oraz wiadomości review.
function parseRejectReviewModalCustomId(customId) {
    const [prefix, submissionId, reviewMessageId] = String(customId).split(":");

    if (prefix !== REVIEW_REJECT_MODAL_PREFIX || !submissionId) {
        return null;
    }

    return {
        submissionId: Number(submissionId),
        reviewMessageId: reviewMessageId === "none" ? null : reviewMessageId
    };
}

function getRejectReason(interaction) {
    return interaction.fields.getTextInputValue(REJECT_REASON_FIELD_ID).trim();
}

module.exports = {
    createRejectReviewModal,
    getRejectReason,
    parseRejectReviewModalCustomId
};
