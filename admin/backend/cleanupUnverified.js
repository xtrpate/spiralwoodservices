require("dotenv").config();
const pool = require("./config/db");

async function removeUnverifiedUsers() {
  try {
    console.log("⏳ Starting targeted cleanup of unverified accounts...");

    // 1. Temporarily disable Foreign Key Checks to prevent constraint errors
    await pool.query("SET FOREIGN_KEY_CHECKS = 0;");

    // 2. Clean up orphaned records (e.g., notifications) tied to these unverified accounts
    console.log("🗑️ Removing related notifications...");
    await pool.query(`
      DELETE n FROM notifications n
      JOIN users u ON n.user_id = u.id
      WHERE u.role = 'customer' AND u.is_verified = 0;
    `);

    // 3. Delete the target unverified users
    console.log("🗑️ Deleting unverified customer accounts...");
    const [result] = await pool.query(
      "DELETE FROM users WHERE role = 'customer' AND is_verified = 0;"
    );

    // 4. Re-enable Foreign Key Checks
    await pool.query("SET FOREIGN_KEY_CHECKS = 1;");

    console.log(
      `\n✅ SUCCESS! System cleaned. Deleted ${result.affectedRows} unverified account(s).`
    );
    process.exit(0);
  } catch (error) {
    console.error("\n❌ CRITICAL ERROR DURING CLEANUP:", error);

    // Ensure system integrity by re-enabling checks even if execution fails
    try {
      await pool.query("SET FOREIGN_KEY_CHECKS = 1;");
    } catch (e) {
      console.error("Failed to restore foreign key checks:", e);
    }

    process.exit(1);
  }
}

removeUnverifiedUsers();