const fs = require("fs");
const path = require("path");

const { missionsPath } = require("../config/paths");
const { formatMissionNumber } = require("../utils/missionNumber");

const acceptedImageNames = [
    "image.png",
    "image.jpg",
    "image.jpeg",
    "image.webp"
];

// Szuka pierwszego dostępnego obrazka misji w obsługiwanych formatach.
function findMissionImagePath(missionFolderPath) {
    return acceptedImageNames
        .map((imageName) => path.join(missionFolderPath, imageName))
        .find((imagePath) => fs.existsSync(imagePath)) || null;
}

// Odczytuje plik mission.json.
function readMissionJson(missionJsonPath) {
    const rawMission = fs.readFileSync(missionJsonPath, "utf8");

    return JSON.parse(rawMission);
}

// Zapisuje zmienione dane misji z powrotem do mission.json.
function saveMissionJson(missionJsonPath, missionData) {
    fs.writeFileSync(
        missionJsonPath,
        `${JSON.stringify(missionData, null, 4)}\n`,
        "utf8"
    );
}

// Zwraca wszystkie foldery misji w kolejności rosnącej.
function getMissionFolders() {
    if (!fs.existsSync(missionsPath)) {
        return [];
    }

    return fs.readdirSync(missionsPath, {
        withFileTypes: true
    })
        .filter((item) => item.isDirectory())
        .map((item) => item.name)
        .sort();
}

// Buduje pełny obiekt misji na podstawie folderu i pliku mission.json.
function getMissionFromFolder(folderName) {
    const missionFolderPath = path.join(missionsPath, folderName);
    const missionJsonPath = path.join(missionFolderPath, "mission.json");

    if (!fs.existsSync(missionJsonPath)) {
        throw new Error(`Nie znaleziono pliku mission.json dla misji ${folderName}.`);
    }

    const missionData = readMissionJson(missionJsonPath);
    const missionId = missionData.id || Number(folderName);
    const missionNumber = formatMissionNumber(missionId);

    return {
        ...missionData,
        id: missionId,
        number: missionNumber,
        published: missionData.published === true,
        closed: missionData.closed === true,
        messageId: missionData.messageId || null,
        folderPath: missionFolderPath,
        missionJsonPath,
        imagePath: findMissionImagePath(missionFolderPath)
    };
}

// Pobiera konkretną misję po jej id.
function getMission(id) {
    return getMissionFromFolder(formatMissionNumber(id));
}

// Pobiera wszystkie misje z folderu missions/.
function getAllMissions() {
    return getMissionFolders()
        .filter((folderName) => fs.existsSync(path.join(missionsPath, folderName, "mission.json")))
        .map((folderName) => getMissionFromFolder(folderName));
}

// Aktualna misja do zgłoszeń to pierwsza opublikowana i jeszcze niezamknięta misja.
function findOpenMission() {
    return getAllMissions().find((mission) => mission.published && !mission.closed) || null;
}

// Zapisuje częściową zmianę w pliku mission.json wybranej misji.
function updateMission(id, changes) {
    const mission = getMission(id);
    const missionData = readMissionJson(mission.missionJsonPath);

    saveMissionJson(mission.missionJsonPath, {
        ...missionData,
        ...changes
    });

    return getMission(id);
}

// Zapisuje w mission.json informację, że misja została opublikowana.
function markMissionPublished(id, messageId, schedule = {}) {
    const changes = {
        published: true,
        messageId
    };

    if (schedule.publishAt) {
        changes.publishAt = schedule.publishAt;
    }

    if (schedule.closeAt) {
        changes.closeAt = schedule.closeAt;
    }

    return updateMission(id, changes);
}

// Oznacza misję jako zamkniętą w jej pliku mission.json.
function markMissionClosed(id) {
    return updateMission(id, {
        closed: true
    });
}

module.exports = {
    findOpenMission,
    getAllMissions,
    getMission,
    markMissionClosed,
    markMissionPublished
};
