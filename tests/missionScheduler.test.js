const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
    publishDueMissions
} = require("../src/scheduler/missionScheduler");

const NOW = new Date("2026-07-18T12:00:00+02:00");

function createMission(id, overrides = {}) {
    return {
        id,
        number: String(id).padStart(3, "0"),
        published: false,
        closed: false,
        messageId: null,
        publishAt: "2026-07-18T10:00:00+02:00",
        closeAt: "2026-07-18T15:00:00+02:00",
        ...overrides
    };
}

function createDependencies(initialMissions, options = {}) {
    const missionStore = new Map(initialMissions.map((mission) => [mission.id, { ...mission }]));
    const calls = {
        findPublishedMissionMessage: 0,
        markMissionPublished: 0,
        messageChecks: 0,
        publishMission: 0,
        saveMissionPublication: 0
    };
    const publicationStore = new Map(
        (options.publications || []).map((publication) => [publication.mission_id, { ...publication }])
    );

    const dependencies = {
        applyMissionSchedule: (mission) => ({ ...mission }),
        findPublishedMissionMessage: async () => {
            calls.findPublishedMissionMessage += 1;

            if (options.recoverError) {
                throw options.recoverError;
            }

            return options.recoveredMessage || null;
        },
        getAllMissions: () => Array.from(missionStore.values()).map((mission) => ({ ...mission })),
        getMission: (missionId) => ({ ...missionStore.get(missionId) }),
        getMissionPublication: (missionId) => {
            const publication = publicationStore.get(missionId);

            return publication ? { ...publication } : null;
        },
        markMissionPublished: (missionId, messageId, schedule) => {
            calls.markMissionPublished += 1;
            const currentMission = missionStore.get(missionId);
            const updatedMission = {
                ...currentMission,
                ...schedule,
                published: true,
                messageId
            };

            missionStore.set(missionId, updatedMission);
            return { ...updatedMission };
        },
        missionMessageExists: async (client, messageId) => {
            calls.messageChecks += 1;

            if (options.messageExists) {
                return options.messageExists(messageId);
            }

            return true;
        },
        saveMissionPublication: ({
            missionId,
            missionNumber,
            messageId,
            publishAt,
            closeAt
        }) => {
            calls.saveMissionPublication += 1;
            publicationStore.set(missionId, {
                mission_id: missionId,
                mission_number: missionNumber,
                message_id: messageId,
                publish_at: publishAt,
                close_at: closeAt
            });
        },
        publishMission: async (client, mission) => {
            calls.publishMission += 1;

            if (options.publishDelayMs) {
                await new Promise((resolve) => {
                    setTimeout(resolve, options.publishDelayMs);
                });
            }

            const updatedMission = {
                ...mission,
                published: true,
                messageId: options.newMessageId || `new-message-${mission.number}`
            };

            missionStore.set(mission.id, updatedMission);
            return { ...updatedMission };
        }
    };

    return {
        calls,
        dependencies,
        missionStore,
        publicationStore
    };
}

async function withSilentMissionLogs(callback) {
    const originalLog = console.log;

    console.log = () => {};

    try {
        return await callback();
    } finally {
        console.log = originalLog;
    }
}

function writeMissionJson(missionsRoot, id, overrides = {}) {
    const missionNumber = String(id).padStart(3, "0");
    const missionFolder = path.join(missionsRoot, missionNumber);
    const mission = {
        id,
        title: `Misja CAD #${missionNumber}`,
        difficulty: "Łatwy",
        points: 20,
        xp: 100,
        description: "Misja testowa.",
        published: false,
        closed: false,
        messageId: null,
        ...overrides
    };

    fs.mkdirSync(missionFolder, {
        recursive: true
    });
    fs.writeFileSync(
        path.join(missionFolder, "mission.json"),
        `${JSON.stringify(mission, null, 4)}\n`,
        "utf8"
    );
    fs.writeFileSync(path.join(missionFolder, "image.jpg"), "test-image");
}

function readMissionJson(missionsRoot, id) {
    return JSON.parse(
        fs.readFileSync(
            path.join(missionsRoot, String(id).padStart(3, "0"), "mission.json"),
            "utf8"
        )
    );
}

async function withSchedulerUsingTempMissions(missions, callback) {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "retroforma-mission-scheduler-"));
    const missionsRoot = path.join(tempDir, "missions");
    const actualPaths = require("../src/config/paths");
    const moduleIds = [
        require.resolve("../src/config/paths"),
        require.resolve("../src/services/missionService"),
        require.resolve("../src/services/missionDiscordService"),
        require.resolve("../src/services/missionPublicationRepository"),
        require.resolve("../src/services/streakService"),
        require.resolve("../src/scheduler/missionScheduler")
    ];
    const previousCache = new Map(moduleIds.map((moduleId) => [moduleId, require.cache[moduleId]]));

    try {
        for (const mission of missions) {
            writeMissionJson(missionsRoot, mission.id, mission);
        }

        for (const moduleId of moduleIds) {
            delete require.cache[moduleId];
        }

        require.cache[require.resolve("../src/config/paths")] = {
            exports: {
                ...actualPaths,
                assetsPath: path.join(tempDir, "assets"),
                databasePath: path.join(tempDir, "database.db"),
                missionsPath: missionsRoot,
                projectRootPath: tempDir,
                rawMissionsPath: path.join(tempDir, "raw-missions"),
                systemStatePath: path.join(tempDir, "system.json")
            },
            filename: require.resolve("../src/config/paths"),
            id: require.resolve("../src/config/paths"),
            loaded: true
        };
        require.cache[require.resolve("../src/services/missionPublicationRepository")] = {
            exports: {
                getMissionPublication: () => null,
                markMissionPublicationClosed: () => null,
                saveMissionPublication: () => null
            },
            filename: require.resolve("../src/services/missionPublicationRepository"),
            id: require.resolve("../src/services/missionPublicationRepository"),
            loaded: true
        };
        require.cache[require.resolve("../src/services/streakService")] = {
            exports: {
                resetStreaksForMissedMission: () => 0
            },
            filename: require.resolve("../src/services/streakService"),
            id: require.resolve("../src/services/streakService"),
            loaded: true
        };

        const scheduler = require("../src/scheduler/missionScheduler");
        const missionService = require("../src/services/missionService");

        return await callback({
            missionService,
            missionsRoot,
            scheduler
        });
    } finally {
        for (const [moduleId, cacheEntry] of previousCache.entries()) {
            if (cacheEntry) {
                require.cache[moduleId] = cacheEntry;
            } else {
                delete require.cache[moduleId];
            }
        }

        fs.rmSync(tempDir, {
            recursive: true,
            force: true
        });
    }
}

function createLogOnlyClient() {
    return {
        channels: {
            fetch: async () => ({
                send: async () => ({})
            })
        }
    };
}

test("domyslne dependencies zwyklego schedulera zawieraja markMissionClosed z missionService", async () => {
    await withSchedulerUsingTempMissions([
        createMission(1)
    ], async ({ missionService, scheduler }) => {
        assert.equal(typeof scheduler._test.defaultPublishDependencies.markMissionClosed, "function");
        assert.equal(scheduler._test.defaultPublishDependencies.markMissionClosed, missionService.markMissionClosed);
    });
});

test("zwykly scheduler zamyka misje przez realne missionService.markMissionClosed", async () => {
    await withSilentMissionLogs(async () => {
        await withSchedulerUsingTempMissions([
            createMission(1, {
                closeAt: undefined,
                publishAt: undefined
            })
        ], async ({ missionsRoot, scheduler }) => {
            await scheduler.closeDueMissions(
                createLogOnlyClient(),
                new Date("2026-07-09T15:01:00+02:00")
            );

            assert.equal(readMissionJson(missionsRoot, 1).closed, true);
        });
    });
});

test("zwykly scheduler moze opublikowac nastepna misje po zamknieciu poprzedniej", async () => {
    await withSilentMissionLogs(async () => {
        await withSchedulerUsingTempMissions([
            createMission(1),
            createMission(2)
        ], async ({ scheduler }) => {
            const client = createLogOnlyClient();
            const publishedMissionIds = [];

            await scheduler.closeDueMissions(client, new Date("2026-07-09T15:01:00+02:00"));

            const dependencies = {
                ...scheduler._test.defaultPublishDependencies,
                findPublishedMissionMessage: async () => null,
                getMissionPublication: () => null,
                missionMessageExists: async () => false,
                publishMission: async (unusedClient, mission) => {
                    publishedMissionIds.push(mission.id);

                    return {
                        ...mission,
                        messageId: `message-${mission.number}`,
                        published: true
                    };
                },
                saveMissionPublication: () => null
            };

            const result = await scheduler.publishDueMissions(
                client,
                new Date("2026-07-09T16:01:00+02:00"),
                dependencies
            );

            assert.equal(result.id, 2);
            assert.deepEqual(publishedMissionIds, [2]);
        });
    });
});

test("zwykly scheduler nie zamyka misji #15 przed terminem", async () => {
    await withSilentMissionLogs(async () => {
        const missions = Array.from({ length: 15 }, (_, index) => createMission(index + 1, {
            closed: index + 1 < 15
        }));

        await withSchedulerUsingTempMissions(missions, async ({ missionsRoot, scheduler }) => {
            await scheduler.closeDueMissions(
                createLogOnlyClient(),
                new Date("2026-08-04T16:30:00+02:00")
            );

            assert.equal(readMissionJson(missionsRoot, 15).closed, false);
        });
    });
});

test("pomija misje historyczne i niczego nie publikuje", async () => {
    await withSilentMissionLogs(async () => {
        const historicalMission = createMission(1, {
            publishAt: "2026-07-07T16:00:00+02:00",
            closeAt: "2026-07-09T15:00:00+02:00"
        });
        const { calls, dependencies } = createDependencies([historicalMission]);

        const result = await publishDueMissions({}, NOW, dependencies);

        assert.equal(result, null);
        assert.equal(calls.publishMission, 0);
        assert.equal(calls.messageChecks, 0);
    });
});

test("nie publikuje ponownie aktywnej misji z poprawnym messageId", async () => {
    await withSilentMissionLogs(async () => {
        const activeMission = createMission(6, {
            published: true,
            messageId: "message-006"
        });
        const { calls, dependencies } = createDependencies([activeMission], {
            messageExists: () => true
        });

        const result = await publishDueMissions({}, NOW, dependencies);

        assert.equal(result.id, 6);
        assert.equal(calls.messageChecks, 1);
        assert.equal(calls.publishMission, 0);
        assert.equal(calls.markMissionPublished, 0);
        assert.equal(calls.saveMissionPublication, 1);
    });
});

test("nie publikuje ponownie aktywnej misji z messageId odtworzonym z SQLite", async () => {
    await withSilentMissionLogs(async () => {
        const activeMission = createMission(6);
        const { calls, dependencies, missionStore } = createDependencies([activeMission], {
            messageExists: () => true,
            publications: [
                {
                    mission_id: 6,
                    mission_number: "006",
                    message_id: "message-from-sqlite"
                }
            ]
        });

        const result = await publishDueMissions({}, NOW, dependencies);

        assert.equal(result.id, 6);
        assert.equal(calls.messageChecks, 1);
        assert.equal(calls.publishMission, 0);
        assert.equal(calls.markMissionPublished, 1);
        assert.equal(missionStore.get(6).messageId, "message-from-sqlite");
    });
});

test("odtwarza messageId z kanalu Discord, gdy nie ma go w mission.json ani SQLite", async () => {
    await withSilentMissionLogs(async () => {
        const activeMission = createMission(6);
        const { calls, dependencies, missionStore, publicationStore } = createDependencies([activeMission], {
            recoveredMessage: {
                id: "message-from-discord"
            }
        });

        const result = await publishDueMissions({}, NOW, dependencies);

        assert.equal(result.id, 6);
        assert.equal(calls.messageChecks, 0);
        assert.equal(calls.findPublishedMissionMessage, 1);
        assert.equal(calls.publishMission, 0);
        assert.equal(missionStore.get(6).messageId, "message-from-discord");
        assert.equal(publicationStore.get(6).message_id, "message-from-discord");
    });
});

test("publikuje ponownie aktywna misje, gdy zapisany messageId nie istnieje", async () => {
    await withSilentMissionLogs(async () => {
        const activeMission = createMission(6, {
            published: true,
            messageId: "missing-message"
        });
        const { calls, dependencies, missionStore } = createDependencies([activeMission], {
            messageExists: () => false,
            newMessageId: "message-006-new"
        });

        const result = await publishDueMissions({}, NOW, dependencies);

        assert.equal(result.id, 6);
        assert.equal(calls.messageChecks, 1);
        assert.equal(calls.findPublishedMissionMessage, 1);
        assert.equal(calls.publishMission, 1);
        assert.equal(missionStore.get(6).messageId, "message-006-new");
    });
});

test("nie publikuje w ciemno, gdy Discord API przerywa odzyskiwanie wiadomości", async () => {
    await withSilentMissionLogs(async () => {
        const activeMission = createMission(6);
        const recoverError = new Error("Discord API error");
        const { calls, dependencies } = createDependencies([activeMission], {
            recoverError
        });

        await assert.rejects(
            () => publishDueMissions({}, NOW, dependencies),
            recoverError
        );

        assert.equal(calls.findPublishedMissionMessage, 1);
        assert.equal(calls.publishMission, 0);
    });
});

test("chroni aktywna misje przed rownoczesna podwojna publikacja", async () => {
    await withSilentMissionLogs(async () => {
        const activeMission = createMission(6);
        const { calls, dependencies } = createDependencies([activeMission], {
            newMessageId: "message-006",
            publishDelayMs: 25
        });

        const [firstResult, secondResult] = await Promise.all([
            publishDueMissions({}, NOW, dependencies),
            publishDueMissions({}, NOW, dependencies)
        ]);

        assert.equal(firstResult.messageId, "message-006");
        assert.equal(secondResult.messageId, "message-006");
        assert.equal(calls.publishMission, 1);
    });
});
