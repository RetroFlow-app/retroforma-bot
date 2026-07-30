const cron = require("node-cron");

const {
    closeActiveExtremeMission,
    getExtremeMissionCatalog,
    publishNextExtremeMission,
    validateExtremeMissionCatalog
} = require("../services/extremeMissionService");
const { createExtremeMissionRepository } = require("../services/extremeMissionRepository");

const EXTREME_TIMEZONE = "Europe/Warsaw";
const WEDNESDAY_SHORT_NAME = "Wed";
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

        logExtremeScheduler("Sprawdzanie harmonogramu.", {
            dateParts,
            lastPublishDate: state.last_publish_date,
            stateStatus: state.status
        });

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
            publishedMission
        };
    } finally {
        isExtremeSchedulerRunning = false;
    }
}

function startExtremeMissionScheduler(client, dependencies = {}) {
    const repository = dependencies.repository || createExtremeMissionRepository(dependencies.db);
    const schedulerDependencies = {
        ...dependencies,
        repository
    };

    logExtremeScheduler("Start schedulera Misji EXTREME.", {
        botId: client.user?.id || null,
        isReady: typeof client.isReady === "function" ? client.isReady() : null,
        timezone: EXTREME_TIMEZONE
    });

    const catalog = (schedulerDependencies.getExtremeMissionCatalog || getExtremeMissionCatalog)(schedulerDependencies);

    logExtremeScheduler("Katalog grafik Misji EXTREME.", {
        cwd: process.cwd(),
        jpgCount: catalog.jpgFiles?.length || catalog.missions.length,
        jpgFiles: catalog.jpgFiles || catalog.missions.map((mission) => mission.fileName),
        rootPath: catalog.rootPath
    });

    validateExtremeMissionCatalog(catalog, schedulerDependencies.logger || console);

    checkExtremeMissions(client, new Date(), schedulerDependencies).catch((error) => {
        logExtremeSchedulerError("Błąd początkowego sprawdzania Misji EXTREME.", error);
    });

    cron.schedule(
        "0 15 * * 3",
        () => {
            logExtremeScheduler("Wywołano callback crona zamknięcia Misji EXTREME.");
            checkExtremeMissions(client, new Date(), schedulerDependencies).catch((error) => {
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
            checkExtremeMissions(client, new Date(), schedulerDependencies).catch((error) => {
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
    getWarsawDateParts,
    shouldCloseExtremeMission,
    shouldPublishExtremeMission,
    startExtremeMissionScheduler
};
