const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const Database = require("better-sqlite3");

const inventoryCommand = require("../src/commands/inventoryCommand");
const {
    EQUIPMENT_ERRORS,
    EQUIPMENT_SLOTS,
    createInventoryService
} = require("../src/services/inventoryService");
const {
    createInventoryPayload,
    createInventoryPayloadFromView,
    createInventoryViewModel
} = require("../src/services/inventoryViewService");
const { initializeDatabase } = require("../src/database/schema");
const {
    ASSET_ROOT,
    resolveUiAsset
} = require("../src/ui/assetRegistry");
const {
    normalizeInventoryScreenData,
    renderInventoryScreen
} = require("../src/ui/templates/inventoryScreen");

const PNG_SIGNATURE = "89504e470d0a1a0a";

function readPngSize(buffer) {
    return {
        height: buffer.readUInt32BE(20),
        width: buffer.readUInt32BE(16)
    };
}

function assertPngBuffer(buffer) {
    assert.ok(Buffer.isBuffer(buffer));
    assert.ok(buffer.length > 1000);
    assert.equal(buffer.subarray(0, 8).toString("hex"), PNG_SIGNATURE);
    assert.deepEqual(readPngSize(buffer), {
        height: 720,
        width: 1280
    });
}

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

function createCommandInteraction(member) {
    const calls = [];

    return {
        calls,
        deferred: false,
        member,
        replied: false,
        user: member.user,
        async deferReply(payload) {
            calls.push({
                name: "deferReply",
                payload
            });
            this.deferred = true;
        },
        async editReply(payload) {
            calls.push({
                name: "editReply",
                payload
            });
            this.replied = true;
            return payload;
        },
        async reply(payload) {
            calls.push({
                name: "reply",
                payload
            });
            this.replied = true;
            return payload;
        }
    };
}

function createSilentLogger() {
    return {
        errors: [],
        infos: [],
        error(message) {
            this.errors.push(String(message));
        },
        info(message) {
            this.infos.push(String(message));
        }
    };
}

function getSection(view, sectionId) {
    return view.sections.find((section) => section.id === sectionId);
}

function getPayloadCustomIds(payload) {
    return payload.components.flatMap((row) => (
        row.toJSON().components
            .map((component) => component.custom_id)
            .filter(Boolean)
    ));
}

function getPayloadSelects(payload) {
    return payload.components.flatMap((row) => (
        row.toJSON().components.filter((component) => component.type === 3)
    ));
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
            id: "first_mission",
            name: "Pierwsza Misja",
            description: "Ukończono pierwszą misję Poligonu."
        });

        const view = createInventoryService({
            db: context.db,
            getOrCreateUser: context.getOrCreateUser
        }).getInventoryView(member);
        const badges = getSection(view, "odznaki").items;

        assert.equal(badges.length, 1);
        assert.equal(badges[0].code, "first_mission");
        assert.equal(badges[0].name, "Pierwsza Misja");
    } finally {
        context.close();
    }
});

test("/ekwipunek odpowiada ephemeral ekranem PNG bez tekstowego embeda", async () => {
    const context = createTempInventoryContext();
    const member = createMember("empty-inventory-1");
    const interaction = createCommandInteraction(member);
    const logger = createSilentLogger();

    try {
        await inventoryCommand.execute(interaction, {
            db: context.db,
            getOrCreateUser: context.getOrCreateUser,
            logger
        });

        const replyPayload = interaction.calls.find((call) => call.name === "editReply").payload;

        assert.deepEqual(interaction.calls.map((call) => call.name), ["deferReply", "editReply"]);
        assert.equal(interaction.calls[0].payload.ephemeral, true);
        assert.deepEqual(replyPayload.embeds, []);
        assert.deepEqual(replyPayload.attachments, []);
        assert.equal(replyPayload.files.length, 1);
        assert.equal(replyPayload.files[0].name, "retroforma-ekwipunek.png");
        assertPngBuffer(replyPayload.files[0].attachment);
        assert.equal(replyPayload.components.length, 2);
        assert.equal(logger.infos.includes("[INVENTORY] reply sent"), true);
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

test("graficzny ekwipunek renderuje karty i paginuje kolekcje", () => {
    const context = createTempInventoryContext();
    const member = createMember("inventory-render-1");

    try {
        [
            "tlo-blueprint",
            "tlo-aurora",
            "tlo-storm",
            "tlo-satellite-array",
            "motyw-crt",
            "tlo-syntetyczny-zachod",
            "ramka-neon",
            "ramka-carbon",
            "kompas-analogowy"
        ].forEach((code) => context.addOwnedShopItem(member, code));

        const viewModel = createInventoryViewModel(member, {
            category: "all",
            db: context.db,
            getOrCreateUser: context.getOrCreateUser,
            page: 0
        });
        const screenData = normalizeInventoryScreenData({
            category: viewModel.category,
            page: viewModel.page,
            playerPP: viewModel.playerPP,
            sections: viewModel.sections,
            totalBadges: viewModel.totalBadges,
            totalShopItems: viewModel.totalShopItems
        });
        const buffer = renderInventoryScreen(screenData);

        assert.equal(viewModel.totalPages, 2);
        assert.equal(viewModel.itemsOnPage.length, 8);
        assertPngBuffer(buffer);
    } finally {
        context.close();
    }
});

test("graficzny ekwipunek dziala dla uzytkownika tylko z odznakami", () => {
    const context = createTempInventoryContext();
    const member = createMember("badge-only-inventory");

    try {
        context.getOrCreateUser(member);
        context.addBadge(member, {
            id: "first_mission",
            name: "Pierwsza Misja",
            description: "Ukończono pierwszą misję Poligonu."
        });

        const payload = createInventoryPayload(member, {
            category: "odznaki",
            db: context.db,
            getOrCreateUser: context.getOrCreateUser,
            page: 0
        });

        assertPngBuffer(payload.files[0].attachment);
        assert.equal(payload.components.length, 2);
    } finally {
        context.close();
    }
});

test("brak assetu pojedynczej karty ekwipunku uzywa fallbacku bez crasha", () => {
    const buffer = renderInventoryScreen({
        category: "all",
        page: 0,
        playerPP: 0,
        sections: [
            {
                id: "gadzety",
                title: "Gadzety",
                items: [
                    {
                        code: "brakujacy-asset-ekwipunku",
                        name: "Brakujący Asset",
                        rarity: "Rzadka",
                        type: "shop_item"
                    }
                ]
            }
        ],
        totalBadges: 0,
        totalShopItems: 1
    });

    assertPngBuffer(buffer);
});

test("payload ekwipunku ma jedna aktualna grafike i komponenty kategorii", () => {
    const context = createTempInventoryContext();
    const member = createMember("inventory-payload-1");

    try {
        context.addOwnedShopItem(member, "ramka-neon");

        const payload = createInventoryPayload(member, {
            category: "ramki",
            db: context.db,
            getOrCreateUser: context.getOrCreateUser,
            page: 0
        });

        assert.deepEqual(payload.embeds, []);
        assert.deepEqual(payload.attachments, []);
        assert.equal(payload.files.length, 1);
        assert.equal(payload.files[0].name, "retroforma-ekwipunek.png");
        assertPngBuffer(payload.files[0].attachment);
        assert.ok(payload.components.length >= 3);

        const customIds = getPayloadCustomIds(payload);
        assert.equal(customIds.length, new Set(customIds).size);
    } finally {
        context.close();
    }
});

test("brak motywow i ramek nie tworzy pustych selectow wyposazenia", () => {
    const context = createTempInventoryContext();
    const member = createMember("gadget-only-inventory");

    try {
        context.addOwnedShopItem(member, "kompas-analogowy");

        const payload = createInventoryPayload(member, {
            category: "gadzety",
            db: context.db,
            getOrCreateUser: context.getOrCreateUser,
            page: 0
        });
        const selects = getPayloadSelects(payload);

        assert.equal(payload.components.length, 2);
        assert.equal(selects.length, 1);
        assert.ok(selects[0].options.length >= 1);
        assert.ok(selects[0].options.length <= 25);
    } finally {
        context.close();
    }
});

test("/ekwipunek wykonuje deferReply przed renderem", async () => {
    const context = createTempInventoryContext();
    const member = createMember("defer-before-render");
    const interaction = createCommandInteraction(member);
    let renderSawDeferred = false;

    try {
        await inventoryCommand.execute(interaction, {
            createInventoryPayloadFromView(payloadMember, viewModel) {
                renderSawDeferred = interaction.deferred;
                return createInventoryPayloadFromView(payloadMember, viewModel);
            },
            db: context.db,
            getOrCreateUser: context.getOrCreateUser,
            logger: createSilentLogger()
        });

        assert.equal(renderSawDeferred, true);
        assert.deepEqual(interaction.calls.map((call) => call.name), ["deferReply", "editReply"]);
    } finally {
        context.close();
    }
});

test("blad renderera ekwipunku konczy sie czytelnym editReply", async () => {
    const context = createTempInventoryContext();
    const member = createMember("render-error-inventory");
    const interaction = createCommandInteraction(member);

    try {
        await inventoryCommand.execute(interaction, {
            createInventoryPayloadFromView() {
                throw new Error("TEST_RENDER_FAILURE");
            },
            db: context.db,
            getOrCreateUser: context.getOrCreateUser,
            logger: createSilentLogger()
        });

        const editReply = interaction.calls.find((call) => call.name === "editReply");

        assert.deepEqual(interaction.calls.map((call) => call.name), ["deferReply", "editReply"]);
        assert.match(editReply.payload.content, /Nie udało się wygenerować ekwipunku/);
        assert.deepEqual(editReply.payload.components, []);
        assert.deepEqual(editReply.payload.files, []);
    } finally {
        context.close();
    }
});

test("terminal uzywa prawdziwego assetu PNG bez fallbacku TP", () => {
    const terminalAsset = resolveUiAsset("item", "terminal");
    const legacyTerminalAsset = resolveUiAsset("item", "terminal-przenosny");

    assert.equal(terminalAsset.mapped, true);
    assert.equal(terminalAsset.path, path.resolve(ASSET_ROOT, "gadgets", "terminal.png"));
    assert.equal(legacyTerminalAsset.mapped, true);
    assert.equal(legacyTerminalAsset.path, path.resolve(ASSET_ROOT, "gadgets", "terminal.png"));
});
