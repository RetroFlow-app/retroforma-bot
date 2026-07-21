const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
    getRarityStyle,
    normalizeRarity
} = require("../src/ui/components/badges");
const {
    clearItemAssetCache,
    resolveItemVisual
} = require("../src/ui/components/itemIcon");
const {
    getStatusView
} = require("../src/ui/components/status");
const {
    normalizeShopScreenData,
    renderShopScreen
} = require("../src/ui/templates/shopScreen");
const {
    createShopPayloadFromView,
    getCatalogPreviewStartPage,
    isItemPurchasable
} = require("../src/services/shopViewService");
const {
    ASSET_ROOT,
    clearAssetCache,
    getAssetCacheStats,
    loadImageFromPath,
    loadUiAssetImage,
    resolveUiAsset
} = require("../src/ui/assetRegistry");
const {
    BACKGROUND_SHOP_ITEM_CODES,
    FRAME_SHOP_ITEM_CODES
} = require("../src/database/shopSeedData");

const PNG_SIGNATURE = "89504e470d0a1a0a";

function readPngSize(buffer) {
    return {
        height: buffer.readUInt32BE(20),
        width: buffer.readUInt32BE(16)
    };
}

function assertPngBuffer(buffer) {
    assert.ok(Buffer.isBuffer(buffer));
    assert.ok(buffer.length > 1000);
    assert.equal(buffer.subarray(0, 8).toString("hex"), PNG_SIGNATURE);
    assert.deepEqual(readPngSize(buffer), {
        height: 720,
        width: 1280
    });
}

function createItem(overrides = {}) {
    return {
        categoryName: "Ramki",
        code: "ramka-neon",
        description: "Lekka, neonowa ramka profilu dla Kadetow Poligonu.",
        name: "Ramka Neon",
        owned: false,
        page: 1,
        price: 500,
        rarity: "Rzadka",
        selected: true,
        ...overrides
    };
}

function createCatalogItems() {
    return [
        createItem({
            code: "ramka-neon",
            name: "Ramka Neon",
            page: 1,
            selected: true
        }),
        createItem({
            code: "tlo-syntetyczny-zachod",
            name: "Tlo Syntetyczny Zachod",
            page: 2,
            price: 650,
            rarity: "Epicka",
            selected: false
        }),
        createItem({
            code: "motyw-crt",
            name: "Motyw CRT",
            owned: true,
            page: 3,
            price: 420,
            rarity: "Niepospolita",
            selected: false
        }),
        createItem({
            code: "aparat-polaroid",
            name: "Aparat Polaroid",
            page: 4,
            price: 520,
            rarity: "Rzadka",
            selected: false
        })
    ];
}

function createView(overrides = {}) {
    const item = overrides.item === undefined ? createItem() : overrides.item;

    return {
        categories: [
            {
                description: "Cała oferta sklepu.",
                id: "all",
                name: "Wszystkie"
            }
        ],
        category: "all",
        categoryName: "Wszystkie",
        items: item ? [item] : [],
        page: 0,
        pp: 1000,
        totalItems: item ? 1 : 0,
        totalPages: 1,
        ...overrides
    };
}

function createMember() {
    return {
        user: {
            id: "ui-test-user"
        }
    };
}

function getNavigationButtons(payload) {
    return payload.components[1].toJSON().components;
}

function getBuyButton(payload) {
    return getNavigationButtons(payload)[1];
}

function assertPayloadPng(payload) {
    assert.deepEqual(payload.embeds, []);
    assert.deepEqual(payload.attachments, []);
    assert.equal(payload.files.length, 1);
    assert.equal(payload.files[0].name, "retroforma-sklep.png");
    assertPngBuffer(payload.files[0].attachment);
}

test("renderer sklepu generuje PNG bez przedmiotu", () => {
    assertPngBuffer(renderShopScreen({
        catalogItems: [],
        category: "Puste",
        item: null,
        page: 1,
        playerPP: 0,
        totalItems: 0,
        totalPages: 1
    }));
});

test("payload sklepu po zmianie itemu zawiera dokladnie jeden nowy PNG", () => {
    const firstPayload = createShopPayloadFromView(createMember(), createView({
        item: createItem({
            code: "ramka-neon",
            name: "Ramka Neon"
        }),
        page: 0,
        totalItems: 2,
        totalPages: 2
    }), {
        catalogItems: createCatalogItems().slice(0, 2)
    });
    const secondPayload = createShopPayloadFromView(createMember(), createView({
        item: createItem({
            code: "motyw-crt",
            name: "Motyw CRT",
            rarity: "Niepospolita"
        }),
        page: 1,
        totalItems: 2,
        totalPages: 2
    }), {
        catalogItems: createCatalogItems().slice(0, 2)
    });

    assertPayloadPng(firstPayload);
    assertPayloadPng(secondPayload);
    assert.notEqual(
        Buffer.compare(firstPayload.files[0].attachment, secondPayload.files[0].attachment),
        0
    );
});

test("payload sklepu poprawnie ustawia disabled dla przycisku Kup", () => {
    const availablePayload = createShopPayloadFromView(createMember(), createView({
        item: createItem({
            owned: false,
            price: 500
        })
    }), {
        catalogItems: createCatalogItems()
    });
    const ownedPayload = createShopPayloadFromView(createMember(), createView({
        item: createItem({
            owned: true
        })
    }), {
        catalogItems: createCatalogItems()
    });
    const emptyPayload = createShopPayloadFromView(createMember(), createView({
        item: null
    }), {
        catalogItems: []
    });
    const invalidPricePayload = createShopPayloadFromView(createMember(), createView({
        item: createItem({
            price: Number.NaN
        })
    }), {
        catalogItems: []
    });

    assert.equal(getBuyButton(availablePayload).disabled, false);
    assert.equal(getBuyButton(ownedPayload).disabled, true);
    assert.equal(getBuyButton(emptyPayload).disabled, true);
    assert.equal(getBuyButton(invalidPricePayload).disabled, true);
    assert.equal(isItemPurchasable(createItem({ price: -1 })), false);
});

test("payload sklepu zachowuje polskie znaki UTF-8 w komponentach Discord", () => {
    const payload = createShopPayloadFromView(createMember(), createView(), {
        catalogItems: createCatalogItems()
    });
    const selectMenu = payload.components[0].toJSON().components[0];

    assert.equal(selectMenu.placeholder, "Wybierz kategorię sklepu");
});

test("renderer sklepu obsluguje bardzo dlugi opis", () => {
    assertPngBuffer(renderShopScreen({
        catalogItems: createCatalogItems(),
        category: "Efekty",
        item: createItem({
            description: "Bardzo dlugi opis ".repeat(40)
        }),
        page: 1,
        playerPP: 1200,
        totalItems: 4,
        totalPages: 4
    }));
});

test("renderer sklepu obsluguje bardzo dluga nazwe", () => {
    assertPngBuffer(renderShopScreen({
        catalogItems: createCatalogItems(),
        category: "Premium",
        item: createItem({
            name: "Eksperymentalna ramka profilu RetroForma Poligon CAD edycja techniczna"
        }),
        page: 2,
        playerPP: 900,
        totalItems: 6,
        totalPages: 6
    }));
});

test("renderer sklepu obsluguje 0 PP i komunikat o niedoborze", () => {
    const item = createItem({
        price: 250
    });
    const status = getStatusView({
        canAfford: false,
        item,
        playerPP: 0
    });

    assert.equal(status.label, "ZA MALO PP");
    assertPngBuffer(renderShopScreen({
        catalogItems: createCatalogItems(),
        category: "Tla",
        item,
        page: 1,
        playerPP: 0,
        totalItems: 2,
        totalPages: 2
    }));
});

test("renderer sklepu obsluguje duze saldo PP", () => {
    assertPngBuffer(renderShopScreen({
        catalogItems: createCatalogItems(),
        category: "Gadzety",
        item: createItem({
            price: 2500
        }),
        page: 7,
        playerPP: 987654321,
        totalItems: 10,
        totalPages: 10
    }));
});

test("renderer sklepu obsluguje posiadany przedmiot", () => {
    const item = createItem({
        owned: true
    });
    const status = getStatusView({
        item,
        owned: true,
        playerPP: 500
    });

    assert.equal(status.label, "POSIADASZ");
    assertPngBuffer(renderShopScreen({
        catalogItems: createCatalogItems(),
        category: "Ramki",
        item,
        owned: true,
        page: 1,
        playerPP: 500,
        totalItems: 3,
        totalPages: 3
    }));
});

test("renderer sklepu obsluguje udany zakup jako stan posiadania", () => {
    const item = createItem({
        owned: true
    });
    const status = getStatusView({
        item,
        notice: {
            lines: [
                "Zakup udany"
            ],
            title: "Zakup udany",
            type: "success"
        },
        owned: true,
        playerPP: 500
    });

    assert.equal(status.label, "POSIADASZ");
    assertPngBuffer(renderShopScreen({
        catalogItems: createCatalogItems(),
        item,
        notice: {
            lines: [
                "Zakup udany"
            ],
            title: "Zakup udany",
            type: "success"
        },
        owned: true,
        page: 1,
        playerPP: 500,
        totalItems: 4,
        totalPages: 4
    }));
});

test("renderer sklepu obsluguje pierwsza, srodkowa i ostatnia strone", () => {
    for (const page of [1, 2, 4]) {
        assertPngBuffer(renderShopScreen({
            catalogItems: createCatalogItems().map((item) => ({
                ...item,
                selected: item.page === page
            })),
            item: createCatalogItems()[page - 1],
            page,
            playerPP: 1000,
            totalItems: 4,
            totalPages: 4
        }));
    }
});

test("rzadkosci sa normalizowane do trzech poziomow i renderuja sie bez bledu", () => {
    const expectedMapping = {
        Podstawowa: "Podstawowa",
        Niepospolita: "Podstawowa",
        Rzadka: "Epicka",
        Epicka: "Epicka",
        Legendarna: "Legendarna",
        uncommon: "Podstawowa",
        rare: "Epicka",
        legendary: "Legendarna"
    };
    const rarities = [
        ...Object.keys(expectedMapping)
    ];

    for (const rarity of rarities) {
        const style = getRarityStyle(rarity);

        assert.equal(normalizeRarity(rarity), expectedMapping[rarity]);
        assert.equal(style.label, expectedMapping[rarity]);
        assertPngBuffer(renderShopScreen({
            catalogItems: createCatalogItems(),
            category: "Test",
            item: createItem({
                rarity
            }),
            page: 1,
            playerPP: 1000,
            totalItems: 4,
            totalPages: 4
        }));
    }
});

test("kolory rzadkosci sa spojne dla trzech poziomow", () => {
    assert.equal(getRarityStyle("Podstawowa").label, "Podstawowa");
    assert.equal(getRarityStyle("Podstawowa").accent, "#4dff9a");
    assert.equal(getRarityStyle("Niepospolita").label, "Podstawowa");
    assert.equal(getRarityStyle("Rzadka").label, "Epicka");
    assert.equal(getRarityStyle("Epicka").accent, "#b778ff");
    assert.equal(getRarityStyle("Legendarna").accent, "#ffc857");
});

test("fallback ikony dziala bez assetu", () => {
    const originalWarn = console.warn;
    const warnings = [];
    const item = createItem({
        code: "brak-lokalnego-assetu",
        name: "Nieznany Modul"
    });
    const visual = resolveItemVisual(item);

    clearAssetCache();
    console.warn = (message) => warnings.push(message);

    try {
        assert.equal(visual.assetPath, null);
        assertPngBuffer(renderShopScreen({
            catalogItems: [item],
            item,
            page: 1,
            playerPP: 1000,
            totalItems: 1,
            totalPages: 1
        }));
        assert.equal(warnings.length, 1);
        assert.match(warnings[0], /brak-lokalnego-assetu/);
    } finally {
        console.warn = originalWarn;
        clearAssetCache();
    }
});

test("registry mapuje aktualne identyfikatory itemow na finalne assety", () => {
    const mappedItems = [
        ["compass", ["gadgets", "compass.png"]],
        ["kompas-analogowy", ["gadgets", "compass.png"]],
        ["radio", ["gadgets", "radio.png"]],
        ["radio-kieszonkowe", ["gadgets", "radio.png"]],
        ["backpack", ["gadgets", "backpack.png"]],
        ["aparat", ["gadgets", "aparat.png"]],
        ["aparat-polaroid", ["gadgets", "aparat.png"]],
        ["terminal", ["gadgets", "terminal.png"]],
        ["terminal-przenosny", ["gadgets", "terminal.png"]],
        ["smartwatch", ["gadgets", "smartwatch.png"]]
    ];

    for (const [assetId, relativePath] of mappedItems) {
        const asset = resolveUiAsset("item", assetId);

        assert.equal(asset.mapped, true);
        assert.equal(asset.path, path.resolve(ASSET_ROOT, ...relativePath));
    }
});

test("aparat i terminal uzywaja wlasnych assetow", () => {
    const cameraAsset = resolveUiAsset("item", "aparat-polaroid");
    const terminalAsset = resolveUiAsset("item", "terminal");

    assert.equal(cameraAsset.mapped, true);
    assert.equal(cameraAsset.path, path.resolve(ASSET_ROOT, "gadgets", "aparat.png"));
    assert.equal(cameraAsset.fallback.shape, "camera");
    assert.notEqual(cameraAsset.path, path.resolve(ASSET_ROOT, "gadgets", "backpack.png"));

    assert.equal(terminalAsset.mapped, true);
    assert.equal(terminalAsset.path, path.resolve(ASSET_ROOT, "gadgets", "terminal.png"));
    assert.equal(terminalAsset.fallback.shape, "screen");
    assert.notEqual(terminalAsset.path, path.resolve(ASSET_ROOT, "gadgets", "smartwatch.png"));
});

test("wszystkie ramki mapuja sie do finalnych assetow PNG", () => {
    const expectedFrameAssets = {
        "ramka-amber": "amber.png",
        "ramka-carbon": "carbon.png",
        "ramka-cyan": "cyan.png",
        "ramka-neon": "neon.png"
    };

    for (const frameCode of FRAME_SHOP_ITEM_CODES) {
        const frameAsset = resolveUiAsset("item", frameCode);

        assert.equal(frameAsset.mapped, true);
        assert.equal(frameAsset.fallback.shape, "frame");
        assert.equal(frameAsset.path, path.resolve(ASSET_ROOT, "frames", expectedFrameAssets[frameCode]));
        assert.ok(fs.existsSync(frameAsset.path));
        assert.equal(frameAsset.path.includes(`${path.sep}gadgets${path.sep}`), false);
    }
});

test("wszystkie tla profilu mapuja sie do finalnych assetow PNG", () => {
    const expectedBackgroundAssets = {
        "motyw-crt": "crt.png",
        "tlo-aurora": "aurora.png",
        "tlo-blueprint": "blueprint.png",
        "tlo-satellite-array": "satellite-array.png",
        "tlo-storm": "storm.png",
        "tlo-syntetyczny-zachod": "synthetic-sunset.png"
    };

    for (const backgroundCode of BACKGROUND_SHOP_ITEM_CODES) {
        const backgroundAsset = resolveUiAsset("item", backgroundCode);

        assert.equal(backgroundAsset.mapped, true);
        assert.equal(backgroundAsset.fallback.shape, "background");
        assert.equal(backgroundAsset.path, path.resolve(ASSET_ROOT, "backgrounds", expectedBackgroundAssets[backgroundCode]));
        assert.ok(fs.existsSync(backgroundAsset.path));
    }
});

test("brak assetu tla profilu nie powoduje crasha", () => {
    const originalWarn = console.warn;
    const originalExistsSync = fs.existsSync;
    const warnings = [];
    const backgroundItem = createItem({
        code: "tlo-blueprint",
        name: "Tlo Blueprint",
        price: 360,
        rarity: "Podstawowa"
    });
    const backgroundAsset = resolveUiAsset("item", backgroundItem.code);

    clearAssetCache();
    console.warn = (message) => warnings.push(message);
    fs.existsSync = (filePath) => {
        if (path.resolve(filePath) === backgroundAsset.path) {
            return false;
        }

        return originalExistsSync.call(fs, filePath);
    };

    try {
        assertPngBuffer(renderShopScreen({
            catalogItems: [backgroundItem],
            item: backgroundItem,
            page: 1,
            playerPP: 1000,
            totalItems: 1,
            totalPages: 1
        }));

        assert.ok(warnings.some((warning) => /tlo-blueprint/.test(warning)));
    } finally {
        console.warn = originalWarn;
        fs.existsSync = originalExistsSync;
        clearAssetCache();
    }
});

test("brak assetu ramki nie powoduje crasha", () => {
    const originalWarn = console.warn;
    const originalExistsSync = fs.existsSync;
    const warnings = [];
    const frameItem = createItem({
        code: "ramka-carbon",
        name: "Ramka Carbon",
        price: 360,
        rarity: "Podstawowa"
    });
    const frameAsset = resolveUiAsset("item", frameItem.code);

    clearAssetCache();
    console.warn = (message) => warnings.push(message);
    fs.existsSync = (filePath) => {
        if (path.resolve(filePath) === frameAsset.path) {
            return false;
        }

        return originalExistsSync.call(fs, filePath);
    };

    try {
        assertPngBuffer(renderShopScreen({
            catalogItems: [frameItem],
            item: frameItem,
            page: 1,
            playerPP: 1000,
            totalItems: 1,
            totalPages: 1
        }));

        assert.ok(warnings.some((warning) => /ramka-carbon/.test(warning)));
    } finally {
        console.warn = originalWarn;
        fs.existsSync = originalExistsSync;
        clearAssetCache();
    }
});

test("kompas i radio uzywaja prawdziwych assetow", () => {
    const compassAsset = resolveUiAsset("item", "kompas-analogowy");
    const radioAsset = resolveUiAsset("item", "radio-kieszonkowe");
    const cameraAsset = resolveUiAsset("item", "aparat-polaroid");

    assert.equal(compassAsset.path, path.resolve(ASSET_ROOT, "gadgets", "compass.png"));
    assert.equal(radioAsset.path, path.resolve(ASSET_ROOT, "gadgets", "radio.png"));
    assert.equal(cameraAsset.path, path.resolve(ASSET_ROOT, "gadgets", "aparat.png"));
    assert.ok(loadUiAssetImage("item", "kompas-analogowy"));
    assert.ok(loadUiAssetImage("item", "radio-kieszonkowe"));
    assert.ok(loadUiAssetImage("item", "aparat-polaroid"));
});

test("registry przygotowuje mapowanie odznak bez przyznawania odznak", () => {
    const cadetBadge = resolveUiAsset("badge", "cadet");
    const firstMissionBadge = resolveUiAsset("badge", "first_mission");
    const explorerBadge = resolveUiAsset("badge", "explorer");

    assert.equal(cadetBadge.path, path.resolve(ASSET_ROOT, "badges", "cadet.png"));
    assert.equal(firstMissionBadge.path, path.resolve(ASSET_ROOT, "badges", "cadet.png"));
    assert.equal(explorerBadge.path, path.resolve(ASSET_ROOT, "badges", "explorer.png"));
});

test("registry zwraca neutralny fallback dla nieznanego identyfikatora", () => {
    const asset = resolveUiAsset("item", "nieznany-przedmiot");

    assert.equal(asset.mapped, false);
    assert.equal(asset.path, null);
    assert.equal(asset.fallback.shape, "generic");
    assert.equal(asset.fallback.symbol, "NI");
});

test("brakujacy plik assetu nie powoduje crasha i jest cacheowany jako fallback", () => {
    const originalWarn = console.warn;
    const warnings = [];

    clearAssetCache();
    console.warn = (message) => warnings.push(message);

    try {
        const missingPath = path.resolve(ASSET_ROOT, "gadgets", "missing-file.png");

        assert.equal(loadImageFromPath("test:missing-file", missingPath, "missing-file.png"), null);
        assert.equal(loadImageFromPath("test:missing-file", missingPath, "missing-file.png"), null);
        assert.equal(warnings.length, 1);
        assert.match(warnings[0], /missing-file\.png/);
    } finally {
        console.warn = originalWarn;
        clearAssetCache();
    }
});

test("registry cacheuje obrazy i nie czyta assetu z dysku przy kazdym renderze", () => {
    const originalReadFileSync = fs.readFileSync;
    let readCount = 0;

    clearAssetCache();
    fs.readFileSync = (filePath, ...args) => {
        if (String(filePath).endsWith(`${path.sep}compass.png`)) {
            readCount += 1;
        }

        return originalReadFileSync.call(fs, filePath, ...args);
    };

    try {
        const firstImage = loadUiAssetImage("item", "kompas-analogowy");
        const secondImage = loadUiAssetImage("item", "kompas-analogowy");

        assert.ok(firstImage);
        assert.equal(firstImage, secondImage);
        assert.equal(readCount, 1);
        assert.equal(getAssetCacheStats().entries, 1);
    } finally {
        fs.readFileSync = originalReadFileSync;
        clearAssetCache();
    }
});

test("renderer sklepu uzywa prawdziwego assetu gadgetu, gdy jest dostepny", () => {
    const item = createItem({
        code: "kompas-analogowy",
        name: "Kompas Analogowy",
        price: 260,
        rarity: "Podstawowa"
    });
    const visual = resolveItemVisual(item);

    assert.equal(visual.assetPath, path.resolve(ASSET_ROOT, "gadgets", "compass.png"));
    assertPngBuffer(renderShopScreen({
        catalogItems: [item],
        item,
        page: 1,
        playerPP: 1000,
        totalItems: 1,
        totalPages: 1
    }));
});

test("fallback assetu dziala, gdy lokalny plik nie moze zostac wczytany", () => {
    const originalReadFileSync = fs.readFileSync;
    const originalWarn = console.warn;
    const warnings = [];

    clearItemAssetCache();
    console.warn = (message) => warnings.push(message);
    fs.readFileSync = (filePath, ...args) => {
        if (String(filePath).endsWith("aparat.png")) {
            throw new Error("Symulowany blad assetu.");
        }

        return originalReadFileSync.call(fs, filePath, ...args);
    };

    try {
        assertPngBuffer(renderShopScreen({
            catalogItems: [
                createItem({
                    code: "aparat-polaroid"
                })
            ],
            item: createItem({
                code: "aparat-polaroid"
            }),
            page: 1,
            playerPP: 1000,
            totalItems: 1,
            totalPages: 1
        }));
        assert.equal(warnings.length, 1);
        assert.match(warnings[0], /aparat-polaroid/);
    } finally {
        fs.readFileSync = originalReadFileSync;
        console.warn = originalWarn;
        clearItemAssetCache();
    }
});

test("lokalny asset jest rozpoznawany, jesli istnieje", () => {
    clearItemAssetCache();

    const item = createItem({
        code: "aparat-polaroid"
    });
    const visual = resolveItemVisual(item);

    assert.ok(visual.assetPath);
    assert.ok(fs.existsSync(visual.assetPath));
    assertPngBuffer(renderShopScreen({
        catalogItems: [item],
        item,
        page: 1,
        playerPP: 1000,
        totalItems: 1,
        totalPages: 1
    }));
});

test("katalog z 1, 2, 3 i 4 itemami renderuje sie poprawnie", () => {
    for (const itemCount of [1, 2, 3, 4]) {
        const catalogItems = createCatalogItems().slice(0, itemCount);
        const model = normalizeShopScreenData({
            catalogItems,
            item: catalogItems[0],
            page: 1,
            playerPP: 1000,
            totalItems: itemCount,
            totalPages: itemCount
        });

        assert.equal(model.catalogItems.length, itemCount);
        assertPngBuffer(renderShopScreen(model));
    }
});

test("model widoku pokazuje maksymalnie 4 elementy katalogu i oznacza aktywny", () => {
    const activeItem = createItem({
        code: "motyw-crt",
        selected: true
    });
    const model = normalizeShopScreenData({
        catalogItems: [
            createItem({
                code: "ramka-neon",
                selected: false
            }),
            createItem({
                code: "tlo-syntetyczny-zachod",
                selected: false
            }),
            activeItem,
            createItem({
                code: "aparat-polaroid",
                selected: false
            }),
            createItem({
                code: "piaty-item",
                selected: false
            })
        ],
        item: activeItem,
        page: 3,
        playerPP: 1000,
        totalItems: 5,
        totalPages: 5
    });

    assert.equal(model.catalogItems.length, 4);
    assert.equal(model.catalogItems.filter((item) => item.selected).length, 1);
    assert.equal(model.catalogItems.find((item) => item.selected).code, "motyw-crt");
});

test("poczatek mini katalogu nie wychodzi poza zakres paginacji", () => {
    assert.equal(getCatalogPreviewStartPage(0, 2), 0);
    assert.equal(getCatalogPreviewStartPage(1, 4), 0);
    assert.equal(getCatalogPreviewStartPage(3, 5), 1);
    assert.equal(getCatalogPreviewStartPage(7, 8), 4);
});

test("pusty katalog renderuje EmptyState", () => {
    const model = normalizeShopScreenData({
        catalogItems: [],
        item: null,
        playerPP: 0
    });

    assert.equal(model.catalogItems.length, 0);
    assert.equal(model.item, null);
    assertPngBuffer(renderShopScreen(model));
});

test("niepoprawna cena renderuje status niedostepny", () => {
    const item = createItem({
        price: "nie-liczba"
    });
    const status = getStatusView({
        item,
        playerPP: 1000
    });

    assert.equal(status.label, "NIEDOSTEPNY");
    assertPngBuffer(renderShopScreen({
        catalogItems: [item],
        item,
        page: 1,
        playerPP: 1000,
        totalItems: 1,
        totalPages: 1
    }));
});

test("render nie zapisuje pliku na dysku", () => {
    const originalWriteFileSync = fs.writeFileSync;

    fs.writeFileSync = () => {
        throw new Error("Renderer nie powinien zapisywac plikow.");
    };

    try {
        assertPngBuffer(renderShopScreen({
            catalogItems: createCatalogItems(),
            item: createItem({
                code: "motyw-crt"
            }),
            page: 1,
            playerPP: 1000,
            totalItems: 4,
            totalPages: 4
        }));
    } finally {
        fs.writeFileSync = originalWriteFileSync;
    }
});
