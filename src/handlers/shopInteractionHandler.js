const { SHOP_PURCHASE_ERRORS, purchaseItem } = require("../services/shopService");
const {
    createShopPayload,
    parseShopCustomId
} = require("../services/shopViewService");

function getInteractionMember(interaction) {
    return interaction.member || interaction.user;
}

function createSuccessNotice(result) {
    return {
        type: "success",
        title: "✅ Zakup udany",
        lines: [
            `Przedmiot: ${result.item.name}`,
            `Koszt: ${result.item.price} PP`,
            `Pozostałe PP: ${result.remainingPp}`
        ]
    };
}

function createErrorNotice(error) {
    const messages = {
        [SHOP_PURCHASE_ERRORS.INSUFFICIENT_PP]: "Masz za mało PP.",
        [SHOP_PURCHASE_ERRORS.ALREADY_OWNED]: "Ten przedmiot jest już w Twoim inventory.",
        [SHOP_PURCHASE_ERRORS.ITEM_UNAVAILABLE]: "Ten przedmiot jest niedostępny.",
        [SHOP_PURCHASE_ERRORS.PURCHASE_FAILED]: "Zakup nie powiódł się."
    };

    return {
        type: "error",
        title: "❌ Nie kupiono przedmiotu",
        lines: [
            messages[error.code] || "Zakup nie powiódł się."
        ]
    };
}

async function replyWrongUser(interaction) {
    await interaction.reply({
        content: "To nie jest Twój panel sklepu.",
        ephemeral: true
    });
}

async function handleCategorySelect(interaction, shopInteraction) {
    const selectedCategory = interaction.values[0] || "all";

    await interaction.update(
        createShopPayload(getInteractionMember(interaction), {
            category: selectedCategory,
            page: 0
        })
    );
}

async function handlePageButton(interaction, shopInteraction) {
    await interaction.update(
        createShopPayload(getInteractionMember(interaction), {
            category: shopInteraction.category,
            page: shopInteraction.page
        })
    );
}

async function handleBuyButton(interaction, shopInteraction) {
    let notice;

    try {
        const result = purchaseItem(
            getInteractionMember(interaction),
            shopInteraction.itemCode
        );

        notice = createSuccessNotice(result);
    } catch (error) {
        if (!error.code || !Object.values(SHOP_PURCHASE_ERRORS).includes(error.code)) {
            console.error(`Błąd zakupu w sklepie: ${error.message}`);
        }

        notice = createErrorNotice(error);
    }

    await interaction.update(
        createShopPayload(getInteractionMember(interaction), {
            category: shopInteraction.category,
            page: shopInteraction.page,
            notice
        })
    );
}

async function handleShopInteraction(interaction) {
    if (!interaction.isButton() && !interaction.isStringSelectMenu()) {
        return false;
    }

    const shopInteraction = parseShopCustomId(interaction.customId);

    if (!shopInteraction) {
        return false;
    }

    if (shopInteraction.userId !== interaction.user.id) {
        await replyWrongUser(interaction);
        return true;
    }

    if (shopInteraction.action === "category" && interaction.isStringSelectMenu()) {
        await handleCategorySelect(interaction, shopInteraction);
        return true;
    }

    if (shopInteraction.action === "page" && interaction.isButton()) {
        await handlePageButton(interaction, shopInteraction);
        return true;
    }

    if (shopInteraction.action === "buy" && interaction.isButton()) {
        await handleBuyButton(interaction, shopInteraction);
        return true;
    }

    return false;
}

module.exports = {
    handleShopInteraction
};
