const test = require("node:test");
const assert = require("node:assert/strict");

const {
    _test: rankingCardTestApi,
    createRankingCard
} = require("../src/services/rankingCardService");

const PNG_SIGNATURE = "89504e470d0a1a0a";

function readPngSize(buffer) {
    return {
        height: buffer.readUInt32BE(20),
        width: buffer.readUInt32BE(16)
    };
}

function assertRankingPng(buffer) {
    assert.ok(Buffer.isBuffer(buffer));
    assert.ok(buffer.length > 1000);
    assert.equal(buffer.subarray(0, 8).toString("hex"), PNG_SIGNATURE);
    assert.deepEqual(readPngSize(buffer), {
        height: rankingCardTestApi.CARD_HEIGHT,
        width: rankingCardTestApi.CARD_WIDTH
    });
}

function createRankingUser(position, overrides = {}) {
    return {
        discordId: `ranking-user-${position}`,
        level: 1 + (position % 12),
        missionsCompleted: 40 - position,
        position,
        pp: 3000 - position * 10,
        rankName: "Kadet",
        username: `Kadet ${String(position).padStart(2, "0")}`,
        xp: 5000 - position * 25,
        ...overrides
    };
}

function createRankingUsers(count) {
    return Array.from({ length: count }, (_, index) => createRankingUser(index + 1));
}

test("ranking Canvas generuje TOP 30 bez ucinania stopki", async () => {
    const users = createRankingUsers(30);
    const buffer = await createRankingCard({
        stats: {
            completed_missions: 222,
            user_count: 30
        },
        updatedAt: new Date("2026-08-15T12:00:00+02:00"),
        users
    });
    const layout = rankingCardTestApi.getRankingLayoutMetrics();

    assertRankingPng(buffer);
    assert.equal(rankingCardTestApi.RANKING_USER_LIMIT, 30);
    assert.equal(layout.tablePanelBottom < layout.footerY, true);
    assert.equal(layout.footerPanelBottom < layout.cardHeight, true);
    assert.equal(layout.footerBrandBottom < layout.cardHeight, true);
});

test("ranking Canvas zachowuje TOP 3 jako podium i miejsca 4-30 jako tabele", () => {
    const users = createRankingUsers(35);
    const normalizedUsers = users.slice(0, rankingCardTestApi.RANKING_USER_LIMIT);
    const podiumUsers = rankingCardTestApi.getPodiumUsers(normalizedUsers);
    const tableUsers = rankingCardTestApi.getTableUsers(normalizedUsers);

    assert.deepEqual(podiumUsers.map((user) => user.position), [1, 2, 3]);
    assert.equal(tableUsers.length, 27);
    assert.equal(tableUsers[0].position, 4);
    assert.equal(tableUsers.at(-1).position, 30);
    assert.equal(tableUsers.some((user) => user.position === 31), false);
});

test("ranking Canvas dziala dla mniej niz 30 uzytkownikow", async () => {
    const users = createRankingUsers(5);
    const buffer = await createRankingCard({
        stats: {
            completed_missions: 12,
            user_count: 5
        },
        updatedAt: new Date("2026-08-15T12:00:00+02:00"),
        users
    });
    const tableUsers = rankingCardTestApi.getTableUsers(users);

    assertRankingPng(buffer);
    assert.deepEqual(tableUsers.map((user) => user.position), [4, 5]);
});
