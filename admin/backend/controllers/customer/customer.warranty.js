// controllers/customer/customer.warranty.js
// controllers/customer/customer.warranty.js
const db = require("../../config/db");
const { signUploadPath } = require("../../utils/signedUrl");

/* ── Helper: split stored proof_url into separate frontend fields ── */
const splitStoredProofs = (value) => {
  const parts = String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  return {
    photo_url: parts[0] || null,
    proof_url: parts[1] || null,
  };
};

/* ── Get Eligible Orders
   Completed + Paid + within warranty period + NO existing warranty claim yet
──────────────────────────────────────────────────────────────────────────── */
const getEligibleOrders = async (req, res) => {
  try {
    // ── FIXED: Switched to .query ──
    const [rows] = await db.query(
      `
      SELECT
        o.id,
        o.order_number,
        o.created_at,
        o.status,
        o.payment_status,
        o.total,
        o.delivery_address,
        d.delivered_date,
        DATE_ADD(
          COALESCE(d.delivered_date, o.updated_at, o.created_at),
          INTERVAL 1 YEAR
        ) AS warranty_expiry
      FROM orders o
      LEFT JOIN deliveries d
        ON d.order_id = o.id
      LEFT JOIN warranties w
        ON w.order_id = o.id
       AND w.customer_id = o.customer_id
      WHERE o.customer_id = ?
        AND o.status = 'completed'
        AND o.payment_status = 'paid'
        AND DATE_ADD(
              COALESCE(d.delivered_date, o.updated_at, o.created_at),
              INTERVAL 1 YEAR
            ) >= CURDATE()
        AND w.id IS NULL
      ORDER BY COALESCE(d.delivered_date, o.created_at) DESC
      `,
      [req.user.id],
    );

    res.json(rows);
  } catch (err) {
    console.error("[customer.warranty eligible-orders]", err);
    res.status(500).json({ message: "Server error.", error: err.message });
  }
};

/* ── List My Warranty Claims ─────────────────────────────────────────────── */
const getClaims = async (req, res) => {
  try {
    // ── FIXED: Switched to .query ──
    const [rows] = await db.query(
      `
      SELECT
        w.id,
        w.order_id,
        o.order_number,
        w.product_name,
        w.reason,
        w.admin_note,
        w.proof_url,
        w.status,
        w.warranty_expiry,
        w.replacement_receipt,
        w.fulfilled_at,
        w.created_at
      FROM warranties w
      LEFT JOIN orders o
        ON o.id = w.order_id
      WHERE w.customer_id = ?
      ORDER BY w.created_at DESC
      `,
      [req.user.id],
    );

    const mapped = rows.map((row) => {
      const { photo_url, proof_url } = splitStoredProofs(row.proof_url);

      return {
        id: row.id,
        order_id: row.order_id,
        order_number: row.order_number,
        product_name: row.product_name,
        description: row.reason,
        admin_note: row.admin_note,
        status: row.status,
        photo_url: signUploadPath(photo_url),
        proof_url: signUploadPath(proof_url),
        replacement_receipt: signUploadPath(row.replacement_receipt),
        warranty_expiry: row.warranty_expiry,
        fulfilled_at: row.fulfilled_at,
        created_at: row.created_at,
      };
    });

    res.json(mapped);
  } catch (err) {
    console.error("[customer.warranty GET]", err);
    res.status(500).json({ message: "Server error.", error: err.message });
  }
};

/* ── Submit a Warranty Claim ──────────────────────────────────────────────── */
const submitClaim = async (req, res) => {
  const { order_id, order_number, product_name, description } = req.body;

  if (!product_name?.trim() || !description?.trim()) {
    return res.status(400).json({
      message: "Product name and description of the issue are required.",
    });
  }

  if (!String(order_id || "").trim() && !String(order_number || "").trim()) {
    return res.status(400).json({
      message:
        "Please select or enter the completed paid order for this claim.",
    });
  }

  const photo_url = req.files?.photo?.[0]
    ? `uploads/warranty/${req.files.photo[0].filename}`
    : null;

  const proof_url = req.files?.proof?.[0]
    ? `uploads/warranty/${req.files.proof[0].filename}`
    : null;

  if (!photo_url || !proof_url) {
    return res.status(400).json({
      message: "Both defect photo and proof of purchase are required.",
    });
  }

  const combinedUrls = [photo_url, proof_url].join(",");

  try {
    let orderLookupSql = `
      SELECT
        o.id,
        o.order_number,
        o.customer_id,
        o.status,
        o.payment_status,
        DATE_ADD(
          COALESCE(d.delivered_date, o.updated_at, o.created_at),
          INTERVAL 1 YEAR
        ) AS warranty_expiry
      FROM orders o
      LEFT JOIN deliveries d
        ON d.order_id = o.id
      WHERE o.customer_id = ?
    `;

    const params = [req.user.id];

    if (String(order_id || "").trim()) {
      orderLookupSql += ` AND o.id = ?`;
      params.push(parseInt(order_id)); // ── FIXED: Parse ID ──
    } else {
      orderLookupSql += ` AND o.order_number = ?`;
      params.push(String(order_number).trim());
    }

    orderLookupSql += ` LIMIT 1`;

    // ── FIXED: Switched to .query ──
    const [orderRows] = await db.query(orderLookupSql, params);

    if (!orderRows.length) {
      return res.status(404).json({
        message: "Eligible order not found for this warranty claim.",
      });
    }

    const linkedOrder = orderRows[0];

    if (String(linkedOrder.status || "").toLowerCase() !== "completed") {
      return res.status(400).json({
        message: "Only completed orders can be used for warranty claims.",
      });
    }

    if (String(linkedOrder.payment_status || "").toLowerCase() !== "paid") {
      return res.status(400).json({
        message: "Only fully paid orders are eligible for warranty claims.",
      });
    }

    const expiry = linkedOrder.warranty_expiry
      ? new Date(linkedOrder.warranty_expiry)
      : null;

    if (!expiry || Number.isNaN(expiry.getTime()) || expiry < new Date()) {
      return res.status(400).json({
        message: "This order is no longer within the warranty period.",
      });
    }

    // ── FIXED: Switched to .query ──
    const [existingClaims] = await db.query(
      `
      SELECT id, status
      FROM warranties
      WHERE customer_id = ? AND order_id = ?
      LIMIT 1
      `,
      [req.user.id, linkedOrder.id],
    );

    if (existingClaims.length > 0) {
      return res.status(400).json({
        message:
          "A warranty claim already exists for this order. You cannot submit another claim for the same order.",
      });
    }

    // ── FIXED: Switched to .query ──
    const [result] = await db.query(
      `
      INSERT INTO warranties
        (customer_id, order_id, product_name, reason, proof_url, warranty_expiry, status)
      VALUES (?, ?, ?, ?, ?, ?, 'pending')
      `,
      [
        req.user.id,
        linkedOrder.id,
        product_name.trim(),
        description.trim(),
        combinedUrls,
        linkedOrder.warranty_expiry,
      ],
    );

    res.status(201).json({
      message: "Warranty claim submitted successfully.",
      claim_id: result.insertId,
    });
  } catch (err) {
    console.error("[customer.warranty POST]", err);
    res.status(500).json({ message: "Server error.", error: err.message });
  }
};

module.exports = {
  getEligibleOrders,
  getClaims,
  submitClaim,
};
