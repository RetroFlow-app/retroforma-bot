const cron = require("node-cron");

const config = require("../config/appConfig");
const {
    appendSubmissionEndNotice,
    logMissionClosed,
    publishMission
} = require("../services/missionDiscordService");
const {
    getAllMissions,
    markMissionClosed
} = require("../services/missionService");
const { applyMissionSchedule } = require("../services/missionScheduleService");
const { resetStreaksForMissedMission } = require("../services/streakService");

// Sprawdza, czy podany termin już minął.
function isDue(dateValue, now = new Date()) {
    if (!dateValue) {
        return false;
    }

    return new Date(dateValue).getTime() <= now.getTime();
}

// Publikuje misje, których wyliczony publishAt już minął, a published nadal jest false.
async function publishDueMissions(client, now = new Date()) {
    const missions = getAllMissions();

    for (const mission of missions) {
        const scheduledMission = applyMissionSchedule(mission);

        if (scheduledMission.published || !isDue(scheduledMission.publishAt, now)) {
            continue;
        }

        await publishMission(client, scheduledMission);
    }
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
    publishDueMissions,
    startMissionScheduler
};
