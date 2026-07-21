const {
    createInventoryPayload,
    parseInventoryCustomId
} = require("../services/inventoryViewService");
const {
    EQUIPMENT_ERRORS,
    equipInventoryItem
} = require("../services/inventoryService");

const INVENTORY_COMPONENT_ERROR_MESSAGE = "Nie udało się odświeżyć ekwipunku. Spróbuj ponownie za chwilę.";

function getInteractionMember(interaction) {
    return interaction.member || interaction.user;
}

async function replyWrongUser(interaction) {
    await interaction.reply({
        content: "To nie jest Twój ekwipunek.",
        ephemeral: true
    });
}

function getEquipmentErrorMessage(error) {
    if (error.code === EQUIPMENT_ERRORS.ITEM_NOT_OWNED) {
        return "Nie posiadasz tego przedmiotu.";
    }

    if (error.code === EQUIPMENT_ERRORS.UNSUPPORTED_ITEM_TYPE) {
        return "Tego typu przedmiotu nie można jeszcze wyposażyć.";
    }

    return "Nie udało się wyposażyć przedmiotu.";
}

async function handleCategorySelect(interaction, options = {}) {
    const selectedCategory = interaction.values[0] || "all";

    await interaction.deferUpdate();
    await interaction.editReply(
        createInventoryPayload(getInteractionMember(interaction), {
            ...options,
            category: selectedCategory,
            page: 0
        })
    );
}

async function handleItemSelect(interaction, inventoryInteraction, options = {}) {
    const selectedItemCode = interaction.values[0];

    await interaction.deferUpdate();
    await interaction.editReply(
        createInventoryPayload(getInteractionMember(interaction), {
            ...options,
            category: inventoryInteraction.category,
            page: inventoryInteraction.page,
            selectedItemCode
        })
    );
}

async function handlePageButton(interaction, inventoryInteraction, options = {}) {
    await interaction.deferUpdate();
    await interaction.editReply(
        createInventoryPayload(getInteractionMember(interaction), {
            ...options,
            category: inventoryInteraction.category,
            page: inventoryInteraction.page
        })
    );
}

async function handleEquipInteraction(interaction, inventoryInteraction, options = {}) {
    const itemCode = inventoryInteraction.itemCode || interaction.values?.[0];
    let result;

    await interaction.deferUpdate();

    try {
        result = equipInventoryItem(getInteractionMember(interaction), itemCode, {
            ...options,
            expectedSlot: inventoryInteraction.slot
        });
    } catch (error) {
        if (!error.code || !Object.values(EQUIPMENT_ERRORS).includes(error.code)) {
            console.error("[INVENTORY] equip error");
            console.error(error?.stack || String(error));
        }

        await interaction.followUp({
            content: getEquipmentErrorMessage(error),
            ephemeral: true
        });
        return;
    }

    await interaction.editReply(
        createInventoryPayload(getInteractionMember(interaction), {
            ...options,
            category: inventoryInteraction.category,
            page: inventoryInteraction.page,
            selectedItemCode: itemCode
        })
    );
    await interaction.followUp({
        content: `✔ Wyposażono „${result.item.name}”.`,
        ephemeral: true
    });
}

async function handleInventoryInteraction(interaction, options = {}) {
    if (!interaction.isButton() && !interaction.isStringSelectMenu()) {
        return false;
    }

    const inventoryInteraction = parseInventoryCustomId(interaction.customId);

    if (!inventoryInteraction) {
        return false;
    }

    if (inventoryInteraction.userId !== interaction.user.id) {
        await replyWrongUser(interaction);
        return true;
    }

    try {
        if (inventoryInteraction.action === "category" && interaction.isStringSelectMenu()) {
            await handleCategorySelect(interaction, options);
            return true;
        }

        if (inventoryInteraction.action === "item" && interaction.isStringSelectMenu()) {
            await handleItemSelect(interaction, inventoryInteraction, options);
            return true;
        }

        if (inventoryInteraction.action === "page" && interaction.isButton()) {
            await handlePageButton(interaction, inventoryInteraction, options);
            return true;
        }

        if (inventoryInteraction.action === "equip" && (interaction.isButton() || interaction.isStringSelectMenu())) {
            await handleEquipInteraction(interaction, inventoryInteraction, options);
            return true;
        }
    } catch (error) {
        console.error("[INVENTORY] component error");
        console.error(error?.stack || String(error));

        if (interaction.deferred || interaction.replied) {
            await interaction.followUp({
                content: INVENTORY_COMPONENT_ERROR_MESSAGE,
                ephemeral: true
            });
        } else {
            await interaction.reply({
                content: INVENTORY_COMPONENT_ERROR_MESSAGE,
                ephemeral: true
            });
        }

        return true;
    }

    return false;
}

module.exports = {
    handleInventoryInteraction
};
