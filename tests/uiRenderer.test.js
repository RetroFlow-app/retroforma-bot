const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const {
    getRarityStyle
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
            code: "emblemat-explorer",
            name: "Emblemat Explorer",
            page: 4,
            price: 360,
            rarity: "Niepospolita",
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
        category: "Odznaki",
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

test("kazda rzadkosc renderuje sie bez bledu", () => {
    const rarities = [
        "Podstawowa",
        "Niepospolita",
        "Rzadka",
        "Epicka",
        "Legendarna"
    ];

    for (const rarity of rarities) {
        assert.ok(getRarityStyle(rarity));
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

test("fallback ikony dziala bez assetu", () => {
    const item = createItem({
        code: "brak-lokalnego-assetu",
        name: "Nieznany Modul"
    });
    const visual = resolveItemVisual(item);

    assert.equal(visual.assetPath, null);
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

    clearItemAssetCache();
    fs.readFileSync = (filePath, ...args) => {
        if (String(filePath).endsWith("ramka-neon.svg")) {
            throw new Error("Symulowany blad assetu.");
        }

        return originalReadFileSync.call(fs, filePath, ...args);
    };

    try {
        assertPngBuffer(renderShopScreen({
            catalogItems: [createItem()],
            item: createItem(),
            page: 1,
            playerPP: 1000,
            totalItems: 1,
            totalPages: 1
        }));
    } finally {
        fs.readFileSync = originalReadFileSync;
        clearItemAssetCache();
    }
});

test("lokalny asset jest rozpoznawany, jesli istnieje", () => {
    clearItemAssetCache();

    const item = createItem({
        code: "ramka-neon"
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
                code: "emblemat-explorer",
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
                code: "brak-lokalnego-assetu"
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
