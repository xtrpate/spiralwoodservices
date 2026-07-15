require("dotenv").config();
const pool = require("./config/db");
const readline = require("readline");

// ══════════════════════════════════════════════════════════════════════════
// SAFEGUARDS — this script permanently deletes customer accounts, orders,
// payments, blueprints, warranties, and appointments. It must never run
// against a live/production database by accident, and it must never be
// runnable simply because some environment variable happens to be unset.
// ══════════════════════════════════════════════════════════════════════════

const ALLOWED_NODE_ENVS = new Set(["development", "test"]);

function enforceSafeguardsOrExit() {
  const nodeEnv = process.env.NODE_ENV;
  const dbName = process.env.DB_NAME;
  const dbHost = process.env.DB_HOST;
  const allowWipe = process.env.ALLOW_DB_WIPE;

  // NODE_ENV must be an explicit allow-listed value — NOT "anything except
  // production". An unset/undefined NODE_ENV must fail this check too, so
  // the script can never run "accidentally" just because NODE_ENV was
  // never configured in a given shell.
  if (!ALLOWED_NODE_ENVS.has(nodeEnv)) {
    console.error(
      `❌ Refusing to run wipe-db.js: NODE_ENV is "${nodeEnv ?? "(unset)"}". ` +
        `This script only runs when NODE_ENV is exactly "development" or "test".`,
    );
    process.exit(1);
  }

  // DB_NAME must be present. The old placeholder fallback of
  // "(unknown database)" defeated the entire point of the "type the
  // database name to confirm" step below — typing that literal string
  // back would have been a meaningless confirmation.
  if (!dbName || !dbName.trim()) {
    console.error(
      "❌ Refusing to run wipe-db.js: DB_NAME is not set. Refusing to " +
        'confirm against a placeholder like "(unknown database)".',
    );
    process.exit(1);
  }

  // A separate, explicit opt-in beyond just having a valid dev/test
  // NODE_ENV — a deliberate extra step so this script can never fire from
  // a stray or copy-pasted command in a session that merely happens to
  // have NODE_ENV=development set for unrelated reasons.
  if (allowWipe !== "true") {
    console.error(
      "❌ Refusing to run wipe-db.js: set ALLOW_DB_WIPE=true explicitly to " +
        "opt in before running this script.",
    );
    process.exit(1);
  }

  // Not a gate by itself — maximum visibility into exactly which server
  // this is about to hit, since DB_HOST is the one setting that actually
  // distinguishes a local dev database from a shared/remote one.
  // Intentionally no "remote dev database" exception exists here: the
  // same DB_NAME-typing + ALLOW_DB_WIPE opt-in is required either way,
  // regardless of what DB_HOST points to.
  console.log(`   DB_HOST:  "${dbHost || "(unset)"}"`);
  console.log(`   DB_NAME:  "${dbName}"`);
  console.log(`   NODE_ENV: "${nodeEnv}"`);

  return dbName;
}

// Require the operator to type the database name to confirm, so a
// misclick or copy-pasted command can't wipe data unintentionally.
function askConfirmation(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => rl.question(question, (answer) => {
    rl.close();
    resolve(answer);
  }));
}

async function confirmAndRun() {
  const dbName = enforceSafeguardsOrExit();

  console.log(`\n⚠️  You are about to WIPE the database: "${dbName}"`);
  console.log("   This deletes ALL customer accounts, orders, payments,");
  console.log("   blueprints, warranties, and appointments. This cannot be undone.");
  const answer = await askConfirmation(
    `\nType the database name ("${dbName}") to confirm, or anything else to cancel: `,
  );

  if (answer.trim() !== dbName) {
    console.log("\n🛑 Cancelled. No changes were made.");
    process.exit(0);
  }

  await wipeDatabase();

  // Close the pool explicitly now that the one connection used throughout
  // wipeDatabase() has been released back to it — otherwise the open pool
  // keeps the Node process alive indefinitely.
  await pool.end();
  process.exit(process.exitCode || 0);
}

// ══════════════════════════════════════════════════════════════════════════
// USER FOREIGN-KEY INVENTORY (verified directly against the live schema —
// every "FOREIGN KEY (...) REFERENCES `users`" constraint in the SQL
// backup, 29 total). Each is classified below into exactly one bucket:
//
//   ALREADY REMOVED — the referencing table is itself in
//   REQUIRED_TABLES_TO_TRUNCATE, so the row (and the reference) is gone
//   before customer deletion is ever reached:
//     appointments.request_owner_id, blueprint_revisions.revised_by,
//     blueprints.creator_id, blueprints.client_id,
//     blueprints.assigned_staff_id, cancellations.requested_by,
//     cancellations.approved_by, contracts.customer_id,
//     contracts.authorized_by, deliveries.driver_id,
//     estimations.approved_by, orders.customer_id,
//     payment_transactions.verified_by, project_tasks.assigned_by,
//     project_tasks.assigned_to, receipts.issued_by,
//     stock_movements.created_by, warranties.customer_id,
//     warranties.fulfilled_by
//
//   CUSTOMER-OWNED EPHEMERAL — deleted explicitly, customer rows only,
//   AFTER FOREIGN_KEY_CHECKS is restored:
//     customer_carts.customer_id   (ON DELETE CASCADE in schema — added to
//                                    REQUIRED_TABLES_TO_TRUNCATE below,
//                                    since every row in this table belongs
//                                    to a customer by design)
//     password_resets.user_id      (ON DELETE CASCADE in schema)
//     user_sessions.user_id        (ON DELETE CASCADE in schema)
//     notifications.user_id        (ON DELETE CASCADE in schema)
//
//   HISTORICAL/AUDIT, PRESERVE ROW — nullable actor reference, set to NULL
//   for customer users before deletion (nullability verified directly
//   against the schema: all six are `DEFAULT NULL`, no NOT NULL
//   constraint):
//     audit_logs.user_id, backup_logs.triggered_by, faqs.created_by,
//     static_pages.updated_by, website_settings.updated_by,
//     users.approved_by (self-referencing; customers are never
//     legitimately referenced here in normal use — nulled out
//     defensively for any row that happens to point at a customer id)
//
//   UNHANDLED/BLOCKING — none found. Every FK referencing users.id falls
//   into one of the three buckets above; there is no remaining non-null,
//   restrictive reference left unaddressed.
// ══════════════════════════════════════════════════════════════════════════

// Tables that MUST exist and MUST successfully truncate for this script to
// be considered to have done its job. A failure on any of these — missing
// at preflight, or failing mid-TRUNCATE — is fatal: the script throws,
// skips the SUCCESS message, and exits non-zero. Silently continuing past
// a required-table failure is exactly the class of bug this whole fix
// exists to prevent (see: estimations/estimation_items previously being
// entirely absent from this list, which is the actual mechanical root
// cause of the blueprint lifecycle corruption this project audited).
//
// Order matters: child tables (rows holding a foreign key into another
// table in this list) are truncated BEFORE the parent table they
// reference, even though FOREIGN_KEY_CHECKS is disabled below — this
// keeps the script correct if that safeguard is ever removed.
//
// Column relationships used to derive this order (verified directly
// against the live schema, not the project docx, which is out of date —
// e.g. it lists no `stock_movements` FK and a `cart_items` table that
// does not actually exist):
//   estimation_items.estimation_id      -> estimations.id
//   estimation_items.component_id       -> blueprint_components.id
//   estimations.blueprint_id            -> blueprints.id
//   blueprint_components.blueprint_id   -> blueprints.id
//   blueprint_revisions.blueprint_id    -> blueprints.id
//   project_tasks.blueprint_id          -> blueprints.id
//   project_tasks.order_id              -> orders.id
//   stock_movements.order_id            -> orders.id
//   stock_movements.order_item_id       -> order_items.id
//   warranties.order_id                 -> orders.id
//   warranties.order_item_id            -> order_items.id
//   order_items.order_id                -> orders.id
//   deliveries.order_id                 -> orders.id
//   payment_transactions.order_id       -> orders.id
//   appointments.order_id               -> orders.id
//   cancellations.order_id              -> orders.id
//   receipts.order_id                   -> orders.id
//   contracts.order_id / .blueprint_id  -> orders.id / blueprints.id (no FK constraint in schema, logical only)
//   custom_order_messages.order_id      -> orders.id (no FK constraint, logical only)
//   custom_order_attachments.order_id   -> orders.id (no FK constraint, logical only)
//   orders.blueprint_id                 -> blueprints.id
//   orders.custom_request_id            -> custom_requests.id (no FK constraint, logical only)
//   custom_request_items.custom_request_id     -> custom_requests.id (no FK constraint, logical only)
//   custom_request_images.custom_request_id    -> custom_requests.id (no FK constraint, logical only)
//   custom_request_estimates.custom_request_id -> custom_requests.id (no FK constraint, logical only)
//   customer_carts.customer_id          -> users.id (no dependents of its own; position is not order-sensitive)
//
// Note: `custom_requests` itself has NO order_id or blueprint_id column
// (verified directly against the schema) — the relationship runs the
// other way, orders.custom_request_id -> custom_requests.id — so the
// custom-request block is placed AFTER orders/blueprints, not before.
const REQUIRED_TABLES_TO_TRUNCATE = [
  "appointments",
  "estimation_items",
  "blueprint_components",
  "blueprint_revisions",
  "estimations",
  "project_tasks",
  "contracts",
  "stock_movements",
  "warranties",
  "order_items",
  "deliveries",
  "payment_transactions",
  "cancellations",
  "receipts",
  "custom_order_messages",
  "custom_order_attachments",
  "orders",
  "blueprints",
  "custom_request_estimates",
  "custom_request_images",
  "custom_request_items",
  "custom_requests",
  "customer_carts",
];

// Legacy/possibly-nonexistent table names. None of these three currently
// exist in the live schema (verified against information_schema; the
// real cart table is `customer_carts`, already required above). Kept
// deliberately separate from REQUIRED_TABLES_TO_TRUNCATE: a missing or
// failing table here is logged and skipped, never fatal — unlike a
// required table, whose absence must abort the whole script before any
// change is made.
const OPTIONAL_LEGACY_TABLE_NAMES = ["cart_items", "custom_cart_items", "reviews"];

// Tables touched during the POST-FK-restore customer cleanup phase —
// targeted DELETE for customer-owned ephemeral rows, targeted
// UPDATE ... SET ... = NULL for nullable historical actor references.
// Preflighted alongside the truncate list so nothing destructive in
// either phase can ever hit a missing table mid-script.
const CUSTOMER_CLEANUP_TABLES = [
  "password_resets",
  "user_sessions",
  "notifications",
  "audit_logs",
  "backup_logs",
  "faqs",
  "static_pages",
  "website_settings",
  "users",
];

// Preflight: confirm every table this script will touch — in either the
// truncate phase or the customer-cleanup phase — actually exists in this
// exact database before touching anything. Returns the list of missing
// table names, empty if everything required is present.
async function preflightCheckTables(conn, dbName, tableNames) {
  const placeholders = tableNames.map(() => "?").join(",");

  const [rows] = await conn.query(
    `SELECT TABLE_NAME
     FROM information_schema.tables
     WHERE TABLE_SCHEMA = ?
       AND TABLE_NAME IN (${placeholders})`,
    [dbName, ...tableNames],
  );

  const existing = new Set(rows.map((row) => row.TABLE_NAME));
  return tableNames.filter((table) => !existing.has(table));
}

async function wipeDatabase() {
  const dbName = process.env.DB_NAME;

  // FOREIGN_KEY_CHECKS is a SESSION-level MySQL/MariaDB setting. Using
  // pool.query() for each statement gives no guarantee that any two calls
  // land on the same physical connection out of the pool — disabling the
  // check on one connection and truncating on another would silently
  // leave FK enforcement ON for the truncates, defeating the whole
  // purpose. Every operation in this function therefore runs on exactly
  // one checked-out connection, obtained once here and released in the
  // finally block below.
  let conn;
  let success = false;

  try {
    conn = await pool.getConnection();

    console.log("⏳ Starting database wipe...");

    // ── Preflight — abort before any change if a table required for
    //    either the truncate phase or the customer-cleanup phase is
    //    missing. No TRUNCATE, no FOREIGN_KEY_CHECKS toggle, nothing has
    //    happened to the database yet at this point.
    const allRequiredTables = [
      ...REQUIRED_TABLES_TO_TRUNCATE,
      ...CUSTOMER_CLEANUP_TABLES,
    ];
    const missing = await preflightCheckTables(conn, dbName, allRequiredTables);

    if (missing.length) {
      console.error(
        "❌ Aborting before any change: the following REQUIRED tables were " +
          "not found in this database:",
      );
      missing.forEach((table) => console.error(`   - ${table}`));
      console.error(
        "No TRUNCATE or DELETE has been run and no data has been changed. " +
          "Fix the schema or this table list before retrying.",
      );
      throw new Error(`Missing required tables: ${missing.join(", ")}`);
    }

    // ── 1. Disable Foreign Key Checks — ONLY for the TRUNCATE section
    //    below. Set on the single dedicated connection above.
    await conn.query("SET FOREIGN_KEY_CHECKS = 0;");

    // ── 2. Wipe every REQUIRED table in dependency-safe order (see the
    //    full column-relationship documentation above the table list).
    //
    //    IMPORTANT: TRUNCATE TABLE is DDL and auto-commits immediately in
    //    MySQL/MariaDB — it cannot be wrapped in a transaction and cannot
    //    be rolled back. If a REQUIRED table's TRUNCATE fails partway
    //    through this loop, every table truncated before it in this run
    //    is already permanently gone, and every table after it is not:
    //    the database is left in a genuinely partial state. That is why a
    //    required-table failure throws immediately here instead of being
    //    logged and skipped — continuing silently past a partial wipe
    //    while still reporting SUCCESS is exactly the failure mode that
    //    produced the original stale-estimation bug this script exists to
    //    prevent a recurrence of.
    for (const table of REQUIRED_TABLES_TO_TRUNCATE) {
      await conn.query(`TRUNCATE TABLE ${table};`);
      console.log(`✅ Wiped table: ${table}`);
    }

    // Legacy/nonexistent table names — safe to skip silently, never fatal.
    for (const table of OPTIONAL_LEGACY_TABLE_NAMES) {
      try {
        await conn.query(`TRUNCATE TABLE ${table};`);
        console.log(`✅ Wiped table: ${table}`);
      } catch (err) {
        console.log(`⚠️ Skipped optional/legacy table: ${table} (does not exist)`);
      }
    }

    // ── 3. Restore Foreign Key Checks — BEFORE any user-related write.
    //    Customer deletion must never run with FK enforcement disabled:
    //    customer_carts, password_resets, user_sessions, and
    //    notifications all declare ON DELETE CASCADE in the schema, and
    //    relying on that cascade while checks are off would silently skip
    //    it entirely, leaving orphaned rows behind — the exact class of
    //    bug this whole project exists to eliminate. Restoration is
    //    confirmed by reading the session variable back, not assumed
    //    from the absence of a thrown error.
    await conn.query("SET FOREIGN_KEY_CHECKS = 1;");

    const [[fkCheckRow]] = await conn.query("SELECT @@FOREIGN_KEY_CHECKS AS v;");
    const fkChecksRestored = Number(fkCheckRow?.v) === 1;

    if (!fkChecksRestored) {
      throw new Error(
        "FOREIGN_KEY_CHECKS did not report back as restored (1) after " +
          "re-enabling it. Refusing to touch any customer data or " +
          "accounts while this is unconfirmed.",
      );
    }

    console.log("✅ FOREIGN_KEY_CHECKS restored and confirmed ON.");

    // ── 4. Customer-owned ephemeral rows — targeted, customer-only
    //    deletes. Run explicitly rather than relying on ON DELETE CASCADE
    //    on the later `DELETE FROM users`, so behavior does not silently
    //    depend on cascade semantics matching intent for every table.
    console.log("🗑️ Deleting customer password reset tokens...");
    await conn.query(`
      DELETE pr FROM password_resets pr
      JOIN users u ON pr.user_id = u.id
      WHERE u.role = 'customer';
    `);

    console.log("🗑️ Deleting customer sessions...");
    await conn.query(`
      DELETE s FROM user_sessions s
      JOIN users u ON s.user_id = u.id
      WHERE u.role = 'customer';
    `);

    console.log("🗑️ Deleting customer notifications...");
    await conn.query(`
      DELETE n FROM notifications n
      JOIN users u ON n.user_id = u.id
      WHERE u.role = 'customer';
    `);

    // ── 5. Historical/audit rows — preserve the row itself, clear only
    //    the customer reference. All six columns below are nullable in
    //    the live schema (`DEFAULT NULL`, no NOT NULL constraint) —
    //    verified directly, not assumed.
    console.log("🧹 Clearing customer references from historical/audit records...");
    await conn.query(`
      UPDATE audit_logs al
      JOIN users u ON al.user_id = u.id
      SET al.user_id = NULL
      WHERE u.role = 'customer';
    `);
    await conn.query(`
      UPDATE backup_logs bl
      JOIN users u ON bl.triggered_by = u.id
      SET bl.triggered_by = NULL
      WHERE u.role = 'customer';
    `);
    await conn.query(`
      UPDATE faqs f
      JOIN users u ON f.created_by = u.id
      SET f.created_by = NULL
      WHERE u.role = 'customer';
    `);
    await conn.query(`
      UPDATE static_pages sp
      JOIN users u ON sp.updated_by = u.id
      SET sp.updated_by = NULL
      WHERE u.role = 'customer';
    `);
    await conn.query(`
      UPDATE website_settings ws
      JOIN users u ON ws.updated_by = u.id
      SET ws.updated_by = NULL
      WHERE u.role = 'customer';
    `);
    // users.approved_by is self-referencing (records which admin approved
    // a staff account). Customers are never legitimately referenced by
    // this column in normal use, but it is nulled out defensively for
    // any row that happens to point at a customer id before that id is
    // deleted below. The derived-table wrap works around MySQL's
    // restriction on selecting from the same table being updated.
    await conn.query(`
      UPDATE users
      SET approved_by = NULL
      WHERE approved_by IN (
        SELECT id FROM (SELECT id FROM users WHERE role = 'customer') AS customer_ids
      );
    `);

    // ── 6. Customer accounts themselves — only now, with FK checks
    //    confirmed ON and every referencing table already cleaned or
    //    nulled above.
    console.log("🗑️ Deleting customer accounts...");
    const [customerResult] = await conn.query(
      "DELETE FROM users WHERE role = 'customer';",
    );
    console.log(
      `✅ Deleted ${customerResult.affectedRows} customer account(s).`,
    );

    success = true;
  } catch (error) {
    console.error("\n❌ ERROR WIPING DATABASE:", error.message || error);
    console.error(
      "This may have left a PARTIAL wipe in place — TRUNCATE auto-commits " +
        "per statement and cannot be rolled back, and any customer-cleanup " +
        "step that ran before the failure is not undone. Review the log " +
        "above for exactly which steps succeeded before the failure.",
    );
    process.exitCode = 1;
  } finally {
    // Backup restoration attempt. The primary restoration + confirmation
    // already happened above, mid-flow, before any customer-related
    // write. This is a defensive backstop only, in case something threw
    // earlier — e.g. during the TRUNCATE loop itself — before that point
    // was ever reached.
    if (conn) {
      try {
        await conn.query("SET FOREIGN_KEY_CHECKS = 1;");
      } catch (restoreErr) {
        console.error(
          "⚠️ Failed to restore FOREIGN_KEY_CHECKS in cleanup:",
          restoreErr.message || restoreErr,
        );
      }
      conn.release();
    }
  }

  // Only ever printed when every required table truncated successfully,
  // FOREIGN_KEY_CHECKS was confirmed restored, every customer-cleanup
  // step succeeded, and customer deletion itself succeeded.
  if (success) {
    console.log(
      "\n🎉 SUCCESS! All customer accounts, transactions, and ALL blueprints have been completely wiped.",
    );
  }
}

confirmAndRun().catch((err) => {
  console.error("\n❌ Unexpected error:", err);
  process.exit(1);
});
