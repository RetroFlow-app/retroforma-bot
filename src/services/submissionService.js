const { formatMissionNumber } = require("../utils/missionNumber");
const {
    hasSubmitted,
    saveSubmission
} = require("./submissionRepository");

// Sprawdza, czy użytkownik ma już zgłoszenie do danej misji.
function hasUserSubmitted(userId, missionId) {
    return hasSubmitted(missionId, userId);
}

// Zapisuje zgłoszenie jako oczekujące na weryfikację moderatora.
function addSubmission({ member, mission, message }) {
    const user = member.user || member;
    const attachmentCount = message.attachments.size;
    const submission = saveSubmission({
        missionId: mission.id,
        discordId: user.id,
        messageId: message.id,
        attachmentCount
    });

    return {
        ...submission,
        missionNumber: formatMissionNumber(mission.id),
        attachmentCount
    };
}

module.exports = {
    addSubmission,
    hasUserSubmitted
};
