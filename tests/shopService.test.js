const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const Database = require("better-sqlite3");

const {
    BACKGROUND_SHOP_ITEM_CODES,
    FRAME_SHOP_ITEM_CODES,
    INITIAL_SHOP_ITEMS,
    REMOVED_SHOP_ITEM_CODES,
    SHOP_CATEGORIES
} = require("../src/database/shopSeedData");
const { initializeDatabase } = require("../src/database/schema");
const {
    SHOP_PURCHASE_ERRORS,
    createShopService
} = require("../src/services/shopService");
const { createInventoryRepository } = require("../src/services/inventoryRepository");

function createTempShopContext() {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "retroforma-shop-"));
    const db = new Database(path.join(tempDir, "shop-test.sqlite"));

    initializeDatabase(db);

    function getOrCreateUser(member) {
        const user = member.user || member;
        const username = user.tag || user.username || "Testowy Kadet";
        const existingUser = db.prepare(`
            SELECT *
            FROM users
            WHERE discord_id = ?
        `).get(user.id);

        if (existingUser) {
            db.prepare(`
                UPDATE users
                SET username = ?
                WHERE discord_id = ?
            `).run(username, user.id);

            return {
                ...existingUser,
                username
            };
        }

        db.prepare(`
            INSERT INTO users (discord_id, username, created_at)
            VALUES (?, ?, ?)
        `).run(user.id, username, new Date().toISOString());

        return db.prepare(`
            SELECT *
            FROM users
            WHERE discord_id = ?
        `).get(user.id);
    }

    function setUserPp(member, pp) {
        const user = getOrCreateUser(member);

        db.prepare(`
            UPDATE users
            SET pp = ?
            WHERE id = ?
        `).run(pp, user.id);

        return db.prepare(`
            SELECT *
            FROM users
            WHERE id = ?
        `).get(user.id);
    }

    function getUser(member) {
        const user = member.user || member;

        return db.prepare(`
            SELECT *
            FROM users
            WHERE discord_id = ?
        `).get(user.id);
    }

    function getInventoryCount(userId) {
        return db.prepare(`
            SELECT COUNT(*) AS count
            FROM user_inventory
            WHERE user_id = ?
        `).get(userId).count;
    }

    const service = createShopService({
        db,
        getOrCreateUser
    });

    return {
        close: () => {
            db.close();
            fs.rmSync(tempDir, {
                recursive: true,
                force: true
            });
        },
        db,
        getInventoryCount,
        getOrCreateUser,
        getUser,
        service,
        setUserPp
    };
}

function createMember(id = "shop-user-1") {
    return {
        user: {
            id,
            tag: `Kadet#${id.slice(-4)}`,
            username: `Kadet-${id}`
        }
    };
}

function getItem(db, code) {
    return db.prepare(`
        SELECT *
        FROM shop_items
        WHERE code = ?
    `).get(code);
}

function findShopItemInView(service, member, category, code) {
    const firstView = service.getShopView(member, {
        category,
        page: 0
    });

    for (let page = 0; page < firstView.totalPages; page += 1) {
        const view = service.getShopView(member, {
            category,
            page
        });
        const item = view.items.find((shopItem) => shopItem.code === code);

        if (item) {
            return item;
        }
    }

    return null;
}

test("seed przedmiotów sklepu jest idempotentny i nie nadpisuje danych", () => {
    const { db, close } = createTempShopContext();

    try {
        const initialCount = db.prepare("SELECT COUNT(*) AS count FROM shop_items").get().count;

        assert.equal(initialCount, INITIAL_SHOP_ITEMS.length);

        db.prepare(`
            UPDATE shop_items
            SET name = ?
            WHERE code = ?
        `).run("Ramka Neon Test", "ramka-neon");

        initializeDatabase(db);
        initializeDatabase(db);

        const finalCount = db.prepare("SELECT COUNT(*) AS count FROM shop_items").get().count;
        const changedItem = getItem(db, "ramka-neon");

        assert.equal(finalCount, INITIAL_SHOP_ITEMS.length);
        assert.equal(changedItem.name, "Ramka Neon Test");
    } finally {
        close();
    }
});

test("katalog sklepu nie zawiera wycofanych odznak ani tytulow", () => {
    const { close, service } = createTempShopContext();
    const member = createMember();

    try {
        const removedCodes = new Set(REMOVED_SHOP_ITEM_CODES);
        const visibleCodes = new Set();
        const firstView = service.getShopView(member, {
            category: "all",
            page: 0
        });

        for (let page = 0; page < firstView.totalPages; page += 1) {
            const view = service.getShopView(member, {
                category: "all",
                page
            });

            for (const item of view.items) {
                visibleCodes.add(item.code);
            }
        }

        assert.equal(SHOP_CATEGORIES.some((category) => category.id === "tytuly"), false);
        assert.equal(INITIAL_SHOP_ITEMS.some((item) => removedCodes.has(item.code)), false);

        for (const removedCode of removedCodes) {
            assert.equal(visibleCodes.has(removedCode), false);
        }
    } finally {
        close();
    }
});

test("katalog zawiera aktywna kategorie ramek bez pustych kategorii", () => {
    const { close, service } = createTempShopContext();
    const member = createMember();

    try {
        const categories = service.getShopView(member, {
            category: "all",
            page: 0
        }).categories;
        const categoryIds = categories.map((category) => category.id);

        assert.ok(categoryIds.includes("ramki"));
        assert.ok(categoryIds.includes("motywy-profilu"));

        for (const category of categories.filter((entry) => entry.id !== "all")) {
            const view = service.getShopView(member, {
                category: category.id,
                page: 0
            });

            assert.ok(view.totalItems > 0, `Kategoria ${category.id} nie powinna byc pusta.`);
        }
    } finally {
        close();
    }
});

test("wszystkie tla profilu sa aktywne w kategorii motywy profilu", () => {
    const { close, db, service } = createTempShopContext();
    const member = createMember();

    try {
        for (const backgroundCode of BACKGROUND_SHOP_ITEM_CODES) {
            const item = getItem(db, backgroundCode);

            assert.ok(item, `Brakuje tla ${backgroundCode}.`);
            assert.equal(item.category, "motywy-profilu");
            assert.equal(item.active, 1);
            assert.ok(Number.isSafeInteger(Number(item.price)));
            assert.ok(Number(item.price) > 0);
        }

        const backgroundView = service.getShopView(member, {
            category: "motywy-profilu",
            page: 0
        });

        assert.equal(backgroundView.totalItems, BACKGROUND_SHOP_ITEM_CODES.length);
        assert.equal(backgroundView.totalPages, BACKGROUND_SHOP_ITEM_CODES.length);
    } finally {
        close();
    }
});

test("wszystkie ramki sa aktywne i maja spojna kategorie", () => {
    const { close, db, service } = createTempShopContext();
    const member = createMember();

    try {
        for (const frameCode of FRAME_SHOP_ITEM_CODES) {
            const item = getItem(db, frameCode);

            assert.ok(item, `Brakuje ramki ${frameCode}.`);
            assert.equal(item.category, "ramki");
            assert.equal(item.active, 1);
            assert.ok(Number.isSafeInteger(Number(item.price)));
            assert.ok(Number(item.price) >= 300);
        }

        const frameView = service.getShopView(member, {
            category: "ramki",
            page: 0
        });

        assert.equal(frameView.totalItems, FRAME_SHOP_ITEM_CODES.length);
        assert.equal(frameView.totalPages, FRAME_SHOP_ITEM_CODES.length);
    } finally {
        close();
    }
});

test("initializeDatabase przenosi starsza ramke neon do kategorii ramki", () => {
    const { close, db } = createTempShopContext();

    try {
        db.prepare(`
            UPDATE shop_items
            SET category = ?,
                name = ?
            WHERE code = ?
        `).run("personalizacja", "Ramka Neon Test", "ramka-neon");

        initializeDatabase(db);

        const neonFrame = getItem(db, "ramka-neon");

        assert.equal(neonFrame.category, "ramki");
        assert.equal(neonFrame.name, "Ramka Neon Test");
    } finally {
        close();
    }
});

test("initializeDatabase przenosi starsze tla do kategorii motywy profilu", () => {
    const { close, db } = createTempShopContext();

    try {
        db.prepare(`
            UPDATE shop_items
            SET category = ?
            WHERE code IN (?, ?)
        `).run("personalizacja", "motyw-crt", "tlo-syntetyczny-zachod");

        initializeDatabase(db);

        assert.equal(getItem(db, "motyw-crt").category, "motywy-profilu");
        assert.equal(getItem(db, "tlo-syntetyczny-zachod").category, "motywy-profilu");
    } finally {
        close();
    }
});

test("initializeDatabase przenosi starszy terminal bez naruszania inventory", () => {
    const {
        close,
        db,
        getOrCreateUser
    } = createTempShopContext();
    const member = createMember("legacy-terminal-owner");

    try {
        const user = getOrCreateUser(member);
        const terminal = getItem(db, "terminal");

        db.prepare(`
            UPDATE shop_items
            SET code = ?,
                name = ?
            WHERE id = ?
        `).run("terminal-przenosny", "Terminal Przenosny", terminal.id);

        db.prepare(`
            INSERT INTO user_inventory (user_id, item_id, obtained_at)
            VALUES (?, ?, ?)
        `).run(user.id, terminal.id, new Date().toISOString());

        initializeDatabase(db);

        const migratedTerminal = getItem(db, "terminal");
        const legacyTerminal = getItem(db, "terminal-przenosny");
        const inventoryRow = db.prepare(`
            SELECT item_id
            FROM user_inventory
            WHERE user_id = ?
        `).get(user.id);

        assert.equal(migratedTerminal.id, terminal.id);
        assert.equal(migratedTerminal.name, "Terminal Polowy");
        assert.equal(migratedTerminal.description, terminal.description);
        assert.equal(migratedTerminal.price, terminal.price);
        assert.equal(migratedTerminal.rarity, terminal.rarity);
        assert.equal(legacyTerminal, undefined);
        assert.equal(inventoryRow.item_id, terminal.id);
    } finally {
        close();
    }
});

test("initializeDatabase dezaktywuje stare rekordy odznak bez usuwania inventory", () => {
    const {
        close,
        db,
        getInventoryCount,
        getOrCreateUser,
        service
    } = createTempShopContext();
    const member = createMember("legacy-shop-user");

    try {
        const user = getOrCreateUser(member);

        db.prepare(`
            INSERT INTO shop_items (
                code,
                name,
                description,
                category,
                price,
                rarity,
                active,
                created_at
            )
            VALUES (?, ?, ?, ?, ?, ?, 1, ?)
        `).run(
            "emblemat-explorer",
            "Emblemat Explorer",
            "Stary rekord sklepu z odznaka.",
            "personalizacja",
            360,
            "Niepospolita",
            new Date().toISOString()
        );

        const oldItem = getItem(db, "emblemat-explorer");

        db.prepare(`
            INSERT INTO user_inventory (user_id, item_id, obtained_at)
            VALUES (?, ?, ?)
        `).run(user.id, oldItem.id, new Date().toISOString());

        initializeDatabase(db);

        const disabledItem = getItem(db, "emblemat-explorer");
        const allView = service.getShopView(member, {
            category: "all",
            page: 0
        });

        assert.equal(disabledItem.active, 0);
        assert.equal(getInventoryCount(user.id), 1);
        assert.equal(findShopItemInView(service, member, "all", "emblemat-explorer"), null);
        assert.equal(allView.categories.some((category) => category.id === "tytuly"), false);
    } finally {
        close();
    }
});

test("udany zakup odejmuje PP i dodaje przedmiot do inventory", () => {
    const { close, db, getInventoryCount, getUser, service, setUserPp } = createTempShopContext();
    const member = createMember();

    try {
        setUserPp(member, 1000);

        const item = getItem(db, "ramka-neon");
        const result = service.purchaseItem(member, "ramka-neon");
        const user = getUser(member);

        assert.equal(result.item.code, "ramka-neon");
        assert.equal(result.remainingPp, 1000 - item.price);
        assert.equal(user.pp, 1000 - item.price);
        assert.equal(getInventoryCount(user.id), 1);
    } finally {
        close();
    }
});

test("brak PP nie zmienia salda ani inventory", () => {
    const { close, getInventoryCount, getUser, service, setUserPp } = createTempShopContext();
    const member = createMember();

    try {
        const userBefore = setUserPp(member, 10);

        assert.throws(
            () => service.purchaseItem(member, "ramka-neon"),
            (error) => error.code === SHOP_PURCHASE_ERRORS.INSUFFICIENT_PP
        );

        const userAfter = getUser(member);

        assert.equal(userAfter.pp, userBefore.pp);
        assert.equal(getInventoryCount(userAfter.id), 0);
    } finally {
        close();
    }
});

test("drugi zakup tego samego przedmiotu jest odrzucony bez drugiego obciążenia", () => {
    const { close, db, getInventoryCount, getUser, service, setUserPp } = createTempShopContext();
    const member = createMember();

    try {
        setUserPp(member, 2000);

        const item = getItem(db, "ramka-neon");

        service.purchaseItem(member, "ramka-neon");

        assert.throws(
            () => service.purchaseItem(member, "ramka-neon"),
            (error) => error.code === SHOP_PURCHASE_ERRORS.ALREADY_OWNED
        );

        const user = getUser(member);

        assert.equal(user.pp, 2000 - item.price);
        assert.equal(getInventoryCount(user.id), 1);
    } finally {
        close();
    }
});

test("równoległa próba zakupu nie powoduje podwójnego obciążenia", async () => {
    const { close, db, getInventoryCount, getUser, service, setUserPp } = createTempShopContext();
    const member = createMember();

    try {
        setUserPp(member, 2000);

        const item = getItem(db, "ramka-neon");
        const results = await Promise.allSettled([
            Promise.resolve().then(() => service.purchaseItem(member, "ramka-neon")),
            Promise.resolve().then(() => service.purchaseItem(member, "ramka-neon"))
        ]);
        const fulfilled = results.filter((result) => result.status === "fulfilled");
        const rejected = results.filter((result) => result.status === "rejected");
        const user = getUser(member);

        assert.equal(fulfilled.length, 1);
        assert.equal(rejected.length, 1);
        assert.equal(rejected[0].reason.code, SHOP_PURCHASE_ERRORS.ALREADY_OWNED);
        assert.equal(user.pp, 2000 - item.price);
        assert.equal(getInventoryCount(user.id), 1);
    } finally {
        close();
    }
});

test("nieaktywny przedmiot nie może być kupiony", () => {
    const { close, db, getInventoryCount, getUser, service, setUserPp } = createTempShopContext();
    const member = createMember();

    try {
        const userBefore = setUserPp(member, 2000);

        db.prepare(`
            UPDATE shop_items
            SET active = 0
            WHERE code = ?
        `).run("ramka-neon");

        assert.throws(
            () => service.purchaseItem(member, "ramka-neon"),
            (error) => error.code === SHOP_PURCHASE_ERRORS.ITEM_UNAVAILABLE
        );

        const userAfter = getUser(member);

        assert.equal(userAfter.pp, userBefore.pp);
        assert.equal(getInventoryCount(userAfter.id), 0);
    } finally {
        close();
    }
});

test("saldo PP nigdy nie spada poniżej zera", () => {
    const { close, db, getUser, service, setUserPp } = createTempShopContext();
    const member = createMember();

    try {
        const item = getItem(db, "ramka-neon");

        setUserPp(member, item.price - 1);

        assert.throws(
            () => service.purchaseItem(member, "ramka-neon"),
            (error) => error.code === SHOP_PURCHASE_ERRORS.INSUFFICIENT_PP
        );

        assert.equal(getUser(member).pp, item.price - 1);
        assert.ok(getUser(member).pp >= 0);
    } finally {
        close();
    }
});

test("awaria odjęcia PP po INSERT wycofuje przedmiot z inventory", () => {
    const {
        close,
        db,
        getInventoryCount,
        getOrCreateUser,
        getUser,
        setUserPp
    } = createTempShopContext();
    const member = createMember();

    try {
        const userBefore = setUserPp(member, 1000);
        const baseInventoryRepository = createInventoryRepository(db);
        const service = createShopService({
            db,
            getOrCreateUser,
            inventoryRepository: {
                ...baseInventoryRepository,
                addItem(entry) {
                    const result = baseInventoryRepository.addItem(entry);

                    // Symuluje zmianę salda między INSERT inventory a warunkowym UPDATE PP.
                    db.prepare(`
                        UPDATE users
                        SET pp = 0
                        WHERE id = ?
                    `).run(entry.userId);

                    return result;
                }
            }
        });

        assert.throws(
            () => service.purchaseItem(member, "ramka-neon"),
            (error) => error.code === SHOP_PURCHASE_ERRORS.PURCHASE_FAILED
        );

        const userAfter = getUser(member);

        assert.equal(userAfter.pp, userBefore.pp);
        assert.equal(getInventoryCount(userAfter.id), 0);
    } finally {
        close();
    }
});

test("ujemna cena nie zwiększa PP i nie dodaje inventory", () => {
    const { close, db, getInventoryCount, getUser, service, setUserPp } = createTempShopContext();
    const member = createMember();

    try {
        const userBefore = setUserPp(member, 200);

        db.prepare(`
            UPDATE shop_items
            SET price = ?
            WHERE code = ?
        `).run(-100, "ramka-neon");

        assert.throws(
            () => service.purchaseItem(member, "ramka-neon"),
            (error) => error.code === SHOP_PURCHASE_ERRORS.ITEM_UNAVAILABLE
        );

        const userAfter = getUser(member);

        assert.equal(userAfter.pp, userBefore.pp);
        assert.equal(getInventoryCount(userAfter.id), 0);
    } finally {
        close();
    }
});

test("nieprawidłowa cena nie zmienia PP ani inventory", () => {
    const { close, db, getInventoryCount, getUser, service, setUserPp } = createTempShopContext();
    const member = createMember();

    try {
        const userBefore = setUserPp(member, 200);

        db.prepare(`
            UPDATE shop_items
            SET price = ?
            WHERE code = ?
        `).run("nie-liczba", "ramka-neon");

        assert.throws(
            () => service.purchaseItem(member, "ramka-neon"),
            (error) => error.code === SHOP_PURCHASE_ERRORS.ITEM_UNAVAILABLE
        );

        const userAfter = getUser(member);

        assert.equal(userAfter.pp, userBefore.pp);
        assert.equal(getInventoryCount(userAfter.id), 0);
    } finally {
        close();
    }
});

test("lista sklepu poprawnie oznacza posiadane przedmioty", () => {
    const { close, service, setUserPp } = createTempShopContext();
    const member = createMember();

    try {
        setUserPp(member, 1000);
        service.purchaseItem(member, "ramka-neon");

        const ownedItem = findShopItemInView(service, member, "ramki", "ramka-neon");

        assert.ok(ownedItem);
        assert.equal(ownedItem.owned, true);
    } finally {
        close();
    }
});
