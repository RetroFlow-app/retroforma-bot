const { createInventoryRepository } = require("./inventoryRepository");

const EMPTY_INVENTORY_SECTION_TEXT = "Nie posiadasz jeszcze żadnych przedmiotów.";

const EQUIPMENT_SLOTS = {
    PROFILE_FRAME: "profile_frame",
    PROFILE_THEME: "profile_theme"
};

const EQUIPMENT_ERRORS = {
    ITEM_NOT_OWNED: "ITEM_NOT_OWNED",
    UNSUPPORTED_ITEM_TYPE: "UNSUPPORTED_ITEM_TYPE"
};

const INVENTORY_SECTIONS = [
    {
        id: "motywy-profilu",
        title: "🎨 Motywy profilu"
    },
    {
        id: "ramki",
        title: "🖼 Ramki"
    },
    {
        id: "gadzety",
        title: "🧰 Gadżety"
    },
    {
        id: "odznaki",
        title: "🏅 Odznaki"
    }
];

const CATEGORY_ALIASES = {
    gadzety: "gadzety",
    motywy: "motywy-profilu",
    "motywy-profilu": "motywy-profilu",
    personalizacja: "motywy-profilu",
    ramki: "ramki",
    tla: "motywy-profilu"
};

const EQUIPPABLE_CATEGORY_SLOTS = {
    "motywy-profilu": EQUIPMENT_SLOTS.PROFILE_THEME,
    ramki: EQUIPMENT_SLOTS.PROFILE_FRAME
};

class InventoryEquipmentError extends Error {
    constructor(code, message) {
        super(message);
        this.name = "InventoryEquipmentError";
        this.code = code;
    }
}

function getDefaultDb() {
    return require("../database/db");
}

function getDefaultGetOrCreateUser() {
    return require("./pointsService").getOrCreateUser;
}

function getDiscordUser(member) {
    return member.user || member;
}

function createEmptySections() {
    return INVENTORY_SECTIONS.map((section) => ({
        ...section,
        items: []
    }));
}

function normalizeInventoryCategory(category) {
    return CATEGORY_ALIASES[String(category || "").trim()] || null;
}

function getEquipmentSlotForCategory(category) {
    const normalizedCategory = normalizeInventoryCategory(category);

    return EQUIPPABLE_CATEGORY_SLOTS[normalizedCategory] || null;
}

// Odznaki nie są przedmiotami sklepu, ale są częścią kolekcji gracza.
function getUserBadges(database, discordId) {
    return database.prepare(`
        SELECT
            b.id,
            b.name,
            b.description,
            b.icon
        FROM users_badges ub
        INNER JOIN badges b
            ON b.id = ub.badge_id
        WHERE ub.discord_id = ?
        ORDER BY b.name ASC
    `).all(discordId);
}

function createInventoryService(options = {}) {
    const database = options.db || getDefaultDb();
    const getOrCreateUser = options.getOrCreateUser || getDefaultGetOrCreateUser();
    const inventoryRepository = options.inventoryRepository || createInventoryRepository(database);
    const getBadges = options.getUserBadges || ((discordId) => getUserBadges(database, discordId));

    function getInventoryView(member) {
        const discordUser = getDiscordUser(member);
        const user = getOrCreateUser(member);
        const sections = createEmptySections();
        const sectionMap = new Map(sections.map((section) => [section.id, section]));
        const ownedItems = inventoryRepository.getOwnedItems(user.id);
        const equippedItems = inventoryRepository.getEquippedItems(user.id);
        const equippedBySlot = new Map(equippedItems.map((item) => [item.slot, item]));
        const badges = getBadges(user.discord_id || discordUser.id);

        for (const item of ownedItems) {
            const sectionId = normalizeInventoryCategory(item.category);
            const equipmentSlot = getEquipmentSlotForCategory(item.category);
            const equippedItem = equipmentSlot ? equippedBySlot.get(equipmentSlot) : null;

            if (!sectionId || !sectionMap.has(sectionId)) {
                continue;
            }

            sectionMap.get(sectionId).items.push({
                type: "shop_item",
                code: item.code,
                name: item.name,
                description: item.description,
                equipmentSlot,
                equipped: Boolean(equippedItem && equippedItem.code === item.code),
                price: item.price,
                rarity: item.rarity,
                obtainedAt: item.obtainedAt
            });
        }

        sectionMap.get("odznaki").items = badges.map((badge) => ({
            type: "badge",
            code: badge.id,
            name: badge.name,
            description: badge.description,
            icon: badge.icon
        }));

        return {
            discordUser,
            emptyText: EMPTY_INVENTORY_SECTION_TEXT,
            equipped: Object.fromEntries(equippedBySlot),
            sections,
            totalBadges: badges.length,
            totalShopItems: ownedItems.length,
            totalItems: ownedItems.length + badges.length,
            user
        };
    }

    function equipItem(member, itemCode, equipOptions = {}) {
        const user = getOrCreateUser(member);
        const item = inventoryRepository.getOwnedItemByCode(user.id, itemCode);

        if (!item) {
            throw new InventoryEquipmentError(
                EQUIPMENT_ERRORS.ITEM_NOT_OWNED,
                "Nie posiadasz tego przedmiotu."
            );
        }

        const slot = getEquipmentSlotForCategory(item.category);

        if (!slot || (equipOptions.expectedSlot && equipOptions.expectedSlot !== slot)) {
            throw new InventoryEquipmentError(
                EQUIPMENT_ERRORS.UNSUPPORTED_ITEM_TYPE,
                "Tego typu przedmiotu nie można jeszcze wyposażyć."
            );
        }

        inventoryRepository.equipItem({
            // userId to wewnętrzne users.id z SQLite.
            userId: user.id,
            slot,
            itemId: item.id,
            updatedAt: new Date().toISOString()
        });

        return {
            item,
            slot,
            user
        };
    }

    return {
        equipItem,
        getInventoryView
    };
}

function getInventoryView(member, options = {}) {
    return createInventoryService(options).getInventoryView(member);
}

function equipInventoryItem(member, itemCode, options = {}) {
    return createInventoryService(options).equipItem(member, itemCode, options);
}

module.exports = {
    EMPTY_INVENTORY_SECTION_TEXT,
    EQUIPMENT_ERRORS,
    EQUIPMENT_SLOTS,
    INVENTORY_SECTIONS,
    InventoryEquipmentError,
    createInventoryService,
    equipInventoryItem,
    getEquipmentSlotForCategory,
    getInventoryView,
    normalizeInventoryCategory
};
