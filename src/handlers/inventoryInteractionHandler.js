const {
    createInventoryPayload
} = require("../commands/inventoryCommand");
const {
    EQUIPMENT_ERRORS,
    equipInventoryItem,
    getInventoryView
} = require("../services/inventoryService");

const INVENTORY_CUSTOM_ID_PREFIX = "inventory";

function getInteractionMember(interaction) {
    return interaction.member || interaction.user;
}

function parseInventoryCustomId(customId) {
    const parts = String(customId || "").split(":");

    if (parts.length !== 4) {
        return null;
    }

    const [prefix, action, userId, slot] = parts;

    if (prefix !== INVENTORY_CUSTOM_ID_PREFIX || action !== "equip") {
        return null;
    }

    return {
        action,
        slot,
        userId
    };
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

async function handleInventoryInteraction(interaction, options = {}) {
    if (!interaction.isStringSelectMenu()) {
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

    const itemCode = interaction.values[0];

    try {
        equipInventoryItem(getInteractionMember(interaction), itemCode, {
            ...options,
            expectedSlot: inventoryInteraction.slot
        });
    } catch (error) {
        if (!error.code || !Object.values(EQUIPMENT_ERRORS).includes(error.code)) {
            console.error(`Błąd wyposażania ekwipunku: ${error.message}`);
        }

        await interaction.reply({
            content: getEquipmentErrorMessage(error),
            ephemeral: true
        });
        return true;
    }

    const inventoryView = getInventoryView(getInteractionMember(interaction), options);

    await interaction.update(
        createInventoryPayload(inventoryView)
    );

    return true;
}

module.exports = {
    handleInventoryInteraction,
    parseInventoryCustomId
};
