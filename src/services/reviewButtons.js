const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} = require("discord.js");

const REVIEW_BUTTON_PREFIX = "review_submission";
const REVIEW_ACTIONS = {
    APPROVE: "approve",
    REJECT: "reject"
};

function buildReviewButtonCustomId(action, submissionId) {
    return `${REVIEW_BUTTON_PREFIX}:${action}:${submissionId}`;
}

// Rozpoznaje przyciski review i wyciąga z nich akcję oraz ID zgłoszenia.
function parseReviewButtonCustomId(customId) {
    const [prefix, action, submissionId] = String(customId).split(":");

    if (
        prefix !== REVIEW_BUTTON_PREFIX
        || !Object.values(REVIEW_ACTIONS).includes(action)
        || !submissionId
    ) {
        return null;
    }

    return {
        action,
        submissionId: Number(submissionId)
    };
}

// Buduje wiersz przycisków dla moderatora Poligonu.
function createReviewActionRow(submissionId, disabled = false) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(buildReviewButtonCustomId(REVIEW_ACTIONS.APPROVE, submissionId))
            .setLabel("Akceptuj")
            .setEmoji("✅")
            .setStyle(ButtonStyle.Success)
            .setDisabled(disabled),
        new ButtonBuilder()
            .setCustomId(buildReviewButtonCustomId(REVIEW_ACTIONS.REJECT, submissionId))
            .setLabel("Odrzuć")
            .setEmoji("❌")
            .setStyle(ButtonStyle.Danger)
            .setDisabled(disabled)
    );
}

function createDisabledReviewActionRow(submissionId) {
    return createReviewActionRow(submissionId, true);
}

module.exports = {
    createDisabledReviewActionRow,
    createReviewActionRow,
    parseReviewButtonCustomId,
    REVIEW_ACTIONS
};
