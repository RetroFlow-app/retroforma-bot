const {
    UI_HEIGHT,
    UI_WIDTH,
    drawBackground,
    renderPng
} = require("../renderer");
const { drawEmptyState } = require("../components/emptyState");
const { drawFooter } = require("../components/footer");
const { drawAppHeader } = require("../components/header");
const { drawItemDetailsPanel } = require("../components/itemDetailsPanel");
const { drawItemPreview } = require("../components/itemPreview");
const { drawItemStrip } = require("../components/itemStrip");
const { drawPagination } = require("../components/pagination");

function getSafeNumber(value, fallback = 0) {
    const number = Number(value);

    return Number.isFinite(number) ? number : fallback;
}

function normalizePrice(value) {
    const number = Number(value);

    return Number.isFinite(number) ? number : value;
}

function normalizeItem(item, fallbackPage = 1) {
    if (!item) {
        return null;
    }

    return {
        categoryName: item.categoryName || "Wszystkie",
        code: item.code || null,
        description: item.description || "Brak opisu.",
        name: item.name || "Przedmiot",
        owned: Boolean(item.owned),
        page: Math.max(1, getSafeNumber(item.page, fallbackPage)),
        price: normalizePrice(item.price),
        rarity: item.rarity || "Podstawowa",
        selected: Boolean(item.selected)
    };
}

function normalizeCatalogItems(items = [], currentItem = null) {
    const normalizedItems = Array.isArray(items)
        ? items.map((item, index) => normalizeItem(item, index + 1)).filter(Boolean)
        : [];

    if (currentItem && normalizedItems.length === 0) {
        normalizedItems.push({
            ...currentItem,
            selected: true
        });
    }

    return normalizedItems.slice(0, 4).map((item) => ({
        ...item,
        selected: Boolean(item.selected || (currentItem?.code && item.code === currentItem.code))
    }));
}

function normalizeShopScreenData(data = {}) {
    const item = normalizeItem(data.item, data.page);
    const playerPP = Math.max(0, getSafeNumber(data.playerPP, 0));
    const page = Math.max(1, getSafeNumber(data.page, 1));
    const totalPages = Math.max(1, getSafeNumber(data.totalPages, 1));
    const totalItems = Math.max(0, getSafeNumber(data.totalItems, data.catalogItems?.length || (item ? 1 : 0)));
    const owned = Boolean(data.owned || item?.owned);

    if (item) {
        item.owned = owned;
        item.selected = true;
        item.page = page;
    }

    return {
        canAfford: item
            ? Number.isSafeInteger(Number(item.price)) && Number(item.price) >= 0 && playerPP >= Number(item.price)
            : false,
        catalogItems: normalizeCatalogItems(data.catalogItems, item),
        category: data.category || item?.categoryName || "Wszystkie",
        item,
        notice: data.notice || null,
        owned,
        page,
        playerPP,
        totalItems,
        totalPages
    };
}

function renderShopScreen(data = {}) {
    const normalizedData = normalizeShopScreenData(data);

    return renderPng((ctx) => {
        drawBackground(ctx, UI_WIDTH, UI_HEIGHT);
        drawAppHeader(ctx, {
            playerPP: normalizedData.playerPP
        });

        drawItemPreview(ctx, {
            item: normalizedData.item,
            owned: normalizedData.owned,
            playerPP: normalizedData.playerPP,
            x: 42,
            y: 146
        });

        if (normalizedData.item) {
            drawItemDetailsPanel(ctx, {
                category: normalizedData.category,
                item: normalizedData.item,
                notice: normalizedData.notice,
                owned: normalizedData.owned,
                playerPP: normalizedData.playerPP,
                x: 478,
                y: 146
            });
        } else {
            drawEmptyState(ctx, {
                x: 478,
                y: 146
            });
        }

        drawItemStrip(ctx, {
            items: normalizedData.catalogItems,
            x: 478,
            y: 464
        });

        drawPagination(ctx, {
            page: normalizedData.page,
            totalItems: normalizedData.totalItems,
            totalPages: normalizedData.totalPages,
            x: 1006,
            y: 640
        });

        drawFooter(ctx, {
            hint: "Kategorie / Poprzedni / Kup / Nastepny"
        });
    }, {
        height: UI_HEIGHT,
        width: UI_WIDTH
    });
}

module.exports = {
    normalizeCatalogItems,
    normalizeShopScreenData,
    renderShopScreen
};
