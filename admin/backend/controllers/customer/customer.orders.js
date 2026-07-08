// controllers/customer/customer.orders.js
const db = require("../../config/db"); // Uses the unified db config
const axios = require("axios");

/* ── Get Settings (Payment Info) ── */
exports.getSettings = async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT setting_key, value FROM website_settings
       WHERE setting_key IN ('gcash_number','bank_account_name','bank_account_number')`,
    );
    const out = {};
    rows.forEach((r) => {
      out[r.setting_key] = r.value;
    });
    res.json(out);
  } catch (err) {
    res.json({}); // silently return empty — non-critical
  }
};

/* ── Place a New Order ── */
exports.createOrder = async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const {
      items: itemsRaw,
      name,
      phone,
      delivery_address,
      payment_method,
      notes,
      subtotal,
      total,
    } = req.body;

    const items = JSON.parse(itemsRaw);
    if (!items?.length) {
      await conn.rollback();
      return res.status(400).json({ message: "Cart is empty." });
    }

    if (!name || !phone || !payment_method) {
      await conn.rollback();
      return res.status(400).json({ message: "Missing required fields." });
    }

    /* Generate order number: SWS-YYYYMMDD-XXXX */
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const rand = Math.floor(1000 + Math.random() * 9000);
    const order_number = `SWS-${dateStr}-${rand}`;

    /* Payment status logic */
    const payment_status = ["cod", "cop"].includes(payment_method)
      ? "unpaid"
      : "partial";

    const proof_path = req.file ? `uploads/proofs/${req.file.filename}` : null;

    /* Insert order */
    // ── FIXED: Switched conn.execute to conn.query ──
    const [orderRes] = await conn.query(
      `INSERT INTO orders
        (order_number, customer_id, type, order_type, status,
        payment_method, payment_status, payment_proof,
        delivery_address, walkin_customer_name, walkin_customer_phone,
        notes, subtotal, total, created_at)
      VALUES (?,?,'online','standard','pending',?,?,?,?,?,?,?,?,?,NOW())`,
      [
        order_number,
        req.user.id,
        payment_method,
        payment_status,
        proof_path,
        delivery_address || "",
        name,
        phone,
        notes || "",
        parseFloat(subtotal),
        parseFloat(total),
      ],
    );

    const order_id = orderRes.insertId;

    /* Insert order items + deduct stock */
    for (const item of items) {
      const unit_price = parseFloat(item.unit_price);

      // ── FIXED: Removed 'subtotal' from the column list and values ──
      // MySQL will calculate this automatically because it is a generated column.
      await conn.query(
        `INSERT INTO order_items
          (order_id, product_id, variation_id,
           product_name, quantity, unit_price)
         VALUES (?,?,?,?,?,?)`,
        [
          order_id,
          item.product_id,
          item.variation_id || null,
          item.product_name,
          item.quantity,
          unit_price,
        ],
      );

      /* Deduct stock */
      if (item.variation_id) {
        await conn.query(
          `UPDATE product_variations
           SET stock = GREATEST(0, stock - ?)
           WHERE id = ?`,
          [item.quantity, item.variation_id],
        );
      } else {
        await conn.query(
          `UPDATE products
           SET stock = GREATEST(0, stock - ?)
           WHERE id = ?`,
          [item.quantity, item.product_id],
        );
      }

      /* Update stock_status after deduction */
      await conn.query(
        `UPDATE products
         SET stock_status = CASE
           WHEN stock <= 0              THEN 'out_of_stock'
           WHEN stock <= reorder_point  THEN 'low_stock'
           ELSE 'in_stock'
         END
         WHERE id = ?`,
        [item.product_id],
      );
    }

    await conn.commit();

    if (payment_method === "paymongo") {
      try {
        // 👉 NEW: Fetch the customer's email from the database
        const [[userRecord]] = await conn.query(
          `SELECT email FROM users WHERE id = ? LIMIT 1`,
          [req.user.id],
        );
        // Fallback just in case, though they should always have an email
        const customerEmail = userRecord?.email || "";

        const frontendUrl =
          req.headers.origin || "https://spiralwood.onrender.com";
        const amountInCents = Math.round(parseFloat(total) * 100);
        const base64Auth = Buffer.from(
          process.env.PAYMONGO_SECRET_KEY,
        ).toString("base64");

        const paymongoPayload = {
          data: {
            attributes: {
              billing: {
                name: name,
                phone: phone,
                email: customerEmail, // 👉 FIX: This auto-fills the PayMongo email box!
              },
              send_email_receipt: false,
              show_description: true,
              show_line_items: true,
              description: `Order ${order_number} - Spiral Wood`,
              payment_method_types: ["card", "gcash", "paymaya"],
              line_items: [
                {
                  currency: "PHP",
                  amount: amountInCents,
                  name: `Order ${order_number}`,
                  quantity: 1,
                },
              ],
              success_url: `${frontendUrl}/orders?verify_success=true&order=${order_number}`,
              cancel_url: `${frontendUrl}/cart`,
            },
          },
        };

        const paymongoRes = await axios.post(
          "https://api.paymongo.com/v1/checkout_sessions",
          paymongoPayload,
          {
            headers: {
              accept: "application/json",
              "content-type": "application/json",
              authorization: `Basic ${base64Auth}`,
            },
          },
        );

        return res.status(201).json({
          message: "Order placed. Redirecting to payment...",
          order_id,
          order_number,
          payment_url: paymongoRes.data.data.attributes.checkout_url,
        });
      } catch (paymongoError) {
        console.error(
          "PayMongo Error:",
          paymongoError.response?.data || paymongoError.message,
        );
        return res.status(201).json({
          message: "Order placed, but payment link generation failed.",
          order_id,
          order_number,
          total: parseFloat(total),
          payment_status,
        });
      }
    }

    res.status(201).json({
      message: "Order placed successfully.",
      order_id,
      order_number,
      total: parseFloat(total),
      payment_status,
    });
  } catch (err) {
    if (!conn.connection._fatalError) await conn.rollback();
    console.error("[customer.orders POST]", err);
    res.status(500).json({ message: "Server error.", error: err.message });
  } finally {
    conn.release();
  }
};

/* ── List My Orders ── */
exports.getOrders = async (req, res) => {
  try {
    // ── FIXED: Switched to .query ──
    const [orders] = await db.query(
      `SELECT id, order_number, status, payment_method,
              payment_status, subtotal, total,
              delivery_address, walkin_customer_name AS recipient_name,
              notes, created_at
       FROM orders
       WHERE customer_id = ?
       ORDER BY created_at DESC`,
      [req.user.id],
    );

    for (const order of orders) {
      // ── FIXED: Switched to .query ──
      const [items] = await db.query(
        `SELECT COUNT(*) AS cnt, SUM(quantity) AS qty
         FROM order_items WHERE order_id = ?`,
        [order.id],
      );
      order.item_count = items[0].cnt;
      order.total_qty = items[0].qty;
    }

    res.json(orders);
  } catch (err) {
    console.error("[customer.orders GET]", err);
    res.status(500).json({ message: "Server error.", error: err.message });
  }
};

/* ── Single Order Detail ── */
exports.getOrderById = async (req, res) => {
  try {
    // ── FIXED: Switched to .query and parsed ID ──
    const [rows] = await db.query(
      `SELECT * FROM orders
       WHERE id = ? AND customer_id = ?`,
      [parseInt(req.params.id), req.user.id],
    );
    if (!rows.length)
      return res.status(404).json({ message: "Order not found." });

    const order = rows[0];
    // ── FIXED: Switched to .query ──
    const [items] = await db.query(
      `SELECT oi.*, p.image_url
       FROM order_items oi
       LEFT JOIN products p ON p.id = oi.product_id
       WHERE oi.order_id = ?`,
      [order.id],
    );
    order.items = items;

    res.json(order);
  } catch (err) {
    console.error("[customer.orders/:id]", err);
    res.status(500).json({ message: "Server error.", error: err.message });
  }
};

/* ── Customer Confirms Delivery ── */
exports.confirmOrder = async (req, res) => {
  try {
    // ── FIXED: Switched to .query and parsed ID ──
    const [[order]] = await db.query(
      `SELECT id, status, payment_status, payment_method
       FROM orders
       WHERE id = ? AND customer_id = ?
       LIMIT 1`,
      [parseInt(req.params.id), req.user.id],
    );

    if (!order) {
      return res.status(404).json({ message: "Order not found." });
    }

    if (order.status !== "delivered") {
      return res.status(400).json({
        message: "Only delivered orders can be confirmed by the customer.",
      });
    }

    if (String(order.payment_status || "").toLowerCase() !== "paid") {
      return res.status(400).json({
        message:
          "This order cannot be completed yet because payment is not fully settled.",
      });
    }

    // ── FIXED: Switched to .query and parsed ID ──
    const [result] = await db.query(
      `UPDATE orders
       SET status = 'completed'
       WHERE id = ? AND customer_id = ? AND status = 'delivered' AND payment_status = 'paid'`,
      [parseInt(req.params.id), req.user.id],
    );

    if (result.affectedRows === 0) {
      return res.status(400).json({
        message: "Order could not be confirmed.",
      });
    }

    res.json({ message: "Order confirmed successfully." });
  } catch (err) {
    console.error("[customer.orders/:id/confirm]", err);
    res.status(500).json({ message: "Server error.", error: err.message });
  }
};

/* ── Verify PayMongo Redirect ── */
exports.verifyPayment = async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const { order_number } = req.body;

    if (!order_number) {
      await conn.rollback();
      return res.status(400).json({ message: "Order number is required." });
    }

    // 1. Find the order to get the total amount
    const [[order]] = await conn.query(
      `SELECT id, total, payment_status FROM orders 
       WHERE order_number = ? AND customer_id = ? LIMIT 1`,
      [order_number, req.user.id],
    );

    if (!order) {
      await conn.rollback();
      return res
        .status(404)
        .json({ message: "Order not found or unauthorized." });
    }

    // If already verified, just return
    if (order.payment_status === "paid") {
      await conn.rollback();
      return res.json({ success: true, message: "Payment already verified." });
    }

    // 2. Mark order as paid
    await conn.query(
      `UPDATE orders 
       SET payment_status = 'paid', status = 'confirmed' 
       WHERE id = ?`,
      [order.id],
    );

    // 3. Create the official payment record so Admin can see it
    await conn.query(
      `INSERT INTO payment_transactions
        (order_id, amount, payment_method, proof_url, status, verified_at, notes)
       VALUES (?, ?, 'paymongo', '', 'verified', NOW(), 'Automatically verified via PayMongo integration.')`,
      [order.id, order.total],
    );

    await conn.commit();
    res.json({ success: true, message: "Payment verified and order updated." });
  } catch (err) {
    if (!conn.connection._fatalError) await conn.rollback();
    console.error("[customer.orders verifyPayment]", err);
    res.status(500).json({ message: "Server error.", error: err.message });
  } finally {
    conn.release();
  }
};

/* ── Customer Cancels Order ── */
exports.cancelOrder = async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const { reason } = req.body;
    const orderId = parseInt(req.params.id); // ── FIXED: Parse ID ──
    const customerId = req.user.id;

    // 1. Update the order ONLY if it is still 'pending'
    // ── FIXED: Switched conn.execute to conn.query ──
    const [updateResult] = await conn.query(
      `UPDATE orders
       SET status = 'cancelled',
           notes = CONCAT(IFNULL(notes, ''), '\nCancellation Reason: ', ?)
       WHERE id = ? AND customer_id = ? AND status = 'pending'`,
      [reason || "Cancelled by customer", orderId, customerId],
    );

    if (updateResult.affectedRows === 0) {
      await conn.rollback();
      return res.status(400).json({
        message:
          "Order could not be cancelled. It may not exist or is no longer pending.",
      });
    }

    // 👉 NEW: 2. Insert the cancellation request so Admin can see it
    // ── FIXED: Switched conn.execute to conn.query ──
    await conn.query(
      `INSERT INTO cancellations (order_id, requested_by, reason, created_at)
       VALUES (?, ?, ?, NOW())`,
      [orderId, customerId, reason || "Cancelled by customer"],
    );

    // 3. Fetch all items associated with this cancelled order
    // ── FIXED: Switched conn.execute to conn.query ──
    const [items] = await conn.query(
      `SELECT product_id, variation_id, quantity 
       FROM order_items 
       WHERE order_id = ?`,
      [orderId],
    );

    // 4. Return the stock for each item
    for (const item of items) {
      if (item.variation_id) {
        // ── FIXED: Switched conn.execute to conn.query ──
        await conn.query(
          `UPDATE product_variations
           SET stock = stock + ?
           WHERE id = ?`,
          [item.quantity, item.variation_id],
        );
      } else {
        // ── FIXED: Switched conn.execute to conn.query ──
        await conn.query(
          `UPDATE products
           SET stock = stock + ?
           WHERE id = ?`,
          [item.quantity, item.product_id],
        );
      }

      // ── FIXED: Switched conn.execute to conn.query ──
      await conn.query(
        `UPDATE products
         SET stock_status = CASE
           WHEN stock <= 0              THEN 'out_of_stock'
           WHEN stock <= reorder_point  THEN 'low_stock'
           ELSE 'in_stock'
         END
         WHERE id = ?`,
        [item.product_id],
      );
    }

    await conn.commit();
    res.json({ message: "Order cancelled and submitted for admin review." });
  } catch (err) {
    if (!conn.connection._fatalError) await conn.rollback();
    console.error("[customer.orders/:id/cancel]", err);
    res.status(500).json({ message: "Server error.", error: err.message });
  } finally {
    conn.release();
  }
};
