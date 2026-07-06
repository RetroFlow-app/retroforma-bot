const db = require("../database/db");

// Pobiera ostatnią wcześniejszą misję, którą użytkownik faktycznie oddał.
function getPreviousSubmittedMissionId(discordId, missionId) {
    const result = db.prepare(`
        SELECT MAX(mission_id) AS mission_id
        FROM submissions
        WHERE discord_id = ?
          AND mission_id < ?
          AND status = 'APPROVED'
    `).get(discordId, missionId);

    return result.mission_id ?? null;
}

// Pobiera aktualne dane serii użytkownika z tabeli users.
function getUserStreak(discordId) {
    return db.prepare(`
        SELECT current_streak, best_streak, last_submission_date
        FROM users
        WHERE discord_id = ?
    `).get(discordId);
}

// Aktualizuje serię po poprawnym zgłoszeniu projektu do misji.
function updateStreakAfterSubmission(discordId, missionId, submittedAt = new Date().toISOString()) {
    const userStreak = getUserStreak(discordId);

    if (!userStreak) {
        throw new Error("Nie znaleziono użytkownika podczas aktualizacji serii.");
    }

    const previousMissionId = getPreviousSubmittedMissionId(discordId, missionId);
    const currentStreak = Number(userStreak.current_streak) || 0;
    const bestStreak = Number(userStreak.best_streak) || 0;
    const isConsecutiveMission = previousMissionId !== null
        && Number(previousMissionId) === Number(missionId) - 1;
    const nextCurrentStreak = isConsecutiveMission ? currentStreak + 1 : 1;
    const nextBestStreak = Math.max(bestStreak, nextCurrentStreak);

    db.prepare(`
        UPDATE users
        SET current_streak = ?,
            best_streak = ?,
            last_submission_date = ?
        WHERE discord_id = ?
    `).run(nextCurrentStreak, nextBestStreak, submittedAt, discordId);

    return {
        currentStreak: nextCurrentStreak,
        bestStreak: nextBestStreak,
        lastSubmissionDate: submittedAt
    };
}

// Zeruje serię użytkownikom, którzy nie oddali projektu do zamykanej misji.
function resetStreaksForMissedMission(missionId) {
    const result = db.prepare(`
        UPDATE users
        SET current_streak = 0
        WHERE current_streak > 0
          AND discord_id NOT IN (
              SELECT discord_id
              FROM submissions
              WHERE mission_id = ?
                AND status = 'APPROVED'
          )
    `).run(missionId);

    return result.changes;
}

module.exports = {
    getUserStreak,
    resetStreaksForMissedMission,
    updateStreakAfterSubmission
};
