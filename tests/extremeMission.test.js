const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const Database = require("better-sqlite3");

const { initializeDatabase } = require("../src/database/schema");
const {
    EXTREME_MISSION_CHANNEL_ID,
    EXTREME_REWARD_PP,
    EXTREME_REWARD_XP,
    EXTREME_STATUS,
    EXTREME_SUBMIT_CHANNEL_ID,
    EXTREME_TEST_MISSION_CHANNEL_ID,
    EXTREME_TEST_REVIEW_MISSION_ID,
    closeActiveExtremeMission,
    createExtremeMissionFromSequence,
    createExtremeTestMission,
    getExtremeMissionByReviewId,
    getExtremeMissionCatalog,
    getExtremeMissionImagePath,
    getExtremeReviewMissionId,
    getExtremeTestMissionImagePath,
    publishOneTimeExtremeTestMission,
    publishNextExtremeMission
} = require("../src/services/extremeMissionService");
const {
    EXTREME_TEST_PUBLISH_STATE_KEY,
    shouldPublishOneTimeExtremeTestMission
} = require("../src/scheduler/extremeMissionScheduler");
const { createExtremeMissionRepository } = require("../src/services/extremeMissionRepository");
const {
    countImageAttachments,
    handleExtremeSubmissionMessage
} = require("../src/services/extremeSubmissionService");
const { createExtremeMissionEmbed } = require("../src/utils/embedFactory");
const { _test: reviewTestApi } = require("../src/services/reviewService");

function writeJpgFiles(rootPath, missionNumbers) {
    fs.mkdirSync(rootPath, {
        recursive: true
    });

    for (const missionNumber of missionNumbers) {
        fs.writeFileSync(path.join(rootPath, `${missionNumber}.jpg`), `extreme-${missionNumber}`);
    }
}

function createTempContext(missionNumbers = [1, 2, 14]) {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "retroforma-extreme-"));
    const assetRoot = path.join(tempDir, "extreme");
    const db = new Database(path.join(tempDir, "database.db"));

    writeJpgFiles(assetRoot, missionNumbers);
    initializeDatabase(db);

    return {
        assetRoot,
        assetRoots: [assetRoot],
        close: () => {
            db.close();
            fs.rmSync(tempDir, {
                recursive: true,
                force: true
            });
        },
        db,
        repository: createExtremeMissionRepository(db),
        tempDir
    };
}

function createAttachmentCollection(count) {
    const attachments = new Map();

    for (let index = 1; index <= count; index += 1) {
        attachments.set(`attachment-${index}`, {
            contentType: "image/jpeg",
            name: `${index}.jpg`,
            url: `https://cdn.discordapp.test/${index}.jpg`
        });
    }

    return attachments;
}

function createMessage({ attachmentCount, channelId = EXTREME_SUBMIT_CHANNEL_ID }) {
    const calls = [];

    return {
        attachments: createAttachmentCollection(attachmentCount),
        author: {
            bot: false,
            id: "extreme-user"
        },
        calls,
        channelId,
        client: {},
        id: "message-extreme",
        member: {
            user: {
                id: "extreme-user",
                username: "ExtremeUser"
            }
        },
        async react(emoji) {
            calls.push({
                name: "react",
                emoji
            });
        }
    };
}

test("automatycznie wykrywa liczbę Misji EXTREME i sortuje JPG numerycznie", () => {
    const context = createTempContext([10, 2, 1, 20, 9]);

    try {
        fs.writeFileSync(path.join(context.assetRoot, "3.png"), "ignored");
        fs.writeFileSync(path.join(context.assetRoot, "4.jpeg"), "ignored");
        fs.writeFileSync(path.join(context.assetRoot, "000.jpg"), "test-only");
        fs.writeFileSync(path.join(context.assetRoot, "not-a-number.jpg"), "ignored");

        const catalog = getExtremeMissionCatalog({
            assetRoots: context.assetRoots
        });

        assert.equal(catalog.missions.length, 5);
        assert.deepEqual(catalog.missions.map((mission) => mission.number), [1, 2, 9, 10, 20]);
        assert.equal(getExtremeMissionImagePath(10, {
            assetRoots: context.assetRoots
        }), path.join(context.assetRoot, "10.jpg"));
    } finally {
        context.close();
    }
});

test("jednorazowa Misja EXTREME #000 używa grafiki testowej i kanału testowego", async () => {
    const context = createTempContext([1, 2, 3]);
    const publishedMissions = [];

    try {
        fs.writeFileSync(path.join(context.assetRoot, "000.jpg"), "test-only");
        context.repository.saveState({
            current_number: 3,
            current_sequence: 3,
            status: EXTREME_STATUS.CLOSED
        });

        const result = await publishOneTimeExtremeTestMission({}, {
            assetRoots: context.assetRoots,
            logger: {
                info: () => {}
            },
            now: new Date("2026-07-30T20:00:00+02:00"),
            publishDateKey: EXTREME_TEST_PUBLISH_STATE_KEY,
            publishExtremeMission: async (client, mission) => {
                publishedMissions.push(mission);

                return {
                    id: "extreme-test-message-000"
                };
            },
            repository: context.repository
        });
        const state = context.repository.getState();

        assert.equal(result.mission.id, EXTREME_TEST_REVIEW_MISSION_ID);
        assert.equal(result.mission.displayNumber, "000");
        assert.equal(result.mission.missionChannelId, EXTREME_TEST_MISSION_CHANNEL_ID);
        assert.equal(result.mission.submitChannelId, EXTREME_SUBMIT_CHANNEL_ID);
        assert.equal(result.mission.imagePath, path.join(context.assetRoot, "000.jpg"));
        assert.equal(publishedMissions.length, 1);
        assert.equal(state.status, EXTREME_STATUS.ACTIVE);
        assert.equal(state.current_sequence, 3);
        assert.equal(state.current_number, 0);
        assert.equal(state.message_id, "extreme-test-message-000");
        assert.equal(state.last_publish_date, EXTREME_TEST_PUBLISH_STATE_KEY);
        assert.equal(getExtremeTestMissionImagePath({
            assetRoots: context.assetRoots
        }), path.join(context.assetRoot, "000.jpg"));
    } finally {
        context.close();
    }
});

test("jednorazowy scheduler Misji EXTREME #000 działa tylko w oknie testowym", () => {
    assert.equal(shouldPublishOneTimeExtremeTestMission({
        last_publish_date: null
    }, new Date("2026-07-30T19:59:00+02:00")), false);
    assert.equal(shouldPublishOneTimeExtremeTestMission({
        last_publish_date: null
    }, new Date("2026-07-30T20:00:00+02:00")), true);
    assert.equal(shouldPublishOneTimeExtremeTestMission({
        last_publish_date: EXTREME_TEST_PUBLISH_STATE_KEY
    }, new Date("2026-07-30T20:01:00+02:00")), false);
    assert.equal(shouldPublishOneTimeExtremeTestMission({
        last_publish_date: null
    }, new Date("2026-07-31T20:00:00+02:00")), false);
});

test("publikuje nową Misję EXTREME na osobnym kanale", async () => {
    const context = createTempContext();
    const calls = [];

    try {
        const result = await publishNextExtremeMission({}, {
            assetRoots: context.assetRoots,
            now: new Date("2026-07-29T16:00:00+02:00"),
            publishDateKey: "2026-07-29",
            publishExtremeMission: async (client, mission) => {
                calls.push(mission);

                return {
                    id: `extreme-message-${mission.displayNumber}`
                };
            },
            repository: context.repository
        });
        const state = context.repository.getState();

        assert.equal(result.mission.displayNumber, "01");
        assert.equal(result.mission.missionChannelId, EXTREME_MISSION_CHANNEL_ID);
        assert.equal(result.mission.submitChannelId, EXTREME_SUBMIT_CHANNEL_ID);
        assert.equal(calls.length, 1);
        assert.equal(state.status, EXTREME_STATUS.ACTIVE);
        assert.equal(state.current_number, 1);
        assert.equal(state.message_id, "extreme-message-01");
    } finally {
        context.close();
    }
});

test("zamyka aktywną Misję EXTREME", async () => {
    const context = createTempContext();
    const calls = [];

    try {
        await publishNextExtremeMission({}, {
            assetRoots: context.assetRoots,
            publishExtremeMission: async () => ({
                id: "extreme-message-01"
            }),
            repository: context.repository
        });

        const mission = await closeActiveExtremeMission({}, {
            assetRoots: context.assetRoots,
            closeExtremeMission: async (client, closedMission, state) => {
                calls.push({
                    mission: closedMission,
                    state
                });
            },
            repository: context.repository
        });
        const state = context.repository.getState();

        assert.equal(mission.displayNumber, "01");
        assert.equal(calls.length, 1);
        assert.equal(state.status, EXTREME_STATUS.CLOSED);
        assert.ok(state.closed_at);
    } finally {
        context.close();
    }
});

test("rotacja Misji EXTREME przechodzi z ostatniej wykrytej grafiki do pierwszej", async () => {
    const context = createTempContext([1, 2, 20]);
    const publishedNumbers = [];

    try {
        context.repository.saveState({
            current_number: 20,
            current_sequence: 20,
            status: EXTREME_STATUS.CLOSED
        });

        await publishNextExtremeMission({}, {
            assetRoots: context.assetRoots,
            publishExtremeMission: async (client, mission) => {
                publishedNumbers.push(mission.extremeNumber);

                return {
                    id: `message-${mission.extremeNumber}`
                };
            },
            repository: context.repository
        });

        assert.deepEqual(publishedNumbers, [1]);
        assert.equal(context.repository.getState().current_sequence, 21);
        assert.equal(context.repository.getState().current_number, 1);
    } finally {
        context.close();
    }
});

test("pusty folder Misji EXTREME jest logowany i nie publikuje misji", async () => {
    const context = createTempContext([]);
    const errors = [];
    let publishCalls = 0;

    try {
        const result = await publishNextExtremeMission({}, {
            assetRoots: context.assetRoots,
            logger: {
                error: (message) => errors.push(message)
            },
            publishExtremeMission: async () => {
                publishCalls += 1;
            },
            repository: context.repository
        });

        assert.equal(result, null);
        assert.equal(publishCalls, 0);
        assert.match(errors[0], /nie zawiera żadnego pliku JPG/);
    } finally {
        context.close();
    }
});

test("brakujący folder Misji EXTREME jest logowany i nie publikuje misji", async () => {
    const context = createTempContext();
    const missingRoot = path.join(context.tempDir, "missing-extreme");
    const errors = [];
    let publishCalls = 0;

    try {
        const result = await publishNextExtremeMission({}, {
            assetRoots: [missingRoot],
            logger: {
                error: (message) => errors.push(message)
            },
            publishExtremeMission: async () => {
                publishCalls += 1;
            },
            repository: context.repository
        });

        assert.equal(result, null);
        assert.equal(publishCalls, 0);
        assert.match(errors[0], /nie istnieje/);
    } finally {
        context.close();
    }
});

test("embed Misji EXTREME ma sekcję bez wymiarów dla misji 1 i 14 oraz wymiary dla pozostałych", () => {
    const context = createTempContext([1, 2, 14]);

    try {
        const firstMission = createExtremeMissionFromSequence(1, {
            assetRoots: context.assetRoots,
            extremeNumber: 1,
            requireImage: false
        });
        const secondMission = createExtremeMissionFromSequence(2, {
            assetRoots: context.assetRoots,
            extremeNumber: 2,
            requireImage: false
        });
        const fourteenthMission = createExtremeMissionFromSequence(3, {
            assetRoots: context.assetRoots,
            extremeNumber: 14,
            requireImage: false
        });

        assert.match(createExtremeMissionEmbed(firstMission).data.description, /BRAK PODANYCH WYMIARÓW/);
        assert.match(createExtremeMissionEmbed(fourteenthMission).data.description, /BRAK PODANYCH WYMIARÓW/);
        assert.match(createExtremeMissionEmbed(secondMission).data.description, /Model wykonaj zgodnie z wymiarami/);
    } finally {
        context.close();
    }
});

test("Misja EXTREME wymaga minimum 3 zdjęć projektu", () => {
    assert.equal(countImageAttachments(createMessage({ attachmentCount: 0 })), 0);
    assert.equal(countImageAttachments(createMessage({ attachmentCount: 2 })), 2);
    assert.equal(countImageAttachments(createMessage({ attachmentCount: 3 })), 3);
});

test("zgłoszenia EXTREME z 1 lub 2 zdjęciami są odrzucane bez review", async () => {
    const context = createTempContext();

    try {
        for (const attachmentCount of [1, 2]) {
            const message = createMessage({
                attachmentCount
            });
            const replies = [];
            let reviewCalls = 0;
            const handled = await handleExtremeSubmissionMessage(message, {
                getActiveExtremeMission: () => createExtremeMissionFromSequence(1, {
                    assetRoots: context.assetRoots,
                    requireImage: false
                }),
                hasUserSubmitted: () => false,
                replyTemporarily: async (replyMessage, payload) => {
                    replies.push(payload);
                },
                submitForReview: async () => {
                    reviewCalls += 1;
                }
            });

            assert.equal(handled, true);
            assert.equal(reviewCalls, 0);
            assert.equal(message.calls.length, 0);
            assert.match(replies[0].embeds[0].data.description, /minimum 3 zdjęć/);
        }
    } finally {
        context.close();
    }
});

test("zgłoszenie EXTREME z minimum 3 zdjęciami trafia do obecnej weryfikacji", async () => {
    const context = createTempContext();

    try {
        const mission = createExtremeMissionFromSequence(1, {
            assetRoots: context.assetRoots,
            requireImage: false
        });
        const message = createMessage({
            attachmentCount: 3
        });
        const submissions = [];

        const handled = await handleExtremeSubmissionMessage(message, {
            getActiveExtremeMission: () => mission,
            hasUserSubmitted: () => false,
            replyTemporarily: async () => {},
            submitForReview: async (payload) => {
                submissions.push(payload);
            }
        });

        assert.equal(handled, true);
        assert.equal(submissions.length, 1);
        assert.equal(submissions[0].message, message);
        assert.equal(submissions[0].mission.id, mission.id);
        assert.equal(message.calls[0].emoji, "✅");
    } finally {
        context.close();
    }
});

test("akceptacja Misji EXTREME używa nagród 20 PP i 100 XP", () => {
    const missionId = getExtremeReviewMissionId(1);
    const mission = reviewTestApi.getMissionForReview(missionId);

    assert.equal(mission.points, EXTREME_REWARD_PP);
    assert.equal(mission.xp, EXTREME_REWARD_XP);
    assert.equal(reviewTestApi.getMissionPoints(mission), 20);
    assert.equal(reviewTestApi.getMissionXP(mission), 100);
    assert.equal(getExtremeMissionByReviewId(missionId).affectsStreak, false);
    assert.equal(createExtremeTestMission({
        requireImage: false
    }).points, EXTREME_REWARD_PP);
    assert.equal(createExtremeTestMission({
        requireImage: false
    }).xp, EXTREME_REWARD_XP);
});
