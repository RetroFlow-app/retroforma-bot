const {
    COLORS,
    drawFittedText,
    fillRoundedRect,
    setFont,
    strokeRoundedRect
} = require("../renderer");
const { getRarityStyle } = require("./badges");
const { drawItemIcon } = require("./itemIcon");

function drawOwnedMarker(ctx, x, y) {
    ctx.save();
    ctx.strokeStyle = COLORS.blue;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(x, y + 8);
    ctx.lineTo(x + 7, y + 16);
    ctx.lineTo(x + 22, y);
    ctx.stroke();
    ctx.restore();
}

function drawMiniItemCard(ctx, item, options = {}) {
    const {
        height,
        selected = false,
        width,
        x,
        y
    } = options;
    const rarity = getRarityStyle(item?.rarity);
    const accent = selected ? rarity.accent : "rgba(231, 248, 238, 0.22)";
    const fill = selected ? `${rarity.accent}16` : "rgba(255, 255, 255, 0.038)";
    const safePrice = Number(item?.price);
    const priceText = Number.isSafeInteger(safePrice) && safePrice >= 0
        ? `${safePrice} PP`
        : "N/D";

    fillRoundedRect(ctx, x, y, width, height, 16, fill);
    strokeRoundedRect(ctx, x, y, width, height, 16, accent, selected ? 2 : 1);

    if (selected) {
        ctx.save();
        ctx.shadowColor = `${rarity.accent}66`;
        ctx.shadowBlur = 14;
        strokeRoundedRect(ctx, x + 4, y + 4, width - 8, height - 8, 12, `${rarity.accent}88`, 1);
        ctx.restore();
    }

    drawItemIcon(ctx, {
        accent: rarity.accent,
        item,
        size: 56,
        x: x + 14,
        y: y + 18
    });

    setFont(ctx, 14, "800");
    ctx.fillStyle = COLORS.text;
    drawFittedText(ctx, item?.name || "Pusty slot", x + 82, y + 34, width - 96);

    setFont(ctx, 12, "700");
    ctx.fillStyle = rarity.accent;
    drawFittedText(ctx, rarity.label.toUpperCase(), x + 82, y + 56, width - 110);

    setFont(ctx, 16, "800");
    ctx.fillStyle = COLORS.amber;
    drawFittedText(ctx, priceText, x + 82, y + 84, width - 96);

    if (item?.owned) {
        drawOwnedMarker(ctx, x + width - 42, y + 20);
    }
}

function drawItemStrip(ctx, options = {}) {
    const {
        items = [],
        x,
        y
    } = options;
    const width = 760;
    const height = 166;
    const gap = 14;
    const cardWidth = (width - 48 - gap * 3) / 4;

    fillRoundedRect(ctx, x, y, width, height, 18, "rgba(7, 14, 13, 0.86)");
    strokeRoundedRect(ctx, x, y, width, height, 18, "rgba(231, 248, 238, 0.14)", 1);
    strokeRoundedRect(ctx, x + 5, y + 5, width - 10, height - 10, 13, "rgba(255, 200, 87, 0.24)", 1.2);

    setFont(ctx, 15, "800");
    ctx.fillStyle = COLORS.amber;
    ctx.fillText("KATALOG KATEGORII", x + 24, y + 34);

    if (!items.length) {
        setFont(ctx, 18, "700");
        ctx.fillStyle = COLORS.muted;
        ctx.fillText("Brak aktywnych przedmiotow w tej kategorii.", x + 24, y + 96);
        return;
    }

    items.slice(0, 4).forEach((item, index) => {
        drawMiniItemCard(ctx, item, {
            height: 104,
            selected: Boolean(item.selected),
            width: cardWidth,
            x: x + 24 + index * (cardWidth + gap),
            y: y + 48
        });
    });
}

module.exports = {
    drawItemStrip
};
