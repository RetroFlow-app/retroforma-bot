const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const Database = require("better-sqlite3");
const { PermissionFlagsBits } = require("discord.js");

const adminXpPanel = require("../src/commands/adminXpCommand");
const {
    ADMIN_XP_ERRORS,
    ADMIN_XP_OPERATIONS,
    MAX_ADMIN_XP_AMOUNT,
    createAdminXpService
} = require("../src/services/adminXpService");
const { createAdminXpRepository } = require("../src/services/adminXpRepository");
const { initializeDatabase } = require("../src/database/schema");

function createTempContext() {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "retroforma-admin-xp-"));
    const db = new Database(path.join(tempDir, "database.db"));

    initializeDatabase(db);

    function getOrCreateUser(member) {
        const user = member.user || member;
        const username = user.tag || user.username || "Kadet XP";
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
                current_streak = ?,
                best_streak = ?,
                missions_completed = ?
            WHERE discord_id = ?
        `).run(
            stats.pp ?? 0,
            stats.ppTotalEarned ?? stats.pp ?? 0,
            stats.xp ?? 0,
            stats.level ?? 1,
            stats.currentStreak ?? 0,
            stats.bestStreak ?? 0,
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
            FROM admin_xp_transactions
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
    operation = ADMIN_XP_OPERATIONS.ADD,
    permissions = [PermissionFlagsBits.ManageGuild],
    reason = "Test XP",
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
        ...overrides
    };
}

function getCommand(name) {
    return adminXpPanel.commands.find((command) => command.data.name === name);
}

test("komenda /admin-xp jest zarejestrowana z wymaganymi opcjami", () => {
    const commandJson = getCommand("admin-xp").data.toJSON();
    const optionNames = commandJson.options.map((option) => option.name);

    assert.equal(commandJson.name, "admin-xp");
    assert.deepEqual(optionNames, ["użytkownik", "operacja", "ilość", "powód"]);
});

test("administrator może dodać XP i przeliczyć poziom", async () => {
    const context = createTempContext();
    const command = getCommand("admin-xp");
    const targetUser = createUser("target-xp-add");
    const interaction = createInteraction({
        amount: 400,
        operation: ADMIN_XP_OPERATIONS.ADD,
        targetUser
    });

    try {
        context.setUserStats(targetUser.id, {
            pp: 300,
            ppTotalEarned: 900,
            xp: 100,
            level: 1,
            missionsCompleted: 4
        });

        await command.execute(interaction, createCommandDependencies(context));

        const user = context.getUser(targetUser.id);
        const transactions = context.getTransactions();

        assert.deepEqual(interaction.calls.map((call) => call.name), ["deferReply", "editReply"]);
        assert.equal(user.xp, 500);
        assert.equal(user.level, 3);
        assert.equal(user.pp, 300);
        assert.equal(user.pp_total_earned, 900);
        assert.equal(user.missions_completed, 4);
        assert.equal(transactions.length, 1);
        assert.equal(transactions[0].target_user_id, user.id);
        assert.equal(transactions[0].operation, ADMIN_XP_OPERATIONS.ADD);
        assert.equal(transactions[0].xp_before, 100);
        assert.equal(transactions[0].xp_after, 500);
        assert.equal(transactions[0].level_after, 3);
    } finally {
        context.close();
    }
});

test("administrator może odjąć XP bez zejścia poniżej zera", () => {
    const context = createTempContext();
    const service = createAdminXpService({
        db: context.db,
        getOrCreateUser: context.getOrCreateUser
    });
    const targetUser = createUser("target-xp-subtract");

    try {
        context.setUserStats(targetUser.id, {
            xp: 150,
            level: 1
        });

        const result = service.changeXP({
            adminUser: createUser("admin"),
            amount: 250,
            operation: ADMIN_XP_OPERATIONS.SUBTRACT,
            targetUser
        });

        const user = context.getUser(targetUser.id);

        assert.equal(result.xpAfter, 0);
        assert.equal(user.xp, 0);
        assert.equal(user.level, 1);
    } finally {
        context.close();
    }
});

test("administrator może ustawić XP i poziom jest liczony z nowej wartości", () => {
    const context = createTempContext();
    const service = createAdminXpService({
        db: context.db,
        getOrCreateUser: context.getOrCreateUser
    });
    const targetUser = createUser("target-xp-set");

    try {
        context.setUserStats(targetUser.id, {
            xp: 100,
            level: 1
        });

        service.changeXP({
            adminUser: createUser("admin"),
            amount: 750,
            operation: ADMIN_XP_OPERATIONS.SET,
            targetUser
        });

        const user = context.getUser(targetUser.id);

        assert.equal(user.xp, 750);
        assert.equal(user.level, 4);
    } finally {
        context.close();
    }
});

test("administracyjna zmiana XP nie zmienia PP, total earned, inventory ani equipment", () => {
    const context = createTempContext();
    const service = createAdminXpService({
        db: context.db,
        getOrCreateUser: context.getOrCreateUser
    });
    const targetUser = createUser("target-xp-safe");

    try {
        context.setUserStats(targetUser.id, {
            pp: 800,
            ppTotalEarned: 1200,
            xp: 250,
            level: 2,
            currentStreak: 3,
            bestStreak: 8,
            missionsCompleted: 11
        });
        context.addOwnedAndEquippedItem(targetUser.id, "tlo-blueprint");

        const inventoryBefore = context.getInventoryRows();
        const equipmentBefore = context.getEquipmentRows();

        service.changeXP({
            adminUser: createUser("admin"),
            amount: 250,
            operation: ADMIN_XP_OPERATIONS.ADD,
            targetUser
        });

        const user = context.getUser(targetUser.id);

        assert.equal(user.pp, 800);
        assert.equal(user.pp_total_earned, 1200);
        assert.equal(user.current_streak, 3);
        assert.equal(user.best_streak, 8);
        assert.equal(user.missions_completed, 11);
        assert.deepEqual(context.getInventoryRows(), inventoryBefore);
        assert.deepEqual(context.getEquipmentRows(), equipmentBefore);
    } finally {
        context.close();
    }
});

test("zwykły użytkownik otrzymuje odmowę i komenda nie dotyka bazy", async () => {
    const context = createTempContext();
    const command = getCommand("admin-xp");
    const targetUser = createUser("target-xp-denied");
    const interaction = createInteraction({
        permissions: [],
        targetUser
    });

    try {
        await command.execute(interaction, createCommandDependencies(context, {
            adminXpService: {
                changeXP() {
                    throw new Error("SERVICE_SHOULD_NOT_BE_CALLED");
                }
            }
        }));

        assert.deepEqual(interaction.calls.map((call) => call.name), ["deferReply", "editReply"]);
        assert.equal(context.getUser(targetUser.id), undefined);
        assert.match(interaction.calls[1].payload.embeds[0].data.description, /uprawnień/);
    } finally {
        context.close();
    }
});

test("użytkownik spoza ADMIN_USER_IDS otrzymuje odmowę", async () => {
    const context = createTempContext();
    const command = getCommand("admin-xp");
    const interaction = createInteraction({
        adminUser: createUser("not-allowlisted"),
        permissions: [PermissionFlagsBits.Administrator]
    });

    try {
        await command.execute(interaction, createCommandDependencies(context, {
            adminXpService: {
                changeXP() {
                    throw new Error("SERVICE_SHOULD_NOT_BE_CALLED");
                }
            },
            env: {
                ADMIN_USER_IDS: "admin-allowed"
            }
        }));

        assert.deepEqual(interaction.calls.map((call) => call.name), ["deferReply", "editReply"]);
        assert.match(interaction.calls[1].payload.embeds[0].data.description, /uprawnień/);
    } finally {
        context.close();
    }
});

test("nie można podać zera, liczby ujemnej ani przekroczyć limitu", () => {
    const context = createTempContext();
    const service = createAdminXpService({
        db: context.db,
        getOrCreateUser: context.getOrCreateUser
    });

    try {
        assert.throws(
            () => service.changeXP({
                adminUser: createUser("admin"),
                amount: 0,
                operation: ADMIN_XP_OPERATIONS.ADD,
                targetUser: createUser("target-zero")
            }),
            (error) => error.code === ADMIN_XP_ERRORS.INVALID_AMOUNT
        );
        assert.throws(
            () => service.changeXP({
                adminUser: createUser("admin"),
                amount: -10,
                operation: ADMIN_XP_OPERATIONS.ADD,
                targetUser: createUser("target-negative")
            }),
            (error) => error.code === ADMIN_XP_ERRORS.INVALID_AMOUNT
        );
        assert.throws(
            () => service.changeXP({
                adminUser: createUser("admin"),
                amount: MAX_ADMIN_XP_AMOUNT + 1,
                operation: ADMIN_XP_OPERATIONS.ADD,
                targetUser: createUser("target-limit")
            }),
            (error) => error.code === ADMIN_XP_ERRORS.AMOUNT_TOO_LARGE
        );
    } finally {
        context.close();
    }
});

test("awaria zapisu historii cofa zmianę XP i poziomu", () => {
    const context = createTempContext();
    const realRepository = createAdminXpRepository(context.db);
    const service = createAdminXpService({
        db: context.db,
        getOrCreateUser: context.getOrCreateUser,
        repository: {
            ...realRepository,
            saveTransaction() {
                throw new Error("AUDIT_LOG_DOWN");
            }
        }
    });
    const targetUser = createUser("target-xp-rollback");

    try {
        context.setUserStats(targetUser.id, {
            xp: 100,
            level: 1
        });

        assert.throws(
            () => service.changeXP({
                adminUser: createUser("admin"),
                amount: 400,
                operation: ADMIN_XP_OPERATIONS.ADD,
                targetUser
            }),
            /AUDIT_LOG_DOWN/
        );
        assert.equal(context.getUser(targetUser.id).xp, 100);
        assert.equal(context.getUser(targetUser.id).level, 1);
        assert.equal(context.getTransactions().length, 0);
    } finally {
        context.close();
    }
});

test("bot nie może być celem administracyjnej operacji XP", () => {
    const context = createTempContext();
    const service = createAdminXpService({
        db: context.db,
        getOrCreateUser: context.getOrCreateUser
    });

    try {
        assert.throws(
            () => service.changeXP({
                adminUser: createUser("admin"),
                amount: 100,
                operation: ADMIN_XP_OPERATIONS.ADD,
                targetUser: createUser("bot-target", {
                    bot: true
                })
            }),
            (error) => error.code === ADMIN_XP_ERRORS.BOT_TARGET
        );
    } finally {
        context.close();
    }
});

test("initializeDatabase tworzy tabelę admin_xp_transactions niedestrukcyjnie", () => {
    const context = createTempContext();

    try {
        const columns = context.db.prepare(`
            PRAGMA table_info(admin_xp_transactions)
        `).all().map((column) => column.name);

        initializeDatabase(context.db);

        assert.deepEqual(columns, [
            "id",
            "target_user_id",
            "target_discord_id",
            "admin_discord_id",
            "operation",
            "amount",
            "xp_before",
            "xp_after",
            "level_before",
            "level_after",
            "reason",
            "created_at"
        ]);
    } finally {
        context.close();
    }
});

test("błąd bazy nie kończy się brakiem odpowiedzi Discorda", async () => {
    const context = createTempContext();
    const command = getCommand("admin-xp");
    const interaction = createInteraction();
    const logger = createLogger();

    try {
        await command.execute(interaction, createCommandDependencies(context, {
            adminXpService: {
                changeXP() {
                    throw new Error("DATABASE_DOWN");
                }
            },
            logger
        }));

        assert.deepEqual(interaction.calls.map((call) => call.name), ["deferReply", "editReply"]);
        assert.match(interaction.calls[1].payload.embeds[0].data.description, /Nie udało się zmienić XP/);
        assert.equal(logger.errors.some((message) => message.includes("DATABASE_DOWN")), true);
    } finally {
        context.close();
    }
});
