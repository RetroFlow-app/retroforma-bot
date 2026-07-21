const {
    ActionRowBuilder,
    AttachmentBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder
} = require("discord.js");

const {
    INVENTORY_SECTIONS,
    getInventoryView
} = require("./inventoryService");
const { INITIAL_SHOP_ITEMS } = require("../database/shopSeedData");
const {
    INVENTORY_SCREEN_PAGE_SIZE,
    normalizeInventoryScreenData,
    renderInventoryScreen
} = require("../ui/templates/inventoryScreen");

const INVENTORY_CUSTOM_ID_PREFIX = "inventory";
const MAX_SELECT_OPTIONS = 25;
const AVAILABLE_BADGE_COUNT = 8;

const INVENTORY_CATEGORIES = [
    {
        description: "Wszystkie posiadane elementy kolekcji.",
        id: "all",
        label: "Wszystko"
    },
    ...INVENTORY_SECTIONS.map((section) => ({
        description: `Pokaż sekcję: ${section.title}`,
        id: section.id,
        label: section.title
    }))
];

function getMemberUserId(member) {
    return member.user?.id || member.id;
}

function createInventoryCustomId(parts) {
    return [
        INVENTORY_CUSTOM_ID_PREFIX,
        ...parts.map((part) => encodeURIComponent(String(part)))
    ].join(":");
}

function parseInventoryCustomId(customId) {
    const parts = String(customId || "").split(":");

    if (parts[0] !== INVENTORY_CUSTOM_ID_PREFIX || parts.length < 3) {
        return null;
    }

    return {
        action: decodeURIComponent(parts[1]),
        category: parts[3] ? decodeURIComponent(parts[3]) : "all",
        itemCode: parts[6] ? decodeURIComponent(parts[6]) : null,
        page: parts[4] ? Number(decodeURIComponent(parts[4])) || 0 : 0,
        slot: parts[5] ? decodeURIComponent(parts[5]) : null,
        userId: decodeURIComponent(parts[2])
    };
}

function getValidInventoryCategory(category) {
    const categoryId = String(category || "all");

    return INVENTORY_CATEGORIES.some((entry) => entry.id === categoryId)
        ? categoryId
        : "all";
}

function createCategorySelectRow(userId, selectedCategory) {
    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId(createInventoryCustomId(["category", userId]))
        .setPlaceholder("Wybierz kategorię ekwipunku")
        .addOptions(INVENTORY_CATEGORIES.map((category) => ({
            label: category.label.slice(0, 100),
            description: category.description.slice(0, 100),
            value: category.id,
            default: category.id === selectedCategory
        })));

    return new ActionRowBuilder().addComponents(selectMenu);
}

function createNavigationRow(userId, viewModel) {
    const previousPage = Math.max(0, viewModel.page - 1);
    const nextPage = Math.min(viewModel.totalPages - 1, viewModel.page + 1);
    const selectedItem = viewModel.selectedItem;
    const components = [
        new ButtonBuilder()
            .setCustomId(createInventoryCustomId(["page", userId, viewModel.category, previousPage, "previous"]))
            .setLabel("Wstecz")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(viewModel.page <= 0)
    ];

    if (selectedItem?.equipmentSlot && !selectedItem.equipped) {
        components.push(
            new ButtonBuilder()
                .setCustomId(createInventoryCustomId([
                    "equip",
                    userId,
                    viewModel.category,
                    viewModel.page,
                    selectedItem.equipmentSlot,
                    selectedItem.code
                ]))
                .setLabel("✅ Wyposaż")
                .setStyle(ButtonStyle.Success)
        );
    }

    components.push(
        new ButtonBuilder()
            .setCustomId(createInventoryCustomId(["page", userId, viewModel.category, nextPage, "next"]))
            .setLabel("Dalej")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(viewModel.page >= viewModel.totalPages - 1)
    );

    return new ActionRowBuilder().addComponents(...components);
}

function limitSelectText(value, maxLength = 100) {
    const text = String(value || "").trim();

    if (text.length <= maxLength) {
        return text;
    }

    return `${text.slice(0, maxLength - 1).trim()}…`;
}

function getSectionItems(inventoryView, sectionId) {
    return inventoryView.sections.find((section) => section.id === sectionId)?.items || [];
}

function getSelectableItems(inventoryView, selectedCategory) {
    if (selectedCategory === "all") {
        return inventoryView.sections.flatMap((section) => section.items || []);
    }

    return getSectionItems(inventoryView, selectedCategory);
}

function getItemSelectDescription(item) {
    if (item.equipped) {
        return "Aktualnie używany";
    }

    if (item.equipmentSlot) {
        return "Można wyposażyć";
    }

    if (item.type === "badge") {
        return "Zdobyta odznaka";
    }

    return "Element kolekcjonerski";
}

function createItemSelectRow(userId, viewModel) {
    const items = viewModel.selectableItems.slice(0, MAX_SELECT_OPTIONS);

    if (!items.length) {
        return null;
    }

    const menu = new StringSelectMenuBuilder()
        .setCustomId(createInventoryCustomId(["item", userId, viewModel.category, viewModel.page]))
        .setPlaceholder("Wybierz przedmiot")
        .addOptions(items.map((item) => ({
            label: limitSelectText(item.name),
            value: item.code,
            description: limitSelectText(getItemSelectDescription(item)),
            default: item.code === viewModel.selectedItemCode
        })));

    return new ActionRowBuilder().addComponents(menu);
}

function createInventoryViewModel(member, options = {}) {
    const selectedCategory = getValidInventoryCategory(options.category);
    const inventoryView = getInventoryView(member, options);
    const page = Math.max(0, Number(options.page) || 0);
    const selectedItemCode = String(options.selectedItemCode || options.itemCode || "").trim();
    const totalAvailableItems = options.totalAvailableItems
        || INITIAL_SHOP_ITEMS.length + AVAILABLE_BADGE_COUNT;
    const screenData = normalizeInventoryScreenData({
        category: selectedCategory,
        page,
        playerPP: inventoryView.user?.pp,
        selectedItemCode,
        sections: inventoryView.sections,
        totalAvailableItems,
        totalBadges: inventoryView.totalBadges,
        totalShopItems: inventoryView.totalShopItems
    });
    const selectableItems = getSelectableItems(inventoryView, screenData.category);

    return {
        ...inventoryView,
        category: screenData.category,
        itemsOnPage: screenData.items,
        notice: options.notice || "",
        page: screenData.page,
        pageSize: INVENTORY_SCREEN_PAGE_SIZE,
        playerPP: screenData.playerPP,
        selectableItems,
        selectedItem: screenData.selectedItem,
        selectedItemCode: screenData.selectedItemCode,
        totalAvailableItems: screenData.totalAvailableItems,
        totalItemsInCategory: screenData.totalItems,
        totalPages: screenData.totalPages
    };
}

function createInventoryPayloadFromView(member, viewModel) {
    const userId = getMemberUserId(member);
    const imageBuffer = renderInventoryScreen({
        category: viewModel.category,
        page: viewModel.page,
        playerPP: viewModel.playerPP,
        selectedItemCode: viewModel.selectedItemCode,
        sections: viewModel.sections,
        totalAvailableItems: viewModel.totalAvailableItems,
        totalBadges: viewModel.totalBadges,
        totalShopItems: viewModel.totalShopItems
    });

    if (!Buffer.isBuffer(imageBuffer)) {
        throw new Error("Renderer ekwipunku nie zwrocil poprawnego Buffer PNG.");
    }

    const attachment = new AttachmentBuilder(imageBuffer, {
        name: "retroforma-ekwipunek.png"
    });

    return {
        attachments: [],
        components: [
            createCategorySelectRow(userId, viewModel.category),
            createItemSelectRow(userId, viewModel),
            createNavigationRow(userId, viewModel),
        ].filter(Boolean),
        content: viewModel.notice || "",
        embeds: [],
        files: [
            attachment
        ]
    };
}

function createInventoryPayload(member, options = {}) {
    return createInventoryPayloadFromView(
        member,
        createInventoryViewModel(member, options)
    );
}

module.exports = {
    INVENTORY_CATEGORIES,
    createInventoryCustomId,
    createInventoryPayload,
    createInventoryPayloadFromView,
    createInventoryViewModel,
    parseInventoryCustomId
};
