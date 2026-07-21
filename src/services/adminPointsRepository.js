function getDefaultDb() {
    return require("../database/db");
}

function createAdminPointsRepository(database = getDefaultDb()) {
    // internalUserId oznacza wewnętrzne users.id z SQLite, nie Discord snowflake.
    function getUserByInternalId(internalUserId) {
        return database.prepare(`
            SELECT *
            FROM users
            WHERE id = ?
        `).get(internalUserId);
    }

    // internalUserId oznacza wewnętrzne users.id z SQLite, nie Discord snowflake.
    function addBalance({ internalUserId, amount }) {
        return database.prepare(`
            UPDATE users
            SET pp = pp + ?
            WHERE id = ?
        `).run(amount, internalUserId);
    }

    // Odejmowanie ma warunek pp >= amount, więc saldo nie może spaść poniżej zera.
    function subtractBalance({ internalUserId, amount }) {
        return database.prepare(`
            UPDATE users
            SET pp = pp - ?
            WHERE id = ?
              AND pp >= ?
        `).run(amount, internalUserId, amount);
    }

    // internalUserId oznacza wewnętrzne users.id z SQLite, nie Discord snowflake.
    function setBalance({ internalUserId, amount }) {
        return database.prepare(`
            UPDATE users
            SET pp = ?
            WHERE id = ?
        `).run(amount, internalUserId);
    }

    function saveTransaction(transaction) {
        return database.prepare(`
            INSERT INTO admin_point_transactions (
                target_user_id,
                target_discord_id,
                admin_discord_id,
                operation,
                amount,
                balance_before,
                balance_after,
                reason,
                created_at
            )
            VALUES (
                @targetUserId,
                @targetDiscordId,
                @adminDiscordId,
                @operation,
                @amount,
                @balanceBefore,
                @balanceAfter,
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
                FROM admin_point_transactions
                WHERE target_discord_id = ?
                ORDER BY id DESC
                LIMIT ?
            `).all(targetDiscordId, safeLimit);
        }

        return database.prepare(`
            SELECT *
            FROM admin_point_transactions
            ORDER BY id DESC
            LIMIT ?
        `).all(safeLimit);
    }

    return {
        addBalance,
        getUserByInternalId,
        listTransactions,
        saveTransaction,
        setBalance,
        subtractBalance
    };
}

module.exports = {
    createAdminPointsRepository
};
