// controllers/staff/pos.deliveries.js
const db = require("../../config/db");
const { signUploadPath } = require("../../utils/signedUrl");

const DELIVERY_STATUSES = ["scheduled", "in_transit", "delivered", "failed"];

const DELIVERY_TRANSITIONS = {
  scheduled: ["scheduled", "in_transit"],
  in_transit: ["in_transit", "delivered", "failed"],
  delivered: ["delivered", "in_transit"],
};
const normalizeText = (value) => String(value || "").trim();

const toNullableInt = (value) => {
  if (value === undefined || value === null || value === "") return null;
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
};

const normalizeDateTime = (value) => {
  const raw = normalizeText(value);
  if (!raw) return null;

  const cleaned = raw.replace("T", " ").trim();
  return cleaned.length === 16 ? `${cleaned}:00` : cleaned;
};

const buildSignedReceiptPath = (file) => {
  if (!file || !file.filename) return null;
  return `/uploads/delivery-receipts/${file.filename}`.replace(/\\/g, "/");
};

const DELIVERY_COLLECTION_METHODS = ["cash", "gcash", "bank_transfer"];

const toPositiveAmount = (value) => {
  if (value === undefined || value === null || value === "") return 0;
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? Number(num.toFixed(2)) : 0;
};

const computeOrderPaymentStatus = ({
  totalAmount,
  verifiedTotal,
  hasPending,
  hasRejected,
}) => {
  if (verifiedTotal >= totalAmount && totalAmount > 0) return "paid";
  if (verifiedTotal > 0) return "partial";
  if (hasPending) return "pending";
  if (hasRejected) return "rejected";
  return "unpaid";
};

const ensureStaffType = async (userId, expectedType) => {
  if (!userId) return null;

  const [rows] = await db.query(
    `SELECT id, name, role, staff_type, is_active
     FROM users
     WHERE id = ?
     LIMIT 1`,
    [userId],
  );

  if (!rows.length) return null;

  const user = rows[0];

  if (user.role !== "staff") return null;
  if (user.staff_type !== expectedType) return null;
  if (!user.is_active) return null;

  return user;
};

exports.getDeliverableOrders = async (req, res) => {
  try {
    console.log("=== GET DELIVERABLE ORDERS HIT ===");
    console.log("ACTIVE FILE:", __filename);

    // ── FIXED: Added empty array [] to prevent driver panics ──
    const [rows] = await db.query(
      `
      SELECT
        o.id,
        o.order_number,
        o.status,
        o.order_type,
        o.payment_method,
        o.payment_status,
        o.total,
        o.delivery_address,
        o.requested_delivery_date,
        o.delivery_request_notes,
        o.created_at,

        COALESCE(o.walkin_customer_name, customer.name, 'Walk-in Customer') AS customer_name,
        COALESCE(o.walkin_customer_phone, customer.phone, '') AS customer_phone

      FROM orders o
      LEFT JOIN users customer ON customer.id = o.customer_id
      LEFT JOIN deliveries d ON d.order_id = o.id

      WHERE o.status IN ('confirmed', 'contract_released', 'production', 'shipping')
        AND COALESCE(o.delivery_address, '') <> ''
        AND d.id IS NULL

      ORDER BY o.created_at DESC, o.id DESC
      LIMIT 200
    `,
      [], // Added this safety parameter
    );

    console.log("DELIVERABLE ORDERS SAMPLE:", rows[0] || null);

    res.json(rows);
  } catch (err) {
    console.error("GET /api/pos/deliverable-orders error:", err);
    res.status(500).json({ message: "Failed to load deliverable orders" });
  }
};

exports.getDeliveries = async (req, res) => {
  try {
    let sql = `
      SELECT
        d.id,
        d.order_id,
        d.driver_id,
        d.assigned_by,
        d.assigned_at,
        d.scheduled_date,
        d.delivered_date,
        d.address,
        d.status,
        d.notes,
        d.signed_receipt,
        d.updated_at,

        o.order_number,
        o.total,
        o.payment_method,
        o.payment_status,
        o.created_at AS order_created_at,

        COALESCE(
          (
            SELECT SUM(
              CASE
                WHEN LOWER(pt.status) = 'verified' THEN pt.amount
                ELSE 0
              END
            )
            FROM payment_transactions pt
            WHERE pt.order_id = o.id
          ),
          0
        ) AS payment_verified_total,

        GREATEST(
          o.total - COALESCE(
            (
              SELECT SUM(
                CASE
                  WHEN LOWER(pt.status) = 'verified' THEN pt.amount
                  ELSE 0
                END
              )
              FROM payment_transactions pt
              WHERE pt.order_id = o.id
            ),
            0
          ),
          0
        ) AS payment_balance,

        (
          SELECT COUNT(*)
          FROM payment_transactions pt
          WHERE pt.order_id = o.id
            AND LOWER(pt.status) = 'pending'
        ) AS pending_payment_count,

        COALESCE(o.walkin_customer_name, customer.name, 'Walk-in Customer') AS customer_name,
        COALESCE(o.walkin_customer_phone, customer.phone, '') AS customer_phone,

        driver.name AS driver_name
      FROM deliveries d
      INNER JOIN orders o ON o.id = d.order_id
      LEFT JOIN users customer ON customer.id = o.customer_id
      LEFT JOIN users driver ON driver.id = d.driver_id
    `;

    const params = [];

    if (req.user.role === "staff") {
      sql += ` WHERE d.driver_id = ? `;
      params.push(req.user.id);
    }

    sql += ` ORDER BY d.updated_at DESC, d.id DESC LIMIT 200`;

    const [rows] = await db.query(sql, params);
    rows.forEach((row) => {
      if (row.signed_receipt) row.signed_receipt = signUploadPath(row.signed_receipt);
    });
    res.json(rows);
  } catch (err) {
    console.error("GET /api/pos/deliveries error:", err);
    res.status(500).json({ message: "Failed to load deliveries" });
  }
};

exports.createDelivery = async (req, res) => {
  const orderId = toNullableInt(req.body.order_id);
  const driverId = toNullableInt(req.body.driver_id);
  const address = normalizeText(req.body.address);
  const scheduledDate = normalizeDateTime(req.body.scheduled_date);
  const notes = normalizeText(req.body.notes) || "";
  const rescheduleReason = normalizeText(req.body.reschedule_reason) || "";

  if (!orderId || !driverId || !address || !scheduledDate) {
    return res.status(400).json({
      message: "order_id, driver_id, address, and scheduled_date are required",
    });
  }

  try {
    const rider = await ensureStaffType(driverId, "delivery_rider");
    if (!rider) {
      return res.status(400).json({
        message: "Selected delivery rider was not found.",
      });
    }

    const [[order]] = await db.query(
      `
      SELECT
        o.id,
        o.order_number,
        o.status,
        o.payment_status,
        o.delivery_address,
        o.requested_delivery_date,
        o.delivery_request_notes,
        o.notes,
        COALESCE(o.walkin_customer_name, customer.name, 'Walk-in Customer') AS customer_name,
        COALESCE(o.walkin_customer_phone, customer.phone, '') AS customer_phone
      FROM orders o
      LEFT JOIN users customer ON customer.id = o.customer_id
      WHERE o.id = ?
      LIMIT 1
      `,
      [orderId],
    );

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    const orderStatus = String(order.status || "").toLowerCase();

    if (["cancelled", "delivered", "completed"].includes(orderStatus)) {
      return res.status(400).json({
        message: "This order can no longer be scheduled for delivery",
      });
    }

    const [[existingDelivery]] = await db.query(
      `
      SELECT id, status
      FROM deliveries
      WHERE order_id = ?
      ORDER BY id DESC
      LIMIT 1
      `,
      [orderId],
    );

    if (existingDelivery) {
      return res.status(409).json({
        message: "A delivery is already scheduled for this order",
      });
    }

    const requestedDate = normalizeDateTime(order.requested_delivery_date);

    const finalNotesParts = [];
    if (notes) finalNotesParts.push(notes);

    if (
      requestedDate &&
      scheduledDate &&
      requestedDate !== scheduledDate &&
      rescheduleReason
    ) {
      finalNotesParts.push(`Reschedule Reason: ${rescheduleReason}`);
    }

    const finalNotes = finalNotesParts.length
      ? finalNotesParts.join("\n")
      : null;

    const [result] = await db.query(
      `
      INSERT INTO deliveries (
        order_id,
        driver_id,
        assigned_by,
        assigned_at,
        scheduled_date,
        delivered_date,
        address,
        status,
        notes,
        signed_receipt
      )
      VALUES (?, ?, ?, NOW(), ?, NULL, ?, 'scheduled', ?, NULL)
      `,
      [orderId, driverId, req.user.id, scheduledDate, address, finalNotes],
    );

    const [[delivery]] = await db.query(
      `
      SELECT
        d.id,
        d.order_id,
        d.driver_id,
        d.assigned_by,
        d.assigned_at,
        d.scheduled_date,
        d.delivered_date,
        d.address,
        d.status,
        d.notes,
        d.signed_receipt,
        d.updated_at,

        o.order_number,
        o.total,
        o.payment_method,
        o.created_at AS order_created_at,

        COALESCE(o.walkin_customer_name, customer.name, 'Walk-in Customer') AS customer_name,
        COALESCE(o.walkin_customer_phone, customer.phone, '') AS customer_phone,

        driver.name AS driver_name
      FROM deliveries d
      INNER JOIN orders o ON o.id = d.order_id
      LEFT JOIN users customer ON customer.id = o.customer_id
      LEFT JOIN users driver ON driver.id = d.driver_id
      WHERE d.id = ?
      LIMIT 1
      `,
      [result.insertId],
    );

    if (delivery?.signed_receipt) {
      delivery.signed_receipt = signUploadPath(delivery.signed_receipt);
    }

    res.status(201).json({
      message: "Delivery scheduled successfully",
      delivery,
      assigned_driver: {
        id: rider.id,
        name: rider.name,
      },
    });
  } catch (err) {
    console.error("POST /api/pos/deliveries error:", err);
    res.status(500).json({ message: "Failed to schedule delivery" });
  }
};

exports.updateDeliveryStatus = async (req, res) => {
  const deliveryId = toNullableInt(req.params.id);
  const requestedStatus = normalizeText(req.body.status).toLowerCase();
  const nextNotes =
    req.body.notes === undefined
      ? undefined
      : normalizeText(req.body.notes) || null;

  const uploadedReceiptPath = buildSignedReceiptPath(req.file);

  const collectedAmount = toPositiveAmount(req.body.collected_amount);
  const collectedPaymentMethod = normalizeText(
    req.body.payment_method,
  ).toLowerCase();
  const collectionNotes = normalizeText(req.body.collection_notes) || "";

  if (!deliveryId) {
    return res.status(400).json({ message: "Invalid delivery id" });
  }

  if (!DELIVERY_STATUSES.includes(requestedStatus)) {
    return res.status(400).json({ message: "Invalid delivery status" });
  }

  let conn;
  try {
    conn = await db.getConnection();
    await conn.beginTransaction();

    const [[existing]] = await conn.query(
      `SELECT * FROM deliveries WHERE id = ? FOR UPDATE`,
      [deliveryId],
    );

    if (!existing) {
      await conn.rollback();
      return res.status(404).json({ message: "Delivery not found" });
    }

    if (
      req.user.role === "staff" &&
      Number(existing.driver_id) !== Number(req.user.id)
    ) {
      await conn.rollback();
      return res.status(403).json({
        message: "You can only update deliveries assigned to you.",
      });
    }

    const [[order]] = await conn.query(
      `SELECT id, order_number, total, payment_status
       FROM orders
       WHERE id = ?
       LIMIT 1
       FOR UPDATE`,
      [existing.order_id],
    );

    if (!order) {
      await conn.rollback();
      return res.status(404).json({ message: "Linked order not found." });
    }

    const currentStatus = normalizeText(
      existing.status || "scheduled",
    ).toLowerCase();
    const allowedNextStatuses = DELIVERY_TRANSITIONS[currentStatus] || [
      currentStatus,
    ];

    if (!allowedNextStatuses.includes(requestedStatus)) {
      await conn.rollback();
      return res.status(400).json({
        message: `Invalid delivery transition from ${currentStatus} to ${requestedStatus}.`,
      });
    }

    if (
      uploadedReceiptPath &&
      !["in_transit", "delivered"].includes(requestedStatus)
    ) {
      await conn.rollback();
      return res.status(400).json({
        message:
          "Proof of delivery can only be uploaded while the delivery is in transit or being marked delivered.",
      });
    }

    const nextSignedReceipt =
      uploadedReceiptPath || existing.signed_receipt || null;

    if (requestedStatus === "delivered" && !nextSignedReceipt) {
      await conn.rollback();
      return res.status(400).json({
        message:
          "Please upload the signed receipt / proof of delivery before marking this delivery as delivered.",
      });
    }

    const [[paymentSummaryBefore]] = await conn.query(
      `SELECT
         COALESCE(
           SUM(CASE WHEN LOWER(status) = 'verified' THEN amount ELSE 0 END),
           0
         ) AS verified_total
       FROM payment_transactions
       WHERE order_id = ?`,
      [existing.order_id],
    );

    const totalAmount = Number(order.total || 0);
    const verifiedTotalBefore = Number(
      paymentSummaryBefore?.verified_total || 0,
    );
    const currentBalance = Math.max(0, totalAmount - verifiedTotalBefore);

    const isCompletingDeliveryNow =
      requestedStatus === "delivered" && currentStatus !== "delivered";

    if (isCompletingDeliveryNow && currentBalance > 0.009) {
      if (!(collectedAmount > 0)) {
        await conn.rollback();
        return res.status(400).json({
          message:
            "Please enter the amount collected by the rider before completing this delivery.",
        });
      }

      if (!DELIVERY_COLLECTION_METHODS.includes(collectedPaymentMethod)) {
        await conn.rollback();
        return res.status(400).json({
          message: "Invalid collected payment method.",
        });
      }

      if (collectedAmount > currentBalance + 0.01) {
        await conn.rollback();
        return res.status(400).json({
          message: `Collected amount exceeds the remaining balance of ₱${currentBalance.toLocaleString(
            "en-PH",
            { minimumFractionDigits: 2 },
          )}.`,
        });
      }
    }

    let deliveredDate = existing.delivered_date || null;

    if (requestedStatus === "delivered" && currentStatus !== "delivered") {
      deliveredDate = new Date();
    } else if (
      requestedStatus === "delivered" &&
      currentStatus === "delivered"
    ) {
      deliveredDate = existing.delivered_date || new Date();
    } else {
      deliveredDate = null;
    }

    await conn.query(
      `
      UPDATE deliveries
      SET
        status = ?,
        notes = ?,
        delivered_date = ?,
        signed_receipt = ?,
        updated_at = NOW()
      WHERE id = ?
      `,
      [
        requestedStatus,
        nextNotes !== undefined ? nextNotes : (existing.notes ?? null),
        deliveredDate,
        nextSignedReceipt,
        deliveryId,
      ],
    );

    if (isCompletingDeliveryNow && currentBalance > 0.009) {
      const paymentNotes = [
        `Collected on delivery by ${req.user.name || "assigned rider"}.`,
        `Order: ${order.order_number || `#${existing.order_id}`}`,
        `Remaining balance collected on site.`,
        collectionNotes ? `Rider note: ${collectionNotes}` : "",
      ]
        .filter(Boolean)
        .join("\n");

      await conn.query(
        `INSERT INTO payment_transactions
          (
            order_id,
            amount,
            payment_method,
            proof_url,
            verified_by,
            verified_at,
            status,
            notes
          )
         VALUES (?, ?, ?, ?, NULL, NULL, 'pending', ?)`,
        [
          existing.order_id,
          collectedAmount,
          collectedPaymentMethod,
          nextSignedReceipt || null,
          paymentNotes,
        ],
      );
    }

    const [[paymentRollup]] = await conn.query(
      `SELECT
         COALESCE(
           SUM(CASE WHEN LOWER(status) = 'verified' THEN amount ELSE 0 END),
           0
         ) AS verified_total,
         MAX(CASE WHEN LOWER(status) = 'pending' THEN 1 ELSE 0 END) AS has_pending,
         MAX(CASE WHEN LOWER(status) = 'rejected' THEN 1 ELSE 0 END) AS has_rejected
       FROM payment_transactions
       WHERE order_id = ?`,
      [existing.order_id],
    );

    const nextOrderPaymentStatus = computeOrderPaymentStatus({
      totalAmount,
      verifiedTotal: Number(paymentRollup?.verified_total || 0),
      hasPending: Number(paymentRollup?.has_pending || 0) === 1,
      hasRejected: Number(paymentRollup?.has_rejected || 0) === 1,
    });

    let nextOrderStatus = null;

    if (requestedStatus === "in_transit") {
      nextOrderStatus = "shipping";
    } else if (requestedStatus === "delivered") {
      nextOrderStatus = "delivered";
    } else if (requestedStatus === "failed") {
      nextOrderStatus = "shipping";
    }

    if (nextOrderStatus) {
      await conn.query(
        `UPDATE orders
         SET status = ?, payment_status = ?
         WHERE id = ?`,
        [nextOrderStatus, nextOrderPaymentStatus, existing.order_id],
      );
    } else {
      await conn.query(
        `UPDATE orders
         SET payment_status = ?
         WHERE id = ?`,
        [nextOrderPaymentStatus, existing.order_id],
      );
    }

    if (
      existing.assigned_by &&
      Number(existing.assigned_by) !== Number(req.user.id)
    ) {
      await conn.query(
        // 👉 ADDED is_read and created_at
        `INSERT INTO notifications (user_id, type, title, message, is_read, channel, sent_at, created_at)
         VALUES (?, 'delivery_update', 'Delivery Status Updated', ?, 0, 'system', NOW(), NOW())`,
        [
          existing.assigned_by,
          `${req.user.name || "Assigned rider"} updated delivery #${deliveryId} to ${requestedStatus.replace(/_/g, " ")}.`,
        ],
      );
    }

    if (
      existing.assigned_by &&
      isCompletingDeliveryNow &&
      currentBalance > 0.009
    ) {
      await conn.query(
        // 👉 ADDED is_read and created_at
        `INSERT INTO notifications (user_id, type, title, message, is_read, channel, sent_at, created_at)
         VALUES (?, 'payment_review', 'Delivery Payment Pending Review', ?, 0, 'system', NOW(), NOW())`,
        [
          existing.assigned_by,
          `${req.user.name || "Assigned rider"} recorded ₱${collectedAmount.toLocaleString(
            "en-PH",
            { minimumFractionDigits: 2 },
          )} collected on delivery for ${order.order_number || `#${existing.order_id}`}. Review the pending payment before completing the order.`,
        ],
      );
    }

    const [[updated]] = await conn.query(
      `
      SELECT
        d.id,
        d.order_id,
        d.driver_id,
        d.assigned_by,
        d.assigned_at,
        d.scheduled_date,
        d.delivered_date,
        d.address,
        d.status,
        d.notes,
        d.signed_receipt,
        d.updated_at,

        o.order_number,
        o.total,
        o.payment_method,
        o.payment_status,
        o.created_at AS order_created_at,

        COALESCE(
          (
            SELECT SUM(
              CASE
                WHEN LOWER(pt.status) = 'verified' THEN pt.amount
                ELSE 0
              END
            )
            FROM payment_transactions pt
            WHERE pt.order_id = o.id
          ),
          0
        ) AS payment_verified_total,

        GREATEST(
          o.total - COALESCE(
            (
              SELECT SUM(
                CASE
                  WHEN LOWER(pt.status) = 'verified' THEN pt.amount
                  ELSE 0
                END
              )
              FROM payment_transactions pt
              WHERE pt.order_id = o.id
            ),
            0
          ),
          0
        ) AS payment_balance,

        (
          SELECT COUNT(*)
          FROM payment_transactions pt
          WHERE pt.order_id = o.id
            AND LOWER(pt.status) = 'pending'
        ) AS pending_payment_count,

        COALESCE(o.walkin_customer_name, customer.name, 'Walk-in Customer') AS customer_name,
        COALESCE(o.walkin_customer_phone, customer.phone, '') AS customer_phone,

        driver.name AS driver_name
      FROM deliveries d
      INNER JOIN orders o ON o.id = d.order_id
      LEFT JOIN users customer ON customer.id = o.customer_id
      LEFT JOIN users driver ON driver.id = d.driver_id
      WHERE d.id = ?
      LIMIT 1
      `,
      [deliveryId],
    );

    await conn.commit();

    let message = "Delivery updated successfully";

    if (isCompletingDeliveryNow && currentBalance > 0.009) {
      message =
        "Delivery completed. Final collected payment is now pending admin verification.";
    } else if (requestedStatus === "delivered" && uploadedReceiptPath) {
      message =
        "Delivery marked as delivered and signed receipt uploaded successfully";
    } else if (requestedStatus === "delivered") {
      message = "Delivery marked as delivered successfully";
    } else if (uploadedReceiptPath) {
      message = "Signed receipt uploaded successfully";
    } else if (requestedStatus !== currentStatus) {
      message = "Delivery status updated successfully";
    }

    if (updated?.signed_receipt) {
      updated.signed_receipt = signUploadPath(updated.signed_receipt);
    }

    res.json({
      message,
      delivery: updated,
    });
  } catch (err) {
    if (conn) await conn.rollback();
    console.error("PATCH /api/pos/deliveries/:id/status error:", err);
    res.status(500).json({ message: "Failed to update delivery status" });
  } finally {
    if (conn) conn.release();
  }
};

/* ── RIDER DASHBOARD STATS ── */
exports.getRiderDashboard = async (req, res) => {
  try {
    const riderId = req.user.id;

    // Fetch all deliveries assigned to this rider regardless of date
    const [deliveries] = await db.query(
      `SELECT status FROM deliveries WHERE driver_id = ?`,
      [riderId],
    );

    let pendingCount = 0;
    let completedCount = 0;

    deliveries.forEach((d) => {
      if (d.status === "scheduled" || d.status === "in_transit") {
        pendingCount++;
      } else if (d.status === "delivered") {
        completedCount++;
      }
    });

    res.json({
      pending_today: pendingCount,
      completed_today: completedCount,
      total_deliveries: deliveries.length,
    });
  } catch (err) {
    console.error("[Rider Dashboard Error]", err);
    res.status(500).json({ message: "Failed to load dashboard stats" });
  }
};

/* ── RIDER DELIVERY HISTORY ── */
exports.getRiderHistory = async (req, res) => {
  try {
    const riderId = req.user.id;

    // Fetch completed/failed deliveries and safely grab online or walk-in customer names
    const [history] = await db.query(
      `SELECT 
         d.id AS delivery_id, 
         o.order_number, 
         COALESCE(o.walkin_customer_name, u.name, 'Walk-in Customer') AS customer_name, 
         d.address, 
         d.status, 
         o.payment_status, 
         o.total, 
         d.delivered_date, 
         d.updated_at 
       FROM deliveries d
       JOIN orders o ON d.order_id = o.id
       LEFT JOIN users u ON u.id = o.customer_id
       WHERE d.driver_id = ? AND d.status IN ('delivered', 'failed')
       ORDER BY d.updated_at DESC
       LIMIT 50`,
      [riderId],
    );
    res.json(history);
  } catch (err) {
    console.error("[Rider History Error]", err);
    res.status(500).json({ message: "Failed to load delivery history" });
  }
};
