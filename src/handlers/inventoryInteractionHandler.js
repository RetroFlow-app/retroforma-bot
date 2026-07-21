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

async function handleCategorySelect(interaction) {
    const selectedCategory = interaction.values[0] || "all";

    await interaction.deferUpdate();
    await interaction.editReply(
        createInventoryPayload(getInteractionMember(interaction), {
            category: selectedCategory,
            page: 0
        })
    );
}

async function handlePageButton(interaction, inventoryInteraction) {
    await interaction.deferUpdate();
    await interaction.editReply(
        createInventoryPayload(getInteractionMember(interaction), {
            category: inventoryInteraction.category,
            page: inventoryInteraction.page
        })
    );
}

async function handleEquipSelect(interaction, inventoryInteraction) {
    const itemCode = interaction.values[0];

    await interaction.deferUpdate();

    try {
        equipInventoryItem(getInteractionMember(interaction), itemCode, {
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
            category: inventoryInteraction.category,
            page: inventoryInteraction.page
        })
    );
}

async function handleInventoryInteraction(interaction) {
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
            await handleCategorySelect(interaction);
            return true;
        }

        if (inventoryInteraction.action === "page" && interaction.isButton()) {
            await handlePageButton(interaction, inventoryInteraction);
            return true;
        }

        if (inventoryInteraction.action === "equip" && interaction.isStringSelectMenu()) {
            await handleEquipSelect(interaction, inventoryInteraction);
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
