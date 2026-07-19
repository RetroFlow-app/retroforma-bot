const {
    COLORS,
    createLinearGradient,
    drawFittedText,
    fillRoundedRect,
    setFont,
    strokeRoundedRect
} = require("../renderer");

function drawAppHeader(ctx, options = {}) {
    const {
        playerPP = 0,
        subtitle = "KATALOG NAGROD ZA PP",
        title = "RETROFORMA SKLEP"
    } = options;

    const headerGradient = createLinearGradient(ctx, 42, 26, 1238, 106, [
        { offset: 0, color: "rgba(20, 32, 28, 0.94)" },
        { offset: 0.5, color: "rgba(7, 17, 15, 0.86)" },
        { offset: 1, color: "rgba(24, 21, 10, 0.9)" }
    ]);

    fillRoundedRect(ctx, 42, 24, 1196, 100, 20, headerGradient);
    strokeRoundedRect(ctx, 42, 24, 1196, 100, 20, "rgba(77, 255, 154, 0.34)", 1.6);
    strokeRoundedRect(ctx, 48, 30, 1184, 88, 16, "rgba(255, 200, 87, 0.16)", 1);

    setFont(ctx, 18, "700");
    ctx.fillStyle = COLORS.amber;
    ctx.fillText("RETROFORMA", 78, 58);

    setFont(ctx, 46, "800");
    ctx.fillStyle = COLORS.text;
    ctx.shadowColor = "rgba(77, 255, 154, 0.34)";
    ctx.shadowBlur = 14;
    drawFittedText(ctx, title, 78, 101, 570);
    ctx.shadowBlur = 0;

    setFont(ctx, 16, "700");
    ctx.fillStyle = COLORS.muted;
    drawFittedText(ctx, subtitle, 646, 88, 300);

    fillRoundedRect(ctx, 1000, 48, 196, 52, 16, "rgba(255, 200, 87, 0.13)");
    strokeRoundedRect(ctx, 1000, 48, 196, 52, 16, "rgba(255, 200, 87, 0.5)", 1.4);
    setFont(ctx, 13, "700");
    ctx.fillStyle = COLORS.muted;
    ctx.fillText("TWOJE PP", 1022, 68);
    setFont(ctx, 25, "800");
    ctx.fillStyle = COLORS.amber;
    drawFittedText(ctx, `${Number(playerPP) || 0}`, 1022, 95, 150);
}

module.exports = {
    drawAppHeader
};
