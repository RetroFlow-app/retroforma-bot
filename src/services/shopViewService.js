const {
    ActionRowBuilder,
    AttachmentBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder
} = require("discord.js");

const {
    getShopView
} = require("./shopService");
const {
    renderShopScreen
} = require("../ui/templates/shopScreen");

const SHOP_CUSTOM_ID_PREFIX = "shop";
const SHOP_CATALOG_PREVIEW_SIZE = 4;

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

function isItemPurchasable(item) {
    return Boolean(
        item
        && !item.owned
        && Number.isSafeInteger(item.price)
        && item.price >= 0
    );
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
            .setDisabled(!isItemPurchasable(currentItem)),
        new ButtonBuilder()
            .setCustomId(createShopCustomId(["page", userId, view.category, nextPage]))
            .setLabel("Dalej")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(view.page >= view.totalPages - 1)
    );
}

function getCatalogPreviewStartPage(currentPage, totalPages) {
    if (totalPages <= SHOP_CATALOG_PREVIEW_SIZE) {
        return 0;
    }

    if (currentPage <= 1) {
        return 0;
    }

    if (currentPage >= totalPages - 2) {
        return totalPages - SHOP_CATALOG_PREVIEW_SIZE;
    }

    return currentPage - 1;
}

function createCatalogPreviewItems(member, view) {
    const startPage = getCatalogPreviewStartPage(view.page, view.totalPages);
    const previewItems = [];

    for (let offset = 0; offset < SHOP_CATALOG_PREVIEW_SIZE; offset += 1) {
        const page = startPage + offset;

        if (page >= view.totalPages) {
            break;
        }

        const pageView = page === view.page
            ? view
            : getShopView(member, {
                category: view.category,
                page
            });
        const item = pageView.items[0] || null;

        if (item) {
            previewItems.push({
                ...item,
                page: page + 1,
                selected: page === view.page
            });
        }
    }

    return previewItems;
}

function createShopPayloadFromView(member, view, options = {}) {
    const userId = member.user?.id || member.id;
    const currentItem = view.items[0] || null;
    const imageBuffer = renderShopScreen({
        catalogItems: options.catalogItems || createCatalogPreviewItems(member, view),
        category: view.categoryName,
        item: currentItem,
        notice: options.notice,
        owned: Boolean(currentItem?.owned),
        page: view.page + 1,
        playerPP: view.pp,
        totalItems: view.totalItems,
        totalPages: view.totalPages
    });
    const attachment = new AttachmentBuilder(imageBuffer, {
        name: "retroforma-sklep.png"
    });

    return {
        // Pusty embeds usuwa poprzedni embed, kiedy panel jest odświeżany po interakcji.
        embeds: [],
        files: [
            attachment
        ],
        components: [
            createCategorySelectRow(userId, view.category, view.categories),
            createNavigationRow(userId, view)
        ],
        attachments: []
    };
}

function createShopPayload(member, options = {}) {
    const view = getShopView(member, {
        category: options.category,
        page: options.page
    });

    return createShopPayloadFromView(member, view, options);
}

module.exports = {
    createCategorySelectRow,
    createCatalogPreviewItems,
    createNavigationRow,
    createShopPayloadFromView,
    getCatalogPreviewStartPage,
    createShopPayload,
    isItemPurchasable,
    parseShopCustomId
};
