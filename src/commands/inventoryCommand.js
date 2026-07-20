const {
    ActionRowBuilder,
    SlashCommandBuilder,
    StringSelectMenuBuilder
} = require("discord.js");

const {
    EMPTY_INVENTORY_SECTION_TEXT,
    EQUIPMENT_SLOTS,
    getInventoryView
} = require("../services/inventoryService");
const { createInfoEmbed } = require("../utils/embedFactory");

const MAX_FIELD_LENGTH = 1024;
const MAX_SELECT_OPTIONS = 25;

const EQUIPMENT_SELECTS = [
    {
        sectionId: "motywy-profilu",
        slot: EQUIPMENT_SLOTS.PROFILE_THEME,
        placeholder: "Wyposaż motyw profilu"
    },
    {
        sectionId: "ramki",
        slot: EQUIPMENT_SLOTS.PROFILE_FRAME,
        placeholder: "Wyposaż ramkę profilu"
    }
];

function limitFieldValue(value) {
    if (value.length <= MAX_FIELD_LENGTH) {
        return value;
    }

    return `${value.slice(0, MAX_FIELD_LENGTH - 20).trim()}\n...`;
}

function limitSelectText(value, maxLength = 100) {
    const text = String(value || "").trim();

    if (text.length <= maxLength) {
        return text;
    }

    return `${text.slice(0, maxLength - 1).trim()}…`;
}

function formatShopItem(item) {
    const lines = [
        `• **${item.name}**`,
        `Rzadkość: ${item.rarity || "Nie podano"}`
    ];

    if (item.equipped) {
        lines.push("🟢 Wyposażone");
    } else if (item.equipmentSlot) {
        lines.push("Opcja: Wyposaż z menu poniżej");
    }

    return lines.join("\n");
}

function formatBadge(item) {
    if (!item.description) {
        return `• **${item.name}**`;
    }

    return [
        `• **${item.name}**`,
        item.description
    ].join("\n");
}

function formatInventorySection(section, emptyText = EMPTY_INVENTORY_SECTION_TEXT) {
    if (section.items.length === 0) {
        return emptyText;
    }

    const lines = section.items.map((item) => {
        if (item.type === "badge") {
            return formatBadge(item);
        }

        return formatShopItem(item);
    });

    return limitFieldValue(lines.join("\n\n"));
}

function createInventoryCustomId(userId, slot) {
    return `inventory:equip:${userId}:${slot}`;
}

function createEquipmentSelect(inventoryView, selectConfig) {
    const section = inventoryView.sections.find((entry) => entry.id === selectConfig.sectionId);
    const items = (section?.items || [])
        .filter((item) => item.equipmentSlot === selectConfig.slot)
        .slice(0, MAX_SELECT_OPTIONS);

    if (items.length === 0) {
        return null;
    }

    const menu = new StringSelectMenuBuilder()
        .setCustomId(createInventoryCustomId(inventoryView.discordUser.id, selectConfig.slot))
        .setPlaceholder(selectConfig.placeholder)
        .addOptions(items.map((item) => ({
            label: limitSelectText(item.name),
            value: item.code,
            description: limitSelectText(item.equipped ? "Aktywne wyposażenie" : "Wyposaż ten element", 100),
            default: Boolean(item.equipped)
        })));

    return new ActionRowBuilder().addComponents(menu);
}

function createInventoryComponents(inventoryView) {
    return EQUIPMENT_SELECTS
        .map((selectConfig) => createEquipmentSelect(inventoryView, selectConfig))
        .filter(Boolean);
}

function createInventoryPayload(inventoryView) {
    return {
        embeds: [
            createInventoryEmbed(inventoryView)
        ],
        components: createInventoryComponents(inventoryView)
    };
}

// Buduje embed kolekcji i oznacza aktywnie wyposażone elementy.
function createInventoryEmbed(inventoryView) {
    const description = [
        "Twoja kolekcja RetroForma Poligon.",
        "",
        "Możesz wyposażyć motyw i ramkę profilu. Gadżety oraz odznaki są na razie tylko przeglądem kolekcji."
    ].join("\n");

    return createInfoEmbed({
        title: "🎒 Ekwipunek Kadeta",
        description,
        fields: [
            {
                name: "📦 Posiadane elementy",
                value: String(inventoryView.totalItems),
                inline: true
            },
            {
                name: "🛒 Zakupy",
                value: String(inventoryView.totalShopItems),
                inline: true
            },
            {
                name: "🏅 Odznak zdobytych",
                value: String(inventoryView.totalBadges),
                inline: true
            },
            ...inventoryView.sections.map((section) => ({
                name: section.title,
                value: formatInventorySection(section, inventoryView.emptyText),
                inline: false
            }))
        ]
    });
}

module.exports = {
    createInventoryComponents,
    createInventoryCustomId,
    createInventoryEmbed,
    createInventoryPayload,
    data: new SlashCommandBuilder()
        .setName("ekwipunek")
        .setDescription("Pokaż swoją kolekcję i wyposaż motyw lub ramkę profilu."),

    // Komenda pokazuje kolekcję i pozwala zapisać aktywny motyw albo ramkę profilu.
    async execute(interaction, options = {}) {
        const member = interaction.member || interaction.user;
        const inventoryView = getInventoryView(member, options);

        await interaction.reply({
            ...createInventoryPayload(inventoryView),
            ephemeral: true
        });
    }
};
