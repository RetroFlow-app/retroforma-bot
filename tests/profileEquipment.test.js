const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const Database = require("better-sqlite3");

const { initializeDatabase } = require("../src/database/schema");
const {
    PROFILE_AVATAR_BOUNDS,
    PROFILE_THEME_OVERLAY_MAX_ALPHA,
    collectProfileCardText,
    createProfileCard,
    getAvatarLayout
} = require("../src/services/profileCardService");
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
        ppTotalEarned: 0,
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

function createSilentLogger() {
    return {
        info() {},
        warn() {},
        error() {}
    };
}

function createTestAvatarPath(tempDir) {
    const {
        createCanvas
    } = require("canvas");
    const canvas = createCanvas(96, 96);
    const ctx = canvas.getContext("2d");
    const avatarPath = path.join(tempDir, "avatar.png");

    ctx.fillStyle = "#22d3ee";
    ctx.fillRect(0, 0, 96, 96);
    ctx.fillStyle = "#0f172a";
    ctx.beginPath();
    ctx.arc(48, 48, 28, 0, Math.PI * 2);
    ctx.fill();
    fs.writeFileSync(avatarPath, canvas.toBuffer("image/png"));

    return avatarPath;
}

test("profil bez wyposazenia uzywa fallbacku", async () => {
    const context = createTempProfileContext();
    const user = context.createUser("profile-fallback-1");

    try {
        const equipment = getProfileEquipment(context.db, user.id);
        const buffer = await createProfileCard(createBaseProfile({
            equipment
        }), {
            logger: createSilentLogger()
        });

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
    }), {
        logger: createSilentLogger()
    });

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

test("profil pokazuje saldo PP i lacznie zdobyte PP", () => {
    const text = collectProfileCardText(createBaseProfile({
        pp: 75,
        ppTotalEarned: 520
    })).join("\n");

    assert.match(text, /75 PP/);
    assert.match(text, /Łącznie zdobyto 520 PP/);
});

test("wyposazone tlo jest pierwsza warstwa z polprzezroczystym overlayem", async () => {
    const context = createTempProfileContext();
    const user = context.createUser("profile-layer-theme");
    const trace = [];

    try {
        context.addOwnedItem(user, "tlo-blueprint");
        context.equipItem(user, "tlo-blueprint", PROFILE_EQUIPMENT_CONFIG.theme.slot);

        const equipment = getProfileEquipment(context.db, user.id);
        const buffer = await createProfileCard(createBaseProfile({
            equipment
        }), {
            logger: createSilentLogger(),
            trace
        });

        assert.equal(trace[0], "background:equipped-theme");
        assert.equal(trace[1], "background:overlay");
        assert.ok(trace.indexOf("panel:identity") > trace.indexOf("background:overlay"));
        assert.ok(PROFILE_THEME_OVERLAY_MAX_ALPHA <= 0.45);
        assertPngBuffer(buffer);
    } finally {
        context.close();
    }
});

test("avatar renderuje sie przy wyposazonej ramce, a clipping konczy sie przed ramka", async () => {
    const context = createTempProfileContext();
    const user = context.createUser("profile-avatar-frame-layer");
    const avatarPath = createTestAvatarPath(path.dirname(context.db.name));
    const trace = [];

    try {
        context.addOwnedItem(user, "ramka-neon");
        context.equipItem(user, "ramka-neon", PROFILE_EQUIPMENT_CONFIG.frame.slot);

        const buffer = await createProfileCard(createBaseProfile({
            avatarUrl: avatarPath,
            equipment: getProfileEquipment(context.db, user.id)
        }), {
            logger: createSilentLogger(),
            trace
        });
        const avatarIndex = trace.indexOf("avatar:image");
        const restoreIndex = trace.indexOf("avatar:clip:restore");
        const frameIndex = trace.findIndex((step) => step.startsWith("frame:"));

        assert.ok(avatarIndex >= 0);
        assert.ok(restoreIndex > avatarIndex);
        assert.ok(frameIndex > restoreIndex);
        assert.ok(["frame:equipped", "frame:equipped-skipped-opaque"].includes(trace[frameIndex]));
        assertPngBuffer(buffer);
    } finally {
        context.close();
    }
});

test("avatarBounds miesci ramke avatara ponizej naglowka lewego panelu", () => {
    const layout = getAvatarLayout();

    assert.deepEqual(PROFILE_AVATAR_BOUNDS, {
        x: 135,
        y: 142,
        width: 160,
        height: 160
    });
    assert.equal(layout.centerX, 215);
    assert.equal(layout.centerY, 222);
    assert.deepEqual(layout.frameBounds, {
        x: 118,
        y: 125,
        width: 194,
        height: 194
    });
});

test("brak ramki nadal pokazuje avatar i standardowa obwodke", async () => {
    const context = createTempProfileContext();
    const avatarPath = createTestAvatarPath(path.dirname(context.db.name));
    const trace = [];

    try {
        const buffer = await createProfileCard(createBaseProfile({
            avatarUrl: avatarPath
        }), {
            logger: createSilentLogger(),
            trace
        });

        assert.ok(trace.includes("avatar:image"));
        assert.ok(trace.includes("frame:default-circle"));
        assertPngBuffer(buffer);
    } finally {
        context.close();
    }
});

test("zdobyte odznaki z profilu sa widoczne, a niezdobyte nie sa placeholderem", () => {
    const text = collectProfileCardText(createBaseProfile({
        badges: [
            {
                id: "first_mission",
                name: "Pierwsza Misja",
                description: "Ukoncz pierwsza misje.",
                icon: "I"
            }
        ]
    })).join("\n");

    assert.match(text, /Pierwsza Misja/);
    assert.doesNotMatch(text, /TOP 3/);
});

test("pusty profil pokazuje brak zdobytych odznak", () => {
    const text = collectProfileCardText(createBaseProfile({
        badges: []
    })).join("\n");

    assert.match(text, /Brak zdobytych odznak/);
});

test("brak assetu odznaki nie przerywa generowania profilu", async () => {
    const originalWarn = console.warn;
    const profile = createBaseProfile({
        badges: [
            {
                id: "odznaka-bez-assetu",
                name: "Odznaka Testowa",
                description: "Testowy fallback assetu.",
                icon: "OT"
            }
        ]
    });

    console.warn = () => {};

    try {
        clearAssetCache();

        const buffer = await createProfileCard(profile, {
            logger: createSilentLogger()
        });
        const text = collectProfileCardText(profile).join("\n");

        assertPngBuffer(buffer);
        assert.match(text, /Odznaka Testowa/);
    } finally {
        console.warn = originalWarn;
        clearAssetCache();
    }
});
