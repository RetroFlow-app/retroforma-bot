const {
    ActionRowBuilder,
    AttachmentBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder
} = require("discord.js");

const {
    EQUIPMENT_SLOTS,
    INVENTORY_SECTIONS,
    getInventoryView
} = require("./inventoryService");
const {
    INVENTORY_SCREEN_PAGE_SIZE,
    normalizeInventoryScreenData,
    renderInventoryScreen
} = require("../ui/templates/inventoryScreen");

const INVENTORY_CUSTOM_ID_PREFIX = "inventory";
const MAX_SELECT_OPTIONS = 25;

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

const EQUIPMENT_SELECTS = [
    {
        categoryId: "motywy-profilu",
        placeholder: "Wyposaż motyw profilu",
        slot: EQUIPMENT_SLOTS.PROFILE_THEME
    },
    {
        categoryId: "ramki",
        placeholder: "Wyposaż ramkę profilu",
        slot: EQUIPMENT_SLOTS.PROFILE_FRAME
    }
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

    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(createInventoryCustomId(["page", userId, viewModel.category, previousPage, "previous"]))
            .setLabel("Wstecz")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(viewModel.page <= 0),
        new ButtonBuilder()
            .setCustomId(createInventoryCustomId(["page", userId, viewModel.category, nextPage, "next"]))
            .setLabel("Dalej")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(viewModel.page >= viewModel.totalPages - 1)
    );
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

function shouldShowEquipmentSelect(selectedCategory, selectConfig) {
    return selectedCategory === "all" || selectedCategory === selectConfig.categoryId;
}

function createEquipmentSelectRow(userId, inventoryView, selectedCategory, page, selectConfig) {
    if (!shouldShowEquipmentSelect(selectedCategory, selectConfig)) {
        return null;
    }

    const items = getSectionItems(inventoryView, selectConfig.categoryId)
        .filter((item) => item.equipmentSlot === selectConfig.slot)
        .slice(0, MAX_SELECT_OPTIONS);

    if (!items.length) {
        return null;
    }

    const menu = new StringSelectMenuBuilder()
        .setCustomId(createInventoryCustomId(["equip", userId, selectedCategory, page, selectConfig.slot]))
        .setPlaceholder(selectConfig.placeholder)
        .addOptions(items.map((item) => ({
            label: limitSelectText(item.name),
            value: item.code,
            description: limitSelectText(item.equipped ? "Aktualnie wyposażone" : "Wyposaż ten element"),
            default: Boolean(item.equipped)
        })));

    return new ActionRowBuilder().addComponents(menu);
}

function createEquipmentSelectRows(userId, inventoryView, selectedCategory, page) {
    return EQUIPMENT_SELECTS
        .map((selectConfig) => createEquipmentSelectRow(userId, inventoryView, selectedCategory, page, selectConfig))
        .filter(Boolean);
}

function createInventoryViewModel(member, options = {}) {
    const selectedCategory = getValidInventoryCategory(options.category);
    const inventoryView = getInventoryView(member, options);
    const page = Math.max(0, Number(options.page) || 0);
    const screenData = normalizeInventoryScreenData({
        category: selectedCategory,
        page,
        playerPP: inventoryView.user?.pp,
        sections: inventoryView.sections,
        totalBadges: inventoryView.totalBadges,
        totalShopItems: inventoryView.totalShopItems
    });

    return {
        ...inventoryView,
        category: screenData.category,
        itemsOnPage: screenData.items,
        page: screenData.page,
        pageSize: INVENTORY_SCREEN_PAGE_SIZE,
        playerPP: screenData.playerPP,
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
        sections: viewModel.sections,
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
            createNavigationRow(userId, viewModel),
            ...createEquipmentSelectRows(userId, viewModel, viewModel.category, viewModel.page)
        ],
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
