const { createAdminXpRepository } = require("./adminXpRepository");
const { getLevelFromXP } = require("./pointsService");

const ADMIN_XP_OPERATIONS = {
    ADD: "dodaj",
    SUBTRACT: "odejmij",
    SET: "ustaw"
};

const ADMIN_XP_ERRORS = {
    AMOUNT_TOO_LARGE: "AMOUNT_TOO_LARGE",
    BOT_TARGET: "BOT_TARGET",
    INVALID_AMOUNT: "INVALID_AMOUNT",
    INVALID_OPERATION: "INVALID_OPERATION",
    UPDATE_FAILED: "UPDATE_FAILED",
    USER_NOT_FOUND: "USER_NOT_FOUND"
};

const MAX_ADMIN_XP_AMOUNT = 1_000_000;
const MAX_REASON_LENGTH = 500;

class AdminXpError extends Error {
    constructor(code, message, details = {}) {
        super(message);
        this.name = "AdminXpError";
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

function getSafeXp(value) {
    const numberValue = Number(value);

    if (!Number.isSafeInteger(numberValue)) {
        return 0;
    }

    return Math.max(0, numberValue);
}

function normalizeAmount(amount) {
    const numberValue = Number(amount);

    if (!Number.isSafeInteger(numberValue) || numberValue <= 0) {
        throw new AdminXpError(
            ADMIN_XP_ERRORS.INVALID_AMOUNT,
            "Ilość XP musi być dodatnią liczbą całkowitą."
        );
    }

    if (numberValue > MAX_ADMIN_XP_AMOUNT) {
        throw new AdminXpError(
            ADMIN_XP_ERRORS.AMOUNT_TOO_LARGE,
            `Maksymalna wartość jednej operacji to ${MAX_ADMIN_XP_AMOUNT} XP.`
        );
    }

    return numberValue;
}

function normalizeOperation(operation) {
    const normalizedOperation = String(operation || "").trim().toLowerCase();
    const allowedOperations = Object.values(ADMIN_XP_OPERATIONS);

    if (!allowedOperations.includes(normalizedOperation)) {
        throw new AdminXpError(
            ADMIN_XP_ERRORS.INVALID_OPERATION,
            "Nieprawidłowa operacja na XP."
        );
    }

    return normalizedOperation;
}

function normalizeReason(reason) {
    const normalizedReason = String(reason || "").trim();

    if (!normalizedReason) {
        return "Nie podano";
    }

    return normalizedReason.slice(0, MAX_REASON_LENGTH);
}

function assertTargetCanReceiveAdminXp(targetUser) {
    if (targetUser?.bot) {
        throw new AdminXpError(
            ADMIN_XP_ERRORS.BOT_TARGET,
            "Boty nie mogą być celem administracyjnej operacji XP."
        );
    }
}

function getXpAfterOperation({ amount, operation, xpBefore }) {
    if (operation === ADMIN_XP_OPERATIONS.ADD) {
        const xpAfter = xpBefore + amount;

        if (!Number.isSafeInteger(xpAfter)) {
            throw new AdminXpError(
                ADMIN_XP_ERRORS.AMOUNT_TOO_LARGE,
                "Nowa liczba XP przekracza bezpieczny limit liczbowy."
            );
        }

        return xpAfter;
    }

    if (operation === ADMIN_XP_OPERATIONS.SUBTRACT) {
        return Math.max(0, xpBefore - amount);
    }

    return amount;
}

function createAdminXpService(options = {}) {
    const database = options.db || getDefaultDb();
    const getOrCreateUser = options.getOrCreateUser || getDefaultGetOrCreateUser();
    const repository = options.repository || createAdminXpRepository(database);

    const changeXpTransaction = database.transaction(({
        adminUser,
        amount,
        operation,
        reason,
        targetUser
    }) => {
        const user = getOrCreateUser(targetUser);
        const currentUser = repository.getUserByInternalId(user.id);

        if (!currentUser) {
            throw new AdminXpError(
                ADMIN_XP_ERRORS.USER_NOT_FOUND,
                "Nie udało się znaleźć lub utworzyć użytkownika w bazie."
            );
        }

        const xpBefore = getSafeXp(currentUser.xp);
        const levelBefore = Math.max(1, Number(currentUser.level) || getLevelFromXP(xpBefore));
        const xpAfter = getXpAfterOperation({
            amount,
            operation,
            xpBefore
        });
        const levelAfter = getLevelFromXP(xpAfter);
        const updateResult = repository.updateXpAndLevel({
            internalUserId: currentUser.id,
            level: levelAfter,
            xp: xpAfter
        });

        if (updateResult.changes !== 1) {
            throw new AdminXpError(
                ADMIN_XP_ERRORS.UPDATE_FAILED,
                "Nie udało się zaktualizować XP użytkownika."
            );
        }

        repository.saveTransaction({
            // targetUserId to wewnętrzne users.id z SQLite, nie Discord snowflake.
            targetUserId: currentUser.id,
            targetDiscordId: currentUser.discord_id,
            adminDiscordId: adminUser.id,
            operation,
            amount,
            xpBefore,
            xpAfter,
            levelBefore,
            levelAfter,
            reason,
            createdAt: new Date().toISOString()
        });

        const updatedUser = repository.getUserByInternalId(currentUser.id);

        return {
            amount,
            levelAfter,
            levelBefore,
            operation,
            reason,
            targetDiscordId: currentUser.discord_id,
            targetUserId: currentUser.id,
            user: updatedUser,
            xpAfter,
            xpBefore
        };
    });

    function changeXP({ adminUser, amount, operation, reason, targetUser }) {
        const discordTargetUser = getDiscordUser(targetUser);

        assertTargetCanReceiveAdminXp(discordTargetUser);

        return changeXpTransaction({
            adminUser: getDiscordUser(adminUser),
            amount: normalizeAmount(amount),
            operation: normalizeOperation(operation),
            reason: normalizeReason(reason),
            targetUser: discordTargetUser
        });
    }

    function listHistory(options = {}) {
        return repository.listTransactions(options);
    }

    return {
        changeXP,
        listHistory
    };
}

module.exports = {
    ADMIN_XP_ERRORS,
    ADMIN_XP_OPERATIONS,
    AdminXpError,
    MAX_ADMIN_XP_AMOUNT,
    createAdminXpService,
    normalizeAmount,
    normalizeOperation,
    normalizeReason
};
