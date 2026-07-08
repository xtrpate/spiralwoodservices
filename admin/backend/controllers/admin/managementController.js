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

exports.generateContract = async (req, res) => {
  try {
    const { order_id, blueprint_id, terms, warranty_terms } = req.body;

    // Get customer info from the order
    // ── FIXED: Parsed ID ──
    const [[order]] = await pool.query(
      `SELECT o.customer_id, COALESCE(u.name, o.walkin_customer_name) AS customer_name
       FROM orders o LEFT JOIN users u ON u.id = o.customer_id WHERE o.id = ?`,
      [parseInt(order_id)],
    );
    if (!order) return res.status(404).json({ message: "Order not found." });

    // ── FIXED: Parsed IDs ──
    const [r] = await pool.query(
      // contracts schema: blueprint_id, order_id, customer_id, customer_name, warranty_terms, authorized_by
      // store contract terms in warranty_terms field + materials_used field
      `INSERT INTO contracts
         (order_id, blueprint_id, customer_id, customer_name, warranty_terms, materials_used, authorized_by, start_date)
       VALUES (?, ?, ?, ?, ?, ?, ?, CURDATE())`,
      [
        parseInt(order_id),
        blueprint_id ? parseInt(blueprint_id) : null,
        order.customer_id,
        order.customer_name,
        warranty_terms,
        terms,
        req.user.id,
      ],
    );

    // Update order status
    // ── FIXED: Parsed ID ──
    await pool.query(
      `UPDATE orders
      SET status = CASE
        WHEN status IN ('pending', 'confirmed') THEN 'contract_released'
        ELSE status
      END
      WHERE id = ?`,
      [parseInt(order_id)],
    );

    res.status(201).json({ message: "Contract generated.", id: r.insertId });
  } catch (err) {
    res.status(500).json({ message: err.message });
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
    const map = {
      approve: { approval_status: "approved", is_active: 1 },
      reject: { approval_status: "rejected" },
      activate: { is_active: 1 },
      deactivate: { is_active: 0 },
    };
    if (action === "delete") {
      // ── FIXED: Parsed ID ──
      await pool.query("DELETE FROM users WHERE id = ? AND role = 'customer'", [
        parseInt(req.params.id),
      ]);
      return res.json({ message: "Customer deleted." });
    }
    if (!map[action])
      return res.status(400).json({ message: "Invalid action." });
    const updates = map[action];
    const sets = Object.keys(updates).map((k) => `${k} = ?`);
    const values = Object.values(updates);

    // ── FIXED: Only update approval timestamps for approve/reject actions ──
    if (action === "approve" || action === "reject") {
      sets.push("approved_by = ?", "approved_at = NOW()");
      values.push(req.user.id);
    }

    // Add the ID for the WHERE clause
    values.push(parseInt(req.params.id));

    // ── FIXED: Execute the dynamic query safely ──
    await pool.query(
      `UPDATE users SET ${sets.join(", ")} WHERE id = ?`,
      values,
    );

    // Optional fix: Corrected the grammar for the success message (prevents "rejectd")
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
        parseInt(req.params.id),
      ],
    );

    res.json({ message: "User updated." });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.resetUserPassword = async (req, res) => {
  try {
    const { new_password } = req.body;
    const hashed = await bcrypt.hash(new_password, 12);
    // ── FIXED: Parsed ID ──
    await pool.query("UPDATE users SET password = ? WHERE id = ?", [
      hashed,
      parseInt(req.params.id),
    ]);
    res.json({ message: "Password reset." });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.deleteUser = async (req, res) => {
  try {
    // ── FIXED: Parsed ID and strict equality ──
    if (parseInt(req.params.id) === parseInt(req.user.id))
      return res
        .status(400)
        .json({ message: "Cannot delete your own account." });

    // Soft delete: deactivate instead of hard-deleting, to preserve
    // task/blueprint/receipt/etc. history tied to this user via FK.
    await pool.query(
      "UPDATE users SET is_active = 0 WHERE id = ? AND role != 'customer'",
      [parseInt(req.params.id)],
    );
    res.json({ message: "User deactivated." });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};