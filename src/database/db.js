const Database = require("better-sqlite3");

const { databasePath } = require("../config/paths");
const { initializeDatabase } = require("./schema");

const db = new Database(databasePath);

// Inicjalizacja jest niedestrukcyjna. Jeśli migracja się nie powiedzie,
// logujemy błąd i przerywamy start bota zamiast tworzyć lub resetować dane.
try {
    initializeDatabase(db);
} catch (error) {
    console.error(`Błąd inicjalizacji bazy SQLite: ${error.message}`);
    throw error;
}

module.exports = db;
