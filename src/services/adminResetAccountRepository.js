function getDefaultDb() {
    return require("../database/db");
}

function createAdminResetAccountRepository(database = getDefaultDb()) {
    // internalUserId oznacza wewnetrzne users.id z SQLite, nie Discord snowflake.
    function getUserByInternalId(internalUserId) {
        return database.prepare(`
            SELECT *
            FROM users
            WHERE id = ?
        `).get(internalUserId);
    }

    // Resetuje tylko walute PP i lacznie zdobyte PP.
    function resetPoints(internalUserId) {
        return database.prepare(`
            UPDATE users
            SET pp = 0,
                pp_total_earned = 0
            WHERE id = ?
        `).run(internalUserId);
    }

    // Resetuje statystyki profilu do stanu nowego gracza.
    function resetProfileStats(internalUserId) {
        return database.prepare(`
            UPDATE users
            SET xp = 0,
                level = 1,
                current_streak = 0,
                best_streak = 0,
                last_submission_date = NULL,
                missions_completed = 0
            WHERE id = ?
        `).run(internalUserId);
    }

    function deleteInventory(internalUserId) {
        return database.prepare(`
            DELETE FROM user_inventory
            WHERE user_id = ?
        `).run(internalUserId);
    }

    function deleteEquipment(internalUserId) {
        return database.prepare(`
            DELETE FROM user_equipment
            WHERE user_id = ?
        `).run(internalUserId);
    }

    function deleteUserBadges(discordId) {
        return database.prepare(`
            DELETE FROM users_badges
            WHERE discord_id = ?
        `).run(discordId);
    }

    function deleteSubmissions(discordId) {
        return database.prepare(`
            DELETE FROM submissions
            WHERE discord_id = ?
        `).run(discordId);
    }

    function deleteArsenalItems(discordId) {
        return database.prepare(`
            DELETE FROM users_arsenal_items
            WHERE discord_id = ?
        `).run(discordId);
    }

    function deleteArsenalLoadout(discordId) {
        return database.prepare(`
            DELETE FROM users_arsenal_loadout
            WHERE discord_id = ?
        `).run(discordId);
    }

    function saveTransaction(transaction) {
        return database.prepare(`
            INSERT INTO admin_reset_transactions (
                target_user_id,
                target_discord_id,
                admin_discord_id,
                scope,
                reason,
                created_at
            )
            VALUES (
                @targetUserId,
                @targetDiscordId,
                @adminDiscordId,
                @scope,
                @reason,
                @createdAt
            )
        `).run(transaction);
    }

    function listTransactions({ targetDiscordId = null, limit = 10 } = {}) {
        const safeLimit = Math.min(25, Math.max(1, Number(limit) || 10));

        if (targetDiscordId) {
            return database.prepare(`
                SELECT *
                FROM admin_reset_transactions
                WHERE target_discord_id = ?
                ORDER BY id DESC
                LIMIT ?
            `).all(targetDiscordId, safeLimit);
        }

        return database.prepare(`
            SELECT *
            FROM admin_reset_transactions
            ORDER BY id DESC
            LIMIT ?
        `).all(safeLimit);
    }

    return {
        deleteArsenalItems,
        deleteArsenalLoadout,
        deleteEquipment,
        deleteInventory,
        deleteSubmissions,
        deleteUserBadges,
        getUserByInternalId,
        listTransactions,
        resetPoints,
        resetProfileStats,
        saveTransaction
    };
}

module.exports = {
    createAdminResetAccountRepository
};
