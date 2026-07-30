const cron = require("node-cron");

const {
    closeActiveExtremeMission,
    getExtremeMissionCatalog,
    publishOneTimeExtremeTestMission,
    publishNextExtremeMission,
    validateExtremeMissionCatalog
} = require("../services/extremeMissionService");
const { createExtremeMissionRepository } = require("../services/extremeMissionRepository");

const EXTREME_TIMEZONE = "Europe/Warsaw";
const WEDNESDAY_SHORT_NAME = "Wed";
const EXTREME_TEST_PUBLISH_DATE_KEY = "2026-07-30";
const EXTREME_TEST_PUBLISH_MINUTE_OF_DAY = 20 * 60;
const EXTREME_TEST_PUBLISH_STATE_KEY = "EXTREME_TEST_000_2026-07-30_20:00";
let isExtremeSchedulerRunning = false;

function logExtremeScheduler(message, data = null) {
    if (data) {
        console.info(`[EXTREME SCHEDULER] ${message}`, data);
        return;
    }

    console.info(`[EXTREME SCHEDULER] ${message}`);
}

function logExtremeSchedulerError(message, error) {
    console.error(`[EXTREME SCHEDULER] ${message}`);
    console.error(error?.stack || error);
}

function getWarsawDateParts(date = new Date()) {
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: EXTREME_TIMEZONE,
        weekday: "short",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false
    }).formatToParts(date).reduce((result, part) => ({
        ...result,
        [part.type]: part.value
    }), {});
    const hour = Number(parts.hour) === 24 ? 0 : Number(parts.hour);
    const minute = Number(parts.minute);

    return {
        dateKey: `${parts.year}-${parts.month}-${parts.day}`,
        hour,
        minute,
        minuteOfDay: hour * 60 + minute,
        weekday: parts.weekday
    };
}

function shouldCloseExtremeMission(state, now = new Date()) {
    const parts = getWarsawDateParts(now);

    return state.status === "ACTIVE"
        && parts.weekday === WEDNESDAY_SHORT_NAME
        && parts.minuteOfDay >= 15 * 60
        && state.last_publish_date !== parts.dateKey;
}

function shouldPublishExtremeMission(state, now = new Date()) {
    const parts = getWarsawDateParts(now);

    return parts.weekday === WEDNESDAY_SHORT_NAME
        && parts.minuteOfDay >= 16 * 60
        && state.last_publish_date !== parts.dateKey;
}

function shouldPublishOneTimeExtremeTestMission(state, now = new Date()) {
    const parts = getWarsawDateParts(now);

    return parts.dateKey === EXTREME_TEST_PUBLISH_DATE_KEY
        && parts.minuteOfDay >= EXTREME_TEST_PUBLISH_MINUTE_OF_DAY
        && state.last_publish_date !== EXTREME_TEST_PUBLISH_STATE_KEY;
}

async function checkExtremeMissions(client, now = new Date(), dependencies = {}) {
    if (!dependencies.disableLock && isExtremeSchedulerRunning) {
        logExtremeScheduler("Pominięto sprawdzanie, bo poprzednie wywołanie nadal trwa.");
        return {
            closedMission: null,
            publishedMission: null,
            skipped: true
        };
    }

    isExtremeSchedulerRunning = true;

    try {
        const repository = dependencies.repository || createExtremeMissionRepository(dependencies.db);
        const dateParts = getWarsawDateParts(now);
        let state = repository.getState();
        let closedMission = null;
        let publishedMission = null;
        let publishedTestMission = null;
        const shouldPublishTestMission = shouldPublishOneTimeExtremeTestMission(state, now);

        logExtremeScheduler("Sprawdzanie harmonogramu.", {
            dateParts,
            lastPublishDate: state.last_publish_date,
            shouldPublishTestMission,
            stateStatus: state.status
        });

        if (shouldPublishTestMission) {
            logExtremeScheduler("Rozpoczynam jednorazową publikację Misji EXTREME #000.");
            publishedTestMission = await (dependencies.publishOneTimeExtremeTestMission || publishOneTimeExtremeTestMission)(client, {
                ...dependencies,
                now,
                publishDateKey: EXTREME_TEST_PUBLISH_STATE_KEY,
                repository
            });
            state = repository.getState();
        }

        if (shouldCloseExtremeMission(state, now)) {
            closedMission = await (dependencies.closeActiveExtremeMission || closeActiveExtremeMission)(client, {
                ...dependencies,
                now,
                repository
            });
            state = repository.getState();
        }

        if (shouldPublishExtremeMission(state, now)) {
            publishedMission = await (dependencies.publishNextExtremeMission || publishNextExtremeMission)(client, {
                ...dependencies,
                now,
                publishDateKey: dateParts.dateKey,
                repository
            });
        }

        return {
            closedMission,
            publishedMission,
            publishedTestMission
        };
    } finally {
        isExtremeSchedulerRunning = false;
    }
}

function startExtremeMissionScheduler(client, dependencies = {}) {
    logExtremeScheduler("Start schedulera Misji EXTREME.", {
        botId: client.user?.id || null,
        isReady: typeof client.isReady === "function" ? client.isReady() : null,
        timezone: EXTREME_TIMEZONE
    });

    const catalog = (dependencies.getExtremeMissionCatalog || getExtremeMissionCatalog)(dependencies);

    logExtremeScheduler("Katalog grafik Misji EXTREME.", {
        cwd: process.cwd(),
        jpgCount: catalog.missions.length,
        jpgFiles: catalog.missions.map((mission) => mission.fileName),
        rootPath: catalog.rootPath
    });

    validateExtremeMissionCatalog(catalog, dependencies.logger || console);

    checkExtremeMissions(client, new Date(), dependencies).catch((error) => {
        logExtremeSchedulerError("Błąd początkowego sprawdzania Misji EXTREME.", error);
    });

    logExtremeScheduler("Rejestruję jednorazowy cron testowy Misji EXTREME #000.", {
        expression: "0 20 30 7 *",
        publishAt: "2026-07-30 20:00 Europe/Warsaw"
    });
    cron.schedule(
        "0 20 30 7 *",
        () => {
            logExtremeScheduler("Wywołano callback jednorazowego crona testowego #000.");
            checkExtremeMissions(client, new Date(), dependencies).catch((error) => {
                logExtremeSchedulerError("Błąd testowej publikacji Misji EXTREME #000.", error);
            });
        },
        {
            timezone: EXTREME_TIMEZONE
        }
    );

    cron.schedule(
        "0 15 * * 3",
        () => {
            logExtremeScheduler("Wywołano callback crona zamknięcia Misji EXTREME.");
            checkExtremeMissions(client, new Date(), dependencies).catch((error) => {
                logExtremeSchedulerError("Błąd zamykania Misji EXTREME.", error);
            });
        },
        {
            timezone: EXTREME_TIMEZONE
        }
    );

    cron.schedule(
        "0 16 * * 3",
        () => {
            logExtremeScheduler("Wywołano callback crona publikacji regularnej Misji EXTREME.");
            checkExtremeMissions(client, new Date(), dependencies).catch((error) => {
                logExtremeSchedulerError("Błąd publikacji Misji EXTREME.", error);
            });
        },
        {
            timezone: EXTREME_TIMEZONE
        }
    );

    console.log(`Harmonogram Misji EXTREME działa w każdą środę 15:00/16:00 (${EXTREME_TIMEZONE}).`);
}

module.exports = {
    checkExtremeMissions,
    EXTREME_TEST_PUBLISH_DATE_KEY,
    EXTREME_TEST_PUBLISH_STATE_KEY,
    getWarsawDateParts,
    shouldPublishOneTimeExtremeTestMission,
    shouldCloseExtremeMission,
    shouldPublishExtremeMission,
    startExtremeMissionScheduler
};
