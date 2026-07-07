const config = require("../config/appConfig");
const { createLogEmbed } = require("../utils/embedFactory");

// Wysyła wiadomość na kanał logów ustawiony w config.json.
async function logToChannel(client, message) {
    if (!config.logChannelId) {
        return;
    }

    try {
        const channel = await client.channels.fetch(config.logChannelId);

        if (!channel) {
            return;
        }

        await channel.send({
            embeds: [
                createLogEmbed({
                    description: message
                })
            ]
        });
    } catch (error) {
        console.error(`Nie udało się wysłać logu na kanał: ${error.message}`);
    }
}

module.exports = {
    logToChannel
};
