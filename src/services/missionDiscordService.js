const path = require("path");
const { AttachmentBuilder } = require("discord.js");

const config = require("../config/appConfig");
const { logToChannel } = require("./logger");
const {
    getMission,
    markMissionPublished
} = require("./missionService");
const { createMissionEmbed } = require("../utils/embedFactory");

const SUBMISSION_END_NOTICE = "🔒 Przyjmowanie zgłoszeń do tej misji zostało zakończone.";
const DISCORD_UNKNOWN_MESSAGE_CODE = 10008;
const MISSION_MESSAGE_LOOKBACK_GRACE_MS = 60 * 60 * 1000;

// Tworzy gotową wiadomość Discord z misją i załącznikiem.
function createMissionMessagePayload(mission) {
    if (!mission.imagePath) {
        throw new Error(`Nie znaleziono obrazka dla misji ${mission.number}.`);
    }

    const attachmentName = `misja-${mission.number}${path.extname(mission.imagePath)}`;
    const attachment = new AttachmentBuilder(mission.imagePath, {
        name: attachmentName
    });

    return {
        embeds: [
            createMissionEmbed(mission, {
                attachmentName
            })
        ],
        files: [attachment]
    };
}

function getMissionNumber(mission) {
    return mission.number || String(mission.id).padStart(3, "0");
}

function escapeRegex(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function getMissionChannel(client) {
    const channel = await client.channels.fetch(config.missionChannelId);

    if (!channel) {
        throw new Error("Nie znaleziono kanału misji.");
    }

    return channel;
}

function messageContainsMissionNumber(message, missionNumber) {
    const escapedMissionNumber = escapeRegex(missionNumber);
    const missionTitlePattern = new RegExp(`MISJA\\s+CAD\\s+#${escapedMissionNumber}(?!\\d)`, "i");
    const missionAttachmentPattern = new RegExp(`(^|[/\\\\])misja-${escapedMissionNumber}\\.(png|jpe?g|webp)(\\?|$)`, "i");
    const embeds = Array.isArray(message.embeds) ? message.embeds : [];
    const attachments = message.attachments && typeof message.attachments.values === "function"
        ? Array.from(message.attachments.values())
        : [];
    const textParts = [
        message.content || "",
        ...embeds.flatMap((embed) => [
            embed.title || "",
            embed.description || ""
        ])
    ];
    const attachmentParts = attachments.flatMap((attachment) => [
        attachment.name || "",
        attachment.url || ""
    ]);

    return textParts.some((textPart) => missionTitlePattern.test(String(textPart)))
        || attachmentParts.some((attachmentPart) => missionAttachmentPattern.test(String(attachmentPart)));
}

function isMissionMessageFromCurrentBot(client, message) {
    return Boolean(client.user && message.author && message.author.id === client.user.id);
}

function getPublishTimestampWithGrace(mission) {
    if (!mission.publishAt) {
        return null;
    }

    const publishTimestamp = new Date(mission.publishAt).getTime();

    if (Number.isNaN(publishTimestamp)) {
        return null;
    }

    return publishTimestamp - MISSION_MESSAGE_LOOKBACK_GRACE_MS;
}

// Pobiera wiadomość opublikowanej misji, jeśli nadal istnieje na Discordzie.
async function fetchMissionMessage(client, messageId) {
    if (!messageId) {
        return null;
    }

    const channel = await getMissionChannel(client);

    try {
        return await channel.messages.fetch(messageId);
    } catch (error) {
        if (error.code === DISCORD_UNKNOWN_MESSAGE_CODE || error.status === 404) {
            return null;
        }

        throw error;
    }
}

// Sprawdza, czy zapisana wiadomość misji nadal istnieje na kanale misji.
async function missionMessageExists(client, messageId) {
    return Boolean(await fetchMissionMessage(client, messageId));
}

// Próbuje odnaleźć wiadomość misji na kanale, gdy lokalny messageId zniknął po deployu.
async function findPublishedMissionMessage(client, mission) {
    const channel = await getMissionChannel(client);
    const missionNumber = getMissionNumber(mission);
    const oldestAllowedTimestamp = getPublishTimestampWithGrace(mission);
    let before = null;

    while (true) {
        const fetchOptions = {
            limit: 100
        };

        if (before) {
            fetchOptions.before = before;
        }

        const messages = await channel.messages.fetch(fetchOptions);

        if (messages.size === 0) {
            return null;
        }

        const foundMessage = messages.find((message) => (
            isMissionMessageFromCurrentBot(client, message)
            && messageContainsMissionNumber(message, missionNumber)
        ));

        if (foundMessage) {
            return foundMessage;
        }

        const oldestMessage = messages.last();

        if (!oldestMessage) {
            return null;
        }

        if (oldestAllowedTimestamp && oldestMessage.createdTimestamp < oldestAllowedTimestamp) {
            return null;
        }

        before = oldestMessage.id;
    }
}

function persistMissionPublicationState(mission, messageId) {
    const { saveMissionPublication } = require("./missionPublicationRepository");
    const missionNumber = getMissionNumber(mission);
    let updatedMission = {
        ...mission,
        number: missionNumber,
        published: true,
        messageId
    };
    let savedAnywhere = false;

    try {
        saveMissionPublication({
            missionId: mission.id,
            missionNumber,
            messageId,
            publishAt: mission.publishAt,
            closeAt: mission.closeAt
        });
        savedAnywhere = true;
    } catch (error) {
        console.error(`Nie udało się zapisać publikacji misji #${missionNumber} w SQLite: ${error.message}`);
    }

    try {
        updatedMission = markMissionPublished(mission.id, messageId, {
            publishAt: mission.publishAt,
            closeAt: mission.closeAt
        });
        savedAnywhere = true;
    } catch (error) {
        console.error(`Nie udało się zapisać publikacji misji #${missionNumber} w mission.json: ${error.message}`);
    }

    if (!savedAnywhere) {
        throw new Error(`Nie udało się zapisać stanu publikacji misji #${missionNumber}.`);
    }

    return updatedMission;
}

// Publikuje wskazaną misję na kanale Discord i zapisuje messageId w SQLite oraz mission.json.
async function publishMission(client, missionOrId) {
    if (!config.missionChannelId) {
        throw new Error("Brak missionChannelId w config.json.");
    }

    const mission = typeof missionOrId === "object" ? missionOrId : getMission(missionOrId);
    const channel = await getMissionChannel(client);
    const message = await channel.send(createMissionMessagePayload(mission));
    const updatedMission = persistMissionPublicationState(mission, message.id);

    await logToChannel(
        client,
        `📌 Opublikowano misję CAD #${updatedMission.number}: ${updatedMission.title || "bez tytułu"}`
    );

    return updatedMission;
}

// Dopisuje informację o zakończeniu zgłoszeń do opublikowanej wiadomości misji.
async function appendSubmissionEndNotice(client, mission) {
    if (!mission.messageId) {
        return;
    }

    try {
        const message = await fetchMissionMessage(client, mission.messageId);

        if (!message) {
            return;
        }

        const firstEmbed = message.embeds[0];

        await message.edit({
            content: null,
            embeds: [
                createMissionEmbed(mission, {
                    existingEmbed: firstEmbed,
                    notice: SUBMISSION_END_NOTICE
                })
            ]
        });
    } catch (error) {
        console.error(`Nie udało się edytować wiadomości misji #${mission.number}: ${error.message}`);
    }
}

// Loguje zamknięcie misji na kanale logów.
async function logMissionClosed(client, mission) {
    await logToChannel(
        client,
        `🔒 Misja CAD #${mission.number} została zakończona.`
    );
}

module.exports = {
    appendSubmissionEndNotice,
    findPublishedMissionMessage,
    fetchMissionMessage,
    logMissionClosed,
    missionMessageExists,
    publishMission
};
