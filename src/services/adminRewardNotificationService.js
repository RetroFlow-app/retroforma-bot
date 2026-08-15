const {
    createAdminPpRewardNotificationEmbed,
    createAdminXpRewardNotificationEmbed
} = require("../utils/embedFactory");

const ADMIN_REWARD_NOTIFICATION_FAILED_MESSAGE = "⚠️ Nagroda została przyznana, ale nie udało się wysłać użytkownikowi wiadomości prywatnej.";

async function resolveRecipientUser({ client, targetUser }) {
    if (typeof targetUser?.send === "function") {
        return targetUser;
    }

    if (targetUser?.id && typeof client?.users?.fetch === "function") {
        return client.users.fetch(targetUser.id);
    }

    return null;
}

function createRewardEmbed({ result, type }) {
    if (type === "PP") {
        return createAdminPpRewardNotificationEmbed({
            amount: result.amount,
            balanceAfter: result.balanceAfter,
            reason: result.reason
        });
    }

    return createAdminXpRewardNotificationEmbed({
        amount: result.amount,
        levelAfter: result.levelAfter,
        levelBefore: result.levelBefore,
        reason: result.reason,
        xpAfter: result.xpAfter,
        xpBefore: result.xpBefore
    });
}

// Wysyła prywatną informację o dodatkowej nagrodzie już po udanej transakcji w bazie.
async function sendAdminRewardNotification({
    client,
    logger = console,
    result,
    targetUser,
    type
}) {
    try {
        const recipientUser = await resolveRecipientUser({
            client,
            targetUser
        });

        if (!recipientUser) {
            throw new Error("Nie znaleziono użytkownika Discord do wysłania DM.");
        }

        await recipientUser.send({
            embeds: [
                createRewardEmbed({
                    result,
                    type
                })
            ]
        });

        return {
            delivered: true
        };
    } catch (error) {
        logger.error(
            `[ADMIN_REWARD_NOTIFICATION] DM delivery failed for user ${targetUser?.id || result?.targetDiscordId || "unknown"}: ${error.stack || error.message}`
        );

        return {
            delivered: false,
            error
        };
    }
}

module.exports = {
    ADMIN_REWARD_NOTIFICATION_FAILED_MESSAGE,
    sendAdminRewardNotification
};
