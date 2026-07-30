const fs = require("node:fs");
const path = require("node:path");

const {
    projectRootPath,
    rawMissionsPath
} = require("../config/paths");
const { createExtremeMissionRepository } = require("./extremeMissionRepository");

const EXTREME_MISSION_CHANNEL_ID = "1531714202241073243";
const EXTREME_SUBMIT_CHANNEL_ID = "1531714732296503488";
const EXTREME_MISSION_ID_OFFSET = 900000;
const EXTREME_REWARD_PP = 20;
const EXTREME_REWARD_XP = 100;
const EXTREME_STATUS = {
    ACTIVE: "ACTIVE",
    CLOSED: "CLOSED",
    IDLE: "IDLE"
};

function getDefaultPublishService() {
    return require("./extremeMissionDiscordService").publishExtremeMission;
}

function getDefaultCloseService() {
    return require("./extremeMissionDiscordService").closeExtremeMission;
}

function normalizePositiveInteger(value, label) {
    const parsedValue = Number(value);

    if (!Number.isSafeInteger(parsedValue) || parsedValue < 1) {
        throw new Error(`Nieprawidłowa wartość ${label}: ${value}`);
    }

    return parsedValue;
}

function normalizeExtremeNumber(number) {
    return normalizePositiveInteger(number, "numeru Misji EXTREME");
}

function formatExtremeMissionNumber(number) {
    return String(normalizeExtremeNumber(number)).padStart(2, "0");
}

function getExtremeReviewMissionId(sequence) {
    return EXTREME_MISSION_ID_OFFSET + normalizePositiveInteger(sequence, "sekwencji Misji EXTREME");
}

function getExtremeSequenceFromReviewMissionId(missionId) {
    const parsedMissionId = Number(missionId);

    if (!Number.isSafeInteger(parsedMissionId) || parsedMissionId <= EXTREME_MISSION_ID_OFFSET) {
        return null;
    }

    return parsedMissionId - EXTREME_MISSION_ID_OFFSET;
}

function isExtremeMissionId(missionId) {
    return getExtremeSequenceFromReviewMissionId(missionId) !== null;
}

function getExtremeMissionAssetRoots() {
    return [
        path.join(rawMissionsPath, "extreme"),
        path.resolve(projectRootPath, "..", "raw-missions", "extreme")
    ];
}

function getMissionNumberFromJpgFile(fileName) {
    const match = /^(\d+)\.jpg$/i.exec(fileName);

    if (!match) {
        return null;
    }

    const missionNumber = Number(match[1]);

    return Number.isSafeInteger(missionNumber) && missionNumber > 0 ? missionNumber : null;
}

function readExtremeMissionCatalogFromRoot(rootPath, fileSystem = fs) {
    try {
        if (!rootPath || !fileSystem.existsSync(rootPath)) {
            return {
                exists: false,
                missions: [],
                rootPath
            };
        }

        const stats = fileSystem.statSync(rootPath);

        if (!stats.isDirectory()) {
            return {
                exists: false,
                missions: [],
                rootPath
            };
        }

        const missions = fileSystem.readdirSync(rootPath, {
            withFileTypes: true
        })
            .filter((entry) => entry.isFile())
            .map((entry) => {
                const missionNumber = getMissionNumberFromJpgFile(entry.name);

                if (!missionNumber) {
                    return null;
                }

                return {
                    fileName: entry.name,
                    imagePath: path.join(rootPath, entry.name),
                    number: missionNumber
                };
            })
            .filter(Boolean)
            .sort((firstMission, secondMission) => firstMission.number - secondMission.number);

        return {
            exists: true,
            missions,
            rootPath
        };
    } catch (error) {
        return {
            error,
            exists: false,
            missions: [],
            rootPath
        };
    }
}

function getExtremeMissionCatalog(options = {}) {
    if (options.missionCatalog) {
        return options.missionCatalog;
    }

    const fileSystem = options.fs || fs;
    const roots = options.assetRoots || getExtremeMissionAssetRoots();
    let firstExistingCatalog = null;
    let firstCatalog = null;

    for (const rootPath of roots) {
        const catalog = readExtremeMissionCatalogFromRoot(rootPath, fileSystem);

        if (!firstCatalog) {
            firstCatalog = catalog;
        }

        if (catalog.exists && !firstExistingCatalog) {
            firstExistingCatalog = catalog;
        }

        if (catalog.missions.length > 0) {
            return catalog;
        }
    }

    return firstExistingCatalog || firstCatalog || {
        exists: false,
        missions: [],
        rootPath: null
    };
}

function validateExtremeMissionCatalog(catalog, logger = console) {
    if (catalog.error) {
        logger.error(`[EXTREME] Nie można odczytać folderu grafik: ${catalog.rootPath}. ${catalog.error.message}`);
        return false;
    }

    if (!catalog.exists) {
        logger.error(`[EXTREME] Folder z grafikami Misji EXTREME nie istnieje: ${catalog.rootPath}`);
        return false;
    }

    if (catalog.missions.length === 0) {
        logger.error(`[EXTREME] Folder Misji EXTREME nie zawiera żadnego pliku JPG: ${catalog.rootPath}`);
        return false;
    }

    return true;
}

function getExtremeMissionNumberForSequence(sequence, options = {}) {
    const safeSequence = normalizePositiveInteger(sequence, "sekwencji Misji EXTREME");
    const catalog = getExtremeMissionCatalog(options);

    if (catalog.missions.length === 0) {
        return safeSequence;
    }

    return catalog.missions[(safeSequence - 1) % catalog.missions.length].number;
}

function getNextExtremeMissionNumber(currentNumber, catalog) {
    if (!catalog || catalog.missions.length === 0) {
        return null;
    }

    const parsedCurrentNumber = Number(currentNumber);
    const currentIndex = catalog.missions.findIndex((mission) => mission.number === parsedCurrentNumber);

    if (currentIndex === -1) {
        return catalog.missions[0].number;
    }

    return catalog.missions[(currentIndex + 1) % catalog.missions.length].number;
}

function getExtremeMissionImagePath(number, options = {}) {
    const normalizedNumber = normalizeExtremeNumber(number);
    const catalog = getExtremeMissionCatalog(options);
    const mission = catalog.missions.find((catalogMission) => catalogMission.number === normalizedNumber);

    return mission?.imagePath || null;
}

function createExtremeMissionFromSequence(sequence, options = {}) {
    const safeSequence = normalizePositiveInteger(sequence, "sekwencji Misji EXTREME");
    const catalog = getExtremeMissionCatalog(options);
    const extremeNumber = options.extremeNumber
        ? normalizeExtremeNumber(options.extremeNumber)
        : getExtremeMissionNumberForSequence(safeSequence, {
            ...options,
            missionCatalog: catalog
        });
    const displayNumber = formatExtremeMissionNumber(extremeNumber);
    const imagePath = getExtremeMissionImagePath(extremeNumber, {
        ...options,
        missionCatalog: catalog
    });

    if (!imagePath && options.requireImage !== false) {
        throw new Error(`Nie znaleziono grafiki Misji EXTREME #${displayNumber}.`);
    }

    return {
        id: getExtremeReviewMissionId(safeSequence),
        type: "EXTREME",
        sequence: safeSequence,
        extremeNumber,
        displayNumber,
        number: `EXTREME ${displayNumber}`,
        title: `Misja EXTREME #${displayNumber}`,
        description: "Przed Tobą cotygodniowe wyzwanie CAD.",
        points: EXTREME_REWARD_PP,
        xp: EXTREME_REWARD_XP,
        imagePath,
        missionChannelId: EXTREME_MISSION_CHANNEL_ID,
        submitChannelId: EXTREME_SUBMIT_CHANNEL_ID,
        affectsStreak: false
    };
}

function getExtremeMissionByReviewId(missionId, options = {}) {
    const sequence = getExtremeSequenceFromReviewMissionId(missionId);

    if (!sequence) {
        return null;
    }

    return createExtremeMissionFromSequence(sequence, {
        ...options,
        requireImage: false
    });
}

function getActiveExtremeMission(options = {}) {
    const repository = options.repository || createExtremeMissionRepository(options.db);
    const state = repository.getState();

    if (state.status !== EXTREME_STATUS.ACTIVE || Number(state.current_sequence) < 1) {
        return null;
    }

    return createExtremeMissionFromSequence(Number(state.current_sequence), {
        ...options,
        extremeNumber: Number(state.current_number) || undefined,
        requireImage: false
    });
}

async function publishNextExtremeMission(client, options = {}) {
    const repository = options.repository || createExtremeMissionRepository(options.db);
    const publishExtremeMission = options.publishExtremeMission || getDefaultPublishService();
    const logger = options.logger || console;
    const now = options.now || new Date();
    const state = repository.getState();
    const catalog = getExtremeMissionCatalog(options);

    if (!validateExtremeMissionCatalog(catalog, logger)) {
        return null;
    }

    const nextSequence = Number(state.current_sequence || 0) + 1;
    const nextExtremeNumber = getNextExtremeMissionNumber(Number(state.current_number || 0), catalog);
    const mission = (options.createExtremeMissionFromSequence || createExtremeMissionFromSequence)(nextSequence, {
        ...options,
        extremeNumber: nextExtremeNumber,
        missionCatalog: catalog
    });
    const message = await publishExtremeMission(client, mission);
    const publishedAt = now.toISOString();

    repository.saveState({
        current_sequence: nextSequence,
        current_number: mission.extremeNumber,
        status: EXTREME_STATUS.ACTIVE,
        message_id: message.id,
        published_at: publishedAt,
        closed_at: null,
        last_publish_date: options.publishDateKey || null,
        updated_at: publishedAt
    });

    return {
        message,
        mission
    };
}

async function closeActiveExtremeMission(client, options = {}) {
    const repository = options.repository || createExtremeMissionRepository(options.db);
    const closeExtremeMission = options.closeExtremeMission || getDefaultCloseService();
    const now = options.now || new Date();
    const state = repository.getState();

    if (state.status !== EXTREME_STATUS.ACTIVE || Number(state.current_sequence) < 1) {
        return null;
    }

    const mission = createExtremeMissionFromSequence(Number(state.current_sequence), {
        ...options,
        extremeNumber: Number(state.current_number) || undefined,
        requireImage: false
    });

    await closeExtremeMission(client, mission, state);

    repository.saveState({
        status: EXTREME_STATUS.CLOSED,
        closed_at: now.toISOString(),
        updated_at: now.toISOString()
    });

    return mission;
}

module.exports = {
    EXTREME_MISSION_CHANNEL_ID,
    EXTREME_MISSION_ID_OFFSET,
    EXTREME_REWARD_PP,
    EXTREME_REWARD_XP,
    EXTREME_STATUS,
    EXTREME_SUBMIT_CHANNEL_ID,
    closeActiveExtremeMission,
    createExtremeMissionFromSequence,
    formatExtremeMissionNumber,
    getActiveExtremeMission,
    getExtremeMissionAssetRoots,
    getExtremeMissionByReviewId,
    getExtremeMissionCatalog,
    getExtremeMissionImagePath,
    getExtremeMissionNumberForSequence,
    getExtremeReviewMissionId,
    getExtremeSequenceFromReviewMissionId,
    getNextExtremeMissionNumber,
    isExtremeMissionId,
    publishNextExtremeMission,
    validateExtremeMissionCatalog
};
