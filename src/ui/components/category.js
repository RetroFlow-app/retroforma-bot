const {
    COLORS,
    drawFittedText,
    fillRoundedRect,
    setFont,
    strokeRoundedRect
} = require("../renderer");

function drawCategoryBadge(ctx, options) {
    const {
        category = "Wszystkie",
        width = 220,
        x,
        y
    } = options;

    fillRoundedRect(ctx, x, y, width, 44, 14, COLORS.greenSoft);
    strokeRoundedRect(ctx, x, y, width, 44, 14, "rgba(77, 255, 154, 0.48)", 1.2);
    setFont(ctx, 12, "700");
    ctx.fillStyle = COLORS.muted;
    ctx.fillText("KATEGORIA", x + 16, y + 18);
    setFont(ctx, 18, "800");
    ctx.fillStyle = COLORS.green;
    drawFittedText(ctx, String(category).toUpperCase(), x + 16, y + 38, width - 30);
}

module.exports = {
    drawCategoryBadge
};
