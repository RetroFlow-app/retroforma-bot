const db = require("../database/db");

const XP_PER_LEVEL = 250;

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

// Pobiera użytkownika z bazy albo tworzy go przy pierwszym zgłoszeniu.
function getOrCreateUser(member) {
    const user = getDiscordUser(member);
    const username = getUsername(member);
    const existingUser = db.prepare(`
        SELECT *
        FROM users
        WHERE discord_id = ?
    `).get(user.id);

    if (existingUser) {
        db.prepare(`
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

    db.prepare(`
        INSERT INTO users (discord_id, username, created_at)
        VALUES (?, ?, ?)
    `).run(user.id, username, createdAt);

    return db.prepare(`
        SELECT *
        FROM users
        WHERE discord_id = ?
    `).get(user.id);
}

// Dodaje Punkty Poligonu i zwiększa licznik ukończonych misji.
function addPoints(member, points) {
    const user = getOrCreateUser(member);
    const safePoints = getSafeAmount(points);

    db.prepare(`
        UPDATE users
        SET pp = pp + ?,
            missions_completed = missions_completed + 1,
            username = ?
        WHERE discord_id = ?
    `).run(safePoints, getUsername(member), user.discord_id);

    return getUserStats(user.discord_id);
}

// Dodaje XP niezależnie od PP i zapisuje aktualny poziom w bazie.
function addXP(discordId, amount) {
    let user = getUserStats(discordId);
    const safeAmount = getSafeAmount(amount);

    if (!user) {
        db.prepare(`
            INSERT INTO users (discord_id, username, created_at)
            VALUES (?, ?, ?)
        `).run(discordId, "Nieznany użytkownik", new Date().toISOString());

        user = getUserStats(discordId);
    }

    const previousXp = getSafeAmount(user.xp);
    const previousLevel = Number(user.level) || getLevelFromXP(previousXp);
    const totalXp = previousXp + safeAmount;
    const newLevel = getLevelFromXP(totalXp);

    db.prepare(`
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
    return db.prepare(`
        SELECT *
        FROM users
        WHERE discord_id = ?
    `).get(discordId);
}

module.exports = {
    addXP,
    addPoints,
    getCurrentLevelProgress,
    getLevelFromXP,
    getOrCreateUser,
    getXPToNextLevel,
    getUserStats
};
