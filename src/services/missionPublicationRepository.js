const db = require("../database/db");

// Pobiera trwały zapis publikacji misji z SQLite.
function getMissionPublication(missionId) {
    return db.prepare(`
        SELECT mission_id,
               mission_number,
               message_id,
               publish_at,
               close_at,
               published_at,
               closed_at,
               created_at,
               updated_at
        FROM mission_publications
        WHERE mission_id = ?
    `).get(missionId) || null;
}

// Zapisuje messageId misji poza mission.json, żeby deploy nie kasował stanu publikacji.
function saveMissionPublication({
    missionId,
    missionNumber,
    messageId,
    publishAt = null,
    closeAt = null,
    publishedAt = new Date().toISOString()
}) {
    const now = new Date().toISOString();

    db.prepare(`
        INSERT INTO mission_publications (
            mission_id,
            mission_number,
            message_id,
            publish_at,
            close_at,
            published_at,
            created_at,
            updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(mission_id) DO UPDATE SET
            mission_number = excluded.mission_number,
            message_id = excluded.message_id,
            publish_at = excluded.publish_at,
            close_at = excluded.close_at,
            published_at = COALESCE(mission_publications.published_at, excluded.published_at),
            updated_at = excluded.updated_at
    `).run(
        missionId,
        missionNumber,
        messageId,
        publishAt,
        closeAt,
        publishedAt,
        now,
        now
    );

    return getMissionPublication(missionId);
}

// Oznacza zamknięcie misji w trwałym zapisie publikacji, jeśli taki zapis istnieje.
function markMissionPublicationClosed(missionId, closedAt = new Date().toISOString()) {
    db.prepare(`
        UPDATE mission_publications
        SET closed_at = ?,
            updated_at = ?
        WHERE mission_id = ?
    `).run(closedAt, closedAt, missionId);

    return getMissionPublication(missionId);
}

module.exports = {
    getMissionPublication,
    markMissionPublicationClosed,
    saveMissionPublication
};
