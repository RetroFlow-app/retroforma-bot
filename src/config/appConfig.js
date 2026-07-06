const fs = require("fs");
const { configPath } = require("./paths");

// Wczytujemy główny plik konfiguracyjny projektu z katalogu głównego.
function loadConfig() {
    const rawConfig = fs.readFileSync(configPath, "utf8");

    return JSON.parse(rawConfig);
}

module.exports = loadConfig();
