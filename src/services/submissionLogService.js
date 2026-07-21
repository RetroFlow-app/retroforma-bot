const { logToChannel } = require("./logger");

// Zapisuje poprawne zgłoszenie w kanale logów.
async function logSubmission(client, message, submission) {
    await logToChannel(
        client,
        [
            "📥 Nowe zgłoszenie",
            "",
            `👤 Użytkownik: ${message.author.tag} (${message.author.id})`,
            "",
            `🎯 Misja: ${submission.missionNumber}`,
            "",
            `📎 Liczba zdjęć: ${submission.attachmentCount}`,
            "",
            `🎖️ Zdobyte PP: ${submission.earnedPp}`,
            "",
            `⭐ Zdobyte XP: ${submission.earnedXp}`,
            "",
            `🏁 Łącznie zdobyte PP: ${submission.totalPp}`,
            "",
            `📈 Łącznie XP: ${submission.totalXp}`,
            "",
            `🎚️ Poziom: ${submission.level}`
        ].join("\n")
    );
}

module.exports = {
    logSubmission
};
