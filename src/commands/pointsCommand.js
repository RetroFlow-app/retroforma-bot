const { SlashCommandBuilder } = require("discord.js");

const { getOrCreateUser } = require("../services/pointsService");
const { createInfoEmbed } = require("../utils/embedFactory");

const NEXT_PP_GOAL = {
    name: "Brązowa ramka profilu",
    cost: 500
};
const PROGRESS_BAR_SEGMENTS = 10;

function getSafeNumber(value) {
    return Math.max(0, Number(value) || 0);
}

// Buduje prosty pasek postępu z 10 segmentów dla celu PP.
function createProgressBar(currentValue, targetValue) {
    const safeTarget = Math.max(1, targetValue);
    const progress = Math.min(1, getSafeNumber(currentValue) / safeTarget);
    const filledSegments = Math.floor(progress * PROGRESS_BAR_SEGMENTS);
    const emptySegments = PROGRESS_BAR_SEGMENTS - filledSegments;

    return "█".repeat(filledSegments) + "░".repeat(emptySegments);
}

// Pokazuje stały najbliższy cel, który przygotowuje użytkownika na przyszłe nagrody.
function createGoalDescription(pp) {
    const missingPp = Math.max(0, NEXT_PP_GOAL.cost - pp);
    const progressBar = createProgressBar(pp, NEXT_PP_GOAL.cost);
    const progressLine = `${progressBar} ${Math.min(pp, NEXT_PP_GOAL.cost)} / ${NEXT_PP_GOAL.cost} PP`;

    if (pp >= NEXT_PP_GOAL.cost) {
        return [
            "🖼 Brązowa ramka profilu",
            `Koszt: ${NEXT_PP_GOAL.cost} PP`,
            "",
            "Postęp:",
            progressLine,
            "",
            "✅ Możesz odblokować tę nagrodę po otwarciu Arsenału!"
        ].join("\n");
    }

    return [
        "🖼 Brązowa ramka profilu",
        `Koszt: ${NEXT_PP_GOAL.cost} PP`,
        "",
        "Postęp:",
        progressLine,
        "",
        "Brakuje:",
        `${missingPp} PP`
    ].join("\n");
}

// Buduje czytelne podsumowanie Punktów Poligonu dla jednego użytkownika.
function createPointsSummaryEmbed(userStats) {
    const pp = getSafeNumber(userStats.pp);
    const xp = getSafeNumber(userStats.xp);
    const level = Math.max(1, Number(userStats.level) || 1);
    const missionsCompleted = getSafeNumber(userStats.missions_completed);
    const description = [
        "🏅 **Punkty Poligonu (PP)** to oficjalna waluta **Poligonu CAD**.",
        "",
        "Zdobywasz je za każdą **zaakceptowaną misję**.",
        "",
        "🪖 Już wkrótce otworzy się **Arsenał Poligonu**, w którym wykorzystasz PP do odblokowania:",
        "",
        "🎨 Unikalnych teł profilu",
        "",
        "🖼 Ekskluzywnych ramek",
        "",
        "🏅 Specjalnych odznak",
        "",
        "🎁 Nagród i wydarzeń specjalnych",
        "",
        "━━━━━━━━━━━━━━━━━━━━━━",
        "",
        "💡 **Zbieraj PP już teraz!**",
        "Od dnia otwarcia Arsenału będą miały realną wartość."
    ].join("\n");

    return createInfoEmbed({
        title: "🏅 Punkty Poligonu",
        description,
        fields: [
            {
                name: "💰 Dostępne PP",
                value: String(pp),
                inline: true
            },
            {
                name: "🏦 Łącznie zdobyte",
                value: String(pp),
                inline: true
            },
            {
                name: "🎯 Ukończone misje",
                value: String(missionsCompleted),
                inline: true
            },
            {
                name: "⭐ XP",
                value: String(xp),
                inline: true
            },
            {
                name: "📈 Poziom",
                value: String(level),
                inline: true
            },
            {
                name: "🪖 Arsenał",
                value: "wkrótce",
                inline: true
            },
            {
                name: "🎯 Najbliższy cel",
                value: createGoalDescription(pp),
                inline: false
            },
            {
                name: "🚀 Następna aktualizacja",
                value: [
                    "🪖 Arsenał Poligonu",
                    "",
                    "**Status:**",
                    "🔨 W przygotowaniu"
                ].join("\n"),
                inline: false
            }
        ]
    });
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName("punkty")
        .setDescription("Sprawdź swoje Punkty Poligonu i status Arsenału."),

    // Pokazuje użytkownikowi jego PP bez dodawania zakupów ani Arsenału.
    async execute(interaction) {
        const member = interaction.member || interaction.user;
        const userStats = getOrCreateUser(member);

        await interaction.reply({
            embeds: [
                createPointsSummaryEmbed(userStats)
            ],
            ephemeral: true
        });
    }
};
