const config = require("../config/appConfig");
const { createLogEmbed } = require("../utils/embedFactory");

// Wysyła wiadomość na kanał logów ustawiony w config.json.
async function logToChannel(client, message) {
    const channel = await client.channels.fetch(config.logChannelId);

    if (channel) {
        await channel.send({
            embeds: [
                createLogEmbed({
                    description: message
                })
            ]
        });
    }
}

module.exports = {
    logToChannel
};
