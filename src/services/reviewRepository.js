const db = require("../database/db");
const { SUBMISSION_STATUS } = require("./submissionRepository");

// Pobiera pojedyncze zgłoszenie po technicznym ID z bazy.
function getSubmissionById(submissionId) {
    return db.prepare(`
        SELECT *
        FROM submissions
        WHERE id = ?
    `).get(submissionId);
}

// Oznacza zgłoszenie jako zaakceptowane, ale tylko jeśli nadal czeka na decyzję.
function approveSubmissionStatus({ submissionId, moderatorId, approvedAt }) {
    const result = db.prepare(`
        UPDATE submissions
        SET status = ?,
            approved_by = ?,
            approved_at = ?,
            rejected_by = NULL,
            rejected_at = NULL,
            reject_reason = NULL
        WHERE id = ?
          AND status = ?
    `).run(
        SUBMISSION_STATUS.APPROVED,
        moderatorId,
        approvedAt,
        submissionId,
        SUBMISSION_STATUS.PENDING
    );

    return result.changes > 0 ? getSubmissionById(submissionId) : null;
}

// Oznacza zgłoszenie jako odrzucone, ale tylko jeśli nadal czeka na decyzję.
function rejectSubmissionStatus({
    submissionId,
    moderatorId,
    rejectedAt,
    reason
}) {
    const result = db.prepare(`
        UPDATE submissions
        SET status = ?,
            rejected_by = ?,
            rejected_at = ?,
            reject_reason = ?,
            approved_by = NULL,
            approved_at = NULL
        WHERE id = ?
          AND status = ?
    `).run(
        SUBMISSION_STATUS.REJECTED,
        moderatorId,
        rejectedAt,
        reason,
        submissionId,
        SUBMISSION_STATUS.PENDING
    );

    return result.changes > 0 ? getSubmissionById(submissionId) : null;
}

module.exports = {
    approveSubmissionStatus,
    getSubmissionById,
    rejectSubmissionStatus
};
