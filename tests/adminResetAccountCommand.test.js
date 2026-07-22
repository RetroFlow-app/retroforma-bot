const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const Database = require("better-sqlite3");
const { PermissionFlagsBits } = require("discord.js");

const adminResetPanel = require("../src/commands/adminResetAccountCommand");
const {
    ADMIN_RESET_SCOPES,
    createAdminResetAccountService
} = require("../src/services/adminResetAccountService");
const { createAdminResetAccountRepository } = require("../src/services/adminResetAccountRepository");
const { initializeDatabase } = require("../src/database/schema");

function createUser(id, options = {}) {
    return {
        bot: Boolean(options.bot),
        id,
        tag: options.tag || `Kadet#${id.slice(-4)}`,
        username: options.username || `Kadet-${id}`
    };
}

function createTempContext() {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "retroforma-admin-reset-"));
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

    function setUserStats(discordId, stats = {}) {
        getOrCreateUser(createUser(discordId));

        db.prepare(`
            UPDATE users
            SET pp = ?,
                pp_total_earned = ?,
                xp = ?,
                level = ?,
                current_streak = ?,
                best_streak = ?,
                last_submission_date = ?,
                missions_completed = ?
            WHERE discord_id = ?
        `).run(
            stats.pp ?? 900,
            stats.ppTotalEarned ?? 1200,
            stats.xp ?? 1800,
            stats.level ?? 8,
            stats.currentStreak ?? 4,
            stats.bestStreak ?? 9,
            stats.lastSubmissionDate ?? "2026-07-20",
            stats.missionsCompleted ?? 12,
            discordId
        );
    }

    function addOwnedAndEquippedItem(discordId, code = "tlo-blueprint") {
        const user = getOrCreateUser(createUser(discordId));
        const item = db.prepare(`
            SELECT *
            FROM shop_items
            WHERE code = ?
        `).get(code);

        db.prepare(`
            INSERT OR IGNORE INTO user_inventory (user_id, item_id, obtained_at)
            VALUES (?, ?, ?)
        `).run(user.id, item.id, new Date().toISOString());

        db.prepare(`
            INSERT OR REPLACE INTO user_equipment (user_id, slot, item_id, updated_at)
            VALUES (?, ?, ?, ?)
        `).run(user.id, "profile_theme", item.id, new Date().toISOString());
    }

    function addBadge(discordId, badgeId = "test_badge") {
        db.prepare(`
            INSERT OR IGNORE INTO badges (id, name, description, icon)
            VALUES (?, ?, ?, ?)
        `).run(badgeId, "Odznaka Testowa", "Opis testowy.", "T");

        db.prepare(`
            INSERT OR IGNORE INTO users_badges (discord_id, badge_id)
            VALUES (?, ?)
        `).run(discordId, badgeId);
    }

    function addSubmission(discordId) {
        db.prepare(`
            INSERT OR IGNORE INTO submissions (mission_id, discord_id, message_id, attachment_count, status, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
        `).run(1, discordId, `msg-${discordId}`, 2, "APPROVED", new Date().toISOString());
    }

    function addArsenal(discordId) {
        db.prepare(`
            INSERT OR IGNORE INTO arsenal_categories (id, name, description)
            VALUES (?, ?, ?)
        `).run("test-category", "Test", "Test");

        db.prepare(`
            INSERT OR IGNORE INTO arsenal_items (id, category_id, name, description, created_at)
            VALUES (?, ?, ?, ?, ?)
        `).run("test-item", "test-category", "Test Item", "Opis", new Date().toISOString());

        db.prepare(`
            INSERT OR IGNORE INTO users_arsenal_items (discord_id, item_id, unlocked_at)
            VALUES (?, ?, ?)
        `).run(discordId, "test-item", new Date().toISOString());

        db.prepare(`
            INSERT OR REPLACE INTO users_arsenal_loadout (discord_id, category_id, item_id, updated_at)
            VALUES (?, ?, ?, ?)
        `).run(discordId, "test-category", "test-item", new Date().toISOString());
    }

    function seedFullAccount(discordId) {
        setUserStats(discordId);
        addOwnedAndEquippedItem(discordId);
        addBadge(discordId);
        addSubmission(discordId);
        addArsenal(discordId);
    }

    function count(tableName, whereClause = "", params = []) {
        return db.prepare(`
            SELECT COUNT(*) AS count
            FROM ${tableName}
            ${whereClause}
        `).get(...params).count;
    }

    function getCounts(discordId) {
        const user = getUser(discordId);

        return {
            arsenalItems: count("users_arsenal_items", "WHERE discord_id = ?", [discordId]),
            arsenalLoadout: count("users_arsenal_loadout", "WHERE discord_id = ?", [discordId]),
            badges: count("users_badges", "WHERE discord_id = ?", [discordId]),
            equipment: user ? count("user_equipment", "WHERE user_id = ?", [user.id]) : 0,
            inventory: user ? count("user_inventory", "WHERE user_id = ?", [user.id]) : 0,
            submissions: count("submissions", "WHERE discord_id = ?", [discordId])
        };
    }

    function getResetTransactions() {
        return db.prepare(`
            SELECT *
            FROM admin_reset_transactions
            ORDER BY id ASC
        `).all();
    }

    return {
        addBadge,
        addOwnedAndEquippedItem,
        close: () => {
            db.close();
            fs.rmSync(tempDir, {
                recursive: true,
                force: true
            });
        },
        db,
        getCounts,
        getOrCreateUser,
        getResetTransactions,
        getUser,
        seedFullAccount,
        setUserStats
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

function createCommandInteraction({
    adminUser = createUser("admin-reset"),
    permissions = [PermissionFlagsBits.ManageGuild],
    reason = "Test resetu",
    scope = ADMIN_RESET_SCOPES.ALL,
    targetUser = createUser("target-reset")
} = {}) {
    const calls = [];

    return {
        calls,
        client: {},
        deferred: false,
        memberPermissions: createPermissions(permissions),
        options: createOptions({
            powód: reason,
            zakres: scope,
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

function createButtonInteraction(customId, {
    adminUser = createUser("admin-reset"),
    permissions = [PermissionFlagsBits.ManageGuild]
} = {}) {
    const calls = [];

    return {
        calls,
        client: {},
        customId,
        deferred: false,
        memberPermissions: createPermissions(permissions),
        replied: false,
        user: adminUser,
        async deferUpdate() {
            calls.push({
                name: "deferUpdate"
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
        },
        isButton() {
            return true;
        }
    };
}

function createDependencies(context, overrides = {}) {
    const logger = createLogger();
    const timeouts = [];

    return {
        clearTimeoutFn: () => {},
        db: context.db,
        env: {},
        getOrCreateUser: context.getOrCreateUser,
        logger,
        logToChannel: async () => {},
        setTimeoutFn: (callback) => {
            timeouts.push(callback);
            return callback;
        },
        timeouts,
        updateRankingMessage: async () => {},
        ...overrides
    };
}

function getCommand() {
    return adminResetPanel.command;
}

function getConfirmationPayload(interaction) {
    return interaction.calls.find((call) => call.name === "editReply").payload;
}

function getButtonCustomIds(payload) {
    const row = payload.components[0].toJSON();

    return row.components.map((component) => component.custom_id);
}

async function executeAndConfirmReset({ context, scope = ADMIN_RESET_SCOPES.ALL, targetUser = createUser("target-reset") }) {
    const command = getCommand();
    const adminUser = createUser("admin-reset");
    const commandInteraction = createCommandInteraction({
        adminUser,
        scope,
        targetUser
    });
    const dependencies = createDependencies(context);

    await command.execute(commandInteraction, dependencies);

    const [confirmCustomId] = getButtonCustomIds(getConfirmationPayload(commandInteraction));
    const buttonInteraction = createButtonInteraction(confirmCustomId, {
        adminUser
    });

    await adminResetPanel.handleAdminResetButton(buttonInteraction);

    return {
        buttonInteraction,
        commandInteraction
    };
}

test("komenda /admin-reset-konto jest zarejestrowana z wymaganymi opcjami", () => {
    const commandJson = getCommand().data.toJSON();
    const optionNames = commandJson.options.map((option) => option.name);
    const scopeChoices = commandJson.options
        .find((option) => option.name === "zakres")
        .choices
        .map((choice) => choice.value);

    assert.equal(commandJson.name, "admin-reset-konto");
    assert.deepEqual(optionNames, ["użytkownik", "zakres", "powód"]);
    assert.deepEqual(scopeChoices, [
        ADMIN_RESET_SCOPES.ALL,
        ADMIN_RESET_SCOPES.POINTS_ONLY,
        ADMIN_RESET_SCOPES.PROFILE_ONLY,
        ADMIN_RESET_SCOPES.SHOP_ONLY
    ]);
});

test("administrator moze wykonac reset dopiero po potwierdzeniu", async () => {
    const context = createTempContext();
    const targetUser = createUser("target-confirm");

    try {
        context.seedFullAccount(targetUser.id);

        const { buttonInteraction, commandInteraction } = await executeAndConfirmReset({
            context,
            targetUser
        });
        const user = context.getUser(targetUser.id);

        assert.deepEqual(commandInteraction.calls.map((call) => call.name), ["deferReply", "editReply"]);
        assert.deepEqual(buttonInteraction.calls.map((call) => call.name), ["deferUpdate", "editReply"]);
        assert.equal(user.pp, 0);
        assert.equal(user.pp_total_earned, 0);
        assert.match(buttonInteraction.calls[1].payload.embeds[0].data.title, /Konto zostało zresetowane/);
    } finally {
        context.close();
        adminResetPanel.pendingResets.clear();
    }
});

test("zwykly uzytkownik nie moze rozpoczac resetu", async () => {
    const context = createTempContext();
    const interaction = createCommandInteraction({
        permissions: []
    });

    try {
        await getCommand().execute(interaction, createDependencies(context));

        assert.deepEqual(interaction.calls.map((call) => call.name), ["deferReply", "editReply"]);
        assert.match(interaction.calls[1].payload.embeds[0].data.description, /Nie masz uprawnień/);
        assert.equal(adminResetPanel.pendingResets.size, 0);
    } finally {
        context.close();
        adminResetPanel.pendingResets.clear();
    }
});

test("administrator spoza ADMIN_USER_IDS nie moze rozpoczac resetu", async () => {
    const context = createTempContext();
    const interaction = createCommandInteraction({
        adminUser: createUser("admin-spoza-listy"),
        permissions: [PermissionFlagsBits.Administrator]
    });

    try {
        await getCommand().execute(interaction, createDependencies(context, {
            env: {
                ADMIN_USER_IDS: "admin-dozwolony"
            }
        }));

        assert.deepEqual(interaction.calls.map((call) => call.name), ["deferReply", "editReply"]);
        assert.match(interaction.calls[1].payload.embeds[0].data.description, /Nie masz uprawnień/);
        assert.equal(adminResetPanel.pendingResets.size, 0);
    } finally {
        context.close();
        adminResetPanel.pendingResets.clear();
    }
});

test("anulowanie resetu usuwa oczekujaca operacje i nie zmienia konta", async () => {
    const context = createTempContext();
    const targetUser = createUser("target-cancel");
    const adminUser = createUser("admin-cancel");
    const interaction = createCommandInteraction({
        adminUser,
        targetUser
    });
    const dependencies = createDependencies(context);

    try {
        context.seedFullAccount(targetUser.id);

        await getCommand().execute(interaction, dependencies);

        const [, cancelCustomId] = getButtonCustomIds(getConfirmationPayload(interaction));
        const buttonInteraction = createButtonInteraction(cancelCustomId, {
            adminUser
        });

        await adminResetPanel.handleAdminResetButton(buttonInteraction);

        const user = context.getUser(targetUser.id);

        assert.equal(user.pp, 900);
        assert.equal(context.getResetTransactions().length, 0);
        assert.equal(adminResetPanel.pendingResets.size, 0);
        assert.match(buttonInteraction.calls[1].payload.embeds[0].data.title, /anulowany/i);
    } finally {
        context.close();
        adminResetPanel.pendingResets.clear();
    }
});

test("timeout anuluje reset po 60 sekundach bez zmian w bazie", async () => {
    const context = createTempContext();
    const targetUser = createUser("target-timeout");
    const interaction = createCommandInteraction({
        targetUser
    });
    const dependencies = createDependencies(context);

    try {
        context.seedFullAccount(targetUser.id);

        await getCommand().execute(interaction, dependencies);
        await dependencies.timeouts[0]();

        const user = context.getUser(targetUser.id);
        const lastEdit = interaction.calls.at(-1);

        assert.equal(user.pp, 900);
        assert.equal(context.getResetTransactions().length, 0);
        assert.equal(adminResetPanel.pendingResets.size, 0);
        assert.match(lastEdit.payload.embeds[0].data.description, /60 sekund/);
        assert.deepEqual(lastEdit.payload.components, []);
    } finally {
        context.close();
        adminResetPanel.pendingResets.clear();
    }
});

test("reset wszystko zeruje konto bez usuwania rekordu users", () => {
    const context = createTempContext();
    const service = createAdminResetAccountService({
        db: context.db,
        getOrCreateUser: context.getOrCreateUser
    });
    const targetUser = createUser("target-all");

    try {
        context.seedFullAccount(targetUser.id);

        const result = service.resetAccount({
            adminUser: createUser("admin"),
            reason: "Pelny reset",
            scope: ADMIN_RESET_SCOPES.ALL,
            targetUser
        });
        const user = context.getUser(targetUser.id);
        const counts = context.getCounts(targetUser.id);

        assert.equal(result.scope, ADMIN_RESET_SCOPES.ALL);
        assert.ok(user.id);
        assert.equal(user.pp, 0);
        assert.equal(user.pp_total_earned, 0);
        assert.equal(user.xp, 0);
        assert.equal(user.level, 1);
        assert.equal(user.current_streak, 0);
        assert.equal(user.best_streak, 0);
        assert.equal(user.last_submission_date, null);
        assert.equal(user.missions_completed, 0);
        assert.deepEqual(counts, {
            arsenalItems: 0,
            arsenalLoadout: 0,
            badges: 0,
            equipment: 0,
            inventory: 0,
            submissions: 0
        });
        assert.equal(context.getResetTransactions().length, 1);
        assert.equal(context.getResetTransactions()[0].target_user_id, user.id);
    } finally {
        context.close();
    }
});

test("reset tylko-pp zeruje PP i PP Total Earned bez ruszania profilu i sklepu", () => {
    const context = createTempContext();
    const service = createAdminResetAccountService({
        db: context.db,
        getOrCreateUser: context.getOrCreateUser
    });
    const targetUser = createUser("target-points");

    try {
        context.seedFullAccount(targetUser.id);

        service.resetAccount({
            adminUser: createUser("admin"),
            scope: ADMIN_RESET_SCOPES.POINTS_ONLY,
            targetUser
        });

        const user = context.getUser(targetUser.id);
        const counts = context.getCounts(targetUser.id);

        assert.equal(user.pp, 0);
        assert.equal(user.pp_total_earned, 0);
        assert.equal(user.xp, 1800);
        assert.equal(user.level, 8);
        assert.equal(user.missions_completed, 12);
        assert.equal(counts.inventory, 1);
        assert.equal(counts.equipment, 1);
        assert.equal(counts.badges, 1);
    } finally {
        context.close();
    }
});

test("reset tylko-profil zeruje XP, level i serie bez ruszania PP oraz zakupow", () => {
    const context = createTempContext();
    const service = createAdminResetAccountService({
        db: context.db,
        getOrCreateUser: context.getOrCreateUser
    });
    const targetUser = createUser("target-profile");

    try {
        context.seedFullAccount(targetUser.id);

        service.resetAccount({
            adminUser: createUser("admin"),
            scope: ADMIN_RESET_SCOPES.PROFILE_ONLY,
            targetUser
        });

        const user = context.getUser(targetUser.id);
        const counts = context.getCounts(targetUser.id);

        assert.equal(user.pp, 900);
        assert.equal(user.pp_total_earned, 1200);
        assert.equal(user.xp, 0);
        assert.equal(user.level, 1);
        assert.equal(user.current_streak, 0);
        assert.equal(user.best_streak, 0);
        assert.equal(user.last_submission_date, null);
        assert.equal(user.missions_completed, 0);
        assert.equal(counts.inventory, 1);
        assert.equal(counts.equipment, 1);
        assert.equal(counts.badges, 1);
    } finally {
        context.close();
    }
});

test("reset tylko-sklep usuwa inventory i equipment bez ruszania PP, XP i levelu", () => {
    const context = createTempContext();
    const service = createAdminResetAccountService({
        db: context.db,
        getOrCreateUser: context.getOrCreateUser
    });
    const targetUser = createUser("target-shop");

    try {
        context.seedFullAccount(targetUser.id);

        service.resetAccount({
            adminUser: createUser("admin"),
            scope: ADMIN_RESET_SCOPES.SHOP_ONLY,
            targetUser
        });

        const user = context.getUser(targetUser.id);
        const counts = context.getCounts(targetUser.id);

        assert.equal(user.pp, 900);
        assert.equal(user.pp_total_earned, 1200);
        assert.equal(user.xp, 1800);
        assert.equal(user.level, 8);
        assert.equal(counts.inventory, 0);
        assert.equal(counts.equipment, 0);
        assert.equal(counts.arsenalItems, 0);
        assert.equal(counts.arsenalLoadout, 0);
        assert.equal(counts.badges, 1);
        assert.equal(counts.submissions, 1);
    } finally {
        context.close();
    }
});

test("awaria zapisu historii wycofuje caly reset w jednej transakcji", () => {
    const context = createTempContext();
    const realRepository = createAdminResetAccountRepository(context.db);
    const service = createAdminResetAccountService({
        db: context.db,
        getOrCreateUser: context.getOrCreateUser,
        repository: {
            ...realRepository,
            saveTransaction() {
                throw new Error("RESET_HISTORY_DOWN");
            }
        }
    });
    const targetUser = createUser("target-rollback");

    try {
        context.seedFullAccount(targetUser.id);

        assert.throws(
            () => service.resetAccount({
                adminUser: createUser("admin"),
                scope: ADMIN_RESET_SCOPES.ALL,
                targetUser
            }),
            /RESET_HISTORY_DOWN/
        );

        const user = context.getUser(targetUser.id);
        const counts = context.getCounts(targetUser.id);

        assert.equal(user.pp, 900);
        assert.equal(user.pp_total_earned, 1200);
        assert.equal(user.xp, 1800);
        assert.equal(user.level, 8);
        assert.equal(counts.inventory, 1);
        assert.equal(counts.equipment, 1);
        assert.equal(counts.badges, 1);
        assert.equal(context.getResetTransactions().length, 0);
    } finally {
        context.close();
    }
});

test("initializeDatabase tworzy tabele admin_reset_transactions niedestrukcyjnie", () => {
    const context = createTempContext();

    try {
        const columns = context.db.prepare(`
            PRAGMA table_info(admin_reset_transactions)
        `).all().map((column) => column.name);

        initializeDatabase(context.db);

        assert.deepEqual(columns, [
            "id",
            "target_user_id",
            "target_discord_id",
            "admin_discord_id",
            "scope",
            "reason",
            "created_at"
        ]);
    } finally {
        context.close();
    }
});
