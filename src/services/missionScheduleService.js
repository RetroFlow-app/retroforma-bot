const config = require("../config/appConfig");

const MINUTE_IN_MS = 60 * 1000;

// Pobiera parametry kolejki misji z config.json.
function getMissionScheduleConfig() {
    return {
        poligonStartAt: config.poligonStartAt,
        missionIntervalDays: Number(config.missionIntervalDays) || 2,
        missionPublishHour: Number(config.missionPublishHour) || 16,
        missionCloseHour: Number(config.missionCloseHour) || 15,
        timezone: config.timezone || "Europe/Warsaw"
    };
}

function getRequiredStartDate() {
    const { poligonStartAt } = getMissionScheduleConfig();

    if (!poligonStartAt) {
        throw new Error("Brak poligonStartAt w config.json.");
    }

    const startDate = new Date(poligonStartAt);

    if (Number.isNaN(startDate.getTime())) {
        throw new Error("Nieprawidłowa data poligonStartAt w config.json.");
    }

    return startDate;
}

function getZonedDateParts(date, timezone) {
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false
    }).formatToParts(date);

    return {
        year: Number(getDatePart(parts, "year")),
        month: Number(getDatePart(parts, "month")),
        day: Number(getDatePart(parts, "day")),
        hour: Number(getDatePart(parts, "hour")),
        minute: Number(getDatePart(parts, "minute")),
        second: Number(getDatePart(parts, "second"))
    };
}

function getTimezoneOffset(date, timezone) {
    const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: timezone,
        timeZoneName: "longOffset",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false
    }).formatToParts(date);
    const offsetPart = parts.find((part) => part.type === "timeZoneName");
    const offsetValue = offsetPart ? offsetPart.value.replace("GMT", "") : "+00:00";
    const offsetMatch = offsetValue.match(/^([+-])(\d{1,2})(?::(\d{2}))?$/);

    if (offsetValue === "" || !offsetMatch) {
        return "+00:00";
    }

    return `${offsetMatch[1]}${offsetMatch[2].padStart(2, "0")}:${offsetMatch[3] || "00"}`;
}

function getTimezoneOffsetMinutes(date, timezone) {
    const offset = getTimezoneOffset(date, timezone);
    const match = offset.match(/^([+-])(\d{2}):(\d{2})$/);

    if (!match) {
        return 0;
    }

    const sign = match[1] === "-" ? -1 : 1;
    const hours = Number(match[2]);
    const minutes = Number(match[3]);

    return sign * (hours * 60 + minutes);
}

function getDatePart(parts, type) {
    return parts.find((part) => part.type === type).value;
}

// Zapisuje datę jako lokalny ISO string dla skonfigurowanej strefy, np. 2026-07-07T16:00:00+02:00.
function formatDateInTimezone(date, timezone) {
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false
    }).formatToParts(date);

    return [
        `${getDatePart(parts, "year")}-${getDatePart(parts, "month")}-${getDatePart(parts, "day")}`,
        "T",
        `${getDatePart(parts, "hour")}:${getDatePart(parts, "minute")}:${getDatePart(parts, "second")}`,
        getTimezoneOffset(date, timezone)
    ].join("");
}

// Tworzy faktyczny moment w czasie dla lokalnej daty w skonfigurowanej strefie.
function createDateInTimezone(dateParts, timezone) {
    const localTimestamp = Date.UTC(
        dateParts.year,
        dateParts.month - 1,
        dateParts.day,
        dateParts.hour,
        dateParts.minute,
        dateParts.second
    );
    const firstOffset = getTimezoneOffsetMinutes(new Date(localTimestamp), timezone);
    let resultDate = new Date(localTimestamp - firstOffset * MINUTE_IN_MS);
    const verifiedOffset = getTimezoneOffsetMinutes(resultDate, timezone);

    if (verifiedOffset !== firstOffset) {
        resultDate = new Date(localTimestamp - verifiedOffset * MINUTE_IN_MS);
    }

    return resultDate;
}

// Wylicza datę publikacji i zamknięcia misji na podstawie jej numeru.
function getMissionSchedule(missionId) {
    const missionNumber = Number(missionId);

    if (!Number.isInteger(missionNumber) || missionNumber <= 0) {
        throw new Error("Numer misji musi być dodatnią liczbą całkowitą.");
    }

    const scheduleConfig = getMissionScheduleConfig();
    const startParts = getZonedDateParts(getRequiredStartDate(), scheduleConfig.timezone);
    const publishDate = createDateInTimezone({
        ...startParts,
        day: startParts.day + (missionNumber - 1) * scheduleConfig.missionIntervalDays,
        hour: scheduleConfig.missionPublishHour
    }, scheduleConfig.timezone);
    const closeDate = createDateInTimezone({
        ...startParts,
        day: startParts.day + missionNumber * scheduleConfig.missionIntervalDays,
        hour: scheduleConfig.missionCloseHour
    }, scheduleConfig.timezone);

    return {
        publishAt: formatDateInTimezone(publishDate, scheduleConfig.timezone),
        closeAt: formatDateInTimezone(closeDate, scheduleConfig.timezone)
    };
}

// Dokleja wyliczone terminy do obiektu misji, ignorując ręcznie wpisane publishAt/closeAt.
function applyMissionSchedule(mission) {
    return {
        ...mission,
        ...getMissionSchedule(mission.id)
    };
}

module.exports = {
    applyMissionSchedule,
    getMissionSchedule
};
