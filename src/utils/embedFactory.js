const { EmbedBuilder } = require("discord.js");

const config = require("../config/appConfig");

const DEFAULT_BRANDING = {
    name: "RetroForma Poligon",
    footer: "RetroForma • Poligon CAD",
    colorSuccess: "#57F287",
    colorError: "#ED4245",
    colorInfo: "#5865F2",
    colorMission: "#FEE75C",
    colorRanking: "#FAA61A"
};

const SEPARATOR = "━━━━━━━━━━━━━━━━━━━━━━";

// Pobiera branding z config.json z bezpiecznymi wartościami domyślnymi.
function getBranding() {
    return {
        ...DEFAULT_BRANDING,
        ...(config.branding || {})
    };
}

// Zamienia kolor HEX z config.json na format wymagany przez discord.js.
function parseColor(hexColor) {
    return Number.parseInt(hexColor.replace("#", ""), 16);
}

// Tworzy bazowy embed ze wspólnym autorem, stopką, kolorem i timestampem.
function createBaseEmbed(colorKey) {
    const branding = getBranding();

    return new EmbedBuilder()
        .setAuthor({
            name: branding.name
        })
        .setFooter({
            text: branding.footer
        })
        .setColor(parseColor(branding[colorKey]))
        .setTimestamp();
}

// Nakłada wspólny branding na embed zbudowany z istniejącej wiadomości.
function applyBranding(embed, colorKey) {
    const branding = getBranding();

    return embed
        .setAuthor({
            name: branding.name
        })
        .setFooter({
            text: branding.footer
        })
        .setColor(parseColor(branding[colorKey]))
        .setTimestamp();
}

// Dodaje pola tylko wtedy, gdy embed faktycznie ma jakieś pola.
function addFieldsIfNeeded(embed, fields) {
    if (fields.length > 0) {
        embed.addFields(fields);
    }

    return embed;
}

// Formatuje datę do czytelnej formy używanej w misjach i rankingu.
function formatDateTime(dateValue) {
    if (!dateValue) {
        return "Nie podano";
    }

    return new Intl.DateTimeFormat("pl-PL", {
        timeZone: config.timezone || "Europe/Warsaw",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false
    }).format(new Date(dateValue)).replace(",", "");
}

// Dodaje gwiazdki do poziomu trudności misji.
function formatDifficulty(difficulty) {
    const value = difficulty || "Nie podano";
    const normalizedValue = value.toLowerCase();

    if (normalizedValue.includes("łatw") || normalizedValue.includes("latw")) {
        return `⭐⭐ ${value}`;
    }

    if (normalizedValue.includes("śred") || normalizedValue.includes("sred")) {
        return `⭐⭐⭐ ${value}`;
    }

    if (normalizedValue.includes("trud")) {
        return `⭐⭐⭐⭐ ${value}`;
    }

    return value;
}

function createSuccessEmbed({ title, description, fields = [] }) {
    return addFieldsIfNeeded(createBaseEmbed("colorSuccess")
        .setTitle(title)
        .setDescription(description), fields);
}

function createErrorEmbed({ title, description, fields = [] }) {
    return addFieldsIfNeeded(createBaseEmbed("colorError")
        .setTitle(title)
        .setDescription(description), fields);
}

function createInfoEmbed({ title, description, fields = [] }) {
    return addFieldsIfNeeded(createBaseEmbed("colorInfo")
        .setTitle(title)
        .setDescription(description), fields);
}

function createMissionEmbed(mission, options = {}) {
    const {
        attachmentName = null,
        existingEmbed = null,
        notice = null
    } = options;

    if (existingEmbed) {
        const description = existingEmbed.description || "";

        return applyBranding(EmbedBuilder.from(existingEmbed), "colorMission")
            .setDescription(`${description}\n\n${notice}`.trim());
    }

    const submitChannel = config.submitChannelId ? `<#${config.submitChannelId}>` : "#oddaj-projekt";
    const description = [
        SEPARATOR,
        `🎯 MISJA CAD #${mission.number}`,
        SEPARATOR,
        "",
        "📝 Zadanie",
        "",
        mission.description || "Brak opisu misji.",
        "",
        SEPARATOR,
        "",
        "🎯 Trudność",
        "",
        formatDifficulty(mission.difficulty),
        "",
        "🏅 Nagroda",
        "",
        `${Number(mission.points) || 0} PP`,
        "",
        "📅 Termin oddawania",
        "",
        formatDateTime(mission.closeAt),
        "",
        "📥 Oddaj projekt",
        "",
        submitChannel,
        "",
        SEPARATOR
    ];

    if (notice) {
        description.push("", notice);
    }

    const embed = createBaseEmbed("colorMission")
        .setTitle("Misja dnia")
        .setDescription(description.join("\n"));

    if (attachmentName) {
        embed.setImage(`attachment://${attachmentName}`);
    }

    return embed;
}

function createRankingEmbed({ topUsers, stats, updatedAt = new Date() }) {
    const medals = ["🥇", "🥈", "🥉"];
    const rankingLines = ["TOP 10", ""];

    if (topUsers.length === 0) {
        rankingLines.push("Brak kadetów w rankingu.");
    } else {
        topUsers.forEach((user, index) => {
            rankingLines.push(`${medals[index] || `${index + 1}.`} ${user.username || user.discord_id}`);
            rankingLines.push(`${user.pp} PP`);
            rankingLines.push("");
        });
    }

    return createBaseEmbed("colorRanking")
        .setTitle("🏆 Ranking Poligonu CAD")
        .setDescription(rankingLines.join("\n").trim())
        .addFields(
            {
                name: "👥 Kadetów",
                value: String(stats.user_count),
                inline: true
            },
            {
                name: "🎯 Misji ukończonych",
                value: String(stats.completed_missions),
                inline: true
            },
            {
                name: "📅 Aktualizacja",
                value: formatDateTime(updatedAt),
                inline: false
            }
        );
}

function getReviewStatusLabel(status) {
    if (status === "APPROVED") {
        return "🟢 ZAAKCEPTOWANO";
    }

    if (status === "REJECTED") {
        return "🔴 ODRZUCONO";
    }

    return "🟡 OCZEKUJE";
}

function getReviewColorKey(status) {
    if (status === "APPROVED") {
        return "colorSuccess";
    }

    if (status === "REJECTED") {
        return "colorError";
    }

    return "colorInfo";
}

function createReviewEmbed({
    authorMention,
    missionNumber,
    createdAt,
    attachmentCount,
    status = "PENDING",
    moderatorMention = null,
    reviewedAt = null,
    rejectReason = null
}) {
    const fields = [
        {
            name: "👤 Autor:",
            value: authorMention,
            inline: false
        },
        {
            name: "📐 Misja:",
            value: `#${missionNumber}`,
            inline: true
        },
        {
            name: "📅 Data:",
            value: formatDateTime(createdAt),
            inline: true
        },
        {
            name: "📷 Liczba zdjęć:",
            value: String(attachmentCount),
            inline: true
        },
        {
            name: "Status:",
            value: getReviewStatusLabel(status),
            inline: false
        }
    ];

    if (moderatorMention) {
        fields.push({
            name: "Moderator:",
            value: moderatorMention,
            inline: true
        });
    }

    if (reviewedAt) {
        fields.push({
            name: "Data decyzji:",
            value: formatDateTime(reviewedAt),
            inline: true
        });
    }

    if (rejectReason) {
        fields.push({
            name: "Powód:",
            value: rejectReason,
            inline: false
        });
    }

    return createBaseEmbed(getReviewColorKey(status))
        .setTitle("🪖 Nowe zgłoszenie")
        .addFields(fields);
}

function createLogEmbed({ title = "Log systemowy", description, fields = [] }) {
    return addFieldsIfNeeded(createBaseEmbed("colorInfo")
        .setTitle(title)
        .setDescription(description), fields);
}

module.exports = {
    createErrorEmbed,
    createInfoEmbed,
    createLogEmbed,
    createMissionEmbed,
    createRankingEmbed,
    createReviewEmbed,
    createSuccessEmbed
};
