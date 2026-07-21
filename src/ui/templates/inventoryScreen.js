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
    strokeRoundedRect,
    wrapText
} = require("../renderer");
const { getRarityStyle } = require("../components/badges");
const { drawFooter } = require("../components/footer");
const { drawAppHeader } = require("../components/header");
const { drawItemIcon } = require("../components/itemIcon");
const { drawPagination } = require("../components/pagination");

const INVENTORY_SCREEN_PAGE_SIZE = 4;
const CATEGORY_ORDER = [
    "all",
    "motywy-profilu",
    "ramki",
    "gadzety",
    "odznaki"
];

const CATEGORY_LABELS = {
    all: "Wszystko",
    gadzety: "Gadżety",
    "motywy-profilu": "Motywy",
    odznaki: "Odznaki",
    ramki: "Ramki"
};

const CATEGORY_TAB_LABELS = {
    all: "🎒 Wszystko",
    gadzety: "🧰 Gadżety",
    "motywy-profilu": "🎨 Motywy",
    odznaki: "🏅 Odznaki",
    ramki: "🖼 Ramki"
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
        description: item.description || "",
        equipped: Boolean(item.equipped),
        equipmentSlot: item.equipmentSlot || null,
        name: item.name || "Przedmiot",
        rarity: item.rarity || (item.type === "badge" ? "Legendarna" : "Podstawowa"),
        selected: Boolean(item.selected),
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

function getCategoryCounts(sections = []) {
    const counts = {
        all: 0
    };

    for (const categoryId of CATEGORY_ORDER) {
        if (categoryId !== "all") {
            counts[categoryId] = 0;
        }
    }

    for (const section of sections) {
        const count = Array.isArray(section.items) ? section.items.length : 0;

        if (Object.prototype.hasOwnProperty.call(counts, section.id)) {
            counts[section.id] = count;
        }

        counts.all += count;
    }

    return counts;
}

function normalizeInventoryScreenData(data = {}) {
    const category = normalizeCategory(data.category);
    const sections = Array.isArray(data.sections) ? data.sections : [];
    const categoryCounts = getCategoryCounts(sections);
    const items = flattenInventorySections(sections, category);
    const selectedItemCode = String(data.selectedItemCode || "").trim();
    const selectedItemIndex = selectedItemCode
        ? items.findIndex((item) => item.code === selectedItemCode)
        : -1;
    const totalItems = items.length;
    const totalOwnedCount = categoryCounts.all;
    const totalAvailableItems = Math.max(
        totalOwnedCount,
        getSafeNumber(data.totalAvailableItems, totalOwnedCount)
    );
    const collectionProgress = totalAvailableItems > 0
        ? Math.min(1, Math.max(0, totalOwnedCount / totalAvailableItems))
        : 0;
    const totalPages = Math.max(1, Math.ceil(totalItems / INVENTORY_SCREEN_PAGE_SIZE));
    const requestedPage = Math.min(
        Math.max(0, getSafeNumber(data.page, 0)),
        totalPages - 1
    );
    const page = selectedItemIndex >= 0
        ? Math.floor(selectedItemIndex / INVENTORY_SCREEN_PAGE_SIZE)
        : requestedPage;
    const visibleItems = items.slice(
        page * INVENTORY_SCREEN_PAGE_SIZE,
        page * INVENTORY_SCREEN_PAGE_SIZE + INVENTORY_SCREEN_PAGE_SIZE
    ).map((item, index) => ({
        ...item,
        selected: selectedItemIndex >= 0
            ? item.code === selectedItemCode
            : index === 0
    }));
    const selectedItem = visibleItems.find((item) => item.selected) || visibleItems[0] || null;

    return {
        badgesCount: Math.max(0, getSafeNumber(data.totalBadges, 0)),
        category,
        categoryCounts,
        categoryName: CATEGORY_LABELS[category],
        items: visibleItems,
        page,
        playerPP: Math.max(0, getSafeNumber(data.playerPP, 0)),
        selectedItem,
        selectedItemCode: selectedItem?.code || null,
        shopItemsCount: Math.max(0, getSafeNumber(data.totalShopItems, 0)),
        collectionProgress,
        totalAvailableItems,
        totalItems,
        totalOwnedCount,
        totalPages
    };
}

function getCategoryTabLabel(categoryId, count) {
    const baseLabel = (CATEGORY_TAB_LABELS[categoryId] || CATEGORY_LABELS[categoryId]).toUpperCase();

    if (!count) {
        return baseLabel;
    }

    return `${baseLabel} (${count})`;
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
        const fill = selected ? "rgba(77, 255, 154, 0.17)" : "rgba(255, 255, 255, 0.04)";
        const line = selected ? "rgba(77, 255, 154, 0.72)" : "rgba(231, 248, 238, 0.14)";
        const label = getCategoryTabLabel(categoryId, data.categoryCounts[categoryId]);

        fillRoundedRect(ctx, tabX, y, tabWidth, height, 14, fill);
        strokeRoundedRect(ctx, tabX, y, tabWidth, height, 14, line, selected ? 1.8 : 1);
        setFont(ctx, 13, "800");
        ctx.fillStyle = selected ? COLORS.green : COLORS.muted;
        drawCenteredFittedText(ctx, label, tabX + tabWidth / 2, y + 30, tabWidth - 20);
    });
}

function drawCheckMark(ctx, x, y, color) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(x, y + 6);
    ctx.lineTo(x + 6, y + 12);
    ctx.lineTo(x + 18, y);
    ctx.stroke();
    ctx.restore();
}

function getStatusView(item) {
    if (item.equipped) {
        return {
            accessibleLabel: "🟢 WYPOSAŻONY",
            color: COLORS.green,
            label: "WYPOSAŻONY",
            mode: "dot"
        };
    }

    if (item.type === "badge") {
        return {
            accessibleLabel: "✓ ZDOBYTA",
            color: COLORS.amber,
            label: "ZDOBYTA",
            mode: "check"
        };
    }

    return {
        accessibleLabel: "✓ W KOLEKCJI",
        color: COLORS.blue,
        label: "W KOLEKCJI",
        mode: "check"
    };
}

function drawStatusPill(ctx, item, x, y, width) {
    const status = getStatusView(item);

    fillRoundedRect(ctx, x, y, width, 32, 12, `${status.color}18`);
    strokeRoundedRect(ctx, x, y, width, 32, 12, `${status.color}70`, 1);

    if (status.mode === "dot") {
        ctx.save();
        ctx.fillStyle = status.color;
        ctx.beginPath();
        ctx.arc(x + 17, y + 16, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    } else {
        drawCheckMark(ctx, x + 9, y + 9, status.color);
    }

    setFont(ctx, 12, "800");
    ctx.fillStyle = status.color;
    drawFittedText(ctx, status.label, x + 34, y + 21, width - 44);
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

    fill.addColorStop(0, "rgba(9, 18, 16, 0.94)");
    fill.addColorStop(0.58, "rgba(7, 13, 12, 0.88)");
    fill.addColorStop(1, "rgba(16, 14, 8, 0.92)");

    ctx.save();
    ctx.shadowColor = item.equipped ? "rgba(77, 255, 154, 0.30)" : `${accent}22`;
    ctx.shadowBlur = item.selected ? 18 : 10;
    fillRoundedRect(ctx, x, y, width, height, 20, fill);
    ctx.shadowBlur = 0;
    strokeRoundedRect(ctx, x, y, width, height, 20, item.equipped ? COLORS.green : `${accent}68`, item.selected ? 2.1 : 1.2);
    strokeRoundedRect(ctx, x + 5, y + 5, width - 10, height - 10, 14, item.selected ? `${accent}44` : "rgba(255, 200, 87, 0.15)", 1);
    ctx.restore();

    drawItemIcon(ctx, {
        accent,
        assetType: isBadge ? "badge" : "item",
        imageScale: isBadge ? 0.84 : 0.8,
        item,
        size: 126,
        x: x + 16,
        y: y + 24
    });

    setFont(ctx, 19, "800");
    ctx.fillStyle = COLORS.text;
    drawFittedText(ctx, item.name, x + 158, y + 50, width - 180);

    if (isBadge) {
        setFont(ctx, 13, "600");
        ctx.fillStyle = COLORS.muted;
        wrapText(ctx, item.description || "Zdobyta odznaka Poligonu.", width - 184, 2)
            .forEach((line, index) => {
                ctx.fillText(line, x + 158, y + 78 + index * 18);
            });
    } else {
        setFont(ctx, 13, "800");
        ctx.fillStyle = accent;
        drawFittedText(ctx, rarity.label.toUpperCase(), x + 158, y + 76, width - 180);

        setFont(ctx, 12, "700");
        ctx.fillStyle = COLORS.muted;
        drawFittedText(ctx, item.categoryTitle, x + 158, y + 100, width - 180);
    }

    drawStatusPill(ctx, item, x + 158, y + height - 46, width - 180);

    if (item.equipped) {
        fillRoundedRect(ctx, x + width - 92, y + 12, 76, 22, 8, "rgba(77, 255, 154, 0.18)");
        strokeRoundedRect(ctx, x + width - 92, y + 12, 76, 22, 8, "rgba(77, 255, 154, 0.62)", 1);
        setFont(ctx, 10, "800");
        ctx.fillStyle = COLORS.green;
        drawCenteredFittedText(ctx, "AKTYWNE", x + width - 54, y + 27, 62);
    }
}

function drawPackageIllustration(ctx, centerX, centerY, size) {
    const half = size / 2;
    const boxX = centerX - half;
    const boxY = centerY - half * 0.58;
    const boxWidth = size;
    const boxHeight = size * 0.74;

    ctx.save();
    ctx.shadowColor = "rgba(77, 255, 154, 0.20)";
    ctx.shadowBlur = 28;

    fillRoundedRect(ctx, boxX, boxY, boxWidth, boxHeight, 18, "rgba(8, 18, 15, 0.92)");
    strokeRoundedRect(ctx, boxX, boxY, boxWidth, boxHeight, 18, "rgba(77, 255, 154, 0.58)", 2);
    strokeRoundedRect(ctx, boxX + 10, boxY + 10, boxWidth - 20, boxHeight - 20, 12, "rgba(255, 200, 87, 0.24)", 1.2);

    ctx.shadowBlur = 0;
    ctx.strokeStyle = "rgba(255, 200, 87, 0.62)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(boxX + boxWidth * 0.5, boxY);
    ctx.lineTo(boxX + boxWidth * 0.5, boxY + boxHeight);
    ctx.moveTo(boxX, boxY + boxHeight * 0.32);
    ctx.lineTo(boxX + boxWidth, boxY + boxHeight * 0.32);
    ctx.stroke();

    ctx.fillStyle = "rgba(76, 201, 255, 0.12)";
    ctx.fillRect(boxX + boxWidth * 0.16, boxY + boxHeight * 0.48, boxWidth * 0.68, boxHeight * 0.16);
    ctx.restore();
}

function drawInventoryEmptyState(ctx, data) {
    const x = 42;
    const y = 208;
    const width = 1196;
    const height = 382;
    const panelGradient = ctx.createLinearGradient(x, y, x + width, y + height);

    panelGradient.addColorStop(0, "rgba(7, 14, 13, 0.92)");
    panelGradient.addColorStop(0.58, "rgba(10, 20, 17, 0.86)");
    panelGradient.addColorStop(1, "rgba(19, 16, 8, 0.90)");

    fillRoundedRect(ctx, x, y, width, height, 24, panelGradient);
    strokeRoundedRect(ctx, x, y, width, height, 24, "rgba(77, 255, 154, 0.24)", 1.4);
    strokeRoundedRect(ctx, x + 6, y + 6, width - 12, height - 12, 18, "rgba(255, 200, 87, 0.18)", 1);

    drawPackageIllustration(ctx, x + 250, y + 190, 148);

    setFont(ctx, 44, "800");
    ctx.fillStyle = COLORS.text;
    ctx.fillText("PUSTA KOLEKCJA", x + 430, y + 154);

    setFont(ctx, 19, "600");
    ctx.fillStyle = COLORS.muted;
    ctx.fillText("Nie posiadasz jeszcze przedmiotów w tej kategorii.", x + 432, y + 196);
    ctx.fillText("Odwiedź /sklep, aby odblokować nowe elementy.", x + 432, y + 226);

    setFont(ctx, 13, "800");
    ctx.fillStyle = COLORS.green;
    ctx.fillText(`KATEGORIA: ${data.categoryName.toUpperCase()}`, x + 432, y + 274);
}

function drawInventoryGrid(ctx, data) {
    const startX = 42;
    const startY = 208;
    const cardWidth = 368;
    const cardHeight = 180;
    const gapX = 18;
    const gapY = 18;

    if (!data.items.length) {
        drawInventoryEmptyState(ctx, data);
        return;
    }

    data.items.forEach((item, index) => {
        const column = index % 2;
        const row = Math.floor(index / 2);

        drawInventoryCard(ctx, item, {
            height: cardHeight,
            width: cardWidth,
            x: startX + column * (cardWidth + gapX),
            y: startY + row * (cardHeight + gapY)
        });
    });
}

function getDetailActionView(item) {
    let label = "ELEMENT KOLEKCJONERSKI";
    let accessibleLabel = "📦 Element kolekcjonerski";
    let color = COLORS.blue;

    if (item.equipmentSlot && item.equipped) {
        label = "WYPOSAŻONY";
        accessibleLabel = "🟢 WYPOSAŻONY";
        color = COLORS.green;
    } else if (item.equipmentSlot) {
        label = "✓ WYPOSAŻ";
        accessibleLabel = "✅ WYPOSAŻ";
        color = COLORS.green;
    } else if (item.type === "badge") {
        label = "ZDOBYTA ODZNAKA";
        accessibleLabel = "🏅 Zdobyta odznaka";
        color = COLORS.amber;
    }

    return {
        accessibleLabel,
        color,
        label
    };
}

function drawDetailAction(ctx, item, x, y, width) {
    const action = getDetailActionView(item);

    fillRoundedRect(ctx, x, y, width, 46, 16, `${action.color}16`);
    strokeRoundedRect(ctx, x, y, width, 46, 16, `${action.color}70`, 1.3);

    setFont(ctx, 16, "800");
    ctx.fillStyle = action.color;
    drawCenteredFittedText(ctx, action.label, x + width / 2, y + 29, width - 28);

    return action.accessibleLabel;
}

function getInventoryInstruction(data) {
    const item = data.selectedItem;

    if ((item && !item.equipmentSlot) || data.category === "gadzety" || data.category === "odznaki") {
        return "Wybierz przedmiot z listy, aby zobaczyć jego szczegóły.";
    }

    return "Wybierz przedmiot z listy, aby zobaczyć szczegóły i go wyposażyć.";
}

function drawDetailInstruction(ctx, text, x, y, width) {
    setFont(ctx, 10, "700");
    ctx.fillStyle = COLORS.muted;
    wrapText(ctx, text, width, 2).forEach((line, index) => {
        drawFittedText(ctx, line, x, y + index * 13, width);
    });
}

function drawDetailPanel(ctx, data) {
    const item = data.selectedItem;
    const x = 812;
    const y = 208;
    const width = 426;
    const height = 382;

    if (!item) {
        return;
    }

    const isBadge = item.type === "badge";
    const rarity = getRarityStyle(item.rarity);
    const accent = isBadge ? COLORS.amber : rarity.accent;
    const panelGradient = ctx.createLinearGradient(x, y, x + width, y + height);

    panelGradient.addColorStop(0, "rgba(8, 18, 15, 0.94)");
    panelGradient.addColorStop(0.62, "rgba(7, 13, 12, 0.88)");
    panelGradient.addColorStop(1, "rgba(16, 14, 8, 0.92)");

    fillRoundedRect(ctx, x, y, width, height, 24, panelGradient);
    strokeRoundedRect(ctx, x, y, width, height, 24, `${accent}78`, 1.7);
    strokeRoundedRect(ctx, x + 6, y + 6, width - 12, height - 12, 18, "rgba(255, 200, 87, 0.18)", 1);

    setFont(ctx, 13, "800");
    ctx.fillStyle = COLORS.muted;
    ctx.fillText("PODGLĄD ELEMENTU", x + 24, y + 34);

    drawItemIcon(ctx, {
        accent,
        assetType: isBadge ? "badge" : "item",
        imageScale: isBadge ? 0.84 : 0.82,
        item,
        size: 184,
        x: x + 14,
        y: y + 54
    });

    setFont(ctx, 26, "800");
    ctx.fillStyle = COLORS.text;
    drawFittedText(ctx, item.name, x + 202, y + 96, width - 232);

    setFont(ctx, 14, "800");
    ctx.fillStyle = accent;
    drawFittedText(ctx, isBadge ? "ZDOBYCIE" : rarity.label.toUpperCase(), x + 202, y + 124, width - 232);

    setFont(ctx, 14, "600");
    ctx.fillStyle = COLORS.muted;
    const description = item.description || (isBadge
        ? "Zdobyta odznaka Poligonu."
        : "Element kolekcji RetroForma.");
    wrapText(ctx, description, width - 228, 5)
        .forEach((line, index) => {
            ctx.fillText(line, x + 202, y + 158 + index * 20);
        });

    drawStatusPill(ctx, item, x + 24, y + 236, width - 48);
    drawDetailAction(ctx, item, x + 24, y + 288, width - 48);
    drawDetailInstruction(ctx, getInventoryInstruction(data), x + 28, y + 350, width - 56);
}

function drawCollectionProgress(ctx, x, y, width, progress) {
    const height = 7;
    const safeProgress = Math.min(1, Math.max(0, Number(progress) || 0));

    fillRoundedRect(ctx, x, y, width, height, 4, "rgba(231, 248, 238, 0.10)");
    fillRoundedRect(ctx, x, y, width * safeProgress, height, 4, "rgba(77, 255, 154, 0.72)");
    strokeRoundedRect(ctx, x, y, width, height, 4, "rgba(77, 255, 154, 0.28)", 1);
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
    ctx.fillText(`${data.totalOwnedCount} / ${data.totalAvailableItems}`, x + 20, y + 43);
    drawCollectionProgress(ctx, x + 96, y + 36, 82, data.collectionProgress);

    setFont(ctx, 12, "800");
    ctx.fillStyle = COLORS.muted;
    ctx.fillText("POSIADANE", x + 204, y + 21);
    setFont(ctx, 20, "800");
    ctx.fillStyle = COLORS.blue;
    ctx.fillText(`${data.shopItemsCount} przedm.`, x + 204, y + 43);

    setFont(ctx, 12, "800");
    ctx.fillStyle = COLORS.muted;
    ctx.fillText("KATEGORIA", x + 424, y + 21);
    setFont(ctx, 20, "800");
    ctx.fillStyle = COLORS.green;
    drawFittedText(ctx, data.categoryName, x + 424, y + 43, 220);
}

// Zbiera teksty przekazywane do Canvas, aby testy pilnowały polskich znaków przed rasteryzacją.
function collectInventoryScreenText(data = {}) {
    const normalizedData = normalizeInventoryScreenData(data);
    const texts = [
        "RETROFORMA EKWIPUNEK",
        "KOLEKCJA I WYPOSAŻENIE",
        "KOLEKCJA",
        `${normalizedData.totalOwnedCount} / ${normalizedData.totalAvailableItems}`,
        "POSIADANE",
        `${normalizedData.shopItemsCount} przedm.`,
        "KATEGORIA",
        normalizedData.categoryName,
        "PUSTA KOLEKCJA",
        "Nie posiadasz jeszcze przedmiotów w tej kategorii.",
        "Odwiedź /sklep, aby odblokować nowe elementy."
    ];

    for (const categoryId of CATEGORY_ORDER) {
        texts.push(getCategoryTabLabel(categoryId, normalizedData.categoryCounts[categoryId]));
    }

    for (const item of normalizedData.items) {
        const rarity = getRarityStyle(item.rarity);
        const status = getStatusView(item);

        texts.push(
            item.name,
            item.description,
            item.categoryTitle,
            rarity.label,
            status.accessibleLabel,
            item.equipped ? "AKTYWNE" : ""
        );
    }

    if (normalizedData.selectedItem) {
        const selectedItem = normalizedData.selectedItem;
        const selectedRarity = getRarityStyle(selectedItem.rarity);
        const selectedStatus = getStatusView(selectedItem);
        const selectedAction = getDetailActionView(selectedItem);

        texts.push(
            "SZCZEGÓŁY",
            selectedItem.name,
            selectedItem.description,
            selectedRarity.label,
            selectedStatus.accessibleLabel,
            selectedAction.accessibleLabel,
            "📦 Element kolekcjonerski",
            "🏅 Zdobyta odznaka",
            getInventoryInstruction(normalizedData)
        );
    }

    return texts
        .filter((text) => text !== null && text !== undefined && text !== "")
        .map((text) => String(text));
}

function renderInventoryScreen(data = {}) {
    const normalizedData = normalizeInventoryScreenData(data);

    return renderPng((ctx) => {
        drawBackground(ctx, UI_WIDTH, UI_HEIGHT);
        drawAppHeader(ctx, {
            playerPP: normalizedData.playerPP,
            subtitle: "KOLEKCJA I WYPOSAŻENIE",
            title: "RETROFORMA EKWIPUNEK",
            titleMaxWidth: 760,
            titleSize: 36
        });

        drawCategoryTabs(ctx, normalizedData);
        drawInventoryGrid(ctx, normalizedData);
        drawDetailPanel(ctx, normalizedData);
        drawInventorySummary(ctx, normalizedData);
        drawPagination(ctx, {
            page: normalizedData.page + 1,
            totalItems: normalizedData.totalItems,
            totalPages: normalizedData.totalPages,
            x: 1028,
            y: 614
        });
        drawFooter(ctx, {
            hint: getInventoryInstruction(normalizedData)
        });
    }, {
        height: UI_HEIGHT,
        width: UI_WIDTH
    });
}

module.exports = {
    collectInventoryScreenText,
    INVENTORY_SCREEN_PAGE_SIZE,
    normalizeInventoryScreenData,
    renderInventoryScreen
};
