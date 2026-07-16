// controllers/orderController.js – Order Management (Admin) [SCHEMA-CORRECTED]
// controllers/orderController.js – Order Management (Admin) [SCHEMA-CORRECTED]
const pool = require("../../config/db");
const { signUploadPath } = require("../../utils/signedUrl");
const {
  resolveLifecycleByOrder,
} = require("../../services/blueprintLifecycleService");

const normalize = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");

function normalizeTaskRole(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}

const BLUEPRINT_PRODUCTION_TASK_ROLE_OPTIONS = [
  "Cutting Machine",
  "Edge Banding",
  "Horizontal Drilling",
  "Retouching",
  "Packing",
];

const REQUIRED_BLUEPRINT_TASK_ROLES =
  BLUEPRINT_PRODUCTION_TASK_ROLE_OPTIONS.map(normalizeTaskRole);

const getTaskRoleLabel = (role) =>
  BLUEPRINT_PRODUCTION_TASK_ROLE_OPTIONS.find(
    (label) => normalizeTaskRole(label) === normalizeTaskRole(role),
  ) || role;

const safeParseJson = (value, fallback = null) => {
  try {
    if (!value) return fallback;
    if (typeof value === "object") return value;
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

const normalizeCustomRequestItem = (item = {}) => {
  const customization = safeParseJson(item.customization_json, null);

  const editorSnapshot =
    customization?.editor_snapshot &&
    typeof customization.editor_snapshot === "object" &&
    !Array.isArray(customization.editor_snapshot)
      ? customization.editor_snapshot
      : null;

  return {
    ...item,
    customization,
    display_name:
      customization?.base_blueprint_title ||
      item.product_name ||
      "Custom Furniture",
    preview_image_url:
      customization?.preview_image_url || customization?.image_url || "",
    requested_blueprint_id: Number(customization?.blueprint_id || 0) || null,
    requested_base_blueprint_title: customization?.base_blueprint_title || "",
    requested_wood_type: customization?.wood_type || "",
    requested_finish_color:
      customization?.finish_color || customization?.color || "",
    requested_door_style: customization?.door_style || "",
    requested_hardware: customization?.hardware || "",
    requested_width: Number(customization?.width) || 0,
    requested_height: Number(customization?.height) || 0,
    requested_depth: Number(customization?.depth) || 0,
    requested_unit: customization?.unit || "mm",
    requested_comments: customization?.comments || "",
    customization_snapshot:
      customization?.customization_snapshot &&
      typeof customization.customization_snapshot === "object"
        ? customization.customization_snapshot
        : null,
    editor_snapshot: editorSnapshot,
  };
};

const sendSystemNotificationSafe = async (
  conn,
  userId,
  { type = "custom_request_update", title, message },
) => {
  if (!userId) return;

  try {
    await conn.query(
      `INSERT INTO notifications
        (user_id, type, title, message, is_read, channel, sent_at, created_at)
       VALUES (?, ?, ?, ?, 0, 'system', NOW(), NOW())`,
      [userId, type, title, message],
    );
  } catch (err) {
    console.error("[orders notification insert skipped]", err?.message || err);
  }
};

const buildCustomRequestBlueprintPayload = ({
  order,
  customItem,
  baseBlueprint = null,
  adminUserId,
}) => {
  const customization = safeParseJson(customItem?.customization_json, {}) || {};

  const editorSnapshot =
    customization?.editor_snapshot &&
    typeof customization.editor_snapshot === "object" &&
    !Array.isArray(customization.editor_snapshot)
      ? customization.editor_snapshot
      : null;

  const baseDesign =
    safeParseJson(baseBlueprint?.design_data, {}) &&
    typeof safeParseJson(baseBlueprint?.design_data, {}) === "object"
      ? safeParseJson(baseBlueprint?.design_data, {})
      : {};

  const baseView3d =
    safeParseJson(baseBlueprint?.view_3d_data, {}) &&
    typeof safeParseJson(baseBlueprint?.view_3d_data, {}) === "object"
      ? safeParseJson(baseBlueprint?.view_3d_data, {})
      : {};

  const titleBase =
    customization?.base_blueprint_title ||
    baseBlueprint?.title ||
    customItem?.product_name ||
    "Custom Furniture";

  const worldSize =
    editorSnapshot?.worldSize && typeof editorSnapshot.worldSize === "object"
      ? editorSnapshot.worldSize
      : baseDesign?.worldSize ||
        baseView3d?.worldSize || {
          w: 6400,
          h: 3200,
          d: 5200,
        };

  const components = Array.isArray(editorSnapshot?.components)
    ? editorSnapshot.components
    : Array.isArray(baseDesign?.components)
      ? baseDesign.components
      : Array.isArray(baseView3d?.components)
        ? baseView3d.components
        : [];

  const requestMeta = {
    order_id: order.id,
    order_number: order.order_number,
    requested_wood_type: customization?.wood_type || "",
    requested_finish_color:
      customization?.finish_color || customization?.color || "",
    requested_door_style: customization?.door_style || "",
    requested_hardware: customization?.hardware || "",
    requested_width: Number(customization?.width) || 0,
    requested_height: Number(customization?.height) || 0,
    requested_depth: Number(customization?.depth) || 0,
    requested_unit: customization?.unit || "mm",
    requested_comments: customization?.comments || "",
    source_blueprint_id: Number(customization?.blueprint_id || 0) || null,
  };

  const designData = {
    ...(baseDesign && typeof baseDesign === "object" ? baseDesign : {}),
    components,
    worldSize,
    customer_request: requestMeta,
    derived_from_blueprint_id: baseBlueprint?.id || null,
    derived_from_blueprint_title: baseBlueprint?.title || null,
  };

  const view3dData = {
    ...(baseView3d && typeof baseView3d === "object" ? baseView3d : {}),
    components,
    worldSize,
    customer_request: requestMeta,
    derived_from_blueprint_id: baseBlueprint?.id || null,
    derived_from_blueprint_title: baseBlueprint?.title || null,
  };

  return {
    title: `${titleBase} — ${order.order_number}`,
    description: `Working custom-request blueprint for ${order.order_number}.`,
    creator_id: adminUserId,
    client_id: order.customer_id || null,
    source: "created",
    stage: "estimation",
    file_url: baseBlueprint?.file_url || null,
    file_type: baseBlueprint?.file_type || null,
    thumbnail_url:
      customization?.preview_image_url ||
      customization?.image_url ||
      baseBlueprint?.thumbnail_url ||
      null,
    design_data: JSON.stringify(designData),
    view_3d_data: JSON.stringify(view3dData),
    locked_fields: JSON.stringify([]),
    is_template: 0,
    is_gallery: 0,
    is_deleted: 0,
    archived_at: null,
  };
};

const getCustomRequestOrderForAdmin = async (conn, orderId) => {
  const [[order]] = await conn.query(
    `SELECT
        o.id,
        o.order_number,
        o.customer_id,
        o.status,
        o.order_type,
        o.notes,
        o.blueprint_id
      FROM orders o
      WHERE o.id = ?
      LIMIT 1`,
    [parseInt(orderId)],
  );

  if (!order) {
    return { error: { code: 404, message: "Order not found." } };
  }

  if (normalize(order.order_type) !== "blueprint") {
    return {
      error: {
        code: 400,
        message: "This action is only allowed for custom blueprint requests.",
      },
    };
  }

  return { order };
};

exports.approveCustomRequest = async (req, res) => {
  const conn = await pool.getConnection();

  try {
    const orderId = parseInt(req.params.id);
    const adminNote = String(req.body?.note || "").trim();

    await conn.beginTransaction();

    const result = await getCustomRequestOrderForAdmin(conn, orderId);
    if (result.error) {
      await conn.rollback();
      return res
        .status(result.error.code)
        .json({ message: result.error.message });
    }

    const { order } = result;
    const currentStatus = normalize(order.status);

    if (["cancelled", "completed"].includes(currentStatus)) {
      await conn.rollback();
      return res.status(400).json({
        message: "This custom request can no longer be approved.",
      });
    }

    let resolvedBlueprintId = Number(order.blueprint_id || 0) || null;

    if (!resolvedBlueprintId) {
      const [[customItem]] = await conn.query(
        `SELECT id, product_name, customization_json
         FROM order_items
         WHERE order_id = ?
           AND customization_json IS NOT NULL
         ORDER BY id ASC
         LIMIT 1`,
        [orderId],
      );

      if (customItem) {
        const customization =
          safeParseJson(customItem.customization_json, {}) || {};

        const requestedBlueprintId =
          Number(customization?.blueprint_id || 0) || null;

        let baseBlueprint = null;

        if (requestedBlueprintId) {
          const [[bp]] = await conn.query(
            `SELECT
                id,
                title,
                description,
                file_url,
                file_type,
                thumbnail_url,
                design_data,
                view_3d_data
             FROM blueprints
             WHERE id = ?
             LIMIT 1`,
            [requestedBlueprintId],
          );

          baseBlueprint = bp || null;
        }

        const draftBlueprint = buildCustomRequestBlueprintPayload({
          order,
          customItem,
          baseBlueprint,
          adminUserId: req.user.id,
        });

        const [insertBlueprint] = await conn.query(
          `INSERT INTO blueprints
            (
              title,
              description,
              creator_id,
              client_id,
              source,
              stage,
              file_url,
              file_type,
              thumbnail_url,
              design_data,
              view_3d_data,
              locked_fields,
              is_template,
              is_gallery,
              is_deleted,
              archived_at
            )
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [
            draftBlueprint.title,
            draftBlueprint.description,
            draftBlueprint.creator_id,
            draftBlueprint.client_id,
            draftBlueprint.source,
            draftBlueprint.stage,
            draftBlueprint.file_url,
            draftBlueprint.file_type,
            draftBlueprint.thumbnail_url,
            draftBlueprint.design_data,
            draftBlueprint.view_3d_data,
            draftBlueprint.locked_fields,
            draftBlueprint.is_template,
            draftBlueprint.is_gallery,
            draftBlueprint.is_deleted,
            draftBlueprint.archived_at,
          ],
        );

        resolvedBlueprintId = insertBlueprint.insertId;
      }
    }

    await conn.query(
      `UPDATE orders
       SET status = 'confirmed',
           blueprint_id = COALESCE(?, blueprint_id)
       WHERE id = ?`,
      [resolvedBlueprintId, orderId],
    );

    if (resolvedBlueprintId) {
      await conn.query(
        `UPDATE blueprints
         SET client_id = COALESCE(client_id, ?),
             stage = 'estimation'
         WHERE id = ?`,
        [order.customer_id || null, resolvedBlueprintId],
      );
    }

    await sendSystemNotificationSafe(conn, order.customer_id, {
      type: "custom_request_approved",
      title: "Custom Request Approved",
      message: adminNote
        ? `Your custom request ${order.order_number} was approved for admin estimation review. Note: ${adminNote}`
        : `Your custom request ${order.order_number} was approved for admin estimation review.`,
    });

    await conn.commit();

    return res.json({
      message: "Custom request approved successfully.",
      blueprint_id: resolvedBlueprintId,
    });
  } catch (err) {
    await conn.rollback();
    return res.status(500).json({
      message: err.message || "Failed to approve custom request.",
    });
  } finally {
    conn.release();
  }
};

exports.requestCustomRequestRevision = async (req, res) => {
  const conn = await pool.getConnection();

  try {
    const orderId = parseInt(req.params.id);
    const adminNote = String(req.body?.note || "").trim();

    await conn.beginTransaction();

    const result = await getCustomRequestOrderForAdmin(conn, orderId);
    if (result.error) {
      await conn.rollback();
      return res
        .status(result.error.code)
        .json({ message: result.error.message });
    }

    const { order } = result;
    const currentStatus = normalize(order.status);

    if (["cancelled", "completed"].includes(currentStatus)) {
      await conn.rollback();
      return res.status(400).json({
        message: "This custom request can no longer be sent back for revision.",
      });
    }

    await sendSystemNotificationSafe(conn, order.customer_id, {
      type: "custom_request_revision",
      title: "Revision Requested",
      message: adminNote
        ? `Admin requested revision for custom request ${order.order_number}. Note: ${adminNote}`
        : `Admin requested revision for custom request ${order.order_number}. Please review and update your submitted design.`,
    });

    await conn.commit();

    return res.json({
      message: "Revision request sent successfully.",
    });
  } catch (err) {
    await conn.rollback();
    return res.status(500).json({
      message: err.message || "Failed to request revision.",
    });
  } finally {
    conn.release();
  }
};

exports.rejectCustomRequest = async (req, res) => {
  const conn = await pool.getConnection();

  try {
    const orderId = parseInt(req.params.id);
    const reason = String(req.body?.reason || req.body?.note || "").trim();

    await conn.beginTransaction();

    const result = await getCustomRequestOrderForAdmin(conn, orderId);
    if (result.error) {
      await conn.rollback();
      return res
        .status(result.error.code)
        .json({ message: result.error.message });
    }

    const { order } = result;
    const currentStatus = normalize(order.status);

    if (["cancelled", "completed"].includes(currentStatus)) {
      await conn.rollback();
      return res.status(400).json({
        message: "This custom request can no longer be rejected.",
      });
    }

    await conn.query(
      `UPDATE orders
       SET status = 'cancelled',
           cancellation_reason = ?,
           cancelled_at = NOW()
       WHERE id = ?`,
      [reason || "Rejected by admin during custom request review.", orderId],
    );

    await sendSystemNotificationSafe(conn, order.customer_id, {
      type: "custom_request_rejected",
      title: "Custom Request Rejected",
      message: reason
        ? `Your custom request ${order.order_number} was rejected. Reason: ${reason}`
        : `Your custom request ${order.order_number} was rejected by admin.`,
    });

    await conn.commit();

    return res.json({
      message: "Custom request rejected successfully.",
    });
  } catch (err) {
    await conn.rollback();
    return res.status(500).json({
      message: err.message || "Failed to reject custom request.",
    });
  } finally {
    conn.release();
  }
};

exports.getAll = async (req, res) => {
  try {
    const {
      status,
      channel,
      search,
      from,
      to,
      page = 1,
      limit = 20,
    } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const where = ["1=1"];
    const params = [];

    if (status) {
      where.push("o.status = ?");
      params.push(status);
    }
    if (channel) {
      where.push("o.type = ?");
      params.push(channel);
    }
    if (from && to) {
      where.push("DATE(o.created_at) BETWEEN ? AND ?");
      params.push(from, to);
    }
    if (search) {
      where.push(
        "(COALESCE(u.name, o.walkin_customer_name) LIKE ? OR o.id = ? OR o.order_number LIKE ?)",
      );
      params.push(`%${search}%`, parseInt(search) || 0, `%${search}%`);
    }

    const [orders] = await pool.query(
      `SELECT o.id, o.order_number, o.order_type, o.type AS channel, o.status,
              o.total AS total_amount, o.payment_method, o.payment_status, o.created_at,
              (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = o.id) AS item_count,
              COALESCE(u.name,  o.walkin_customer_name)  AS customer_name,
              COALESCE(u.email, '')                      AS customer_email,
              COALESCE(u.phone, o.walkin_customer_phone)  AS customer_phone
       FROM orders o LEFT JOIN users u ON u.id = o.customer_id
       WHERE ${where.join(" AND ")}
       ORDER BY o.created_at DESC LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), parseInt(offset)],
    );

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM orders o LEFT JOIN users u ON u.id = o.customer_id
       WHERE ${where.join(" AND ")}`,
      params,
    );

    res.json({ orders, total });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const path = require("path");

const adminToPositiveInt = (value, fallback = 0) => {
  const n = parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

const adminNormalizeText = (value) =>
  String(value || "")
    .trim()
    .toLowerCase();

const adminSafeTextOrNull = (value) => {
  const text = String(value ?? "").trim();
  return text || null;
};

const adminInsertDiscussionNotificationSafe = async (
  conn,
  userId,
  { type = "order_update", title, message },
) => {
  if (!userId) return;

  try {
    // ── FIXED: Switched to .query ──
    await conn.query(
      `INSERT INTO notifications
        (user_id, type, title, message, is_read, channel, sent_at, created_at)
       VALUES (?, ?, ?, ?, 0, 'system', NOW(), NOW())`,
      [userId, type, title, message],
    );
  } catch (err) {
    console.error("[admin.order discussion notification skipped]", err);
  }
};

exports.getOne = async (req, res) => {
  try {
    const orderId = parseInt(req.params.id);

    const [[order]] = await pool.query(
      `SELECT 
          o.*,
          o.type AS channel,
          o.total AS total_amount,
          COALESCE(u.name, o.walkin_customer_name) AS customer_name,
          COALESCE(u.email, '') AS customer_email,
          COALESCE(u.phone, o.walkin_customer_phone) AS customer_phone,
          COALESCE(u.address, o.delivery_address) AS customer_address
       FROM orders o
       LEFT JOIN users u ON u.id = o.customer_id
       WHERE o.id = ?`,
      [orderId],
    );

    if (!order) {
      return res.status(404).json({ message: "Order not found." });
    }

    const [rawItems] = await pool.query(
      `SELECT * FROM order_items WHERE order_id = ? ORDER BY id ASC`,
      [orderId],
    );

    const items = rawItems.map(normalizeCustomRequestItem);

    const customRequestItems = items.filter((item) =>
      Boolean(item.customization),
    );

    const [paymentTransactions] = await pool.query(
      `SELECT 
          pt.*,
          u.name AS verified_by
       FROM payment_transactions pt
       LEFT JOIN users u ON u.id = pt.verified_by
       WHERE pt.order_id = ?
       ORDER BY pt.created_at DESC, pt.id DESC`,
      [orderId],
    );

    paymentTransactions.forEach((p) => {
      if (p.proof_url) p.proof_url = signUploadPath(p.proof_url);
      // Real, persisted payment_transactions rows — never synthetic.
      p.persisted = true;
      p.is_legacy_synthetic = false;
    });

    // `payments` is the DISPLAY array (legacy-compatible) — it may also
    // contain the synthetic initial_* row below. `paymentTransactions`
    // stays real-rows-only and is the sole source for every financial
    // total below; the two must never be conflated again.
    const payments = [...paymentTransactions];

    if (order.payment_proof && paymentTransactions.length === 0) {
      payments.push({
        id: `initial_${order.id}`,
        order_id: order.id,
        amount: order.total_amount,
        payment_method: order.payment_method,
        proof_url: signUploadPath(order.payment_proof),
        status: order.payment_status === "paid" ? "verified" : "pending",
        notes: "Initial order placement proof.",
        created_at: order.created_at,
        verified_by: null,
        // Never a real transaction — must never be counted toward any
        // financial total or contract eligibility, only shown for
        // backward-compatible legacy proof display.
        persisted: false,
        is_legacy_synthetic: true,
      });
    }

    const [[delivery]] = await pool.query(
      `SELECT * FROM deliveries WHERE order_id = ? LIMIT 1`,
      [orderId],
    );

    if (delivery?.signed_receipt) {
      delivery.signed_receipt = signUploadPath(delivery.signed_receipt);
    }

    // Resolved through the lifecycle service instead of a raw
    // blueprint_id-only query. Canonical blueprint id always comes from
    // order.blueprint_id (never contract.blueprint_id) — note this is a
    // deliberate behavior change from before: if a contract's blueprint_id
    // ever diverges from its order's own blueprint_id (e.g. a mismatched
    // manual entry), the order's own linkage now always wins. `pool` can be
    // passed directly here since this is a pure read with no locking.
    const lifecycle = await resolveLifecycleByOrder(pool, { orderId });
    const contract = lifecycle.contract || null;
    const latestEstimation = lifecycle.estimation || null;

    const [blueprintTasks] = await pool.query(
      `SELECT
          pt.*,
          assignee.name AS assigned_to_name,
          assigner.name AS assigned_by_name
       FROM project_tasks pt
       LEFT JOIN users assignee ON assignee.id = pt.assigned_to
       LEFT JOIN users assigner ON assigner.id = pt.assigned_by
       WHERE pt.order_id = ?
       ORDER BY pt.created_at DESC, pt.id DESC`,
      [orderId],
    );

    // Financial totals use ONLY real, persisted payment_transactions rows
    // — never the display-only `payments` array, which may still contain
    // the synthetic initial_* row. order.payment_status is never treated
    // as proof of a verified amount here.
    const verifiedPaymentTotal = paymentTransactions
      .filter((payment) => normalize(payment.status) === "verified")
      .reduce((sum, payment) => sum + Number(payment.amount || 0), 0);

    const totalAmount = Number(order.total_amount || order.total || 0);
    const paymentBalance = Math.max(0, totalAmount - verifiedPaymentTotal);

    // Pending/rejected checks intentionally still read the DISPLAY array
    // (payments, including the synthetic row) — this only affects the
    // informational paymentStatusDisplay label below, never a financial
    // total, and preserves the existing legacy behavior of showing a
    // legacy pending proof as pending.
    const hasPendingPayment = payments.some(
      (payment) => normalize(payment.status) === "pending",
    );
    const hasRejectedPayment = payments.some(
      (payment) => normalize(payment.status) === "rejected",
    );

    // Legacy order.payment_status is only trusted for cash/COD/COP orders
    // (where "paid" is set at pickup/delivery time, not via an uploaded
    // proof). For every other payment method, "paid"/"partial" must be
    // earned by real, persisted, verified payment_transactions rows —
    // never inherited from a raw order.payment_status value that could
    // reflect nothing more than a synthetic legacy proof.
    const legacyCashMarkedPaid =
      ["cash", "cod", "cop"].includes(normalize(order.payment_method)) &&
      normalize(order.payment_status) === "paid";

    let paymentStatusDisplay = "unpaid";

    if (legacyCashMarkedPaid) {
      paymentStatusDisplay = "paid";
    } else if (verifiedPaymentTotal >= totalAmount && totalAmount > 0) {
      paymentStatusDisplay = "paid";
    } else if (verifiedPaymentTotal > 0) {
      paymentStatusDisplay = "partial";
    } else if (hasPendingPayment) {
      paymentStatusDisplay = "pending";
    } else if (hasRejectedPayment) {
      paymentStatusDisplay = "rejected";
    }

    if (order.payment_proof) {
      order.payment_proof = signUploadPath(order.payment_proof);
    }

    res.json({
      ...order,
      items,
      payments,
      delivery: delivery || null,
      contract: contract || null,
      blueprint_tasks: blueprintTasks,
      payment_verified_total: verifiedPaymentTotal,
      payment_balance: paymentBalance,
      payment_status_display: paymentStatusDisplay,
      custom_request_items: customRequestItems,
      has_custom_request_data: customRequestItems.length > 0,
      latest_estimation: latestEstimation,
      lifecycle_integrity_warning: lifecycle.integrity_warning,
      lifecycle_integrity_reason: lifecycle.reason,
      can_create_replacement_estimation:
        lifecycle.can_create_replacement_estimation,
      recovery_block_reason: lifecycle.recovery_block_reason,
      conflicting_order_ids: lifecycle.conflicting_order_ids,
    });
  } catch (err) {
    console.error("[orderController.getOne]", err);
    res.status(500).json({ message: "Failed to load order details." });
  }
};

// Restores product/product_variation stock for a standard (non-blueprint)
// order's items. Called only when an order transitions into "cancelled",
// and only after the status change itself has already been confirmed to
// have happened (see call sites in updateStatus/decline). Blueprint/custom
// orders never deduct stock at creation, so they are skipped here.
async function restoreStandardOrderStock(conn, orderId) {
  const [[order]] = await conn.query(
    `SELECT order_type FROM orders WHERE id = ? LIMIT 1`,
    [orderId],
  );

  if (!order || normalize(order.order_type) === "blueprint") return;

  const [items] = await conn.query(
    `SELECT product_id, variation_id, quantity
     FROM order_items
     WHERE order_id = ?`,
    [orderId],
  );

  for (const item of items) {
    if (item.variation_id) {
      await conn.query(
        `UPDATE product_variations
         SET stock = stock + ?
         WHERE id = ?`,
        [item.quantity, item.variation_id],
      );
    } else {
      await conn.query(
        `UPDATE products
         SET stock = stock + ?
         WHERE id = ?`,
        [item.quantity, item.product_id],
      );
    }

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
}

exports.updateStatus = async (req, res) => {
  const conn = await pool.getConnection();

  try {
    const nextStatus = normalize(req.body?.status);
    const valid = [
      "pending",
      "confirmed",
      "contract_released",
      "production",
      "shipping",
      "delivered",
      "completed",
      "cancelled",
    ];

    if (!valid.includes(nextStatus)) {
      return res.status(400).json({ message: "Invalid status." });
    }

    await conn.beginTransaction();

    const [[order]] = await conn.query(
      `SELECT
          o.*,
          o.type AS channel,
          o.total AS total_amount,
          c.id AS contract_id,
          c.blueprint_id AS contract_blueprint_id
       FROM orders o
       LEFT JOIN contracts c ON c.order_id = o.id
       WHERE o.id = ?
       LIMIT 1`,
      [parseInt(req.params.id)],
    );

    if (!order) {
      await conn.rollback();
      return res.status(404).json({ message: "Order not found." });
    }

    const currentStatus = normalize(order.status);
    const currentChannel = normalize(order.channel || order.type);
    const normalizedPaymentMethod = normalize(order.payment_method);
    const isWalkInOrder =
      currentChannel === "walkin" || currentChannel === "walk-in";

    const blueprintId =
      order.contract_blueprint_id || order.blueprint_id || null;
    const isBlueprintOrder =
      normalize(order.order_type) === "blueprint" || Boolean(blueprintId);

    const hasDeliveryRequirement = Boolean(
      String(order.delivery_address || "").trim(),
    );

    const isStandardOrder = !isBlueprintOrder;

    const isStandardPickupOrder =
      isStandardOrder && normalizedPaymentMethod === "cop";

    const isStandardDeliveryOrder = isStandardOrder && !isStandardPickupOrder;

    const effectiveStatusTransitions = isBlueprintOrder
      ? isWalkInOrder
        ? {
            pending: ["confirmed", "cancelled"],
            confirmed: ["contract_released", "cancelled"],
            contract_released: ["production", "cancelled"],
            production: ["completed", "cancelled"],
            shipping: ["completed"],
            delivered: ["completed"],
            completed: [],
            cancelled: [],
          }
        : {
            pending: ["confirmed", "cancelled"],
            confirmed: ["contract_released", "cancelled"],
            contract_released: ["production", "cancelled"],
            production: ["shipping", "cancelled"],
            shipping: ["delivered", "completed"],
            delivered: ["completed"],
            completed: [],
            cancelled: [],
          }
      : isWalkInOrder
        ? hasDeliveryRequirement
          ? {
              pending: ["confirmed", "cancelled"],
              confirmed: ["shipping", "cancelled"],
              contract_released: ["production", "cancelled"],
              production: ["shipping", "cancelled"],
              shipping: ["delivered", "cancelled"],
              delivered: ["completed"],
              completed: [],
              cancelled: [],
            }
          : {
              pending: ["confirmed", "cancelled"],
              confirmed: ["completed", "cancelled"],
              contract_released: ["production", "cancelled"],
              production: ["completed", "cancelled"],
              shipping: ["completed"],
              delivered: ["completed"],
              completed: [],
              cancelled: [],
            }
        : isStandardPickupOrder
          ? {
              pending: ["confirmed", "cancelled"],
              confirmed: ["completed", "cancelled"],
              contract_released: ["production", "cancelled"],
              production: ["completed", "cancelled"],
              shipping: ["completed"],
              delivered: ["completed"],
              completed: [],
              cancelled: [],
            }
          : {
              pending: ["confirmed", "cancelled"],
              confirmed: ["shipping", "cancelled"],
              contract_released: ["production", "cancelled"],
              production: ["shipping", "cancelled"],
              shipping: ["delivered", "completed"],
              delivered: ["completed"],
              completed: [],
              cancelled: [],
            };

    const allowedNextStatuses = effectiveStatusTransitions[currentStatus] || [];

    if (!allowedNextStatuses.includes(nextStatus)) {
      await conn.rollback();
      return res.status(400).json({
        message: `Invalid status transition from "${currentStatus}" to "${nextStatus}".`,
      });
    }

    const totalAmount = Number(order.total_amount || order.total || 0);

    const [[paymentSummary]] = await conn.query(
      `SELECT
         COALESCE(
           SUM(CASE WHEN LOWER(status) = 'verified' THEN amount ELSE 0 END),
           0
         ) AS verified_total
       FROM payment_transactions
       WHERE order_id = ?`,
      [parseInt(req.params.id)],
    );

    const verifiedPaymentTotal = Number(paymentSummary?.verified_total || 0);
    const paymentBalance = Math.max(0, totalAmount - verifiedPaymentTotal);

    const requiredBlueprintDownPayment = Number((totalAmount * 0.3).toFixed(2));

    // orders.payment_status is not trusted here — it can be stale or
    // inconsistent (that inconsistency is part of the original bug class
    // this whole fix addresses). Verified payment_transactions rows are
    // the only source of truth for whether the required down payment has
    // actually been received.
    const hasRequiredBlueprintDownPayment =
      verifiedPaymentTotal >= Math.max(0, requiredBlueprintDownPayment - 0.01);

    const isFullyPaid =
      totalAmount > 0 && verifiedPaymentTotal >= totalAmount - 0.01;

    // Resolved through the lifecycle service instead of a raw
    // blueprint_id-only query. Always uses order.blueprint_id as the
    // canonical source internally (not the pre-computed `blueprintId`
    // above, which can also pull from contract.blueprint_id) — matches the
    // same canonical-source rule used everywhere else in this fix.
    const lifecycle = isBlueprintOrder
      ? await resolveLifecycleByOrder(conn, { orderId: parseInt(req.params.id) })
      : null;

    const lifecycleGatedStatuses = [
      "contract_released",
      "production",
      "shipping",
      "delivered",
      "completed",
    ];

    // ── Comprehensive blueprint lifecycle gate ──────────────────────────
    // Re-checked fresh on EVERY advancing transition, never assuming an
    // earlier stage already verified this — a historically corrupted
    // order may already be sitting in an advanced status (contract_
    // released, production, even completed) with a broken lifecycle
    // underneath it, so every transition attempt re-validates everything
    // from scratch rather than trusting the state machine alone.
    if (isBlueprintOrder && lifecycleGatedStatuses.includes(nextStatus)) {
      const failures = [];

      if (!lifecycle || lifecycle.status !== "OK") {
        failures.push(
          lifecycle?.message ||
            "This blueprint order's lifecycle is blocked, unresolved, or missing required records.",
        );
      }

      const bp = lifecycle?.blueprint || null;
      const est = lifecycle?.estimation || null;

      if (!bp) {
        failures.push("Blueprint order must be linked to a real blueprint.");
      }

      if (!est) {
        failures.push(
          "Blueprint order needs a saved, lifecycle-valid estimation.",
        );
      } else {
        if (normalize(est.status) !== "approved") {
          failures.push("Blueprint order must have an approved estimation.");
        }
        if (!(Number(est.grand_total || 0) > 0)) {
          failures.push(
            "The approved estimation total must be greater than zero.",
          );
        }
        if (!(totalAmount > 0)) {
          failures.push(
            "Blueprint order total must be finalized before this transition.",
          );
        }
        if (Math.abs(totalAmount - Number(est.grand_total || 0)) > 0.01) {
          failures.push(
            "Order total does not match the approved estimation total. Refresh and re-save the estimation before continuing.",
          );
        }
      }

      if (!order.contract_id) {
        failures.push("A contract must exist for this order.");
      }

      if (nextStatus === "completed") {
        if (!isFullyPaid) {
          failures.push(
            "Order cannot be completed until the remaining balance is fully paid.",
          );
        }
      } else if (!hasRequiredBlueprintDownPayment) {
        failures.push(
          "Blueprint orders require at least a 30% verified down payment.",
        );
      }

      if (failures.length) {
        await conn.rollback();
        return res.status(400).json({
          message: failures[0],
          failures,
          integrity_reason: lifecycle?.reason || null,
          conflicting_order_ids: lifecycle?.conflicting_order_ids || null,
        });
      }
    }

    if (isBlueprintOrder && nextStatus === "production") {
      if (currentStatus !== "contract_released") {
        await conn.rollback();
        return res.status(400).json({
          message:
            "Blueprint/custom orders cannot go straight to production. Release the contract first.",
        });
      }
    }

    if (
      isBlueprintOrder &&
      ["shipping", "delivered", "completed"].includes(nextStatus)
    ) {
      const [taskRows] = await conn.query(
        `SELECT task_role, status
        FROM project_tasks
        WHERE order_id = ?`,
        [parseInt(req.params.id)],
      );

      const existingRoleSet = new Set(
        taskRows.map((row) => normalizeTaskRole(row.task_role)).filter(Boolean),
      );

      const completedRoleSet = new Set(
        taskRows
          .filter((row) => normalize(row.status) === "completed")
          .map((row) => normalizeTaskRole(row.task_role))
          .filter(Boolean),
      );

      const missingRoles = REQUIRED_BLUEPRINT_TASK_ROLES.filter(
        (role) => !existingRoleSet.has(role),
      );

      const incompleteRoles = REQUIRED_BLUEPRINT_TASK_ROLES.filter(
        (role) => !completedRoleSet.has(role),
      );

      if (missingRoles.length) {
        await conn.rollback();
        return res.status(400).json({
          message: `Complete the required production task packet first: ${missingRoles
            .map(getTaskRoleLabel)
            .join(", ")}.`,
        });
      }

      if (incompleteRoles.length) {
        await conn.rollback();
        return res.status(400).json({
          message: `Finish all required production tasks before moving to ${nextStatus}: ${incompleteRoles
            .map(getTaskRoleLabel)
            .join(", ")}.`,
        });
      }
    }

    if (
      !isWalkInOrder &&
      !isBlueprintOrder &&
      normalizedPaymentMethod !== "cod" &&
      ["shipping", "delivered"].includes(nextStatus) &&
      paymentBalance > 0
    ) {
      await conn.rollback();
      return res.status(400).json({
        message:
          "Standard non-COD delivery orders must be fully paid before shipping or delivered.",
      });
    }

    // Standard/walk-in orders keep their original, unconditional
    // full-payment-before-completed rule — untouched by the blueprint-
    // specific gate above, which only runs for isBlueprintOrder.
    if (!isBlueprintOrder && nextStatus === "completed" && paymentBalance > 0) {
      await conn.rollback();
      return res.status(400).json({
        message:
          "Order cannot be completed until the remaining balance is fully paid.",
      });
    }

    const [statusUpdateResult] = await conn.query(
      `UPDATE orders
       SET status = ?
       WHERE id = ? AND status = ?`,
      [nextStatus, parseInt(req.params.id), currentStatus],
    );

    // Guard against a race condition where another request already
    // changed this order's status between the SELECT above and this
    // UPDATE (e.g. double-click, or two staff acting on it at once).
    if (statusUpdateResult.affectedRows === 0) {
      await conn.rollback();
      return res.status(409).json({
        message:
          "This order's status was already changed. Please refresh and try again.",
      });
    }

    // Standard (non-blueprint) orders deduct stock at creation time —
    // restore it here now that the cancellation is confirmed.
    if (nextStatus === "cancelled") {
      await restoreStandardOrderStock(conn, parseInt(req.params.id));
    }

    // 👉 NEW: Automatically sync the Rider's delivery status
    if (nextStatus === "completed" || nextStatus === "cancelled") {
      await conn.query(
        `UPDATE deliveries
         SET status = ?
         WHERE order_id = ?`,
        [nextStatus, parseInt(req.params.id)],
      );
    }

    await conn.commit();

    req.auditRecord = {
      id: parseInt(req.params.id),
      old: { status: currentStatus },
      new: { status: nextStatus },
    };
    res.json({
      message: `Order status updated to "${nextStatus}".`,
    });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ message: err.message });
  } finally {
    conn.release();
  }
};

exports.accept = async (req, res) => {
  try {
    await pool.query(
      "UPDATE orders SET status = 'confirmed' WHERE id = ? AND status = 'pending'",
      [parseInt(req.params.id)],
    );
    res.json({ message: "Order accepted." });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.decline = async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const { reason } = req.body;
    const orderId = parseInt(req.params.id);

    const [declineResult] = await conn.query(
      "UPDATE orders SET status = 'cancelled', cancellation_reason = ?, cancelled_at = NOW() WHERE id = ? AND status = 'pending'",
      [reason || "", orderId],
    );

    // Only restore stock if this call actually changed the row (guards
    // against double-click / already-declined orders).
    if (declineResult.affectedRows > 0) {
      await restoreStandardOrderStock(conn, orderId);
    }

    await conn.commit();
    res.json({ message: "Order declined." });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ message: err.message });
  } finally {
    conn.release();
  }
};

exports.verifyPayment = async (req, res) => {
  // Strict, local (function-scoped) positive-integer validator — kept
  // inline rather than as a new top-level helper so this entire change
  // stays contained within verifyPayment's own body.
  const isStrictPositiveIntString = (value) => {
    const text = String(value ?? "").trim();
    if (!/^[1-9][0-9]*$/.test(text)) return false;
    const parsed = Number(text);
    return Number.isSafeInteger(parsed) && parsed > 0;
  };

  const orderId = isStrictPositiveIntString(req.params.id)
    ? Number(req.params.id)
    : null;

  if (!orderId) {
    return res.status(400).json({ message: "Invalid order id." });
  }

  const { payment_id, action } = req.body;
  const normalizedAction = normalize(action);

  if (!["verified", "rejected"].includes(normalizedAction)) {
    return res.status(400).json({ message: "Invalid payment action." });
  }

  // payment_id must be exactly one of two structurally valid forms: a
  // strict positive-integer string (a real payment_transactions id), or
  // exactly "initial_<orderId>" matching the already-validated route
  // order id (the legacy synthetic display row). Anything else — a
  // decimal, scientific notation, a mismatched embedded id, trailing
  // garbage like "initial_35_extra" — is rejected outright.
  const paymentIdStr = String(payment_id ?? "").trim();
  const isSyntheticConversion = paymentIdStr === `initial_${orderId}`;
  const realPaymentId = isStrictPositiveIntString(paymentIdStr)
    ? Number(paymentIdStr)
    : null;

  if (!isSyntheticConversion && realPaymentId === null) {
    return res.status(400).json({ message: "Invalid payment id." });
  }

  let conn = null;
  let transactionActive = false;
  let connectionReusable = true;

  try {
    conn = await pool.getConnection();
    await conn.beginTransaction();
    transactionActive = true;

    // ── Lock the canonical order FIRST — before lifecycle resolution,
    // before payment-transaction locking, before any write. Matches the
    // project-wide order-first lock discipline.
    const [[order]] = await conn.query(
      `SELECT
          id,
          order_type,
          status,
          total,
          blueprint_id,
          payment_method,
          payment_proof
       FROM orders
       WHERE id = ?
       LIMIT 1
       FOR UPDATE`,
      [orderId],
    );

    if (!order) {
      await conn.rollback();
      transactionActive = false;
      return res.status(404).json({ message: "Order not found." });
    }

    const isBlueprintOrder = normalize(order.order_type) === "blueprint";

    // ── Blueprint verification lifecycle gate — action=verified only.
    // Rejection stays exempt from every check in this block, so an
    // unsafe pending proof can always be closed out without advancing
    // financial state, regardless of order status or lifecycle health.
    let lifecycle = null;
    let approvedMaximumTotal = Number(order.total || 0);

    if (normalizedAction === "verified" && isBlueprintOrder) {
      lifecycle = await resolveLifecycleByOrder(conn, {
        orderId,
        lockOrder: true,
        lockBlueprint: true,
      });

      const est = lifecycle.estimation;
      const bp = lifecycle.blueprint;
      const ord = lifecycle.order;

      const canonicalMatchesLocked =
        Boolean(ord) && Number(ord.id) === Number(order.id);

      const currentOrderStatus = normalize(order.status);
      const ALLOWED_VERIFY_STATUSES = [
        "confirmed",
        "contract_released",
        "production",
        "shipping",
        "delivered",
      ];
      const statusAllowed = ALLOWED_VERIFY_STATUSES.includes(
        currentOrderStatus,
      );

      const blueprintArchived =
        Number(bp?.is_deleted) === 1 || normalize(bp?.stage) === "archived";

      const estimationApproved = normalize(est?.status) === "approved";
      const estimationTotalPositive =
        Number.isFinite(Number(est?.grand_total)) &&
        Number(est?.grand_total) > 0;
      const orderTotalPositive =
        Number.isFinite(Number(order.total)) && Number(order.total) > 0;
      const totalsMatch =
        !!est &&
        Math.abs(Number(order.total || 0) - Number(est.grand_total || 0)) <=
          0.01;

      const hasContract = Boolean(lifecycle.contract);

      // A confirmed order must NOT already have a contract; every later
      // stage must already have a real one. Never auto-repaired or
      // relinked here — a mismatch simply blocks verification.
      const contractConsistent =
        currentOrderStatus === "confirmed" ? !hasContract : hasContract;

      const lifecycleUnsafe =
        lifecycle.status !== "OK" ||
        !ord ||
        !bp ||
        !est ||
        !canonicalMatchesLocked ||
        blueprintArchived ||
        !estimationApproved ||
        !estimationTotalPositive ||
        !orderTotalPositive ||
        !totalsMatch ||
        !statusAllowed ||
        !contractConsistent;

      if (lifecycleUnsafe) {
        await conn.rollback();
        transactionActive = false;
        return res.status(409).json({
          message:
            lifecycle.message ||
            "This order's blueprint lifecycle or status is not in a verifiable state, so this payment cannot be verified until it is manually reviewed.",
          integrity_reason: lifecycle.reason,
          conflicting_order_ids: lifecycle.conflicting_order_ids,
        });
      }

      approvedMaximumTotal = Number(est.grand_total || 0);
    }

    // ── Lock the COMPLETE real payment_transactions set for this order
    // — never just the single target row. This is what lets two admins
    // reviewing two different pending transactions on the same order
    // serialize correctly instead of each computing a stale rollup.
    const [paymentSet] = await conn.query(
      `SELECT
          id,
          order_id,
          status,
          amount,
          payment_method,
          proof_url
       FROM payment_transactions
       WHERE order_id = ?
       ORDER BY id
       FOR UPDATE`,
      [orderId],
    );

    let targetAmount = null;
    let realTargetId = null;

    if (isSyntheticConversion) {
      // Legacy initial_<orderId> conversion — allowed only when every
      // structural condition holds, regardless of verify vs reject.
      if (!order.payment_proof) {
        await conn.rollback();
        transactionActive = false;
        return res
          .status(400)
          .json({ message: "No legacy payment proof exists for this order." });
      }

      const legacyMethodValid = [
        "cash",
        "gcash",
        "bank_transfer",
        "cod",
        "cop",
        "paymongo",
      ].includes(normalize(order.payment_method));

      if (!legacyMethodValid) {
        await conn.rollback();
        transactionActive = false;
        return res.status(400).json({
          message: "Order payment method is invalid for a legacy conversion.",
        });
      }

      // The zero-real-transactions requirement preserves the exact
      // getOne behavior that only ever creates the synthetic row when no
      // real transaction exists — if one now exists, the synthetic row
      // is stale and must never be converted into a second, duplicate
      // legacy transaction.
      if (paymentSet.length > 0) {
        await conn.rollback();
        transactionActive = false;
        return res.status(409).json({
          message:
            "A real payment transaction already exists for this order; the legacy proof can no longer be converted directly.",
          integrity_reason: "PAYMENT_STATE_CHANGED",
        });
      }

      // Server-derived synthetic amount — always the locked order total,
      // never a client-supplied value — still subject to every
      // verification-time amount/overpayment gate below.
      targetAmount = Number(order.total || 0);
    } else {
      const target = paymentSet.find(
        (row) => Number(row.id) === Number(realPaymentId),
      );

      if (!target) {
        await conn.rollback();
        transactionActive = false;
        return res.status(404).json({ message: "Payment record not found." });
      }

      if (normalize(target.status) !== "pending") {
        await conn.rollback();
        transactionActive = false;
        return res.status(409).json({
          message:
            "This payment was already reviewed. Please refresh and try again.",
          integrity_reason: "PAYMENT_STATE_CHANGED",
        });
      }

      targetAmount = Number(target.amount || 0);
      realTargetId = target.id;
    }

    // ── Verify-time overpayment gate — action=verified only. Never
    // trusts orders.payment_status, the synthetic display row, or any
    // client-supplied total/balance — only the locked, real, persisted
    // transaction set computed just above.
    if (normalizedAction === "verified") {
      if (!(targetAmount > 0)) {
        await conn.rollback();
        transactionActive = false;
        return res.status(400).json({ message: "Payment amount is invalid." });
      }

      if (!(approvedMaximumTotal > 0)) {
        await conn.rollback();
        transactionActive = false;
        return res.status(400).json({
          message: "Order total is invalid; this payment cannot be verified.",
        });
      }

      const verifiedTotalBefore = paymentSet
        .filter((row) => normalize(row.status) === "verified")
        .reduce((sum, row) => sum + Number(row.amount || 0), 0);

      if (verifiedTotalBefore + targetAmount > approvedMaximumTotal + 0.01) {
        await conn.rollback();
        transactionActive = false;
        return res.status(409).json({
          message: "Verifying this payment would exceed the order total.",
          integrity_reason: "PAYMENT_OVERPAYMENT",
        });
      }
    }

    // ── Guarded write ────────────────────────────────────────────────
    if (isSyntheticConversion) {
      // Insert exactly one real transaction, using only canonical locked
      // order values — never client-controlled amount, method, proof
      // URL, or order id.
      await conn.query(
        `INSERT INTO payment_transactions
          (order_id, amount, payment_method, proof_url, verified_by, verified_at, status, notes)
         VALUES (?, ?, ?, ?, ?, NOW(), ?, ?)`,
        [
          order.id,
          targetAmount,
          order.payment_method,
          order.payment_proof,
          req.user.id,
          normalizedAction,
          `Initial order payment ${normalizedAction}.`,
        ],
      );
    } else {
      const [updateResult] = await conn.query(
        `UPDATE payment_transactions
         SET status = ?, verified_by = ?, verified_at = NOW()
         WHERE id = ? AND order_id = ? AND status = 'pending'`,
        [normalizedAction, req.user.id, realTargetId, order.id],
      );

      if (updateResult.affectedRows === 0) {
        await conn.rollback();
        transactionActive = false;
        return res.status(409).json({
          message:
            "This payment was already reviewed. Please refresh and try again.",
          integrity_reason: "PAYMENT_STATE_CHANGED",
        });
      }
    }

    // ── Recompute order payment status from real, persisted rows only —
    // a fresh query, never the pre-write locked set, so it reflects the
    // write that just happened.
    const [[freshSummary]] = await conn.query(
      `SELECT
         COALESCE(SUM(CASE WHEN LOWER(status) = 'verified' THEN amount ELSE 0 END), 0) AS verified_total,
         MAX(CASE WHEN LOWER(status) = 'pending' THEN 1 ELSE 0 END) AS has_pending,
         MAX(CASE WHEN LOWER(status) = 'rejected' THEN 1 ELSE 0 END) AS has_rejected
       FROM payment_transactions
       WHERE order_id = ?`,
      [order.id],
    );

    const totalAmount = Number(order.total || 0);
    const verifiedTotal = Number(freshSummary?.verified_total || 0);

    let nextPaymentStatus = "unpaid";

    if (verifiedTotal >= totalAmount && totalAmount > 0) {
      nextPaymentStatus = "paid";
    } else if (verifiedTotal > 0) {
      nextPaymentStatus = "partial";
    } else if (Number(freshSummary?.has_pending)) {
      nextPaymentStatus = "pending";
    } else if (Number(freshSummary?.has_rejected)) {
      nextPaymentStatus = "rejected";
    }

    await conn.query(
      `UPDATE orders
       SET payment_status = ?
       WHERE id = ?`,
      [nextPaymentStatus, order.id],
    );

    await conn.commit();
    transactionActive = false;

    req.auditRecord = {
      id: order.id,
      new: {
        payment_id,
        action: normalizedAction,
        payment_status: nextPaymentStatus,
      },
    };

    return res.json({
      message: `Payment ${normalizedAction}.`,
      payment_status: nextPaymentStatus,
    });
  } catch (err) {
    if (conn && transactionActive) {
      try {
        await conn.rollback();
        transactionActive = false;
      } catch (rollbackErr) {
        console.error(
          "[orderController.verifyPayment] rollback failed:",
          rollbackErr.message || rollbackErr,
        );
        connectionReusable = false;
      }
    }
    console.error("[orderController.verifyPayment]", err);
    return res.status(500).json({ message: "Failed to review payment." });
  } finally {
    if (conn) {
      if (connectionReusable) {
        conn.release();
      } else {
        conn.destroy();
      }
    }
  }
};

exports.uploadDeliveryReceipt = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded." });
    }

    const orderId = parseInt(req.params.id);
    const url = `/uploads/deliveries/${req.file.filename}`;

    const [result] = await pool.query(
      `UPDATE deliveries
       SET signed_receipt = ?,
           status = 'delivered',
           delivered_date = COALESCE(delivered_date, NOW())
       WHERE order_id = ?`,
      [url, orderId],
    );

    if (!result.affectedRows) {
      return res.status(404).json({
        message: "No delivery record found for this order.",
      });
    }

    await pool.query(
      `UPDATE orders
       SET status = CASE
         WHEN status IN ('shipping', 'production') THEN 'delivered'
         ELSE status
       END
       WHERE id = ? AND status NOT IN ('completed', 'cancelled')`,
      [orderId],
    );

    res.json({
      message: "Signed delivery receipt uploaded successfully.",
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getCancellations = async (req, res) => {
  try {
    // ── FIXED: Added empty array [] ──
    const [rows] = await pool.query(
      `SELECT c.*, o.total AS total_amount, o.type AS channel,
              COALESCE(u.name, o.walkin_customer_name) AS requested_by_name,
              a.name AS approved_by_name
       FROM cancellations c
       JOIN orders o ON o.id = c.order_id
       LEFT JOIN users u ON u.id = c.requested_by
       LEFT JOIN users a ON a.id = c.approved_by
       ORDER BY c.created_at DESC`,
      [],
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.processCancellation = async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const orderId = parseInt(req.params.id, 10);
    if (!Number.isInteger(orderId) || orderId <= 0) {
      await conn.rollback();
      return res.status(400).json({ message: "Invalid order id." });
    }

    const { approved, refund_amount, policy_applied } = req.body;

    if (typeof approved !== "boolean") {
      await conn.rollback();
      return res.status(400).json({ message: "Invalid cancellation decision." });
    }

    // Lock the cancellation row for the duration of this transaction so a
    // concurrent duplicate request must wait, then see the already-updated
    // decision_status and be rejected as already-processed.
    const [[cancellation]] = await conn.query(
      `SELECT id, order_id, decision_status
         FROM cancellations
        WHERE order_id = ?
        FOR UPDATE`,
      [orderId],
    );
    if (!cancellation) {
      await conn.rollback();
      return res
        .status(404)
        .json({ message: "Cancellation request not found for this order." });
    }
    if (cancellation.decision_status !== "pending") {
      await conn.rollback();
      return res
        .status(409)
        .json({ message: "This cancellation request has already been processed." });
    }

    const [[order]] = await conn.query(
      `SELECT id, status, refund_status FROM orders WHERE id = ? FOR UPDATE`,
      [orderId],
    );
    if (!order) {
      await conn.rollback();
      return res.status(404).json({ message: "Order not found." });
    }

    const ALLOWED_POLICIES = [
      "full_refund",
      "processing_fee",
      "non_refundable",
      "voided",
    ];
    let normalizedPolicy = null;
    let normalizedRefund = 0;

    if (approved) {
      if (!ALLOWED_POLICIES.includes(policy_applied)) {
        await conn.rollback();
        return res.status(400).json({ message: "Invalid cancellation policy." });
      }
      const numericRefund = Number(refund_amount);
      if (!Number.isFinite(numericRefund) || numericRefund < 0) {
        await conn.rollback();
        return res
          .status(400)
          .json({ message: "Refund amount must be zero or greater." });
      }
      normalizedPolicy = policy_applied;
      normalizedRefund = numericRefund;
    }

    const nextDecision = approved === true ? "approved" : "rejected";

    await conn.query(
      `UPDATE cancellations
          SET decision_status = ?,
              approved_by = ?,
              approved_at = NOW(),
              refund_amount = ?,
              policy_applied = ?
        WHERE id = ?`,
      [nextDecision, req.user.id, normalizedRefund, normalizedPolicy, cancellation.id],
    );

    if (approved) {
      await conn.query(
        `UPDATE orders
            SET status = 'cancelled',
                refund_amount = ?,
                refund_status = 'pending',
                cancelled_at = NOW()
          WHERE id = ?`,
        [normalizedRefund, orderId],
      );
    }
    // Rejected: intentionally no change to orders — Option A keeps the
    // customer's cancellation final; only the refund decision is denied.
    // Stock is never touched here — it was already restored by the
    // customer's original cancellation request.

    // Re-read the actual final order state before commit — never assume
    // what changed; compare it against the locked "before" snapshot.
    const [[finalOrder]] = await conn.query(
      `SELECT status, refund_status FROM orders WHERE id = ?`,
      [orderId],
    );

    await conn.commit();

    const orderStatusChanged =
      String(order.status || "") !== String(finalOrder.status || "");
    const refundStatusChanged =
      String(order.refund_status || "") !== String(finalOrder.refund_status || "");

    req.auditRecord = {
      id: cancellation.id,
      old: {
        cancellation_id: cancellation.id,
        decision_status: "pending",
        order_status: order.status,
      },
      new: {
        cancellation_id: cancellation.id,
        order_id: orderId,
        decision_status: nextDecision,
        order_status: finalOrder.status,
        refund_status_changed: refundStatusChanged,
        order_status_changed: orderStatusChanged,
        stock_changed_during_processing: false,
        first_time_decision: true,
      },
    };

    res.json({
      message: approved ? "Refund approved." : "Refund rejected.",
    });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ message: err.message });
  } finally {
    conn.release();
  }
};

exports.getAssignableStaff = async (req, res) => {
  try {
    const orderId = parseInt(req.params.id);

    const [[order]] = await pool.query(
      `SELECT o.id, o.order_number, o.status, o.blueprint_id, c.blueprint_id AS contract_blueprint_id
       FROM orders o
       LEFT JOIN contracts c ON c.order_id = o.id
       WHERE o.id = ?`,
      [orderId],
    );

    if (!order) {
      return res.status(404).json({ message: "Order not found." });
    }

    const blueprintId =
      order.contract_blueprint_id || order.blueprint_id || null;

    if (!blueprintId) {
      return res.status(400).json({
        message: "This order is not linked to a blueprint.",
      });
    }

    // ── FIXED: Added empty array [] ──
    const [staff] = await pool.query(
      `SELECT
          u.id,
          u.name,
          u.role,
          u.phone,
          (
            SELECT COUNT(DISTINCT COALESCE(pt.order_id, pt.blueprint_id, pt.id))
            FROM project_tasks pt
            WHERE pt.assigned_to = u.id
              AND pt.status IN ('pending', 'in_progress')
          ) AS active_task_count
       FROM users u
       WHERE u.role = 'staff'
        AND u.staff_type = 'indoor'
        AND u.is_active = 1
       ORDER BY active_task_count ASC, u.name ASC`,
      [],
    );

    res.json({
      blueprint_id: blueprintId,
      staff,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.assignStaff = async (req, res) => {
  const conn = await pool.getConnection();

  try {
    const orderId = parseInt(req.params.id);
    const { staff_id, due_date, note } = req.body;

    if (!staff_id || !due_date) {
      return res.status(400).json({
        message: "Assigned indoor staff and due date are required.",
      });
    }

    const parsedDueDate = new Date(due_date);
    if (Number.isNaN(parsedDueDate.getTime())) {
      return res.status(400).json({
        message: "Due date is invalid.",
      });
    }

    const [[order]] = await conn.query(
      `SELECT o.*, c.blueprint_id AS contract_blueprint_id
       FROM orders o
       LEFT JOIN contracts c ON c.order_id = o.id
       WHERE o.id = ?`,
      [orderId],
    );

    if (!order) {
      return res.status(404).json({ message: "Order not found." });
    }

    const blueprintId =
      order.contract_blueprint_id || order.blueprint_id || null;

    if (!blueprintId) {
      return res.status(400).json({
        message: "This order is not linked to a blueprint.",
      });
    }

    if (
      !["contract_released", "production"].includes(normalize(order.status))
    ) {
      return res.status(400).json({
        message:
          "Indoor staff assignment is only allowed after contract release or during production.",
      });
    }

    const [[staff]] = await conn.query(
      `SELECT id, name, role, staff_type, is_active
       FROM users
       WHERE id = ? AND role = 'staff' AND staff_type = 'indoor'`,
      [parseInt(staff_id)],
    );

    if (!staff || !staff.is_active) {
      return res.status(400).json({
        message: "Selected indoor staff member is not available.",
      });
    }

    await conn.beginTransaction();

    const placeholders = REQUIRED_BLUEPRINT_TASK_ROLES.map(() => "?").join(
      ", ",
    );

    const [existingPacket] = await conn.query(
      `SELECT id, task_role, status, assigned_to
       FROM project_tasks
       WHERE order_id = ?
         AND LOWER(REPLACE(task_role, ' ', '_')) IN (${placeholders})`,
      [orderId, ...REQUIRED_BLUEPRINT_TASK_ROLES],
    );

    if (existingPacket.length > 0) {
      await conn.rollback();
      return res.status(400).json({
        message:
          "A production packet already exists for this order. Update the existing packet instead of assigning again.",
      });
    }

    const createdTaskIds = [];
    for (const stepLabel of BLUEPRINT_PRODUCTION_TASK_ROLE_OPTIONS) {
      const title = `${order.order_number || `Order #${orderId}`} — ${stepLabel}`;
      const description = note
        ? `Production step: ${stepLabel}\n\nAdmin production note: ${note}`
        : `Production step: ${stepLabel}`;

      const [taskResult] = await conn.query(
        `INSERT INTO project_tasks
          (
            order_id,
            blueprint_id,
            assigned_to,
            assigned_by,
            task_role,
            title,
            description,
            due_date,
            status,
            is_read
          )
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', 0)`,
        [
          orderId,
          blueprintId,
          parseInt(staff_id),
          req.user.id,
          stepLabel,
          title,
          description,
          due_date,
        ],
      );
      createdTaskIds.push(taskResult.insertId);
    }

    await conn.query(
      `INSERT INTO notifications
        (user_id, type, title, message, channel, sent_at)
       VALUES (?, 'assignment', 'New Production Order Assigned', ?, 'system', NOW())`,
      [
        parseInt(staff_id),
        `You have been assigned the full production workflow for ${order.order_number || `Order #${orderId}`}. Complete Cutting Machine, Edge Banding, Horizontal Drilling, Retouching, and Packing.`,
      ],
    );

    const orderStatusChanged =
      normalize(order.status) === "contract_released";

    if (orderStatusChanged) {
      await conn.query(
        `UPDATE orders
         SET status = 'production'
         WHERE id = ?`,
        [orderId],
      );
    }

    await conn.commit();

    req.auditRecord = {
      id: orderId,
      old: orderStatusChanged
        ? { status: normalize(order.status) }
        : null,
      new: {
        assigned_staff_id: parseInt(staff_id),
        task_ids: createdTaskIds,
        task_roles: BLUEPRINT_PRODUCTION_TASK_ROLE_OPTIONS,
        ...(orderStatusChanged ? { status: "production" } : {}),
      },
    };
    res.json({
      message:
        "Indoor staff assigned to the full production workflow successfully.",
      steps_created: BLUEPRINT_PRODUCTION_TASK_ROLE_OPTIONS.length,
    });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ message: err.message });
  } finally {
    conn.release();
  }
};

/**
 * PATCH /orders/:id/reassign-staff
 * Transfers pending production tasks to a new primary indoor staff member.
 * Rejects the whole operation if any task is in_progress or blocked.
 * Completed tasks and their history are never touched. Operates per
 * eligible task row rather than assuming a single existing assignee, so it
 * also correctly resolves a packet whose pending tasks are currently split
 * across more than one assignee.
 */
exports.reassignStaff = async (req, res) => {
  const parseStrictPositiveInt = (value) => {
    if (typeof value === "number") {
      return Number.isSafeInteger(value) && value > 0 ? value : null;
    }
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    if (!/^\d+$/.test(trimmed)) return null;
    const parsed = Number(trimmed);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
  };

  const orderId = parseStrictPositiveInt(req.params.id);
  const newStaffId = parseStrictPositiveInt(req.body?.staff_id);

  if (!orderId) {
    return res.status(400).json({ message: "Invalid order ID." });
  }
  if (!newStaffId) {
    return res
      .status(400)
      .json({ message: "A valid staff member is required." });
  }

  let conn = null;
  let transactionActive = false;

  try {
    conn = await pool.getConnection();
    await conn.beginTransaction();
    transactionActive = true;

    const [[order]] = await conn.query(
      `SELECT id, order_number, status, order_type, blueprint_id
       FROM orders
       WHERE id = ?
       FOR UPDATE`,
      [orderId],
    );

    if (!order) {
      await conn.rollback();
      transactionActive = false;
      return res.status(404).json({ message: "Order not found." });
    }

    if (normalize(order.order_type) !== "blueprint") {
      await conn.rollback();
      transactionActive = false;
      return res.status(400).json({
        message: "This order is not a blueprint production order.",
      });
    }

    if (!order.blueprint_id) {
      await conn.rollback();
      transactionActive = false;
      return res
        .status(400)
        .json({ message: "This order is not linked to a blueprint." });
    }

    if (!["contract_released", "production"].includes(normalize(order.status))) {
      await conn.rollback();
      transactionActive = false;
      return res.status(400).json({
        message:
          "Staff reassignment is only allowed after contract release or during production.",
      });
    }

    const [ownerRows] = await conn.query(
      `SELECT id FROM orders WHERE blueprint_id = ?`,
      [order.blueprint_id],
    );
    if (ownerRows.length > 1) {
      await conn.rollback();
      transactionActive = false;
      return res.status(400).json({
        message:
          "This order's blueprint is referenced by more than one order. Manual review required.",
      });
    }

    const [[blueprint]] = await conn.query(
      `SELECT id, is_deleted FROM blueprints WHERE id = ? FOR UPDATE`,
      [order.blueprint_id],
    );
    if (!blueprint || blueprint.is_deleted) {
      await conn.rollback();
      transactionActive = false;
      return res
        .status(400)
        .json({ message: "This order's linked blueprint no longer exists." });
    }

    const blueprintId = blueprint.id;

    const [[newStaff]] = await conn.query(
      `SELECT id, name, role, staff_type, is_active
       FROM users
       WHERE id = ? AND role = 'staff' AND staff_type = 'indoor'
       FOR UPDATE`,
      [newStaffId],
    );

    if (!newStaff || !newStaff.is_active) {
      await conn.rollback();
      transactionActive = false;
      return res.status(400).json({
        message: "Only active indoor staff can be assigned to project tasks.",
      });
    }

    const [packet] = await conn.query(
      `SELECT id, task_role, status, assigned_to, assigned_by, order_id, blueprint_id
       FROM project_tasks
       WHERE order_id = ?
       ORDER BY id
       FOR UPDATE`,
      [orderId],
    );

    const mismatchedRow = packet.find(
      (row) => row.order_id !== orderId || row.blueprint_id !== blueprintId,
    );
    if (mismatchedRow) {
      await conn.rollback();
      transactionActive = false;
      return res.status(400).json({
        message:
          "This order's production packet references an unexpected order or blueprint.",
      });
    }

    const rolesByKey = new Map();
    for (const row of packet) {
      const key = normalizeTaskRole(row.task_role);
      if (!REQUIRED_BLUEPRINT_TASK_ROLES.includes(key)) continue;
      if (rolesByKey.has(key)) {
        await conn.rollback();
        transactionActive = false;
        return res.status(400).json({
          message:
            "This order's production packet has a duplicate step and cannot be reassigned automatically.",
        });
      }
      rolesByKey.set(key, row);
    }

    const missingRoles = REQUIRED_BLUEPRINT_TASK_ROLES.filter(
      (key) => !rolesByKey.has(key),
    );

    if (packet.length !== 5 || missingRoles.length > 0) {
      await conn.rollback();
      transactionActive = false;
      return res.status(400).json({
        message:
          "This order does not have a complete five-step production packet.",
      });
    }

    const SUPPORTED_TASK_STATUSES = ["pending", "in_progress", "blocked", "completed"];
    const invalidStatusRow = packet.find(
      (row) => !SUPPORTED_TASK_STATUSES.includes(normalize(row.status)),
    );
    if (invalidStatusRow) {
      await conn.rollback();
      transactionActive = false;
      return res.status(400).json({
        message:
          "This order's production packet contains an unsupported task status.",
      });
    }

    const blockingRow = packet.find((row) =>
      ["in_progress", "blocked"].includes(normalize(row.status)),
    );
    if (blockingRow) {
      await conn.rollback();
      transactionActive = false;
      return res.status(400).json({
        message:
          "Active or blocked production steps must be resolved before staff can be reassigned.",
      });
    }

    const allCompleted = packet.every(
      (row) => normalize(row.status) === "completed",
    );
    if (allCompleted) {
      await conn.rollback();
      transactionActive = false;
      return res.status(400).json({
        message:
          "All production steps are already completed. There is nothing to reassign.",
      });
    }

    const eligibleRows = packet.filter(
      (row) =>
        normalize(row.status) === "pending" && row.assigned_to !== newStaffId,
    );

    if (eligibleRows.length === 0) {
      await conn.rollback();
      transactionActive = false;
      return res.status(200).json({
        message:
          "The selected staff member is already assigned to all remaining pending production steps.",
      });
    }

    let totalAffected = 0;
    for (const row of eligibleRows) {
      const [result] = await conn.query(
        `UPDATE project_tasks
         SET assigned_to = ?, assigned_by = ?, accepted_at = NULL, updated_at = NOW()
         WHERE id = ? AND status = 'pending' AND assigned_to = ?`,
        [newStaffId, req.user.id, row.id, row.assigned_to],
      );
      totalAffected += result.affectedRows;
    }

    if (totalAffected !== eligibleRows.length) {
      await conn.rollback();
      transactionActive = false;
      return res.status(409).json({
        message:
          "Production tasks changed before this reassignment was completed. Refresh and try again.",
      });
    }

    const distinctPreviousStaffIds = [
      ...new Set(packet.map((row) => row.assigned_to).filter(Boolean)),
    ];

    let staffNameById = new Map();
    if (distinctPreviousStaffIds.length > 0) {
      const placeholders = distinctPreviousStaffIds.map(() => "?").join(", ");
      const [nameRows] = await conn.query(
        `SELECT id, name FROM users WHERE id IN (${placeholders})`,
        distinctPreviousStaffIds,
      );
      staffNameById = new Map(nameRows.map((row) => [row.id, row.name]));
    }

    await conn.query(
      `INSERT INTO notifications (user_id, type, title, message, channel, sent_at)
       VALUES (?, 'assignment', 'Production Steps Reassigned to You', ?, 'system', NOW())`,
      [
        newStaffId,
        `You have been assigned ${eligibleRows.length} remaining production step(s) for ${order.order_number || `Order #${orderId}`}.`,
      ],
    );

    const lostByStaff = new Map();
    for (const row of eligibleRows) {
      if (!row.assigned_to) continue;
      if (!lostByStaff.has(row.assigned_to)) lostByStaff.set(row.assigned_to, []);
      lostByStaff.get(row.assigned_to).push(row.task_role);
    }

    for (const [oldStaffId, roles] of lostByStaff.entries()) {
      await conn.query(
        `INSERT INTO notifications (user_id, type, title, message, channel, sent_at)
         VALUES (?, 'assignment', 'Reassigned Off Production Steps', ?, 'system', NOW())`,
        [
          oldStaffId,
          `You have been reassigned off ${roles.length} pending production step(s) for ${order.order_number || `Order #${orderId}`}. Your completed work remains on record.`,
        ],
      );
    }

    const previousAssignments = eligibleRows.map((row) => ({
      task_id: row.id,
      task_role: getTaskRoleLabel(row.task_role),
      original_status: row.status,
      previous_staff_id: row.assigned_to,
      previous_staff_name: staffNameById.get(row.assigned_to) || null,
      previous_assigned_by: row.assigned_by,
    }));

    const completedTasksPreserved = packet
      .filter((row) => normalize(row.status) === "completed")
      .map((row) => ({
        task_id: row.id,
        task_role: getTaskRoleLabel(row.task_role),
        status: row.status,
        assigned_staff_id: row.assigned_to,
        assigned_staff_name: staffNameById.get(row.assigned_to) || null,
      }));

    const auditRecord = {
      id: orderId,
      old: {
        blueprint_id: blueprintId,
        previous_assignments: previousAssignments,
      },
      new: {
        blueprint_id: blueprintId,
        new_staff_id: newStaffId,
        new_staff_name: newStaff.name || null,
        new_assigned_by: req.user.id,
        transferred_task_ids: eligibleRows.map((row) => row.id),
        transferred_task_roles: eligibleRows.map((row) =>
          getTaskRoleLabel(row.task_role),
        ),
        transferred_task_original_statuses: eligibleRows.map((row) => row.status),
        completed_tasks_preserved: completedTasksPreserved,
      },
    };

    const responseBody = {
      message: `${eligibleRows.length} production step(s) reassigned successfully.`,
      transferred_task_ids: eligibleRows.map((row) => row.id),
      preserved_completed_task_ids: completedTasksPreserved.map((t) => t.task_id),
    };

    await conn.commit();
    transactionActive = false;

    req.auditRecord = auditRecord;
    return res.json(responseBody);
  } catch (err) {
    if (conn && transactionActive) {
      try {
        await conn.rollback();
      } catch (rollbackErr) {
        console.error(
          "[orders.reassignStaff] rollback failed:",
          rollbackErr.message,
        );
      }
      transactionActive = false;
    }
    return res.status(500).json({ message: "Server error." });
  } finally {
    if (conn) conn.release();
  }
};

// ── Helper: mirrors the production-step sequence rules already enforced in
// controllers/staff/pos.tasks.js (validateProductionSequence), reusing the
// task-role constants/normalizers already defined above in this file. ──
async function validateProductionStepTransition({
  orderId,
  taskRole,
  currentStatus,
  nextStatus,
}) {
  const stepIndex = REQUIRED_BLUEPRINT_TASK_ROLES.indexOf(
    normalizeTaskRole(taskRole),
  );

  if (orderId && stepIndex !== -1) {
    const [packetRows] = await pool.query(
      `SELECT task_role, status FROM project_tasks WHERE order_id = ?`,
      [orderId],
    );

    const packetMap = new Map(
      packetRows.map((row) => [normalizeTaskRole(row.task_role), row]),
    );

    for (let i = 0; i < stepIndex; i += 1) {
      const previousRole = REQUIRED_BLUEPRINT_TASK_ROLES[i];
      const previousStep = packetMap.get(previousRole);

      if (!previousStep || normalize(previousStep.status) !== "completed") {
        return `Complete ${getTaskRoleLabel(previousRole)} first before starting ${getTaskRoleLabel(
          normalizeTaskRole(taskRole),
        )}.`;
      }
    }
  }

  if (
    nextStatus === "in_progress" &&
    !["pending", "blocked"].includes(currentStatus)
  ) {
    return "Only a pending or blocked step can be started.";
  }

  if (nextStatus === "completed" && currentStatus !== "in_progress") {
    return "Only an in-progress step can be marked as completed.";
  }

  if (nextStatus === "blocked" && currentStatus !== "in_progress") {
    return "Only an in-progress step can be marked as blocked.";
  }

  return null;
}

exports.updateTaskStatus = async (req, res) => {
  try {
    const orderId = parseInt(req.params.id);
    const taskId = parseInt(req.params.taskId);
    const { status } = req.body;

    const valid = ["pending", "in_progress", "completed", "blocked"];
    if (!valid.includes(status)) {
      return res.status(400).json({ message: "Invalid task status." });
    }

    const [[task]] = await pool.query(
      `SELECT * FROM project_tasks WHERE id = ? AND order_id = ?`,
      [taskId, orderId],
    );

    if (!task) {
      return res
        .status(404)
        .json({ message: "Task not found for this order." });
    }

    const currentStatus = normalize(task.status);
    const nextStatus = normalize(status);

    if (currentStatus === "completed" && nextStatus !== "completed") {
      return res.status(400).json({
        message: "Completed tasks can no longer be changed.",
      });
    }

    const sequenceError = await validateProductionStepTransition({
      orderId,
      taskRole: task.task_role,
      currentStatus,
      nextStatus,
    });

    if (sequenceError) {
      return res.status(400).json({ message: sequenceError });
    }

    const completedAt =
      nextStatus === "completed" && currentStatus !== "completed"
        ? new Date()
        : nextStatus !== "completed"
          ? null
          : task.completed_at;

    const [result] = await pool.query(
      `UPDATE project_tasks
       SET status = ?, completed_at = ?, is_read = 1, updated_at = NOW()
       WHERE id = ? AND order_id = ? AND status = ?`,
      [status, completedAt, taskId, orderId, task.status],
    );

    if (result.affectedRows !== 1) {
      return res.status(409).json({
        message:
          "Task status changed before this update was completed. Refresh and try again.",
      });
    }

    req.auditRecord = {
      id: taskId,
      old: { status: currentStatus },
      new: { status: nextStatus },
    };
    res.json({ message: "Task status updated successfully." });
  } catch (err) {
    console.error("orders.updateTaskStatus:", err);
    res.status(500).json({ message: "Failed to update task status." });
  }
};

exports.recordManualPayment = async (req, res) => {
  const conn = await pool.getConnection();

  try {
    const orderId = parseInt(req.params.id);
    const amount = Number(req.body?.amount || 0);
    const paymentMethod = normalize(req.body?.payment_method || "cash");
    const notes = String(req.body?.notes || "").trim();

    if (!(amount > 0)) {
      return res.status(400).json({
        message: "Amount must be greater than zero.",
      });
    }

    if (!["cash", "gcash", "bank_transfer"].includes(paymentMethod)) {
      return res.status(400).json({
        message: "Invalid payment method.",
      });
    }

    await conn.beginTransaction();

    const [[order]] = await conn.query(
      `SELECT id, total, status
       FROM orders
       WHERE id = ?
       LIMIT 1`,
      [orderId],
    );

    if (!order) {
      await conn.rollback();
      return res.status(404).json({ message: "Order not found." });
    }

    if (normalize(order.status) !== "delivered") {
      await conn.rollback();
      return res.status(400).json({
        message:
          "Remaining balance can only be recorded after the order is delivered.",
      });
    }

    const [[summary]] = await conn.query(
      `SELECT
         COALESCE(
           SUM(CASE WHEN LOWER(status) = 'verified' THEN amount ELSE 0 END),
           0
         ) AS verified_total
       FROM payment_transactions
       WHERE order_id = ?`,
      [orderId],
    );

    const totalAmount = Number(order.total || 0);
    const verifiedTotal = Number(summary?.verified_total || 0);
    const currentBalance = Math.max(0, totalAmount - verifiedTotal);

    if (currentBalance <= 0.009) {
      await conn.rollback();
      return res.status(400).json({
        message: "This order is already fully paid.",
      });
    }

    if (amount > currentBalance + 0.01) {
      await conn.rollback();
      return res.status(400).json({
        message: `Amount exceeds the remaining balance of ₱${currentBalance.toLocaleString(
          "en-PH",
          { minimumFractionDigits: 2 },
        )}.`,
      });
    }

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
       VALUES (?, ?, ?, '', ?, NOW(), 'verified', ?)`,
      [
        orderId,
        amount,
        paymentMethod,
        req.user.id,
        notes || "Manual remaining balance recorded after delivery.",
      ],
    );

    const newVerifiedTotal = verifiedTotal + amount;

    let nextPaymentStatus = "unpaid";
    if (newVerifiedTotal >= totalAmount - 0.01 && totalAmount > 0) {
      nextPaymentStatus = "paid";
    } else if (newVerifiedTotal > 0) {
      nextPaymentStatus = "partial";
    }

    await conn.query(
      `UPDATE orders
       SET payment_status = ?
       WHERE id = ?`,
      [nextPaymentStatus, orderId],
    );

    await conn.commit();

    res.json({
      message:
        nextPaymentStatus === "paid"
          ? "Remaining balance recorded. The order can now be completed."
          : "Payment recorded successfully.",
      payment_status: nextPaymentStatus,
      remaining_balance: Math.max(0, totalAmount - newVerifiedTotal),
    });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ message: err.message });
  } finally {
    conn.release();
  }
};

exports.getOrderDiscussion = async (req, res) => {
  const orderId = adminToPositiveInt(req.params.id, 0);

  if (!orderId) {
    return res.status(400).json({ message: "Invalid order ID." });
  }

  let conn;
  try {
    conn = await pool.getConnection();

    // ── FIXED: Switched to .query ──
    const [orders] = await conn.query(
      `SELECT id, order_number, customer_id, order_type
       FROM orders
       WHERE id = ?
       LIMIT 1`,
      [orderId],
    );

    if (!orders.length) {
      return res.status(404).json({ message: "Order not found." });
    }

    const order = orders[0];

    if (
      String(order.order_type || "")
        .trim()
        .toLowerCase() !== "blueprint"
    ) {
      return res.status(400).json({
        message:
          "Discussion thread is available for blueprint custom orders only.",
      });
    }

    // ── FIXED: Switched to .query ──
    const [messageRows] = await conn.query(
      `SELECT
          m.id,
          m.order_id,
          m.order_item_id,
          m.sender_id,
          m.sender_role,
          m.message,
          m.created_at,
          m.updated_at,
          u.name AS sender_name
        FROM custom_order_messages m
        LEFT JOIN users u
          ON u.id = m.sender_id
        WHERE m.order_id = ?
        ORDER BY m.created_at ASC, m.id ASC`,
      [orderId],
    );

    // ── FIXED: Switched to .query ──
    const [attachmentRows] = await conn.query(
      `SELECT
          id,
          order_id,
          order_item_id,
          message_id,
          uploaded_by,
          file_url,
          file_name,
          mime_type,
          file_size,
          attachment_type,
          created_at
        FROM custom_order_attachments
        WHERE order_id = ?
        ORDER BY created_at ASC, id ASC`,
      [orderId],
    );

    const normalizedAttachments = attachmentRows.map((row) => ({
      id: row.id,
      order_id: row.order_id,
      order_item_id: row.order_item_id || null,
      message_id: row.message_id || null,
      uploaded_by: row.uploaded_by || null,
      file_url: signUploadPath(adminSafeTextOrNull(row.file_url)),
      file_name: adminSafeTextOrNull(row.file_name),
      mime_type: adminSafeTextOrNull(row.mime_type),
      file_size: Number(row.file_size || 0) || null,
      attachment_type: adminNormalizeText(row.attachment_type),
      created_at: row.created_at || null,
    }));

    const attachmentsByMessageId = normalizedAttachments.reduce((acc, item) => {
      const key = Number(item.message_id || 0);
      if (!key) return acc;
      if (!acc[key]) acc[key] = [];
      acc[key].push(item);
      return acc;
    }, {});

    const messages = messageRows.map((row) => ({
      id: row.id,
      order_id: row.order_id,
      order_item_id: row.order_item_id || null,
      sender_id: row.sender_id || null,
      sender_role: adminNormalizeText(row.sender_role) || "customer",
      sender_name: adminSafeTextOrNull(row.sender_name) || "User",
      message: adminSafeTextOrNull(row.message),
      created_at: row.created_at || null,
      updated_at: row.updated_at || null,
      attachments: attachmentsByMessageId[row.id] || [],
    }));

    return res.json({
      order_id: order.id,
      order_number: order.order_number,
      discussion: messages,
    });
  } catch (err) {
    console.error("[admin.order getOrderDiscussion]", err);
    return res.status(500).json({
      message: "Failed to load discussion thread.",
      error: err.message,
    });
  } finally {
    if (conn) conn.release();
  }
};

exports.postOrderDiscussionMessage = async (req, res) => {
  const orderId = adminToPositiveInt(req.params.id, 0);
  const message = String(req.body?.message || "").trim();
  const files = Array.isArray(req.files) ? req.files : [];

  if (!orderId) {
    return res.status(400).json({ message: "Invalid order ID." });
  }

  if (!message && !files.length) {
    return res.status(400).json({
      message: "Write a message or upload at least one attachment.",
    });
  }

  let conn;
  try {
    conn = await pool.getConnection();
    await conn.beginTransaction();

    // ── FIXED: Switched to .query ──
    const [orders] = await conn.query(
      `SELECT id, order_number, customer_id, order_type
       FROM orders
       WHERE id = ?
       LIMIT 1`,
      [orderId],
    );

    if (!orders.length) {
      await conn.rollback();
      return res.status(404).json({ message: "Order not found." });
    }

    const order = orders[0];

    if (
      String(order.order_type || "")
        .trim()
        .toLowerCase() !== "blueprint"
    ) {
      await conn.rollback();
      return res.status(400).json({
        message:
          "Discussion thread is available for blueprint custom orders only.",
      });
    }

    const senderRole =
      String(req.user?.role || "")
        .trim()
        .toLowerCase() === "admin"
        ? "admin"
        : "staff";

    // ── FIXED: Switched to .query ──
    const [messageResult] = await conn.query(
      `INSERT INTO custom_order_messages
        (order_id, order_item_id, sender_id, sender_role, message)
       VALUES (?, NULL, ?, ?, ?)`,
      [
        order.id,
        req.user?.id || null,
        senderRole,
        message || "Uploaded attachment.",
      ],
    );

    const messageId = messageResult.insertId;

    for (const file of files) {
      // ── FIXED: Switched to .query ──
      await conn.query(
        `INSERT INTO custom_order_attachments
          (order_id, order_item_id, message_id, uploaded_by, file_url, file_name, mime_type, file_size, attachment_type)
         VALUES (?, NULL, ?, ?, ?, ?, ?, ?, 'chat_attachment')`,
        [
          order.id,
          messageId,
          req.user?.id || null,
          `/uploads/custom-request-assets/${file.filename}`,
          String(file.originalname || file.filename).trim() || file.filename,
          String(file.mimetype || "").trim() || null,
          Number(file.size || 0) || null,
        ],
      );
    }

    await adminInsertDiscussionNotificationSafe(conn, order.customer_id, {
      type: "custom_request_admin_reply",
      title: "New Admin Reply",
      message: `Admin sent a new discussion reply for ${order.order_number}.`,
    });

    await conn.commit();

    return res.json({
      message: "Discussion reply sent successfully.",
    });
  } catch (err) {
    if (conn) {
      try {
        await conn.rollback();
      } catch {}
    }

    console.error("[admin.order postOrderDiscussionMessage]", err);
    return res.status(500).json({
      message: "Failed to send discussion reply.",
      error: err.message,
    });
  } finally {
    if (conn) conn.release();
  }
};