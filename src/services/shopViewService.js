const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder
} = require("discord.js");

const {
    getShopView
} = require("./shopService");
const {
    createErrorEmbed,
    createInfoEmbed,
    createSuccessEmbed
} = require("../utils/embedFactory");

const SHOP_CUSTOM_ID_PREFIX = "shop";

function createShopCustomId(parts) {
    return [
        SHOP_CUSTOM_ID_PREFIX,
        ...parts.map((part) => encodeURIComponent(String(part)))
    ].join(":");
}

function parseShopCustomId(customId) {
    const parts = String(customId || "").split(":");

    if (parts[0] !== SHOP_CUSTOM_ID_PREFIX || parts.length < 3) {
        return null;
    }

    return {
        action: decodeURIComponent(parts[1]),
        userId: decodeURIComponent(parts[2]),
        category: parts[3] ? decodeURIComponent(parts[3]) : "all",
        page: parts[4] ? Number(decodeURIComponent(parts[4])) || 0 : 0,
        itemCode: parts[5] ? decodeURIComponent(parts[5]) : null
    };
}

function createNoticeField(notice) {
    if (!notice) {
        return null;
    }

    return {
        name: notice.title,
        value: notice.lines.join("\n"),
        inline: false
    };
}

function formatItemStatus(item) {
    return item.owned ? "Posiadasz" : "Dostępny";
}

function formatItemPrice(item) {
    if (!Number.isSafeInteger(item.price) || item.price < 0) {
        return "niedostępna";
    }

    return `${item.price} PP`;
}

function createShopEmbed(view, notice = null) {
    const currentItem = view.items[0] || null;
    const noticeField = createNoticeField(notice);
    const fields = [];

    if (noticeField) {
        fields.push(noticeField);
    }

    if (currentItem) {
        fields.push({
            name: `${currentItem.owned ? "✅ " : ""}${currentItem.name}`,
            value: [
                `Kategoria: ${currentItem.categoryName}`,
                `Cena: ${formatItemPrice(currentItem)}`,
                `Rzadkość: ${currentItem.rarity}`,
                `Status: ${formatItemStatus(currentItem)}`,
                "",
                currentItem.description
            ].join("\n"),
            inline: false
        });
    } else {
        fields.push({
            name: "Oferta",
            value: "Brak aktywnych przedmiotów w tej kategorii.",
            inline: false
        });
    }

    fields.push({
        name: "Strona",
        value: `${view.page + 1} / ${view.totalPages} • Przedmioty: ${view.totalItems}`,
        inline: true
    });

    fields.push({
        name: "Twoje PP",
        value: `${view.pp} PP`,
        inline: true
    });

    const embedFactory = notice?.type === "success"
        ? createSuccessEmbed
        : notice?.type === "error"
            ? createErrorEmbed
            : createInfoEmbed;

    return embedFactory({
        title: "🛒 RetroForma Sklep",
        description: [
            "Społecznościowy katalog nagród za Punkty Poligonu.",
            "",
            `Kategoria: **${view.categoryName}**`
        ].join("\n"),
        fields
    });
}

function createCategorySelectRow(userId, selectedCategory, categories) {
    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId(createShopCustomId(["category", userId]))
        .setPlaceholder("Wybierz kategorię sklepu")
        .addOptions(categories.map((category) => ({
            label: category.name,
            description: category.description.slice(0, 100),
            value: category.id,
            default: category.id === selectedCategory
        })));

    return new ActionRowBuilder().addComponents(selectMenu);
}

function createNavigationRow(userId, view) {
    const currentItem = view.items[0] || null;
    const previousPage = Math.max(0, view.page - 1);
    const nextPage = Math.min(view.totalPages - 1, view.page + 1);

    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(createShopCustomId(["page", userId, view.category, previousPage]))
            .setLabel("Wstecz")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(view.page <= 0),
        new ButtonBuilder()
            .setCustomId(createShopCustomId([
                "buy",
                userId,
                view.category,
                view.page,
                currentItem?.code || "none"
            ]))
            .setLabel("Kup")
            .setStyle(ButtonStyle.Success)
            .setDisabled(!currentItem || currentItem.owned),
        new ButtonBuilder()
            .setCustomId(createShopCustomId(["page", userId, view.category, nextPage]))
            .setLabel("Dalej")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(view.page >= view.totalPages - 1)
    );
}

function createShopPayload(member, options = {}) {
    const userId = member.user?.id || member.id;
    const view = getShopView(member, {
        category: options.category,
        page: options.page
    });

    return {
        embeds: [
            createShopEmbed(view, options.notice)
        ],
        components: [
            createCategorySelectRow(userId, view.category, view.categories),
            createNavigationRow(userId, view)
        ]
    };
}

module.exports = {
    createShopPayload,
    parseShopCustomId
};
