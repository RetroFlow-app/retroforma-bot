const path = require("node:path");
const {
    AttachmentBuilder,
    PermissionsBitField
} = require("discord.js");

const {
    EXTREME_MISSION_CHANNEL_ID
} = require("./extremeMissionService");
const {
    createExtremeMissionEmbed,
    createLogEmbed
} = require("../utils/embedFactory");

async function fetchExtremeMissionChannel(client, channelId = EXTREME_MISSION_CHANNEL_ID) {
    console.info("[EXTREME DISCORD] Pobieram kanał publikacji Misji EXTREME.", {
        channelId
    });

    const channel = await client.channels.fetch(channelId);

    if (!channel) {
        throw new Error("Nie znaleziono kanału publikacji Misji EXTREME.");
    }

    console.info("[EXTREME DISCORD] Wykryto kanaĹ‚ publikacji Misji EXTREME.", {
        channelId: channel.id,
        channelName: channel.name || null
    });

    const permissions = channel.permissionsFor?.(client.user);

    if (permissions) {
        console.info("[EXTREME DISCORD] Uprawnienia bota na kanale publikacji.", {
            attachFiles: permissions.has(PermissionsBitField.Flags.AttachFiles),
            embedLinks: permissions.has(PermissionsBitField.Flags.EmbedLinks),
            sendMessages: permissions.has(PermissionsBitField.Flags.SendMessages),
            viewChannel: permissions.has(PermissionsBitField.Flags.ViewChannel)
        });
    } else {
        console.info("[EXTREME DISCORD] Nie udało się odczytać uprawnień bota dla kanału publikacji.");
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
    const channel = await fetchExtremeMissionChannel(client, mission.missionChannelId || EXTREME_MISSION_CHANNEL_ID);
    const missionAttachment = createExtremeAttachment(mission);

    console.info("[EXTREME DISCORD] Wysyłam wiadomość Misji EXTREME.", {
        attachmentName: missionAttachment.name,
        channelId: channel.id,
        displayNumber: mission.displayNumber,
        imagePath: mission.imagePath
    });

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
    const channel = await fetchExtremeMissionChannel(client, mission.missionChannelId || EXTREME_MISSION_CHANNEL_ID);

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
