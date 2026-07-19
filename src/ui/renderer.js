let canvasModule = null;

try {
    canvasModule = require("canvas");
} catch (error) {
    canvasModule = null;
}

const UI_WIDTH = 1280;
const UI_HEIGHT = 720;

const COLORS = {
    background: "#050908",
    backgroundSoft: "#0b1312",
    graphite: "#111817",
    graphiteLight: "#1d2927",
    graphitePanel: "#101917",
    green: "#4dff9a",
    greenSoft: "rgba(77, 255, 154, 0.18)",
    amber: "#ffc857",
    amberSoft: "rgba(255, 200, 87, 0.18)",
    blue: "#4cc9ff",
    blueSoft: "rgba(76, 201, 255, 0.16)",
    purple: "#b778ff",
    neutral: "#b7c1bd",
    text: "#e7f8ee",
    muted: "#8ca39a",
    danger: "#ff6b6b",
    line: "rgba(148, 255, 204, 0.18)"
};

function ensureCanvas() {
    if (!canvasModule) {
        const error = new Error("Biblioteka canvas nie jest dostępna.");
        error.code = "CANVAS_NOT_INSTALLED";
        throw error;
    }

    return canvasModule;
}

function createUiCanvas(options = {}) {
    const { createCanvas } = ensureCanvas();
    const width = options.width || UI_WIDTH;
    const height = options.height || UI_HEIGHT;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.textBaseline = "alphabetic";

    return {
        canvas,
        ctx,
        height,
        width
    };
}

function renderPng(draw, options = {}) {
    const surface = createUiCanvas(options);

    draw(surface.ctx, surface);

    return surface.canvas.toBuffer("image/png");
}

function setFont(ctx, size, weight = "400", family = "Arial") {
    ctx.font = `${weight} ${size}px ${family}`;
}

function createLinearGradient(ctx, x0, y0, x1, y1, stops) {
    const gradient = ctx.createLinearGradient(x0, y0, x1, y1);

    for (const stop of stops) {
        gradient.addColorStop(stop.offset, stop.color);
    }

    return gradient;
}

function roundRectPath(ctx, x, y, width, height, radius) {
    const safeRadius = Math.min(radius, width / 2, height / 2);

    ctx.beginPath();
    ctx.moveTo(x + safeRadius, y);
    ctx.lineTo(x + width - safeRadius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + safeRadius);
    ctx.lineTo(x + width, y + height - safeRadius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - safeRadius, y + height);
    ctx.lineTo(x + safeRadius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - safeRadius);
    ctx.lineTo(x, y + safeRadius);
    ctx.quadraticCurveTo(x, y, x + safeRadius, y);
    ctx.closePath();
}

function fillRoundedRect(ctx, x, y, width, height, radius, fillStyle) {
    roundRectPath(ctx, x, y, width, height, radius);
    ctx.fillStyle = fillStyle;
    ctx.fill();
}

function strokeRoundedRect(ctx, x, y, width, height, radius, strokeStyle, lineWidth = 1) {
    roundRectPath(ctx, x, y, width, height, radius);
    ctx.strokeStyle = strokeStyle;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
}

function drawFittedText(ctx, text, x, y, maxWidth, options = {}) {
    const suffix = options.suffix || "...";
    let value = String(text || "");

    if (ctx.measureText(value).width <= maxWidth) {
        ctx.fillText(value, x, y);
        return value;
    }

    while (value.length > 0 && ctx.measureText(`${value}${suffix}`).width > maxWidth) {
        value = value.slice(0, -1);
    }

    const fittedValue = `${value}${suffix}`;
    ctx.fillText(fittedValue, x, y);

    return fittedValue;
}

function drawCenteredFittedText(ctx, text, centerX, y, maxWidth, options = {}) {
    const suffix = options.suffix || "...";
    let value = String(text || "");

    if (ctx.measureText(value).width > maxWidth) {
        while (value.length > 0 && ctx.measureText(`${value}${suffix}`).width > maxWidth) {
            value = value.slice(0, -1);
        }

        value = `${value}${suffix}`;
    }

    ctx.fillText(value, centerX - ctx.measureText(value).width / 2, y);

    return value;
}

function wrapText(ctx, text, maxWidth, maxLines = 5) {
    const words = String(text || "").split(/\s+/).filter(Boolean);
    const lines = [];
    let line = "";

    for (const word of words) {
        const nextLine = line ? `${line} ${word}` : word;

        if (ctx.measureText(nextLine).width <= maxWidth) {
            line = nextLine;
            continue;
        }

        if (line) {
            lines.push(line);
        }

        line = word;

        if (lines.length >= maxLines) {
            break;
        }
    }

    if (line && lines.length < maxLines) {
        lines.push(line);
    }

    if (lines.length === maxLines && words.length > 0) {
        const lastIndex = lines.length - 1;

        while (lines[lastIndex].length > 0 && ctx.measureText(`${lines[lastIndex]}...`).width > maxWidth) {
            lines[lastIndex] = lines[lastIndex].slice(0, -1);
        }

        if (!lines[lastIndex].endsWith("...")) {
            lines[lastIndex] = `${lines[lastIndex]}...`;
        }
    }

    return lines;
}

function drawBackground(ctx, width, height) {
    const backgroundGradient = createLinearGradient(ctx, 0, 0, width, height, [
        { offset: 0, color: "#030605" },
        { offset: 0.48, color: "#08110f" },
        { offset: 1, color: "#10100c" }
    ]);

    ctx.fillStyle = backgroundGradient;
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    ctx.globalAlpha = 0.28;
    ctx.strokeStyle = COLORS.line;
    ctx.lineWidth = 1;

    for (let x = 40; x < width; x += 40) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
    }

    for (let y = 40; y < height; y += 40) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
    }
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = 0.15;
    ctx.strokeStyle = COLORS.amber;
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 12; i += 1) {
        const x = 80 + i * 96;
        ctx.beginPath();
        ctx.moveTo(x, 32);
        ctx.lineTo(x + 44, 32);
        ctx.lineTo(x + 70, 58);
        ctx.stroke();
    }
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = 0.12;
    ctx.strokeStyle = COLORS.green;
    ctx.lineWidth = 1;
    for (let y = 16; y < height; y += 12) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
    }
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = 0.16;
    ctx.strokeStyle = COLORS.blue;
    ctx.lineWidth = 1;
    for (let i = 0; i < 8; i += 1) {
        const x = 88 + i * 142;
        const y = 142 + (i % 3) * 74;

        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + 34, y);
        ctx.lineTo(x + 34, y + 18);
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(x + 72, y + 42, 22, 0, Math.PI * 2);
        ctx.stroke();
    }
    ctx.restore();

    const vignette = ctx.createRadialGradient(width / 2, height / 2, 120, width / 2, height / 2, width / 1.2);
    vignette.addColorStop(0, "rgba(255,255,255,0)");
    vignette.addColorStop(1, "rgba(0,0,0,0.56)");
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, width, height);
}

module.exports = {
    COLORS,
    UI_HEIGHT,
    UI_WIDTH,
    createLinearGradient,
    createUiCanvas,
    drawBackground,
    drawCenteredFittedText,
    drawFittedText,
    ensureCanvas,
    fillRoundedRect,
    renderPng,
    roundRectPath,
    setFont,
    strokeRoundedRect,
    wrapText
};
