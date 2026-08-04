const { applyMissionSchedule } = require("./missionScheduleService");

const LEGACY_SEQUENTIAL_SLOT_LIMIT = 15;
const ORDINARY_DIFFICULTY_CYCLE = [
    "Trudny",
    "Średni",
    "Trudny",
    "Łatwy",
    "Średni",
    "Trudny",
    "Średni",
    "Łatwy"
];

// Upraszcza porównywanie trudności niezależnie od polskich znaków i wielkości liter.
function normalizeDifficultyKey(value) {
    const normalizedValue = String(value || "")
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/ł/g, "l");

    if (normalizedValue.includes("trud")) {
        return "trudny";
    }

    if (normalizedValue.includes("sred")) {
        return "sredni";
    }

    if (normalizedValue.includes("latw")) {
        return "latwy";
    }

    return normalizedValue;
}

function getMissionId(mission) {
    return Number(mission.id);
}

function sortMissionsById(missions) {
    return [...missions]
        .filter((mission) => Number.isInteger(getMissionId(mission)) && getMissionId(mission) > 0)
        .sort((firstMission, secondMission) => getMissionId(firstMission) - getMissionId(secondMission));
}

function findMissionById(missions, missionId) {
    return missions.find((mission) => getMissionId(mission) === missionId) || null;
}

function getDifficultyForSlot(scheduleSlot) {
    if (scheduleSlot <= LEGACY_SEQUENTIAL_SLOT_LIMIT) {
        return null;
    }

    const cycleIndex = (scheduleSlot - LEGACY_SEQUENTIAL_SLOT_LIMIT - 1) % ORDINARY_DIFFICULTY_CYCLE.length;

    return ORDINARY_DIFFICULTY_CYCLE[cycleIndex];
}

function findFirstUnusedMissionByDifficulty(missions, usedMissionIds, difficulty) {
    const difficultyKey = normalizeDifficultyKey(difficulty);

    return missions.find((mission) => (
        !usedMissionIds.has(getMissionId(mission))
        && normalizeDifficultyKey(mission.difficulty) === difficultyKey
    )) || null;
}

function findFirstUnusedMission(missions, usedMissionIds) {
    return missions.find((mission) => !usedMissionIds.has(getMissionId(mission))) || null;
}

function selectMissionForQueueStep({ missions, scheduleSlot, usedMissionIds }) {
    if (scheduleSlot <= LEGACY_SEQUENTIAL_SLOT_LIMIT) {
        return findMissionById(missions, scheduleSlot);
    }

    const expectedDifficulty = getDifficultyForSlot(scheduleSlot);

    return findFirstUnusedMissionByDifficulty(missions, usedMissionIds, expectedDifficulty)
        || findFirstUnusedMission(missions, usedMissionIds);
}

// Buduje deterministyczną kolejkę: #1-#15 zostają bez zmian, potem działa cykl trudności.
function buildMissionQueue(missions, options = {}) {
    const sortedMissions = sortMissionsById(missions);
    const maxSlots = Math.max(0, Number(options.maxSlots) || sortedMissions.length);
    const applySchedule = options.applySchedule || applyMissionSchedule;
    const usedMissionIds = new Set();
    const queue = [];

    for (let scheduleSlot = 1; scheduleSlot <= maxSlots; scheduleSlot += 1) {
        const selectedMission = selectMissionForQueueStep({
            missions: sortedMissions,
            scheduleSlot,
            usedMissionIds
        });

        if (!selectedMission) {
            continue;
        }

        usedMissionIds.add(getMissionId(selectedMission));
        queue.push(applySchedule(selectedMission, scheduleSlot));
    }

    return queue;
}

function isDue(dateValue, now = new Date()) {
    return dateValue && new Date(dateValue).getTime() <= now.getTime();
}

function isAfter(dateValue, now = new Date()) {
    return dateValue && new Date(dateValue).getTime() > now.getTime();
}

function isQueuedMissionActive(mission, now = new Date()) {
    return !mission.closed
        && isDue(mission.publishAt, now)
        && isAfter(mission.closeAt, now);
}

function getActiveQueuedMission(missions, now = new Date(), options = {}) {
    return buildMissionQueue(missions, options)
        .find((mission) => isQueuedMissionActive(mission, now)) || null;
}

function getQueuedMissionsDueForClose(missions, now = new Date(), options = {}) {
    return buildMissionQueue(missions, options)
        .filter((mission) => !mission.closed && isDue(mission.closeAt, now));
}

function selectMissionForScheduleSlot(missions, scheduleSlot, options = {}) {
    return buildMissionQueue(missions, {
        ...options,
        maxSlots: scheduleSlot
    }).find((mission) => mission.scheduleSlot === scheduleSlot) || null;
}

module.exports = {
    LEGACY_SEQUENTIAL_SLOT_LIMIT,
    ORDINARY_DIFFICULTY_CYCLE,
    buildMissionQueue,
    getActiveQueuedMission,
    getDifficultyForSlot,
    getQueuedMissionsDueForClose,
    normalizeDifficultyKey,
    selectMissionForScheduleSlot
};
