const CARD_WIDTH = 1200;
const CARD_HEIGHT = 675;
const PROFILE_AVATAR_BOUNDS = {
    x: 135,
    y: 142,
    width: 160,
    height: 160
};
const PROFILE_AVATAR_FRAME_PADDING = 8;
const PROFILE_THEME_OVERLAY_MAX_ALPHA = 0.42;
const FALLBACK_FONT = "\"DejaVu Sans\", \"Noto Sans\", \"Liberation Sans\", \"Segoe UI\", \"Arial\", sans-serif";
let activeFontFamily = FALLBACK_FONT;

const {
    loadProfileAssets,
    registerProfileFont
} = require("./profileAssetService");
const {
    resolveProfileFrameAsset,
    resolveProfileThemeAsset
} = require("./profileEquipmentService");
const { loadUiAssetImage } = require("../ui/assetRegistry");

// Ładuje canvas dopiero przy generowaniu karty, żeby brak biblioteki nie psuł startu bota.
function loadCanvas() {
    try {
        return require("canvas");
    } catch (error) {
        const canvasError = new Error("Brakuje biblioteki canvas. Wykonaj: npm install canvas");
        canvasError.code = "CANVAS_NOT_INSTALLED";
        throw canvasError;
    }
}

function loadProfileEquipmentAssets(profile) {
    const themeAsset = resolveProfileThemeAsset(profile.equipment);
    const frameAsset = resolveProfileFrameAsset(profile.equipment);

    return {
        equippedProfileFrameCode: frameAsset?.id || null,
        equippedProfileFrame: frameAsset ? loadUiAssetImage("item", frameAsset.id) : null,
        equippedProfileThemeCode: themeAsset?.id || null,
        equippedProfileTheme: themeAsset ? loadUiAssetImage("item", themeAsset.id) : null
    };
}

function annotateFrameCenterAlpha(frameImage, canvasApi) {
    if (!frameImage || typeof frameImage.__profileCenterAlpha === "number") {
        return frameImage;
    }

    try {
        const sampleCanvas = canvasApi.createCanvas(frameImage.width, frameImage.height);
        const sampleCtx = sampleCanvas.getContext("2d");
        const samplePoints = [
            [0.5, 0.5],
            [0.5, 0.38],
            [0.5, 0.62],
            [0.35, 0.5],
            [0.65, 0.5]
        ];

        sampleCtx.drawImage(frameImage, 0, 0);
        frameImage.__profileCenterAlpha = Math.max(...samplePoints.map(([x, y]) => (
            sampleCtx.getImageData(
                Math.floor(frameImage.width * x),
                Math.floor(frameImage.height * y),
                1,
                1
            ).data[3]
        )));
    } catch (error) {
        frameImage.__profileCenterAlpha = 255;
    }

    return frameImage;
}

function loadProfileBadgeIcons(badges = []) {
    const badgeIcons = {};

    for (const badge of badges) {
        try {
            const icon = loadUiAssetImage("badge", badge.id);

            if (icon) {
                badgeIcons[badge.id] = icon;
            }
        } catch (error) {
            console.warn(`[PROFILE_RENDER] Nie udało się wczytać assetu odznaki ${badge.id}: ${error.message}`);
        }
    }

    return badgeIcons;
}

// Ładuje canvas, assety i opcjonalne ikony odznak.
async function loadCanvasContext(profile) {
    const canvasApi = loadCanvas();
    const registeredFontFamily = registerProfileFont(canvasApi.registerFont);

    activeFontFamily = registeredFontFamily ? `"${registeredFontFamily}", ${FALLBACK_FONT}` : FALLBACK_FONT;

    const equipmentAssets = loadProfileEquipmentAssets(profile);

    if (equipmentAssets.equippedProfileFrame) {
        annotateFrameCenterAlpha(equipmentAssets.equippedProfileFrame, canvasApi);
    }

    return {
        ...canvasApi,
        assets: {
            ...await loadProfileAssets(canvasApi.loadImage),
            ...equipmentAssets
        },
        badgeIcons: loadProfileBadgeIcons(profile.badges || [])
    };
}

// Zwraca font z assetów, jeśli został zarejestrowany, albo bezpieczny fallback.
function getFontFamily() {
    return activeFontFamily;
}

function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

function formatNumber(value) {
    return (Number(value) || 0).toLocaleString("pl-PL");
}

// Krzywa animacji przygotowana pod przyszłe generowanie GIF/WebP/klatek.
function easeOutCubic(value) {
    const progress = clamp(value, 0, 1);

    return 1 - Math.pow(1 - progress, 3);
}

// Zwraca procent wypełnienia paska dla konkretnej klatki animacji.
function getAnimatedProgressPercent(targetPercent, animationProgress = 1) {
    return clamp(targetPercent, 0, 1) * easeOutCubic(animationProgress);
}

// Przygotowuje listę wartości progressu dla przyszłej animacji paska XP.
function getProgressAnimationFrames(targetPercent, frameCount = 24) {
    const safeFrameCount = Math.max(2, Number(frameCount) || 24);

    return Array.from({
        length: safeFrameCount
    }, (_, index) => getAnimatedProgressPercent(targetPercent, index / (safeFrameCount - 1)));
}

// Skraca długie teksty, żeby nie wychodziły poza kartę.
function trimText(text, maxLength) {
    if (!text || text.length <= maxLength) {
        return text || "";
    }

    return `${text.slice(0, maxLength - 1)}…`;
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

function drawFittedText(ctx, text, x, y, maxWidth, options = {}) {
    const {
        color = "#f8fafc",
        maxSize = 34,
        minSize = 16,
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

function drawImageCover(ctx, image, x, y, width, height) {
    const imageWidth = image.width || width;
    const imageHeight = image.height || height;
    const scale = Math.max(width / imageWidth, height / imageHeight);
    const drawWidth = imageWidth * scale;
    const drawHeight = imageHeight * scale;
    const drawX = x + (width - drawWidth) / 2;
    const drawY = y + (height - drawHeight) / 2;

    ctx.drawImage(image, drawX, drawY, drawWidth, drawHeight);
}

function drawImageContain(ctx, image, x, y, width, height) {
    const imageWidth = image.width || width;
    const imageHeight = image.height || height;
    const scale = Math.min(width / imageWidth, height / imageHeight);
    const drawWidth = imageWidth * scale;
    const drawHeight = imageHeight * scale;
    const drawX = x + (width - drawWidth) / 2;
    const drawY = y + (height - drawHeight) / 2;

    ctx.drawImage(image, drawX, drawY, drawWidth, drawHeight);
}

function traceRender(options, step) {
    if (Array.isArray(options?.trace)) {
        options.trace.push(step);
    }
}

function drawProfileThemeOverlay(ctx, options = {}) {
    traceRender(options, "background:overlay");
    const overlay = ctx.createLinearGradient(0, 0, CARD_WIDTH, CARD_HEIGHT);

    overlay.addColorStop(0, "rgba(2, 6, 23, 0.34)");
    overlay.addColorStop(0.42, "rgba(2, 6, 23, 0.24)");
    overlay.addColorStop(1, "rgba(2, 6, 23, 0.42)");
    ctx.fillStyle = overlay;
    ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

    const vignette = ctx.createRadialGradient(
        CARD_WIDTH / 2,
        CARD_HEIGHT / 2,
        120,
        CARD_WIDTH / 2,
        CARD_HEIGHT / 2,
        650
    );

    vignette.addColorStop(0, "rgba(0, 0, 0, 0)");
    vignette.addColorStop(1, "rgba(0, 0, 0, 0.30)");
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
}

// Rysuje tło AAA: aktywny motyw profilu, asset domyślny albo techniczny gradient.
function drawBackground(ctx, assets, options = {}) {
    if (assets.equippedProfileTheme) {
        traceRender(options, "background:equipped-theme");
        drawImageCover(ctx, assets.equippedProfileTheme, 0, 0, CARD_WIDTH, CARD_HEIGHT);
        drawProfileThemeOverlay(ctx, options);
    } else if (assets.background) {
        traceRender(options, "background:default-asset");
        ctx.drawImage(assets.background, 0, 0, CARD_WIDTH, CARD_HEIGHT);
    } else {
        traceRender(options, "background:default-gradient");
        const gradient = ctx.createLinearGradient(0, 0, CARD_WIDTH, CARD_HEIGHT);

        gradient.addColorStop(0, "#05070d");
        gradient.addColorStop(0.42, "#101624");
        gradient.addColorStop(1, "#07090f");
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

        ctx.strokeStyle = "rgba(148, 163, 184, 0.055)";
        ctx.lineWidth = 1;

        for (let x = -60; x <= CARD_WIDTH; x += 42) {
            drawLine(ctx, x, 0, x + 150, CARD_HEIGHT, "rgba(148, 163, 184, 0.045)");
        }

        for (let y = 35; y <= CARD_HEIGHT; y += 42) {
            drawLine(ctx, 0, y, CARD_WIDTH, y, "rgba(254, 231, 92, 0.045)");
        }
    }

    const hasEquippedTheme = Boolean(assets.equippedProfileTheme);

    drawGlow(ctx, 235, 155, 260, hasEquippedTheme ? "rgba(250, 166, 26, 0.10)" : "rgba(250, 166, 26, 0.20)");
    drawGlow(ctx, 980, 520, 320, hasEquippedTheme ? "rgba(88, 101, 242, 0.09)" : "rgba(88, 101, 242, 0.16)");

    drawLine(ctx, 36, 36, 360, 36, "rgba(254, 231, 92, 0.55)", 2);
    drawLine(ctx, 36, 36, 36, 178, "rgba(254, 231, 92, 0.34)", 2);
    drawLine(ctx, 1164, 638, 850, 638, "rgba(254, 231, 92, 0.45)", 2);
    drawLine(ctx, 1164, 638, 1164, 496, "rgba(254, 231, 92, 0.30)", 2);
}

function drawPanel(ctx, x, y, width, height, radius = 30, options = {}) {
    const fill = options.themeMode ? "rgba(8, 13, 23, 0.58)" : "rgba(8, 13, 23, 0.82)";

    ctx.save();
    ctx.shadowColor = "rgba(0, 0, 0, 0.45)";
    ctx.shadowBlur = 28;
    ctx.shadowOffsetY = 12;
    fillRoundedRect(ctx, x, y, width, height, radius, fill);
    ctx.restore();

    strokeRoundedRect(ctx, x, y, width, height, radius, "rgba(255, 255, 255, 0.08)", 1.5);
}

async function loadAvatar(loadImage, avatarUrl) {
    if (!avatarUrl) {
        return null;
    }

    try {
        return await loadImage(avatarUrl);
    } catch (error) {
        return null;
    }
}

function drawCircularImage(ctx, image, centerX, centerY, radius, options = {}) {
    ctx.save();
    traceRender(options, "avatar:clip:start");
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(image, centerX - radius, centerY - radius, radius * 2, radius * 2);
    ctx.restore();
    traceRender(options, "avatar:clip:restore");
}

function drawAvatarPlaceholder(ctx, centerX, centerY, radius, profile) {
    const gradient = ctx.createLinearGradient(centerX - radius, centerY - radius, centerX + radius, centerY + radius);

    gradient.addColorStop(0, "#1e293b");
    gradient.addColorStop(1, "#030712");
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#fee75c";
    ctx.font = `900 72px ${getFontFamily()}`;
    ctx.textAlign = "center";
    ctx.fillText(String(profile.username || "?").slice(0, 1).toUpperCase(), centerX, centerY + 25);
    ctx.textAlign = "left";
}

function getAvatarLayout() {
    const centerX = PROFILE_AVATAR_BOUNDS.x + PROFILE_AVATAR_BOUNDS.width / 2;
    const centerY = PROFILE_AVATAR_BOUNDS.y + PROFILE_AVATAR_BOUNDS.height / 2;
    const radius = Math.min(PROFILE_AVATAR_BOUNDS.width, PROFILE_AVATAR_BOUNDS.height) / 2 - 16;
    const frameSize = Math.min(
        PROFILE_AVATAR_BOUNDS.width + PROFILE_AVATAR_FRAME_PADDING * 2,
        176
    );

    return {
        bounds: { ...PROFILE_AVATAR_BOUNDS },
        centerX,
        centerY,
        frameBounds: {
            x: centerX - frameSize / 2,
            y: centerY - frameSize / 2,
            width: frameSize,
            height: frameSize
        },
        radius
    };
}

function isFrameCenterTransparent(frameImage) {
    if (!frameImage) {
        return false;
    }

    const centerAlpha = typeof frameImage.__profileCenterAlpha === "number"
        ? frameImage.__profileCenterAlpha
        : null;

    if (centerAlpha === null) {
        return true;
    }

    return centerAlpha < 64;
}

function drawAvatarFrame(ctx, assets, layout, options = {}) {
    if (assets.equippedProfileFrame && isFrameCenterTransparent(assets.equippedProfileFrame)) {
        traceRender(options, "frame:equipped");
        drawImageContain(
            ctx,
            assets.equippedProfileFrame,
            layout.frameBounds.x,
            layout.frameBounds.y,
            layout.frameBounds.width,
            layout.frameBounds.height
        );
        return;
    }

    if (assets.equippedProfileFrame) {
        traceRender(options, "frame:equipped-skipped-opaque");
    }

    if (assets.avatarFrame) {
        traceRender(options, "frame:default-asset");
        drawImageContain(
            ctx,
            assets.avatarFrame,
            layout.frameBounds.x,
            layout.frameBounds.y,
            layout.frameBounds.width,
            layout.frameBounds.height
        );
        return;
    }

    traceRender(options, "frame:default-circle");
}

function drawAvatar(ctx, profile, avatarImage, assets, options = {}) {
    const layout = getAvatarLayout();
    const {
        centerX,
        centerY,
        radius
    } = layout;

    ctx.save();
    ctx.shadowColor = "rgba(250, 166, 26, 0.32)";
    ctx.shadowBlur = 32;
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius + 13, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(250, 166, 26, 0.12)";
    ctx.fill();
    ctx.restore();

    if (avatarImage) {
        traceRender(options, "avatar:image");
        drawCircularImage(ctx, avatarImage, centerX, centerY, radius, options);
    } else {
        traceRender(options, "avatar:fallback");
        drawAvatarPlaceholder(ctx, centerX, centerY, radius, profile);
    }

    ctx.beginPath();
    ctx.arc(centerX, centerY, radius + 7, 0, Math.PI * 2);
    ctx.strokeStyle = "#faa61a";
    ctx.lineWidth = 5;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(centerX, centerY, radius + 16, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(254, 231, 92, 0.22)";
    ctx.lineWidth = 2;
    ctx.stroke();

    drawAvatarFrame(ctx, assets, layout, options);
}

function drawRankFrame(ctx, profile, assets) {
    const x = 78;
    const y = 366;
    const width = 274;
    const height = 84;

    if (assets.rankFrame) {
        ctx.drawImage(assets.rankFrame, x, y, width, height);
    } else {
        const gradient = ctx.createLinearGradient(x, y, x + width, y + height);

        gradient.addColorStop(0, "rgba(250, 166, 26, 0.30)");
        gradient.addColorStop(1, "rgba(88, 101, 242, 0.15)");
        fillRoundedRect(ctx, x, y, width, height, 20, gradient);
        strokeRoundedRect(ctx, x, y, width, height, 20, "rgba(254, 231, 92, 0.58)", 2);
    }

    if (assets.rankBadge) {
        ctx.drawImage(assets.rankBadge, x + 18, y + 18, 48, 48);
    } else {
        ctx.fillStyle = "#fee75c";
        ctx.font = `900 30px ${getFontFamily()}`;
        ctx.fillText("◇", x + 28, y + 53);
    }

    ctx.fillStyle = "#94a3b8";
    ctx.font = `700 13px ${getFontFamily()}`;
    ctx.fillText("STOPIEŃ POLIGONU", x + 78, y + 30);

    drawFittedText(ctx, profile.rankName, x + 78, y + 62, 175, {
        color: "#f8fafc",
        maxSize: 22,
        minSize: 14,
        weight: "900"
    });
}

function drawIdentityPanel(ctx, profile, avatarImage, assets, options = {}) {
    traceRender(options, "panel:identity");
    drawPanel(ctx, 52, 52, 326, 570, 32, options);

    if (assets.profileMark) {
        ctx.drawImage(assets.profileMark, 82, 80, 42, 42);
    }

    drawAvatar(ctx, profile, avatarImage, assets, options);

    ctx.fillStyle = "#94a3b8";
    ctx.font = `800 13px ${getFontFamily()}`;
    ctx.fillText("RETROFORMA POLIGON", 82, 86);

    ctx.fillStyle = "#fee75c";
    ctx.font = `900 24px ${getFontFamily()}`;
    ctx.fillText("KARTA KADETA", 82, 116);

    drawFittedText(ctx, trimText(profile.username, 22), 215, 338, 260, {
        color: "#f8fafc",
        maxSize: 30,
        minSize: 18,
        weight: "900",
        align: "center"
    });

    ctx.fillStyle = "#94a3b8";
    ctx.font = `700 15px ${getFontFamily()}`;
    ctx.textAlign = "center";
    ctx.fillText(`ID ${profile.discordId || "N/A"}`, 215, 363);
    ctx.textAlign = "left";

    drawRankFrame(ctx, profile, assets);

    fillRoundedRect(ctx, 78, 482, 124, 76, 18, "rgba(15, 23, 42, 0.82)");
    fillRoundedRect(ctx, 228, 482, 124, 76, 18, "rgba(15, 23, 42, 0.82)");
    strokeRoundedRect(ctx, 78, 482, 124, 76, 18, "rgba(148, 163, 184, 0.18)", 1);
    strokeRoundedRect(ctx, 228, 482, 124, 76, 18, "rgba(148, 163, 184, 0.18)", 1);

    ctx.fillStyle = "#94a3b8";
    ctx.font = `700 13px ${getFontFamily()}`;
    ctx.fillText("POZIOM", 104, 509);
    ctx.fillText("RANKING", 251, 509);

    drawFittedText(ctx, formatNumber(profile.level), 104, 542, 72, {
        color: "#fee75c",
        maxSize: 30,
        minSize: 20,
        weight: "900"
    });
    drawFittedText(ctx, `#${profile.rankingPosition || "-"}`, 251, 542, 76, {
        color: "#fee75c",
        maxSize: 30,
        minSize: 20,
        weight: "900"
    });
}

function drawHeader(ctx, profile) {
    ctx.fillStyle = "#f8fafc";
    ctx.font = `900 42px ${getFontFamily()}`;
    ctx.fillText("PROFIL KADETA", 424, 106);

    ctx.fillStyle = "#94a3b8";
    ctx.font = `700 16px ${getFontFamily()}`;
    ctx.fillText("POLIGON CAD • STATUS OPERACYJNY", 428, 134);

    const ppText = `${formatNumber(profile.pp)} PP`;
    const ppWidth = Math.max(142, ctx.measureText(ppText).width + 48);

    fillRoundedRect(ctx, 1118 - ppWidth, 76, ppWidth, 42, 21, "rgba(250, 166, 26, 0.14)");
    strokeRoundedRect(ctx, 1118 - ppWidth, 76, ppWidth, 42, 21, "rgba(254, 231, 92, 0.48)", 1.5);
    drawFittedText(ctx, ppText, 1118 - ppWidth + 24, 104, ppWidth - 48, {
        color: "#fee75c",
        maxSize: 21,
        minSize: 15,
        weight: "900"
    });

    ctx.fillStyle = "#94a3b8";
    ctx.font = `700 13px ${getFontFamily()}`;
    ctx.textAlign = "right";
    ctx.fillText(`Łącznie zdobyto ${formatNumber(profile.ppTotalEarned ?? profile.pp)} PP`, 1118, 136);
    ctx.textAlign = "left";
}

function drawStatTile(ctx, x, y, width, height, label, value, accent = "#faa61a") {
    fillRoundedRect(ctx, x, y, width, height, 20, "rgba(15, 23, 42, 0.78)");
    strokeRoundedRect(ctx, x, y, width, height, 20, "rgba(148, 163, 184, 0.18)", 1.2);

    ctx.fillStyle = accent;
    ctx.fillRect(x + 20, y + 18, 4, height - 36);

    ctx.fillStyle = "#94a3b8";
    ctx.font = `800 13px ${getFontFamily()}`;
    ctx.fillText(label.toUpperCase(), x + 38, y + 34);

    drawFittedText(ctx, value, x + 38, y + 76, width - 58, {
        color: "#f8fafc",
        maxSize: 30,
        minSize: 18,
        weight: "900"
    });
}

function drawStatsGrid(ctx, profile) {
    const startX = 424;
    const startY = 164;
    const width = 214;
    const height = 94;
    const gap = 18;

    drawStatTile(ctx, startX, startY, width, height, "XP", formatNumber(profile.xp), "#5865f2");
    drawStatTile(ctx, startX + width + gap, startY, width, height, "Misje", formatNumber(profile.missionsCompleted), "#57f287");
    drawStatTile(ctx, startX + (width + gap) * 2, startY, width, height, "PP", formatNumber(profile.pp), "#fee75c");
    drawStatTile(ctx, startX, startY + height + gap, width, height, "Aktualna seria", formatNumber(profile.currentStreak ?? profile.streak ?? 0), "#faa61a");
    drawStatTile(ctx, startX + width + gap, startY + height + gap, width, height, "Najlepsza seria", formatNumber(profile.bestStreak), "#f472b6");
    drawStatTile(ctx, startX + (width + gap) * 2, startY + height + gap, width, height, "Stopień", profile.rankName, "#22d3ee");
}

function drawBadgeIconFallback(ctx, badge, centerX, centerY, radius) {
    const gradient = ctx.createLinearGradient(centerX - radius, centerY - radius, centerX + radius, centerY + radius);

    gradient.addColorStop(0, "#fee75c");
    gradient.addColorStop(1, "#b45309");
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#111827";
    ctx.font = `900 ${String(badge.icon || "").length > 2 ? 15 : 21}px ${getFontFamily()}`;
    ctx.textAlign = "center";
    ctx.fillText(String(badge.icon || "★"), centerX, centerY + 7);
    ctx.textAlign = "left";
}

function drawBadgeIcon(ctx, badge, iconImage, centerX, centerY) {
    const radius = 30;

    ctx.save();
    ctx.shadowColor = "rgba(250, 166, 26, 0.26)";
    ctx.shadowBlur = 18;
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius + 6, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(250, 166, 26, 0.10)";
    ctx.fill();
    ctx.restore();

    if (iconImage) {
        drawCircularImage(ctx, iconImage, centerX, centerY, radius);
    } else {
        drawBadgeIconFallback(ctx, badge, centerX, centerY, radius);
    }

    ctx.beginPath();
    ctx.arc(centerX, centerY, radius + 3, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(254, 231, 92, 0.62)";
    ctx.lineWidth = 2;
    ctx.stroke();
}

function drawBadges(ctx, profile, badgeIcons) {
    const badges = (profile.badges || []).slice(0, 6);
    const x = 424;
    const y = 402;
    const width = 694;
    const height = 98;

    fillRoundedRect(ctx, x, y, width, height, 24, "rgba(15, 23, 42, 0.68)");
    strokeRoundedRect(ctx, x, y, width, height, 24, "rgba(148, 163, 184, 0.18)", 1.2);

    ctx.fillStyle = "#94a3b8";
    ctx.font = `800 13px ${getFontFamily()}`;
    ctx.fillText("ODZNAKI", x + 24, y + 28);

    if (badges.length === 0) {
        ctx.fillStyle = "#64748b";
        ctx.font = `700 17px ${getFontFamily()}`;
        ctx.fillText("Brak zdobytych odznak", x + 24, y + 66);
        return;
    }

    const startX = x + 132;
    const gap = 88;

    badges.forEach((badge, index) => {
        const centerX = startX + index * gap;
        const centerY = y + 53;

        drawBadgeIcon(ctx, badge, badgeIcons[badge.id], centerX, centerY);
        drawFittedText(ctx, trimText(badge.name, 12), centerX, y + 88, 76, {
            color: "#cbd5e1",
            maxSize: 11,
            minSize: 8,
            weight: "800",
            align: "center"
        });
    });
}

function drawXPBar(ctx, profile, options) {
    const x = 424;
    const y = 552;
    const width = 694;
    const height = 32;
    const progress = profile.progress || {
        current: 0,
        required: 250,
        percent: 0
    };
    const animatedPercent = getAnimatedProgressPercent(progress.percent, options.animationProgress ?? 1);
    const fillWidth = width * animatedPercent;

    ctx.fillStyle = "#94a3b8";
    ctx.font = `800 14px ${getFontFamily()}`;
    ctx.fillText("POSTĘP DO NASTĘPNEGO POZIOMU", x, y - 18);

    ctx.fillStyle = "#f8fafc";
    ctx.font = `900 17px ${getFontFamily()}`;
    ctx.textAlign = "right";
    ctx.fillText(`${formatNumber(progress.current)} / ${formatNumber(progress.required)} XP`, x + width, y - 18);
    ctx.textAlign = "left";

    fillRoundedRect(ctx, x, y, width, height, 16, "rgba(2, 6, 23, 0.88)");

    if (fillWidth > 0) {
        const gradient = ctx.createLinearGradient(x, y, x + width, y);

        gradient.addColorStop(0, "#5865f2");
        gradient.addColorStop(0.58, "#faa61a");
        gradient.addColorStop(1, "#fee75c");
        fillRoundedRect(ctx, x, y, fillWidth, height, Math.min(16, fillWidth / 2), gradient);

        ctx.save();
        ctx.globalAlpha = 0.32;
        drawLine(ctx, x + fillWidth - 24, y + 4, x + fillWidth - 6, y + height - 4, "#ffffff", 3);
        ctx.restore();
    }

    strokeRoundedRect(ctx, x, y, width, height, 16, "rgba(254, 231, 92, 0.42)", 1.5);
}

function drawFooter(ctx) {
    ctx.fillStyle = "#fee75c";
    ctx.font = `900 19px ${getFontFamily()}`;
    ctx.textAlign = "center";
    ctx.fillText("Projektuj. Twórz. Doskonal się.", CARD_WIDTH / 2, 639);
    ctx.textAlign = "left";
}

function drawFrame(ctx, assets) {
    if (assets.frame) {
        ctx.drawImage(assets.frame, 0, 0, CARD_WIDTH, CARD_HEIGHT);
    }
}

// Zwraca teksty profilu przed rasteryzacją, żeby testy nie musiały czytać pikseli Canvas.
function collectProfileCardText(profile) {
    const badges = (profile.badges || []).slice(0, 6);

    return [
        profile.username,
        `${formatNumber(profile.pp)} PP`,
        `Łącznie zdobyto ${formatNumber(profile.ppTotalEarned ?? profile.pp)} PP`,
        `#${profile.rankingPosition || "-"}`,
        formatNumber(profile.xp),
        formatNumber(profile.missionsCompleted),
        badges.length > 0 ? badges.map((badge) => badge.name).join(" ") : "Brak zdobytych odznak"
    ].filter(Boolean);
}

function getProfileRenderDiagnostics(profile, assets, avatarImage) {
    const badges = profile.badges || [];

    return {
        avatarLoaded: Boolean(avatarImage),
        badgeCodes: badges.map((badge) => badge.id),
        badgesCount: badges.length,
        frame: assets.equippedProfileFrameCode || profile.equipment?.frame?.code || "none",
        theme: assets.equippedProfileThemeCode || profile.equipment?.theme?.code || "none",
        user: profile.discordId || "unknown"
    };
}

function logProfileRenderDiagnostics(profile, assets, avatarImage, logger = console) {
    const diagnostics = getProfileRenderDiagnostics(profile, assets, avatarImage);

    logger.info([
        "[PROFILE_RENDER]",
        `user=${diagnostics.user}`,
        `theme=${diagnostics.theme}`,
        `frame=${diagnostics.frame}`,
        `avatar_loaded=${diagnostics.avatarLoaded}`,
        `badges_count=${diagnostics.badgesCount}`,
        `badge_codes=${diagnostics.badgeCodes.join(",") || "none"}`
    ].join(" "));
}

// Generuje statyczną kartę profilu. Opcja animationProgress jest gotowa pod przyszłe klatki animacji.
async function createProfileCard(profile, options = {}) {
    const {
        createCanvas,
        loadImage,
        assets,
        badgeIcons
    } = await loadCanvasContext(profile);
    const avatarImage = await loadAvatar(loadImage, profile.avatarUrl);
    const canvas = createCanvas(CARD_WIDTH, CARD_HEIGHT);
    const ctx = canvas.getContext("2d");
    const renderOptions = {
        ...options,
        themeMode: Boolean(assets.equippedProfileTheme)
    };

    logProfileRenderDiagnostics(profile, assets, avatarImage, options.logger || console);

    drawBackground(ctx, assets, renderOptions);
    drawIdentityPanel(ctx, profile, avatarImage, assets, renderOptions);
    traceRender(renderOptions, "panel:main");
    drawPanel(ctx, 398, 52, 750, 570, 32, renderOptions);
    drawHeader(ctx, profile);
    drawStatsGrid(ctx, profile);
    drawXPBar(ctx, profile, renderOptions);
    drawBadges(ctx, profile, badgeIcons);
    drawFooter(ctx);
    drawFrame(ctx, assets);

    return canvas.toBuffer("image/png");
}

module.exports = {
    PROFILE_AVATAR_BOUNDS,
    PROFILE_THEME_OVERLAY_MAX_ALPHA,
    collectProfileCardText,
    createProfileCard,
    drawImageCover,
    drawImageContain,
    getAvatarLayout,
    getProgressAnimationFrames
};
