const {
    COLORS,
    fillRoundedRect,
    setFont,
    strokeRoundedRect
} = require("../renderer");

const RARITY_STYLES = {
    "podstawowa": {
        accent: COLORS.neutral,
        label: "Podstawowa",
        tier: 1
    },
    "niepospolita": {
        accent: COLORS.green,
        label: "Niepospolita",
        tier: 2
    },
    "rzadka": {
        accent: COLORS.blue,
        label: "Rzadka",
        tier: 3
    },
    "epicka": {
        accent: COLORS.purple,
        label: "Epicka",
        tier: 4
    },
    "legendarna": {
        accent: COLORS.amber,
        label: "Legendarna",
        tier: 5
    }
};

function normalizeRarity(rarity) {
    return String(rarity || "Podstawowa").trim().toLowerCase();
}

function getRarityStyle(rarity) {
    return RARITY_STYLES[normalizeRarity(rarity)] || RARITY_STYLES.podstawowa;
}

function drawRarityMarks(ctx, x, y, tier, color) {
    ctx.save();
    ctx.fillStyle = color;

    for (let index = 0; index < tier; index += 1) {
        const markX = x + index * 14;

        ctx.beginPath();
        ctx.moveTo(markX + 5, y);
        ctx.lineTo(markX + 10, y + 5);
        ctx.lineTo(markX + 5, y + 10);
        ctx.lineTo(markX, y + 5);
        ctx.closePath();
        ctx.fill();
    }

    ctx.restore();
}

function drawBadge(ctx, options) {
    const {
        color = COLORS.green,
        label,
        value,
        width,
        x,
        y
    } = options;

    fillRoundedRect(ctx, x, y, width, 54, 14, "rgba(255, 255, 255, 0.045)");
    strokeRoundedRect(ctx, x, y, width, 54, 14, `${color}66`, 1.2);
    setFont(ctx, 12, "700");
    ctx.fillStyle = COLORS.muted;
    ctx.fillText(String(label).toUpperCase(), x + 16, y + 20);
    setFont(ctx, 22, "800");
    ctx.fillStyle = color;
    ctx.fillText(String(value), x + 16, y + 44);
}

function drawPriceBadge(ctx, options) {
    drawBadge(ctx, {
        ...options,
        color: COLORS.amber,
        label: "Cena"
    });
}

function drawRarityBadge(ctx, options) {
    const style = getRarityStyle(options.value);

    drawBadge(ctx, {
        ...options,
        color: style.accent,
        label: "Rzadkosc",
        value: style.label
    });
    drawRarityMarks(ctx, options.x + options.width - 76, options.y + 34, style.tier, style.accent);
}

module.exports = {
    RARITY_STYLES,
    drawBadge,
    drawPriceBadge,
    drawRarityBadge,
    drawRarityMarks,
    getRarityStyle
};
