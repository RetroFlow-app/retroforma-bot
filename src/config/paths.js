const path = require("path");

// Główne ścieżki projektu trzymamy w jednym miejscu.
const projectRootPath = path.join(__dirname, "..", "..");
const assetsPath = path.join(projectRootPath, "assets");
const configPath = path.join(projectRootPath, "config.json");
const databasePath = path.join(projectRootPath, "database.db");
const missionsPath = path.join(projectRootPath, "missions");
const rawMissionsPath = path.join(projectRootPath, "raw-missions");
const systemStatePath = path.join(__dirname, "..", "database", "system.json");

module.exports = {
    assetsPath,
    configPath,
    databasePath,
    missionsPath,
    projectRootPath,
    rawMissionsPath,
    systemStatePath
};
