const db = require("../database/db");

const ARSENAL_CURRENCY = "PP";

const arsenalCategories = [
    {
        id: "frames",
        name: "Ramki",
        description: "Ramki profilu i elementów wizualnych kadeta.",
        assetFolder: "frames",
        displayOrder: 1
    },
    {
        id: "backgrounds",
        name: "Tła",
        description: "Tła kart i profili Poligonu.",
        assetFolder: "backgrounds",
        displayOrder: 2
    },
    {
        id: "badges",
        name: "Odznaki",
        description: "Wizualne odznaki i warianty ikon osiągnięć.",
        assetFolder: "badges",
        displayOrder: 3
    },
    {
        id: "effects",
        name: "Efekty",
        description: "Efekty wizualne przygotowane pod przyszłe karty i animacje.",
        assetFolder: "effects",
        displayOrder: 4
    },
    {
        id: "premium",
        name: "Premium",
        description: "Specjalne elementy Arsenału dostępne w przyszłych etapach.",
        assetFolder: "premium",
        displayOrder: 5
    }
];

// Arsenał nie jest sklepem. PP jest tu tylko walutą katalogową pod przyszłe etapy.
function getArsenalCurrency() {
    return ARSENAL_CURRENCY;
}

function getCategoryIds() {
    return arsenalCategories.map((category) => category.id);
}

function normalizeCategoryId(categoryId) {
    const normalizedCategoryId = String(categoryId || "").trim();

    if (!getCategoryIds().includes(normalizedCategoryId)) {
        throw new Error(`Nieznana kategoria Arsenału: ${categoryId}`);
    }

    return normalizedCategoryId;
}

// Upewnia się, że bazowe kategorie Arsenału istnieją w SQLite.
function seedArsenalCategories() {
    const statement = db.prepare(`
        INSERT INTO arsenal_categories (
            id,
            name,
            description,
            asset_folder,
            display_order
        )
        VALUES (
            @id,
            @name,
            @description,
            @assetFolder,
            @displayOrder
        )
        ON CONFLICT(id) DO UPDATE SET
            name = excluded.name,
            description = excluded.description,
            asset_folder = excluded.asset_folder,
            display_order = excluded.display_order
    `);

    for (const category of arsenalCategories) {
        statement.run(category);
    }
}

function getArsenalCategories() {
    return db.prepare(`
        SELECT
            id,
            name,
            description,
            asset_folder AS assetFolder,
            display_order AS displayOrder
        FROM arsenal_categories
        ORDER BY display_order ASC
    `).all();
}

function getArsenalItem(itemId) {
    return db.prepare(`
        SELECT
            ai.id,
            ai.category_id AS categoryId,
            ac.name AS categoryName,
            ai.name,
            ai.description,
            ai.price_pp AS pricePp,
            ai.currency,
            ai.asset_key AS assetKey,
            ai.is_premium AS isPremium,
            ai.is_active AS isActive,
            ai.created_at AS createdAt,
            ai.updated_at AS updatedAt
        FROM arsenal_items ai
        LEFT JOIN arsenal_categories ac
            ON ac.id = ai.category_id
        WHERE ai.id = ?
    `).get(itemId);
}

// Pobiera katalog Arsenału, opcjonalnie ograniczony do jednej kategorii.
function getArsenalItems(options = {}) {
    const {
        categoryId = null,
        includeInactive = false
    } = options;
    const conditions = [];
    const params = [];

    if (categoryId) {
        conditions.push("ai.category_id = ?");
        params.push(normalizeCategoryId(categoryId));
    }

    if (!includeInactive) {
        conditions.push("ai.is_active = 1");
    }

    const whereClause = conditions.length > 0
        ? `WHERE ${conditions.join(" AND ")}`
        : "";

    return db.prepare(`
        SELECT
            ai.id,
            ai.category_id AS categoryId,
            ac.name AS categoryName,
            ai.name,
            ai.description,
            ai.price_pp AS pricePp,
            ai.currency,
            ai.asset_key AS assetKey,
            ai.is_premium AS isPremium,
            ai.is_active AS isActive,
            ai.created_at AS createdAt,
            ai.updated_at AS updatedAt
        FROM arsenal_items ai
        LEFT JOIN arsenal_categories ac
            ON ac.id = ai.category_id
        ${whereClause}
        ORDER BY ac.display_order ASC, ai.price_pp ASC, ai.name ASC
    `).all(...params);
}

// Dodaje albo aktualizuje element katalogu bez uruchamiania żadnego zakupu.
function upsertArsenalItem(item) {
    if (!item || !item.id || !item.name) {
        throw new Error("Element Arsenału wymaga pól id i name.");
    }

    const now = new Date().toISOString();
    const categoryId = normalizeCategoryId(item.categoryId);
    const itemData = {
        id: item.id,
        categoryId,
        name: item.name,
        description: item.description || "",
        pricePp: Math.max(0, Number(item.pricePp) || 0),
        currency: ARSENAL_CURRENCY,
        assetKey: item.assetKey || null,
        isPremium: item.isPremium || categoryId === "premium" ? 1 : 0,
        isActive: item.isActive === false ? 0 : 1,
        createdAt: now,
        updatedAt: now
    };

    db.prepare(`
        INSERT INTO arsenal_items (
            id,
            category_id,
            name,
            description,
            price_pp,
            currency,
            asset_key,
            is_premium,
            is_active,
            created_at,
            updated_at
        )
        VALUES (
            @id,
            @categoryId,
            @name,
            @description,
            @pricePp,
            @currency,
            @assetKey,
            @isPremium,
            @isActive,
            @createdAt,
            @updatedAt
        )
        ON CONFLICT(id) DO UPDATE SET
            category_id = excluded.category_id,
            name = excluded.name,
            description = excluded.description,
            price_pp = excluded.price_pp,
            currency = excluded.currency,
            asset_key = excluded.asset_key,
            is_premium = excluded.is_premium,
            is_active = excluded.is_active,
            updated_at = excluded.updated_at
    `).run(itemData);

    return getArsenalItem(itemData.id);
}

function hasArsenalItem(discordId, itemId) {
    const result = db.prepare(`
        SELECT 1
        FROM users_arsenal_items
        WHERE discord_id = ?
          AND item_id = ?
    `).get(discordId, itemId);

    return Boolean(result);
}

// Nadaje element użytkownikowi bez pobierania PP.
function grantArsenalItem(discordId, itemId, source = "system") {
    const item = getArsenalItem(itemId);

    if (!item) {
        throw new Error(`Nie znaleziono elementu Arsenału: ${itemId}`);
    }

    const unlockedAt = new Date().toISOString();
    const result = db.prepare(`
        INSERT OR IGNORE INTO users_arsenal_items (
            discord_id,
            item_id,
            source,
            unlocked_at
        )
        VALUES (?, ?, ?, ?)
    `).run(discordId, itemId, source, unlockedAt);

    return {
        item,
        granted: result.changes > 0
    };
}

function getUserArsenal(discordId, options = {}) {
    const {
        categoryId = null
    } = options;
    const conditions = ["uai.discord_id = ?"];
    const params = [discordId];

    if (categoryId) {
        conditions.push("ai.category_id = ?");
        params.push(normalizeCategoryId(categoryId));
    }

    return db.prepare(`
        SELECT
            ai.id,
            ai.category_id AS categoryId,
            ac.name AS categoryName,
            ai.name,
            ai.description,
            ai.price_pp AS pricePp,
            ai.currency,
            ai.asset_key AS assetKey,
            ai.is_premium AS isPremium,
            uai.source,
            uai.unlocked_at AS unlockedAt
        FROM users_arsenal_items uai
        INNER JOIN arsenal_items ai
            ON ai.id = uai.item_id
        LEFT JOIN arsenal_categories ac
            ON ac.id = ai.category_id
        WHERE ${conditions.join(" AND ")}
        ORDER BY ac.display_order ASC, uai.rowid ASC
    `).all(...params);
}

// Zapisuje przyszły wybór użytkownika dla danej kategorii, bez żadnego UI i zakupów.
function equipArsenalItem(discordId, itemId) {
    const item = getArsenalItem(itemId);

    if (!item) {
        throw new Error(`Nie znaleziono elementu Arsenału: ${itemId}`);
    }

    if (!hasArsenalItem(discordId, itemId)) {
        throw new Error("Użytkownik nie posiada tego elementu Arsenału.");
    }

    const updatedAt = new Date().toISOString();

    db.prepare(`
        INSERT INTO users_arsenal_loadout (
            discord_id,
            category_id,
            item_id,
            updated_at
        )
        VALUES (?, ?, ?, ?)
        ON CONFLICT(discord_id, category_id) DO UPDATE SET
            item_id = excluded.item_id,
            updated_at = excluded.updated_at
    `).run(discordId, item.categoryId, itemId, updatedAt);

    return getUserArsenalLoadout(discordId);
}

function getUserArsenalLoadout(discordId) {
    return db.prepare(`
        SELECT
            ual.category_id AS categoryId,
            ac.name AS categoryName,
            ai.id,
            ai.name,
            ai.description,
            ai.price_pp AS pricePp,
            ai.currency,
            ai.asset_key AS assetKey,
            ai.is_premium AS isPremium,
            ual.updated_at AS updatedAt
        FROM users_arsenal_loadout ual
        INNER JOIN arsenal_items ai
            ON ai.id = ual.item_id
        LEFT JOIN arsenal_categories ac
            ON ac.id = ual.category_id
        WHERE ual.discord_id = ?
        ORDER BY ac.display_order ASC
    `).all(discordId);
}

seedArsenalCategories();

module.exports = {
    equipArsenalItem,
    getArsenalCategories,
    getArsenalCurrency,
    getArsenalItem,
    getArsenalItems,
    getUserArsenal,
    getUserArsenalLoadout,
    grantArsenalItem,
    hasArsenalItem,
    seedArsenalCategories,
    upsertArsenalItem
};
