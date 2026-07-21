const {
    INITIAL_SHOP_ITEMS,
    REMOVED_SHOP_ITEM_CODES
} = require("./shopSeedData");

// Sprawdza, czy tabela ma już wskazaną kolumnę.
function hasColumn(db, tableName, columnName) {
    return db.prepare(`PRAGMA table_info(${tableName})`)
        .all()
        .some((column) => column.name === columnName);
}

// Dodaje brakującą kolumnę bez naruszania istniejących danych.
function addColumnIfMissing(db, tableName, columnName, columnDefinition) {
    if (hasColumn(db, tableName, columnName)) {
        return;
    }

    db.prepare(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDefinition}`).run();
}

// Aktualizuje starsze bazy o nowe pola statystyk użytkownika.
function migrateUsersTable(db) {
    addColumnIfMissing(db, "users", "xp", "INTEGER DEFAULT 0");
    addColumnIfMissing(db, "users", "level", "INTEGER DEFAULT 1");
    addColumnIfMissing(db, "users", "current_streak", "INTEGER DEFAULT 0");
    addColumnIfMissing(db, "users", "best_streak", "INTEGER DEFAULT 0");
    addColumnIfMissing(db, "users", "last_submission_date", "TEXT");

    db.prepare(`
        UPDATE users
        SET xp = 0
        WHERE xp IS NULL
    `).run();

    db.prepare(`
        UPDATE users
        SET level = 1
        WHERE level IS NULL OR level < 1
    `).run();

    db.prepare(`
        UPDATE users
        SET current_streak = 0
        WHERE current_streak IS NULL OR current_streak < 0
    `).run();

    db.prepare(`
        UPDATE users
        SET best_streak = 0
        WHERE best_streak IS NULL OR best_streak < 0
    `).run();
}

// Aktualizuje starsze bazy o pola potrzebne do weryfikacji zgłoszeń.
function migrateSubmissionsTable(db) {
    const hadStatusColumn = hasColumn(db, "submissions", "status");

    addColumnIfMissing(db, "submissions", "status", "TEXT DEFAULT 'PENDING'");
    addColumnIfMissing(db, "submissions", "approved_by", "TEXT");
    addColumnIfMissing(db, "submissions", "approved_at", "TEXT");
    addColumnIfMissing(db, "submissions", "rejected_by", "TEXT");
    addColumnIfMissing(db, "submissions", "rejected_at", "TEXT");
    addColumnIfMissing(db, "submissions", "reject_reason", "TEXT");

    // Starsze zgłoszenia miały już przyznane nagrody, więc oznaczamy je jako zaakceptowane.
    if (!hadStatusColumn) {
        db.prepare(`
            UPDATE submissions
            SET status = 'APPROVED'
            WHERE status IS NULL
               OR status = 'PENDING'
        `).run();

        return;
    }

    db.prepare(`
        UPDATE submissions
        SET status = 'PENDING'
        WHERE status IS NULL
           OR status = ''
    `).run();
}

// Dodaje startowy katalog sklepu bez nadpisywania istniejących rekordów.
function seedShopItems(db) {
    const createdAt = new Date().toISOString();
    const statement = db.prepare(`
        INSERT OR IGNORE INTO shop_items (
            code,
            name,
            description,
            category,
            price,
            rarity,
            active,
            created_at
        )
        VALUES (
            @code,
            @name,
            @description,
            @category,
            @price,
            @rarity,
            1,
            @createdAt
        )
    `);

    for (const item of INITIAL_SHOP_ITEMS) {
        statement.run({
            ...item,
            createdAt
        });
    }
}

// Synchronizuje tylko kategorie startowych produktow, zeby starsze bazy
// przeniosly np. ramke neon z dawnej personalizacji do kategorii ramki.
function syncShopItemCategories(db) {
    const statement = db.prepare(`
        UPDATE shop_items
        SET category = @category
        WHERE code = @code
          AND category <> @category
    `);

    for (const item of INITIAL_SHOP_ITEMS) {
        statement.run({
            category: item.category,
            code: item.code
        });
    }
}

// Wycofuje ze sklepu pozycje, ktore nie powinny byc sprzedawane za PP.
// Nie kasuje rekordow ani inventory uzytkownikow, tylko ukrywa stare oferty.
function disableRemovedShopItems(db) {
    if (!REMOVED_SHOP_ITEM_CODES.length) {
        return;
    }

    const placeholders = REMOVED_SHOP_ITEM_CODES.map(() => "?").join(", ");

    db.prepare(`
        UPDATE shop_items
        SET active = 0
        WHERE code IN (${placeholders})
    `).run(...REMOVED_SHOP_ITEM_CODES);
}

// Porzadkuje starszy kod terminala bez zmiany ceny, rzadkosci, opisu ani inventory.
function syncTerminalShopItemCode(db) {
    const legacyTerminal = db.prepare(`
        SELECT id
        FROM shop_items
        WHERE code = ?
    `).get("terminal-przenosny");
    const currentTerminal = db.prepare(`
        SELECT id
        FROM shop_items
        WHERE code = ?
    `).get("terminal");

    if (!legacyTerminal || currentTerminal) {
        return;
    }

    db.prepare(`
        UPDATE shop_items
        SET code = ?,
            name = ?
        WHERE id = ?
    `).run("terminal", "Terminal Polowy", legacyTerminal.id);
}

function initializeDatabase(db) {
    db.exec(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            discord_id TEXT UNIQUE,
            username TEXT,
            pp INTEGER DEFAULT 0,
            xp INTEGER DEFAULT 0,
            level INTEGER DEFAULT 1,
            current_streak INTEGER DEFAULT 0,
            best_streak INTEGER DEFAULT 0,
            last_submission_date TEXT,
            missions_completed INTEGER DEFAULT 0,
            created_at TEXT
        );

        CREATE TABLE IF NOT EXISTS submissions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            mission_id INTEGER,
            discord_id TEXT,
            message_id TEXT,
            attachment_count INTEGER,
            status TEXT DEFAULT 'PENDING',
            approved_by TEXT,
            approved_at TEXT,
            rejected_by TEXT,
            rejected_at TEXT,
            reject_reason TEXT,
            created_at TEXT,
            UNIQUE(mission_id, discord_id)
        );

        CREATE TABLE IF NOT EXISTS badges (
            id TEXT PRIMARY KEY,
            name TEXT UNIQUE,
            description TEXT,
            icon TEXT
        );

        CREATE TABLE IF NOT EXISTS users_badges (
            discord_id TEXT,
            badge_id TEXT,
            UNIQUE(discord_id, badge_id)
        );

        CREATE TABLE IF NOT EXISTS arsenal_categories (
            id TEXT PRIMARY KEY,
            name TEXT UNIQUE,
            description TEXT,
            asset_folder TEXT,
            display_order INTEGER DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS arsenal_items (
            id TEXT PRIMARY KEY,
            category_id TEXT,
            name TEXT,
            description TEXT,
            price_pp INTEGER DEFAULT 0,
            currency TEXT DEFAULT 'PP',
            asset_key TEXT,
            is_premium INTEGER DEFAULT 0,
            is_active INTEGER DEFAULT 1,
            created_at TEXT,
            updated_at TEXT
        );

        CREATE TABLE IF NOT EXISTS users_arsenal_items (
            discord_id TEXT,
            item_id TEXT,
            source TEXT DEFAULT 'system',
            unlocked_at TEXT,
            UNIQUE(discord_id, item_id)
        );

        CREATE TABLE IF NOT EXISTS users_arsenal_loadout (
            discord_id TEXT,
            category_id TEXT,
            item_id TEXT,
            updated_at TEXT,
            UNIQUE(discord_id, category_id)
        );

        CREATE TABLE IF NOT EXISTS mission_publications (
            mission_id INTEGER PRIMARY KEY,
            mission_number TEXT,
            message_id TEXT,
            publish_at TEXT,
            close_at TEXT,
            published_at TEXT,
            closed_at TEXT,
            created_at TEXT,
            updated_at TEXT
        );

        CREATE TABLE IF NOT EXISTS shop_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            code TEXT UNIQUE NOT NULL,
            name TEXT NOT NULL,
            description TEXT,
            category TEXT NOT NULL,
            price INTEGER NOT NULL,
            rarity TEXT NOT NULL,
            active INTEGER DEFAULT 1,
            created_at TEXT
        );

        -- user_id przechowuje wewnętrzne users.id z SQLite, nie Discord snowflake.
        CREATE TABLE IF NOT EXISTS user_inventory (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            item_id INTEGER NOT NULL,
            obtained_at TEXT,
            UNIQUE(user_id, item_id)
        );

        -- user_id przechowuje wewnętrzne users.id z SQLite.
        -- Slot oddziela aktywny motyw profilu od aktywnej ramki profilu.
        CREATE TABLE IF NOT EXISTS user_equipment (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            slot TEXT NOT NULL,
            item_id INTEGER NOT NULL,
            updated_at TEXT,
            UNIQUE(user_id, slot)
        );

        CREATE INDEX IF NOT EXISTS idx_arsenal_items_category
            ON arsenal_items (category_id);

        CREATE INDEX IF NOT EXISTS idx_users_arsenal_items_discord_id
            ON users_arsenal_items (discord_id);

        CREATE INDEX IF NOT EXISTS idx_mission_publications_message_id
            ON mission_publications (message_id);

        CREATE INDEX IF NOT EXISTS idx_shop_items_category_active
            ON shop_items (category, active);

        CREATE INDEX IF NOT EXISTS idx_user_inventory_user_id
            ON user_inventory (user_id);

        CREATE INDEX IF NOT EXISTS idx_user_inventory_item_id
            ON user_inventory (item_id);

        CREATE INDEX IF NOT EXISTS idx_user_equipment_user_id
            ON user_equipment (user_id);
    `);

    migrateUsersTable(db);
    migrateSubmissionsTable(db);
    syncTerminalShopItemCode(db);
    seedShopItems(db);
    syncShopItemCategories(db);
    disableRemovedShopItems(db);
}

module.exports = {
    disableRemovedShopItems,
    seedShopItems,
    syncShopItemCategories,
    syncTerminalShopItemCode,
    initializeDatabase
};
