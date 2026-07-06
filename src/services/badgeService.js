const db = require("../database/db");

const badgeDefinitions = [
    {
        id: "first_mission",
        name: "Pierwsza Misja",
        description: "Ukończono pierwszą misję Poligonu CAD.",
        icon: "I"
    },
    {
        id: "missions_10",
        name: "10 Misji",
        description: "Ukończono 10 misji Poligonu CAD.",
        icon: "10"
    },
    {
        id: "missions_25",
        name: "25 Misji",
        description: "Ukończono 25 misji Poligonu CAD.",
        icon: "25"
    },
    {
        id: "missions_50",
        name: "50 Misji",
        description: "Ukończono 50 misji Poligonu CAD.",
        icon: "50"
    },
    {
        id: "missions_100",
        name: "100 Misji",
        description: "Ukończono 100 misji Poligonu CAD.",
        icon: "100"
    },
    {
        id: "streak_7",
        name: "Seria 7",
        description: "Ukończono 7 kolejnych misji bez przerwy.",
        icon: "S7"
    },
    {
        id: "streak_30",
        name: "Seria 30",
        description: "Ukończono 30 kolejnych misji bez przerwy.",
        icon: "S30"
    },
    {
        id: "top_3",
        name: "TOP 3",
        description: "Zdobyto miejsce w pierwszej trójce rankingu Poligonu.",
        icon: "TOP"
    }
];

const missionBadgeRules = [
    {
        badgeId: "first_mission",
        requiredMissions: 1
    },
    {
        badgeId: "missions_10",
        requiredMissions: 10
    },
    {
        badgeId: "missions_25",
        requiredMissions: 25
    },
    {
        badgeId: "missions_50",
        requiredMissions: 50
    },
    {
        badgeId: "missions_100",
        requiredMissions: 100
    }
];

const streakBadgeRules = [
    {
        badgeId: "streak_7",
        requiredStreak: 7
    },
    {
        badgeId: "streak_30",
        requiredStreak: 30
    }
];

// Upewnia się, że definicje odznak istnieją w bazie.
function seedBadges() {
    const statement = db.prepare(`
        INSERT INTO badges (id, name, description, icon)
        VALUES (@id, @name, @description, @icon)
        ON CONFLICT(id) DO UPDATE SET
            name = excluded.name,
            description = excluded.description,
            icon = excluded.icon
    `);

    for (const badge of badgeDefinitions) {
        statement.run(badge);
    }
}

function getBadgeById(badgeId) {
    return db.prepare(`
        SELECT id, name, description, icon
        FROM badges
        WHERE id = ?
    `).get(badgeId);
}

// Przyznaje pojedynczą odznakę, jeśli użytkownik jeszcze jej nie ma.
function awardBadge(discordId, badgeId) {
    const result = db.prepare(`
        INSERT OR IGNORE INTO users_badges (discord_id, badge_id)
        VALUES (?, ?)
    `).run(discordId, badgeId);

    if (result.changes === 0) {
        return null;
    }

    return getBadgeById(badgeId);
}

// Pobiera pierwsze odznaki użytkownika w kolejności przyznania.
function getUserBadges(discordId, limit = 6) {
    return db.prepare(`
        SELECT b.id, b.name, b.description, b.icon
        FROM users_badges ub
        INNER JOIN badges b
            ON b.id = ub.badge_id
        WHERE ub.discord_id = ?
        ORDER BY ub.rowid ASC
        LIMIT ?
    `).all(discordId, limit);
}

// Pobiera aktualną pierwszą trójkę rankingu PP.
function getTopParticipantIds() {
    return db.prepare(`
        SELECT discord_id
        FROM users
        WHERE pp > 0
           OR missions_completed > 0
        ORDER BY pp DESC, missions_completed DESC, id ASC
        LIMIT 3
    `).all().map((user) => user.discord_id);
}

// Przyznaje odznakę TOP 3 aktualnym liderom rankingu.
function awardTop3Badges() {
    return getTopParticipantIds()
        .map((discordId) => awardBadge(discordId, "top_3"))
        .filter(Boolean);
}

// Sprawdza wszystkie warunki odznak dla jednego użytkownika.
function evaluateBadgesForUser(discordId) {
    const user = db.prepare(`
        SELECT discord_id, missions_completed, best_streak
        FROM users
        WHERE discord_id = ?
    `).get(discordId);

    if (!user) {
        return [];
    }

    const earnedBadges = [];
    const missionsCompleted = Number(user.missions_completed) || 0;
    const bestStreak = Number(user.best_streak) || 0;

    for (const rule of missionBadgeRules) {
        if (missionsCompleted >= rule.requiredMissions) {
            const badge = awardBadge(discordId, rule.badgeId);

            if (badge) {
                earnedBadges.push(badge);
            }
        }
    }

    for (const rule of streakBadgeRules) {
        if (bestStreak >= rule.requiredStreak) {
            const badge = awardBadge(discordId, rule.badgeId);

            if (badge) {
                earnedBadges.push(badge);
            }
        }
    }

    if (getTopParticipantIds().includes(discordId)) {
        const badge = awardBadge(discordId, "top_3");

        if (badge) {
            earnedBadges.push(badge);
        }
    }

    return earnedBadges;
}

seedBadges();

module.exports = {
    awardBadge,
    awardTop3Badges,
    evaluateBadgesForUser,
    getUserBadges
};
