const { registerProfileFont } = require("./profileAssetService");
const { getCurrentLevelProgress } = require("./pointsService");

const CARD_WIDTH = 1080;
const CARD_HEIGHT = 1610;
const FALLBACK_FONT = "Segoe UI";
let activeFontFamily = FALLBACK_FONT;

const COLORS = {
    bgTop: "#05070b",
    bgMid: "#0d131c",
    bgBottom: "#020407",
    text: "#f8fafc",
    muted: "#9aa4b2",
    panel: "rgba(7, 12, 18, 0.88)",
    panelLight: "rgba(16, 24, 34, 0.78)",
    grid: "rgba(148, 163, 184, 0.055)",
    gold: "#f6c343",
    silver: "#d7e2ef",
    bronze: "#c77732",
    blue: "#48b7ff",
    green: "#58f28a",
    red: "#ff4b38"
};

const TOP_CARD_ACCENTS = {
    1: {
        main: COLORS.gold,
        soft: "rgba(246, 195, 67, 0.20)",
        deep: "rgba(246, 195, 67, 0.08)",
        line: "rgba(246, 195, 67, 0.92)",
        glow: "rgba(246, 195, 67, 0.26)"
    },
    2: {
        main: COLORS.silver,
        soft: "rgba(190, 218, 244, 0.18)",
        deep: "rgba(72, 183, 255, 0.07)",
        line: "rgba(202, 226, 248, 0.82)",
        glow: "rgba(72, 183, 255, 0.20)"
    },
    3: {
        main: COLORS.bronze,
        soft: "rgba(199, 119, 50, 0.18)",
        deep: "rgba(199, 119, 50, 0.07)",
        line: "rgba(199, 119, 50, 0.86)",
        glow: "rgba(255, 132, 40, 0.20)"
    }
};

function loadCanvas() {
    try {
        return require("canvas");
    } catch (error) {
        const canvasError = new Error("Brakuje biblioteki canvas. Wykonaj: npm install canvas");
        canvasError.code = "CANVAS_NOT_INSTALLED";
        throw canvasError;
    }
}

function prepareCanvas() {
    const canvasApi = loadCanvas();
    const registeredFontFamily = registerProfileFont(canvasApi.registerFont);

    activeFontFamily = registeredFontFamily || FALLBACK_FONT;

    return canvasApi;
}

function getFontFamily() {
    return activeFontFamily;
}

function getSafeNumber(value, fallback = 0) {
    const numberValue = Number(value);

    return Number.isFinite(numberValue) ? Math.max(0, numberValue) : fallback;
}

function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

function formatNumber(value) {
    return getSafeNumber(value).toLocaleString("pl-PL");
}

function formatUpdatedAt(updatedAt) {
    return new Intl.DateTimeFormat("pl-PL", {
        timeZone: "Europe/Warsaw",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false
    }).format(new Date(updatedAt)).replace(",", "");
}

function trimText(text, maxLength) {
    const safeText = String(text || "");

    if (safeText.length <= maxLength) {
        return safeText;
    }

    return `${safeText.slice(0, maxLength - 1)}...`;
}

function drawChamferPath(ctx, x, y, width, height, cut = 18) {
    const safeCut = Math.min(cut, width / 4, height / 4);

    ctx.beginPath();
    ctx.moveTo(x + safeCut, y);
    ctx.lineTo(x + width - safeCut, y);
    ctx.lineTo(x + width, y + safeCut);
    ctx.lineTo(x + width, y + height - safeCut);
    ctx.lineTo(x + width - safeCut, y + height);
    ctx.lineTo(x + safeCut, y + height);
    ctx.lineTo(x, y + height - safeCut);
    ctx.lineTo(x, y + safeCut);
    ctx.closePath();
}

function fillChamferRect(ctx, x, y, width, height, cut, fillStyle) {
    drawChamferPath(ctx, x, y, width, height, cut);
    ctx.fillStyle = fillStyle;
    ctx.fill();
}

function strokeChamferRect(ctx, x, y, width, height, cut, color, lineWidth = 2) {
    drawChamferPath(ctx, x, y, width, height, cut);
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
}

function drawRoundedRect(ctx, x, y, width, height, radius) {
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

function fillRoundedRect(ctx, x, y, width, height, radius, color) {
    drawRoundedRect(ctx, x, y, width, height, radius);
    ctx.fillStyle = color;
    ctx.fill();
}

function strokeRoundedRect(ctx, x, y, width, height, radius, color, lineWidth = 2) {
    drawRoundedRect(ctx, x, y, width, height, radius);
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
}

function drawLine(ctx, startX, startY, endX, endY, color, lineWidth = 1) {
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(endX, endY);
    ctx.stroke();
}

function drawGlow(ctx, x, y, radius, color) {
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);

    gradient.addColorStop(0, color);
    gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
}

function drawFittedText(ctx, text, x, y, maxWidth, options = {}) {
    const {
        color = COLORS.text,
        maxSize = 30,
        minSize = 14,
        weight = "800",
        align = "left"
    } = options;
    let fontSize = maxSize;

    ctx.fillStyle = color;
    ctx.textAlign = align;

    do {
        ctx.font = `${weight} ${fontSize}px ${getFontFamily()}`;

        if (ctx.measureText(String(text)).width <= maxWidth || fontSize <= minSize) {
            break;
        }

        fontSize -= 2;
    } while (fontSize >= minSize);

    ctx.fillText(String(text), x, y);
    ctx.textAlign = "left";
}

function createMetalGradient(ctx, x, y, width, height, accent = "rgba(255,255,255,0.10)") {
    const gradient = ctx.createLinearGradient(x, y, x + width, y + height);

    gradient.addColorStop(0, "rgba(255, 255, 255, 0.20)");
    gradient.addColorStop(0.12, "rgba(15, 23, 42, 0.96)");
    gradient.addColorStop(0.38, "rgba(255, 255, 255, 0.05)");
    gradient.addColorStop(0.54, accent);
    gradient.addColorStop(0.78, "rgba(2, 6, 23, 0.98)");
    gradient.addColorStop(1, "rgba(255, 255, 255, 0.16)");

    return gradient;
}

function drawMetalPanel(ctx, x, y, width, height, cut, accent, options = {}) {
    const {
        glow = false,
        alpha = 1
    } = options;

    ctx.save();

    if (glow) {
        ctx.shadowColor = accent.glow || accent.line || "rgba(246, 195, 67, 0.18)";
        ctx.shadowBlur = 28;
        ctx.shadowOffsetY = 8;
    } else {
        ctx.shadowColor = "rgba(0, 0, 0, 0.56)";
        ctx.shadowBlur = 22;
        ctx.shadowOffsetY = 12;
    }

    ctx.globalAlpha = alpha;
    fillChamferRect(ctx, x, y, width, height, cut, createMetalGradient(ctx, x, y, width, height, accent.deep));
    ctx.restore();

    const frameGradient = ctx.createLinearGradient(x, y, x + width, y + height);

    frameGradient.addColorStop(0, "rgba(255,255,255,0.22)");
    frameGradient.addColorStop(0.24, accent.line);
    frameGradient.addColorStop(0.52, "rgba(255,255,255,0.07)");
    frameGradient.addColorStop(0.78, accent.line);
    frameGradient.addColorStop(1, "rgba(0,0,0,0.62)");

    strokeChamferRect(ctx, x, y, width, height, cut, "rgba(255, 255, 255, 0.12)", 1.4);
    strokeChamferRect(ctx, x + 2, y + 2, width - 4, height - 4, Math.max(4, cut - 2), frameGradient, 2.8);
    strokeChamferRect(ctx, x + 10, y + 10, width - 20, height - 20, Math.max(4, cut - 9), "rgba(255,255,255,0.075)", 1.2);
    strokeChamferRect(ctx, x + 15, y + 15, width - 30, height - 30, Math.max(4, cut - 13), "rgba(0,0,0,0.44)", 1);

    drawLine(ctx, x + 28, y + 12, x + width - 28, y + 12, accent.soft, 1);
    drawLine(ctx, x + 28, y + height - 12, x + width - 28, y + height - 12, "rgba(0,0,0,0.45)", 1);
}

function drawStar(ctx, x, y, outerRadius, innerRadius, color) {
    ctx.save();
    ctx.beginPath();

    for (let i = 0; i < 10; i += 1) {
        const angle = -Math.PI / 2 + i * Math.PI / 5;
        const radius = i % 2 === 0 ? outerRadius : innerRadius;
        const pointX = x + Math.cos(angle) * radius;
        const pointY = y + Math.sin(angle) * radius;

        if (i === 0) {
            ctx.moveTo(pointX, pointY);
        } else {
            ctx.lineTo(pointX, pointY);
        }
    }

    ctx.closePath();
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 10;
    ctx.fill();
    ctx.restore();
}

function drawHexIcon(ctx, x, y, radius, color) {
    ctx.save();
    ctx.beginPath();

    for (let i = 0; i < 6; i += 1) {
        const angle = Math.PI / 6 + i * Math.PI / 3;
        const pointX = x + Math.cos(angle) * radius;
        const pointY = y + Math.sin(angle) * radius;

        if (i === 0) {
            ctx.moveTo(pointX, pointY);
        } else {
            ctx.lineTo(pointX, pointY);
        }
    }

    ctx.closePath();
    ctx.fillStyle = "rgba(7, 21, 36, 0.92)";
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.font = `900 ${Math.max(9, radius * 0.78)}px ${getFontFamily()}`;
    ctx.textAlign = "center";
    ctx.fillText("XP", x, y + radius * 0.28);
    ctx.textAlign = "left";
    ctx.restore();
}

function drawTargetIcon(ctx, x, y, radius, color) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y, radius * 0.48, 0, Math.PI * 2);
    ctx.stroke();
    drawLine(ctx, x - radius - 3, y, x + radius + 3, y, color, 1.5);
    drawLine(ctx, x, y - radius - 3, x, y + radius + 3, color, 1.5);
    ctx.restore();
}

function drawGroupIcon(ctx, x, y, color) {
    ctx.save();
    ctx.globalAlpha = 0.96;
    ctx.strokeStyle = "rgba(2, 6, 23, 0.70)";
    ctx.lineWidth = 2;

    [[x, y - 12, 9], [x - 20, y - 7, 7], [x + 20, y - 7, 7]].forEach(([cx, cy, r]) => {
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.stroke();
    });

    fillRoundedRect(ctx, x - 16, y + 2, 32, 34, 9, color);
    strokeRoundedRect(ctx, x - 16, y + 2, 32, 34, 9, "rgba(2, 6, 23, 0.70)", 2);
    fillRoundedRect(ctx, x - 38, y + 8, 26, 26, 8, color);
    strokeRoundedRect(ctx, x - 38, y + 8, 26, 26, 8, "rgba(2, 6, 23, 0.70)", 2);
    fillRoundedRect(ctx, x + 12, y + 8, 26, 26, 8, color);
    strokeRoundedRect(ctx, x + 12, y + 8, 26, 26, 8, "rgba(2, 6, 23, 0.70)", 2);
    ctx.restore();
}

function drawDimensionMark(ctx, x1, y1, x2, y2, color) {
    drawLine(ctx, x1, y1, x2, y2, color, 1);
    drawLine(ctx, x1, y1 - 8, x1, y1 + 8, color, 1);
    drawLine(ctx, x2, y2 - 8, x2, y2 + 8, color, 1);
    drawLine(ctx, x1 + 8, y1 - 5, x1 - 8, y1 + 5, color, 1);
    drawLine(ctx, x2 + 8, y2 - 5, x2 - 8, y2 + 5, color, 1);
}

function drawArrowHead(ctx, x, y, angle, size, color) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-size, -size * 0.42);
    ctx.lineTo(-size, size * 0.42);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.restore();
}

function drawMeasurementLine(ctx, x1, y1, x2, y2, label, color) {
    const angle = Math.atan2(y2 - y1, x2 - x1);

    drawLine(ctx, x1, y1, x2, y2, color, 1);
    drawArrowHead(ctx, x1, y1, angle + Math.PI, 6, color);
    drawArrowHead(ctx, x2, y2, angle, 6, color);

    if (label) {
        ctx.save();
        ctx.fillStyle = color;
        ctx.font = `800 9px ${getFontFamily()}`;
        ctx.textAlign = "center";
        ctx.fillText(label, (x1 + x2) / 2, (y1 + y2) / 2 - 6);
        ctx.restore();
    }
}

function drawCaliperMotif(ctx) {
    const line = "rgba(215, 226, 239, 0.48)";
    const strong = "rgba(215, 226, 239, 0.62)";
    const soft = "rgba(148, 163, 184, 0.24)";

    ctx.save();
    ctx.globalAlpha = 0.72;
    ctx.translate(884, 116);
    ctx.rotate(-0.32);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    // Linie konstrukcyjne za suwmiarką.
    ctx.strokeStyle = soft;
    ctx.lineWidth = 1;
    ctx.strokeRect(-138, -64, 260, 112);
    ctx.strokeRect(-112, -44, 172, 72);
    drawLine(ctx, -150, -6, 142, -6, soft, 1);
    drawLine(ctx, -22, -72, -22, 56, soft, 1);

    // Prowadnica i korpus suwmiarki.
    ctx.strokeStyle = strong;
    ctx.lineWidth = 2;
    ctx.strokeRect(-128, -8, 242, 22);
    drawLine(ctx, -124, 3, 110, 3, line, 1);

    for (let i = 0; i <= 20; i += 1) {
        const x = -118 + i * 11;
        const tickHeight = i % 5 === 0 ? 15 : i % 2 === 0 ? 11 : 8;

        drawLine(ctx, x, 14, x, 14 + tickHeight, i % 5 === 0 ? strong : line, i % 5 === 0 ? 1.4 : 1);
    }

    ctx.fillStyle = line;
    ctx.font = `800 9px ${getFontFamily()}`;
    ctx.fillText("0", -120, 42);
    ctx.fillText("10", -64, 42);
    ctx.fillText("20", -8, 42);
    ctx.fillText("mm", 76, 42);

    // Szczęka stała.
    ctx.beginPath();
    ctx.moveTo(-128, -8);
    ctx.lineTo(-158, -42);
    ctx.lineTo(-140, -48);
    ctx.lineTo(-106, -8);
    ctx.moveTo(-128, 14);
    ctx.lineTo(-154, 54);
    ctx.lineTo(-136, 58);
    ctx.lineTo(-104, 14);
    ctx.strokeStyle = strong;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Suwak i szczęka ruchoma.
    ctx.strokeRect(18, -24, 58, 54);
    drawLine(ctx, 26, -14, 68, -14, line, 1);
    for (let i = 0; i < 6; i += 1) {
        drawLine(ctx, 28 + i * 7, 21, 28 + i * 7, 30, line, 1);
    }
    ctx.beginPath();
    ctx.moveTo(24, -24);
    ctx.lineTo(-8, -54);
    ctx.lineTo(9, -60);
    ctx.lineTo(52, -24);
    ctx.moveTo(24, 30);
    ctx.lineTo(-5, 66);
    ctx.lineTo(14, 70);
    ctx.lineTo(54, 30);
    ctx.strokeStyle = strong;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Linie wymiarowe i opisy techniczne.
    drawMeasurementLine(ctx, -154, -72, 8, -72, "A = 42.0", line);
    drawMeasurementLine(ctx, -154, 78, 14, 78, "Ø12", line);
    drawLine(ctx, -154, -62, -154, -42, line, 1);
    drawLine(ctx, 8, -62, 8, -54, line, 1);
    drawLine(ctx, -154, 58, -154, 68, line, 1);
    drawLine(ctx, 14, 70, 14, 68, line, 1);

    ctx.fillStyle = line;
    ctx.font = `800 10px ${getFontFamily()}`;
    ctx.fillText("CAL-01", 70, -34);
    ctx.fillText("1:2", 92, -18);

    ctx.restore();
}

function drawBlueprintText(ctx, text, x, y, color, angle = 0) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.fillStyle = color;
    ctx.font = `800 10px ${getFontFamily()}`;
    ctx.textAlign = "center";
    ctx.fillText(text, 0, 0);
    ctx.restore();
}

function drawConstructionCircle(ctx, centerX, centerY, radius, color) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;

    [1, 0.72, 0.48, 0.24].forEach((scale) => {
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius * scale, 0, Math.PI * 2);
        ctx.stroke();
    });

    drawLine(ctx, centerX - radius - 46, centerY, centerX + radius + 46, centerY, color, 1);
    drawLine(ctx, centerX, centerY - radius - 46, centerX, centerY + radius + 46, color, 1);
    drawMeasurementLine(ctx, centerX - radius, centerY - radius - 24, centerX + radius, centerY - radius - 24, "Ø42.00", color);
    drawMeasurementLine(ctx, centerX - radius * 0.48, centerY + radius + 24, centerX + radius * 0.48, centerY + radius + 24, "Ø18.00", color);
    ctx.restore();
}

function drawMechanicalOutline(ctx, x, y, scale, color) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.3;
    ctx.lineJoin = "round";

    ctx.beginPath();
    ctx.moveTo(-74, -20);
    ctx.lineTo(-28, -52);
    ctx.lineTo(18, -42);
    ctx.lineTo(46, -10);
    ctx.lineTo(78, -2);
    ctx.lineTo(54, 28);
    ctx.lineTo(8, 44);
    ctx.lineTo(-36, 34);
    ctx.lineTo(-76, 6);
    ctx.closePath();
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(-24, -4, 18, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(38, 8, 12, 0, Math.PI * 2);
    ctx.stroke();

    for (let i = 0; i < 8; i += 1) {
        drawLine(ctx, -58 + i * 15, 34, -34 + i * 15, -38, color, 0.7);
    }

    drawMeasurementLine(ctx, -74, -70, 78, -70, "128.50", color);
    drawMeasurementLine(ctx, 96, -42, 96, 36, "26.00", color);
    drawBlueprintText(ctx, "45°", 58, 54, color, -0.2);
    ctx.restore();
}

function drawTechnicalGridBlock(ctx, x, y, width, height, color) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, width, height);

    for (let ix = x + 26; ix < x + width; ix += 26) {
        drawLine(ctx, ix, y, ix, y + height, color, 0.6);
    }

    for (let iy = y + 24; iy < y + height; iy += 24) {
        drawLine(ctx, x, iy, x + width, iy, color, 0.6);
    }

    drawLine(ctx, x - 18, y + height / 2, x + width + 18, y + height / 2, color, 1);
    drawLine(ctx, x + width / 2, y - 18, x + width / 2, y + height + 18, color, 1);
    drawBlueprintText(ctx, "R12", x + width - 20, y + 16, color);
    drawBlueprintText(ctx, "0.02 A", x + 34, y + 16, color);
    ctx.restore();
}

function drawBlueprintLayer(ctx) {
    const goldLine = "rgba(246, 195, 67, 0.22)";
    const goldStrong = "rgba(246, 195, 67, 0.36)";
    const greyLine = "rgba(215, 226, 239, 0.18)";

    drawTechnicalGridBlock(ctx, 198, 46, 152, 170, goldLine);
    drawConstructionCircle(ctx, 185, 284, 92, goldStrong);
    drawMechanicalOutline(ctx, 930, 170, 1.05, "rgba(246, 195, 67, 0.42)");
    drawCaliperMotif(ctx);

    ctx.save();
    ctx.globalAlpha = 0.85;
    drawDimensionMark(ctx, 54, 251, 158, 251, goldStrong);
    drawDimensionMark(ctx, 760, 119, 854, 119, goldStrong);
    drawDimensionMark(ctx, 894, 650, 1030, 650, greyLine);
    drawMeasurementLine(ctx, 834, 332, 1018, 332, "L=184.0", goldLine);
    drawMeasurementLine(ctx, 1008, 908, 1008, 1280, "DETAIL B", goldLine);
    drawMeasurementLine(ctx, 74, 1388, 256, 1388, "BASE REF", goldLine);
    drawBlueprintText(ctx, "6°", 285, 264, goldStrong, 0.76);
    drawBlueprintText(ctx, "RTP", 244, 176, goldStrong, -1.48);
    ctx.restore();

    ctx.save();
    ctx.strokeStyle = goldLine;
    ctx.lineWidth = 1;
    for (let y = 980; y <= 1510; y += 44) {
        drawLine(ctx, 22, y, 52, y, goldLine, 1);
        drawLine(ctx, CARD_WIDTH - 22, y, CARD_WIDTH - 52, y, goldLine, 1);
    }
    for (let x = 50; x <= 288; x += 36) {
        drawLine(ctx, x, 1450, x + 92, 1450, "rgba(246,195,67,0.12)", 1);
        drawLine(ctx, x, 1472, x + 58, 1472, "rgba(246,195,67,0.10)", 1);
    }
    ctx.restore();
}

function drawCalendarIcon(ctx, x, y, color) {
    ctx.save();
    strokeRoundedRect(ctx, x - 22, y - 20, 44, 40, 7, color, 2.5);
    drawLine(ctx, x - 22, y - 8, x + 22, y - 8, color, 2);

    ctx.fillStyle = color;
    for (let row = 0; row < 2; row += 1) {
        for (let col = 0; col < 3; col += 1) {
            ctx.fillRect(x - 13 + col * 13, y + 1 + row * 10, 5, 5);
        }
    }

    drawLine(ctx, x - 12, y - 26, x - 12, y - 14, color, 3);
    drawLine(ctx, x + 12, y - 26, x + 12, y - 14, color, 3);
    ctx.restore();
}

function drawCircularImage(ctx, image, centerX, centerY, radius) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();

    // Avatar Discorda kadrujemy jak cover, z zachowaniem proporcji.
    const sourceSize = Math.min(image.width, image.height);
    const sourceX = (image.width - sourceSize) / 2;
    const sourceY = (image.height - sourceSize) / 2;

    ctx.drawImage(
        image,
        sourceX,
        sourceY,
        sourceSize,
        sourceSize,
        centerX - radius,
        centerY - radius,
        radius * 2,
        radius * 2
    );
    ctx.restore();
}

function drawAvatarPlaceholder(ctx, centerX, centerY, radius, username, accent = COLORS.gold) {
    const gradient = ctx.createLinearGradient(centerX - radius, centerY - radius, centerX + radius, centerY + radius);
    const initial = String(username || "?").slice(0, 1).toUpperCase();

    gradient.addColorStop(0, "#1d2635");
    gradient.addColorStop(1, "#020617");
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = accent;
    ctx.font = `900 ${Math.floor(radius * 0.82)}px ${getFontFamily()}`;
    ctx.textAlign = "center";
    ctx.fillText(initial, centerX, centerY + radius * 0.3);
    ctx.textAlign = "left";
}

function drawAvatar(ctx, user, avatarImage, centerX, centerY, radius, accent) {
    ctx.save();
    ctx.shadowColor = accent;
    ctx.shadowBlur = 24;
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius + 9, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(250, 166, 26, 0.10)";
    ctx.fill();
    ctx.restore();

    if (avatarImage) {
        drawCircularImage(ctx, avatarImage, centerX, centerY, radius);
    } else {
        drawAvatarPlaceholder(ctx, centerX, centerY, radius, user.username, accent);
    }

    ctx.beginPath();
    ctx.arc(centerX, centerY, radius + 5, 0, Math.PI * 2);
    ctx.strokeStyle = accent;
    ctx.lineWidth = Math.max(3, Math.floor(radius / 11));
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(centerX, centerY, radius + 13, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.lineWidth = 1.4;
    ctx.stroke();
}

function drawListAvatarPlaceholder(ctx, centerX, centerY, radius, username) {
    const gradient = ctx.createLinearGradient(centerX - radius, centerY - radius, centerX + radius, centerY + radius);
    const initial = String(username || "?").slice(0, 1).toUpperCase();

    gradient.addColorStop(0, "#162033");
    gradient.addColorStop(1, "#050914");

    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.fillStyle = gradient;
    ctx.fill();

    ctx.fillStyle = "#d8e0ea";
    ctx.font = `900 ${Math.floor(radius * 0.82)}px ${getFontFamily()}`;
    ctx.textAlign = "center";
    ctx.fillText(initial, centerX, centerY + radius * 0.3);
    ctx.textAlign = "left";
}

function drawListAvatar(ctx, user, avatarImage, centerX, centerY, radius) {
    ctx.save();
    ctx.shadowColor = "rgba(0, 0, 0, 0.45)";
    ctx.shadowBlur = 5;
    ctx.shadowOffsetY = 2;
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius + 1, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(7, 12, 18, 0.86)";
    ctx.fill();
    ctx.restore();

    if (avatarImage) {
        drawCircularImage(ctx, avatarImage, centerX, centerY, radius);
    } else {
        drawListAvatarPlaceholder(ctx, centerX, centerY, radius, user.username);
    }

    ctx.beginPath();
    ctx.arc(centerX, centerY, radius + 1.5, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(160, 171, 184, 0.72)";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(centerX, centerY, radius + 4, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
    ctx.lineWidth = 1;
    ctx.stroke();
}

function drawLaurelSide(ctx, centerX, centerY, radius, side, color) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.8;
    ctx.globalAlpha = 0.94;
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius + 29, side > 0 ? -1.08 : Math.PI + 1.08, side > 0 ? 1.08 : Math.PI - 1.08, side < 0);
    ctx.stroke();

    for (let i = 0; i < 12; i += 1) {
        const t = -0.98 + i * 0.18;
        const angle = side > 0 ? t : Math.PI - t;
        const leafX = centerX + Math.cos(angle) * (radius + 30);
        const leafY = centerY + Math.sin(angle) * (radius + 30);

        ctx.save();
        ctx.translate(leafX, leafY);
        ctx.rotate(angle + (side > 0 ? 0.85 : -0.85));
        ctx.beginPath();
        ctx.ellipse(0, 0, 7, 17, 0, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.restore();
    }

    ctx.restore();
}

function drawBackground(ctx) {
    const gradient = ctx.createLinearGradient(0, 0, CARD_WIDTH, CARD_HEIGHT);

    gradient.addColorStop(0, COLORS.bgTop);
    gradient.addColorStop(0.48, COLORS.bgMid);
    gradient.addColorStop(1, COLORS.bgBottom);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

    // Delikatna tekstura szczotkowanego metalu bez losowości, żeby render był powtarzalny.
    for (let i = 0; i < 230; i += 1) {
        const x = (i * 83) % CARD_WIDTH;
        const y = (i * 151) % CARD_HEIGHT;
        const alpha = 0.009 + (i % 6) * 0.002;

        drawLine(ctx, x - 58, y, x + 86, y + 5, `rgba(255,255,255,${alpha})`, 1);
    }

    for (let x = -120; x <= CARD_WIDTH + 80; x += 54) {
        drawLine(ctx, x, 0, x + 260, CARD_HEIGHT, COLORS.grid);
    }

    for (let y = 70; y <= CARD_HEIGHT; y += 54) {
        drawLine(ctx, 0, y, CARD_WIDTH, y, "rgba(246, 195, 67, 0.032)");
    }

    for (let x = 120; x < CARD_WIDTH; x += 180) {
        for (let y = 230; y < CARD_HEIGHT - 140; y += 180) {
            drawLine(ctx, x - 12, y, x + 12, y, "rgba(148, 163, 184, 0.05)", 1);
            drawLine(ctx, x, y - 12, x, y + 12, "rgba(148, 163, 184, 0.05)", 1);
        }
    }

    // Pełna warstwa blueprint: suwmiarka, przekroje, wymiary i okręgi konstrukcyjne.
    drawBlueprintLayer(ctx);

    ctx.save();
    ctx.globalAlpha = 0.08;
    ctx.strokeStyle = COLORS.blue;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(112, 930, 118, 0, Math.PI * 1.45);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(112, 930, 74, 0.2, Math.PI * 1.65);
    ctx.stroke();
    drawLine(ctx, 112, 812, 112, 1048, COLORS.blue, 1);
    drawLine(ctx, -6, 930, 230, 930, COLORS.blue, 1);
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = 0.12;
    ctx.strokeStyle = COLORS.gold;
    ctx.lineWidth = 1;
    for (let i = 0; i < 4; i += 1) {
        ctx.beginPath();
        ctx.arc(868, 430 + i * 170, 84 + i * 12, Math.PI * 0.08, Math.PI * 1.46);
        ctx.stroke();
    }
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = 0.14;
    drawDimensionMark(ctx, 246, 210, 418, 210, "rgba(246,195,67,0.38)");
    drawDimensionMark(ctx, 682, 774, 944, 774, "rgba(72,183,255,0.30)");
    drawDimensionMark(ctx, 170, 1290, 310, 1290, "rgba(246,195,67,0.28)");
    drawLine(ctx, 860, 242, 980, 292, "rgba(148,163,184,0.22)", 1);
    drawLine(ctx, 872, 232, 992, 282, "rgba(148,163,184,0.12)", 1);
    ctx.restore();

    // Narożne ornamenty techniczne utrzymują klimat CAD bez obniżania kontrastu.
    ctx.save();
    ctx.globalAlpha = 0.26;
    [["left", 74, 226], ["right", CARD_WIDTH - 74, 226], ["left", 74, CARD_HEIGHT - 214], ["right", CARD_WIDTH - 74, CARD_HEIGHT - 214]].forEach(([, x, y]) => {
        const direction = x < CARD_WIDTH / 2 ? 1 : -1;

        drawLine(ctx, x, y, x + direction * 70, y, "rgba(246,195,67,0.38)", 2);
        drawLine(ctx, x, y, x, y + 52, "rgba(246,195,67,0.22)", 2);
        drawLine(ctx, x + direction * 20, y + 16, x + direction * 92, y + 16, "rgba(255,255,255,0.08)", 1);
    });
    ctx.restore();

    drawGlow(ctx, 230, 262, 420, "rgba(246, 195, 67, 0.17)");
    drawGlow(ctx, 846, 1130, 460, "rgba(72, 183, 255, 0.12)");
    drawGlow(ctx, CARD_WIDTH / 2, 50, 520, "rgba(246, 195, 67, 0.08)");
    drawGlow(ctx, CARD_WIDTH / 2, CARD_HEIGHT - 50, 520, "rgba(246, 195, 67, 0.08)");

    // Winieta.
    const vignette = ctx.createRadialGradient(CARD_WIDTH / 2, CARD_HEIGHT / 2, 240, CARD_WIDTH / 2, CARD_HEIGHT / 2, 900);

    vignette.addColorStop(0, "rgba(0,0,0,0)");
    vignette.addColorStop(1, "rgba(0,0,0,0.50)");
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
}

function drawOuterFrame(ctx) {
    const outerGradient = ctx.createLinearGradient(30, 30, CARD_WIDTH - 30, CARD_HEIGHT - 30);

    outerGradient.addColorStop(0, "rgba(255,255,255,0.16)");
    outerGradient.addColorStop(0.18, "rgba(246,195,67,0.72)");
    outerGradient.addColorStop(0.5, "rgba(246,195,67,0.20)");
    outerGradient.addColorStop(0.82, "rgba(246,195,67,0.66)");
    outerGradient.addColorStop(1, "rgba(255,255,255,0.10)");

    drawGlow(ctx, CARD_WIDTH / 2, 28, 300, "rgba(246,195,67,0.12)");
    drawGlow(ctx, CARD_WIDTH / 2, CARD_HEIGHT - 28, 300, "rgba(246,195,67,0.12)");

    strokeChamferRect(ctx, 30, 30, CARD_WIDTH - 60, CARD_HEIGHT - 60, 28, "rgba(0,0,0,0.88)", 5);
    strokeChamferRect(ctx, 32, 32, CARD_WIDTH - 64, CARD_HEIGHT - 64, 26, outerGradient, 2.5);
    strokeChamferRect(ctx, 42, 42, CARD_WIDTH - 84, CARD_HEIGHT - 84, 20, "rgba(255,255,255,0.075)", 1.2);
    strokeChamferRect(ctx, 50, 50, CARD_WIDTH - 100, CARD_HEIGHT - 100, 16, "rgba(246,195,67,0.18)", 1);

    const corner = 120;

    drawLine(ctx, 48, 48, 48 + corner, 48, "rgba(246, 195, 67, 0.90)", 3);
    drawLine(ctx, 48, 48, 48, 48 + corner, "rgba(246, 195, 67, 0.70)", 3);
    drawLine(ctx, CARD_WIDTH - 48, 48, CARD_WIDTH - 48 - corner, 48, "rgba(246, 195, 67, 0.76)", 3);
    drawLine(ctx, CARD_WIDTH - 48, 48, CARD_WIDTH - 48, 48 + corner, "rgba(246, 195, 67, 0.56)", 3);
    drawLine(ctx, 48, CARD_HEIGHT - 48, 48 + corner, CARD_HEIGHT - 48, "rgba(246, 195, 67, 0.58)", 3);
    drawLine(ctx, 48, CARD_HEIGHT - 48, 48, CARD_HEIGHT - 48 - corner, "rgba(246, 195, 67, 0.42)", 3);
    drawLine(ctx, CARD_WIDTH - 48, CARD_HEIGHT - 48, CARD_WIDTH - 48 - corner, CARD_HEIGHT - 48, "rgba(246, 195, 67, 0.90)", 3);
    drawLine(ctx, CARD_WIDTH - 48, CARD_HEIGHT - 48, CARD_WIDTH - 48, CARD_HEIGHT - 48 - corner, "rgba(246, 195, 67, 0.64)", 3);

    [48, CARD_WIDTH - 48].forEach((x) => {
        [48, CARD_HEIGHT - 48].forEach((y) => {
            drawStar(ctx, x, y, 6, 3, COLORS.gold);
        });
    });
}

function drawEmblem(ctx) {
    const x = 42;
    const y = 58;
    const width = 168;
    const height = 136;

    drawMetalPanel(ctx, x, y, width, height, 18, TOP_CARD_ACCENTS[1], {
        alpha: 0.92
    });

    ctx.save();
    ctx.translate(x + width / 2, y + 47);
    ctx.beginPath();
    ctx.moveTo(0, -29);
    ctx.lineTo(37, -9);
    ctx.lineTo(28, 35);
    ctx.lineTo(0, 52);
    ctx.lineTo(-28, 35);
    ctx.lineTo(-37, -9);
    ctx.closePath();
    ctx.fillStyle = "rgba(246, 195, 67, 0.18)";
    ctx.fill();
    ctx.strokeStyle = COLORS.gold;
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.strokeStyle = "rgba(246, 195, 67, 0.88)";
    ctx.lineWidth = 1.5;
    [-1, 1].forEach((side) => {
        ctx.beginPath();
        ctx.arc(0, 16, 27, side < 0 ? Math.PI * 0.66 : Math.PI * 0.08, side < 0 ? Math.PI * 1.30 : Math.PI * 0.92, side > 0);
        ctx.stroke();

        for (let i = 0; i < 6; i += 1) {
            const angle = side < 0 ? Math.PI * 0.72 + i * 0.10 : Math.PI * 0.28 - i * 0.10;
            const leafX = Math.cos(angle) * 27;
            const leafY = 16 + Math.sin(angle) * 27;

            ctx.save();
            ctx.translate(leafX, leafY);
            ctx.rotate(angle + (side < 0 ? -0.72 : 0.72));
            ctx.beginPath();
            ctx.ellipse(0, 0, 3.2, 8.5, 0, 0, Math.PI * 2);
            ctx.fillStyle = COLORS.gold;
            ctx.fill();
            ctx.restore();
        }
    });
    drawStar(ctx, 0, 9, 14, 6, COLORS.gold);
    ctx.restore();

    drawFittedText(ctx, "POLIGON CAD", x + width / 2, y + 100, width - 26, {
        color: COLORS.gold,
        maxSize: 19,
        minSize: 12,
        weight: "900",
        align: "center"
    });
    drawFittedText(ctx, "RETROFORMA", x + width / 2, y + 122, width - 28, {
        color: "#cbd5e1",
        maxSize: 12,
        minSize: 9,
        weight: "900",
        align: "center"
    });
}

function drawHeader(ctx) {
    drawEmblem(ctx);

    ctx.save();
    ctx.shadowColor = "rgba(0, 0, 0, 0.80)";
    ctx.shadowBlur = 12;
    ctx.shadowOffsetY = 7;

    const titleGradient = ctx.createLinearGradient(0, 42, 0, 142);

    titleGradient.addColorStop(0, "#ffffff");
    titleGradient.addColorStop(0.30, "#f3f4f6");
    titleGradient.addColorStop(0.48, "#8d98a5");
    titleGradient.addColorStop(0.58, "#ffffff");
    titleGradient.addColorStop(0.76, "#adb7c4");
    titleGradient.addColorStop(1, "#ffffff");
    ctx.fillStyle = titleGradient;
    ctx.font = `900 66px ${getFontFamily()}`;
    ctx.textAlign = "center";
    ctx.strokeStyle = "rgba(0, 0, 0, 0.78)";
    ctx.lineWidth = 5;
    ctx.strokeText("RANKING", CARD_WIDTH / 2, 106);
    ctx.fillText("RANKING", CARD_WIDTH / 2, 106);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.30)";
    ctx.lineWidth = 1.2;
    ctx.strokeText("RANKING", CARD_WIDTH / 2, 106);

    const secondGradient = ctx.createLinearGradient(0, 96, 0, 160);

    secondGradient.addColorStop(0, "#fff1a3");
    secondGradient.addColorStop(0.34, "#ffd35a");
    secondGradient.addColorStop(0.58, "#e39b10");
    secondGradient.addColorStop(1, "#7a4300");
    ctx.fillStyle = secondGradient;
    ctx.font = `900 48px ${getFontFamily()}`;
    ctx.strokeStyle = "rgba(0, 0, 0, 0.82)";
    ctx.lineWidth = 4;
    ctx.strokeText("POLIGONU CAD", CARD_WIDTH / 2, 164);
    ctx.fillText("POLIGONU CAD", CARD_WIDTH / 2, 164);
    ctx.strokeStyle = "rgba(255, 230, 130, 0.22)";
    ctx.lineWidth = 1;
    ctx.strokeText("POLIGONU CAD", CARD_WIDTH / 2, 164);
    ctx.restore();

    ctx.fillStyle = "#c7d0dc";
    ctx.font = `900 22px ${getFontFamily()}`;
    ctx.textAlign = "center";
    ctx.fillText("RYWALIZUJ  •  UCZ SIĘ  •  DOSKONAL", CARD_WIDTH / 2, 212);

    drawStar(ctx, CARD_WIDTH / 2, 32, 15, 6, COLORS.gold);
    drawLine(ctx, 382, 32, 488, 32, "rgba(246, 195, 67, 0.82)", 4);
    drawLine(ctx, 592, 32, 698, 32, "rgba(246, 195, 67, 0.82)", 4);
    drawLine(ctx, 408, 45, 488, 45, "rgba(246, 195, 67, 0.46)", 2.5);
    drawLine(ctx, 592, 45, 672, 45, "rgba(246, 195, 67, 0.46)", 2.5);
    ctx.textAlign = "left";
}

function drawRankLabel(ctx, centerX, y, width, rankName, accent) {
    ctx.font = `900 18px ${getFontFamily()}`;

    const labelWidth = Math.min(width - 64, Math.max(155, ctx.measureText(rankName).width + 58));
    const x = centerX - labelWidth / 2;

    fillRoundedRect(ctx, x, y, labelWidth, 36, 8, "rgba(2, 6, 23, 0.90)");
    strokeRoundedRect(ctx, x, y, labelWidth, 36, 8, accent.line, 1.5);

    drawFittedText(ctx, rankName, centerX, y + 25, labelWidth - 28, {
        color: accent.main,
        maxSize: 18,
        minSize: 11,
        weight: "900",
        align: "center"
    });
}

function drawMedallion(ctx, x, y, radius, position, accent) {
    ctx.save();
    ctx.shadowColor = accent.glow;
    ctx.shadowBlur = 24;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = createMetalGradient(ctx, x - radius, y - radius, radius * 2, radius * 2, accent.soft);
    ctx.fill();
    ctx.restore();

    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.strokeStyle = accent.line;
    ctx.lineWidth = 5;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(x, y, radius - 9, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(255,255,255,0.16)";
    ctx.lineWidth = 1.2;
    ctx.stroke();

    drawFittedText(ctx, String(position), x, y + radius * 0.34, radius * 1.2, {
        color: COLORS.text,
        maxSize: radius * 1.02,
        minSize: 20,
        weight: "900",
        align: "center"
    });
}

function drawTopStat(ctx, x, y, width, iconType, label, value, color) {
    fillRoundedRect(ctx, x, y, width, 54, 9, "rgba(2, 6, 23, 0.78)");
    strokeRoundedRect(ctx, x, y, width, 54, 9, "rgba(255,255,255,0.10)", 1);

    const iconX = x + 22;
    const iconY = y + 28;

    if (iconType === "pp") {
        drawStar(ctx, iconX, iconY, 13, 5, color);
    } else if (iconType === "xp") {
        drawHexIcon(ctx, iconX, iconY, 12, color);
    } else {
        drawTargetIcon(ctx, iconX, iconY, 12, color);
    }

    ctx.fillStyle = COLORS.muted;
    ctx.font = `900 10px ${getFontFamily()}`;
    ctx.textAlign = "center";
    ctx.fillText(label.toUpperCase(), x + width / 2 + 9, y + 18);
    ctx.textAlign = "left";
    drawFittedText(ctx, value, x + width / 2 + 9, y + 41, width - 44, {
        color,
        maxSize: 22,
        minSize: 12,
        weight: "900",
        align: "center"
    });
}

function drawXPProgressBar(ctx, x, y, width, user, accent) {
    const progress = getCurrentLevelProgress(user.xp);
    const percent = clamp(progress.percent || 0, 0, 1);
    const moduleHeight = 30;
    const textWidth = width < 280 ? 122 : 150;
    const gap = 12;
    const barWidth = Math.max(86, width - textWidth - gap);
    const barX = x + textWidth + gap;
    const barY = y + 11;
    const barHeight = 9;
    const fillWidth = barWidth * percent;

    fillRoundedRect(ctx, x, y, width, moduleHeight, 8, "rgba(2, 6, 23, 0.42)");
    strokeRoundedRect(ctx, x, y, width, moduleHeight, 8, "rgba(255,255,255,0.07)", 1);

    drawFittedText(ctx, `${formatNumber(user.xp)} / ${formatNumber(progress.nextLevelXp)} XP`, x + textWidth / 2, y + 20, textWidth - 8, {
        color: "#d7e2ef",
        maxSize: width < 280 ? 11 : 12,
        minSize: 8,
        weight: "900",
        align: "center"
    });

    fillRoundedRect(ctx, barX, barY, barWidth, barHeight, 5, "rgba(0, 0, 0, 0.72)");

    if (fillWidth > 0) {
        const gradient = ctx.createLinearGradient(barX, barY, barX + barWidth, barY);

        gradient.addColorStop(0, COLORS.blue);
        gradient.addColorStop(0.72, "#6fd3ff");
        gradient.addColorStop(1, COLORS.blue);

        ctx.save();
        ctx.shadowColor = COLORS.blue;
        ctx.shadowBlur = 4;
        fillRoundedRect(ctx, barX, barY, fillWidth, barHeight, Math.min(5, fillWidth / 2), gradient);
        ctx.restore();
    }

    strokeRoundedRect(ctx, barX, barY, barWidth, barHeight, 5, "rgba(255,255,255,0.18)", 1);
}

function drawTopCard(ctx, user, avatarImage, layout, accent) {
    const { x, y, width, height, avatarRadius } = layout;
    const centerX = x + width / 2;
    const isLeader = user.position === 1;
    const avatarY = y + (isLeader ? 168 : 142);
    const nameY = y + (isLeader ? 302 : 248);
    const rankY = y + (isLeader ? 328 : 274);
    const levelY = y + (isLeader ? 372 : 314);
    const statsY = y + (isLeader ? 408 : 352);
    const xpY = y + (isLeader ? 492 : 414);
    const statGap = isLeader ? 12 : 10;
    const statPadding = isLeader ? 56 : 52;
    const statWidth = (width - statPadding - statGap * 2) / 3;

    drawMetalPanel(ctx, x, y, width, height, 22, accent, {
        glow: true
    });

    const matte = ctx.createLinearGradient(x, y, x, y + height);

    matte.addColorStop(0, "rgba(7, 12, 18, 0.64)");
    matte.addColorStop(0.52, "rgba(2, 6, 12, 0.40)");
    matte.addColorStop(1, "rgba(0, 0, 0, 0.58)");
    fillChamferRect(ctx, x + 14, y + 14, width - 28, height - 28, 16, matte);

    strokeChamferRect(ctx, x + 18, y + 18, width - 36, height - 36, 16, "rgba(255,255,255,0.10)", 1.1);
    strokeChamferRect(ctx, x + 24, y + 24, width - 48, height - 48, 12, accent.soft, 1);

    drawMedallion(ctx, x + (isLeader ? 58 : 45), y + (isLeader ? 54 : 50), isLeader ? 42 : 32, user.position, accent);

    drawLaurelSide(ctx, centerX, avatarY, avatarRadius, -1, accent.main);
    drawLaurelSide(ctx, centerX, avatarY, avatarRadius, 1, accent.main);
    drawAvatar(ctx, user, avatarImage, centerX, avatarY, avatarRadius, accent.main);
    drawStar(ctx, centerX, avatarY + avatarRadius + 18, isLeader ? 16 : 13, isLeader ? 7 : 6, COLORS.gold);

    drawFittedText(ctx, trimText(user.username, isLeader ? 25 : 26), centerX, nameY, width - 48, {
        color: COLORS.text,
        maxSize: isLeader ? 39 : 32,
        minSize: 16,
        weight: "900",
        align: "center"
    });

    drawRankLabel(ctx, centerX, rankY, width, user.rankName, accent);

    fillRoundedRect(ctx, x + 28, levelY, width - 56, 32, 5, "rgba(0,0,0,0.44)");
    drawFittedText(ctx, "LVL", x + width - 122, levelY + 23, 50, {
        color: COLORS.muted,
        maxSize: 13,
        minSize: 9,
        weight: "900"
    });
    drawFittedText(ctx, String(user.level), x + width - 70, levelY + 24, 46, {
        color: COLORS.green,
        maxSize: 18,
        minSize: 10,
        weight: "900"
    });

    drawTopStat(ctx, x + 28, statsY, statWidth, "pp", "PP", `${formatNumber(user.pp)}`, COLORS.gold);
    drawTopStat(ctx, x + 28 + statWidth + statGap, statsY, statWidth, "xp", "XP", `${formatNumber(user.xp)}`, COLORS.blue);
    drawTopStat(ctx, x + 28 + (statWidth + statGap) * 2, statsY, statWidth, "missions", "MISJE", `${formatNumber(user.missionsCompleted)}`, COLORS.green);
    drawXPProgressBar(ctx, x + 28, xpY, width - 56, user, accent);
}

function drawEmptyRanking(ctx) {
    drawMetalPanel(ctx, 110, 300, 860, 360, 28, TOP_CARD_ACCENTS[1], {
        alpha: 0.94
    });

    drawFittedText(ctx, "Brak sklasyfikowanych Kadetów", CARD_WIDTH / 2, 448, 740, {
        color: COLORS.gold,
        maxSize: 38,
        minSize: 22,
        weight: "900",
        align: "center"
    });
    drawFittedText(ctx, "Pierwsze zaakceptowane misje uruchomią ranking.", CARD_WIDTH / 2, 496, 720, {
        color: COLORS.muted,
        maxSize: 22,
        minSize: 14,
        weight: "700",
        align: "center"
    });
}

function drawTopThree(ctx, users, avatarImages) {
    if (users.length === 0) {
        drawEmptyRanking(ctx);
        return;
    }

    const layouts = {
        1: {
            x: 345,
            y: 244,
            width: 390,
            height: 545,
            avatarRadius: 88
        },
        2: {
            x: 30,
            y: 352,
            width: 310,
            height: 456,
            avatarRadius: 63
        },
        3: {
            x: 740,
            y: 352,
            width: 310,
            height: 456,
            avatarRadius: 63
        }
    };

    const cardOrder = [
        users[1],
        users[0],
        users[2]
    ].filter(Boolean);

    if (users[0]) {
        const leaderLayout = layouts[1];

        drawGlow(
            ctx,
            leaderLayout.x + leaderLayout.width / 2,
            leaderLayout.y + leaderLayout.height / 2,
            345,
            "rgba(246, 195, 67, 0.30)"
        );
    }

    for (const user of cardOrder) {
        drawTopCard(
            ctx,
            user,
            avatarImages[user.discordId],
            layouts[user.position],
            TOP_CARD_ACCENTS[user.position]
        );
    }
}

function drawPodiumSeparator(ctx) {
    const x = 88;
    const y = 824;
    const width = 904;
    const gradient = ctx.createLinearGradient(x, y, x + width, y);

    gradient.addColorStop(0, "rgba(246,195,67,0)");
    gradient.addColorStop(0.12, "rgba(246,195,67,0.46)");
    gradient.addColorStop(0.5, "rgba(255,255,255,0.20)");
    gradient.addColorStop(0.88, "rgba(246,195,67,0.46)");
    gradient.addColorStop(1, "rgba(246,195,67,0)");

    fillChamferRect(ctx, x, y, width, 10, 5, "rgba(2, 6, 23, 0.68)");
    strokeChamferRect(ctx, x, y, width, 10, 5, gradient, 1.6);
    drawLine(ctx, x + 36, y + 5, x + width - 36, y + 5, "rgba(148,163,184,0.16)", 1);
}

function drawTableHeader(ctx, x, y, width) {
    const dividerColor = "rgba(148, 163, 184, 0.24)";

    ctx.fillStyle = "#c6d0dc";
    ctx.font = `900 14px ${getFontFamily()}`;
    ctx.fillText("POZ.", x + 18, y);
    ctx.fillText("KADET", x + 116, y);
    ctx.fillText("STOPIEŃ", x + 390, y);
    ctx.textAlign = "center";
    ctx.fillText("LVL", x + 555, y);
    ctx.fillText("PP", x + 664, y);
    ctx.fillText("XP", x + 775, y);
    ctx.fillText("MISJE", x + 902, y);
    ctx.textAlign = "left";

    drawLine(ctx, x + 12, y + 18, x + width - 12, y + 18, "rgba(148, 163, 184, 0.24)", 1.2);
    [92, 374, 520, 606, 718, 838].forEach((offset) => {
        drawLine(ctx, x + offset, y - 28, x + offset, y + 458, dividerColor, 1);
    });
}

function drawListRow(ctx, user, avatarImage, x, y, width, index) {
    const rowHeight = 60;
    const rowFill = index % 2 === 0 ? "rgba(14, 22, 31, 0.82)" : "rgba(5, 10, 16, 0.82)";

    fillRoundedRect(ctx, x, y, width, rowHeight, 4, rowFill);
    drawLine(ctx, x + 10, y + rowHeight, x + width - 10, y + rowHeight, "rgba(148, 163, 184, 0.14)", 1);
    [92, 374, 520, 606, 718, 838].forEach((offset) => {
        drawLine(ctx, x + offset, y + 5, x + offset, y + rowHeight - 5, "rgba(148, 163, 184, 0.13)", 1);
    });

    drawFittedText(ctx, `#${user.position}`, x + 20, y + 39, 54, {
        color: "#d7e2ef",
        maxSize: 27,
        minSize: 16,
        weight: "900"
    });

    drawListAvatar(ctx, user, avatarImage, x + 92, y + 30, 23);
    drawFittedText(ctx, trimText(user.username, 25), x + 126, y + 40, 236, {
        color: COLORS.text,
        maxSize: 21,
        minSize: 12,
        weight: "900"
    });

    drawFittedText(ctx, user.rankName, x + 390, y + 40, 118, {
        color: "#d7e2ef",
        maxSize: 16,
        minSize: 10,
        weight: "900"
    });
    drawFittedText(ctx, `LV.${user.level}`, x + 555, y + 40, 70, {
        color: COLORS.green,
        maxSize: 19,
        minSize: 10,
        weight: "900",
        align: "center"
    });
    drawFittedText(ctx, `${formatNumber(user.pp)} PP`, x + 664, y + 40, 100, {
        color: COLORS.gold,
        maxSize: 17,
        minSize: 10,
        weight: "900",
        align: "center"
    });
    drawFittedText(ctx, `${formatNumber(user.xp)} XP`, x + 775, y + 40, 104, {
        color: COLORS.blue,
        maxSize: 17,
        minSize: 10,
        weight: "900",
        align: "center"
    });
    drawFittedText(ctx, formatNumber(user.missionsCompleted), x + 902, y + 40, 68, {
        color: COLORS.green,
        maxSize: 17,
        minSize: 10,
        weight: "900",
        align: "center"
    });
}

function drawRemainingUsers(ctx, users, avatarImages) {
    const x = 50;
    const y = 846;
    const width = 980;
    const listUsers = users.slice(3, 10);

    drawMetalPanel(ctx, x, y, width, 548, 18, TOP_CARD_ACCENTS[1], {
        alpha: 0.92
    });

    drawFittedText(ctx, "MIEJSCA 4-10", x + 34, y + 48, 300, {
        color: COLORS.text,
        maxSize: 28,
        minSize: 16,
        weight: "900"
    });

    if (listUsers.length === 0) {
        drawFittedText(ctx, "Czekamy na kolejnych kadetów w rankingu.", x + 34, y + 130, width - 68, {
            color: COLORS.muted,
            maxSize: 22,
            minSize: 14,
            weight: "700"
        });
        return;
    }

    drawTableHeader(ctx, x + 20, y + 88, width - 40);

    listUsers.forEach((user, index) => {
        drawListRow(ctx, user, avatarImages[user.discordId], x + 20, y + 112 + index * 60, width - 40, index);
    });
}

function drawFooterPanel(ctx, x, y, width, label, value, accent, iconType) {
    drawMetalPanel(ctx, x, y, width, 112, 14, {
        ...TOP_CARD_ACCENTS[1],
        main: accent,
        line: "rgba(246, 195, 67, 0.56)",
        soft: "rgba(246, 195, 67, 0.12)",
        deep: "rgba(246, 195, 67, 0.06)"
    }, {
        alpha: 0.88
    });
    strokeChamferRect(ctx, x + 7, y + 7, width - 14, 98, 10, "rgba(246,195,67,0.30)", 1.2);

    const isGroupPanel = iconType === "group";
    const iconX = x + (isGroupPanel ? 74 : 62);
    const iconY = y + 60;
    const textX = x + (isGroupPanel ? 142 : 124);
    const textWidth = width - (isGroupPanel ? 164 : 144);

    if (isGroupPanel) {
        ctx.save();
        ctx.translate(iconX, iconY);
        ctx.scale(0.98, 0.98);
        drawGroupIcon(ctx, 0, 0, accent);
        ctx.restore();
    } else if (iconType === "target") {
        drawTargetIcon(ctx, iconX, iconY, 30, accent);
    } else {
        ctx.save();
        ctx.translate(iconX, iconY);
        ctx.scale(1.22, 1.22);
        drawCalendarIcon(ctx, 0, 0, accent);
        ctx.restore();
    }

    drawFittedText(ctx, label.toUpperCase(), textX, y + 46, textWidth, {
        color: "#c6d0dc",
        maxSize: 16,
        minSize: 10,
        weight: "900"
    });
    drawFittedText(ctx, value, textX, y + 86, textWidth, {
        color: COLORS.text,
        maxSize: 33,
        minSize: 15,
        weight: "900"
    });
}

function drawFooter(ctx, stats, updatedAt) {
    const y = 1430;

    drawFooterPanel(ctx, 40, y, 310, "Kadetów", formatNumber(stats.user_count), "#8bc34a", "group");
    drawFooterPanel(ctx, 385, y, 310, "Misji ukończonych", formatNumber(stats.completed_missions), COLORS.red, "target");
    drawFooterPanel(ctx, 730, y, 310, "Aktualizacja", formatUpdatedAt(updatedAt), "#8bc34a", "calendar");

    drawFittedText(ctx, "RETROFORMA", CARD_WIDTH / 2, 1562, 390, {
        color: "#e5e7eb",
        maxSize: 35,
        minSize: 18,
        weight: "900",
        align: "center"
    });
    drawFittedText(ctx, "POLIGON CAD", CARD_WIDTH / 2, 1588, 330, {
        color: COLORS.gold,
        maxSize: 21,
        minSize: 12,
        weight: "900",
        align: "center"
    });
    drawLine(ctx, 360, 1578, 462, 1578, "rgba(246,195,67,0.82)", 2.5);
    drawLine(ctx, 618, 1578, 720, 1578, "rgba(246,195,67,0.82)", 2.5);
    drawStar(ctx, 340, 1578, 8, 3, COLORS.gold);
    drawStar(ctx, 740, 1578, 8, 3, COLORS.gold);
}

async function loadAvatarImages(loadImage, users) {
    const avatarEntries = await Promise.all(users.map(async (user) => {
        if (!user.avatarUrl) {
            return [user.discordId, null];
        }

        try {
            return [user.discordId, await loadImage(user.avatarUrl)];
        } catch (error) {
            return [user.discordId, null];
        }
    }));

    return Object.fromEntries(avatarEntries);
}

function normalizeUser(user, index) {
    const safeLevel = Math.max(1, getSafeNumber(user.level, 1));

    return {
        discordId: user.discordId || user.discord_id || String(index + 1),
        position: Number(user.position) || index + 1,
        username: user.displayName || user.username || user.discord_id || "Nieznany Kadet",
        rankName: user.rankName || "Rekrut",
        level: safeLevel,
        pp: getSafeNumber(user.pp),
        xp: getSafeNumber(user.xp),
        missionsCompleted: getSafeNumber(user.missionsCompleted ?? user.missions_completed),
        avatarUrl: user.avatarUrl || null
    };
}

// Generuje statyczną grafikę PNG Rankingu 2.0.
async function createRankingCard({ users = [], stats = {}, updatedAt = new Date() }) {
    const {
        createCanvas,
        loadImage
    } = prepareCanvas();
    const normalizedUsers = users.slice(0, 10).map(normalizeUser);
    const avatarImages = await loadAvatarImages(loadImage, normalizedUsers);
    const canvas = createCanvas(CARD_WIDTH, CARD_HEIGHT);
    const ctx = canvas.getContext("2d");
    const safeStats = {
        user_count: getSafeNumber(stats.user_count),
        completed_missions: getSafeNumber(stats.completed_missions)
    };

    drawBackground(ctx);
    drawOuterFrame(ctx);
    drawHeader(ctx);
    drawTopThree(ctx, normalizedUsers.slice(0, 3), avatarImages);

    if (normalizedUsers.length > 0) {
        drawPodiumSeparator(ctx);
        drawRemainingUsers(ctx, normalizedUsers, avatarImages);
    }

    drawFooter(ctx, safeStats, updatedAt);

    return canvas.toBuffer("image/png");
}

module.exports = {
    createRankingCard
};
