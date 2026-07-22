const { SlashCommandBuilder } = require("discord.js");

const { getOrCreateUser } = require("../services/pointsService");
const { createInventoryRepository } = require("../services/inventoryRepository");
const { createShopRepository } = require("../services/shopRepository");
const { createInfoEmbed } = require("../utils/embedFactory");

function getSafeNumber(value) {
    return Math.max(0, Number(value) || 0);
}

function sortItemsByGoalPriority(firstItem, secondItem) {
    const priceDifference = getSafeNumber(firstItem.price) - getSafeNumber(secondItem.price);

    if (priceDifference !== 0) {
        return priceDifference;
    }

    return String(firstItem.name || "").localeCompare(String(secondItem.name || ""), "pl");
}

// Znajduje najtańszy aktywny przedmiot, którego użytkownik jeszcze nie posiada.
function findNextPpGoal(userStats, options = {}) {
    const shopRepository = options.shopRepository || createShopRepository(options.db);
    const inventoryRepository = options.inventoryRepository || createInventoryRepository(options.db);
    const ownedItemIds = userStats.id
        ? inventoryRepository.getOwnedItemIds(userStats.id)
        : new Set();
    const activeItems = shopRepository.getActiveItems("all")
        .filter((item) => item.active && Number.isSafeInteger(item.price) && item.price >= 0)
        .filter((item) => !ownedItemIds.has(item.id))
        .sort(sortItemsByGoalPriority);

    if (activeItems.length === 0) {
        return {
            complete: true
        };
    }

    return {
        complete: false,
        item: activeItems[0]
    };
}

function createGoalDescription(pp, nextGoal) {
    if (!nextGoal || nextGoal.complete) {
        return [
            "🏆 Gratulacje!",
            "",
            "Posiadasz wszystkie aktualnie dostępne przedmioty.",
            "Czekaj na kolejne aktualizacje sklepu."
        ].join("\n");
    }

    const item = nextGoal.item;
    const price = getSafeNumber(item.price);
    const missingPp = Math.max(0, price - pp);

    return [
        item.name,
        "",
        `Koszt: ${price} PP`,
        `Aktualne PP: ${pp}`,
        `Brakuje: ${missingPp} PP`
    ].join("\n");
}

// Buduje czytelne podsumowanie Punktów Poligonu dla jednego użytkownika.
function createPointsSummaryEmbed(userStats, options = {}) {
    const pp = getSafeNumber(userStats.pp);
    const ppTotalEarned = getSafeNumber(userStats.pp_total_earned ?? userStats.pp);
    const xp = getSafeNumber(userStats.xp);
    const level = Math.max(1, Number(userStats.level) || 1);
    const missionsCompleted = getSafeNumber(userStats.missions_completed);
    const nextGoal = options.nextGoal || findNextPpGoal(userStats, options);
    const description = [
        "🪙 **Punkty Poligonu (PP)** to oficjalna waluta **RetroForma Poligon**.",
        "",
        "Zdobywasz je za zaakceptowane misje.",
        "",
        "Możesz wydawać je w **/sklep**.",
        "",
        "🛍️ **Za Punkty Poligonu kupisz między innymi:**",
        "",
        "🎨 Tła profilu",
        "",
        "🖼️ Ramki avatara",
        "",
        "🎒 Gadżety kolekcjonerskie",
        "",
        "🏅 W przyszłości limitowane przedmioty i nagrody sezonowe."
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
                value: String(ppTotalEarned),
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
                name: "🎯 Następny cel",
                value: createGoalDescription(pp, nextGoal),
                inline: false
            },
            {
                name: "💡 Przydatne komendy",
                value: [
                    "🛍️ /sklep",
                    "🎒 /ekwipunek",
                    "👤 /profil",
                    "🏆 /ranking"
                ].join("\n"),
                inline: false
            }
        ]
    });
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName("punkty")
        .setDescription("Sprawdź swoje Punkty Poligonu."),

    // Pokazuje użytkownikowi saldo PP i najbliższy realny cel sklepowy.
    async execute(interaction, dependencies = {}) {
        const member = interaction.member || interaction.user;
        const userStats = (dependencies.getOrCreateUser || getOrCreateUser)(member);

        await interaction.reply({
            embeds: [
                createPointsSummaryEmbed(userStats, dependencies)
            ],
            ephemeral: true
        });
    }
};

module.exports.createGoalDescription = createGoalDescription;
module.exports.createPointsSummaryEmbed = createPointsSummaryEmbed;
module.exports.findNextPpGoal = findNextPpGoal;
