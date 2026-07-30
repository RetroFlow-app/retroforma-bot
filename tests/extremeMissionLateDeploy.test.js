const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const Database = require("better-sqlite3");

const { initializeDatabase } = require("../src/database/schema");
const {
    EXTREME_TEST_PUBLISH_STATE_KEY,
    checkExtremeMissions
} = require("../src/scheduler/extremeMissionScheduler");
const { createExtremeMissionRepository } = require("../src/services/extremeMissionRepository");

function createLateDeployContext() {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "retroforma-extreme-late-"));
    const assetRoot = path.join(tempDir, "extreme");
    const db = new Database(path.join(tempDir, "database.db"));

    fs.mkdirSync(assetRoot, {
        recursive: true
    });
    fs.writeFileSync(path.join(assetRoot, "000.jpg"), "test-only");
    fs.writeFileSync(path.join(assetRoot, "1.jpg"), "extreme-1");
    fs.writeFileSync(path.join(assetRoot, "2.jpg"), "extreme-2");
    initializeDatabase(db);

    return {
        assetRoots: [
            assetRoot
        ],
        close: () => {
            db.close();
            fs.rmSync(tempDir, {
                recursive: true,
                force: true
            });
        },
        repository: createExtremeMissionRepository(db)
    };
}

test("spozniony deploy po 21:00 publikuje Misje EXTREME #000 tylko raz", async () => {
    const context = createLateDeployContext();
    const publishedMissions = [];

    try {
        const firstResult = await checkExtremeMissions({}, new Date("2026-07-30T21:02:00+02:00"), {
            assetRoots: context.assetRoots,
            logger: {
                info: () => {}
            },
            publishExtremeMission: async (client, mission) => {
                publishedMissions.push(mission);

                return {
                    id: "late-deploy-test-message"
                };
            },
            repository: context.repository
        });
        const stateAfterFirstRun = context.repository.getState();
        const secondResult = await checkExtremeMissions({}, new Date("2026-07-30T21:03:00+02:00"), {
            assetRoots: context.assetRoots,
            logger: {
                info: () => {}
            },
            publishExtremeMission: async (client, mission) => {
                publishedMissions.push(mission);

                return {
                    id: `unexpected-${publishedMissions.length}`
                };
            },
            repository: context.repository
        });

        assert.equal(firstResult.publishedTestMission.mission.displayNumber, "000");
        assert.equal(stateAfterFirstRun.last_publish_date, EXTREME_TEST_PUBLISH_STATE_KEY);
        assert.equal(stateAfterFirstRun.message_id, "late-deploy-test-message");
        assert.equal(publishedMissions.length, 1);
        assert.equal(secondResult.publishedTestMission, null);
        assert.equal(context.repository.getState().last_publish_date, EXTREME_TEST_PUBLISH_STATE_KEY);
    } finally {
        context.close();
    }
});
