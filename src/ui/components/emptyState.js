const {
    COLORS,
    drawCenteredFittedText,
    setFont
} = require("../renderer");
const { drawPanel } = require("./panel");

function drawEmptyState(ctx, options = {}) {
    const {
        message = "Ta kategoria chwilowo nie ma aktywnej oferty.",
        title = "BRAK PRZEDMIOTU",
        x,
        y
    } = options;

    drawPanel(ctx, {
        accent: COLORS.blue,
        height: 294,
        title: "Oferta",
        width: 760,
        x,
        y
    });

    setFont(ctx, 44, "800");
    ctx.fillStyle = COLORS.text;
    drawCenteredFittedText(ctx, title, x + 380, y + 128, 620);

    setFont(ctx, 18, "500");
    ctx.fillStyle = COLORS.muted;
    drawCenteredFittedText(ctx, message, x + 380, y + 168, 620);
}

module.exports = {
    drawEmptyState
};
