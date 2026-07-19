const {
    COLORS,
    createLinearGradient,
    fillRoundedRect,
    setFont,
    strokeRoundedRect
} = require("../renderer");

function drawPanel(ctx, options) {
    const {
        accent = COLORS.green,
        height,
        title = null,
        width,
        x,
        y
    } = options;
    const fill = createLinearGradient(ctx, x, y, x + width, y + height, [
        { offset: 0, color: "rgba(12, 22, 20, 0.94)" },
        { offset: 0.55, color: "rgba(18, 27, 25, 0.92)" },
        { offset: 1, color: "rgba(7, 12, 11, 0.96)" }
    ]);

    fillRoundedRect(ctx, x, y, width, height, 18, fill);
    strokeRoundedRect(ctx, x, y, width, height, 18, "rgba(231, 248, 238, 0.16)", 1);
    strokeRoundedRect(ctx, x + 5, y + 5, width - 10, height - 10, 13, `${accent}55`, 1.4);

    ctx.save();
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = accent;
    ctx.fillRect(x + 18, y + 18, width - 36, 2);
    ctx.fillRect(x + 18, y + height - 20, width - 36, 1);
    ctx.restore();

    if (title) {
        setFont(ctx, 16, "700");
        ctx.fillStyle = accent;
        ctx.fillText(String(title).toUpperCase(), x + 28, y + 38);
    }
}

module.exports = {
    drawPanel
};
