function getDefaultDb() {
    return require("../database/db");
}

function createInventoryRepository(database = getDefaultDb()) {
    // userId oznacza wewnętrzne users.id z SQLite, nie Discord snowflake.
    function getOwnedItemIds(userId) {
        return new Set(database.prepare(`
            SELECT item_id
            FROM user_inventory
            WHERE user_id = ?
        `).all(userId).map((row) => row.item_id));
    }

    // userId oznacza wewnętrzne users.id z SQLite, nie Discord snowflake.
    function hasItem(userId, itemId) {
        const result = database.prepare(`
            SELECT 1 AS owned
            FROM user_inventory
            WHERE user_id = ?
              AND item_id = ?
        `).get(userId, itemId);

        return Boolean(result);
    }

    // userId oznacza wewnętrzne users.id z SQLite, nie Discord snowflake.
    function addItem({ userId, itemId, obtainedAt }) {
        return database.prepare(`
            INSERT INTO user_inventory (
                user_id,
                item_id,
                obtained_at
            )
            VALUES (?, ?, ?)
        `).run(userId, itemId, obtainedAt);
    }

    return {
        addItem,
        getOwnedItemIds,
        hasItem
    };
}

module.exports = {
    createInventoryRepository
};
