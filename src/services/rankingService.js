const fs = require("fs");

const config = require("../config/appConfig");
const { systemStatePath } = require("../config/paths");
const db = require("../database/db");
const { createRankingEmbed } = require("../utils/embedFactory");
const { awardTop3Badges } = require("./badgeService");

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

// Pobiera TOP 10 użytkowników według PP i liczby ukończonych misji.
function getTopUsers() {
    return db.prepare(`
        SELECT username, discord_id, pp, missions_completed
        FROM users
        ORDER BY pp DESC, missions_completed DESC
        LIMIT 10
    `).all();
}

// Pobiera podsumowanie całego Poligonu.
function getRankingStats() {
    return db.prepare(`
        SELECT
            COUNT(*) AS user_count,
            COALESCE(SUM(missions_completed), 0) AS completed_missions
        FROM users
    `).get();
}

// Buduje gotowy payload jednej wiadomości rankingowej.
function buildRankingPayload() {
    return {
        embeds: [
            createRankingEmbed({
                topUsers: getTopUsers(),
                stats: getRankingStats()
            })
        ]
    };
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

// Aktualizuje jedyną wiadomość rankingu albo tworzy ją, jeśli jeszcze nie istnieje.
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
    awardTop3Badges();

    const payload = buildRankingPayload();

    if (rankingMessage) {
        await rankingMessage.edit({
            content: null,
            ...payload
        });
        return rankingMessage;
    }

    const createdMessage = await channel.send(payload);

    saveSystemState({
        ...state,
        rankingMessageId: createdMessage.id
    });

    return createdMessage;
}

module.exports = {
    buildRankingPayload,
    getTopUsers,
    updateRankingMessage
};
