const db = require("../database/db");

const SUBMISSION_STATUS = {
    PENDING: "PENDING",
    APPROVED: "APPROVED",
    REJECTED: "REJECTED"
};

// Sprawdza, czy użytkownik ma już zgłoszenie do danej misji.
function hasSubmitted(missionId, discordId) {
    const submission = db.prepare(`
        SELECT id
        FROM submissions
        WHERE mission_id = ?
          AND discord_id = ?
    `).get(missionId, discordId);

    return Boolean(submission);
}

// Zapisuje zgłoszenie użytkownika do trwałej bazy SQLite.
function saveSubmission({
    missionId,
    discordId,
    messageId,
    attachmentCount,
    status = SUBMISSION_STATUS.PENDING
}) {
    const createdAt = new Date().toISOString();

    db.prepare(`
        INSERT INTO submissions (
            mission_id,
            discord_id,
            message_id,
            attachment_count,
            status,
            created_at
        )
        VALUES (?, ?, ?, ?, ?, ?)
    `).run(
        missionId,
        discordId,
        messageId,
        attachmentCount,
        status,
        createdAt
    );

    return db.prepare(`
        SELECT *
        FROM submissions
        WHERE mission_id = ?
          AND discord_id = ?
    `).get(missionId, discordId);
}

// Usuwa świeże zgłoszenie oczekujące, jeśli nie udało się przekazać go do review.
function deletePendingSubmissionById(submissionId) {
    db.prepare(`
        DELETE FROM submissions
        WHERE id = ?
          AND status = ?
    `).run(submissionId, SUBMISSION_STATUS.PENDING);
}

module.exports = {
    deletePendingSubmissionById,
    hasSubmitted,
    saveSubmission,
    SUBMISSION_STATUS
};
