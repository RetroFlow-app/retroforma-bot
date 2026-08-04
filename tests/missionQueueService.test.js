const test = require("node:test");
const assert = require("node:assert/strict");

const { getAllMissions } = require("../src/services/missionService");
const {
    ORDINARY_DIFFICULTY_CYCLE,
    buildMissionQueue,
    getActiveQueuedMission,
    normalizeDifficultyKey,
    selectMissionForScheduleSlot
} = require("../src/services/missionQueueService");
const { _test: reviewServiceTestApi } = require("../src/services/reviewService");
const { createMissionEmbed } = require("../src/utils/embedFactory");

function createMission(id, difficulty, overrides = {}) {
    return {
        id,
        number: String(id).padStart(3, "0"),
        difficulty,
        points: 20,
        xp: 100,
        published: false,
        closed: false,
        messageId: null,
        ...overrides
    };
}

function createMixedMissions() {
    return [
        ...Array.from({ length: 15 }, (_, index) => createMission(index + 1, "Łatwy")),
        createMission(16, "Łatwy"),
        createMission(17, "Łatwy"),
        createMission(30, "Trudny"),
        createMission(31, "Średni"),
        createMission(32, "Trudny"),
        createMission(33, "Łatwy"),
        createMission(34, "Średni"),
        createMission(35, "Trudny"),
        createMission(36, "Średni"),
        createMission(37, "Łatwy")
    ];
}

test("kolejka trudności startuje po misji #15 od poziomu Trudny", () => {
    const mission = selectMissionForScheduleSlot(createMixedMissions(), 16, {
        applySchedule: (selectedMission, scheduleSlot) => ({
            ...selectedMission,
            scheduleSlot
        })
    });

    assert.equal(mission.id, 30);
    assert.equal(mission.difficulty, "Trudny");
});

test("kolejka nie powtarza grafiki, dopóki ma niewykorzystane misje z danego poziomu", () => {
    const queue = buildMissionQueue(createMixedMissions(), {
        applySchedule: (selectedMission, scheduleSlot) => ({
            ...selectedMission,
            scheduleSlot
        }),
        maxSlots: 23
    });
    const postLegacyQueue = queue.slice(15);

    assert.deepEqual(
        postLegacyQueue.map((mission) => mission.difficulty),
        ORDINARY_DIFFICULTY_CYCLE
    );
    assert.equal(new Set(postLegacyQueue.map((mission) => mission.id)).size, postLegacyQueue.length);
});

test("produkcyjna kolejka zostawia aktywną misję #15 bez zmian", () => {
    const activeMission = getActiveQueuedMission(
        getAllMissions(),
        new Date("2026-08-04T16:30:00+02:00")
    );

    assert.equal(activeMission.id, 15);
    assert.equal(activeMission.scheduleSlot, 15);
});

test("następny slot po misji #15 wybiera misję trudną", () => {
    const nextMission = selectMissionForScheduleSlot(getAllMissions(), 16);

    assert.equal(normalizeDifficultyKey(nextMission.difficulty), "trudny");
});

test("publikacja 06.08.2026 o 16:00 korzysta z misji trudnej", () => {
    const activeMission = getActiveQueuedMission(
        getAllMissions(),
        new Date("2026-08-06T16:30:00+02:00")
    );

    assert.equal(activeMission.scheduleSlot, 16);
    assert.equal(normalizeDifficultyKey(activeMission.difficulty), "trudny");
});

test("łatwy poziom wraca mniej więcej raz w tygodniu w cyklu po #15", () => {
    const queue = buildMissionQueue(createMixedMissions(), {
        applySchedule: (selectedMission, scheduleSlot) => ({
            ...selectedMission,
            scheduleSlot
        }),
        maxSlots: 23
    });
    const postLegacyDifficulties = queue.slice(15).map((mission) => normalizeDifficultyKey(mission.difficulty));

    assert.equal(postLegacyDifficulties.filter((difficulty) => difficulty === "latwy").length, 2);
    assert.deepEqual(
        postLegacyDifficulties,
        ["trudny", "sredni", "trudny", "latwy", "sredni", "trudny", "sredni", "latwy"]
    );
});

test("nowa kolejka nie zmienia nagród zapisanych w danych misji", () => {
    const nextMission = selectMissionForScheduleSlot(getAllMissions(), 16);

    assert.equal(nextMission.points, 20);
    assert.equal(nextMission.xp, 100);
});

test("wszystkie poziomy zwykłych Misji CAD mają identyczne nagrody", () => {
    const missions = getAllMissions();
    const difficultyKeys = new Set(missions.map((mission) => normalizeDifficultyKey(mission.difficulty)));
    const invalidRewards = missions.filter((mission) => mission.points !== 20 || mission.xp !== 100);

    assert.equal(difficultyKeys.has("latwy"), true);
    assert.equal(difficultyKeys.has("sredni"), true);
    assert.equal(difficultyKeys.has("trudny"), true);
    assert.deepEqual(invalidRewards, []);
});

test("akceptacja zwykłej misji CAD pobiera 20 PP i 100 XP", () => {
    const hardMission = reviewServiceTestApi.getMissionForReview(353);

    assert.equal(reviewServiceTestApi.getMissionPoints(hardMission), 20);
    assert.equal(reviewServiceTestApi.getMissionXP(hardMission), 100);
});

test("publiczny embed zwykłej misji nie pokazuje numeru misji", () => {
    const embed = createMissionEmbed({
        closeAt: "2026-08-06T15:00:00+02:00",
        description: "Odtwórz model CAD.",
        difficulty: "Trudny",
        number: "015",
        points: 20,
        xp: 100
    });
    const description = embed.data.description;

    assert.match(description, /MISJA CAD/);
    assert.doesNotMatch(description, /MISJA CAD #015/);
    assert.match(description, /20 PP/);
    assert.match(description, /100 XP/);
});
