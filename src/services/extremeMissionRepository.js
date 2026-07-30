function getDefaultDb() {
    return require("../database/db");
}

function createExtremeMissionRepository(database = getDefaultDb()) {
    function getState() {
        const state = database.prepare(`
            SELECT *
            FROM extreme_mission_state
            WHERE id = 1
        `).get();

        if (state) {
            return state;
        }

        const now = new Date().toISOString();

        database.prepare(`
            INSERT INTO extreme_mission_state (
                id,
                current_sequence,
                current_number,
                status,
                updated_at
            )
            VALUES (1, 0, 0, 'IDLE', ?)
        `).run(now);

        return database.prepare(`
            SELECT *
            FROM extreme_mission_state
            WHERE id = 1
        `).get();
    }

    function saveState(changes) {
        const currentState = getState();
        const nextState = {
            current_sequence: currentState.current_sequence,
            current_number: currentState.current_number,
            status: currentState.status,
            message_id: currentState.message_id,
            published_at: currentState.published_at,
            closed_at: currentState.closed_at,
            last_publish_date: currentState.last_publish_date,
            ...changes,
            updated_at: changes.updated_at || new Date().toISOString()
        };

        database.prepare(`
            UPDATE extreme_mission_state
            SET current_sequence = @current_sequence,
                current_number = @current_number,
                status = @status,
                message_id = @message_id,
                published_at = @published_at,
                closed_at = @closed_at,
                last_publish_date = @last_publish_date,
                updated_at = @updated_at
            WHERE id = 1
        `).run(nextState);

        return getState();
    }

    return {
        getState,
        saveState
    };
}

module.exports = {
    createExtremeMissionRepository
};
