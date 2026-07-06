const fs = require("fs");
const path = require("path");

const { assetsPath } = require("../config/paths");

const PROFILE_FONT_FAMILY = "RetroFormaProfile";
let isProfileFontRegistered = false;

const profileAssetPaths = {
    // TODO: Dodać docelowe tło karty profilu do assets/backgrounds/profile-card.png.
    background: path.join(assetsPath, "backgrounds", "profile-card.png"),
    // TODO: Dodać odznakę stopnia kadeta do assets/badges/rank-badge.png.
    rankBadge: path.join(assetsPath, "badges", "rank-badge.png"),
    // TODO: Dodać dekoracyjną ramkę karty do assets/frames/profile-frame.png.
    frame: path.join(assetsPath, "frames", "profile-frame.png"),
    // TODO: Dodać ramkę avatara do assets/frames/avatar-frame.png.
    avatarFrame: path.join(assetsPath, "frames", "avatar-frame.png"),
    // TODO: Dodać ramkę stopnia do assets/frames/rank-frame.png.
    rankFrame: path.join(assetsPath, "frames", "rank-frame.png"),
    // TODO: Dodać ikonę/profilowy znak Poligonu do assets/icons/profile-mark.png.
    profileMark: path.join(assetsPath, "icons", "profile-mark.png"),
    // TODO: Dodać font interfejsowy do assets/fonts/profile.ttf i zarejestrować go w canvas.
    font: path.join(assetsPath, "fonts", "profile.ttf")
};

// TODO: Dodawać ikony odznak jako assets/badges/<badge-id>.png, np. first_mission.png.
function getBadgeIconPath(badgeId) {
    return path.join(assetsPath, "badges", `${badgeId}.png`);
}

// Zwraca ścieżkę tylko wtedy, gdy plik assetu faktycznie istnieje.
function getExistingAssetPath(assetPath) {
    return fs.existsSync(assetPath) ? assetPath : null;
}

// Rejestruje font profilu, jeśli plik został już dodany do assets/fonts.
function registerProfileFont(registerFont) {
    const fontPath = getExistingAssetPath(profileAssetPaths.font);

    if (!fontPath) {
        return null;
    }

    if (!isProfileFontRegistered) {
        registerFont(fontPath, {
            family: PROFILE_FONT_FAMILY
        });

        isProfileFontRegistered = true;
    }

    return PROFILE_FONT_FAMILY;
}

// Ładuje opcjonalne assety profilu. Brak plików nie przerywa renderowania.
async function loadProfileAssets(loadImage) {
    const assets = {};

    for (const [assetName, assetPath] of Object.entries(profileAssetPaths)) {
        if (assetName === "font") {
            continue;
        }

        const existingPath = getExistingAssetPath(assetPath);

        if (existingPath) {
            assets[assetName] = await loadImage(existingPath);
        }
    }

    return assets;
}

// Ładuje ikony odznak z assets/badges, jeśli istnieją.
async function loadBadgeIconAssets(loadImage, badges = []) {
    const badgeIcons = {};

    for (const badge of badges) {
        const iconPath = getExistingAssetPath(getBadgeIconPath(badge.id));

        if (iconPath) {
            badgeIcons[badge.id] = await loadImage(iconPath);
        }
    }

    return badgeIcons;
}

module.exports = {
    loadBadgeIconAssets,
    loadProfileAssets,
    registerProfileFont
};
