const test = require("node:test");
const assert = require("node:assert/strict");

function loadCommandHandlerWithMockedDatabase() {
    const dbPath = require.resolve("../src/database/db");
    const handlerPath = require.resolve("../src/handlers/commandHandler");
    const previousDbCache = require.cache[dbPath];

    // Ten test sprawdza rejestr komend, więc domyślna baza nie powinna być otwierana.
    require.cache[dbPath] = {
        exports: {
            exec() {},
            prepare() {
                return {
                    all: () => [],
                    get: () => null,
                    run: () => ({
                        changes: 0
                    })
                };
            },
            transaction(callback) {
                return (...args) => callback(...args);
            }
        },
        filename: dbPath,
        id: dbPath,
        loaded: true
    };

    delete require.cache[handlerPath];

    try {
        return require("../src/handlers/commandHandler")._test;
    } finally {
        delete require.cache[handlerPath];

        if (previousDbCache) {
            require.cache[dbPath] = previousDbCache;
        } else {
            delete require.cache[dbPath];
        }
    }
}

test("/admin-xp znajduje się na liście rejestrowanych komend", () => {
    const commandHandler = loadCommandHandlerWithMockedDatabase();
    const commandNames = commandHandler.commands.map((command) => command.data.name);

    assert.ok(commandNames.includes("admin-xp"));
});

test("handler wykonuje komendę /admin-xp", async () => {
    const commandHandler = loadCommandHandlerWithMockedDatabase();
    const calls = [];
    const interaction = {
        commandName: "admin-xp",
        isChatInputCommand: () => true
    };
    const commandMap = new Map([
        [
            "admin-xp",
            {
                execute: async (handledInteraction) => {
                    calls.push(handledInteraction.commandName);
                }
            }
        ]
    ]);

    const handled = await commandHandler.handleSlashCommand(interaction, commandMap);

    assert.equal(handled, true);
    assert.deepEqual(calls, ["admin-xp"]);
});
