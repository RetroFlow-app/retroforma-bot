const {
    COLORS,
    drawCenteredFittedText,
    fillRoundedRect,
    setFont,
    strokeRoundedRect
} = require("../renderer");
const {
    clearAssetCache,
    loadUiAssetImage,
    resolveUiAsset
} = require("../assetRegistry");

function clearItemAssetCache() {
    clearAssetCache();
}

function resolveItemVisual(item = {}) {
    const asset = resolveUiAsset("item", item.code || item.name);

    return {
        assetPath: asset.path,
        mapped: asset.mapped,
        shape: asset.fallback.shape || "generic",
        symbol: asset.fallback.symbol || "RF"
    };
}

function drawFallbackShape(ctx, shape, centerX, centerY, size, accent) {
    ctx.save();
    ctx.strokeStyle = accent;
    ctx.fillStyle = `${accent}18`;
    ctx.lineWidth = Math.max(2, size * 0.035);

    if (shape === "screen") {
        fillRoundedRect(ctx, centerX - size * 0.34, centerY - size * 0.24, size * 0.68, size * 0.48, size * 0.06, `${accent}12`);
        strokeRoundedRect(ctx, centerX - size * 0.34, centerY - size * 0.24, size * 0.68, size * 0.48, size * 0.06, accent, ctx.lineWidth);
        ctx.beginPath();
        ctx.moveTo(centerX - size * 0.16, centerY + size * 0.3);
        ctx.lineTo(centerX + size * 0.16, centerY + size * 0.3);
        ctx.stroke();
    } else if (shape === "compass") {
        ctx.beginPath();
        ctx.arc(centerX, centerY, size * 0.32, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(centerX, centerY - size * 0.36);
        ctx.lineTo(centerX + size * 0.1, centerY + size * 0.08);
        ctx.lineTo(centerX, centerY + size * 0.36);
        ctx.lineTo(centerX - size * 0.1, centerY - size * 0.08);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
    } else if (shape === "signal") {
        for (let index = 0; index < 3; index += 1) {
            ctx.beginPath();
            ctx.arc(centerX - size * 0.22, centerY + size * 0.2, size * (0.18 + index * 0.16), -Math.PI / 2, 0);
            ctx.stroke();
        }
        ctx.beginPath();
        ctx.arc(centerX - size * 0.22, centerY + size * 0.2, size * 0.05, 0, Math.PI * 2);
        ctx.fill();
    } else if (shape === "camera") {
        fillRoundedRect(ctx, centerX - size * 0.35, centerY - size * 0.2, size * 0.7, size * 0.44, size * 0.06, `${accent}12`);
        strokeRoundedRect(ctx, centerX - size * 0.35, centerY - size * 0.2, size * 0.7, size * 0.44, size * 0.06, accent, ctx.lineWidth);
        ctx.beginPath();
        ctx.arc(centerX, centerY + size * 0.02, size * 0.14, 0, Math.PI * 2);
        ctx.stroke();
    } else if (shape === "horizon") {
        ctx.beginPath();
        ctx.arc(centerX, centerY + size * 0.22, size * 0.34, Math.PI, 0);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(centerX - size * 0.38, centerY + size * 0.22);
        ctx.lineTo(centerX + size * 0.38, centerY + size * 0.22);
        ctx.stroke();
    } else if (shape === "frame") {
        strokeRoundedRect(ctx, centerX - size * 0.3, centerY - size * 0.3, size * 0.6, size * 0.6, size * 0.08, accent, ctx.lineWidth);
        strokeRoundedRect(ctx, centerX - size * 0.2, centerY - size * 0.2, size * 0.4, size * 0.4, size * 0.06, accent, ctx.lineWidth);
    } else if (shape === "archive") {
        fillRoundedRect(ctx, centerX - size * 0.32, centerY - size * 0.22, size * 0.64, size * 0.42, size * 0.06, `${accent}12`);
        strokeRoundedRect(ctx, centerX - size * 0.32, centerY - size * 0.22, size * 0.64, size * 0.42, size * 0.06, accent, ctx.lineWidth);
        ctx.beginPath();
        ctx.moveTo(centerX - size * 0.22, centerY - size * 0.06);
        ctx.lineTo(centerX + size * 0.22, centerY - size * 0.06);
        ctx.stroke();
    } else if (shape === "tag") {
        ctx.beginPath();
        ctx.moveTo(centerX - size * 0.28, centerY - size * 0.18);
        ctx.lineTo(centerX + size * 0.08, centerY - size * 0.18);
        ctx.lineTo(centerX + size * 0.3, centerY);
        ctx.lineTo(centerX + size * 0.08, centerY + size * 0.18);
        ctx.lineTo(centerX - size * 0.28, centerY + size * 0.18);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
    } else if (shape === "chevron") {
        ctx.beginPath();
        ctx.moveTo(centerX - size * 0.3, centerY - size * 0.16);
        ctx.lineTo(centerX, centerY + size * 0.14);
        ctx.lineTo(centerX + size * 0.3, centerY - size * 0.16);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(centerX - size * 0.22, centerY + size * 0.04);
        ctx.lineTo(centerX, centerY + size * 0.24);
        ctx.lineTo(centerX + size * 0.22, centerY + size * 0.04);
        ctx.stroke();
    } else {
        ctx.beginPath();
        ctx.rect(centerX - size * 0.28, centerY - size * 0.28, size * 0.56, size * 0.56);
        ctx.stroke();
    }

    ctx.restore();
}

function drawItemIcon(ctx, options = {}) {
    const {
        accent = COLORS.green,
        item = null,
        size = 180,
        x,
        y
    } = options;
    const centerX = x + size / 2;
    const centerY = y + size / 2;
    const visual = resolveItemVisual(item || {});
    const assetId = item?.code || item?.name || null;
    const image = assetId ? loadUiAssetImage("item", assetId) : null;

    ctx.save();
    ctx.shadowColor = `${accent}44`;
    ctx.shadowBlur = size > 120 ? 22 : 10;
    fillRoundedRect(ctx, x, y, size, size, Math.max(14, size * 0.11), "rgba(5, 13, 12, 0.74)");
    ctx.shadowBlur = 0;
    strokeRoundedRect(ctx, x, y, size, size, Math.max(14, size * 0.11), `${accent}66`, 1.4);

    ctx.globalAlpha = 0.34;
    ctx.strokeStyle = accent;
    ctx.lineWidth = 1;
    for (let index = 0; index < 4; index += 1) {
        ctx.beginPath();
        ctx.arc(centerX, centerY, size * (0.2 + index * 0.13), 0, Math.PI * 2);
        ctx.stroke();
    }
    ctx.globalAlpha = 1;

    let drewImage = false;

    if (image) {
        const imageSize = size * 0.64;

        try {
            ctx.drawImage(image, centerX - imageSize / 2, centerY - imageSize / 2, imageSize, imageSize);
            drewImage = true;
        } catch (error) {
            console.warn(`[UI ASSET] Nie udalo sie narysowac assetu item:${item?.code || "unknown"} (${error.message})`);
        }
    }

    if (!drewImage) {
        drawFallbackShape(ctx, visual.shape, centerX, centerY - size * 0.02, size * 0.64, accent);
        setFont(ctx, Math.max(18, size * 0.18), "800");
        ctx.fillStyle = COLORS.text;
        drawCenteredFittedText(ctx, visual.symbol, centerX, centerY + size * 0.1, size * 0.52);
    }

    ctx.restore();
}

module.exports = {
    clearItemAssetCache,
    drawItemIcon,
    resolveItemVisual
};
