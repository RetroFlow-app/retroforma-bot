const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const Database = require("better-sqlite3");

const { INITIAL_SHOP_ITEMS } = require("../src/database/shopSeedData");
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

        const ownedItem = findShopItemInView(service, member, "personalizacja", "ramka-neon");

        assert.ok(ownedItem);
        assert.equal(ownedItem.owned, true);
    } finally {
        close();
    }
});
