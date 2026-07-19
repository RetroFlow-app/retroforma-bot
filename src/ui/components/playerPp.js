const {
    COLORS,
    drawFittedText,
    fillRoundedRect,
    setFont,
    strokeRoundedRect
} = require("../renderer");

function drawPlayerBalance(ctx, options) {
    const {
        pp = 0,
        width = 210,
        x,
        y
    } = options;

    fillRoundedRect(ctx, x, y, width, 76, 18, "rgba(255, 200, 87, 0.12)");
    strokeRoundedRect(ctx, x, y, width, 76, 18, "rgba(255, 200, 87, 0.5)", 1.4);
    setFont(ctx, 14, "700");
    ctx.fillStyle = COLORS.muted;
    ctx.fillText("PUNKTY POLIGONU", x + 20, y + 26);
    setFont(ctx, 30, "800");
    ctx.fillStyle = COLORS.amber;
    drawFittedText(ctx, `${Number(pp) || 0} PP`, x + 20, y + 58, width - 40);
}

module.exports = {
    drawPlayerBalance
};
