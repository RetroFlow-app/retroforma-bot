const cron = require("node-cron");

const config = require("../config/appConfig");
const {
    appendSubmissionEndNotice,
    findPublishedMissionMessage,
    logMissionClosed,
    missionMessageExists,
    publishMission
} = require("../services/missionDiscordService");
const {
    getAllMissions,
    getMission,
    markMissionPublished,
    markMissionClosed
} = require("../services/missionService");
const { applyMissionSchedule } = require("../services/missionScheduleService");

const publishLocks = new Map();
const loggedHistoricalMissions = new Set();

const defaultPublishDependencies = {
    applyMissionSchedule,
    findPublishedMissionMessage,
    getAllMissions,
    getMission,
    getMissionPublication: (missionId) => {
        const { getMissionPublication } = require("../services/missionPublicationRepository");

        return getMissionPublication(missionId);
    },
    markMissionPublished,
    missionMessageExists,
    publishMission,
    saveMissionPublication: (publication) => {
        const { saveMissionPublication } = require("../services/missionPublicationRepository");

        return saveMissionPublication(publication);
    }
};

// Sprawdza, czy podany termin już minął.
function isDue(dateValue, now = new Date()) {
    if (!dateValue) {
        return false;
    }

    return new Date(dateValue).getTime() <= now.getTime();
}

function isAfter(dateValue, now = new Date()) {
    if (!dateValue) {
        return false;
    }

    return new Date(dateValue).getTime() > now.getTime();
}

function getMissionNumber(mission) {
    return mission.number || String(mission.id).padStart(3, "0");
}

function isMissionActive(scheduledMission, now = new Date()) {
    return !scheduledMission.closed
        && isDue(scheduledMission.publishAt, now)
        && isAfter(scheduledMission.closeAt, now);
}

function isMissionHistorical(scheduledMission, now = new Date()) {
    return scheduledMission.closed || isDue(scheduledMission.closeAt, now);
}

function logHistoricalMissionSkipped(mission) {
    const missionNumber = getMissionNumber(mission);

    if (loggedHistoricalMissions.has(missionNumber)) {
        return;
    }

    loggedHistoricalMissions.add(missionNumber);
    console.log(`[MISSION] Historical mission skipped: ${missionNumber}`);
}

function getActiveScheduledMission(missions, now = new Date(), dependencies = defaultPublishDependencies) {
    const scheduledMissions = missions
        .map((mission) => dependencies.applyMissionSchedule(mission))
        .sort((firstMission, secondMission) => Number(firstMission.id) - Number(secondMission.id));
    let activeMission = null;

    for (const scheduledMission of scheduledMissions) {
        if (isMissionHistorical(scheduledMission, now)) {
            logHistoricalMissionSkipped(scheduledMission);
            continue;
        }

        if (!activeMission && isMissionActive(scheduledMission, now)) {
            activeMission = scheduledMission;
        }
    }

    return activeMission;
}

async function withMissionPublishLock(missionId, callback) {
    if (publishLocks.has(missionId)) {
        return publishLocks.get(missionId);
    }

    const publishPromise = Promise.resolve()
        .then(callback)
        .finally(() => {
            publishLocks.delete(missionId);
        });

    publishLocks.set(missionId, publishPromise);

    return publishPromise;
}

function getStoredMessageId(mission, publication) {
    return mission.messageId || (publication && publication.message_id) || null;
}

function persistKnownPublication(dependencies, mission, messageId) {
    const missionNumber = getMissionNumber(mission);
    let persistedMission = {
        ...mission,
        messageId,
        published: true
    };

    try {
        dependencies.saveMissionPublication({
            missionId: mission.id,
            missionNumber,
            messageId,
            publishAt: mission.publishAt,
            closeAt: mission.closeAt
        });
    } catch (error) {
        console.error(`Nie udało się zapisać publikacji misji #${missionNumber} w SQLite: ${error.message}`);
    }

    if (mission.published && mission.messageId === messageId) {
        return persistedMission;
    }

    try {
        persistedMission = dependencies.markMissionPublished(mission.id, messageId, {
            publishAt: mission.publishAt,
            closeAt: mission.closeAt
        });
    } catch (error) {
        console.error(`Nie udało się zapisać publikacji misji #${missionNumber} w mission.json: ${error.message}`);
    }

    return persistedMission;
}

async function ensureActiveMissionPublished(client, scheduledMission, now = new Date(), dependencies = defaultPublishDependencies) {
    return withMissionPublishLock(scheduledMission.id, async () => {
        const latestMission = dependencies.applyMissionSchedule(dependencies.getMission(scheduledMission.id));

        if (!isMissionActive(latestMission, now)) {
            console.log(`[MISSION] Historical mission skipped: ${getMissionNumber(latestMission)}`);
            return null;
        }

        const storedPublication = dependencies.getMissionPublication(latestMission.id);
        const storedMessageId = getStoredMessageId(latestMission, storedPublication);

        if (storedMessageId) {
            const messageExists = await dependencies.missionMessageExists(client, storedMessageId);

            if (messageExists) {
                const persistedMission = persistKnownPublication(dependencies, latestMission, storedMessageId);

                console.log(`[MISSION] Already published, skipping: ${getMissionNumber(latestMission)}`);
                return persistedMission;
            }

            console.log(`[MISSION] Missing Discord message, republishing: ${getMissionNumber(latestMission)}`);
        }

        const recoveredMessage = await dependencies.findPublishedMissionMessage(client, latestMission);

        if (recoveredMessage) {
            const recoveredMission = persistKnownPublication(dependencies, latestMission, recoveredMessage.id);

            console.log(`[MISSION] Already published, skipping: ${getMissionNumber(latestMission)}`);
            return recoveredMission;
        }

        if (latestMission.published && !storedMessageId) {
            console.log(`[MISSION] Missing Discord message, republishing: ${getMissionNumber(latestMission)}`);
        }

        return dependencies.publishMission(client, latestMission);
    });
}

// Publikuje wyłącznie aktualnie aktywną misję i nigdy nie nadrabia misji historycznych.
async function publishDueMissions(client, now = new Date(), dependencies = defaultPublishDependencies) {
    const activeMission = getActiveScheduledMission(dependencies.getAllMissions(), now, dependencies);

    if (!activeMission) {
        return null;
    }

    console.log(`[MISSION] Active mission found: ${getMissionNumber(activeMission)}`);

    return ensureActiveMissionPublished(client, activeMission, now, dependencies);
}

// Zamyka misje, których wyliczony closeAt już minął, a closed nadal jest false.
async function closeDueMissions(client, now = new Date()) {
    const missions = getAllMissions();

    for (const mission of missions) {
        const scheduledMission = applyMissionSchedule(mission);

        if (scheduledMission.closed || !isDue(scheduledMission.closeAt, now)) {
            continue;
        }

        const closedMission = markMissionClosed(scheduledMission.id);

        try {
            const { markMissionPublicationClosed } = require("../services/missionPublicationRepository");

            markMissionPublicationClosed(scheduledMission.id);
        } catch (error) {
            console.error(`Nie udało się zapisać zamknięcia misji #${closedMission.number} w SQLite: ${error.message}`);
        }

        const { resetStreaksForMissedMission } = require("../services/streakService");
        const resetCount = resetStreaksForMissedMission(scheduledMission.id);

        if (resetCount > 0) {
            console.log(`Zresetowano serie po opuszczonej misji #${closedMission.number}: ${resetCount}`);
        }

        await appendSubmissionEndNotice(client, {
            ...scheduledMission,
            closed: true
        });
        await logMissionClosed(client, closedMission);
    }
}

// Jedno pełne sprawdzenie harmonogramu dla wszystkich misji.
async function checkScheduledMissions(client) {
    const now = new Date();

    await publishDueMissions(client, now);
    await closeDueMissions(client, now);
}

// Podłącza sprawdzanie harmonogramu co minutę.
function startMissionScheduler(client) {
    checkScheduledMissions(client).catch((error) => {
        console.error(`Błąd początkowego sprawdzania misji: ${error.message}`);
    });

    cron.schedule(
        "* * * * *",
        () => {
            checkScheduledMissions(client).catch((error) => {
                console.error(`Błąd harmonogramu misji: ${error.message}`);
            });
        },
        {
            timezone: config.timezone || "Europe/Warsaw"
        }
    );

    console.log(`Harmonogram Poligonu CAD sprawdza misje co minutę (${config.timezone || "Europe/Warsaw"}).`);
}

module.exports = {
    checkScheduledMissions,
    closeDueMissions,
    ensureActiveMissionPublished,
    getActiveScheduledMission,
    publishDueMissions,
    startMissionScheduler,
    _test: {
        isMissionActive,
        isMissionHistorical
    }
};
