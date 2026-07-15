// controllers/managementController.js [SCHEMA-CORRECTED]
// Fixed: warranties join, contracts columns, backup_logs columns, orders.type/total
const pool = require("../../config/db");
const bcrypt = require("bcryptjs");
const {
  resolveLifecycleByOrder,
} = require("../../services/blueprintLifecycleService");

// ══ WARRANTY ══════════════════════════════════════════════════════════════════
exports.getAll = async (req, res) => {
  try {
    const { status, type, from, to, search, page = 1, limit = 20 } = req.query;
    const where = ["1=1"];
    const params = [];

    if (type) {
      where.push("o.type = ?");
      params.push(type);
    } // schema: o.type
    if (status) {
      where.push("w.status = ?");
      params.push(status);
    }
    if (from && to) {
      where.push("DATE(w.created_at) BETWEEN ? AND ?");
      params.push(from, to);
    }
    if (search) {
      where.push("(u.name LIKE ? OR w.product_name LIKE ?)");
      params.push(`%${search}%`, `%${search}%`);
    }

    const [rows] = await pool.query(
      `SELECT w.*,
              u.name  AS customer_name, u.email AS customer_email,
              o.type  AS order_channel,            -- schema: o.type not o.channel
              fa.name AS fulfilled_by_name
       FROM warranties w
       JOIN  users u  ON u.id  = w.customer_id
       LEFT JOIN orders o  ON o.id  = w.order_id
       LEFT JOIN users fa ON fa.id = w.fulfilled_by
       WHERE ${where.join(" AND ")}
       ORDER BY w.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), (parseInt(page) - 1) * parseInt(limit)],
    );

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM warranties w
       JOIN users u ON u.id = w.customer_id
       LEFT JOIN orders o ON o.id = w.order_id
       WHERE ${where.join(" AND ")}`,
      params,
    );

    res.json({ rows, total });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.updateStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const update = { status };
    if (status === "fulfilled") {
      update.fulfilled_by = req.user.id;
      update.fulfilled_at = new Date();
      if (req.file)
        update.replacement_receipt = `/uploads/warranty/${req.file.filename}`;
    }
    const sets = Object.keys(update)
      .map((k) => `${k} = ?`)
      .join(", ");

    // ── FIXED: Parsed ID ──
    await pool.query(`UPDATE warranties SET ${sets} WHERE id = ?`, [
      ...Object.values(update),
      parseInt(req.params.id),
    ]);
    res.json({ message: "Warranty claim updated." });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ══ CONTRACTS ════════════════════════════════════════════════════════════════
exports.getContracts = async (req, res) => {
  try {
    // ── FIXED: Added empty array [] ──
    const [rows] = await pool.query(
      `SELECT c.*,
              COALESCE(u.name, c.customer_name)   AS customer_name,
              u.email                              AS customer_email,
              o.total                              AS total_amount,   -- schema: total
              b.title                              AS blueprint_title,
              au.name                              AS issued_by_name
       FROM contracts c
       LEFT JOIN orders     o  ON o.id  = c.order_id
       LEFT JOIN users      u  ON u.id  = o.customer_id
       LEFT JOIN blueprints b  ON b.id  = c.blueprint_id
       LEFT JOIN users      au ON au.id = c.authorized_by
       ORDER BY c.created_at DESC`,
      [],
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Small local normalization helper, scoped to this file only — matches the
// same pattern already used in orderController.js/blueprintController.js.
const normalize = (value) => String(value || "").trim().toLowerCase();

exports.generateContract = async (req, res) => {
  // ── Strict order_id validation — reuses the same strict positive-int
  // parser already defined lower in this file for audit-log filtering
  // (accessible here via normal JS module scoping: this function's BODY
  // only runs once a request arrives, by which point the whole module,
  // including that later `const`, has already finished loading).
  const orderId = parsePositiveInt(req.body?.order_id);

  if (orderId === null) {
    return res
      .status(400)
      .json({ message: "order_id must be a positive integer." });
  }

  const requestedBlueprintId = req.body?.blueprint_id;
  const { terms, warranty_terms } = req.body || {};

  let conn = null;
  let transactionActive = false;
  let connectionReusable = true;

  try {
    conn = await pool.getConnection();
    await conn.beginTransaction();
    transactionActive = true;

    // Canonical resolution — order-first locking via lockOrder, blueprint
    // locked in the same call via lockBlueprint. The canonical blueprint
    // always comes from order.blueprint_id inside the resolver;
    // requestedBlueprintId (from req.body) is only ever used there as an
    // optional consistency check — never as the query/write source.
    const lifecycle = await resolveLifecycleByOrder(conn, {
      orderId,
      requestedBlueprintId,
      lockOrder: true,
      lockBlueprint: true,
    });

    if (!lifecycle.order) {
      await conn.rollback();
      transactionActive = false;
      return res.status(404).json({ message: "Order not found." });
    }

    // ── Gate A: canonical records ─────────────────────────────────────
    if (
      lifecycle.status !== "OK" ||
      !lifecycle.blueprint ||
      !lifecycle.estimation
    ) {
      await conn.rollback();
      transactionActive = false;
      return res.status(409).json({
        message:
          lifecycle.message ||
          "This order's blueprint lifecycle is not fully resolved (blocked, missing blueprint, or missing a lifecycle-valid estimation), so a contract cannot be generated.",
        integrity_reason: lifecycle.reason,
        conflicting_order_ids: lifecycle.conflicting_order_ids,
      });
    }

    const order = lifecycle.order;
    const blueprint = lifecycle.blueprint;
    const estimation = lifecycle.estimation;

    // ── Archived-blueprint guard — checked immediately after canonical
    // resolution, before any further gate. An archived blueprint must
    // never be restored or modified automatically here; this only
    // blocks contract generation against it.
    if (
      Number(blueprint.is_deleted) === 1 ||
      normalize(blueprint.stage) === "archived"
    ) {
      await conn.rollback();
      transactionActive = false;
      return res.status(409).json({
        message: "Cannot generate a contract for an archived blueprint.",
        integrity_reason: "BLUEPRINT_ARCHIVED",
      });
    }

    // ── Gate B: order state ───────────────────────────────────────────
    if (normalize(order.order_type) !== "blueprint") {
      await conn.rollback();
      transactionActive = false;
      return res.status(400).json({
        message: "Contracts can only be generated for blueprint orders.",
      });
    }

    if (normalize(order.status) !== "confirmed") {
      await conn.rollback();
      transactionActive = false;
      return res.status(400).json({
        message: `Order must be exactly "confirmed" to generate a contract (current status: "${order.status}").`,
      });
    }

    // Structurally guaranteed by the resolver's own canonical-source rule
    // (blueprint is always derived from order.blueprint_id), kept here as
    // an explicit, cheap final assertion rather than an implicit trust.
    if (Number(order.blueprint_id) !== Number(blueprint.id)) {
      await conn.rollback();
      transactionActive = false;
      return res.status(409).json({
        message:
          "Order's blueprint linkage does not match the resolved canonical blueprint.",
        integrity_reason: "ORDER_BLUEPRINT_MISMATCH",
      });
    }

    if (!order.customer_id) {
      await conn.rollback();
      transactionActive = false;
      return res.status(400).json({
        message:
          "Order has no linked customer account; a contract requires a registered customer.",
      });
    }

    // ── Gate C: estimation ────────────────────────────────────────────
    if (normalize(estimation.status) !== "approved") {
      await conn.rollback();
      transactionActive = false;
      return res.status(400).json({
        message: "Estimation must be approved before generating a contract.",
      });
    }

    const estimationGrandTotal = Number(estimation.grand_total || 0);

    if (!(estimationGrandTotal > 0)) {
      await conn.rollback();
      transactionActive = false;
      return res.status(400).json({
        message: "The approved estimation total must be greater than zero.",
      });
    }

    // ── Gate D: order financial values (orders.payment_status is never
    // trusted anywhere in this function — only payment_transactions rows
    // aggregated by the resolver are used as payment proof) ────────────
    const orderTotal = Number(order.total || 0);

    if (!(orderTotal > 0)) {
      await conn.rollback();
      transactionActive = false;
      return res.status(400).json({
        message: "Order total must be finalized before generating a contract.",
      });
    }

    if (Math.abs(orderTotal - estimationGrandTotal) > 0.01) {
      await conn.rollback();
      transactionActive = false;
      return res.status(400).json({
        message:
          "Order total does not match the approved estimation total. Refresh and re-save the estimation before continuing.",
      });
    }

    // ── Gate E: verified payment — payment_transactions only ─────────
    const requiredDownPayment = Number((estimationGrandTotal * 0.3).toFixed(2));
    const verifiedPaymentTotal = Number(lifecycle.verified_payment_total || 0);

    if (verifiedPaymentTotal < requiredDownPayment - 0.01) {
      await conn.rollback();
      transactionActive = false;
      return res.status(400).json({
        message: `Blueprint orders require at least a 30% verified down payment before a contract can be generated (required ${requiredDownPayment}, verified ${verifiedPaymentTotal}).`,
      });
    }

    // ── Gate F: duplicate prevention ──────────────────────────────────
    // Checked twice: once from the resolver's own contract lookup, and
    // again directly here as a final re-check on the now-locked order —
    // the lock acquired above via resolveLifecycleByOrder's lockOrder
    // means a concurrent double-click request serializes behind this
    // one rather than racing it.
    if (lifecycle.contract) {
      await conn.rollback();
      transactionActive = false;
      return res
        .status(409)
        .json({ message: "A contract already exists for this order." });
    }

    const [[existingContract]] = await conn.query(
      `SELECT id FROM contracts WHERE order_id = ? LIMIT 1`,
      [order.id],
    );

    if (existingContract) {
      await conn.rollback();
      transactionActive = false;
      return res
        .status(409)
        .json({ message: "A contract already exists for this order." });
    }

    // ── Server-derived customer name. The request body has never
    // contained a customer_name field in this function (confirmed by
    // inspection — only order_id, blueprint_id, terms, warranty_terms
    // were ever destructured here), so this was already safe; kept
    // explicit and re-derived from the canonical order/customer record
    // rather than assumed from anywhere else.
    const [[customerRow]] = await conn.query(
      `SELECT COALESCE(u.name, o.walkin_customer_name) AS customer_name
       FROM orders o
       LEFT JOIN users u ON u.id = o.customer_id
       WHERE o.id = ?
       LIMIT 1`,
      [order.id],
    );
    const customerName = customerRow?.customer_name || null;

    if (!customerName) {
      await conn.rollback();
      transactionActive = false;
      return res.status(400).json({
        message:
          "Could not resolve a customer name for this order; contract cannot be generated.",
      });
    }

    // ── Insert using ONLY canonical/server-derived values. terms and
    // warranty_terms remain client-supplied free-text content fields
    // (contract prose, not identity/financial data) — same as the
    // existing, unbroadened behavior. Dates, processing_fee_pct, and
    // is_non_refundable are left untouched, exactly as before (the
    // schema default applies to the two not explicitly set here). ─────
    const [insertResult] = await conn.query(
      `INSERT INTO contracts
         (order_id, blueprint_id, customer_id, customer_name, warranty_terms, materials_used, authorized_by, down_payment, start_date)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURDATE())`,
      [
        order.id,
        blueprint.id,
        order.customer_id,
        customerName,
        warranty_terms || null,
        terms || null,
        req.user.id,
        requiredDownPayment,
      ],
    );

    // ── Guarded order UPDATE — the ONE canonical locked order only,
    // never a blanket blueprint_id match. affectedRows is checked so the
    // contract just inserted can never be left without its matching
    // order transition if the locked row's state somehow no longer
    // matches by the time this runs. ──────────────────────────────────
    const [orderUpdateResult] = await conn.query(
      `UPDATE orders
       SET status = 'contract_released'
       WHERE id = ?
         AND order_type = 'blueprint'
         AND status = 'confirmed'`,
      [order.id],
    );

    if (orderUpdateResult.affectedRows === 0) {
      await conn.rollback();
      transactionActive = false;
      return res.status(409).json({
        message:
          "Order status changed before the contract could be finalized. Please refresh and try again.",
        integrity_reason: "ORDER_STATE_CHANGED",
      });
    }

    // Contract insert and order-status update are the atomic core — both
    // succeed or both roll back together. No notification, audit, or PDF
    // side effect happens before this commit.
    await conn.commit();
    transactionActive = false;

    res
      .status(201)
      .json({ message: "Contract generated.", id: insertResult.insertId });
  } catch (err) {
    // conn may be null here if pool.getConnection() itself failed — no
    // rollback is attempted in that case, since there is nothing to roll
    // back.
    if (conn && transactionActive) {
      try {
        await conn.rollback();
        transactionActive = false;
      } catch (rollbackErr) {
        // Rollback itself failing means the transaction/connection state
        // is now uncertain — logged server-side only, never surfaced to
        // the client. The connection must not be returned to the pool in
        // this state (see the finally block below).
        console.error(
          "generateContract rollback failed:",
          rollbackErr.message || rollbackErr,
        );
        connectionReusable = false;
      }
    }
    console.error("generateContract error:", err);
    // err.message is intentionally never sent to the client — could be a
    // raw SQL error, connection failure detail, or similar internal detail.
    res.status(500).json({ message: "Failed to generate contract." });
  } finally {
    if (conn) {
      if (connectionReusable) {
        conn.release();
      } else {
        // Rollback failed — this connection's transaction/session state
        // is no longer trustworthy. Destroy it instead of releasing it
        // back to the pool, so a later, unrelated request can never pick
        // up a connection that might still be mid-transaction or holding
        // stale session state.
        conn.destroy();
      }
    }
  }
};

// ══ CUSTOMERS ════════════════════════════════════════════════════════════════
exports.getCustomers = async (req, res) => {
  try {
    const { search, approval_status, page = 1, limit = 20 } = req.query;
    const where = ["role = 'customer'"];
    const params = [];

    if (search) {
      where.push("(name LIKE ? OR email LIKE ?)");
      params.push(`%${search}%`, `%${search}%`);
    }
    if (approval_status) {
      where.push("approval_status = ?");
      params.push(approval_status);
    }

    const [rows] = await pool.query(
      `SELECT id, name, email, phone, address, is_active, is_verified,
              approval_status, created_at, last_login
       FROM users WHERE ${where.join(" AND ")}
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), (parseInt(page) - 1) * parseInt(limit)],
    );
    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM users WHERE ${where.join(" AND ")}`,
      params,
    );
    res.json({ rows, total });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.updateCustomerStatus = async (req, res) => {
  try {
    const { action } = req.body;
    const targetId = parseInt(req.params.id);
    const map = {
      approve: { approval_status: "approved", is_active: 1 },
      reject: { approval_status: "rejected" },
      activate: { is_active: 1 },
      deactivate: { is_active: 0 },
      // "delete" used to hard-DELETE the row, which threw a foreign-key
      // error for any customer with orders/warranties/contracts (i.e. almost
      // every real customer). Soft-delete instead, same pattern as the
      // admin/staff deleteUser fix, so order/warranty history is preserved.
      delete: { is_active: 0 },
    };

    if (!map[action])
      return res.status(400).json({ message: "Invalid action." });

    const [[before]] = await pool.query(
      "SELECT name, email, approval_status, is_active FROM users WHERE id = ? AND role = 'customer'",
      [targetId],
    );
    if (!before)
      return res.status(404).json({ message: "Customer not found." });

    const updates = map[action];
    const sets = Object.keys(updates).map((k) => `${k} = ?`);
    const values = Object.values(updates);

    // ── FIXED: Only update approval timestamps for approve/reject actions ──
    if (action === "approve" || action === "reject") {
      sets.push("approved_by = ?", "approved_at = NOW()");
      values.push(req.user.id);
    }

    // Add the ID for the WHERE clause
    values.push(targetId);

    // ── FIXED: Execute the dynamic query safely ──
    await pool.query(
      `UPDATE users SET ${sets.join(", ")} WHERE id = ? AND role = 'customer'`,
      values,
    );

    req.auditRecord = {
      id: targetId,
      old: before,
      new: { action, ...updates },
    };

    // "delete" keeps its original wording in the response so the frontend
    // button/message doesn't need to change, even though it's a soft-delete now.
    const actionMessage = action === "reject" ? "rejected" : `${action}d`;

    res.json({ message: `Customer ${actionMessage}.` });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ══ USERS ════════════════════════════════════════════════════════════════════
exports.getUsers = async (req, res) => {
  try {
    // ── FIXED: Added empty array [] ──
    const [rows] = await pool.query(
      `SELECT
         id,
         name,
         email,
         role,
         staff_type,
         phone,
         is_active,
         last_login,
         created_at
       FROM users
       WHERE role IN ('admin','staff')
       ORDER BY role, staff_type, name`,
      [],
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.createUser = async (req, res) => {
  try {
    const { name, email, password, role, staff_type, phone } = req.body;

    if (role === "staff" && !staff_type) {
      return res.status(400).json({
        message: "Staff type is required for staff accounts.",
      });
    }

    const hashed = await bcrypt.hash(password, 12);
    const normalizedStaffType = role === "staff" ? staff_type : null;

    const [r] = await pool.query(
      `INSERT INTO users
        (name, email, password, role, staff_type, phone, is_verified, approval_status, is_active)
       VALUES (?,?,?,?,?,?,1,'approved',1)`,
      [name, email, hashed, role, normalizedStaffType, phone],
    );

    // Audit: never include the hashed/plaintext password in log data.
    req.auditRecord = {
      id: r.insertId,
      new: { name, email, role, staff_type: normalizedStaffType, phone },
    };
    res.status(201).json({ message: "User created.", id: r.insertId });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") {
      return res.status(400).json({ message: "Email already in use." });
    }
    res.status(500).json({ message: err.message });
  }
};

exports.updateUser = async (req, res) => {
  try {
    const { name, email, role, staff_type, phone, is_active } = req.body;

    if (role === "staff" && !staff_type) {
      return res.status(400).json({
        message: "Staff type is required for staff accounts.",
      });
    }

    const normalizedStaffType = role === "staff" ? staff_type : null;
    const targetId = parseInt(req.params.id);

    const [[before]] = await pool.query(
      "SELECT name, email, role, staff_type, phone, is_active FROM users WHERE id = ?",
      [targetId],
    );

    await pool.query(
      `UPDATE users
       SET name = ?, email = ?, role = ?, staff_type = ?, phone = ?, is_active = ?
       WHERE id = ? AND role != 'customer'`,
      [
        name,
        email,
        role,
        normalizedStaffType,
        phone,
        is_active ? 1 : 0,
        targetId,
      ],
    );

    req.auditRecord = {
      id: targetId,
      old: before || null,
      new: { name, email, role, staff_type: normalizedStaffType, phone, is_active: is_active ? 1 : 0 },
    };
    res.json({ message: "User updated." });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.resetUserPassword = async (req, res) => {
  try {
    const { new_password } = req.body;
    const hashed = await bcrypt.hash(new_password, 12);
    const targetId = parseInt(req.params.id);
    // ── FIXED: Parsed ID ──
    await pool.query("UPDATE users SET password = ? WHERE id = ?", [
      hashed,
      targetId,
    ]);
    // Audit: record that a reset happened, never the password itself.
    req.auditRecord = { id: targetId, new: { password_reset: true } };
    res.json({ message: "Password reset." });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.deleteUser = async (req, res) => {
  try {
    const targetId = parseInt(req.params.id);
    // ── FIXED: Parsed ID and strict equality ──
    if (targetId === parseInt(req.user.id))
      return res
        .status(400)
        .json({ message: "Cannot delete your own account." });

    const [[before]] = await pool.query(
      "SELECT name, email, role, is_active FROM users WHERE id = ?",
      [targetId],
    );

    // Soft delete: deactivate instead of hard-deleting, to preserve
    // task/blueprint/receipt/etc. history tied to this user via FK.
    await pool.query(
      "UPDATE users SET is_active = 0 WHERE id = ? AND role != 'customer'",
      [targetId],
    );

    req.auditRecord = { id: targetId, old: before || null, new: { is_active: 0 } };
    res.json({ message: "User deactivated." });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/audit-logs?limit=50
// Lets admins view recent audit trail entries from the app itself,
// without needing direct database access.
// ── Audit Logs: shared query-param validation helpers ──
const parsePositiveInt = (value) => {
  if (value === undefined || value === null) return null;
  const str = Array.isArray(value) ? String(value[0]) : String(value).trim();
  if (!/^\d+$/.test(str)) return null;
  const num = Number(str);
  if (!Number.isSafeInteger(num)) return null;
  return num > 0 ? num : null;
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const isValidDateString = (str) => {
  if (!DATE_RE.test(str)) return false;
  const [y, m, d] = str.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  // Guards against JS auto-rolling invalid dates (e.g. 2026-02-30 -> Mar 2)
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() + 1 === m &&
    dt.getUTCDate() === d
  );
};

const AUDIT_DEFAULT_PAGE = 1;
const AUDIT_DEFAULT_LIMIT = 20;
const AUDIT_MAX_LIMIT = 100;

exports.getAuditLogs = async (req, res) => {
  try {
    let page = parsePositiveInt(req.query.page) ?? AUDIT_DEFAULT_PAGE;
    let limit = parsePositiveInt(req.query.limit) ?? AUDIT_DEFAULT_LIMIT;
    if (limit > AUDIT_MAX_LIMIT) limit = AUDIT_MAX_LIMIT;

    // Guard the multiplied offset separately — a page value that is a safe
    // integer on its own can still produce an unsafe offset once multiplied
    // by limit (e.g. page near Number.MAX_SAFE_INTEGER).
    let offset = (page - 1) * limit;
    if (!Number.isSafeInteger(offset)) {
      page = AUDIT_DEFAULT_PAGE;
      offset = 0;
    }

    const rawSearch =
      typeof req.query.search === "string" ? req.query.search.trim() : "";
    const rawAction =
      typeof req.query.action === "string" ? req.query.action.trim() : "";
    const rawTableName =
      typeof req.query.table_name === "string"
        ? req.query.table_name.trim()
        : "";
    const rawDateFrom =
      typeof req.query.date_from === "string" ? req.query.date_from.trim() : "";
    const rawDateTo =
      typeof req.query.date_to === "string" ? req.query.date_to.trim() : "";

    if (rawDateFrom && !isValidDateString(rawDateFrom)) {
      return res.status(400).json({
        message: "Invalid date_from. Use YYYY-MM-DD format.",
      });
    }
    if (rawDateTo && !isValidDateString(rawDateTo)) {
      return res.status(400).json({
        message: "Invalid date_to. Use YYYY-MM-DD format.",
      });
    }
    if (rawDateFrom && rawDateTo && rawDateFrom > rawDateTo) {
      return res.status(400).json({
        message: "date_from cannot be later than date_to.",
      });
    }

    // user_id: absent/empty is ignored, but a PROVIDED-and-invalid value is
    // rejected outright — silently ignoring it would risk returning every
    // admin's logs when the caller believed a user filter was applied.
    const rawUserId = req.query.user_id;
    const userIdProvided =
      rawUserId !== undefined &&
      rawUserId !== null &&
      String(Array.isArray(rawUserId) ? rawUserId[0] : rawUserId).trim() !== "";
    let userIdFilter = null;
    if (userIdProvided) {
      userIdFilter = parsePositiveInt(rawUserId);
      if (userIdFilter === null) {
        return res.status(400).json({
          message: "Invalid user_id. Use a positive integer.",
        });
      }
    }

    const where = ["1=1"];
    const params = [];

    if (rawSearch) {
      const likeValue = `%${rawSearch}%`;
      if (/^\d+$/.test(rawSearch)) {
        where.push(
          "(u.name LIKE ? OR u.email LIKE ? OR al.action LIKE ? OR al.table_name LIKE ? OR al.record_id = ?)",
        );
        params.push(likeValue, likeValue, likeValue, likeValue, parseInt(rawSearch, 10));
      } else {
        where.push(
          "(u.name LIKE ? OR u.email LIKE ? OR al.action LIKE ? OR al.table_name LIKE ?)",
        );
        params.push(likeValue, likeValue, likeValue, likeValue);
      }
    }
    if (rawAction) {
      where.push("al.action = ?");
      params.push(rawAction);
    }
    if (rawTableName) {
      where.push("al.table_name = ?");
      params.push(rawTableName);
    }
    if (userIdFilter !== null) {
      where.push("al.user_id = ?");
      params.push(userIdFilter);
    }
    if (rawDateFrom) {
      where.push("al.created_at >= ?");
      params.push(`${rawDateFrom} 00:00:00`);
    }
    if (rawDateTo) {
      where.push("al.created_at <= ?");
      params.push(`${rawDateTo} 23:59:59`);
    }

    const whereSql = where.join(" AND ");

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total
       FROM audit_logs al
       LEFT JOIN users u ON u.id = al.user_id
       WHERE ${whereSql}`,
      params,
    );

    const totalNum = Number(total) || 0;
    const totalPages = totalNum === 0 ? 0 : Math.ceil(totalNum / limit);

    const [rows] = await pool.query(
      `SELECT
         al.id,
         al.action,
         al.table_name,
         al.record_id,
         al.old_values,
         al.new_values,
         al.ip_address,
         al.created_at,
         u.name AS user_name,
         u.email AS user_email
       FROM audit_logs al
       LEFT JOIN users u ON u.id = al.user_id
       WHERE ${whereSql}
       ORDER BY al.created_at DESC, al.id DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset],
    );

    res.json({
      logs: rows,
      pagination: {
        page,
        limit,
        total: totalNum,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
      filters: {
        search: rawSearch,
        action: rawAction,
        table_name: rawTableName,
        user_id: userIdFilter,
        date_from: rawDateFrom,
        date_to: rawDateTo,
      },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};