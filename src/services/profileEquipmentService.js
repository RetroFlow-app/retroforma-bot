const { resolveUiAsset } = require("../ui/assetRegistry");
const { EQUIPMENT_SLOTS } = require("./inventoryService");

const PROFILE_EQUIPMENT_CONFIG = {
    frame: {
        category: "ramki",
        slot: EQUIPMENT_SLOTS.PROFILE_FRAME
    },
    theme: {
        category: "motywy-profilu",
        slot: EQUIPMENT_SLOTS.PROFILE_THEME
    }
};

function createEmptyProfileEquipment() {
    return {
        frame: null,
        theme: null
    };
}

function mapEquipmentRow(row) {
    return {
        category: row.category,
        code: row.code,
        itemId: row.item_id,
        name: row.name,
        slot: row.slot,
        updatedAt: row.updated_at
    };
}

// Pobiera tylko aktywne wyposażenie, które gracz faktycznie posiada w user_inventory.
function getProfileEquipment(database, internalUserId) {
    const equipment = createEmptyProfileEquipment();

    if (!database || !internalUserId) {
        return equipment;
    }

    const rows = database.prepare(`
        SELECT
            ue.slot,
            ue.item_id,
            ue.updated_at,
            si.code,
            si.name,
            si.category
        FROM user_equipment ue
        INNER JOIN shop_items si
            ON si.id = ue.item_id
        INNER JOIN user_inventory ui
            ON ui.user_id = ue.user_id
           AND ui.item_id = ue.item_id
        WHERE ue.user_id = ?
          AND si.active = 1
          AND ue.slot IN (?, ?)
    `).all(
        internalUserId,
        PROFILE_EQUIPMENT_CONFIG.theme.slot,
        PROFILE_EQUIPMENT_CONFIG.frame.slot
    );

    for (const row of rows) {
        if (
            row.slot === PROFILE_EQUIPMENT_CONFIG.theme.slot
            && row.category === PROFILE_EQUIPMENT_CONFIG.theme.category
        ) {
            equipment.theme = mapEquipmentRow(row);
            continue;
        }

        if (
            row.slot === PROFILE_EQUIPMENT_CONFIG.frame.slot
            && row.category === PROFILE_EQUIPMENT_CONFIG.frame.category
        ) {
            equipment.frame = mapEquipmentRow(row);
        }
    }

    return equipment;
}

function resolveProfileEquipmentAsset(item, expectedCategory) {
    if (!item || item.category !== expectedCategory || !item.code) {
        return null;
    }

    const asset = resolveUiAsset("item", item.code);

    if (!asset.mapped || !asset.path) {
        return null;
    }

    return asset;
}

function resolveProfileThemeAsset(equipment) {
    return resolveProfileEquipmentAsset(
        equipment?.theme,
        PROFILE_EQUIPMENT_CONFIG.theme.category
    );
}

function resolveProfileFrameAsset(equipment) {
    return resolveProfileEquipmentAsset(
        equipment?.frame,
        PROFILE_EQUIPMENT_CONFIG.frame.category
    );
}

module.exports = {
    PROFILE_EQUIPMENT_CONFIG,
    createEmptyProfileEquipment,
    getProfileEquipment,
    resolveProfileFrameAsset,
    resolveProfileThemeAsset
};
