// controllers/managementController.js [SCHEMA-CORRECTED]
// Fixed: warranties join, contracts columns, backup_logs columns, orders.type/total
const pool = require("../../config/db");
const bcrypt = require("bcryptjs");

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

const parseBodyPositiveInt = (value) => {
  if (
    value === undefined ||
    value === null ||
    Array.isArray(value) ||
    typeof value === "object" ||
    typeof value === "boolean"
  ) {
    return null;
  }
  return parsePositiveInt(value);
};

exports.generateContract = async (req, res) => {
  const body =
    req.body && typeof req.body === "object" && !Array.isArray(req.body)
      ? req.body
      : {};
  const { order_id, blueprint_id, terms, warranty_terms } = body;

  // ── Format validation before opening a connection/transaction ──
  const orderId = parseBodyPositiveInt(order_id);
  if (!orderId) {
    return res.status(400).json({ message: "Invalid order id." });
  }

  let requestedBlueprintId = null;
  if (
    blueprint_id !== undefined &&
    blueprint_id !== null &&
    String(blueprint_id).trim() !== ""
  ) {
    requestedBlueprintId = parseBodyPositiveInt(blueprint_id);
    if (!requestedBlueprintId) {
      return res.status(400).json({ message: "Invalid blueprint id." });
    }
  }

  const trimmedTerms = typeof terms === "string" ? terms.trim() : "";
  if (!trimmedTerms) {
    return res.status(400).json({ message: "Contract terms are required." });
  }

  const trimmedWarrantyTerms =
    typeof warranty_terms === "string" ? warranty_terms.trim() : "";
  if (!trimmedWarrantyTerms) {
    return res.status(400).json({ message: "Warranty terms are required." });
  }

  let conn = null;
  let transactionStarted = false;

  try {
    conn = await pool.getConnection();
    await conn.beginTransaction();
    transactionStarted = true;

    // Lock the order — this row is the serialization point for concurrent
    // contract generation attempts on the same order.
    const [[order]] = await conn.query(
      `SELECT id, customer_id, walkin_customer_name, order_type, status,
              blueprint_id, total, payment_status
         FROM orders
        WHERE id = ?
        FOR UPDATE`,
      [orderId],
    );
    if (!order) {
      await conn.rollback();
      transactionStarted = false;
      return res.status(404).json({ message: "Order not found." });
    }

    const effectiveBlueprintId = parsePositiveInt(order.blueprint_id);
    const isBlueprintOrder =
      String(order.order_type || "").trim().toLowerCase() === "blueprint" ||
      Boolean(effectiveBlueprintId);

    if (!isBlueprintOrder) {
      await conn.rollback();
      transactionStarted = false;
      return res.status(400).json({
        message: "Contracts can only be generated for blueprint/custom orders.",
      });
    }

    if (!effectiveBlueprintId) {
      await conn.rollback();
      transactionStarted = false;
      return res.status(400).json({
        message: "Blueprint order must be linked to a blueprint first.",
      });
    }

    if (requestedBlueprintId && requestedBlueprintId !== effectiveBlueprintId) {
      await conn.rollback();
      transactionStarted = false;
      return res.status(400).json({
        message: "The provided blueprint does not match this order.",
      });
    }

    const [[blueprint]] = await conn.query(
      `SELECT id FROM blueprints WHERE id = ?`,
      [effectiveBlueprintId],
    );
    if (!blueprint) {
      await conn.rollback();
      transactionStarted = false;
      return res.status(404).json({ message: "Linked blueprint not found." });
    }

    // ── Required customer invariant ──
    // Blueprint/custom orders are only ever created through the
    // customer-authenticated custom-order flow (customer.customorders.js,
    // createCustomOrder — INSERT INTO orders ... VALUES (?, ?, NULL, 'online',
    // 'blueprint', 'pending', ...) with customer_id bound to req.user.id).
    // There is no admin/walk-in code path that inserts order_type='blueprint'
    // with customer_id NULL, and users are soft-deleted (is_active=0), never
    // hard-deleted, so an existing order's customer_id FK is never nulled out
    // afterward either. This check is a defensive guard for that invariant,
    // not expected to trigger under normal operation.
    if (!order.customer_id) {
      await conn.rollback();
      transactionStarted = false;
      return res.status(400).json({
        message:
          "A registered customer is required before a contract can be generated.",
      });
    }

    const [[customerRow]] = await conn.query(
      `SELECT name FROM users WHERE id = ?`,
      [order.customer_id],
    );
    const customerName = String(customerRow?.name || "").trim();
    if (!customerName) {
      await conn.rollback();
      transactionStarted = false;
      return res.status(400).json({
        message:
          "A registered customer is required before a contract can be generated.",
      });
    }

    // Existing-contract check happens BEFORE the order-status check, so a
    // repeated/concurrent request returns an accurate "already exists"
    // message instead of a misleading status error.
    const [[existingContract]] = await conn.query(
      `SELECT id
         FROM contracts
        WHERE order_id = ?
        LIMIT 1`,
      [orderId],
    );
    if (existingContract) {
      await conn.rollback();
      transactionStarted = false;
      return res
        .status(409)
        .json({ message: "A contract already exists for this order." });
    }

    const orderStatus = String(order.status || "").trim().toLowerCase();
    if (orderStatus !== "confirmed") {
      await conn.rollback();
      transactionStarted = false;
      return res.status(400).json({
        message: "Order must be confirmed before a contract can be generated.",
      });
    }

    const [[estimation]] = await conn.query(
      `SELECT id, status
         FROM estimations
        WHERE blueprint_id = ?
        ORDER BY version DESC, id DESC
        LIMIT 1`,
      [effectiveBlueprintId],
    );
    if (!estimation) {
      await conn.rollback();
      transactionStarted = false;
      return res
        .status(400)
        .json({ message: "No estimation found for the linked blueprint." });
    }
    const estimationStatus = String(estimation.status || "")
      .trim()
      .toLowerCase();
    if (estimationStatus !== "approved") {
      await conn.rollback();
      transactionStarted = false;
      return res.status(400).json({
        message: "Only approved estimations can proceed to contract generation.",
      });
    }

    const totalAmount = Number(order.total);
    if (!Number.isFinite(totalAmount) || totalAmount <= 0) {
      await conn.rollback();
      transactionStarted = false;
      return res.status(400).json({
        message:
          "Blueprint order total must be finalized before a contract can be generated.",
      });
    }

    const paymentStatus = String(order.payment_status || "")
      .trim()
      .toLowerCase();
    let paymentReady = paymentStatus === "paid";
    if (!paymentReady) {
      const [[verifiedPaymentRow]] = await conn.query(
        `SELECT COALESCE(SUM(amount), 0) AS verified_total
           FROM payment_transactions
          WHERE order_id = ? AND status = 'verified'`,
        [orderId],
      );
      const verifiedTotal = Number(verifiedPaymentRow?.verified_total || 0);
      paymentReady = verifiedTotal >= totalAmount * 0.3 - 0.01;
    }
    if (!paymentReady) {
      await conn.rollback();
      transactionStarted = false;
      return res.status(400).json({
        message:
          "At least 30% verified down payment or full paid status is required before generating a contract.",
      });
    }

    const [insertResult] = await conn.query(
      `INSERT INTO contracts
         (order_id, blueprint_id, customer_id, customer_name, warranty_terms, materials_used, authorized_by, start_date)
       VALUES (?, ?, ?, ?, ?, ?, ?, CURDATE())`,
      [
        orderId,
        effectiveBlueprintId,
        order.customer_id,
        customerName,
        trimmedWarrantyTerms,
        trimmedTerms,
        req.user.id,
      ],
    );

    const [updateResult] = await conn.query(
      `UPDATE orders SET status = 'contract_released' WHERE id = ?`,
      [orderId],
    );
    if (updateResult.affectedRows !== 1) {
      throw new Error("Failed to update order status after contract creation.");
    }

    const [[finalOrder]] = await conn.query(
      `SELECT status FROM orders WHERE id = ?`,
      [orderId],
    );
    if (!finalOrder) {
      throw new Error("Order not found after status update.");
    }

    await conn.commit();
    transactionStarted = false;

    req.auditRecord = {
      id: insertResult.insertId,
      old: {
        order_status: order.status,
      },
      new: {
        order_id: orderId,
        blueprint_id: effectiveBlueprintId,
        contract_created: true,
        order_status: finalOrder.status,
        order_status_changed:
          String(order.status || "") !== String(finalOrder.status || ""),
        authorized_by_present: Boolean(req.user && req.user.id),
      },
    };

    return res
      .status(201)
      .json({ message: "Contract generated.", id: insertResult.insertId });
  } catch (err) {
    if (conn && transactionStarted) {
      try {
        await conn.rollback();
      } catch (rollbackError) {
        console.error(
          "Contract generation rollback failed:",
          rollbackError.message,
        );
      }
    }
    return res.status(500).json({ message: err.message });
  } finally {
    if (conn) conn.release();
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