// controllers/orderController.js – Order Management (Admin) [SCHEMA-CORRECTED]
// controllers/orderController.js – Order Management (Admin) [SCHEMA-CORRECTED]
const pool = require("../../config/db");
const { signUploadPath } = require("../../utils/signedUrl");

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

    const [payments] = await pool.query(
      `SELECT 
          pt.*,
          u.name AS verified_by
       FROM payment_transactions pt
       LEFT JOIN users u ON u.id = pt.verified_by
       WHERE pt.order_id = ?
       ORDER BY pt.created_at DESC, pt.id DESC`,
      [orderId],
    );

    payments.forEach((p) => {
      if (p.proof_url) p.proof_url = signUploadPath(p.proof_url);
    });

    if (order.payment_proof && payments.length === 0) {
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
      });
    }

    const [[delivery]] = await pool.query(
      `SELECT * FROM deliveries WHERE order_id = ? LIMIT 1`,
      [orderId],
    );

    if (delivery?.signed_receipt) {
      delivery.signed_receipt = signUploadPath(delivery.signed_receipt);
    }

    const [[contract]] = await pool.query(
      `SELECT * FROM contracts WHERE order_id = ? LIMIT 1`,
      [orderId],
    );

    const resolvedBlueprintId =
      Number(contract?.blueprint_id || order.blueprint_id || 0) || null;

    let latestEstimation = null;

    if (resolvedBlueprintId) {
      const [[estimation]] = await pool.query(
        `SELECT
            id,
            blueprint_id,
            version,
            status,
            material_cost,
            labor_cost,
            tax,
            discount,
            grand_total,
            created_at,
            updated_at
        FROM estimations
        WHERE blueprint_id = ?
        ORDER BY version DESC, id DESC
        LIMIT 1`,
        [resolvedBlueprintId],
      );

      latestEstimation = estimation || null;
    }

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

    const verifiedPaymentTotal = payments
      .filter((payment) => normalize(payment.status) === "verified")
      .reduce((sum, payment) => sum + Number(payment.amount || 0), 0);

    const totalAmount = Number(order.total_amount || order.total || 0);
    const paymentBalance = Math.max(0, totalAmount - verifiedPaymentTotal);

    const hasPendingPayment = payments.some(
      (payment) => normalize(payment.status) === "pending",
    );
    const hasRejectedPayment = payments.some(
      (payment) => normalize(payment.status) === "rejected",
    );

    let paymentStatusDisplay = normalize(order.payment_status || "unpaid");

    if (
      ["cash", "cod", "cop"].includes(normalize(order.payment_method)) &&
      normalize(order.payment_status) === "paid"
    ) {
      paymentStatusDisplay = "paid";
    } else if (verifiedPaymentTotal >= totalAmount && totalAmount > 0) {
      paymentStatusDisplay = "paid";
    } else if (verifiedPaymentTotal > 0) {
      paymentStatusDisplay = "partial";
    } else if (hasPendingPayment) {
      paymentStatusDisplay = "pending";
    } else if (hasRejectedPayment && paymentStatusDisplay !== "paid") {
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
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
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

    const paymentMarkedPaid = normalize(order.payment_status) === "paid";
    const hasRequiredBlueprintDownPayment =
      paymentMarkedPaid ||
      verifiedPaymentTotal >= Math.max(0, requiredBlueprintDownPayment - 0.01);

    let latestEstimation = null;

    if (blueprintId) {
      const [[estimation]] = await conn.query(
        `SELECT id, status
         FROM estimations
         WHERE blueprint_id = ?
         ORDER BY version DESC, id DESC
         LIMIT 1`,
        [blueprintId],
      );

      latestEstimation = estimation || null;
    }

    const estimationApproved =
      normalize(latestEstimation?.status) === "approved";

    if (
      isBlueprintOrder &&
      ["contract_released", "production"].includes(nextStatus)
    ) {
      if (!blueprintId) {
        await conn.rollback();
        return res.status(400).json({
          message: "Blueprint order must be linked to a blueprint first.",
        });
      }

      if (totalAmount <= 0) {
        await conn.rollback();
        return res.status(400).json({
          message:
            "Blueprint order total must be finalized first before contract release or production.",
        });
      }

      if (!latestEstimation) {
        await conn.rollback();
        return res.status(400).json({
          message:
            "Blueprint order needs a saved estimation before contract release or production.",
        });
      }

      if (!estimationApproved) {
        await conn.rollback();
        return res.status(400).json({
          message:
            "Blueprint order must have an approved estimation before contract release or production.",
        });
      }

      if (!hasRequiredBlueprintDownPayment) {
        await conn.rollback();
        return res.status(400).json({
          message:
            "Blueprint orders require at least a 30% verified down payment before contract release or production.",
        });
      }
    }

    if (isBlueprintOrder && nextStatus === "contract_released") {
      if (!order.contract_id) {
        await conn.rollback();
        return res.status(400).json({
          message:
            "Generate the contract first before releasing this blueprint order.",
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

      if (!order.contract_id) {
        await conn.rollback();
        return res.status(400).json({
          message:
            "Blueprint order must have a generated contract before moving to production.",
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

    if (nextStatus === "completed" && paymentBalance > 0) {
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
  const conn = await pool.getConnection();

  try {
    const { payment_id, action } = req.body;
    const normalizedAction = normalize(action);

    if (!["verified", "rejected"].includes(normalizedAction)) {
      return res.status(400).json({ message: "Invalid payment action." });
    }

    await conn.beginTransaction();

    // 👉 THE FIX: We intercept the "initial_" ID here so it doesn't run parseInt() and cause a NaN error!
    if (String(payment_id).startsWith("initial_")) {
      const orderId = parseInt(req.params.id);
      const [[order]] = await conn.query(
        `SELECT total, payment_method, payment_proof FROM orders WHERE id = ? LIMIT 1`,
        [orderId],
      );

      if (!order) {
        await conn.rollback();
        return res.status(404).json({ message: "Order not found." });
      }

      // Convert the initial order proof into a REAL payment transaction record
      await conn.query(
        `INSERT INTO payment_transactions
          (order_id, amount, payment_method, proof_url, verified_by, verified_at, status, notes)
         VALUES (?, ?, ?, ?, ?, NOW(), ?, ?)`,
        [
          orderId,
          order.total,
          order.payment_method,
          order.payment_proof,
          req.user.id,
          normalizedAction,
          `Initial order payment ${normalizedAction}.`,
        ],
      );
    } else {
      // Normal payment transaction flow for later payments
      const [[payment]] = await conn.query(
        `SELECT id, status, amount
         FROM payment_transactions
         WHERE id = ? AND order_id = ?
         LIMIT 1`,
        [parseInt(payment_id), parseInt(req.params.id)],
      );

      if (!payment) {
        await conn.rollback();
        return res.status(404).json({ message: "Payment record not found." });
      }

      if (normalize(payment.status) !== "pending") {
        await conn.rollback();
        return res
          .status(400)
          .json({ message: "Only pending payments can be reviewed." });
      }

      await conn.query(
        `UPDATE payment_transactions
         SET status = ?, verified_by = ?, verified_at = NOW()
         WHERE id = ? AND order_id = ?`,
        [
          normalizedAction,
          req.user.id,
          parseInt(payment_id),
          parseInt(req.params.id),
        ],
      );
    }

    // Recalculate order payment status based on all transactions
    const [[order]] = await conn.query(
      `SELECT total, payment_method
       FROM orders
       WHERE id = ?
       LIMIT 1`,
      [parseInt(req.params.id)],
    );

    const [[summary]] = await conn.query(
      `SELECT
         COALESCE(SUM(CASE WHEN LOWER(status) = 'verified' THEN amount ELSE 0 END), 0) AS verified_total,
         MAX(CASE WHEN LOWER(status) = 'pending' THEN 1 ELSE 0 END) AS has_pending,
         MAX(CASE WHEN LOWER(status) = 'rejected' THEN 1 ELSE 0 END) AS has_rejected
       FROM payment_transactions
       WHERE order_id = ?`,
      [parseInt(req.params.id)],
    );

    const totalAmount = Number(order?.total || 0);
    const verifiedTotal = Number(summary?.verified_total || 0);

    let nextPaymentStatus = "unpaid";

    if (verifiedTotal >= totalAmount && totalAmount > 0) {
      nextPaymentStatus = "paid";
    } else if (verifiedTotal > 0) {
      nextPaymentStatus = "partial";
    } else if (Number(summary?.has_pending)) {
      nextPaymentStatus = "pending";
    } else if (Number(summary?.has_rejected)) {
      nextPaymentStatus = "rejected";
    }

    await conn.query(
      `UPDATE orders
       SET payment_status = ?
       WHERE id = ?`,
      [nextPaymentStatus, parseInt(req.params.id)],
    );

    await conn.commit();

    req.auditRecord = {
      id: parseInt(req.params.id),
      new: { payment_id, action: normalizedAction, payment_status: nextPaymentStatus },
    };
    res.json({
      message: `Payment ${normalizedAction}.`,
      payment_status: nextPaymentStatus,
    });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ message: err.message });
  } finally {
    conn.release();
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
    const { approved, refund_amount, policy_applied } = req.body;
    await conn.query(
      "UPDATE cancellations SET approved_by = ?, approved_at = NOW(), refund_amount = ?, policy_applied = ? WHERE order_id = ?",
      [req.user.id, refund_amount, policy_applied, parseInt(req.params.id)],
    );
    if (approved) {
      await conn.query(
        "UPDATE orders SET status = 'cancelled', refund_amount = ?, refund_status = 'pending', cancelled_at = NOW() WHERE id = ?",
        [refund_amount, parseInt(req.params.id)],
      );
    }
    await conn.commit();
    res.json({ message: "Cancellation processed." });
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

    for (const stepLabel of BLUEPRINT_PRODUCTION_TASK_ROLE_OPTIONS) {
      const title = `${order.order_number || `Order #${orderId}`} — ${stepLabel}`;
      const description = note
        ? `Production step: ${stepLabel}\n\nAdmin production note: ${note}`
        : `Production step: ${stepLabel}`;

      await conn.query(
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

    if (normalize(order.status) === "contract_released") {
      await conn.query(
        `UPDATE orders
         SET status = 'production'
         WHERE id = ?`,
        [orderId],
      );
    }

    await conn.commit();

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

    const completedAt = status === "completed" ? new Date() : null;

    await pool.query(
      `UPDATE project_tasks
       SET status = ?, completed_at = ?, is_read = 1, updated_at = NOW()
       WHERE id = ? AND order_id = ?`,
      [status, completedAt, taskId, orderId],
    );

    res.json({ message: "Task status updated successfully." });
  } catch (err) {
    res.status(500).json({ message: err.message });
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
