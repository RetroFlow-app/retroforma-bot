const { createAdminPointsRepository } = require("./adminPointsRepository");

const ADMIN_POINT_OPERATIONS = {
    ADD: "dodaj",
    SUBTRACT: "odejmij",
    SET: "ustaw"
};

const ADMIN_POINT_ERRORS = {
    AMOUNT_TOO_LARGE: "AMOUNT_TOO_LARGE",
    BOT_TARGET: "BOT_TARGET",
    INSUFFICIENT_PP: "INSUFFICIENT_PP",
    INVALID_AMOUNT: "INVALID_AMOUNT",
    INVALID_OPERATION: "INVALID_OPERATION",
    USER_NOT_FOUND: "USER_NOT_FOUND"
};

const MAX_ADMIN_POINT_AMOUNT = 1_000_000;
const MAX_REASON_LENGTH = 500;

class AdminPointError extends Error {
    constructor(code, message, details = {}) {
        super(message);
        this.name = "AdminPointError";
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

function getSafeBalance(value) {
    const numberValue = Number(value);

    if (!Number.isSafeInteger(numberValue)) {
        return 0;
    }

    return Math.max(0, numberValue);
}

function normalizeAmount(amount) {
    const numberValue = Number(amount);

    if (!Number.isSafeInteger(numberValue) || numberValue <= 0) {
        throw new AdminPointError(
            ADMIN_POINT_ERRORS.INVALID_AMOUNT,
            "Ilość PP musi być dodatnią liczbą całkowitą."
        );
    }

    if (numberValue > MAX_ADMIN_POINT_AMOUNT) {
        throw new AdminPointError(
            ADMIN_POINT_ERRORS.AMOUNT_TOO_LARGE,
            `Maksymalna wartość jednej operacji to ${MAX_ADMIN_POINT_AMOUNT} PP.`
        );
    }

    return numberValue;
}

function normalizeOperation(operation) {
    const normalizedOperation = String(operation || "").trim().toLowerCase();
    const allowedOperations = Object.values(ADMIN_POINT_OPERATIONS);

    if (!allowedOperations.includes(normalizedOperation)) {
        throw new AdminPointError(
            ADMIN_POINT_ERRORS.INVALID_OPERATION,
            "Nieprawidłowa operacja na Punktach Poligonu."
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

function getDiscordUser(member) {
    return member.user || member;
}

function assertTargetCanReceiveAdminPoints(targetUser) {
    if (targetUser?.bot) {
        throw new AdminPointError(
            ADMIN_POINT_ERRORS.BOT_TARGET,
            "Boty nie mogą być celem administracyjnej operacji PP."
        );
    }
}

function getBalanceAfterOperation({ amount, balanceBefore, operation }) {
    if (operation === ADMIN_POINT_OPERATIONS.ADD) {
        const balanceAfter = balanceBefore + amount;

        if (!Number.isSafeInteger(balanceAfter)) {
            throw new AdminPointError(
                ADMIN_POINT_ERRORS.AMOUNT_TOO_LARGE,
                "Nowe saldo przekracza bezpieczny limit liczbowy."
            );
        }

        return balanceAfter;
    }

    if (operation === ADMIN_POINT_OPERATIONS.SUBTRACT) {
        if (balanceBefore < amount) {
            throw new AdminPointError(
                ADMIN_POINT_ERRORS.INSUFFICIENT_PP,
                [
                    "❌ Użytkownik nie posiada wystarczającej liczby PP.",
                    `Aktualne saldo: ${balanceBefore} PP.`
                ].join("\n"),
                {
                    balanceBefore
                }
            );
        }

        return balanceBefore - amount;
    }

    return amount;
}

function applyBalanceUpdate({ amount, internalUserId, operation, repository }) {
    if (operation === ADMIN_POINT_OPERATIONS.ADD) {
        return repository.addBalance({
            amount,
            internalUserId
        });
    }

    if (operation === ADMIN_POINT_OPERATIONS.SUBTRACT) {
        return repository.subtractBalance({
            amount,
            internalUserId
        });
    }

    return repository.setBalance({
        amount,
        internalUserId
    });
}

function createAdminPointsService(options = {}) {
    const database = options.db || getDefaultDb();
    const getOrCreateUser = options.getOrCreateUser || getDefaultGetOrCreateUser();
    const repository = options.repository || createAdminPointsRepository(database);

    const changePointsTransaction = database.transaction(({
        adminUser,
        amount,
        operation,
        reason,
        targetUser
    }) => {
        const user = getOrCreateUser(targetUser);
        const currentUser = repository.getUserByInternalId(user.id);

        if (!currentUser) {
            throw new AdminPointError(
                ADMIN_POINT_ERRORS.USER_NOT_FOUND,
                "Nie udało się znaleźć lub utworzyć użytkownika w bazie."
            );
        }

        const balanceBefore = getSafeBalance(currentUser.pp);
        const balanceAfter = getBalanceAfterOperation({
            amount,
            balanceBefore,
            operation
        });
        const updateResult = applyBalanceUpdate({
            amount,
            internalUserId: currentUser.id,
            operation,
            repository
        });

        if (updateResult.changes !== 1) {
            throw new AdminPointError(
                ADMIN_POINT_ERRORS.INSUFFICIENT_PP,
                [
                    "❌ Użytkownik nie posiada wystarczającej liczby PP.",
                    `Aktualne saldo: ${balanceBefore} PP.`
                ].join("\n"),
                {
                    balanceBefore
                }
            );
        }

        repository.saveTransaction({
            // targetUserId to wewnętrzne users.id z SQLite, nie Discord snowflake.
            targetUserId: currentUser.id,
            targetDiscordId: currentUser.discord_id,
            adminDiscordId: adminUser.id,
            operation,
            amount,
            balanceBefore,
            balanceAfter,
            reason,
            createdAt: new Date().toISOString()
        });

        return {
            amount,
            balanceAfter,
            balanceBefore,
            operation,
            reason,
            targetDiscordId: currentUser.discord_id,
            targetUserId: currentUser.id,
            user: repository.getUserByInternalId(currentUser.id)
        };
    });

    function changePoints({ adminUser, amount, operation, reason, targetUser }) {
        const discordTargetUser = getDiscordUser(targetUser);

        assertTargetCanReceiveAdminPoints(discordTargetUser);

        return changePointsTransaction({
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
        changePoints,
        listHistory
    };
}

module.exports = {
    ADMIN_POINT_ERRORS,
    ADMIN_POINT_OPERATIONS,
    AdminPointError,
    MAX_ADMIN_POINT_AMOUNT,
    createAdminPointsService,
    normalizeAmount,
    normalizeOperation,
    normalizeReason
};
