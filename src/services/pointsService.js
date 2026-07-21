const XP_PER_LEVEL = 250;

function getDefaultDb() {
    return require("../database/db");
}

// Pobiera obiekt User z GuildMember albo User.
function getDiscordUser(member) {
    return member.user || member;
}

// Zwraca aktualną nazwę użytkownika do zapisu w bazie.
function getUsername(member) {
    const user = getDiscordUser(member);

    return user.tag || user.username || member.displayName || "Nieznany użytkownik";
}

// Zwraca bezpieczną, nieujemną liczbę punktów lub XP.
function getSafeAmount(value) {
    return Math.max(0, Number(value) || 0);
}

// Wylicza poziom wyłącznie na podstawie XP.
function getLevelFromXP(xp) {
    return Math.floor(getSafeAmount(xp) / XP_PER_LEVEL) + 1;
}

// Zwraca całkowity próg XP potrzebny do następnego poziomu.
function getXPToNextLevel(level) {
    const safeLevel = Math.max(1, Number(level) || 1);

    return safeLevel * XP_PER_LEVEL;
}

// Wylicza aktualny postęp na poziomie na podstawie XP z bazy.
function getCurrentLevelProgress(xp) {
    const safeXp = getSafeAmount(xp);
    const level = getLevelFromXP(safeXp);
    const levelStartXp = (level - 1) * XP_PER_LEVEL;
    const nextLevelXp = getXPToNextLevel(level);
    const required = nextLevelXp - levelStartXp;
    const current = safeXp - levelStartXp;

    return {
        current,
        required,
        percent: current / required,
        nextLevelXp
    };
}

function createPointsService(database = getDefaultDb()) {
    // Pobiera użytkownika z bazy albo tworzy go przy pierwszym zgłoszeniu.
    function getOrCreateUser(member) {
        const user = getDiscordUser(member);
        const username = getUsername(member);
        const existingUser = database.prepare(`
            SELECT *
            FROM users
            WHERE discord_id = ?
        `).get(user.id);

        if (existingUser) {
            database.prepare(`
                UPDATE users
                SET username = ?
                WHERE discord_id = ?
            `).run(username, user.id);

            return {
                ...existingUser,
                username
            };
        }

        const createdAt = new Date().toISOString();

        database.prepare(`
            INSERT INTO users (discord_id, username, created_at)
            VALUES (?, ?, ?)
        `).run(user.id, username, createdAt);

        return getUserStats(user.id);
    }

    // Dodaje PP z misji: saldo rośnie i jednocześnie rośnie rankingowy total earned.
    function addPoints(member, points) {
        const user = getOrCreateUser(member);
        const safePoints = getSafeAmount(points);

        database.prepare(`
            UPDATE users
            SET pp = pp + ?,
                pp_total_earned = pp_total_earned + ?,
                missions_completed = missions_completed + 1,
                username = ?
            WHERE discord_id = ?
        `).run(safePoints, safePoints, getUsername(member), user.discord_id);

        return getUserStats(user.discord_id);
    }

    // Dodaje XP niezależnie od PP i zapisuje aktualny poziom w bazie.
    function addXP(discordId, amount) {
        let user = getUserStats(discordId);
        const safeAmount = getSafeAmount(amount);

        if (!user) {
            database.prepare(`
                INSERT INTO users (discord_id, username, created_at)
                VALUES (?, ?, ?)
            `).run(discordId, "Nieznany użytkownik", new Date().toISOString());

            user = getUserStats(discordId);
        }

        const previousXp = getSafeAmount(user.xp);
        const previousLevel = Number(user.level) || getLevelFromXP(previousXp);
        const totalXp = previousXp + safeAmount;
        const newLevel = getLevelFromXP(totalXp);

        database.prepare(`
            UPDATE users
            SET xp = ?,
                level = ?
            WHERE discord_id = ?
        `).run(totalXp, newLevel, discordId);

        return {
            ...getUserStats(discordId),
            earnedXp: safeAmount,
            previousLevel,
            newLevel,
            leveledUp: newLevel > previousLevel
        };
    }

    // Pobiera statystyki użytkownika po Discord ID.
    function getUserStats(discordId) {
        return database.prepare(`
            SELECT *
            FROM users
            WHERE discord_id = ?
        `).get(discordId);
    }

    return {
        addPoints,
        addXP,
        getOrCreateUser,
        getUserStats
    };
}

function addPoints(member, points) {
    return createPointsService().addPoints(member, points);
}

function addXP(discordId, amount) {
    return createPointsService().addXP(discordId, amount);
}

function getOrCreateUser(member) {
    return createPointsService().getOrCreateUser(member);
}

function getUserStats(discordId) {
    return createPointsService().getUserStats(discordId);
}

module.exports = {
    addXP,
    addPoints,
    createPointsService,
    getCurrentLevelProgress,
    getLevelFromXP,
    getOrCreateUser,
    getXPToNextLevel,
    getUserStats
};
