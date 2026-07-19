const {
    COLORS,
    drawFittedText,
    setFont
} = require("../renderer");
const { drawPriceBadge, drawRarityBadge } = require("./badges");
const { drawCategoryBadge } = require("./category");
const { drawDescription } = require("./description");
const { drawPanel } = require("./panel");
const { drawStatusPanel } = require("./status");

function drawItemDetailsPanel(ctx, options = {}) {
    const {
        category,
        item = null,
        notice = null,
        owned = false,
        playerPP = 0,
        x,
        y
    } = options;

    drawPanel(ctx, {
        accent: COLORS.green,
        height: 294,
        title: "Dane przedmiotu",
        width: 760,
        x,
        y
    });

    if (!item) {
        setFont(ctx, 42, "800");
        ctx.fillStyle = COLORS.text;
        ctx.fillText("BRAK PRZEDMIOTU", x + 40, y + 98);
        setFont(ctx, 18, "400");
        ctx.fillStyle = COLORS.muted;
        ctx.fillText("Ta kategoria chwilowo nie ma aktywnej oferty.", x + 40, y + 132);
        return;
    }

    const safePrice = Number(item.price);
    const priceText = Number.isSafeInteger(safePrice) && safePrice >= 0
        ? `${safePrice} PP`
        : "N/D";

    setFont(ctx, 40, "800");
    ctx.fillStyle = COLORS.text;
    drawFittedText(ctx, item.name || "Przedmiot", x + 40, y + 86, 660);

    drawCategoryBadge(ctx, {
        category,
        width: 214,
        x: x + 40,
        y: y + 106
    });

    drawPriceBadge(ctx, {
        value: priceText,
        width: 172,
        x: x + 276,
        y: y + 106
    });

    drawRarityBadge(ctx, {
        value: item.rarity || "Podstawowa",
        width: 214,
        x: x + 470,
        y: y + 106
    });

    setFont(ctx, 13, "800");
    ctx.fillStyle = COLORS.muted;
    ctx.fillText("OPIS", x + 40, y + 190);
    drawDescription(ctx, {
        maxLines: 3,
        text: item.description,
        width: 410,
        x: x + 40,
        y: y + 218
    });

    drawStatusPanel(ctx, {
        canAfford: Number(playerPP) >= Number(item.price),
        item,
        notice,
        owned,
        playerPP,
        width: 236,
        x: x + 488,
        y: y + 188
    });
}

module.exports = {
    drawItemDetailsPanel
};
