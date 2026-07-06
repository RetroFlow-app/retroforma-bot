require("dotenv").config();

const {
    Client,
    GatewayIntentBits,
    ActivityType
} = require("discord.js");

const { registerMessageCreateEvent } = require("./events/messageCreate");
const {
    registerCommandHandler,
    registerSlashCommands
} = require("./handlers/commandHandler");
const { startMissionScheduler } = require("./scheduler/missionScheduler");
const { logToChannel } = require("./services/logger");
const { updateRankingMessage } = require("./services/rankingService");

const STARTUP_LOG_MESSAGE = "🤖 RetroForma Bot został uruchomiony pomyślnie! 🚀";

// Tworzymy klienta Discord z uprawnieniami potrzebnymi botowi na tym etapie.
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

// Podłączamy event odpowiedzialny za odbieranie zgłoszeń użytkowników.
registerMessageCreateEvent(client);

// Podłączamy obsługę slash commands, niezależnie od messageCreate.
registerCommandHandler(client);

client.once("clientReady", async () => {

    console.log(`✅ Zalogowano jako ${client.user.tag}`);

    // Ustawiamy aktywność widoczną przy profilu bota.
    client.user.setActivity("Poligon CAD", {
        type: ActivityType.Watching
    });

    // Wysyłamy informację startową na skonfigurowany kanał logów.
    await logToChannel(client, STARTUP_LOG_MESSAGE);

    // Rejestrujemy komendy aplikacji, w tym /profil.
    try {
        await registerSlashCommands(client);
    } catch (error) {
        console.error(`Nie udało się zarejestrować slash commands: ${error.message}`);
    }

    // Uruchamiamy harmonogram publikowania i zamykania misji Poligonu CAD.
    startMissionScheduler(client);

    // Aktualizujemy jedną stałą wiadomość rankingu po starcie bota.
    try {
        await updateRankingMessage(client);
    } catch (error) {
        console.error(`Nie udało się zaktualizować rankingu po starcie: ${error.message}`);
    }

});

client.login(process.env.DISCORD_TOKEN);
