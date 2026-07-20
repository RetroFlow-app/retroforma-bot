const fs = require("node:fs");
const path = require("node:path");

const {
    ensureCanvas
} = require("./renderer");

const ASSET_ROOT = path.resolve(__dirname, "assets");

function createAsset(relativeParts, fallback) {
    return {
        fallback,
        path: relativeParts.length > 0 ? path.resolve(ASSET_ROOT, ...relativeParts) : null
    };
}

function createFrameAsset(fileName, fallback) {
    return createAsset(["frames", `${fileName}.png`], {
        shape: "frame",
        ...fallback
    });
}

const ITEM_ASSETS = {
    "ramka-carbon": createFrameAsset("carbon", {
        symbol: "RC"
    }),
    "ramka-neon": createFrameAsset("neon", {
        symbol: "RF"
    }),
    "ramka-cyan": createFrameAsset("cyan", {
        symbol: "CY"
    }),
    "ramka-amber": createFrameAsset("amber", {
        symbol: "AM"
    }),

    compass: createAsset(["gadgets", "compass.png"], {
        shape: "compass",
        symbol: "KA"
    }),
    "kompas-analogowy": createAsset(["gadgets", "compass.png"], {
        shape: "compass",
        symbol: "KA"
    }),

    radio: createAsset(["gadgets", "radio.png"], {
        shape: "signal",
        symbol: "RK"
    }),
    "radio-kieszonkowe": createAsset(["gadgets", "radio.png"], {
        shape: "signal",
        symbol: "RK"
    }),

    backpack: createAsset(["gadgets", "backpack.png"], {
        shape: "archive",
        symbol: "BP"
    }),
    aparat: createAsset(["gadgets", "aparat.png"], {
        shape: "camera",
        symbol: "AP"
    }),
    "aparat-polaroid": createAsset(["gadgets", "aparat.png"], {
        shape: "camera",
        symbol: "AP"
    }),

    smartwatch: createAsset(["gadgets", "smartwatch.png"], {
        shape: "screen",
        symbol: "SW"
    }),
    "terminal-przenosny": createAsset([], {
        shape: "screen",
        symbol: "TP"
    }),

    "tlo-syntetyczny-zachod": createAsset([], {
        shape: "horizon",
        symbol: "TZ"
    }),
    "motyw-crt": createAsset([], {
        shape: "screen",
        symbol: "CRT"
    }),
    "emblemat-explorer": createAsset([], {
        shape: "compass",
        symbol: "EX"
    }),
    "tytul-odkrywca": createAsset([], {
        shape: "tag",
        symbol: "OD"
    }),
    "tytul-archiwista": createAsset([], {
        shape: "archive",
        symbol: "AR"
    }),
    "tytul-operator-sygnalu": createAsset([], {
        shape: "signal",
        symbol: "OS"
    }),
    "tytul-weteran-poligonu": createAsset([], {
        shape: "chevron",
        symbol: "WP"
    })
};

const BADGE_ASSETS = {
    cadet: createAsset(["badges", "cadet.png"], {
        shape: "badge",
        symbol: "KD"
    }),
    first_mission: createAsset(["badges", "cadet.png"], {
        shape: "badge",
        symbol: "I"
    }),

    explorer: createAsset(["badges", "explorer.png"], {
        shape: "compass",
        symbol: "EX"
    }),
    missions_10: createAsset(["badges", "explorer.png"], {
        shape: "compass",
        symbol: "10"
    }),

    archivist: createAsset(["badges", "archivist.png"], {
        shape: "archive",
        symbol: "AR"
    }),
    missions_25: createAsset(["badges", "archivist.png"], {
        shape: "archive",
        symbol: "25"
    }),

    operator: createAsset(["badges", "operator.png"], {
        shape: "signal",
        symbol: "OP"
    }),
    missions_50: createAsset(["badges", "operator.png"], {
        shape: "signal",
        symbol: "50"
    }),

    researcher: createAsset(["badges", "researcher.png"], {
        shape: "screen",
        symbol: "RS"
    }),
    top_3: createAsset(["badges", "researcher.png"], {
        shape: "screen",
        symbol: "TOP"
    }),

    engineer: createAsset(["badges", "engineer.png"], {
        shape: "frame",
        symbol: "IN"
    }),
    streak_30: createAsset(["badges", "engineer.png"], {
        shape: "frame",
        symbol: "S30"
    }),

    pioneer: createAsset(["badges", "pioneer.png"], {
        shape: "horizon",
        symbol: "PN"
    }),
    streak_7: createAsset(["badges", "pioneer.png"], {
        shape: "horizon",
        symbol: "S7"
    }),

    veteran: createAsset(["badges", "veteran.png"], {
        shape: "chevron",
        symbol: "VT"
    }),
    missions_100: createAsset(["badges", "veteran.png"], {
        shape: "chevron",
        symbol: "100"
    })
};

const imageCache = new Map();
const warningCache = new Set();

function normalizeAssetId(assetId) {
    return String(assetId || "").trim().toLowerCase();
}

function getAssetGroup(type) {
    return type === "badge" ? BADGE_ASSETS : ITEM_ASSETS;
}

function getAssetDefinition(type, assetId) {
    return getAssetGroup(type)[normalizeAssetId(assetId)] || null;
}

function createFallbackVisual(assetId) {
    return {
        shape: "generic",
        symbol: String(assetId || "RF").slice(0, 2).toUpperCase()
    };
}

function resolveUiAsset(type, assetId) {
    const assetDefinition = getAssetDefinition(type, assetId);

    if (!assetDefinition) {
        return {
            fallback: createFallbackVisual(assetId),
            id: normalizeAssetId(assetId),
            mapped: false,
            path: null,
            type
        };
    }

    return {
        fallback: assetDefinition.fallback || createFallbackVisual(assetId),
        id: normalizeAssetId(assetId),
        mapped: true,
        path: assetDefinition.path || null,
        type
    };
}

function logAssetWarning(cacheKey, message) {
    if (warningCache.has(cacheKey)) {
        return;
    }

    warningCache.add(cacheKey);
    console.warn(`[UI ASSET] ${message}`);
}

function loadImageFromPath(cacheKey, assetPath, assetName) {
    if (!assetPath) {
        return null;
    }

    if (imageCache.has(cacheKey)) {
        return imageCache.get(cacheKey);
    }

    if (!fs.existsSync(assetPath)) {
        logAssetWarning(cacheKey, `Brak pliku assetu: ${assetName} (${assetPath})`);
        imageCache.set(cacheKey, null);
        return null;
    }

    try {
        const {
            Image
        } = ensureCanvas();
        const image = new Image();

        image.src = fs.readFileSync(assetPath);
        imageCache.set(cacheKey, image);

        return image;
    } catch (error) {
        logAssetWarning(cacheKey, `Nie udalo sie wczytac assetu: ${assetName} (${error.message})`);
        imageCache.set(cacheKey, null);
        return null;
    }
}

function loadUiAssetImage(type, assetId) {
    const asset = resolveUiAsset(type, assetId);
    const cacheKey = `${asset.type}:${asset.id}:${asset.path || "fallback"}`;

    if (!asset.path) {
        if (asset.mapped) {
            return null;
        }

        logAssetWarning(cacheKey, `Brak mapowania assetu: ${asset.type}:${asset.id || "unknown"}`);
        return null;
    }

    return loadImageFromPath(cacheKey, asset.path, `${asset.type}:${asset.id}`);
}

function getAssetCacheStats() {
    return {
        entries: imageCache.size,
        warnings: warningCache.size
    };
}

function clearAssetCache() {
    imageCache.clear();
    warningCache.clear();
}

module.exports = {
    ASSET_ROOT,
    BADGE_ASSETS,
    ITEM_ASSETS,
    clearAssetCache,
    getAssetCacheStats,
    loadImageFromPath,
    loadUiAssetImage,
    resolveUiAsset
};
