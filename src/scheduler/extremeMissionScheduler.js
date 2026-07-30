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
    const catalog = (dependencies.getExtremeMissionCatalog || getExtremeMissionCatalog)(dependencies);

    validateExtremeMissionCatalog(catalog, dependencies.logger || console);

    checkExtremeMissions(client, new Date(), dependencies).catch((error) => {
        console.error(`Błąd początkowego sprawdzania Misji EXTREME: ${error.message}`);
    });

    cron.schedule(
        "0 15 * * 3",
        () => {
            checkExtremeMissions(client, new Date(), dependencies).catch((error) => {
                console.error(`Błąd zamykania Misji EXTREME: ${error.message}`);
            });
        },
        {
            timezone: EXTREME_TIMEZONE
        }
    );

    cron.schedule(
        "0 16 * * 3",
        () => {
            checkExtremeMissions(client, new Date(), dependencies).catch((error) => {
                console.error(`Błąd publikacji Misji EXTREME: ${error.message}`);
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
