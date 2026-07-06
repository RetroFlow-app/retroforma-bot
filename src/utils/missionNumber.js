// Zamienia id misji na format używany w folderach i logach, np. 1 -> 001.
function formatMissionNumber(id) {
    const missionId = Number(id);

    if (!Number.isInteger(missionId) || missionId <= 0) {
        throw new Error("Id misji musi być dodatnią liczbą całkowitą.");
    }

    return String(missionId).padStart(3, "0");
}

module.exports = {
    formatMissionNumber
};
