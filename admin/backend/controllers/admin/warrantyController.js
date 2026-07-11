// controllers/warrantyController.js (Admin)
const db = require("../../config/db");

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

exports.getClaims = async (req, res) => {
  try {
    // ── FIXED: Switched to .query and added empty array [] ──
    const [rows] = await db.query(
      `
      SELECT
        w.id,
        w.order_id,
        w.customer_id,
        w.product_name,
        w.reason,
        w.admin_note,
        w.proof_url,
        w.warranty_expiry,
        w.status,
        w.replacement_receipt,
        w.fulfilled_at,
        w.fulfilled_by,
        w.created_at,
        w.updated_at,
        o.order_number,
        COALESCE(c.name, o.walkin_customer_name, 'Customer') AS customer_name,
        fulfiller.name AS fulfilled_by_name
      FROM warranties w
      LEFT JOIN orders o
        ON o.id = w.order_id
      LEFT JOIN users c
        ON c.id = w.customer_id
      LEFT JOIN users fulfiller
        ON fulfiller.id = w.fulfilled_by
      ORDER BY
        FIELD(w.status, 'pending', 'approved', 'fulfilled', 'rejected'),
        w.created_at DESC
      `,
      [],
    );

    const mapped = rows.map((row) => {
      const { photo_url, proof_url } = splitStoredProofs(row.proof_url);

      return {
        id: row.id,
        order_id: row.order_id,
        customer_id: row.customer_id,
        order_number: row.order_number,
        customer_name: row.customer_name,
        product_name: row.product_name,
        description: row.reason,
        admin_note: row.admin_note,
        photo_url,
        proof_url,
        warranty_expiry: row.warranty_expiry,
        status: row.status,
        replacement_receipt: row.replacement_receipt,
        fulfilled_at: row.fulfilled_at,
        fulfilled_by: row.fulfilled_by,
        fulfilled_by_name: row.fulfilled_by_name,
        created_at: row.created_at,
        updated_at: row.updated_at,
      };
    });

    res.json(mapped);
  } catch (err) {
    console.error("[admin.warranty GET]", err);
    res.status(500).json({ message: "Server error.", error: err.message });
  }
};

exports.decideClaim = async (req, res) => {
  const id = parseInt(req.params.id);
  const decision = String(req.body?.decision || "")
    .trim()
    .toLowerCase();
  const adminNote = String(req.body?.admin_note || "").trim();

  if (!id) {
    return res
      .status(400)
      .json({ message: "Valid warranty claim ID is required." });
  }

  if (!["approved", "rejected"].includes(decision)) {
    return res.status(400).json({
      message: "Decision must be either approved or rejected.",
    });
  }

  if (decision === "rejected" && !adminNote) {
    return res.status(400).json({
      message: "Please provide the rejection reason or admin note.",
    });
  }

  try {
    // ── FIXED: Switched to .query ──
    const [[claim]] = await db.query(
      `
      SELECT id, status
      FROM warranties
      WHERE id = ?
      LIMIT 1
      `,
      [id],
    );

    if (!claim) {
      return res.status(404).json({ message: "Warranty claim not found." });
    }

    const currentStatus = String(claim.status || "").toLowerCase();

    if (currentStatus === "fulfilled") {
      return res.status(400).json({
        message:
          "This warranty claim is already fulfilled and can no longer be changed.",
      });
    }

    if (currentStatus !== "pending") {
      return res.status(400).json({
        message: "Only pending warranty claims can be approved or rejected.",
      });
    }

    // ── FIXED: Switched to .query ──
    await db.query(
      `
      UPDATE warranties
      SET
        status = ?,
        admin_note = ?,
        updated_at = NOW()
      WHERE id = ?
      `,
      [decision, adminNote || null, id],
    );

    req.auditRecord = {
      id,
      old: { status: currentStatus },
      new: {
        status: decision,
        has_admin_note: Boolean(adminNote),
      },
    };

    res.json({
      message:
        decision === "approved"
          ? "Warranty claim approved successfully."
          : "Warranty claim rejected successfully.",
    });
  } catch (err) {
    console.error("[admin.warranty decide]", err);
    res.status(500).json({ message: "Server error.", error: err.message });
  }
};

exports.fulfillClaim = async (req, res) => {
  const id = parseInt(req.params.id);

  if (!id) {
    return res
      .status(400)
      .json({ message: "Valid warranty claim ID is required." });
  }

  const uploadedReceipt = req.file
    ? `uploads/warranty-replacements/${req.file.filename}`
    : null;

  try {
    // ── FIXED: Switched to .query ──
    const [[claim]] = await db.query(
      `
      SELECT id, status, replacement_receipt
      FROM warranties
      WHERE id = ?
      LIMIT 1
      `,
      [id],
    );

    if (!claim) {
      return res.status(404).json({ message: "Warranty claim not found." });
    }

    const currentStatus = String(claim.status || "").toLowerCase();

    if (currentStatus !== "approved") {
      return res.status(400).json({
        message: "Only approved warranty claims can be marked as fulfilled.",
      });
    }

    const finalReceipt = uploadedReceipt || claim.replacement_receipt || null;

    if (!finalReceipt) {
      return res.status(400).json({
        message: "Replacement receipt or fulfillment proof is required.",
      });
    }

    // ── FIXED: Switched to .query ──
    await db.query(
      `
      UPDATE warranties
      SET
        status = 'fulfilled',
        replacement_receipt = ?,
        fulfilled_at = NOW(),
        fulfilled_by = ?,
        updated_at = NOW()
      WHERE id = ?
      `,
      [finalReceipt, parseInt(req.user.id), id],
    );

    req.auditRecord = {
      id,
      old: { status: currentStatus },
      new: {
        status: "fulfilled",
        has_replacement_receipt: Boolean(finalReceipt),
        receipt_uploaded_this_update: Boolean(uploadedReceipt),
      },
    };

    res.json({
      message: "Warranty claim marked as fulfilled successfully.",
    });
  } catch (err) {
    console.error("[admin.warranty fulfill]", err);
    res.status(500).json({ message: "Server error.", error: err.message });
  }
};