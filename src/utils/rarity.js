const RARITY = {
    BASIC: "Podstawowa",
    EPIC: "Epicka",
    LEGENDARY: "Legendarna"
};

const RARITY_ALIASES = new Map([
    ["podstawowa", RARITY.BASIC],
    ["basic", RARITY.BASIC],
    ["common", RARITY.BASIC],
    ["niepospolita", RARITY.BASIC],
    ["uncommon", RARITY.BASIC],
    ["rzadka", RARITY.EPIC],
    ["rare", RARITY.EPIC],
    ["epicka", RARITY.EPIC],
    ["epic", RARITY.EPIC],
    ["legendarna", RARITY.LEGENDARY],
    ["legendary", RARITY.LEGENDARY]
]);

function getRarityKey(value) {
    return String(value || "")
        .trim()
        .toLowerCase();
}

// Sprowadza stare i angielskie nazwy do trzech wspieranych poziomow.
function normalizeRarity(value) {
    return RARITY_ALIASES.get(getRarityKey(value)) || RARITY.BASIC;
}

function isSupportedRarity(value) {
    return Object.values(RARITY).includes(value);
}

module.exports = {
    RARITY,
    RARITY_ALIASES,
    isSupportedRarity,
    normalizeRarity
};
