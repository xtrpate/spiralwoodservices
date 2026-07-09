// controllers/staff/pos.orders.js
const db = require("../../config/db");

/* ── Helper: Generate Walk-in Order Number ── */
const generateOrderNumber = async (conn) => {
  const now = new Date();
  const datePart = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;

  for (let attempt = 0; attempt < 5; attempt++) {
    const suffix = Math.floor(Math.random() * 9000 + 1000);
    const candidate = `WLK-${datePart}-${suffix}`;

    const [existing] = await conn.query(
      "SELECT id FROM orders WHERE order_number = ? LIMIT 1",
      [candidate],
    );

    if (existing.length === 0) return candidate;
  }

  return `WLK-${datePart}-${Date.now().toString().slice(-6)}`;
};

/* ── Create Walk-in Order ── */
exports.createOrder = async (req, res) => {
  const {
    customer_name,
    customer_phone,
    items,
    payment_method,
    cash_received = null,
    change = null,
    discount = 0,
    delivery_fee = 0, // 👉 Captures the fee from frontend
    notes,
    delivery = null,
    appointment = null,
  } = req.body;

  const normalizedPaymentMethod = String(payment_method || "")
    .trim()
    .toLowerCase();
  const immediateMethods = ["cash", "gcash", "bank_transfer"];
  const deferredMethods = ["cod", "cop"];

  if (!Array.isArray(items) || items.length === 0)
    return res.status(400).json({ message: "No items in order" });
  if (!normalizedPaymentMethod)
    return res.status(400).json({ message: "Payment method is required" });
  if (
    ![...immediateMethods, ...deferredMethods].includes(normalizedPaymentMethod)
  )
    return res.status(400).json({ message: "Invalid payment method" });

  if (normalizedPaymentMethod === "cash") {
    const normalizedCash = parseFloat(cash_received);
    if (
      cash_received === null ||
      cash_received === undefined ||
      cash_received === "" ||
      Number.isNaN(normalizedCash) ||
      normalizedCash < 0
    )
      return res.status(400).json({
        message:
          "Cash received is required and must be a valid non-negative number.",
      });
  }

  if (delivery && !String(delivery.address || "").trim()) {
    return res.status(400).json({ message: "Delivery address is required" });
  }

  const conn = await db.getConnection();

  try {
    await conn.beginTransaction();

    for (const item of items) {
      const qty = parseInt(item.quantity, 10);
      if (!item.product_id || Number.isNaN(qty) || qty <= 0) {
        await conn.rollback();
        return res.status(400).json({ message: "Invalid cart item detected" });
      }

      if (item.variation_id) {
        const [variationRows] = await conn.query(
          `SELECT id, stock FROM product_variations WHERE id = ? LIMIT 1`,
          [item.variation_id],
        );
        if (!variationRows.length) {
          await conn.rollback();
          return res.status(404).json({
            message: `Variation not found for ${item.product_name || "item"}`,
          });
        }
        if (Number(variationRows[0].stock || 0) < qty) {
          await conn.rollback();
          return res.status(400).json({
            message: `Insufficient stock for ${item.product_name || "item"}`,
          });
        }
      } else {
        const [productRows] = await conn.query(
          `SELECT id, stock FROM products WHERE id = ? LIMIT 1`,
          [item.product_id],
        );
        if (!productRows.length) {
          await conn.rollback();
          return res.status(404).json({
            message: `Product not found for ${item.product_name || "item"}`,
          });
        }
        if (Number(productRows[0].stock || 0) < qty) {
          await conn.rollback();
          return res.status(400).json({
            message: `Insufficient stock for ${item.product_name || "item"}`,
          });
        }
      }
    }

    let subtotal = 0;
    for (const item of items) {
      subtotal +=
        parseFloat(item.unit_price || 0) * parseInt(item.quantity || 0, 10);
    }

    const tax = 0;
    const discountAmt = parseFloat(discount) || 0;
    const deliveryFeeAmt = parseFloat(delivery_fee) || 0;

    const total = Math.max(subtotal + tax - discountAmt + deliveryFeeAmt, 0);

    if (normalizedPaymentMethod === "cash") {
      const normalizedCashForTotal = parseFloat(cash_received);
      if (normalizedCashForTotal < total) {
        await conn.rollback();
        return res.status(400).json({
          message: "Cash received cannot be less than the total amount.",
        });
      }
    }

    const deliveryRequestedDate = delivery
      ? String(
          delivery.requested_date ||
            delivery.preferred_date ||
            delivery.scheduled_date ||
            "",
        ).trim()
      : "";
    const normalizedRequestedDeliveryDate = deliveryRequestedDate
      ? deliveryRequestedDate.replace("T", " ")
      : null;
    const deliveryRequestNotes = delivery
      ? String(delivery.notes || "").trim()
      : "";
    const storedOrderNotes = String(notes || "").trim() || null;

    const orderNumber = await generateOrderNumber(conn);
    const hasDeliveryRequest = Boolean(
      delivery && String(delivery.address || "").trim(),
    );
    const initialPaymentStatus = immediateMethods.includes(
      normalizedPaymentMethod,
    )
      ? "paid"
      : "pending";
    const initialOrderStatus = hasDeliveryRequest
      ? "confirmed"
      : immediateMethods.includes(normalizedPaymentMethod)
        ? "completed"
        : "pending";

    const [orderResult] = await conn.query(
      `
      INSERT INTO orders
      (
        order_number, walkin_customer_name, walkin_customer_phone, type, order_type,
        status, payment_method, payment_status, subtotal, tax, discount, delivery_fee, total,
        notes, delivery_address, requested_delivery_date, delivery_request_notes
      )
      VALUES (?, ?, ?, 'walkin', 'standard', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        orderNumber,
        customer_name || "Walk-in Customer",
        customer_phone || null,
        initialOrderStatus,
        normalizedPaymentMethod,
        initialPaymentStatus,
        subtotal,
        tax,
        discountAmt,
        deliveryFeeAmt,
        total,
        storedOrderNotes,
        delivery?.address?.trim() || null,
        normalizedRequestedDeliveryDate,
        deliveryRequestNotes || null,
      ],
    );

    const orderId = orderResult.insertId;

    for (const item of items) {
      const quantity = parseInt(item.quantity, 10);
      const unitPrice = parseFloat(item.unit_price || 0);
      const productionCost = parseFloat(item.production_cost || 0);
      const itemSubtotal = unitPrice * quantity;

      const [itemResult] = await conn.query(
        `
        INSERT INTO order_items
          (order_id, product_id, variation_id, product_name, quantity, unit_price, production_cost)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
        [
          orderId,
          item.product_id,
          item.variation_id || null,
          item.product_name,
          quantity,
          unitPrice,
          productionCost,
        ],
      );

      const orderItemId = itemResult.insertId;

      if (item.variation_id) {
        await conn.query(
          `UPDATE product_variations SET stock = stock - ? WHERE id = ?`,
          [quantity, item.variation_id],
        );
      } else {
        await conn.query(`UPDATE products SET stock = stock - ? WHERE id = ?`, [
          quantity,
          item.product_id,
        ]);
        await conn.query(
          `
          UPDATE products
          SET stock_status =
            CASE
              WHEN stock <= 0 THEN 'out_of_stock'
              WHEN stock <= reorder_point THEN 'low_stock'
              ELSE 'in_stock'
            END
          WHERE id = ?
          `,
          [item.product_id],
        );
      }

      await conn.query(
        `
        INSERT INTO stock_movements
          (product_id, type, quantity, order_id, order_item_id, notes, created_by)
        VALUES (?, 'out', ?, ?, ?, 'POS walk-in sale', ?)
        `,
        [item.product_id, quantity, orderId, orderItemId, req.user.id],
      );
    }

    if (immediateMethods.includes(normalizedPaymentMethod)) {
      await conn.query(
        `INSERT INTO payment_transactions (order_id, amount, payment_method, status, verified_by, verified_at) VALUES (?, ?, ?, 'verified', ?, NOW())`,
        [orderId, total, normalizedPaymentMethod, req.user.id],
      );
    } else {
      await conn.query(
        `INSERT INTO payment_transactions (order_id, amount, payment_method, status) VALUES (?, ?, ?, 'pending')`,
        [orderId, total, normalizedPaymentMethod],
      );
    }

    const receiptNumber = `OR-${Date.now()}`;
    const itemsSnapshot = JSON.stringify(items);
    const normalizedCashReceived =
      normalizedPaymentMethod === "cash" &&
      cash_received !== null &&
      cash_received !== undefined
        ? parseFloat(cash_received)
        : null;
    const normalizedChange =
      normalizedPaymentMethod === "cash" && normalizedCashReceived !== null
        ? Math.max(normalizedCashReceived - total, 0)
        : null;

    const [receiptResult] = await conn.query(
      `
      INSERT INTO receipts
        (order_id, receipt_number, issued_to, issued_by, total_amount, cash_received, change_amount, items_snapshot, printed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())
      `,
      [
        orderId,
        receiptNumber,
        customer_name || "Walk-in Customer",
        req.user.id,
        total,
        normalizedCashReceived,
        normalizedChange,
        itemsSnapshot,
      ],
    );

    // 👉 THE FIX: Removed the "INSERT INTO deliveries" query that caused the crash.
    let createdDelivery = null;
    if (delivery) {
      createdDelivery = {
        order_id: orderId,
        address: delivery.address.trim(),
        requested_date: normalizedRequestedDeliveryDate,
        status: "awaiting_admin_schedule",
        scheduled_date: null,
        assigned_driver: null,
      };
    }

    // 👉 RESTORED: Your original appointment tracking logic
    let createdAppointment = null;
    if (appointment) {
      const normalizedPurpose = String(appointment.purpose || "")
        .trim()
        .toLowerCase();
      const requestedAppointmentDate = String(
        appointment.preferred_date ||
          appointment.requested_date ||
          appointment.scheduled_date ||
          "",
      ).replace("T", " ");

      const [appointmentResult] = await conn.query(
        `
        INSERT INTO appointments
          (order_id, customer_id, handled_by, provider_id, request_owner_id, purpose, scheduled_date, preferred_date, status, notes)
        VALUES (?, NULL, NULL, NULL, ?, ?, ?, ?, 'pending', ?)
        `,
        [
          orderId,
          req.user.id,
          normalizedPurpose,
          requestedAppointmentDate,
          requestedAppointmentDate,
          String(appointment.notes || "").trim() || null,
        ],
      );

      createdAppointment = {
        id: appointmentResult.insertId,
        order_id: orderId,
        purpose: normalizedPurpose,
        scheduled_date: requestedAppointmentDate,
        preferred_date: requestedAppointmentDate,
        status: "pending",
        handled_by: null,
        assigned_to: null,
      };
    }

    await conn.commit();

    res.json({
      message: "Order created successfully",
      order_id: orderId,
      order_number: orderNumber,
      receipt_id: receiptResult.insertId,
      receipt_number: receiptNumber,
      total,
      cash_received: normalizedCashReceived,
      change: normalizedChange,
      payment_status: initialPaymentStatus,
      delivery: createdDelivery,
      appointment: createdAppointment,
    });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ message: "Server error", error: err.message });
  } finally {
    conn.release();
  }
};

/* ── Get Single Order Detail ── */
exports.getOrderById = async (req, res) => {
  try {
    const [orders] = await db.query(
      `
      SELECT o.*, r.receipt_number, r.id AS receipt_id, r.items_snapshot
      FROM orders o
      LEFT JOIN receipts r ON r.order_id = o.id
      WHERE o.id = ?
      `,
      [parseInt(req.params.id)],
    );

    if (orders.length === 0)
      return res.status(404).json({ message: "Order not found" });

    const order = orders[0];
    const [items] = await db.query(
      "SELECT * FROM order_items WHERE order_id = ?",
      [parseInt(req.params.id)],
    );
    order.items = items;

    res.json(order);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};

/* ── List Walk-in Orders (Paginated) ── */
exports.getOrders = async (req, res) => {
  const { from, to, page = 1, limit = 20 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  try {
    let where = "WHERE o.type = 'walkin'";
    const params = [];

    if (from) {
      where += " AND DATE(o.created_at) >= ?";
      params.push(from);
    }
    if (to) {
      where += " AND DATE(o.created_at) <= ?";
      params.push(to);
    }

    const [rows] = await db.query(
      `
      SELECT o.id, o.order_number, o.walkin_customer_name,
             o.walkin_customer_phone, o.total, o.payment_method,
             o.status, o.created_at, r.receipt_number, r.id AS receipt_id,
             u.name AS processed_by
      FROM orders o
      LEFT JOIN receipts r ON r.order_id = o.id
      LEFT JOIN users u ON u.id = r.issued_by
      ${where}
      ORDER BY o.created_at DESC
      LIMIT ? OFFSET ?
      `,
      [...params, parseInt(limit), parseInt(offset)],
    );

    const [count] = await db.query(
      `SELECT COUNT(*) AS total FROM orders o ${where}`,
      params,
    );

    res.json({
      orders: rows,
      total: count[0].total,
      page: parseInt(page),
      limit: parseInt(limit),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};