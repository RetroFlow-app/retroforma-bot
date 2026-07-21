const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const Database = require("better-sqlite3");

const { initializeDatabase } = require("../src/database/schema");
const { createAdminPointsService, ADMIN_POINT_OPERATIONS } = require("../src/services/adminPointsService");
const { createPointsService } = require("../src/services/pointsService");
const { createShopService } = require("../src/services/shopService");
const { getTopUsersFromDatabase } = require("../src/services/rankingService");
const { collectProfileCardText } = require("../src/services/profileCardService");

function createTempContext() {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "retroforma-pp-total-"));
    const db = new Database(path.join(tempDir, "database.db"));

    initializeDatabase(db);

    function createMember(discordId, username = `Kadet-${discordId}`) {
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

    function getUser(discordId) {
        return db.prepare(`
            SELECT *
            FROM users
            WHERE discord_id = ?
        `).get(discordId);
    }

    function setUserStats(discordId, stats) {
        getOrCreateUser(createMember(discordId, stats.username || `Kadet-${discordId}`));

        db.prepare(`
            UPDATE users
            SET username = ?,
                pp = ?,
                pp_total_earned = ?,
                xp = ?,
                level = ?,
                missions_completed = ?
            WHERE discord_id = ?
        `).run(
            stats.username || `Kadet-${discordId}`,
            stats.pp ?? 0,
            stats.ppTotalEarned ?? stats.pp ?? 0,
            stats.xp ?? 0,
            stats.level ?? 1,
            stats.missionsCompleted ?? 0,
            discordId
        );
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
        getUser,
        setUserStats
    };
}

test("zdobycie misji zwiększa saldo PP i pp_total_earned", () => {
    const context = createTempContext();
    const member = context.createMember("mission-pp-user", "MissionUser");
    const pointsService = createPointsService(context.db);

    try {
        pointsService.getOrCreateUser(member);

        const stats = pointsService.addPoints(member, 20);

        assert.equal(stats.pp, 20);
        assert.equal(stats.pp_total_earned, 20);
        assert.equal(stats.missions_completed, 1);
    } finally {
        context.close();
    }
});

test("zakup zmniejsza saldo PP i nie zmienia pp_total_earned", () => {
    const context = createTempContext();
    const member = context.createMember("shop-pp-user", "ShopUser");
    const service = createShopService({
        db: context.db,
        getOrCreateUser: context.getOrCreateUser
    });

    try {
        context.setUserStats(member.user.id, {
            pp: 1000,
            ppTotalEarned: 1500
        });

        const item = context.db.prepare(`
            SELECT *
            FROM shop_items
            WHERE code = ?
        `).get("ramka-neon");

        service.purchaseItem(member, "ramka-neon");

        const user = context.getUser(member.user.id);

        assert.equal(user.pp, 1000 - item.price);
        assert.equal(user.pp_total_earned, 1500);
    } finally {
        context.close();
    }
});

test("admin dodaj, odejmij i ustaw nie zmieniają pp_total_earned", () => {
    const context = createTempContext();
    const admin = context.createMember("admin-total", "AdminTotal").user;
    const target = context.createMember("admin-target", "AdminTarget").user;
    const service = createAdminPointsService({
        db: context.db,
        getOrCreateUser: context.getOrCreateUser
    });

    try {
        context.setUserStats(target.id, {
            pp: 500,
            ppTotalEarned: 900
        });

        service.changePoints({
            adminUser: admin,
            amount: 100,
            operation: ADMIN_POINT_OPERATIONS.ADD,
            targetUser: target
        });
        assert.equal(context.getUser(target.id).pp_total_earned, 900);

        service.changePoints({
            adminUser: admin,
            amount: 50,
            operation: ADMIN_POINT_OPERATIONS.SUBTRACT,
            targetUser: target
        });
        assert.equal(context.getUser(target.id).pp_total_earned, 900);

        service.changePoints({
            adminUser: admin,
            amount: 10,
            operation: ADMIN_POINT_OPERATIONS.SET,
            targetUser: target
        });

        const user = context.getUser(target.id);

        assert.equal(user.pp, 10);
        assert.equal(user.pp_total_earned, 900);
    } finally {
        context.close();
    }
});

test("ranking sortuje po pp_total_earned, potem XP, level i nickname", () => {
    const context = createTempContext();

    try {
        context.setUserStats("saldo-rich", {
            pp: 9999,
            ppTotalEarned: 100,
            username: "ZZZ Saldo",
            xp: 100,
            level: 1
        });
        context.setUserStats("earned-leader", {
            pp: 1,
            ppTotalEarned: 500,
            username: "Beta",
            xp: 100,
            level: 1
        });
        context.setUserStats("xp-tiebreaker", {
            pp: 1,
            ppTotalEarned: 500,
            username: "Alpha",
            xp: 300,
            level: 1
        });
        context.setUserStats("level-tiebreaker", {
            pp: 1,
            ppTotalEarned: 500,
            username: "Gamma",
            xp: 300,
            level: 3
        });

        const ranking = getTopUsersFromDatabase(context.db);

        assert.deepEqual(ranking.map((user) => user.discord_id).slice(0, 4), [
            "level-tiebreaker",
            "xp-tiebreaker",
            "earned-leader",
            "saldo-rich"
        ]);
        assert.equal(ranking[0].pp, 500);
        assert.equal(ranking[0].pp_balance, 1);
    } finally {
        context.close();
    }
});

test("profil pokazuje aktualne saldo i łącznie zdobyte PP", () => {
    const text = collectProfileCardText({
        missionsCompleted: 3,
        pp: 240,
        ppTotalEarned: 1200,
        rankingPosition: 4,
        username: "Kadet Profilowy",
        xp: 600
    }).join("\n");

    assert.match(text, /240 PP/);
    assert.match(text, /Łącznie zdobyto 1200 PP/);
});
