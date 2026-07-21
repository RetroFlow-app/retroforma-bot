const db = require("../database/db");
const { formatMissionNumber } = require("../utils/missionNumber");
const { evaluateBadgesForUser } = require("./badgeService");
const {
    findOpenMission,
    getMission
} = require("./missionService");
const { getLevelFromXP } = require("./pointsService");
const { SUBMISSION_STATUS } = require("./submissionRepository");

const DEFAULT_MISSION_XP = 100;

function getSafeAmount(value) {
    return Math.max(0, Number(value) || 0);
}

function getMissionRewards(missionId) {
    try {
        const mission = getMission(missionId);

        return {
            pp: getSafeAmount(mission.points),
            xp: Number.isFinite(Number(mission.xp)) ? getSafeAmount(mission.xp) : DEFAULT_MISSION_XP
        };
    } catch (error) {
        // Jeśli plik misji zniknął podczas testów, nie blokujemy resetu danych.
        return {
            pp: 0,
            xp: 0
        };
    }
}

function getUserStats(discordId) {
    return db.prepare(`
        SELECT *
        FROM users
        WHERE discord_id = ?
    `).get(discordId);
}

function getApprovedSubmissionsForUser(discordId) {
    return db.prepare(`
        SELECT mission_id, created_at
        FROM submissions
        WHERE discord_id = ?
          AND status = ?
        ORDER BY mission_id ASC
    `).all(discordId, SUBMISSION_STATUS.APPROVED);
}

function calculateStreaks(approvedSubmissions) {
    let previousMissionId = null;
    let currentRun = 0;
    let bestRun = 0;

    for (const submission of approvedSubmissions) {
        const missionId = Number(submission.mission_id);

        currentRun = previousMissionId !== null && missionId === previousMissionId + 1
            ? currentRun + 1
            : 1;
        bestRun = Math.max(bestRun, currentRun);
        previousMissionId = missionId;
    }

    return {
        currentStreak: approvedSubmissions.length > 0 ? currentRun : 0,
        bestStreak: bestRun
    };
}

// Odbudowuje statystyki użytkownika wyłącznie z zaakceptowanych zgłoszeń.
function rebuildUserStats(discordId) {
    const user = getUserStats(discordId);

    if (!user) {
        return null;
    }

    const approvedSubmissions = getApprovedSubmissionsForUser(discordId);
    const totals = approvedSubmissions.reduce((result, submission) => {
        const rewards = getMissionRewards(submission.mission_id);

        return {
            pp: result.pp + rewards.pp,
            xp: result.xp + rewards.xp
        };
    }, {
        pp: 0,
        xp: 0
    });
    const streaks = calculateStreaks(approvedSubmissions);
    const lastSubmission = approvedSubmissions[approvedSubmissions.length - 1] || null;

    db.prepare(`
        UPDATE users
        SET pp = ?,
            pp_total_earned = ?,
            xp = ?,
            level = ?,
            missions_completed = ?,
            current_streak = ?,
            best_streak = ?,
            last_submission_date = ?
        WHERE discord_id = ?
    `).run(
        totals.pp,
        totals.pp,
        totals.xp,
        getLevelFromXP(totals.xp),
        approvedSubmissions.length,
        streaks.currentStreak,
        streaks.bestStreak,
        lastSubmission ? lastSubmission.created_at : null,
        discordId
    );

    return getUserStats(discordId);
}

function rebuildSelectedUsers(discordIds) {
    const uniqueDiscordIds = [...new Set(discordIds.filter(Boolean))];

    return uniqueDiscordIds
        .map((discordId) => rebuildUserStats(discordId))
        .filter(Boolean);
}

// Odznaki są pochodną aktualnych statystyk, więc po testowym resecie budujemy je od nowa.
function rebuildAllUserBadges() {
    db.prepare("DELETE FROM users_badges").run();

    const users = db.prepare(`
        SELECT discord_id
        FROM users
    `).all();

    for (const user of users) {
        evaluateBadgesForUser(user.discord_id);
    }

    return users.length;
}

function getCurrentMissionOrThrow() {
    const mission = findOpenMission();

    if (!mission) {
        throw new Error("Brak aktualnie otwartej misji.");
    }

    return mission;
}

function getMissionSubmissions(missionId, discordId = null) {
    if (discordId) {
        return db.prepare(`
            SELECT *
            FROM submissions
            WHERE mission_id = ?
              AND discord_id = ?
        `).all(missionId, discordId);
    }

    return db.prepare(`
        SELECT *
        FROM submissions
        WHERE mission_id = ?
    `).all(missionId);
}

const resetCurrentMissionTransaction = db.transaction(() => {
    const mission = getCurrentMissionOrThrow();
    const submissions = getMissionSubmissions(mission.id);
    const affectedUsers = submissions.map((submission) => submission.discord_id);
    const approvedRemoved = submissions
        .filter((submission) => submission.status === SUBMISSION_STATUS.APPROVED)
        .length;
    const deleteResult = db.prepare(`
        DELETE FROM submissions
        WHERE mission_id = ?
    `).run(mission.id);

    rebuildSelectedUsers(affectedUsers);
    rebuildAllUserBadges();

    return {
        mission,
        deletedSubmissions: deleteResult.changes,
        approvedRemoved,
        affectedUsers: new Set(affectedUsers).size
    };
});

const resetCurrentMissionForUserTransaction = db.transaction((discordId) => {
    const mission = getCurrentMissionOrThrow();
    const beforeStats = getUserStats(discordId);
    const submissions = getMissionSubmissions(mission.id, discordId);
    const approvedRemoved = submissions
        .filter((submission) => submission.status === SUBMISSION_STATUS.APPROVED)
        .length;
    const deleteResult = db.prepare(`
        DELETE FROM submissions
        WHERE mission_id = ?
          AND discord_id = ?
    `).run(mission.id, discordId);

    const afterStats = rebuildUserStats(discordId) || beforeStats || {
        pp: 0,
        xp: 0
    };

    rebuildAllUserBadges();

    return {
        mission,
        deletedSubmissions: deleteResult.changes,
        approvedRemoved,
        ppRemoved: Math.max(0, Number(beforeStats?.pp || 0) - Number(afterStats?.pp || 0)),
        xpRemoved: Math.max(0, Number(beforeStats?.xp || 0) - Number(afterStats?.xp || 0)),
        beforeStats,
        afterStats
    };
});

const resetPoligonTransaction = db.transaction(() => {
    const before = {
        submissions: db.prepare("SELECT COUNT(*) AS count FROM submissions").get().count,
        users: db.prepare("SELECT COUNT(*) AS count FROM users").get().count,
        userBadges: db.prepare("SELECT COUNT(*) AS count FROM users_badges").get().count
    };

    db.prepare("DELETE FROM submissions").run();
    db.prepare("DELETE FROM users_badges").run();
    db.prepare("DELETE FROM users").run();

    return before;
});

function resetCurrentMission() {
    const result = resetCurrentMissionTransaction();

    return {
        ...result,
        missionNumber: formatMissionNumber(result.mission.id)
    };
}

function resetCurrentMissionForUser(discordId) {
    const result = resetCurrentMissionForUserTransaction(discordId);

    return {
        ...result,
        missionNumber: formatMissionNumber(result.mission.id)
    };
}

function resetPoligon() {
    return resetPoligonTransaction();
}

module.exports = {
    resetCurrentMission,
    resetCurrentMissionForUser,
    resetPoligon
};
