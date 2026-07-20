const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const Database = require("better-sqlite3");

const { initializeDatabase } = require("../src/database/schema");
const { createProfileCard } = require("../src/services/profileCardService");
const {
    PROFILE_EQUIPMENT_CONFIG,
    getProfileEquipment,
    resolveProfileFrameAsset,
    resolveProfileThemeAsset
} = require("../src/services/profileEquipmentService");
const {
    ASSET_ROOT,
    clearAssetCache
} = require("../src/ui/assetRegistry");

const PNG_SIGNATURE = "89504e470d0a1a0a";

function createTempProfileContext() {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "retroforma-profile-"));
    const db = new Database(path.join(tempDir, "profile-test.sqlite"));

    initializeDatabase(db);

    function createUser(discordId) {
        db.prepare(`
            INSERT INTO users (discord_id, username, created_at)
            VALUES (?, ?, ?)
        `).run(discordId, `Kadet ${discordId}`, new Date().toISOString());

        return db.prepare(`
            SELECT *
            FROM users
            WHERE discord_id = ?
        `).get(discordId);
    }

    function getItem(code) {
        return db.prepare(`
            SELECT *
            FROM shop_items
            WHERE code = ?
        `).get(code);
    }

    function addOwnedItem(user, code) {
        const item = getItem(code);

        db.prepare(`
            INSERT INTO user_inventory (user_id, item_id, obtained_at)
            VALUES (?, ?, ?)
        `).run(user.id, item.id, new Date().toISOString());

        return item;
    }

    function equipItem(user, code, slot) {
        const item = getItem(code);

        db.prepare(`
            INSERT INTO user_equipment (user_id, slot, item_id, updated_at)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(user_id, slot) DO UPDATE SET
                item_id = excluded.item_id,
                updated_at = excluded.updated_at
        `).run(user.id, slot, item.id, new Date().toISOString());

        return item;
    }

    return {
        addOwnedItem,
        close: () => {
            db.close();
            fs.rmSync(tempDir, {
                recursive: true,
                force: true
            });
        },
        createUser,
        db,
        equipItem,
        getItem
    };
}

function createBaseProfile(overrides = {}) {
    return {
        avatarUrl: null,
        badges: [],
        bestStreak: 0,
        currentStreak: 0,
        discordId: "profile-user",
        equipment: {
            frame: null,
            theme: null
        },
        level: 1,
        missionsCompleted: 0,
        pp: 0,
        progress: {
            current: 0,
            percent: 0,
            required: 250
        },
        rankName: "Rekrut",
        rankingPosition: 1,
        streak: 0,
        username: "Testowy Kadet",
        xp: 0,
        ...overrides
    };
}

function assertPngBuffer(buffer) {
    assert.ok(Buffer.isBuffer(buffer));
    assert.ok(buffer.length > 1000);
    assert.equal(buffer.subarray(0, 8).toString("hex"), PNG_SIGNATURE);
    assert.equal(buffer.readUInt32BE(16), 1200);
    assert.equal(buffer.readUInt32BE(20), 675);
}

test("profil bez wyposazenia uzywa fallbacku", async () => {
    const context = createTempProfileContext();
    const user = context.createUser("profile-fallback-1");

    try {
        const equipment = getProfileEquipment(context.db, user.id);
        const buffer = await createProfileCard(createBaseProfile({
            equipment
        }));

        assert.deepEqual(equipment, {
            frame: null,
            theme: null
        });
        assert.equal(resolveProfileThemeAsset(equipment), null);
        assert.equal(resolveProfileFrameAsset(equipment), null);
        assertPngBuffer(buffer);
    } finally {
        context.close();
    }
});

test("profil z wyposazonym motywem pobiera wlasciwy asset", () => {
    const context = createTempProfileContext();
    const user = context.createUser("profile-theme-1");

    try {
        context.addOwnedItem(user, "tlo-blueprint");
        context.equipItem(user, "tlo-blueprint", PROFILE_EQUIPMENT_CONFIG.theme.slot);

        const equipment = getProfileEquipment(context.db, user.id);
        const asset = resolveProfileThemeAsset(equipment);

        assert.equal(equipment.theme.code, "tlo-blueprint");
        assert.equal(asset.path, path.resolve(ASSET_ROOT, "backgrounds", "blueprint.png"));
    } finally {
        context.close();
    }
});

test("zmiana motywu zmienia asset uzywany przez profil", () => {
    const context = createTempProfileContext();
    const user = context.createUser("profile-theme-2");

    try {
        context.addOwnedItem(user, "tlo-blueprint");
        context.addOwnedItem(user, "tlo-aurora");

        context.equipItem(user, "tlo-blueprint", PROFILE_EQUIPMENT_CONFIG.theme.slot);
        assert.equal(
            resolveProfileThemeAsset(getProfileEquipment(context.db, user.id)).path,
            path.resolve(ASSET_ROOT, "backgrounds", "blueprint.png")
        );

        context.equipItem(user, "tlo-aurora", PROFILE_EQUIPMENT_CONFIG.theme.slot);
        assert.equal(
            resolveProfileThemeAsset(getProfileEquipment(context.db, user.id)).path,
            path.resolve(ASSET_ROOT, "backgrounds", "aurora.png")
        );
    } finally {
        context.close();
    }
});

test("profil z wyposazona ramka pobiera wlasciwy asset", () => {
    const context = createTempProfileContext();
    const user = context.createUser("profile-frame-1");

    try {
        context.addOwnedItem(user, "ramka-neon");
        context.equipItem(user, "ramka-neon", PROFILE_EQUIPMENT_CONFIG.frame.slot);

        const equipment = getProfileEquipment(context.db, user.id);
        const asset = resolveProfileFrameAsset(equipment);

        assert.equal(equipment.frame.code, "ramka-neon");
        assert.equal(asset.path, path.resolve(ASSET_ROOT, "frames", "neon.png"));
    } finally {
        context.close();
    }
});

test("brak pliku assetu wyposazenia nie powoduje crasha profilu", async () => {
    clearAssetCache();

    const buffer = await createProfileCard(createBaseProfile({
        equipment: {
            frame: {
                category: "ramki",
                code: "ramka-ktorej-nie-ma"
            },
            theme: {
                category: "motywy-profilu",
                code: "tlo-ktorego-nie-ma"
            }
        }
    }));

    assertPngBuffer(buffer);
});

test("nieposiadany przedmiot nie moze wplynac na profil", () => {
    const context = createTempProfileContext();
    const user = context.createUser("profile-not-owner-1");

    try {
        context.equipItem(user, "tlo-blueprint", PROFILE_EQUIPMENT_CONFIG.theme.slot);

        const equipment = getProfileEquipment(context.db, user.id);

        assert.equal(equipment.theme, null);
        assert.equal(resolveProfileThemeAsset(equipment), null);
    } finally {
        context.close();
    }
});

test("wyposazenie jednego uzytkownika nie wplywa na innego", () => {
    const context = createTempProfileContext();
    const firstUser = context.createUser("profile-isolated-1");
    const secondUser = context.createUser("profile-isolated-2");

    try {
        context.addOwnedItem(firstUser, "tlo-blueprint");
        context.addOwnedItem(secondUser, "tlo-aurora");
        context.equipItem(firstUser, "tlo-blueprint", PROFILE_EQUIPMENT_CONFIG.theme.slot);
        context.equipItem(secondUser, "tlo-aurora", PROFILE_EQUIPMENT_CONFIG.theme.slot);

        const firstEquipment = getProfileEquipment(context.db, firstUser.id);
        const secondEquipment = getProfileEquipment(context.db, secondUser.id);

        assert.equal(firstEquipment.theme.code, "tlo-blueprint");
        assert.equal(secondEquipment.theme.code, "tlo-aurora");
        assert.equal(
            resolveProfileThemeAsset(firstEquipment).path,
            path.resolve(ASSET_ROOT, "backgrounds", "blueprint.png")
        );
        assert.equal(
            resolveProfileThemeAsset(secondEquipment).path,
            path.resolve(ASSET_ROOT, "backgrounds", "aurora.png")
        );
    } finally {
        context.close();
    }
});
