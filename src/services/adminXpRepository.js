function getDefaultDb() {
    return require("../database/db");
}

function createAdminXpRepository(database = getDefaultDb()) {
    // internalUserId oznacza wewnętrzne users.id z SQLite, nie Discord snowflake.
    function getUserByInternalId(internalUserId) {
        return database.prepare(`
            SELECT *
            FROM users
            WHERE id = ?
        `).get(internalUserId);
    }

    // Aktualizuje wyłącznie XP i poziom użytkownika.
    function updateXpAndLevel({ internalUserId, xp, level }) {
        return database.prepare(`
            UPDATE users
            SET xp = ?,
                level = ?
            WHERE id = ?
        `).run(xp, level, internalUserId);
    }

    function saveTransaction(transaction) {
        return database.prepare(`
            INSERT INTO admin_xp_transactions (
                target_user_id,
                target_discord_id,
                admin_discord_id,
                operation,
                amount,
                xp_before,
                xp_after,
                level_before,
                level_after,
                reason,
                created_at
            )
            VALUES (
                @targetUserId,
                @targetDiscordId,
                @adminDiscordId,
                @operation,
                @amount,
                @xpBefore,
                @xpAfter,
                @levelBefore,
                @levelAfter,
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
                FROM admin_xp_transactions
                WHERE target_discord_id = ?
                ORDER BY id DESC
                LIMIT ?
            `).all(targetDiscordId, safeLimit);
        }

        return database.prepare(`
            SELECT *
            FROM admin_xp_transactions
            ORDER BY id DESC
            LIMIT ?
        `).all(safeLimit);
    }

    return {
        getUserByInternalId,
        listTransactions,
        saveTransaction,
        updateXpAndLevel
    };
}

module.exports = {
    createAdminXpRepository
};
