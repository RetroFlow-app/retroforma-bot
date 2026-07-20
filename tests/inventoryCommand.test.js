const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const Database = require("better-sqlite3");

const inventoryCommand = require("../src/commands/inventoryCommand");
const {
    EMPTY_INVENTORY_SECTION_TEXT,
    EQUIPMENT_ERRORS,
    EQUIPMENT_SLOTS,
    createInventoryService
} = require("../src/services/inventoryService");
const { initializeDatabase } = require("../src/database/schema");

function createTempInventoryContext() {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "retroforma-inventory-"));
    const db = new Database(path.join(tempDir, "inventory-test.sqlite"));

    initializeDatabase(db);

    function getOrCreateUser(member) {
        const user = member.user || member;
        const username = user.tag || user.username || "Testowy Kadet";
        const existingUser = db.prepare(`
            SELECT *
            FROM users
            WHERE discord_id = ?
        `).get(user.id);

        if (existingUser) {
            return existingUser;
        }

        db.prepare(`
            INSERT INTO users (discord_id, username, created_at)
            VALUES (?, ?, ?)
        `).run(user.id, username, new Date().toISOString());

        return db.prepare(`
            SELECT *
            FROM users
            WHERE discord_id = ?
        `).get(user.id);
    }

    function addOwnedShopItem(member, code) {
        const user = getOrCreateUser(member);
        const item = db.prepare(`
            SELECT *
            FROM shop_items
            WHERE code = ?
        `).get(code);

        db.prepare(`
            INSERT INTO user_inventory (user_id, item_id, obtained_at)
            VALUES (?, ?, ?)
        `).run(user.id, item.id, new Date().toISOString());

        return item;
    }

    function addBadge(member, badge) {
        const user = member.user || member;

        db.prepare(`
            INSERT INTO badges (id, name, description, icon)
            VALUES (?, ?, ?, ?)
        `).run(badge.id, badge.name, badge.description, badge.icon || null);

        db.prepare(`
            INSERT INTO users_badges (discord_id, badge_id)
            VALUES (?, ?)
        `).run(user.id, badge.id);
    }

    function getEquippedCode(member, slot) {
        const user = getOrCreateUser(member);
        const equippedItem = db.prepare(`
            SELECT si.code
            FROM user_equipment ue
            INNER JOIN shop_items si
                ON si.id = ue.item_id
            WHERE ue.user_id = ?
              AND ue.slot = ?
        `).get(user.id, slot);

        return equippedItem?.code || null;
    }

    function getEquipmentSlotCount(member, slot) {
        const user = getOrCreateUser(member);

        return db.prepare(`
            SELECT COUNT(*) AS count
            FROM user_equipment
            WHERE user_id = ?
              AND slot = ?
        `).get(user.id, slot).count;
    }

    return {
        addBadge,
        addOwnedShopItem,
        close: () => {
            db.close();
            fs.rmSync(tempDir, {
                recursive: true,
                force: true
            });
        },
        db,
        getEquippedCode,
        getEquipmentSlotCount,
        getOrCreateUser
    };
}

function createMember(id = "inventory-user-1") {
    return {
        user: {
            id,
            tag: `Kadet#${id.slice(-4)}`,
            username: `Kadet-${id}`
        }
    };
}

function getSection(view, sectionId) {
    return view.sections.find((section) => section.id === sectionId);
}

function getEmbedField(embedJson, fieldLabel) {
    return embedJson.fields.find((field) => field.name.includes(fieldLabel));
}

test("komenda /ekwipunek jest zarejestrowana jako przeglad kolekcji", () => {
    const commandJson = inventoryCommand.data.toJSON();

    assert.equal(commandJson.name, "ekwipunek");
    assert.match(commandJson.description, /kolekcj/i);
});

test("/ekwipunek pokazuje tylko posiadane przedmioty w swoich sekcjach", () => {
    const context = createTempInventoryContext();
    const member = createMember();

    try {
        context.addOwnedShopItem(member, "kompas-analogowy");
        context.addOwnedShopItem(member, "ramka-neon");
        context.addOwnedShopItem(member, "tlo-blueprint");

        const view = createInventoryService({
            db: context.db,
            getOrCreateUser: context.getOrCreateUser
        }).getInventoryView(member);

        assert.deepEqual(getSection(view, "gadzety").items.map((item) => item.code), ["kompas-analogowy"]);
        assert.deepEqual(getSection(view, "ramki").items.map((item) => item.code), ["ramka-neon"]);
        assert.deepEqual(getSection(view, "motywy-profilu").items.map((item) => item.code), ["tlo-blueprint"]);
        assert.equal(view.sections.some((section) => (
            section.items.some((item) => item.code === "radio-kieszonkowe")
        )), false);
    } finally {
        context.close();
    }
});

test("/ekwipunek wyswietla odznaki z istniejacego systemu badges", () => {
    const context = createTempInventoryContext();
    const member = createMember("badge-owner-1");

    try {
        context.getOrCreateUser(member);
        context.addBadge(member, {
            id: "first-mission",
            name: "Pierwsza Misja",
            description: "Ukończono pierwszą misję Poligonu."
        });

        const view = createInventoryService({
            db: context.db,
            getOrCreateUser: context.getOrCreateUser
        }).getInventoryView(member);
        const badges = getSection(view, "odznaki").items;

        assert.equal(badges.length, 1);
        assert.equal(badges[0].code, "first-mission");
        assert.equal(badges[0].name, "Pierwsza Misja");
    } finally {
        context.close();
    }
});

test("/ekwipunek odpowiada ephemeral embedem i pokazuje puste sekcje", async () => {
    const context = createTempInventoryContext();
    const member = createMember("empty-inventory-1");
    let replyPayload = null;

    try {
        await inventoryCommand.execute({
            member,
            reply(payload) {
                replyPayload = payload;
                return Promise.resolve();
            }
        }, {
            db: context.db,
            getOrCreateUser: context.getOrCreateUser
        });

        const embedJson = replyPayload.embeds[0].toJSON();

        assert.equal(replyPayload.ephemeral, true);
        assert.equal(replyPayload.embeds.length, 1);
        assert.match(embedJson.title, /Ekwipunek/);
        assert.equal(getEmbedField(embedJson, "Posiadane").value, "0");
        assert.equal(getEmbedField(embedJson, "Ramki").value, EMPTY_INVENTORY_SECTION_TEXT);
        assert.equal(getEmbedField(embedJson, "Gadżety").value, EMPTY_INVENTORY_SECTION_TEXT);
        assert.equal(getEmbedField(embedJson, "Odznaki").value, EMPTY_INVENTORY_SECTION_TEXT);
    } finally {
        context.close();
    }
});

test("baza tworzy niedestrukcyjna tabele aktywnego wyposazenia", () => {
    const context = createTempInventoryContext();

    try {
        const table = context.db.prepare(`
            SELECT name
            FROM sqlite_master
            WHERE type = 'table'
              AND name = 'user_equipment'
        `).get();

        assert.equal(table.name, "user_equipment");
    } finally {
        context.close();
    }
});

test("/ekwipunek pozwala wyposazyc motyw profilu", () => {
    const context = createTempInventoryContext();
    const member = createMember("theme-owner-1");
    const service = createInventoryService({
        db: context.db,
        getOrCreateUser: context.getOrCreateUser
    });

    try {
        context.addOwnedShopItem(member, "tlo-blueprint");

        service.equipItem(member, "tlo-blueprint");

        const view = service.getInventoryView(member);
        const theme = getSection(view, "motywy-profilu").items[0];

        assert.equal(context.getEquippedCode(member, EQUIPMENT_SLOTS.PROFILE_THEME), "tlo-blueprint");
        assert.equal(theme.equipped, true);
    } finally {
        context.close();
    }
});

test("/ekwipunek zastepuje poprzedni aktywny motyw profilu", () => {
    const context = createTempInventoryContext();
    const member = createMember("theme-owner-2");
    const service = createInventoryService({
        db: context.db,
        getOrCreateUser: context.getOrCreateUser
    });

    try {
        context.addOwnedShopItem(member, "tlo-blueprint");
        context.addOwnedShopItem(member, "tlo-aurora");

        service.equipItem(member, "tlo-blueprint");
        service.equipItem(member, "tlo-aurora");

        const view = service.getInventoryView(member);
        const themes = new Map(getSection(view, "motywy-profilu").items.map((item) => [item.code, item]));

        assert.equal(context.getEquippedCode(member, EQUIPMENT_SLOTS.PROFILE_THEME), "tlo-aurora");
        assert.equal(context.getEquipmentSlotCount(member, EQUIPMENT_SLOTS.PROFILE_THEME), 1);
        assert.equal(themes.get("tlo-blueprint").equipped, false);
        assert.equal(themes.get("tlo-aurora").equipped, true);
    } finally {
        context.close();
    }
});

test("/ekwipunek pozwala wyposazyc ramke profilu", () => {
    const context = createTempInventoryContext();
    const member = createMember("frame-owner-1");
    const service = createInventoryService({
        db: context.db,
        getOrCreateUser: context.getOrCreateUser
    });

    try {
        context.addOwnedShopItem(member, "ramka-neon");

        service.equipItem(member, "ramka-neon");

        const view = service.getInventoryView(member);
        const frame = getSection(view, "ramki").items[0];

        assert.equal(context.getEquippedCode(member, EQUIPMENT_SLOTS.PROFILE_FRAME), "ramka-neon");
        assert.equal(frame.equipped, true);
    } finally {
        context.close();
    }
});

test("/ekwipunek zastepuje poprzednia aktywna ramke profilu", () => {
    const context = createTempInventoryContext();
    const member = createMember("frame-owner-2");
    const service = createInventoryService({
        db: context.db,
        getOrCreateUser: context.getOrCreateUser
    });

    try {
        context.addOwnedShopItem(member, "ramka-neon");
        context.addOwnedShopItem(member, "ramka-carbon");

        service.equipItem(member, "ramka-neon");
        service.equipItem(member, "ramka-carbon");

        const view = service.getInventoryView(member);
        const frames = new Map(getSection(view, "ramki").items.map((item) => [item.code, item]));

        assert.equal(context.getEquippedCode(member, EQUIPMENT_SLOTS.PROFILE_FRAME), "ramka-carbon");
        assert.equal(context.getEquipmentSlotCount(member, EQUIPMENT_SLOTS.PROFILE_FRAME), 1);
        assert.equal(frames.get("ramka-neon").equipped, false);
        assert.equal(frames.get("ramka-carbon").equipped, true);
    } finally {
        context.close();
    }
});

test("/ekwipunek nie pozwala wyposazyc nieposiadanego przedmiotu", () => {
    const context = createTempInventoryContext();
    const member = createMember("not-owner-1");
    const service = createInventoryService({
        db: context.db,
        getOrCreateUser: context.getOrCreateUser
    });

    try {
        assert.throws(
            () => service.equipItem(member, "tlo-blueprint"),
            (error) => error.code === EQUIPMENT_ERRORS.ITEM_NOT_OWNED
        );

        assert.equal(context.getEquippedCode(member, EQUIPMENT_SLOTS.PROFILE_THEME), null);
    } finally {
        context.close();
    }
});
