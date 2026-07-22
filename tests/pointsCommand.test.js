const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const Database = require("better-sqlite3");

const pointsCommand = require("../src/commands/pointsCommand");
const { initializeDatabase } = require("../src/database/schema");
const { createInventoryRepository } = require("../src/services/inventoryRepository");
const { createPointsService } = require("../src/services/pointsService");
const { createShopRepository } = require("../src/services/shopRepository");

function createTempContext() {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "retroforma-punkty-"));
    const db = new Database(path.join(tempDir, "database.db"));

    initializeDatabase(db);

    function createMember(discordId = "points-user", username = "Kadet Punkty") {
        return {
            user: {
                id: discordId,
                tag: `${username}#0001`,
                username
            }
        };
    }

    function getOrCreateUser(member) {
        return createPointsService(db).getOrCreateUser(member);
    }

    function setUserStats(discordId, stats = {}) {
        const member = createMember(discordId, stats.username || "Kadet Punkty");

        getOrCreateUser(member);
        db.prepare(`
            UPDATE users
            SET pp = ?,
                pp_total_earned = ?,
                xp = ?,
                level = ?,
                missions_completed = ?
            WHERE discord_id = ?
        `).run(
            stats.pp ?? 0,
            stats.ppTotalEarned ?? stats.pp ?? 0,
            stats.xp ?? 0,
            stats.level ?? 1,
            stats.missionsCompleted ?? 0,
            discordId
        );

        return db.prepare(`
            SELECT *
            FROM users
            WHERE discord_id = ?
        `).get(discordId);
    }

    function getShopItem(code) {
        return db.prepare(`
            SELECT *
            FROM shop_items
            WHERE code = ?
        `).get(code);
    }

    function ownItem(user, code) {
        const item = getShopItem(code);

        db.prepare(`
            INSERT OR IGNORE INTO user_inventory (user_id, item_id, obtained_at)
            VALUES (?, ?, ?)
        `).run(user.id, item.id, new Date().toISOString());
    }

    function ownAllActiveItems(user) {
        const items = db.prepare(`
            SELECT id
            FROM shop_items
            WHERE active = 1
        `).all();

        for (const item of items) {
            db.prepare(`
                INSERT OR IGNORE INTO user_inventory (user_id, item_id, obtained_at)
                VALUES (?, ?, ?)
            `).run(user.id, item.id, new Date().toISOString());
        }
    }

    return {
        close: () => {
            db.close();
            fs.rmSync(tempDir, {
                recursive: true,
                force: true
            });
        },
        createMember,
        db,
        getOrCreateUser,
        ownAllActiveItems,
        ownItem,
        setUserStats
    };
}

function createRepositories(context) {
    return {
        inventoryRepository: createInventoryRepository(context.db),
        shopRepository: createShopRepository(context.db)
    };
}

function getEmbedText(embed) {
    const data = embed.data;
    const fieldText = (data.fields || [])
        .map((field) => `${field.name}\n${field.value}`)
        .join("\n");

    return [
        data.title,
        data.description,
        fieldText
    ].filter(Boolean).join("\n");
}

function createInteraction(member) {
    const calls = [];

    return {
        calls,
        member,
        async reply(payload) {
            calls.push({
                name: "reply",
                payload
            });
            return payload;
        }
    };
}

test("użytkownik bez przedmiotów widzi najtańszy dostępny przedmiot", () => {
    const context = createTempContext();
    const user = context.setUserStats("points-empty", {
        pp: 120,
        ppTotalEarned: 540
    });

    try {
        const nextGoal = pointsCommand.findNextPpGoal(user, createRepositories(context));
        const embed = pointsCommand.createPointsSummaryEmbed(user, {
            nextGoal
        });
        const text = getEmbedText(embed);

        assert.equal(nextGoal.item.code, "kompas-analogowy");
        assert.match(text, /Kompas Analogowy/);
        assert.match(text, /Koszt: 260 PP/);
        assert.match(text, /Aktualne PP: 120/);
        assert.match(text, /Brakuje: 140 PP/);
    } finally {
        context.close();
    }
});

test("użytkownik posiadający część przedmiotów widzi kolejny nieposiadany", () => {
    const context = createTempContext();
    const user = context.setUserStats("points-partial", {
        pp: 300,
        ppTotalEarned: 900
    });

    try {
        context.ownItem(user, "kompas-analogowy");

        const nextGoal = pointsCommand.findNextPpGoal(user, createRepositories(context));
        const text = getEmbedText(pointsCommand.createPointsSummaryEmbed(user, {
            nextGoal
        }));

        assert.equal(nextGoal.item.code, "ramka-carbon");
        assert.match(text, /Ramka Carbon/);
        assert.match(text, /Koszt: 360 PP/);
        assert.doesNotMatch(text, /Kompas Analogowy/);
    } finally {
        context.close();
    }
});

test("użytkownik posiadający wszystko widzi komunikat gratulacyjny", () => {
    const context = createTempContext();
    const user = context.setUserStats("points-complete", {
        pp: 5000,
        ppTotalEarned: 7000
    });

    try {
        context.ownAllActiveItems(user);

        const nextGoal = pointsCommand.findNextPpGoal(user, createRepositories(context));
        const text = getEmbedText(pointsCommand.createPointsSummaryEmbed(user, {
            nextGoal
        }));

        assert.equal(nextGoal.complete, true);
        assert.match(text, /Gratulacje/);
        assert.match(text, /Posiadasz wszystkie aktualnie dostępne przedmioty/);
        assert.match(text, /Czekaj na kolejne aktualizacje sklepu/);
    } finally {
        context.close();
    }
});

test("/punkty pokazuje poprawne saldo, total earned i statystyki", async () => {
    const context = createTempContext();
    const member = context.createMember("points-command-user", "PunktyUser");
    const user = context.setUserStats(member.user.id, {
        level: 5,
        missionsCompleted: 11,
        pp: 240,
        ppTotalEarned: 1280,
        xp: 990
    });
    const interaction = createInteraction(member);

    try {
        await pointsCommand.execute(interaction, {
            ...createRepositories(context),
            getOrCreateUser: () => user
        });

        const payload = interaction.calls[0].payload;
        const text = getEmbedText(payload.embeds[0]);

        assert.equal(payload.ephemeral, true);
        assert.match(text, /💰 Dostępne PP\n240/);
        assert.match(text, /Łącznie zdobyte\n1280/);
        assert.match(text, /Ukończone misje\n11/);
        assert.match(text, /XP\n990/);
        assert.match(text, /Poziom\n5/);
    } finally {
        context.close();
    }
});

test("/punkty nie zawiera starych komunikatów o niegotowym arsenale", () => {
    const context = createTempContext();
    const user = context.setUserStats("points-no-old-copy", {
        pp: 100
    });

    try {
        const text = getEmbedText(pointsCommand.createPointsSummaryEmbed(user, {
            ...createRepositories(context)
        }));

        assert.doesNotMatch(text, /Arsenał wkrótce/i);
        assert.doesNotMatch(text, /W przygotowaniu/i);
        assert.doesNotMatch(text, /Następna aktualizacja/i);
        assert.doesNotMatch(text, /Brązowa ramka profilu/i);
    } finally {
        context.close();
    }
});
