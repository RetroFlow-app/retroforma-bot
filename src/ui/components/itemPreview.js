const {
    COLORS,
    drawCenteredFittedText,
    fillRoundedRect,
    setFont,
    strokeRoundedRect
} = require("../renderer");
const { getRarityStyle } = require("./badges");
const { drawItemIcon } = require("./itemIcon");
const { drawPlayerBalance } = require("./playerPp");

function drawItemPreview(ctx, options = {}) {
    const {
        item = null,
        owned = false,
        playerPP = 0,
        x,
        y
    } = options;
    const width = 398;
    const height = 454;
    const rarity = getRarityStyle(item?.rarity);

    fillRoundedRect(ctx, x, y, width, height, 20, "rgba(7, 14, 13, 0.9)");
    strokeRoundedRect(ctx, x, y, width, height, 20, "rgba(231, 248, 238, 0.14)", 1.1);
    strokeRoundedRect(ctx, x + 6, y + 6, width - 12, height - 12, 15, `${rarity.accent}70`, 1.7);

    setFont(ctx, 15, "800");
    ctx.fillStyle = rarity.accent;
    ctx.fillText("PODGLAD ITEMU", x + 26, y + 38);

    drawItemIcon(ctx, {
        accent: rarity.accent,
        item,
        imageScale: 0.8,
        size: 300,
        x: x + 49,
        y: y + 52
    });

    if (item) {
        setFont(ctx, 24, "800");
        ctx.fillStyle = COLORS.text;
        drawCenteredFittedText(ctx, item.name || "Przedmiot", x + width / 2, y + 354, width - 56);

        setFont(ctx, 13, "800");
        ctx.fillStyle = owned ? COLORS.blue : rarity.accent;
        drawCenteredFittedText(ctx, owned ? "POSIADASZ" : rarity.label.toUpperCase(), x + width / 2, y + 378, width - 92);
    } else {
        setFont(ctx, 26, "800");
        ctx.fillStyle = COLORS.text;
        drawCenteredFittedText(ctx, "BRAK OFERTY", x + width / 2, y + 354, width - 80);
    }

    drawPlayerBalance(ctx, {
        pp: playerPP,
        width: 224,
        x: x + 87,
        y: y + 394
    });
}

module.exports = {
    drawItemPreview
};
