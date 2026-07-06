const rankThresholds = [
    {
        level: 45,
        name: "Mistrz Poligonu"
    },
    {
        level: 30,
        name: "Starszy Inżynier"
    },
    {
        level: 20,
        name: "Inżynier"
    },
    {
        level: 15,
        name: "Projektant"
    },
    {
        level: 10,
        name: "Konstruktor"
    },
    {
        level: 6,
        name: "Kreślarz"
    },
    {
        level: 3,
        name: "Kadet"
    },
    {
        level: 1,
        name: "Rekrut"
    }
];

// Zwraca stopień Poligonu na podstawie poziomu użytkownika.
function getRank(level) {
    const safeLevel = Math.max(1, Number(level) || 1);
    const rank = rankThresholds.find((threshold) => safeLevel >= threshold.level);

    return rank.name;
}

module.exports = {
    getRank
};
