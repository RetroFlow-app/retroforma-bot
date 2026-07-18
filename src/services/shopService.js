const { SHOP_CATEGORIES } = require("../database/shopSeedData");
const { createInventoryRepository } = require("./inventoryRepository");
const { createShopRepository } = require("./shopRepository");

const SHOP_PAGE_SIZE = 1;

const SHOP_PURCHASE_ERRORS = {
    ALREADY_OWNED: "ALREADY_OWNED",
    INSUFFICIENT_PP: "INSUFFICIENT_PP",
    ITEM_UNAVAILABLE: "ITEM_UNAVAILABLE",
    PURCHASE_FAILED: "PURCHASE_FAILED"
};

class ShopPurchaseError extends Error {
    constructor(code, message) {
        super(message);
        this.name = "ShopPurchaseError";
        this.code = code;
    }
}

function getDefaultDb() {
    return require("../database/db");
}

function getDefaultGetOrCreateUser() {
    return require("./pointsService").getOrCreateUser;
}

function getSafePp(value) {
    return Math.max(0, Number(value) || 0);
}

function isValidItemPrice(item) {
    if (!Number.isSafeInteger(item.price) || item.price < 0) {
        return false;
    }

    if (typeof item.rawPrice === "number") {
        return Number.isSafeInteger(item.rawPrice) && item.rawPrice >= 0;
    }

    if (typeof item.rawPrice === "string") {
        return /^\d+$/.test(item.rawPrice.trim());
    }

    return false;
}

function getCategory(categoryId) {
    return SHOP_CATEGORIES.find((category) => category.id === categoryId) || SHOP_CATEGORIES[0];
}

function normalizeCategory(categoryId) {
    const normalizedCategoryId = String(categoryId || "all").trim();

    return getCategory(normalizedCategoryId).id;
}

function normalizePage(page, totalPages) {
    const safePage = Math.max(0, Number(page) || 0);

    if (totalPages <= 0) {
        return 0;
    }

    return Math.min(safePage, totalPages - 1);
}

function getDiscordUser(member) {
    return member.user || member;
}

function createShopService(options = {}) {
    const database = options.db || getDefaultDb();
    const getOrCreateUser = options.getOrCreateUser || getDefaultGetOrCreateUser();
    const shopRepository = options.shopRepository || createShopRepository(database);
    const inventoryRepository = options.inventoryRepository || createInventoryRepository(database);

    const purchaseTransaction = database.transaction(({
        internalUserId,
        itemCode,
        obtainedAt
    }) => {
        const item = shopRepository.getItemByCode(itemCode);

        if (!item || !item.active) {
            throw new ShopPurchaseError(
                SHOP_PURCHASE_ERRORS.ITEM_UNAVAILABLE,
                "Przedmiot jest niedostępny."
            );
        }

        if (!isValidItemPrice(item)) {
            throw new ShopPurchaseError(
                SHOP_PURCHASE_ERRORS.ITEM_UNAVAILABLE,
                "Przedmiot jest niedostępny."
            );
        }

        if (inventoryRepository.hasItem(internalUserId, item.id)) {
            throw new ShopPurchaseError(
                SHOP_PURCHASE_ERRORS.ALREADY_OWNED,
                "Masz już ten przedmiot."
            );
        }

        const user = database.prepare(`
            SELECT id, pp
            FROM users
            WHERE id = ?
        `).get(internalUserId);

        if (!user) {
            throw new ShopPurchaseError(
                SHOP_PURCHASE_ERRORS.PURCHASE_FAILED,
                "Nie znaleziono użytkownika."
            );
        }

        if (getSafePp(user.pp) < item.price) {
            throw new ShopPurchaseError(
                SHOP_PURCHASE_ERRORS.INSUFFICIENT_PP,
                "Masz za mało PP."
            );
        }

        try {
            inventoryRepository.addItem({
                userId: internalUserId,
                itemId: item.id,
                obtainedAt
            });
        } catch (error) {
            if (error.code === "SQLITE_CONSTRAINT_UNIQUE") {
                throw new ShopPurchaseError(
                    SHOP_PURCHASE_ERRORS.ALREADY_OWNED,
                    "Masz już ten przedmiot."
                );
            }

            throw error;
        }

        const updateResult = database.prepare(`
            UPDATE users
            SET pp = pp - ?
            WHERE id = ?
              AND pp >= ?
        `).run(item.price, internalUserId, item.price);

        if (updateResult.changes !== 1) {
            throw new ShopPurchaseError(
                SHOP_PURCHASE_ERRORS.PURCHASE_FAILED,
                "Zakup nie powiódł się."
            );
        }

        const updatedUser = database.prepare(`
            SELECT *
            FROM users
            WHERE id = ?
        `).get(internalUserId);

        return {
            item,
            remainingPp: getSafePp(updatedUser.pp),
            user: updatedUser
        };
    });

    function getShopView(member, options = {}) {
        const user = getOrCreateUser(member);
        const category = normalizeCategory(options.category);
        const allItems = shopRepository.getActiveItems(category);
        const ownedItemIds = inventoryRepository.getOwnedItemIds(user.id);
        const items = allItems.map((item) => ({
            ...item,
            categoryName: getCategory(item.category).name,
            owned: ownedItemIds.has(item.id)
        }));
        const totalPages = Math.max(1, Math.ceil(items.length / SHOP_PAGE_SIZE));
        const page = normalizePage(options.page, totalPages);
        const visibleItems = items.slice(
            page * SHOP_PAGE_SIZE,
            page * SHOP_PAGE_SIZE + SHOP_PAGE_SIZE
        );

        return {
            categories: SHOP_CATEGORIES,
            category,
            categoryName: getCategory(category).name,
            items: visibleItems,
            page,
            pp: getSafePp(user.pp),
            totalItems: items.length,
            totalPages,
            user
        };
    }

    function purchaseItem(member, itemCode) {
        const user = getOrCreateUser(member);
        const result = purchaseTransaction({
            // internalUserId to users.id z SQLite, nie Discord snowflake.
            internalUserId: user.id,
            itemCode,
            obtainedAt: new Date().toISOString()
        });

        return {
            ...result,
            buyer: getDiscordUser(member)
        };
    }

    return {
        getShopView,
        purchaseItem
    };
}

function getShopView(member, options = {}) {
    return createShopService().getShopView(member, options);
}

function purchaseItem(member, itemCode) {
    return createShopService().purchaseItem(member, itemCode);
}

module.exports = {
    SHOP_PAGE_SIZE,
    SHOP_PURCHASE_ERRORS,
    ShopPurchaseError,
    createShopService,
    getShopView,
    purchaseItem
};
