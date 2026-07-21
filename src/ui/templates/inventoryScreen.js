const {
    COLORS,
    UI_HEIGHT,
    UI_WIDTH,
    drawBackground,
    drawCenteredFittedText,
    drawFittedText,
    fillRoundedRect,
    renderPng,
    setFont,
    strokeRoundedRect
} = require("../renderer");
const { getRarityStyle } = require("../components/badges");
const { drawEmptyState } = require("../components/emptyState");
const { drawFooter } = require("../components/footer");
const { drawAppHeader } = require("../components/header");
const { drawItemIcon } = require("../components/itemIcon");
const { drawPagination } = require("../components/pagination");

const INVENTORY_SCREEN_PAGE_SIZE = 8;
const CATEGORY_ORDER = [
    "all",
    "motywy-profilu",
    "ramki",
    "gadzety",
    "odznaki"
];

const CATEGORY_LABELS = {
    all: "Wszystko",
    gadzety: "Gadzety",
    "motywy-profilu": "Motywy profilu",
    odznaki: "Odznaki",
    ramki: "Ramki"
};

function getSafeNumber(value, fallback = 0) {
    const number = Number(value);

    return Number.isFinite(number) ? number : fallback;
}

function normalizeCategory(category) {
    const normalizedCategory = String(category || "all").trim();

    return CATEGORY_LABELS[normalizedCategory] ? normalizedCategory : "all";
}

function normalizeInventoryItem(item, categoryId, categoryTitle) {
    return {
        categoryId,
        categoryTitle,
        code: item.code || item.id || item.name,
        equipped: Boolean(item.equipped),
        equipmentSlot: item.equipmentSlot || null,
        name: item.name || "Przedmiot",
        rarity: item.rarity || (item.type === "badge" ? "Legendarna" : "Podstawowa"),
        type: item.type || "shop_item"
    };
}

function flattenInventorySections(sections = [], selectedCategory = "all") {
    return sections.flatMap((section) => {
        if (selectedCategory !== "all" && section.id !== selectedCategory) {
            return [];
        }

        return (section.items || []).map((item) => normalizeInventoryItem(
            item,
            section.id,
            section.title || CATEGORY_LABELS[section.id] || section.id
        ));
    });
}

function normalizeInventoryScreenData(data = {}) {
    const category = normalizeCategory(data.category);
    const items = flattenInventorySections(data.sections, category);
    const totalItems = items.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / INVENTORY_SCREEN_PAGE_SIZE));
    const page = Math.min(
        Math.max(0, getSafeNumber(data.page, 0)),
        totalPages - 1
    );
    const visibleItems = items.slice(
        page * INVENTORY_SCREEN_PAGE_SIZE,
        page * INVENTORY_SCREEN_PAGE_SIZE + INVENTORY_SCREEN_PAGE_SIZE
    );

    return {
        badgesCount: Math.max(0, getSafeNumber(data.totalBadges, 0)),
        category,
        categoryName: CATEGORY_LABELS[category],
        items: visibleItems,
        page,
        playerPP: Math.max(0, getSafeNumber(data.playerPP, 0)),
        shopItemsCount: Math.max(0, getSafeNumber(data.totalShopItems, 0)),
        totalItems,
        totalPages
    };
}

function drawCategoryTabs(ctx, data) {
    const x = 42;
    const y = 140;
    const width = 1196;
    const height = 48;
    const gap = 10;
    const tabWidth = (width - gap * (CATEGORY_ORDER.length - 1)) / CATEGORY_ORDER.length;

    CATEGORY_ORDER.forEach((categoryId, index) => {
        const selected = categoryId === data.category;
        const tabX = x + index * (tabWidth + gap);
        const fill = selected ? "rgba(77, 255, 154, 0.16)" : "rgba(255, 255, 255, 0.04)";
        const line = selected ? "rgba(77, 255, 154, 0.72)" : "rgba(231, 248, 238, 0.14)";

        fillRoundedRect(ctx, tabX, y, tabWidth, height, 14, fill);
        strokeRoundedRect(ctx, tabX, y, tabWidth, height, 14, line, selected ? 1.8 : 1);
        setFont(ctx, 14, "800");
        ctx.fillStyle = selected ? COLORS.green : COLORS.muted;
        drawCenteredFittedText(ctx, CATEGORY_LABELS[categoryId].toUpperCase(), tabX + tabWidth / 2, y + 30, tabWidth - 20);
    });
}

function drawStatusPill(ctx, item, x, y, width, accent) {
    const equipped = Boolean(item.equipped);
    const label = equipped ? "WYPOSAZONY" : "POSIADASZ";
    const color = equipped ? COLORS.green : COLORS.blue;

    fillRoundedRect(ctx, x, y, width, 30, 12, equipped ? "rgba(77, 255, 154, 0.13)" : "rgba(76, 201, 255, 0.10)");
    strokeRoundedRect(ctx, x, y, width, 30, 12, `${color}70`, 1);

    ctx.save();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x + 17, y + 15, 5, 0, Math.PI * 2);
    ctx.fill();

    if (!equipped) {
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x + 11, y + 15);
        ctx.lineTo(x + 16, y + 20);
        ctx.lineTo(x + 24, y + 10);
        ctx.stroke();
    }
    ctx.restore();

    setFont(ctx, 12, "800");
    ctx.fillStyle = color;
    drawFittedText(ctx, label, x + 32, y + 20, width - 42);

    if (item.equipmentSlot && !equipped) {
        ctx.save();
        ctx.globalAlpha = 0.75;
        ctx.strokeStyle = `${accent}66`;
        ctx.beginPath();
        ctx.moveTo(x + width - 18, y + 9);
        ctx.lineTo(x + width - 10, y + 15);
        ctx.lineTo(x + width - 18, y + 21);
        ctx.stroke();
        ctx.restore();
    }
}

function drawInventoryCard(ctx, item, options = {}) {
    const {
        height,
        width,
        x,
        y
    } = options;
    const rarity = getRarityStyle(item.rarity);
    const isBadge = item.type === "badge";
    const accent = isBadge ? COLORS.amber : rarity.accent;
    const fill = ctx.createLinearGradient(x, y, x + width, y + height);

    fill.addColorStop(0, "rgba(9, 18, 16, 0.92)");
    fill.addColorStop(0.55, "rgba(7, 13, 12, 0.86)");
    fill.addColorStop(1, "rgba(16, 14, 8, 0.90)");

    ctx.save();
    ctx.shadowColor = item.equipped ? "rgba(77, 255, 154, 0.30)" : `${accent}22`;
    ctx.shadowBlur = item.equipped ? 18 : 8;
    fillRoundedRect(ctx, x, y, width, height, 18, fill);
    ctx.shadowBlur = 0;
    strokeRoundedRect(ctx, x, y, width, height, 18, item.equipped ? COLORS.green : `${accent}66`, item.equipped ? 2.2 : 1.2);
    strokeRoundedRect(ctx, x + 5, y + 5, width - 10, height - 10, 13, "rgba(255, 200, 87, 0.16)", 1);
    ctx.restore();

    drawItemIcon(ctx, {
        accent,
        assetType: isBadge ? "badge" : "item",
        imageScale: isBadge ? 0.82 : 0.76,
        item,
        size: 96,
        x: x + 16,
        y: y + 20
    });

    setFont(ctx, 16, "800");
    ctx.fillStyle = COLORS.text;
    drawFittedText(ctx, item.name, x + 128, y + 48, width - 148);

    setFont(ctx, 12, "800");
    ctx.fillStyle = accent;
    drawFittedText(ctx, isBadge ? "ODZNAKA" : rarity.label.toUpperCase(), x + 128, y + 72, width - 148);

    setFont(ctx, 11, "700");
    ctx.fillStyle = COLORS.muted;
    drawFittedText(ctx, item.categoryTitle, x + 128, y + 96, width - 148);

    drawStatusPill(ctx, item, x + 128, y + height - 48, width - 148, accent);
}

function drawInventoryGrid(ctx, data) {
    const startX = 42;
    const startY = 208;
    const cardWidth = 285;
    const cardHeight = 176;
    const gapX = 18;
    const gapY = 18;

    if (!data.items.length) {
        drawEmptyState(ctx, {
            message: "Nie posiadasz jeszcze zadnych przedmiotow w tej kategorii.",
            title: "PUSTA KOLEKCJA",
            x: 42,
            y: 208
        });
        return;
    }

    data.items.forEach((item, index) => {
        const column = index % 4;
        const row = Math.floor(index / 4);

        drawInventoryCard(ctx, item, {
            height: cardHeight,
            width: cardWidth,
            x: startX + column * (cardWidth + gapX),
            y: startY + row * (cardHeight + gapY)
        });
    });
}

function drawInventorySummary(ctx, data) {
    const x = 42;
    const y = 610;
    const width = 680;
    const height = 50;

    fillRoundedRect(ctx, x, y, width, height, 16, "rgba(7, 14, 13, 0.84)");
    strokeRoundedRect(ctx, x, y, width, height, 16, "rgba(231, 248, 238, 0.14)", 1);

    setFont(ctx, 12, "800");
    ctx.fillStyle = COLORS.muted;
    ctx.fillText("KOLEKCJA", x + 20, y + 21);
    setFont(ctx, 20, "800");
    ctx.fillStyle = COLORS.text;
    ctx.fillText(`${data.shopItemsCount} przedmiotow / ${data.badgesCount} odznak`, x + 20, y + 43);

    setFont(ctx, 12, "800");
    ctx.fillStyle = COLORS.muted;
    ctx.fillText("KATEGORIA", x + 360, y + 21);
    setFont(ctx, 20, "800");
    ctx.fillStyle = COLORS.green;
    drawFittedText(ctx, data.categoryName, x + 360, y + 43, 280);
}

function renderInventoryScreen(data = {}) {
    const normalizedData = normalizeInventoryScreenData(data);

    return renderPng((ctx) => {
        drawBackground(ctx, UI_WIDTH, UI_HEIGHT);
        drawAppHeader(ctx, {
            playerPP: normalizedData.playerPP,
            subtitle: "KOLEKCJA I WYPOSAZENIE",
            title: "RETROFORMA EKWIPUNEK"
        });

        drawCategoryTabs(ctx, normalizedData);
        drawInventoryGrid(ctx, normalizedData);
        drawInventorySummary(ctx, normalizedData);
        drawPagination(ctx, {
            page: normalizedData.page + 1,
            totalItems: normalizedData.totalItems,
            totalPages: normalizedData.totalPages,
            x: 1028,
            y: 614
        });
        drawFooter(ctx, {
            hint: "Kategorie / Wstecz / Dalej / Wyposaz motyw lub ramke"
        });
    }, {
        height: UI_HEIGHT,
        width: UI_WIDTH
    });
}

module.exports = {
    INVENTORY_SCREEN_PAGE_SIZE,
    normalizeInventoryScreenData,
    renderInventoryScreen
};
