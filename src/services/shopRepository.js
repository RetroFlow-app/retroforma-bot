function getDefaultDb() {
    return require("../database/db");
}

const { normalizeRarity } = require("../utils/rarity");

function mapShopItem(row) {
    if (!row) {
        return null;
    }

    const parsedPrice = Number(row.price);

    return {
        id: row.id,
        code: row.code,
        name: row.name,
        description: row.description,
        category: row.category,
        price: parsedPrice,
        rawPrice: row.price,
        rarity: normalizeRarity(row.rarity),
        active: row.active === 1,
        createdAt: row.created_at
    };
}

function createShopRepository(database = getDefaultDb()) {
    function getActiveItems(category = "all") {
        const params = [];
        const conditions = ["active = 1"];

        if (category && category !== "all") {
            conditions.push("category = ?");
            params.push(category);
        }

        return database.prepare(`
            SELECT id,
                   code,
                   name,
                   description,
                   category,
                   price,
                   rarity,
                   active,
                   created_at
            FROM shop_items
            WHERE ${conditions.join(" AND ")}
            ORDER BY category ASC,
                     price ASC,
                     name ASC
        `).all(...params).map(mapShopItem);
    }

    function getItemByCode(code) {
        return mapShopItem(database.prepare(`
            SELECT id,
                   code,
                   name,
                   description,
                   category,
                   price,
                   rarity,
                   active,
                   created_at
            FROM shop_items
            WHERE code = ?
        `).get(code));
    }

    return {
        getActiveItems,
        getItemByCode
    };
}

module.exports = {
    createShopRepository
};
