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

function getAssetTypeForItem(item = {}, assetType = "item") {
    if (assetType) {
        return assetType;
    }

    return item.type === "badge" ? "badge" : "item";
}

function resolveItemVisual(item = {}, assetType = "item") {
    const type = getAssetTypeForItem(item, assetType);
    const asset = resolveUiAsset(type, item.code || item.name);

    return {
        assetPath: asset.path,
        assetType: type,
        mapped: asset.mapped,
        shape: asset.fallback.shape || "generic",
        symbol: asset.fallback.symbol || "RF"
    };
}

function getFrameStyle(itemCode, fallbackAccent) {
    const code = String(itemCode || "").toLowerCase();

    if (code.includes("carbon")) {
        return {
            accent: "#9ca3af",
            fill: "rgba(8, 12, 14, 0.86)",
            glow: "rgba(156, 163, 175, 0.18)",
            pattern: "carbon"
        };
    }

    if (code.includes("neon")) {
        return {
            accent: "#39ff88",
            fill: "rgba(4, 18, 14, 0.84)",
            glow: "rgba(57, 255, 136, 0.28)",
            pattern: "neon"
        };
    }

    if (code.includes("cyan")) {
        return {
            accent: "#22d3ee",
            fill: "rgba(5, 14, 20, 0.84)",
            glow: "rgba(34, 211, 238, 0.26)",
            pattern: "cyan"
        };
    }

    if (code.includes("amber")) {
        return {
            accent: "#f59e0b",
            fill: "rgba(22, 14, 5, 0.86)",
            glow: "rgba(245, 158, 11, 0.28)",
            pattern: "amber"
        };
    }

    return {
        accent: fallbackAccent,
        fill: "rgba(5, 13, 12, 0.74)",
        glow: `${fallbackAccent}22`,
        pattern: "default"
    };
}

function drawFramePattern(ctx, frameStyle, cardX, cardY, cardWidth, cardHeight, size) {
    ctx.save();
    ctx.strokeStyle = frameStyle.accent;

    if (frameStyle.pattern === "carbon") {
        ctx.globalAlpha = 0.22;
        ctx.lineWidth = Math.max(1, size * 0.012);

        for (let offset = -cardHeight; offset < cardWidth; offset += size * 0.09) {
            ctx.beginPath();
            ctx.moveTo(cardX + offset, cardY + cardHeight);
            ctx.lineTo(cardX + offset + cardHeight, cardY);
            ctx.stroke();
        }

        ctx.globalAlpha = 0.12;
        for (let offset = 0; offset < cardWidth + cardHeight; offset += size * 0.09) {
            ctx.beginPath();
            ctx.moveTo(cardX + offset, cardY);
            ctx.lineTo(cardX + offset - cardHeight, cardY + cardHeight);
            ctx.stroke();
        }
    } else if (frameStyle.pattern === "neon") {
        ctx.globalAlpha = 0.55;
        ctx.lineWidth = Math.max(1, size * 0.018);
        strokeRoundedRect(
            ctx,
            cardX + size * 0.07,
            cardY + size * 0.07,
            cardWidth - size * 0.14,
            cardHeight - size * 0.14,
            size * 0.035,
            frameStyle.accent,
            ctx.lineWidth
        );
    } else if (frameStyle.pattern === "cyan") {
        ctx.globalAlpha = 0.24;
        ctx.lineWidth = Math.max(1, size * 0.012);

        for (let lineX = cardX + size * 0.08; lineX < cardX + cardWidth - size * 0.06; lineX += size * 0.12) {
            ctx.beginPath();
            ctx.moveTo(lineX, cardY + size * 0.08);
            ctx.lineTo(lineX, cardY + cardHeight - size * 0.08);
            ctx.stroke();
        }

        for (let lineY = cardY + size * 0.08; lineY < cardY + cardHeight - size * 0.06; lineY += size * 0.1) {
            ctx.beginPath();
            ctx.moveTo(cardX + size * 0.08, lineY);
            ctx.lineTo(cardX + cardWidth - size * 0.08, lineY);
            ctx.stroke();
        }
    } else if (frameStyle.pattern === "amber") {
        ctx.globalAlpha = 0.5;
        ctx.lineWidth = Math.max(1, size * 0.016);

        for (let index = 0; index < 3; index += 1) {
            const notchX = cardX + cardWidth * (0.22 + index * 0.2);

            ctx.beginPath();
            ctx.moveTo(notchX, cardY - size * 0.025);
            ctx.lineTo(notchX + size * 0.06, cardY - size * 0.025);
            ctx.stroke();

            ctx.beginPath();
            ctx.moveTo(notchX, cardY + cardHeight + size * 0.025);
            ctx.lineTo(notchX + size * 0.06, cardY + cardHeight + size * 0.025);
            ctx.stroke();
        }
    }

    ctx.restore();
}

function drawFallbackShape(ctx, shape, centerX, centerY, size, accent, itemCode = null) {
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
        const frameStyle = getFrameStyle(itemCode, accent);
        const cardWidth = size * 0.72;
        const cardHeight = size * 0.5;
        const cardX = centerX - cardWidth / 2;
        const cardY = centerY - cardHeight / 2;

        ctx.shadowColor = frameStyle.glow;
        ctx.shadowBlur = size * 0.08;
        fillRoundedRect(ctx, cardX, cardY, cardWidth, cardHeight, size * 0.055, frameStyle.fill);
        ctx.shadowBlur = 0;
        drawFramePattern(ctx, frameStyle, cardX, cardY, cardWidth, cardHeight, size);
        strokeRoundedRect(ctx, cardX, cardY, cardWidth, cardHeight, size * 0.055, frameStyle.accent, ctx.lineWidth * 1.25);
        strokeRoundedRect(ctx, cardX + size * 0.045, cardY + size * 0.045, cardWidth - size * 0.09, cardHeight - size * 0.09, size * 0.035, `${frameStyle.accent}88`, Math.max(1, ctx.lineWidth * 0.48));

        ctx.beginPath();
        ctx.arc(centerX - cardWidth * 0.25, centerY - cardHeight * 0.03, size * 0.08, 0, Math.PI * 2);
        ctx.stroke();

        ctx.lineWidth = Math.max(1, size * 0.018);
        for (let index = 0; index < 3; index += 1) {
            const lineY = centerY - cardHeight * 0.17 + index * size * 0.08;

            ctx.beginPath();
            ctx.moveTo(centerX - cardWidth * 0.04, lineY);
            ctx.lineTo(centerX + cardWidth * 0.3, lineY);
            ctx.stroke();
        }

        ctx.strokeStyle = frameStyle.accent;
        const corner = size * 0.11;
        ctx.beginPath();
        ctx.moveTo(cardX - size * 0.025, cardY + corner);
        ctx.lineTo(cardX - size * 0.025, cardY - size * 0.025);
        ctx.lineTo(cardX + corner, cardY - size * 0.025);
        ctx.moveTo(cardX + cardWidth - corner, cardY - size * 0.025);
        ctx.lineTo(cardX + cardWidth + size * 0.025, cardY - size * 0.025);
        ctx.lineTo(cardX + cardWidth + size * 0.025, cardY + corner);
        ctx.moveTo(cardX - size * 0.025, cardY + cardHeight - corner);
        ctx.lineTo(cardX - size * 0.025, cardY + cardHeight + size * 0.025);
        ctx.lineTo(cardX + corner, cardY + cardHeight + size * 0.025);
        ctx.moveTo(cardX + cardWidth - corner, cardY + cardHeight + size * 0.025);
        ctx.lineTo(cardX + cardWidth + size * 0.025, cardY + cardHeight + size * 0.025);
        ctx.lineTo(cardX + cardWidth + size * 0.025, cardY + cardHeight - corner);
        ctx.stroke();
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

function drawContainedAssetImage(ctx, image, centerX, centerY, maxWidth, maxHeight) {
    const imageWidth = Number(image.width) || maxWidth;
    const imageHeight = Number(image.height) || maxHeight;
    const scale = Math.min(maxWidth / imageWidth, maxHeight / imageHeight);
    const drawWidth = imageWidth * scale;
    const drawHeight = imageHeight * scale;

    ctx.drawImage(
        image,
        centerX - drawWidth / 2,
        centerY - drawHeight / 2,
        drawWidth,
        drawHeight
    );
}

function drawCenteredAssetImage(ctx, image, centerX, centerY, maxSize) {
    drawContainedAssetImage(ctx, image, centerX, centerY, maxSize, maxSize);
}

function drawItemIcon(ctx, options = {}) {
    const {
        accent = COLORS.green,
        assetType = null,
        item = null,
        imageScale = 0.64,
        showBackdrop = true,
        size = 180,
        x,
        y
    } = options;
    const centerX = x + size / 2;
    const centerY = y + size / 2;
    const resolvedAssetType = getAssetTypeForItem(item || {}, assetType);
    const visual = resolveItemVisual(item || {}, resolvedAssetType);
    const assetId = item?.code || item?.name || null;
    const image = assetId ? loadUiAssetImage(resolvedAssetType, assetId) : null;

    ctx.save();

    if (showBackdrop) {
        ctx.shadowColor = `${accent}44`;
        ctx.shadowBlur = size > 120 ? 20 : 8;
        const radius = Math.max(14, size * 0.11);
        const backdropGradient = ctx.createLinearGradient(x, y, x + size, y + size);

        backdropGradient.addColorStop(0, "rgba(3, 8, 8, 0.94)");
        backdropGradient.addColorStop(0.5, "rgba(7, 17, 15, 0.84)");
        backdropGradient.addColorStop(1, "rgba(2, 5, 6, 0.96)");

        fillRoundedRect(ctx, x, y, size, size, radius, backdropGradient);
        ctx.shadowBlur = 0;
        strokeRoundedRect(ctx, x, y, size, size, radius, `${accent}52`, 1.2);

        const glow = ctx.createRadialGradient(centerX, centerY, size * 0.08, centerX, centerY, size * 0.54);
        glow.addColorStop(0, `${accent}30`);
        glow.addColorStop(0.48, `${accent}12`);
        glow.addColorStop(1, "rgba(0, 0, 0, 0)");
        ctx.fillStyle = glow;
        ctx.fillRect(x, y, size, size);

        const vignette = ctx.createRadialGradient(centerX, centerY, size * 0.42, centerX, centerY, size * 0.72);
        vignette.addColorStop(0, "rgba(0, 0, 0, 0)");
        vignette.addColorStop(1, "rgba(0, 0, 0, 0.58)");
        ctx.fillStyle = vignette;
        ctx.fillRect(x, y, size, size);

        ctx.save();
        ctx.globalAlpha = 0.045;
        ctx.fillStyle = accent;
        for (let dotIndex = 0; dotIndex < 18; dotIndex += 1) {
            const dotX = x + ((dotIndex * 37) % Math.max(1, size - 30)) + 15;
            const dotY = y + ((dotIndex * 53) % Math.max(1, size - 30)) + 15;

            ctx.fillRect(dotX, dotY, 1, 1);
        }
        ctx.restore();
    }

    let drewImage = false;

    if (image) {
        const imageMaxSize = size * imageScale;

        try {
            if (visual.shape === "background") {
                drawContainedAssetImage(ctx, image, centerX, centerY, size * 0.9, size * 0.64);
            } else {
                drawCenteredAssetImage(ctx, image, centerX, centerY, imageMaxSize);
            }
            drewImage = true;
        } catch (error) {
            console.warn(`[UI ASSET] Nie udalo sie narysowac assetu item:${item?.code || "unknown"} (${error.message})`);
        }
    }

    if (!drewImage) {
        drawFallbackShape(ctx, visual.shape, centerX, centerY - size * 0.02, size * imageScale, accent, item?.code || item?.name);

        if (visual.shape !== "frame") {
            setFont(ctx, Math.max(18, size * imageScale * 0.28), "800");
            ctx.fillStyle = COLORS.text;
            drawCenteredFittedText(ctx, visual.symbol, centerX, centerY + size * 0.1, size * imageScale * 0.82);
        }
    }

    ctx.restore();
}

module.exports = {
    clearItemAssetCache,
    drawItemIcon,
    resolveItemVisual
};
