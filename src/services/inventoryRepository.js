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
    function getOwnedItems(userId) {
        return database.prepare(`
            SELECT
                si.id,
                si.code,
                si.name,
                si.description,
                si.category,
                si.price,
                si.rarity,
                si.active,
                ui.obtained_at AS obtainedAt
            FROM user_inventory ui
            INNER JOIN shop_items si
                ON si.id = ui.item_id
            WHERE ui.user_id = ?
              AND si.active = 1
            ORDER BY
                si.category ASC,
                si.price ASC,
                si.name ASC
        `).all(userId).map((item) => ({
            ...item,
            active: Boolean(item.active)
        }));
    }

    // userId oznacza wewnętrzne users.id z SQLite, nie Discord snowflake.
    function getOwnedItemByCode(userId, itemCode) {
        const item = database.prepare(`
            SELECT
                si.id,
                si.code,
                si.name,
                si.description,
                si.category,
                si.price,
                si.rarity,
                si.active,
                ui.obtained_at AS obtainedAt
            FROM user_inventory ui
            INNER JOIN shop_items si
                ON si.id = ui.item_id
            WHERE ui.user_id = ?
              AND si.code = ?
              AND si.active = 1
        `).get(userId, itemCode);

        if (!item) {
            return null;
        }

        return {
            ...item,
            active: Boolean(item.active)
        };
    }

    // userId oznacza wewnętrzne users.id z SQLite, a slot typ aktywnego elementu profilu.
    function getEquippedItems(userId) {
        return database.prepare(`
            SELECT
                ue.slot,
                ue.updated_at AS updatedAt,
                si.id,
                si.code,
                si.name,
                si.description,
                si.category,
                si.price,
                si.rarity,
                si.active
            FROM user_equipment ue
            INNER JOIN shop_items si
                ON si.id = ue.item_id
            WHERE ue.user_id = ?
              AND si.active = 1
        `).all(userId).map((item) => ({
            ...item,
            active: Boolean(item.active)
        }));
    }

    // Nadpisuje aktywny element w slocie, więc gracz ma tylko jedną aktywną ramkę i motyw.
    function equipItem({ userId, slot, itemId, updatedAt }) {
        return database.prepare(`
            INSERT INTO user_equipment (
                user_id,
                slot,
                item_id,
                updated_at
            )
            VALUES (?, ?, ?, ?)
            ON CONFLICT(user_id, slot) DO UPDATE SET
                item_id = excluded.item_id,
                updated_at = excluded.updated_at
        `).run(userId, slot, itemId, updatedAt);
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
        equipItem,
        getEquippedItems,
        getOwnedItemByCode,
        getOwnedItemIds,
        getOwnedItems,
        hasItem
    };
}

module.exports = {
    createInventoryRepository
};
