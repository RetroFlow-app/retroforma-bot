const {
    COLORS,
    setFont,
    wrapText
} = require("../renderer");

function drawDescription(ctx, options) {
    const {
        maxLines = 6,
        text,
        width,
        x,
        y
    } = options;

    setFont(ctx, 17, "400");
    ctx.fillStyle = COLORS.text;

    const lines = wrapText(ctx, text || "Brak opisu.", width, maxLines);

    lines.forEach((line, index) => {
        ctx.fillText(line, x, y + index * 28);
    });
}

module.exports = {
    drawDescription
};
