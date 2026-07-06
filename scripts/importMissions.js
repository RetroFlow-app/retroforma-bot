const {
    formatImportSummary,
    importRawMissions
} = require("../src/services/missionImportService");

// Ręczny importer misji z raw-missions do missions.
function main() {
    const summary = importRawMissions();

    console.log(formatImportSummary(summary));
}

main();
