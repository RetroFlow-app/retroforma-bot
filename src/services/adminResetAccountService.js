const { createAdminResetAccountRepository } = require("./adminResetAccountRepository");

const ADMIN_RESET_SCOPES = {
    ALL: "wszystko",
    POINTS_ONLY: "tylko-pp",
    PROFILE_ONLY: "tylko-profil",
    SHOP_ONLY: "tylko-sklep"
};

const ADMIN_RESET_ERRORS = {
    BOT_TARGET: "BOT_TARGET",
    INVALID_SCOPE: "INVALID_SCOPE",
    USER_NOT_FOUND: "USER_NOT_FOUND"
};

const MAX_REASON_LENGTH = 500;

class AdminResetAccountError extends Error {
    constructor(code, message, details = {}) {
        super(message);
        this.name = "AdminResetAccountError";
        this.code = code;
        this.details = details;
    }
}

function getDefaultDb() {
    return require("../database/db");
}

function getDefaultGetOrCreateUser() {
    return require("./pointsService").getOrCreateUser;
}

function getDiscordUser(member) {
    return member.user || member;
}

function normalizeScope(scope) {
    const normalizedScope = String(scope || "").trim().toLowerCase();
    const allowedScopes = Object.values(ADMIN_RESET_SCOPES);

    if (!allowedScopes.includes(normalizedScope)) {
        throw new AdminResetAccountError(
            ADMIN_RESET_ERRORS.INVALID_SCOPE,
            "Nieprawidlowy zakres resetu konta."
        );
    }

    return normalizedScope;
}

function normalizeReason(reason) {
    const normalizedReason = String(reason || "").trim();

    if (!normalizedReason) {
        return "Nie podano";
    }

    return normalizedReason.slice(0, MAX_REASON_LENGTH);
}

function assertTargetCanBeReset(targetUser) {
    if (targetUser?.bot) {
        throw new AdminResetAccountError(
            ADMIN_RESET_ERRORS.BOT_TARGET,
            "Bot nie moze byc celem resetu konta."
        );
    }
}

function createEmptyChangeSummary() {
    return {
        arsenalItemsDeleted: 0,
        arsenalLoadoutDeleted: 0,
        badgesDeleted: 0,
        equipmentDeleted: 0,
        inventoryDeleted: 0,
        pointsReset: false,
        profileReset: false,
        submissionsDeleted: 0
    };
}

function applyShopReset(repository, user, changes) {
    changes.inventoryDeleted += repository.deleteInventory(user.id).changes;
    changes.equipmentDeleted += repository.deleteEquipment(user.id).changes;
    changes.arsenalItemsDeleted += repository.deleteArsenalItems(user.discord_id).changes;
    changes.arsenalLoadoutDeleted += repository.deleteArsenalLoadout(user.discord_id).changes;
}

function applyScopeReset(repository, user, scope) {
    const changes = createEmptyChangeSummary();

    if (scope === ADMIN_RESET_SCOPES.ALL || scope === ADMIN_RESET_SCOPES.POINTS_ONLY) {
        repository.resetPoints(user.id);
        changes.pointsReset = true;
    }

    if (scope === ADMIN_RESET_SCOPES.ALL || scope === ADMIN_RESET_SCOPES.PROFILE_ONLY) {
        repository.resetProfileStats(user.id);
        changes.profileReset = true;
    }

    if (scope === ADMIN_RESET_SCOPES.ALL || scope === ADMIN_RESET_SCOPES.SHOP_ONLY) {
        applyShopReset(repository, user, changes);
    }

    if (scope === ADMIN_RESET_SCOPES.ALL) {
        changes.badgesDeleted += repository.deleteUserBadges(user.discord_id).changes;
        changes.submissionsDeleted += repository.deleteSubmissions(user.discord_id).changes;
    }

    return changes;
}

function createAdminResetAccountService(options = {}) {
    const database = options.db || getDefaultDb();
    const getOrCreateUser = options.getOrCreateUser || getDefaultGetOrCreateUser();
    const repository = options.repository || createAdminResetAccountRepository(database);

    const resetAccountTransaction = database.transaction(({
        adminUser,
        reason,
        scope,
        targetUser
    }) => {
        const user = getOrCreateUser(targetUser);
        const currentUser = repository.getUserByInternalId(user.id);

        if (!currentUser) {
            throw new AdminResetAccountError(
                ADMIN_RESET_ERRORS.USER_NOT_FOUND,
                "Nie udalo sie znalezc lub utworzyc uzytkownika w bazie."
            );
        }

        const changes = applyScopeReset(repository, currentUser, scope);

        repository.saveTransaction({
            // targetUserId to wewnetrzne users.id z SQLite, nie Discord snowflake.
            targetUserId: currentUser.id,
            targetDiscordId: currentUser.discord_id,
            adminDiscordId: adminUser.id,
            scope,
            reason,
            createdAt: new Date().toISOString()
        });

        return {
            changes,
            reason,
            scope,
            targetDiscordId: currentUser.discord_id,
            targetUserId: currentUser.id,
            user: repository.getUserByInternalId(currentUser.id)
        };
    });

    function resetAccount({ adminUser, reason, scope, targetUser }) {
        const discordTargetUser = getDiscordUser(targetUser);

        assertTargetCanBeReset(discordTargetUser);

        return resetAccountTransaction({
            adminUser: getDiscordUser(adminUser),
            reason: normalizeReason(reason),
            scope: normalizeScope(scope),
            targetUser: discordTargetUser
        });
    }

    function listHistory(options = {}) {
        return repository.listTransactions(options);
    }

    return {
        listHistory,
        resetAccount
    };
}

module.exports = {
    ADMIN_RESET_ERRORS,
    ADMIN_RESET_SCOPES,
    AdminResetAccountError,
    createAdminResetAccountService,
    normalizeReason,
    normalizeScope
};
