const db = require("../database/db");
const {
    getCurrentLevelProgress,
    getOrCreateUser
} = require("./pointsService");
const {
    evaluateBadgesForUser,
    getUserBadges
} = require("./badgeService");
const { getProfileEquipment } = require("./profileEquipmentService");
const { getRank } = require("./rankService");

// Wylicza pozycję w rankingu na podstawie łącznie zdobytych PP, XP, poziomu i nicku.
function getUserRankingPosition({
    id,
    level,
    ppTotalEarned,
    username,
    xp
}) {
    const result = db.prepare(`
        SELECT COUNT(*) + 1 AS position
        FROM users
        WHERE pp_total_earned > @ppTotalEarned
           OR (
                pp_total_earned = @ppTotalEarned
                AND xp > @xp
           )
           OR (
                pp_total_earned = @ppTotalEarned
                AND xp = @xp
                AND level > @level
           )
           OR (
                pp_total_earned = @ppTotalEarned
                AND xp = @xp
                AND level = @level
                AND LOWER(COALESCE(username, '')) < LOWER(@username)
           )
           OR (
                pp_total_earned = @ppTotalEarned
                AND xp = @xp
                AND level = @level
                AND LOWER(COALESCE(username, '')) = LOWER(@username)
                AND id < @id
           )
    `).get({
        id,
        level,
        ppTotalEarned,
        username: username || "",
        xp
    });

    return result.position;
}

// Pobiera dane profilu i tworzy brakującego użytkownika z zerowymi statystykami.
function getProfileData(member) {
    const discordUser = member.user || member;
    const user = getOrCreateUser(member);
    const pp = Number(user.pp) || 0;
    const ppTotalEarned = Number(user.pp_total_earned ?? user.pp) || 0;
    const xp = Number(user.xp) || 0;
    const level = Number(user.level) || 1;
    const currentStreak = Number(user.current_streak) || 0;
    const bestStreak = Number(user.best_streak) || 0;

    // Profil może też uzupełnić zaległe odznaki dla starszych danych w bazie.
    evaluateBadgesForUser(user.discord_id);

    return {
        discordId: user.discord_id,
        username: user.username,
        avatarUrl: typeof discordUser.displayAvatarURL === "function"
            ? discordUser.displayAvatarURL({
                extension: "png",
                size: 256
            })
            : null,
        pp,
        ppTotalEarned,
        xp,
        level,
        rankName: getRank(level),
        missionsCompleted: Number(user.missions_completed) || 0,
        currentStreak,
        bestStreak,
        streak: currentStreak,
        rankingPosition: getUserRankingPosition({
            id: user.id,
            level,
            ppTotalEarned,
            username: user.username,
            xp
        }),
        badges: getUserBadges(user.discord_id, 6),
        equipment: getProfileEquipment(db, user.id),
        progress: getCurrentLevelProgress(xp)
    };
}

module.exports = {
    getProfileData
};
