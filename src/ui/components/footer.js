const {
    COLORS,
    setFont
} = require("../renderer");

function drawFooter(ctx, options = {}) {
    const {
        hint = "Kategorie / Poprzedni / Kup / Nastepny",
        page = null,
        totalPages = null
    } = options;

    ctx.save();
    ctx.strokeStyle = "rgba(77, 255, 154, 0.24)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(70, 656);
    ctx.lineTo(1210, 656);
    ctx.stroke();

    setFont(ctx, 16, "700");
    ctx.fillStyle = COLORS.muted;
    ctx.fillText(String(hint).toUpperCase(), 74, 690);

    if (page && totalPages) {
        ctx.textAlign = "right";
        ctx.fillStyle = COLORS.amber;
        ctx.fillText(`STRONA ${page} / ${totalPages}`, 1206, 690);
        ctx.textAlign = "left";
    }
    ctx.restore();
}

module.exports = {
    drawFooter
};
