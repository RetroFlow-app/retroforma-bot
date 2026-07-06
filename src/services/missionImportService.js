const fs = require("fs");
const path = require("path");

const {
    missionsPath,
    rawMissionsPath
} = require("../config/paths");
const { formatMissionNumber } = require("../utils/missionNumber");

const MISSION_DESCRIPTION = "Na podstawie schematu odtwórz model 3D w dowolnym programie CAD.";
const ACCEPTED_IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp"];

const difficultyConfigs = [
    {
        key: "easy",
        folderNames: ["latwy", "łatwy"],
        label: "Łatwy",
        summaryKey: "easy",
        points: 20,
        xp: 100
    },
    {
        key: "medium",
        folderNames: ["sredni", "średni"],
        label: "Średni",
        summaryKey: "medium",
        points: 30,
        xp: 150
    },
    {
        key: "hard",
        folderNames: ["trudny"],
        label: "Trudny",
        summaryKey: "hard",
        points: 50,
        xp: 250
    }
];

function createEmptySummary() {
    return {
        added: {
            easy: 0,
            medium: 0,
            hard: 0
        },
        skipped: [],
        foundMissionNumbers: new Set(),
        maxFoundMissionId: 0,
        missingMissionNumbers: [],
        importedTotal: 0
    };
}

function getExistingRawDifficultyPath(folderNames) {
    return folderNames
        .map((folderName) => path.join(rawMissionsPath, folderName))
        .find((folderPath) => fs.existsSync(folderPath) && fs.statSync(folderPath).isDirectory()) || null;
}

function getImageExtension(fileName) {
    return path.extname(fileName).toLowerCase();
}

function isSupportedImage(fileName) {
    return ACCEPTED_IMAGE_EXTENSIONS.includes(getImageExtension(fileName));
}

// Numer misji pochodzi wyłącznie z nazwy pliku, np. 004.jpg -> 4.
function getMissionIdFromFileName(fileName) {
    const parsedName = path.parse(fileName).name;

    if (!/^\d+$/.test(parsedName)) {
        return null;
    }

    return Number(parsedName);
}

function createMissionData(missionId, missionNumber, difficultyConfig) {
    return {
        id: missionId,
        title: `Misja CAD #${missionNumber}`,
        difficulty: difficultyConfig.label,
        points: difficultyConfig.points,
        xp: difficultyConfig.xp,
        description: MISSION_DESCRIPTION,
        published: false,
        closed: false,
        messageId: null
    };
}

function writeMissionJson(missionFolderPath, missionData) {
    fs.writeFileSync(
        path.join(missionFolderPath, "mission.json"),
        `${JSON.stringify(missionData, null, 4)}\n`,
        "utf8"
    );
}

function copyMissionImage(sourceImagePath, missionFolderPath) {
    const imageExtension = getImageExtension(sourceImagePath);
    const targetImagePath = path.join(missionFolderPath, `image${imageExtension}`);

    fs.copyFileSync(sourceImagePath, targetImagePath);

    return targetImagePath;
}

function registerFoundMissionNumber(summary, missionId) {
    const missionNumber = formatMissionNumber(missionId);

    summary.foundMissionNumbers.add(missionNumber);
    summary.maxFoundMissionId = Math.max(summary.maxFoundMissionId, missionId);
}

function skipMission(summary, missionNumber, reason, filePath = null) {
    summary.skipped.push({
        missionNumber,
        filePath,
        reason
    });
}

function importMissionFile(summary, difficultyConfig, sourceImagePath, seenMissionNumbers) {
    const fileName = path.basename(sourceImagePath);
    const missionId = getMissionIdFromFileName(fileName);

    if (!missionId) {
        skipMission(summary, fileName, "nazwa pliku nie jest numerem misji", sourceImagePath);
        return;
    }

    registerFoundMissionNumber(summary, missionId);

    if (!isSupportedImage(fileName)) {
        skipMission(summary, formatMissionNumber(missionId), "nieobsługiwane rozszerzenie pliku", sourceImagePath);
        return;
    }

    const missionNumber = formatMissionNumber(missionId);
    const missionFolderPath = path.join(missionsPath, missionNumber);

    if (seenMissionNumbers.has(missionNumber)) {
        skipMission(summary, missionNumber, "duplikat numeru w raw-missions", sourceImagePath);
        return;
    }

    seenMissionNumbers.add(missionNumber);

    if (fs.existsSync(missionFolderPath)) {
        skipMission(summary, missionNumber, "folder misji już istnieje", sourceImagePath);
        return;
    }

    fs.mkdirSync(missionFolderPath, {
        recursive: true
    });

    copyMissionImage(sourceImagePath, missionFolderPath);
    writeMissionJson(
        missionFolderPath,
        createMissionData(missionId, missionNumber, difficultyConfig)
    );

    summary.added[difficultyConfig.summaryKey] += 1;
    summary.importedTotal += 1;
}

function getRawMissionFiles(rawDifficultyPath) {
    return fs.readdirSync(rawDifficultyPath, {
        withFileTypes: true
    })
        .filter((item) => item.isFile())
        .map((item) => path.join(rawDifficultyPath, item.name))
        .sort((firstPath, secondPath) => {
            const firstId = getMissionIdFromFileName(path.basename(firstPath)) || 0;
            const secondId = getMissionIdFromFileName(path.basename(secondPath)) || 0;

            return firstId - secondId;
        });
}

function importDifficulty(summary, difficultyConfig, seenMissionNumbers) {
    const rawDifficultyPath = getExistingRawDifficultyPath(difficultyConfig.folderNames);

    if (!rawDifficultyPath) {
        return;
    }

    for (const sourceImagePath of getRawMissionFiles(rawDifficultyPath)) {
        importMissionFile(summary, difficultyConfig, sourceImagePath, seenMissionNumbers);
    }
}

function getMissingMissionNumbers(summary) {
    const missingMissionNumbers = [];

    for (let missionId = 1; missionId <= summary.maxFoundMissionId; missionId += 1) {
        const missionNumber = formatMissionNumber(missionId);

        if (!summary.foundMissionNumbers.has(missionNumber)) {
            missingMissionNumbers.push(missionNumber);
        }
    }

    return missingMissionNumbers;
}

function importRawMissions() {
    const summary = createEmptySummary();
    const seenMissionNumbers = new Set();

    fs.mkdirSync(missionsPath, {
        recursive: true
    });

    for (const difficultyConfig of difficultyConfigs) {
        importDifficulty(summary, difficultyConfig, seenMissionNumbers);
    }

    summary.missingMissionNumbers = getMissingMissionNumbers(summary);

    return summary;
}

function formatImportSummary(summary) {
    const skippedLines = summary.skipped.length > 0
        ? summary.skipped.map((item) => {
            const filePath = item.filePath || item.missionNumber;

            return `- ${filePath} — ${item.reason}`;
        })
        : ["- brak"];
    const missingLines = summary.missingMissionNumbers.length > 0
        ? summary.missingMissionNumbers.map((missionNumber) => `- ${missionNumber}`)
        : ["- brak"];

    return [
        "Import misji zakończony.",
        "",
        `Dodano łatwych: ${summary.added.easy}`,
        `Dodano średnich: ${summary.added.medium}`,
        `Dodano trudnych: ${summary.added.hard}`,
        `Pominięto: ${summary.skipped.length}`,
        `Łącznie zaimportowano: ${summary.importedTotal}`,
        "",
        "Pominięte pliki:",
        ...skippedLines,
        "",
        `Brakujące numery misji od 001 do ${summary.maxFoundMissionId > 0 ? formatMissionNumber(summary.maxFoundMissionId) : "000"}:`,
        ...missingLines
    ].join("\n");
}

module.exports = {
    formatImportSummary,
    importRawMissions
};
