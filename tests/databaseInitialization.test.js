const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const Database = require("better-sqlite3");

const { initializeDatabase } = require("../src/database/schema");

function createTempDatabase() {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "retroforma-db-init-"));
    const tempDbPath = path.join(tempDir, "database.db");
    const db = new Database(tempDbPath);

    return {
        close: () => {
            db.close();
            fs.rmSync(tempDir, {
                recursive: true,
                force: true
            });
        },
        db
    };
}

function seedExistingProductionLikeData(db) {
    db.exec(`
        CREATE TABLE users (
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

        CREATE TABLE submissions (
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

        CREATE TABLE badges (
            id TEXT PRIMARY KEY,
            name TEXT UNIQUE,
            description TEXT,
            icon TEXT
        );

        CREATE TABLE users_badges (
            discord_id TEXT,
            badge_id TEXT,
            UNIQUE(discord_id, badge_id)
        );
    `);

    db.prepare(`
        INSERT INTO users (
            discord_id,
            username,
            pp,
            xp,
            level,
            current_streak,
            best_streak,
            last_submission_date,
            missions_completed,
            created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        "123",
        "Kadet Testowy",
        240,
        1200,
        5,
        3,
        7,
        "2026-07-18T10:00:00.000Z",
        12,
        "2026-07-01T10:00:00.000Z"
    );

    db.prepare(`
        INSERT INTO submissions (
            mission_id,
            discord_id,
            message_id,
            attachment_count,
            status,
            approved_by,
            approved_at,
            created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        6,
        "123",
        "submission-message",
        2,
        "APPROVED",
        "moderator-1",
        "2026-07-18T11:00:00.000Z",
        "2026-07-18T10:30:00.000Z"
    );

    db.prepare(`
        INSERT INTO badges (id, name, description, icon)
        VALUES (?, ?, ?, ?)
    `).run("first-mission", "Pierwsza Misja", "Pierwsze zgłoszenie", "first.png");

    db.prepare(`
        INSERT INTO users_badges (discord_id, badge_id)
        VALUES (?, ?)
    `).run("123", "first-mission");
}

function getTableNames(db) {
    return db.prepare(`
        SELECT name
        FROM sqlite_master
        WHERE type = 'table'
        ORDER BY name
    `).all().map((row) => row.name);
}

test("initializeDatabase tworzy mission_publications bez naruszania danych użytkowników", () => {
    const { db, close } = createTempDatabase();

    try {
        seedExistingProductionLikeData(db);

        const userBefore = db.prepare("SELECT * FROM users WHERE discord_id = ?").get("123");
        const submissionBefore = db.prepare("SELECT * FROM submissions WHERE discord_id = ?").get("123");
        const badgeBefore = db.prepare("SELECT * FROM badges WHERE id = ?").get("first-mission");
        const userBadgeBefore = db.prepare("SELECT * FROM users_badges WHERE discord_id = ?").get("123");

        initializeDatabase(db);

        const userAfter = db.prepare("SELECT * FROM users WHERE discord_id = ?").get("123");

        assert.equal(userAfter.pp_total_earned, userBefore.pp);
        assert.deepEqual(
            Object.fromEntries(Object.entries(userAfter).filter(([key]) => key !== "pp_total_earned")),
            userBefore
        );
        assert.deepEqual(db.prepare("SELECT * FROM submissions WHERE discord_id = ?").get("123"), submissionBefore);
        assert.deepEqual(db.prepare("SELECT * FROM badges WHERE id = ?").get("first-mission"), badgeBefore);
        assert.deepEqual(db.prepare("SELECT * FROM users_badges WHERE discord_id = ?").get("123"), userBadgeBefore);
        assert.ok(getTableNames(db).includes("mission_publications"));
        assert.ok(getTableNames(db).includes("admin_point_transactions"));
    } finally {
        close();
    }
});

test("initializeDatabase można uruchomić wielokrotnie bez resetowania danych", () => {
    const { db, close } = createTempDatabase();

    try {
        initializeDatabase(db);

        db.prepare(`
            INSERT INTO users (discord_id, username, pp, xp, level, missions_completed, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run("456", "Kadet Drugi", 500, 2500, 11, 20, "2026-07-02T10:00:00.000Z");

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
        `).run(
            6,
            "006",
            "mission-message-006",
            "2026-07-17T16:00:00+02:00",
            "2026-07-19T15:00:00+02:00",
            "2026-07-17T16:00:05.000Z",
            "2026-07-17T16:00:05.000Z",
            "2026-07-17T16:00:05.000Z"
        );

        const userBefore = db.prepare("SELECT * FROM users WHERE discord_id = ?").get("456");
        const publicationBefore = db.prepare("SELECT * FROM mission_publications WHERE mission_id = ?").get(6);

        initializeDatabase(db);
        initializeDatabase(db);

        assert.deepEqual(db.prepare("SELECT * FROM users WHERE discord_id = ?").get("456"), userBefore);
        assert.deepEqual(db.prepare("SELECT * FROM mission_publications WHERE mission_id = ?").get(6), publicationBefore);
    } finally {
        close();
    }
});

test("initializeDatabase kopiuje stare saldo PP do pp_total_earned tylko przy migracji", () => {
    const { db, close } = createTempDatabase();

    try {
        seedExistingProductionLikeData(db);

        initializeDatabase(db);

        const migratedUser = db.prepare("SELECT pp, pp_total_earned FROM users WHERE discord_id = ?").get("123");

        assert.equal(migratedUser.pp, 240);
        assert.equal(migratedUser.pp_total_earned, 240);

        db.prepare(`
            UPDATE users
            SET pp = ?,
                pp_total_earned = ?
            WHERE discord_id = ?
        `).run(40, 240, "123");

        initializeDatabase(db);

        const afterSecondRun = db.prepare("SELECT pp, pp_total_earned FROM users WHERE discord_id = ?").get("123");

        assert.equal(afterSecondRun.pp, 40);
        assert.equal(afterSecondRun.pp_total_earned, 240);
    } finally {
        close();
    }
});

test("migracja schematu nie zawiera destrukcyjnych operacji na bazie", () => {
    const schemaSource = fs.readFileSync(
        path.join(__dirname, "..", "src", "database", "schema.js"),
        "utf8"
    );

    assert.doesNotMatch(schemaSource, /\bDROP\s+TABLE\b/i);
    assert.doesNotMatch(schemaSource, /\bVACUUM\s+INTO\b/i);
    assert.doesNotMatch(schemaSource, /\bDELETE\s+FROM\b/i);
    assert.match(schemaSource, /CREATE TABLE IF NOT EXISTS shop_items/);
    assert.match(schemaSource, /CREATE TABLE IF NOT EXISTS user_inventory/);
    assert.match(schemaSource, /INSERT OR IGNORE INTO shop_items/);
});
