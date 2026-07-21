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
const { handleInventoryInteraction } = require("../src/handlers/inventoryInteractionHandler");
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
    UI_FONT_STACK,
    createUiCanvas,
    setFont
} = require("../src/ui/renderer");
const {
    collectInventoryScreenText,
    INVENTORY_SCREEN_PAGE_SIZE,
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

function createComponentInteraction(member, options = {}) {
    const calls = [];
    const componentType = options.type || "button";

    return {
        calls,
        customId: options.customId,
        deferred: false,
        member,
        replied: false,
        user: member.user,
        values: options.values || [],
        async deferUpdate() {
            calls.push({
                name: "deferUpdate"
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
        async followUp(payload) {
            calls.push({
                name: "followUp",
                payload
            });
            this.replied = true;
            return payload;
        },
        isButton() {
            return componentType === "button";
        },
        isStringSelectMenu() {
            return componentType === "select";
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

function getPayloadButtons(payload) {
    return payload.components.flatMap((row) => (
        row.toJSON().components.filter((component) => component.type === 2)
    ));
}

function getItemSelect(payload) {
    return getPayloadSelects(payload).find((select) => select.placeholder === "Wybierz przedmiot");
}

function getEquipButton(payload) {
    return getPayloadButtons(payload).find((button) => String(button.custom_id || "").includes(":equip:"));
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

        assert.equal(INVENTORY_SCREEN_PAGE_SIZE, 4);
        assert.equal(viewModel.totalPages, 3);
        assert.equal(viewModel.itemsOnPage.length, 4);
        assert.equal(screenData.items.length, 4);
        assert.equal(screenData.categoryCounts["motywy-profilu"], 6);
        assert.equal(screenData.categoryCounts.ramki, 2);
        assert.equal(screenData.categoryCounts.gadzety, 1);
        assert.ok(screenData.totalAvailableItems >= screenData.totalOwnedCount);
        assert.ok(screenData.selectedItem);
        assertPngBuffer(buffer);
    } finally {
        context.close();
    }
});

test("select Wybierz przedmiot pokazuje tylko elementy z aktualnej kategorii", () => {
    const context = createTempInventoryContext();
    const member = createMember("item-select-category");

    try {
        context.addOwnedShopItem(member, "tlo-blueprint");
        context.addOwnedShopItem(member, "ramka-neon");
        context.addOwnedShopItem(member, "ramka-carbon");
        context.addOwnedShopItem(member, "kompas-analogowy");

        const payload = createInventoryPayload(member, {
            category: "ramki",
            db: context.db,
            getOrCreateUser: context.getOrCreateUser,
            page: 0
        });
        const itemSelect = getItemSelect(payload);
        const values = itemSelect.options.map((option) => option.value).sort();

        assert.ok(itemSelect);
        assert.deepEqual(values, ["ramka-carbon", "ramka-neon"]);
        assert.equal(values.includes("tlo-blueprint"), false);
        assert.equal(values.includes("kompas-analogowy"), false);
    } finally {
        context.close();
    }
});

test("wybor przedmiotu ustawia zaznaczona karte i panel szczegolow", () => {
    const context = createTempInventoryContext();
    const member = createMember("selected-item-view");

    try {
        context.addOwnedShopItem(member, "ramka-neon");
        context.addOwnedShopItem(member, "ramka-carbon");

        const viewModel = createInventoryViewModel(member, {
            category: "ramki",
            db: context.db,
            getOrCreateUser: context.getOrCreateUser,
            selectedItemCode: "ramka-carbon"
        });
        const selectedItems = viewModel.itemsOnPage.filter((item) => item.selected);

        assert.equal(viewModel.selectedItem.code, "ramka-carbon");
        assert.equal(viewModel.selectedItemCode, "ramka-carbon");
        assert.equal(selectedItems.length, 1);
        assert.equal(selectedItems[0].code, "ramka-carbon");
    } finally {
        context.close();
    }
});

test("przycisk Wyposaz jest widoczny tylko dla nieaktywnego motywu lub ramki", () => {
    const context = createTempInventoryContext();
    const member = createMember("equip-button-visibility");
    const service = createInventoryService({
        db: context.db,
        getOrCreateUser: context.getOrCreateUser
    });

    try {
        context.addOwnedShopItem(member, "tlo-blueprint");
        context.addOwnedShopItem(member, "ramka-neon");
        context.addOwnedShopItem(member, "kompas-analogowy");
        context.addBadge(member, {
            id: "first_mission",
            name: "Pierwsza Misja",
            description: "Ukończ pierwszą misję."
        });

        const inactiveFramePayload = createInventoryPayload(member, {
            category: "ramki",
            db: context.db,
            getOrCreateUser: context.getOrCreateUser,
            selectedItemCode: "ramka-neon"
        });

        assert.equal(getEquipButton(inactiveFramePayload).label, "✅ Wyposaż");

        service.equipItem(member, "ramka-neon");

        const activeFramePayload = createInventoryPayload(member, {
            category: "ramki",
            db: context.db,
            getOrCreateUser: context.getOrCreateUser,
            selectedItemCode: "ramka-neon"
        });
        const gadgetPayload = createInventoryPayload(member, {
            category: "gadzety",
            db: context.db,
            getOrCreateUser: context.getOrCreateUser,
            selectedItemCode: "kompas-analogowy"
        });
        const badgePayload = createInventoryPayload(member, {
            category: "odznaki",
            db: context.db,
            getOrCreateUser: context.getOrCreateUser,
            selectedItemCode: "first_mission"
        });

        assert.equal(getEquipButton(activeFramePayload), undefined);
        assert.equal(getEquipButton(gadgetPayload), undefined);
        assert.equal(getEquipButton(badgePayload), undefined);
    } finally {
        context.close();
    }
});

test("klikniecie Wyposaz odswieza Canvas i zostawia potwierdzenie bez embeda", async () => {
    const context = createTempInventoryContext();
    const member = createMember("equip-button-flow");

    try {
        context.addOwnedShopItem(member, "tlo-blueprint");

        const initialPayload = createInventoryPayload(member, {
            category: "motywy-profilu",
            db: context.db,
            getOrCreateUser: context.getOrCreateUser,
            selectedItemCode: "tlo-blueprint"
        });
        const equipButton = getEquipButton(initialPayload);
        const interaction = createComponentInteraction(member, {
            customId: equipButton.custom_id,
            type: "button"
        });

        const handled = await handleInventoryInteraction(interaction, {
            db: context.db,
            getOrCreateUser: context.getOrCreateUser
        });
        const editReply = interaction.calls.find((call) => call.name === "editReply");

        assert.equal(handled, true);
        assert.deepEqual(interaction.calls.map((call) => call.name), ["deferUpdate", "editReply", "followUp"]);
        assert.equal(context.getEquippedCode(member, EQUIPMENT_SLOTS.PROFILE_THEME), "tlo-blueprint");
        assert.equal(editReply.payload.content, "");
        assert.deepEqual(editReply.payload.embeds, []);
        assertPngBuffer(editReply.payload.files[0].attachment);
        assert.equal(getEquipButton(editReply.payload), undefined);
        assert.match(interaction.calls.find((call) => call.name === "followUp").payload.content, /Wyposażono „Tło Blueprint”/);
        assert.equal(interaction.calls.find((call) => call.name === "followUp").payload.ephemeral, true);
    } finally {
        context.close();
    }
});

test("aktywny motyw i ramka po odswiezeniu nie pokazuja przycisku Wyposaz", () => {
    const context = createTempInventoryContext();
    const member = createMember("active-refresh-state");
    const service = createInventoryService({
        db: context.db,
        getOrCreateUser: context.getOrCreateUser
    });

    try {
        context.addOwnedShopItem(member, "tlo-blueprint");
        context.addOwnedShopItem(member, "ramka-neon");
        service.equipItem(member, "tlo-blueprint");
        service.equipItem(member, "ramka-neon");

        const themePayload = createInventoryPayload(member, {
            category: "motywy-profilu",
            db: context.db,
            getOrCreateUser: context.getOrCreateUser,
            selectedItemCode: "tlo-blueprint"
        });
        const framePayload = createInventoryPayload(member, {
            category: "ramki",
            db: context.db,
            getOrCreateUser: context.getOrCreateUser,
            selectedItemCode: "ramka-neon"
        });
        const themeText = collectInventoryScreenText(createInventoryViewModel(member, {
            category: "motywy-profilu",
            db: context.db,
            getOrCreateUser: context.getOrCreateUser,
            selectedItemCode: "tlo-blueprint"
        })).join("\n");
        const frameText = collectInventoryScreenText(createInventoryViewModel(member, {
            category: "ramki",
            db: context.db,
            getOrCreateUser: context.getOrCreateUser,
            selectedItemCode: "ramka-neon"
        })).join("\n");

        assert.equal(getEquipButton(themePayload), undefined);
        assert.equal(getEquipButton(framePayload), undefined);
        assert.match(themeText, /🟢 WYPOSAŻONY/);
        assert.match(frameText, /🟢 WYPOSAŻONY/);
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
        assert.equal(payload.components.length, 3);
        assert.ok(getItemSelect(payload));
        assert.equal(getEquipButton(payload), undefined);
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

test("renderer ekwipunku zachowuje polskie znaki przed rasteryzacja Canvas", () => {
    const screenData = {
        category: "gadzety",
        page: 0,
        playerPP: 0,
        sections: [
            {
                id: "gadzety",
                title: "Gadżety",
                items: [
                    {
                        code: "tlo-blueprint",
                        description: "Techniczne tło profilu z rysunkiem konstrukcyjnym i chłodnym światłem CAD.",
                        equipped: true,
                        name: "Tło Blueprint",
                        rarity: "Podstawowa",
                        type: "shop_item"
                    },
                    {
                        code: "radio-kieszonkowe",
                        description: "Radiowy gadżet gotowy do kolekcji.",
                        equipped: false,
                        name: "Radio Kieszonkowe",
                        rarity: "Niepospolita",
                        type: "shop_item"
                    }
                ]
            }
        ],
        totalBadges: 0,
        totalShopItems: 2
    };
    const joinedText = collectInventoryScreenText(screenData).join("\n");

    assert.match(joinedText, /Tło Blueprint/);
    assert.match(joinedText, /Gadżety/);
    assert.match(joinedText.toLowerCase(), /wyposażony/);
    assert.match(joinedText, /✓ W KOLEKCJI/);
    assert.match(joinedText, /Techniczne tło profilu/);
    assert.match(joinedText, /chłodnym światłem/);
    assert.doesNotMatch(joinedText, /T\?o|Gad\?ety|Wyposa\?ony|Kolekcji\?|t\?o|ch\?odnym|\?wiat\?em|\uFFFD/);
    assert.equal(joinedText.includes("?"), false);
    assertPngBuffer(renderInventoryScreen(screenData));
});

test("renderer ekwipunku ma finalne statusy, CTA i plakietke aktywnego elementu", () => {
    const baseSections = [
        {
            id: "motywy-profilu",
            title: "Motywy profilu",
            items: [
                {
                    code: "tlo-blueprint",
                    description: "Techniczne tło profilu.",
                    equipped: false,
                    equipmentSlot: EQUIPMENT_SLOTS.PROFILE_THEME,
                    name: "Tło Blueprint",
                    rarity: "Podstawowa",
                    type: "shop_item"
                },
                {
                    code: "tlo-aurora",
                    description: "Nastrojowe tło profilu.",
                    equipped: true,
                    equipmentSlot: EQUIPMENT_SLOTS.PROFILE_THEME,
                    name: "Tło Aurora",
                    rarity: "Niepospolita",
                    type: "shop_item"
                }
            ]
        },
        {
            id: "gadzety",
            title: "Gadżety",
            items: [
                {
                    code: "kompas-analogowy",
                    description: "Element kolekcjonerski.",
                    equipped: false,
                    name: "Kompas Analogowy",
                    rarity: "Podstawowa",
                    type: "shop_item"
                }
            ]
        },
        {
            id: "odznaki",
            title: "Odznaki",
            items: [
                {
                    code: "first_mission",
                    description: "Ukończ pierwszą misję.",
                    name: "Pierwsza Misja",
                    type: "badge"
                }
            ]
        }
    ];
    const inactiveThemeText = collectInventoryScreenText({
        category: "motywy-profilu",
        selectedItemCode: "tlo-blueprint",
        sections: baseSections,
        totalAvailableItems: 22
    }).join("\n");
    const activeThemeText = collectInventoryScreenText({
        category: "motywy-profilu",
        selectedItemCode: "tlo-aurora",
        sections: baseSections,
        totalAvailableItems: 22
    }).join("\n");
    const gadgetText = collectInventoryScreenText({
        category: "gadzety",
        selectedItemCode: "kompas-analogowy",
        sections: baseSections,
        totalAvailableItems: 22
    }).join("\n");
    const badgeText = collectInventoryScreenText({
        category: "odznaki",
        selectedItemCode: "first_mission",
        sections: baseSections,
        totalAvailableItems: 22
    }).join("\n");

    assert.match(inactiveThemeText, /✓ W KOLEKCJI/);
    assert.match(inactiveThemeText, /✅ WYPOSAŻ/);
    assert.match(activeThemeText, /🟢 WYPOSAŻONY/);
    assert.match(activeThemeText, /AKTYWNE/);
    assert.match(gadgetText, /📦 Element kolekcjonerski/);
    assert.match(badgeText, /✓ ZDOBYTA/);
    assert.match(badgeText, /🏅 Zdobyta odznaka/);
});

test("renderer ekwipunku pokazuje tylko trzy poziomy rzadkosci", () => {
    const screenText = collectInventoryScreenText({
        category: "all",
        sections: [
            {
                id: "gadzety",
                title: "Gadżety",
                items: [
                    {
                        code: "radio-kieszonkowe",
                        name: "Radio Kieszonkowe",
                        rarity: "Niepospolita",
                        type: "shop_item"
                    },
                    {
                        code: "aparat-polaroid",
                        name: "Aparat Polaroid",
                        rarity: "Rzadka",
                        type: "shop_item"
                    },
                    {
                        code: "terminal",
                        name: "Terminal Polowy",
                        rarity: "Legendarna",
                        type: "shop_item"
                    }
                ]
            }
        ],
        totalAvailableItems: 22
    }).join("\n");

    assert.match(screenText, /Podstawowa/);
    assert.match(screenText, /Epicka/);
    assert.match(screenText, /Legendarna/);
    assert.doesNotMatch(screenText, /Niepospolita|Rzadka/);
});

test("pasek postepu kolekcji liczy proporcje posiadanych elementow", () => {
    const normalizedData = normalizeInventoryScreenData({
        category: "all",
        sections: [
            {
                id: "gadzety",
                title: "Gadżety",
                items: [
                    { code: "a", name: "A" },
                    { code: "b", name: "B" },
                    { code: "c", name: "C" },
                    { code: "d", name: "D" }
                ]
            }
        ],
        totalAvailableItems: 22
    });

    assert.equal(normalizedData.totalOwnedCount, 4);
    assert.equal(normalizedData.totalAvailableItems, 22);
    assert.equal(normalizedData.collectionProgress, 4 / 22);
    assertPngBuffer(renderInventoryScreen(normalizedData));
});

test("wspolny renderer UI uzywa font stacka z fallbackiem dla polskich znakow", () => {
    const { canvas, ctx } = createUiCanvas({
        height: 140,
        width: 520
    });

    setFont(ctx, 24, "800");
    ctx.fillText("Tło Blueprint Gadżety Wyposażony W kolekcji", 20, 54);
    setFont(ctx, 18, "600");
    ctx.fillText("Techniczne tło profilu chłodnym światłem CAD", 20, 92);

    const buffer = canvas.toBuffer("image/png");

    assert.match(UI_FONT_STACK, /DejaVu Sans/);
    assert.match(UI_FONT_STACK, /Liberation Sans/);
    assert.equal(buffer.subarray(0, 8).toString("hex"), PNG_SIGNATURE);
    assert.deepEqual(readPngSize(buffer), {
        height: 140,
        width: 520
    });
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

test("gadzet tworzy select przedmiotu, ale nie tworzy przycisku wyposazenia", () => {
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

        assert.equal(payload.components.length, 3);
        assert.equal(selects.length, 2);
        assert.equal(getItemSelect(payload).options.length, 1);
        assert.equal(getItemSelect(payload).options[0].value, "kompas-analogowy");
        assert.equal(getEquipButton(payload), undefined);
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
