const {
    COLORS,
    drawFittedText,
    fillRoundedRect,
    setFont,
    strokeRoundedRect
} = require("../renderer");

function drawPagination(ctx, options = {}) {
    const {
        page = 1,
        totalPages = 1,
        totalItems = 0,
        x,
        y
    } = options;

    fillRoundedRect(ctx, x, y, 210, 42, 14, "rgba(76, 201, 255, 0.1)");
    strokeRoundedRect(ctx, x, y, 210, 42, 14, "rgba(76, 201, 255, 0.34)", 1.1);

    setFont(ctx, 12, "700");
    ctx.fillStyle = COLORS.muted;
    ctx.fillText("STRONA", x + 16, y + 17);

    setFont(ctx, 18, "800");
    ctx.fillStyle = COLORS.blue;
    drawFittedText(ctx, `${page} / ${totalPages}`, x + 16, y + 36, 90);

    ctx.textAlign = "right";
    setFont(ctx, 12, "700");
    ctx.fillStyle = COLORS.muted;
    ctx.fillText("ITEMY", x + 190, y + 17);
    setFont(ctx, 18, "800");
    ctx.fillStyle = COLORS.text;
    ctx.fillText(String(totalItems), x + 190, y + 36);
    ctx.textAlign = "left";
}

module.exports = {
    drawPagination
};
