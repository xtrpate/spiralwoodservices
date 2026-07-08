require("dotenv").config();
const pool = require("./config/db");
const readline = require("readline");

// ══════════════════════════════════════════════════════════════════════════
// SAFEGUARDS — this script permanently deletes customer accounts, orders,
// payments, blueprints, warranties, and appointments. It must never run
// against a live/production database by accident.
// ══════════════════════════════════════════════════════════════════════════

// 1. Hard block if this is pointed at a production environment.
if (process.env.NODE_ENV === "production") {
  console.error(
    "❌ Refusing to run wipe-db.js: NODE_ENV is 'production'. " +
      "This script is for local/dev databases only.",
  );
  process.exit(1);
}

// 2. Require the operator to type the database name to confirm, so a
//    misclick or copy-pasted command can't wipe data unintentionally.
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
  const dbName = process.env.DB_NAME || "(unknown database)";
  console.log(`⚠️  You are about to WIPE the database: "${dbName}"`);
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
}

async function wipeDatabase() {
  try {
    console.log("⏳ Starting database wipe...");

    // 1. Temporarily disable Foreign Key Checks so MySQL doesn't block the deletions
    await pool.query("SET FOREIGN_KEY_CHECKS = 0;");

    // 2. Wipe all transaction and blueprint tables and reset their ID counters to 1
    const tablesToTruncate = [
      "custom_order_attachments",
      "custom_order_messages",
      "payment_transactions",
      "deliveries",
      "warranties",
      "appointments",
      "contracts",
      "cancellations",
      "project_tasks",
      "order_items",
      "orders",
      "cart_items",
      "custom_cart_items",
      "reviews",
      "blueprint_revisions",
      "blueprint_components",
      "blueprints",
      "receipts",
    ];

    for (const table of tablesToTruncate) {
      try {
        await pool.query(`TRUNCATE TABLE ${table};`);
        console.log(`✅ Wiped table: ${table}`);
      } catch (err) {
        console.log(`⚠️ Skipped table: ${table} (May not exist)`);
      }
    }

    // 3. Delete all Notifications belonging to Customers
    console.log("🗑️ Deleting customer notifications...");
    try {
      await pool.query(`
        DELETE n FROM notifications n
        JOIN users u ON n.user_id = u.id
        WHERE u.role = 'customer';
      `);
    } catch (e) {}

    // 4. Finally, delete the Customer accounts
    console.log("🗑️ Deleting customer accounts...");
    const [customerResult] = await pool.query(
      "DELETE FROM users WHERE role = 'customer';",
    );
    console.log(
      `✅ Deleted ${customerResult.affectedRows} customer account(s).`,
    );

    // 5. Turn Foreign Key Checks back on
    await pool.query("SET FOREIGN_KEY_CHECKS = 1;");

    console.log(
      "\n🎉 SUCCESS! All customer accounts, transactions, and ALL blueprints have been completely wiped.",
    );
    process.exit(0);
  } catch (error) {
    console.error("\n❌ ERROR WIPING DATABASE:", error);

    // Ensure checks are turned back on even if it fails
    try {
      await pool.query("SET FOREIGN_KEY_CHECKS = 1;");
    } catch (e) {}

    process.exit(1);
  }
}

confirmAndRun();