const path = require("path");

const config = require("../config/appConfig");
const db = require("../database/db");
const { formatMissionNumber } = require("../utils/missionNumber");
const {
    createErrorEmbed,
    createReviewEmbed,
    createSuccessEmbed
} = require("../utils/embedFactory");
const { evaluateBadgesForUser } = require("./badgeService");
const { getMission } = require("./missionService");
const {
    addPoints,
    addXP
} = require("./pointsService");
const { updateRankingMessage } = require("./rankingService");
const {
    approveSubmissionStatus,
    getSubmissionById,
    rejectSubmissionStatus
} = require("./reviewRepository");
const {
    createDisabledReviewActionRow,
    createReviewActionRow
} = require("./reviewButtons");
const { updateStreakAfterSubmission } = require("./streakService");
const { addSubmission } = require("./submissionService");
const {
    deletePendingSubmissionById,
    SUBMISSION_STATUS
} = require("./submissionRepository");

const DEFAULT_MISSION_XP = 100;

// Pobiera XP z mission.json albo używa domyślnej nagrody za zaakceptowane zgłoszenie.
function getMissionXP(mission) {
    const missionXp = Number(mission.xp);

    return Number.isFinite(missionXp) && missionXp >= 0 ? missionXp : DEFAULT_MISSION_XP;
}

function getMissionPoints(mission) {
    const missionPoints = Number(mission.points);

    return Number.isFinite(missionPoints) && missionPoints >= 0 ? missionPoints : 0;
}

function ensurePendingSubmission(submission) {
    if (!submission) {
        throw new Error("Nie znaleziono zgłoszenia.");
    }

    if (submission.status !== SUBMISSION_STATUS.PENDING) {
        throw new Error("To zgłoszenie zostało już rozpatrzone.");
    }
}

async function fetchChannel(client, channelId, missingConfigMessage, missingChannelMessage) {
    if (!channelId) {
        throw new Error(missingConfigMessage);
    }

    const channel = await client.channels.fetch(channelId);

    if (!channel) {
        throw new Error(missingChannelMessage);
    }

    return channel;
}

async function fetchReviewChannel(client) {
    return fetchChannel(
        client,
        config.reviewChannelId,
        "Brak reviewChannelId w config.json.",
        "Nie znaleziono kanału weryfikacji zgłoszeń."
    );
}

async function fetchSubmitChannel(client) {
    return fetchChannel(
        client,
        config.submitChannelId,
        "Brak submitChannelId w config.json.",
        "Nie znaleziono kanału zgłoszeń."
    );
}

async function fetchDiscordUser(client, discordId) {
    try {
        return await client.users.fetch(discordId);
    } catch (error) {
        return {
            id: discordId,
            username: "Nieznany użytkownik"
        };
    }
}

function createAttachmentFiles(message) {
    return message.attachments.map((attachment, index) => {
        const extension = path.extname(attachment.name || "") || ".jpg";

        return {
            attachment: attachment.url,
            name: `submission-${index + 1}${extension}`
        };
    });
}

function buildReviewMessagePayload({
    submission,
    mission,
    status = submission.status,
    moderator = null,
    reviewedAt = null,
    rejectReason = null,
    disabled = false,
    files = []
}) {
    const payload = {
        content: null,
        embeds: [
            createReviewEmbed({
                authorMention: `<@${submission.discord_id}>`,
                missionNumber: mission.number || formatMissionNumber(submission.mission_id),
                createdAt: submission.created_at,
                attachmentCount: submission.attachment_count,
                status,
                moderatorMention: moderator ? `<@${moderator.id}>` : null,
                reviewedAt,
                rejectReason
            })
        ],
        components: [
            disabled
                ? createDisabledReviewActionRow(submission.id)
                : createReviewActionRow(submission.id)
        ]
    };

    if (files.length > 0) {
        payload.files = files;
    }

    return payload;
}

async function replyToOriginalSubmission(client, submission, payload) {
    const channel = await fetchSubmitChannel(client);

    try {
        const originalMessage = await channel.messages.fetch(submission.message_id);

        await originalMessage.reply(payload);
        return;
    } catch (error) {
        await channel.send({
            content: `<@${submission.discord_id}>`,
            allowedMentions: {
                users: [submission.discord_id]
            },
            ...payload
        });
    }
}

async function notifyApprovedSubmission(client, submission, rewardResult) {
    const embeds = [
        createSuccessEmbed({
            title: "✅ Projekt został zaakceptowany.",
            description: [
                `+${rewardResult.earnedPp} PP`,
                `+${rewardResult.earnedXp} XP`
            ].join("\n")
        })
    ];

    if (rewardResult.leveledUp) {
        embeds.push(
            createSuccessEmbed({
                title: "🎉 Awans!",
                description: [
                    "Nowy poziom:",
                    "",
                    String(rewardResult.newLevel)
                ].join("\n")
            })
        );
    }

    await replyToOriginalSubmission(client, submission, {
        embeds
    });
}

async function notifyRejectedSubmission(client, submission, reason) {
    await replyToOriginalSubmission(client, submission, {
        embeds: [
            createErrorEmbed({
                title: "❌ Twój projekt został odrzucony.",
                description: [
                    "Powód:",
                    "",
                    reason
                ].join("\n")
            })
        ]
    });
}

const approveSubmissionTransaction = db.transaction(({
    submissionId,
    moderatorId,
    approvedAt,
    member,
    mission,
    missionPoints,
    missionXp
}) => {
    const approvedSubmission = approveSubmissionStatus({
        submissionId,
        moderatorId,
        approvedAt
    });

    if (!approvedSubmission) {
        throw new Error("To zgłoszenie zostało już rozpatrzone.");
    }

    addPoints(member, missionPoints);
    const userStats = addXP(approvedSubmission.discord_id, missionXp);
    const streakStats = updateStreakAfterSubmission(
        approvedSubmission.discord_id,
        mission.id,
        approvedAt
    );
    const earnedBadges = evaluateBadgesForUser(approvedSubmission.discord_id);

    return {
        submission: approvedSubmission,
        userStats,
        streakStats,
        earnedBadges,
        earnedPp: missionPoints,
        earnedXp: missionXp,
        totalPp: userStats.pp_total_earned ?? userStats.pp,
        ppBalance: userStats.pp,
        ppTotalEarned: userStats.pp_total_earned ?? userStats.pp,
        totalXp: userStats.xp,
        previousLevel: userStats.previousLevel,
        newLevel: userStats.newLevel,
        leveledUp: userStats.leveledUp
    };
});

const rejectSubmissionTransaction = db.transaction(({
    submissionId,
    moderatorId,
    rejectedAt,
    reason
}) => {
    const rejectedSubmission = rejectSubmissionStatus({
        submissionId,
        moderatorId,
        rejectedAt,
        reason
    });

    if (!rejectedSubmission) {
        throw new Error("To zgłoszenie zostało już rozpatrzone.");
    }

    return rejectedSubmission;
});

// Zapisuje zgłoszenie jako PENDING i wysyła je na kanał moderatorów.
async function submitForReview({ client, message, mission }) {
    const reviewChannel = await fetchReviewChannel(client);
    const submission = addSubmission({
        member: message.member || message.author,
        mission,
        message
    });

    try {
        await reviewChannel.send(
            buildReviewMessagePayload({
                submission,
                mission,
                status: SUBMISSION_STATUS.PENDING,
                files: createAttachmentFiles(message)
            })
        );
    } catch (error) {
        deletePendingSubmissionById(submission.id);
        throw error;
    }

    return submission;
}

// Akceptuje zgłoszenie i dopiero tutaj przyznaje PP, XP, level, serię oraz odznaki.
async function approveSubmission({ client, submissionId, moderator }) {
    const pendingSubmission = getSubmissionById(submissionId);

    ensurePendingSubmission(pendingSubmission);

    const mission = getMission(pendingSubmission.mission_id);
    const member = await fetchDiscordUser(client, pendingSubmission.discord_id);
    const approvedAt = new Date().toISOString();
    const missionPoints = getMissionPoints(mission);
    const missionXp = getMissionXP(mission);
    const result = approveSubmissionTransaction({
        submissionId,
        moderatorId: moderator.id,
        approvedAt,
        member,
        mission,
        missionPoints,
        missionXp
    });

    try {
        await updateRankingMessage(client);
    } catch (error) {
        console.error(`Nie udało się zaktualizować rankingu po akceptacji: ${error.message}`);
    }

    try {
        await notifyApprovedSubmission(client, result.submission, result);
    } catch (error) {
        console.error(`Nie udało się powiadomić użytkownika o akceptacji: ${error.message}`);
    }

    return {
        ...result,
        reviewMessagePayload: buildReviewMessagePayload({
            submission: result.submission,
            mission,
            status: SUBMISSION_STATUS.APPROVED,
            moderator,
            reviewedAt: approvedAt,
            disabled: true
        })
    };
}

// Odrzuca zgłoszenie bez przyznawania punktów.
async function rejectSubmission({
    client,
    submissionId,
    moderator,
    reason
}) {
    const pendingSubmission = getSubmissionById(submissionId);

    ensurePendingSubmission(pendingSubmission);

    const mission = getMission(pendingSubmission.mission_id);
    const rejectedAt = new Date().toISOString();
    const safeReason = reason || "Nie podano powodu.";
    const rejectedSubmission = rejectSubmissionTransaction({
        submissionId,
        moderatorId: moderator.id,
        rejectedAt,
        reason: safeReason
    });

    try {
        await notifyRejectedSubmission(client, rejectedSubmission, safeReason);
    } catch (error) {
        console.error(`Nie udało się powiadomić użytkownika o odrzuceniu: ${error.message}`);
    }

    return {
        submission: rejectedSubmission,
        reviewMessagePayload: buildReviewMessagePayload({
            submission: rejectedSubmission,
            mission,
            status: SUBMISSION_STATUS.REJECTED,
            moderator,
            reviewedAt: rejectedAt,
            rejectReason: safeReason,
            disabled: true
        })
    };
}

module.exports = {
    approveSubmission,
    buildReviewMessagePayload,
    rejectSubmission,
    submitForReview
};
