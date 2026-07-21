const fs = require("fs");
const { AttachmentBuilder } = require("discord.js");

const config = require("../config/appConfig");
const { systemStatePath } = require("../config/paths");
const { createRankingEmbed } = require("../utils/embedFactory");
const { createRankingCard } = require("./rankingCardService");
const { getRank } = require("./rankService");

const RANKING_ATTACHMENT_NAME = "ranking-poligonu.png";

function getDefaultDb() {
    return require("../database/db");
}

function awardTop3BadgesForCurrentRanking() {
    return require("./badgeService").awardTop3Badges();
}

// Wczytuje plik systemowy z identyfikatorami wiadomości technicznych bota.
function loadSystemState() {
    if (!fs.existsSync(systemStatePath)) {
        return {
            rankingMessageId: null
        };
    }

    const rawState = fs.readFileSync(systemStatePath, "utf8");

    return {
        rankingMessageId: null,
        ...JSON.parse(rawState)
    };
}

// Zapisuje stan systemowy, np. messageId wiadomości rankingu.
function saveSystemState(state) {
    fs.writeFileSync(
        systemStatePath,
        `${JSON.stringify(state, null, 2)}\n`,
        "utf8"
    );
}

// Pobiera TOP 10 według łącznej liczby zdobytych PP, a nie aktualnego salda.
function getTopUsersFromDatabase(database = getDefaultDb()) {
    return database.prepare(`
        SELECT
            id,
            discord_id,
            username,
            pp AS pp_balance,
            pp_total_earned AS pp,
            pp_total_earned,
            xp,
            level,
            missions_completed
        FROM users
        ORDER BY pp_total_earned DESC,
                 xp DESC,
                 level DESC,
                 LOWER(COALESCE(username, '')) ASC,
                 id ASC
        LIMIT 10
    `).all();
}

function getTopUsers() {
    return getTopUsersFromDatabase(getDefaultDb());
}

// Pobiera podsumowanie całego Poligonu.
function getRankingStats(database = getDefaultDb()) {
    return database.prepare(`
        SELECT
            COUNT(*) AS user_count,
            COALESCE(SUM(missions_completed), 0) AS completed_missions
        FROM users
    `).get();
}

function getSafeNumber(value, fallback = 0) {
    const numberValue = Number(value);

    return Number.isFinite(numberValue) ? Math.max(0, numberValue) : fallback;
}

function getFallbackUsername(user) {
    return user.username || user.discord_id || "Nieznany Kadet";
}

async function fetchDiscordRankingUser(client, user) {
    if (!client?.users?.fetch || !user.discord_id) {
        return null;
    }

    try {
        return await client.users.fetch(user.discord_id);
    } catch (error) {
        console.error(`Nie udało się pobrać użytkownika Discord ${user.discord_id}: ${error.message}`);
        return null;
    }
}

// Przygotowuje dane pod PNG bez przerywania rankingu przez pojedynczy błąd avatara.
async function prepareRankingUsers(client, users) {
    return Promise.all(users.map(async (user, index) => {
        const level = Math.max(1, getSafeNumber(user.level, 1));
        const discordUser = await fetchDiscordRankingUser(client, user);
        const displayName = discordUser?.globalName
            || discordUser?.username
            || getFallbackUsername(user);
        const avatarUrl = typeof discordUser?.displayAvatarURL === "function"
            ? discordUser.displayAvatarURL({
                extension: "png",
                size: 128
            })
            : null;

        return {
            id: user.id,
            position: index + 1,
            discordId: user.discord_id,
            username: displayName,
            rankName: getRank(level),
            pp: getSafeNumber(user.pp),
            ppBalance: getSafeNumber(user.pp_balance),
            ppTotalEarned: getSafeNumber(user.pp_total_earned ?? user.pp),
            xp: getSafeNumber(user.xp),
            level,
            missionsCompleted: getSafeNumber(user.missions_completed),
            avatarUrl
        };
    }));
}

function buildFallbackRankingPayload(topUsers, stats, updatedAt) {
    return {
        content: null,
        embeds: [
            createRankingEmbed({
                topUsers,
                stats,
                updatedAt
            })
        ],
        files: [],
        attachments: []
    };
}

// Buduje payload graficzny, a jeśli canvas zawiedzie, wraca do starego embeda.
async function buildRankingPayload(client) {
    const topUsers = getTopUsers();
    const stats = getRankingStats();
    const updatedAt = new Date();

    try {
        const rankingUsers = await prepareRankingUsers(client, topUsers);
        const rankingImage = await createRankingCard({
            users: rankingUsers,
            stats,
            updatedAt
        });
        const attachment = new AttachmentBuilder(rankingImage, {
            name: RANKING_ATTACHMENT_NAME
        });

        return {
            content: null,
            embeds: [],
            files: [attachment],
            // Podczas edycji usuwa poprzedni załącznik i zastępuje go nową grafiką.
            attachments: []
        };
    } catch (error) {
        console.error("Nie udało się wygenerować graficznego rankingu Poligonu CAD:", error);
        return buildFallbackRankingPayload(topUsers, stats, updatedAt);
    }
}

function getPayloadForNewMessage(payload) {
    const {
        attachments,
        ...sendPayload
    } = payload;

    return sendPayload;
}

// Próbuje pobrać istniejącą wiadomość rankingu z Discorda.
async function fetchRankingMessage(channel, messageId) {
    if (!messageId) {
        return null;
    }

    try {
        return await channel.messages.fetch(messageId);
    } catch (error) {
        // 10008 oznacza Unknown Message, czyli zapisana wiadomość została usunięta.
        if (error.code === 10008) {
            return null;
        }

        throw error;
    }
}

// Aktualizuje jedną wiadomość rankingu albo tworzy ją, jeśli jeszcze nie istnieje.
async function updateRankingMessage(client) {
    if (!config.rankingChannelId) {
        throw new Error("Brak rankingChannelId w config.json.");
    }

    const channel = await client.channels.fetch(config.rankingChannelId);

    if (!channel) {
        throw new Error("Nie znaleziono kanału rankingu.");
    }

    const state = loadSystemState();
    const rankingMessage = await fetchRankingMessage(channel, state.rankingMessageId);

    // TOP 3 jest odznaką przyznawaną na podstawie aktualnego rankingu PP.
    awardTop3BadgesForCurrentRanking();

    const payload = await buildRankingPayload(client);

    if (rankingMessage) {
        await rankingMessage.edit({
            content: null,
            ...payload
        });
        return rankingMessage;
    }

    const createdMessage = await channel.send(getPayloadForNewMessage(payload));

    saveSystemState({
        ...state,
        rankingMessageId: createdMessage.id
    });

    return createdMessage;
}

module.exports = {
    buildRankingPayload,
    getTopUsers,
    getTopUsersFromDatabase,
    updateRankingMessage
};
