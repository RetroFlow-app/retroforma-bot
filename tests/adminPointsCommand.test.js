const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const Database = require("better-sqlite3");
const { PermissionFlagsBits } = require("discord.js");

const adminPointsPanel = require("../src/commands/adminPointsCommands");
const {
    ADMIN_POINT_ERRORS,
    ADMIN_POINT_OPERATIONS,
    MAX_ADMIN_POINT_AMOUNT,
    createAdminPointsService
} = require("../src/services/adminPointsService");
const { createAdminPointsRepository } = require("../src/services/adminPointsRepository");
const { initializeDatabase } = require("../src/database/schema");

function createTempContext() {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "retroforma-admin-points-"));
    const db = new Database(path.join(tempDir, "database.db"));

    initializeDatabase(db);

    function getOrCreateUser(member) {
        const user = member.user || member;
        const username = user.tag || user.username || "Kadet Testowy";
        const existingUser = db.prepare(`
            SELECT *
            FROM users
            WHERE discord_id = ?
        `).get(user.id);

        if (existingUser) {
            db.prepare(`
                UPDATE users
                SET username = ?
                WHERE discord_id = ?
            `).run(username, user.id);

            return {
                ...existingUser,
                username
            };
        }

        db.prepare(`
            INSERT INTO users (discord_id, username, created_at)
            VALUES (?, ?, ?)
        `).run(user.id, username, new Date().toISOString());

        return db.prepare(`
            SELECT *
            FROM users
            WHERE discord_id = ?
        `).get(user.id);
    }

    function getUser(discordId) {
        return db.prepare(`
            SELECT *
            FROM users
            WHERE discord_id = ?
        `).get(discordId);
    }

    function setUserStats(discordId, stats) {
        getOrCreateUser(createUser(discordId));

        db.prepare(`
            UPDATE users
            SET pp = ?,
                pp_total_earned = ?,
                xp = ?,
                level = ?,
                missions_completed = ?
            WHERE discord_id = ?
        `).run(
            stats.pp ?? 0,
            stats.ppTotalEarned ?? stats.pp ?? 0,
            stats.xp ?? 0,
            stats.level ?? 1,
            stats.missionsCompleted ?? 0,
            discordId
        );
    }

    function addOwnedAndEquippedItem(discordId, code) {
        const user = getOrCreateUser(createUser(discordId));
        const item = db.prepare(`
            SELECT *
            FROM shop_items
            WHERE code = ?
        `).get(code);

        db.prepare(`
            INSERT INTO user_inventory (user_id, item_id, obtained_at)
            VALUES (?, ?, ?)
        `).run(user.id, item.id, new Date().toISOString());

        db.prepare(`
            INSERT INTO user_equipment (user_id, slot, item_id, updated_at)
            VALUES (?, ?, ?, ?)
        `).run(user.id, "profile_theme", item.id, new Date().toISOString());
    }

    function getInventoryRows() {
        return db.prepare(`
            SELECT *
            FROM user_inventory
            ORDER BY id ASC
        `).all();
    }

    function getEquipmentRows() {
        return db.prepare(`
            SELECT *
            FROM user_equipment
            ORDER BY id ASC
        `).all();
    }

    function getTransactions() {
        return db.prepare(`
            SELECT *
            FROM admin_point_transactions
            ORDER BY id ASC
        `).all();
    }

    return {
        addOwnedAndEquippedItem,
        close: () => {
            db.close();
            fs.rmSync(tempDir, {
                recursive: true,
                force: true
            });
        },
        db,
        getEquipmentRows,
        getInventoryRows,
        getOrCreateUser,
        getTransactions,
        getUser,
        setUserStats
    };
}

function createUser(id, options = {}) {
    return {
        bot: Boolean(options.bot),
        id,
        tag: options.tag || `Kadet#${id.slice(-4)}`,
        username: options.username || `Kadet-${id}`
    };
}

function createPermissions(flags = []) {
    const allowedFlags = new Set(flags.map((flag) => String(flag)));

    return {
        has(flag) {
            return allowedFlags.has(String(flag));
        }
    };
}

function createOptions(values) {
    return {
        getInteger(name, required = false) {
            if (values[name] === undefined && required) {
                throw new Error(`Brak opcji ${name}`);
            }

            return values[name] ?? null;
        },
        getString(name, required = false) {
            if (values[name] === undefined && required) {
                throw new Error(`Brak opcji ${name}`);
            }

            return values[name] ?? null;
        },
        getUser(name, required = false) {
            if (values[name] === undefined && required) {
                throw new Error(`Brak opcji ${name}`);
            }

            return values[name] ?? null;
        }
    };
}

function createLogger() {
    return {
        errors: [],
        infos: [],
        error(message) {
            this.errors.push(String(message));
        },
        info(message) {
            this.infos.push(String(message));
        }
    };
}

function createInteraction({
    adminUser = createUser("admin-1"),
    amount = 100,
    operation = ADMIN_POINT_OPERATIONS.ADD,
    permissions = [PermissionFlagsBits.ManageGuild],
    reason = "Test",
    targetUser = createUser("target-1")
} = {}) {
    const calls = [];

    return {
        calls,
        client: {},
        deferred: false,
        memberPermissions: createPermissions(permissions),
        options: createOptions({
            "ilość": amount,
            operacja: operation,
            powód: reason,
            użytkownik: targetUser
        }),
        replied: false,
        user: adminUser,
        async deferReply(payload) {
            calls.push({
                name: "deferReply",
                payload
            });
            this.deferred = true;
        },
        async editReply(payload) {
            calls.push({
                name: "editReply",
                payload
            });
            this.replied = true;
            return payload;
        },
        async reply(payload) {
            calls.push({
                name: "reply",
                payload
            });
            this.replied = true;
            return payload;
        }
    };
}

function createCommandDependencies(context, overrides = {}) {
    return {
        db: context.db,
        env: {},
        getOrCreateUser: context.getOrCreateUser,
        logToChannel: async () => {},
        logger: createLogger(),
        updateRankingMessage: async () => {},
        ...overrides
    };
}

function getCommand(name) {
    return adminPointsPanel.commands.find((command) => command.data.name === name);
}

test("komenda /admin-punkty jest zarejestrowana z wymaganymi opcjami", () => {
    const commandJson = getCommand("admin-punkty").data.toJSON();
    const optionNames = commandJson.options.map((option) => option.name);

    assert.equal(commandJson.name, "admin-punkty");
    assert.deepEqual(optionNames, ["użytkownik", "operacja", "ilość", "powód"]);
});

test("administrator może dodać PP i operacja trafia do historii", async () => {
    const context = createTempContext();
    const command = getCommand("admin-punkty");
    const targetUser = createUser("target-add");
    const interaction = createInteraction({
        amount: 500,
        operation: ADMIN_POINT_OPERATIONS.ADD,
        targetUser
    });

    try {
        context.setUserStats(targetUser.id, {
            pp: 120,
            ppTotalEarned: 120,
            xp: 800,
            level: 4,
            missionsCompleted: 3
        });

        await command.execute(interaction, createCommandDependencies(context));

        const user = context.getUser(targetUser.id);
        const transactions = context.getTransactions();

        assert.deepEqual(interaction.calls.map((call) => call.name), ["deferReply", "editReply"]);
        assert.equal(user.pp, 620);
        assert.equal(user.pp_total_earned, 120);
        assert.equal(user.xp, 800);
        assert.equal(user.missions_completed, 3);
        assert.match(interaction.calls[1].payload.embeds[0].data.description, /Łącznie zdobyte:\n120 PP/);
        assert.equal(transactions.length, 1);
        assert.equal(transactions[0].target_user_id, user.id);
        assert.equal(transactions[0].target_discord_id, targetUser.id);
        assert.equal(transactions[0].operation, ADMIN_POINT_OPERATIONS.ADD);
        assert.equal(transactions[0].balance_before, 120);
        assert.equal(transactions[0].balance_after, 620);
    } finally {
        context.close();
    }
});

test("administrator może odjąć PP bez zejścia poniżej zera", async () => {
    const context = createTempContext();
    const command = getCommand("admin-punkty");
    const targetUser = createUser("target-subtract");
    const interaction = createInteraction({
        amount: 200,
        operation: ADMIN_POINT_OPERATIONS.SUBTRACT,
        targetUser
    });

    try {
        context.setUserStats(targetUser.id, {
            pp: 500,
            ppTotalEarned: 700
        });

        await command.execute(interaction, createCommandDependencies(context));

        assert.equal(context.getUser(targetUser.id).pp, 300);
        assert.equal(context.getUser(targetUser.id).pp_total_earned, 700);
        assert.equal(context.getTransactions()[0].balance_after, 300);
    } finally {
        context.close();
    }
});

test("administrator może ustawić saldo PP", async () => {
    const context = createTempContext();
    const command = getCommand("admin-punkty");
    const targetUser = createUser("target-set");
    const interaction = createInteraction({
        amount: 1000,
        operation: ADMIN_POINT_OPERATIONS.SET,
        targetUser
    });

    try {
        context.setUserStats(targetUser.id, {
            pp: 250,
            ppTotalEarned: 900,
            xp: 1500,
            missionsCompleted: 6
        });

        await command.execute(interaction, createCommandDependencies(context));

        const user = context.getUser(targetUser.id);

        assert.equal(user.pp, 1000);
        assert.equal(user.pp_total_earned, 900);
        assert.equal(user.xp, 1500);
        assert.equal(user.missions_completed, 6);
    } finally {
        context.close();
    }
});

test("zwykły użytkownik otrzymuje odmowę i komenda nie dotyka bazy", async () => {
    const context = createTempContext();
    const command = getCommand("admin-punkty");
    const targetUser = createUser("target-denied");
    const interaction = createInteraction({
        permissions: [],
        targetUser
    });

    try {
        await command.execute(interaction, createCommandDependencies(context, {
            adminPointsService: {
                changePoints() {
                    throw new Error("SERVICE_SHOULD_NOT_BE_CALLED");
                }
            }
        }));

        assert.deepEqual(interaction.calls.map((call) => call.name), ["deferReply", "editReply"]);
        assert.equal(context.getUser(targetUser.id), undefined);
        assert.match(interaction.calls[1].payload.embeds[0].data.description, /uprawnie/);
    } finally {
        context.close();
    }
});

test("użytkownik spoza ADMIN_USER_IDS otrzymuje odmowę", async () => {
    const context = createTempContext();
    const command = getCommand("admin-punkty");
    const interaction = createInteraction({
        adminUser: createUser("not-allowlisted"),
        permissions: [PermissionFlagsBits.Administrator]
    });

    try {
        await command.execute(interaction, createCommandDependencies(context, {
            adminPointsService: {
                changePoints() {
                    throw new Error("SERVICE_SHOULD_NOT_BE_CALLED");
                }
            },
            env: {
                ADMIN_USER_IDS: "admin-allowed"
            }
        }));

        assert.deepEqual(interaction.calls.map((call) => call.name), ["deferReply", "editReply"]);
        assert.match(interaction.calls[1].payload.embeds[0].data.description, /uprawnie/);
    } finally {
        context.close();
    }
});

test("nie można podać zera ani liczby ujemnej", () => {
    const context = createTempContext();
    const service = createAdminPointsService({
        db: context.db,
        getOrCreateUser: context.getOrCreateUser
    });

    try {
        assert.throws(
            () => service.changePoints({
                adminUser: createUser("admin"),
                amount: 0,
                operation: ADMIN_POINT_OPERATIONS.ADD,
                targetUser: createUser("target-zero")
            }),
            (error) => error.code === ADMIN_POINT_ERRORS.INVALID_AMOUNT
        );
        assert.throws(
            () => service.changePoints({
                adminUser: createUser("admin"),
                amount: -10,
                operation: ADMIN_POINT_OPERATIONS.ADD,
                targetUser: createUser("target-negative")
            }),
            (error) => error.code === ADMIN_POINT_ERRORS.INVALID_AMOUNT
        );
    } finally {
        context.close();
    }
});

test("nie można przekroczyć limitu pojedynczej operacji", () => {
    const context = createTempContext();
    const service = createAdminPointsService({
        db: context.db,
        getOrCreateUser: context.getOrCreateUser
    });

    try {
        assert.throws(
            () => service.changePoints({
                adminUser: createUser("admin"),
                amount: MAX_ADMIN_POINT_AMOUNT + 1,
                operation: ADMIN_POINT_OPERATIONS.ADD,
                targetUser: createUser("target-limit")
            }),
            (error) => error.code === ADMIN_POINT_ERRORS.AMOUNT_TOO_LARGE
        );
    } finally {
        context.close();
    }
});

test("odejmowanie większe niż saldo nie zmienia PP ani historii", () => {
    const context = createTempContext();
    const service = createAdminPointsService({
        db: context.db,
        getOrCreateUser: context.getOrCreateUser
    });
    const targetUser = createUser("target-insufficient");

    try {
        context.setUserStats(targetUser.id, {
            pp: 50
        });

        assert.throws(
            () => service.changePoints({
                adminUser: createUser("admin"),
                amount: 100,
                operation: ADMIN_POINT_OPERATIONS.SUBTRACT,
                targetUser
            }),
            (error) => error.code === ADMIN_POINT_ERRORS.INSUFFICIENT_PP
        );
        assert.equal(context.getUser(targetUser.id).pp, 50);
        assert.equal(context.getTransactions().length, 0);
    } finally {
        context.close();
    }
});

test("administracyjna operacja nie zmienia inventory ani user_equipment", () => {
    const context = createTempContext();
    const service = createAdminPointsService({
        db: context.db,
        getOrCreateUser: context.getOrCreateUser
    });
    const targetUser = createUser("target-inventory-safe");

    try {
        context.setUserStats(targetUser.id, {
            pp: 100,
            ppTotalEarned: 300
        });
        context.addOwnedAndEquippedItem(targetUser.id, "tlo-blueprint");

        const inventoryBefore = context.getInventoryRows();
        const equipmentBefore = context.getEquipmentRows();

        service.changePoints({
            adminUser: createUser("admin"),
            amount: 250,
            operation: ADMIN_POINT_OPERATIONS.ADD,
            targetUser
        });

        assert.deepEqual(context.getInventoryRows(), inventoryBefore);
        assert.deepEqual(context.getEquipmentRows(), equipmentBefore);
    } finally {
        context.close();
    }
});

test("awaria zapisu historii cofa zmianę salda PP", () => {
    const context = createTempContext();
    const realRepository = createAdminPointsRepository(context.db);
    const service = createAdminPointsService({
        db: context.db,
        getOrCreateUser: context.getOrCreateUser,
        repository: {
            ...realRepository,
            saveTransaction() {
                throw new Error("AUDIT_LOG_DOWN");
            }
        }
    });
    const targetUser = createUser("target-audit-rollback");

    try {
        context.setUserStats(targetUser.id, {
            pp: 100,
            ppTotalEarned: 300
        });

        assert.throws(
            () => service.changePoints({
                adminUser: createUser("admin"),
                amount: 250,
                operation: ADMIN_POINT_OPERATIONS.ADD,
                targetUser
            }),
            /AUDIT_LOG_DOWN/
        );
        assert.equal(context.getUser(targetUser.id).pp, 100);
        assert.equal(context.getUser(targetUser.id).pp_total_earned, 300);
        assert.equal(context.getTransactions().length, 0);
    } finally {
        context.close();
    }
});

test("ręczne dodanie PP nie zwiększa XP ani liczby ukończonych misji", () => {
    const context = createTempContext();
    const service = createAdminPointsService({
        db: context.db,
        getOrCreateUser: context.getOrCreateUser
    });
    const targetUser = createUser("target-earned-safe");

    try {
        context.setUserStats(targetUser.id, {
            pp: 100,
            ppTotalEarned: 700,
            xp: 900,
            level: 4,
            missionsCompleted: 8
        });

        service.changePoints({
            adminUser: createUser("admin"),
            amount: 400,
            operation: ADMIN_POINT_OPERATIONS.ADD,
            targetUser
        });

        const user = context.getUser(targetUser.id);

        assert.equal(user.pp, 500);
        assert.equal(user.pp_total_earned, 700);
        assert.equal(user.xp, 900);
        assert.equal(user.level, 4);
        assert.equal(user.missions_completed, 8);
    } finally {
        context.close();
    }
});

test("błąd bazy nie kończy się brakiem odpowiedzi Discorda", async () => {
    const context = createTempContext();
    const command = getCommand("admin-punkty");
    const interaction = createInteraction();
    const logger = createLogger();

    try {
        await command.execute(interaction, createCommandDependencies(context, {
            adminPointsService: {
                changePoints() {
                    throw new Error("DATABASE_DOWN");
                }
            },
            logger
        }));

        assert.deepEqual(interaction.calls.map((call) => call.name), ["deferReply", "editReply"]);
        assert.match(interaction.calls[1].payload.embeds[0].data.description, /Nie udało się zmienić Punktów Poligonu/);
        assert.equal(logger.errors.some((message) => message.includes("DATABASE_DOWN")), true);
    } finally {
        context.close();
    }
});

test("bot nie może być celem administracyjnej operacji PP", () => {
    const context = createTempContext();
    const service = createAdminPointsService({
        db: context.db,
        getOrCreateUser: context.getOrCreateUser
    });

    try {
        assert.throws(
            () => service.changePoints({
                adminUser: createUser("admin"),
                amount: 100,
                operation: ADMIN_POINT_OPERATIONS.ADD,
                targetUser: createUser("bot-target", {
                    bot: true
                })
            }),
            (error) => error.code === ADMIN_POINT_ERRORS.BOT_TARGET
        );
    } finally {
        context.close();
    }
});

test("historia administracyjnych operacji może być filtrowana po użytkowniku", () => {
    const context = createTempContext();
    const service = createAdminPointsService({
        db: context.db,
        getOrCreateUser: context.getOrCreateUser
    });

    try {
        service.changePoints({
            adminUser: createUser("admin"),
            amount: 100,
            operation: ADMIN_POINT_OPERATIONS.ADD,
            targetUser: createUser("history-a")
        });
        service.changePoints({
            adminUser: createUser("admin"),
            amount: 200,
            operation: ADMIN_POINT_OPERATIONS.ADD,
            targetUser: createUser("history-b")
        });

        const history = service.listHistory({
            limit: 10,
            targetDiscordId: "history-a"
        });

        assert.equal(history.length, 1);
        assert.equal(history[0].target_discord_id, "history-a");
    } finally {
        context.close();
    }
});

test("initializeDatabase tworzy tabelę admin_point_transactions niedestrukcyjnie", () => {
    const context = createTempContext();

    try {
        const table = context.db.prepare(`
            SELECT name
            FROM sqlite_master
            WHERE type = 'table'
              AND name = 'admin_point_transactions'
        `).get();
        const columns = context.db.prepare(`
            PRAGMA table_info(admin_point_transactions)
        `).all().map((column) => column.name);

        initializeDatabase(context.db);

        assert.equal(table.name, "admin_point_transactions");
        assert.deepEqual(columns, [
            "id",
            "target_user_id",
            "target_discord_id",
            "admin_discord_id",
            "operation",
            "amount",
            "balance_before",
            "balance_after",
            "reason",
            "created_at"
        ]);
    } finally {
        context.close();
    }
});
