const path = require("node:path");
const { AttachmentBuilder } = require("discord.js");

const {
    EXTREME_MISSION_CHANNEL_ID
} = require("./extremeMissionService");
const {
    createExtremeMissionEmbed,
    createLogEmbed
} = require("../utils/embedFactory");

async function fetchExtremeMissionChannel(client) {
    const channel = await client.channels.fetch(EXTREME_MISSION_CHANNEL_ID);

    if (!channel) {
        throw new Error("Nie znaleziono kanału publikacji Misji EXTREME.");
    }

    return channel;
}

function createExtremeAttachment(mission) {
    if (!mission.imagePath) {
        throw new Error(`Misja EXTREME #${mission.displayNumber} nie ma grafiki.`);
    }

    const extension = path.extname(mission.imagePath) || ".jpg";
    const attachmentName = `misja-extreme-${mission.displayNumber}${extension}`;

    return {
        attachment: new AttachmentBuilder(mission.imagePath, {
            name: attachmentName
        }),
        name: attachmentName
    };
}

async function publishExtremeMission(client, mission) {
    const channel = await fetchExtremeMissionChannel(client);
    const missionAttachment = createExtremeAttachment(mission);

    return channel.send({
        embeds: [
            createExtremeMissionEmbed(mission, {
                attachmentName: missionAttachment.name
            })
        ],
        files: [
            missionAttachment.attachment
        ]
    });
}

async function closeExtremeMission(client, mission) {
    const channel = await fetchExtremeMissionChannel(client);

    return channel.send({
        embeds: [
            createLogEmbed({
                title: `🔒 MISJA EXTREME #${mission.displayNumber} zakończona`,
                description: [
                    "Przyjmowanie zgłoszeń do tej misji zostało zakończone.",
                    "",
                    "Nowa Misja EXTREME pojawi się dziś o 16:00."
                ].join("\n")
            })
        ]
    });
}

module.exports = {
    closeExtremeMission,
    createExtremeAttachment,
    publishExtremeMission
};
