const test = require("node:test");
const assert = require("node:assert/strict");

const { findPublishedMissionMessage } = require("../src/services/missionDiscordService");

class FakeMessageCollection extends Map {
    find(predicate) {
        for (const message of this.values()) {
            if (predicate(message)) {
                return message;
            }
        }

        return undefined;
    }

    last() {
        return Array.from(this.values()).at(-1);
    }
}

function createMessage({
    id,
    authorId = "bot-id",
    description = "",
    attachmentName = "",
    createdTimestamp = Date.now()
}) {
    const attachments = new Map();

    if (attachmentName) {
        attachments.set("attachment-1", {
            name: attachmentName,
            url: `https://cdn.discordapp.test/${attachmentName}`
        });
    }

    return {
        id,
        author: {
            id: authorId
        },
        content: "",
        createdTimestamp,
        embeds: [
            {
                description
            }
        ],
        attachments
    };
}

function createClientWithMessages(messages) {
    return {
        user: {
            id: "bot-id"
        },
        channels: {
            fetch: async () => ({
                messages: {
                    fetch: async () => new FakeMessageCollection(
                        messages.map((message) => [message.id, message])
                    )
                }
            })
        }
    };
}

test("odzyskiwanie wiadomości dopasowuje dokładny numer misji i ignoruje podobne numery", async () => {
    const similarMissionMessage = createMessage({
        id: "message-0060",
        description: "MISJA CAD #0060"
    });
    const exactMissionMessage = createMessage({
        id: "message-006",
        description: "MISJA CAD #006"
    });

    const result = await findPublishedMissionMessage(
        createClientWithMessages([similarMissionMessage, exactMissionMessage]),
        {
            id: 6,
            number: "006",
            publishAt: "2026-07-18T10:00:00+02:00"
        }
    );

    assert.equal(result.id, "message-006");
});

test("odzyskiwanie wiadomości akceptuje tylko wiadomości aktualnego bota", async () => {
    const otherBotMessage = createMessage({
        id: "message-other-bot",
        authorId: "other-bot-id",
        description: "MISJA CAD #006"
    });
    const currentBotMessage = createMessage({
        id: "message-current-bot",
        description: "MISJA CAD #006"
    });

    const result = await findPublishedMissionMessage(
        createClientWithMessages([otherBotMessage, currentBotMessage]),
        {
            id: 6,
            number: "006",
            publishAt: "2026-07-18T10:00:00+02:00"
        }
    );

    assert.equal(result.id, "message-current-bot");
});
