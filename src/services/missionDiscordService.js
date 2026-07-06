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

// Publikuje wskazaną misję na kanale Discord i zapisuje messageId w mission.json.
async function publishMission(client, missionOrId) {
    if (!config.missionChannelId) {
        throw new Error("Brak missionChannelId w config.json.");
    }

    const mission = typeof missionOrId === "object" ? missionOrId : getMission(missionOrId);
    const channel = await client.channels.fetch(config.missionChannelId);

    if (!channel) {
        throw new Error("Nie znaleziono kanału misji.");
    }

    const message = await channel.send(createMissionMessagePayload(mission));
    const updatedMission = markMissionPublished(mission.id, message.id, {
        publishAt: mission.publishAt,
        closeAt: mission.closeAt
    });

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
        const channel = await client.channels.fetch(config.missionChannelId);
        const message = await channel.messages.fetch(mission.messageId);
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
    logMissionClosed,
    publishMission
};
