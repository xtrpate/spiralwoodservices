const db = require("../../config/db");
const fs = require("fs");
const path = require("path");
const { authenticate, requireCustomer } = require("../../middleware/auth");
const { signUploadPath } = require("../../utils/signedUrl");

const customRequestAssetsDir = path.join(
  __dirname,
  "../../uploads/custom-request-assets",
);

if (!fs.existsSync(customRequestAssetsDir)) {
  fs.mkdirSync(customRequestAssetsDir, { recursive: true });
}

const toTrimmedStringOrNull = (value) => {
  const text = String(value ?? "").trim();
  return text || null;
};

const toPositiveInt = (value, fallback = 1) => {
  const n = parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

const toPositiveNumberOrNull = (value) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
};

const toSafeObjectOrNull = (value) => {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : null;
};

const toSafeEditorSnapshot = (value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return {
    worldSize:
      value.worldSize && typeof value.worldSize === "object"
        ? value.worldSize
        : null,
    components: Array.isArray(value.components) ? value.components : [],
  };
};

const toSafeReferencePhotos = (value) => {
  if (!Array.isArray(value)) return [];

  return value
    .slice(0, 4)
    .map((item) => ({
      name: String(item?.name || "").trim(),
      type: String(item?.type || "")
        .trim()
        .toLowerCase(),
      size: Number(item?.size || 0) || 0,
      data_url: String(item?.data_url || item?.dataUrl || "").trim(),
    }))
    .filter(
      (item) =>
        item.data_url.startsWith("data:image/") &&
        ["image/jpeg", "image/jpg", "image/png", "image/webp"].includes(
          item.type || "",
        ),
    );
};

const slugifyFilename = (value = "file") => {
  const safe = String(value || "file")
    .replace(/\s+/g, "_")
    .replace(/[^a-zA-Z0-9._-]/g, "")
    .trim();

  return safe || "file";
};

const getExtFromMime = (mime = "") => {
  const clean = String(mime || "")
    .trim()
    .toLowerCase();

  if (clean.includes("jpeg") || clean.includes("jpg")) return ".jpg";
  if (clean.includes("png")) return ".png";
  if (clean.includes("webp")) return ".webp";
  if (clean.includes("pdf")) return ".pdf";

  return "";
};

const saveBase64ReferencePhoto = async (fileLike = {}) => {
  const dataUrl = String(fileLike?.data_url || "").trim();
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);

  if (!match) return null;

  const mimeType = String(match[1] || "")
    .trim()
    .toLowerCase();
  const base64Body = match[2];

  if (
    !["image/jpeg", "image/jpg", "image/png", "image/webp"].includes(mimeType)
  ) {
    return null;
  }

  const ext = getExtFromMime(mimeType) || ".jpg";
  const filename = `custom_ref_${Date.now()}_${Math.random()
    .toString(36)
    .slice(2, 10)}${ext}`;

  const absolutePath = path.join(customRequestAssetsDir, filename);
  await fs.promises.writeFile(absolutePath, Buffer.from(base64Body, "base64"));

  return {
    file_url: `/uploads/custom-request-assets/${filename}`,
    file_name: slugifyFilename(fileLike?.name || filename),
    mime_type: mimeType,
    file_size: Number(fileLike?.size || 0) || null,
  };
};

const sanitizeEditorSnapshotForStorage = (snapshot = null) => {
  if (!snapshot || typeof snapshot !== "object") return null;

  const worldSize =
    snapshot?.worldSize && typeof snapshot.worldSize === "object"
      ? {
          w: Number(snapshot.worldSize.w || 0) || 0,
          h: Number(snapshot.worldSize.h || 0) || 0,
          d: Number(snapshot.worldSize.d || 0) || 0,
        }
      : null;

  const components = Array.isArray(snapshot?.components)
    ? snapshot.components.slice(0, 300).map((comp) => ({
        id: comp?.id || null,
        type: comp?.type || null,
        label: comp?.label || null,
        x: Number(comp?.x || 0) || 0,
        y: Number(comp?.y || 0) || 0,
        z: Number(comp?.z || 0) || 0,
        width: Number(comp?.width || 0) || 0,
        height: Number(comp?.height || 0) || 0,
        depth: Number(comp?.depth || 0) || 0,
        rotationX: Number(comp?.rotationX || 0) || 0,
        rotationY: Number(comp?.rotationY || 0) || 0,
        rotationZ: Number(comp?.rotationZ || 0) || 0,
        material: toTrimmedStringOrNull(comp?.material),
        finish: toTrimmedStringOrNull(comp?.finish),
        fill: toTrimmedStringOrNull(comp?.fill),
        qty: Math.max(1, Number(comp?.qty || 1)),
        locked: Boolean(comp?.locked),
        blueprintStyle: toTrimmedStringOrNull(comp?.blueprintStyle),
        templateType: toTrimmedStringOrNull(comp?.templateType),
        unitPrice: Number(comp?.unitPrice || 0) || 0,
        groupUnitPrice: Number(comp?.groupUnitPrice || 0) || 0,
      }))
    : [];

  return {
    worldSize,
    components,
  };
};

const sanitizeCustomizationSnapshotForStorage = (snapshot = null) => {
  if (!snapshot || typeof snapshot !== "object") return null;

  return {
    width: Number(snapshot?.width || 0) || 0,
    height: Number(snapshot?.height || 0) || 0,
    depth: Number(snapshot?.depth || 0) || 0,
    wood_type: toTrimmedStringOrNull(snapshot?.wood_type),
    finish_color: toTrimmedStringOrNull(snapshot?.finish_color),
    color: toTrimmedStringOrNull(snapshot?.color),
    door_style: toTrimmedStringOrNull(snapshot?.door_style),
    hardware: toTrimmedStringOrNull(snapshot?.hardware),
    unit: toTrimmedStringOrNull(snapshot?.unit) || "mm",
  };
};

const insertCustomOrderMessage = async (
  conn,
  {
    orderId,
    orderItemId = null,
    senderId = null,
    senderRole = "customer",
    message = null,
  },
) => {
  const cleanMessage = toTrimmedStringOrNull(message);

  const [result] = await conn.execute(
    `INSERT INTO custom_order_messages
      (order_id, order_item_id, sender_id, sender_role, message)
     VALUES (?, ?, ?, ?, ?)`,
    [orderId, orderItemId, senderId, senderRole, cleanMessage],
  );

  return result.insertId;
};

const insertCustomOrderAttachment = async (
  conn,
  {
    orderId,
    orderItemId = null,
    messageId = null,
    uploadedBy = null,
    fileUrl,
    fileName = null,
    mimeType = null,
    fileSize = null,
    attachmentType = "reference_photo",
  },
) => {
  await conn.execute(
    `INSERT INTO custom_order_attachments
      (order_id, order_item_id, message_id, uploaded_by, file_url, file_name, mime_type, file_size, attachment_type)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      orderId,
      orderItemId,
      messageId,
      uploadedBy,
      fileUrl,
      fileName,
      mimeType,
      fileSize,
      attachmentType,
    ],
  );
};

const getCustomOrderDiscussion = async (conn, orderId) => {
  const [messageRows] = await conn.execute(
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

  const [attachmentRows] = await conn.execute(
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
    file_url: signUploadPath(toTrimmedStringOrNull(row.file_url)),
    file_name: toTrimmedStringOrNull(row.file_name),
    mime_type: toTrimmedStringOrNull(row.mime_type),
    file_size: Number(row.file_size || 0) || null,
    attachment_type: normalize(row.attachment_type),
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
    sender_role: normalize(row.sender_role) || "customer",
    sender_name: toTrimmedStringOrNull(row.sender_name) || "Customer",
    message: toTrimmedStringOrNull(row.message),
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
    attachments: attachmentsByMessageId[row.id] || [],
  }));

  return {
    messages,
    attachments: normalizedAttachments,
  };
};

const parseJSON = (value, fallback = null) => {
  try {
    const parsed = JSON.parse(value);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
};

const normalizeCustomOrderItem = (row = {}) => {
  const custom = parseJSON(row.customization_json, {}) || {};

  return {
    id: row.id,
    order_id: row.order_id,
    product_name:
      toTrimmedStringOrNull(custom.product_name) ||
      toTrimmedStringOrNull(row.product_name) ||
      "Custom Furniture",
    quantity: toPositiveInt(row.quantity, 1),
    unit_price: Number(row.unit_price || 0),
    subtotal: Number(row.subtotal || 0),

    blueprint_id:
      toPositiveInt(custom.blueprint_id, 0) > 0
        ? toPositiveInt(custom.blueprint_id, 0)
        : null,

    image_url:
      toTrimmedStringOrNull(custom.image_url) ||
      toTrimmedStringOrNull(custom.preview_image_url),
    preview_image_url:
      toTrimmedStringOrNull(custom.preview_image_url) ||
      toTrimmedStringOrNull(custom.image_url),

    base_blueprint_title: toTrimmedStringOrNull(custom.base_blueprint_title),
    template_profile: toTrimmedStringOrNull(custom.template_profile),
    template_category: toTrimmedStringOrNull(custom.template_category),

    wood_type: toTrimmedStringOrNull(custom.wood_type),
    finish_color:
      toTrimmedStringOrNull(custom.finish_color) ||
      toTrimmedStringOrNull(custom.color),
    color:
      toTrimmedStringOrNull(custom.color) ||
      toTrimmedStringOrNull(custom.finish_color),
    door_style: toTrimmedStringOrNull(custom.door_style),
    hardware: toTrimmedStringOrNull(custom.hardware),

    width: toPositiveNumberOrNull(custom.width),
    height: toPositiveNumberOrNull(custom.height),
    depth: toPositiveNumberOrNull(custom.depth),
    unit: toTrimmedStringOrNull(custom.unit) || "mm",

    comments: toTrimmedStringOrNull(custom.comments),

    customization_snapshot: toSafeObjectOrNull(custom.customization_snapshot),
    editor_snapshot: toSafeEditorSnapshot(custom.editor_snapshot),
  };
};

/* ── Submit Custom Order / Request ── */
exports.createCustomOrder = async (req, res) => {
  console.log("[CUSTOM ORDER HIT]");
  console.log("[CUSTOM ORDER BODY]", JSON.stringify(req.body, null, 2));

  const { items, name, phone, delivery_address, payment_method, notes } =
    req.body;

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ message: "No items in custom order." });
  }

  if (!String(name || "").trim()) {
    return res.status(400).json({ message: "Name is required." });
  }

  if (!String(phone || "").trim()) {
    return res.status(400).json({ message: "Phone is required." });
  }

  const cleanedItems = items
    .map((item) => ({
      product_id: toPositiveInt(item.product_id, 0) || null,
      blueprint_id: toPositiveInt(item.blueprint_id, 0) || null,
      product_name: String(
        item.product_name || item.base_blueprint_title || "Custom Blueprint",
      ).trim(),
      quantity: toPositiveInt(item.quantity, 1),

      image_url: toTrimmedStringOrNull(item.image_url),
      preview_image_url: toTrimmedStringOrNull(
        item.preview_image_url || item.image_url,
      ),
      base_blueprint_title: toTrimmedStringOrNull(item.base_blueprint_title),
      template_profile: toTrimmedStringOrNull(item.template_profile),
      template_category: toTrimmedStringOrNull(item.template_category),

      wood_type: toTrimmedStringOrNull(item.wood_type),
      finish_color: toTrimmedStringOrNull(item.finish_color || item.color),
      color: toTrimmedStringOrNull(item.color || item.finish_color),
      door_style: toTrimmedStringOrNull(item.door_style),
      hardware: toTrimmedStringOrNull(item.hardware),

      width: toPositiveNumberOrNull(item.width),
      height: toPositiveNumberOrNull(item.height),
      depth: toPositiveNumberOrNull(item.depth),
      unit: toTrimmedStringOrNull(item.unit) || "mm",

      comments: toTrimmedStringOrNull(item.comments),
      initial_message: toTrimmedStringOrNull(
        item.initial_message || item.comments,
      ),
      reference_photos: toSafeReferencePhotos(item.reference_photos),

      customization_snapshot: toSafeObjectOrNull(item.customization_snapshot),
      editor_snapshot: toSafeEditorSnapshot(item.editor_snapshot),
    }))
    .filter((item) => item.product_name);

  if (cleanedItems.length === 0) {
    return res.status(400).json({ message: "Custom order items are invalid." });
  }

  const blueprintIds = [
    ...new Set(
      cleanedItems
        .map((item) => toPositiveInt(item.blueprint_id, 0))
        .filter((id) => id > 0),
    ),
  ];

  if (!blueprintIds.length) {
    return res.status(400).json({
      message: "No valid blueprint/template was found in this custom request.",
    });
  }

  const primaryBlueprintId = blueprintIds[0];

  let conn;
  try {
    conn = await db.getConnection();
    await conn.beginTransaction();

    const now = new Date();
    const date = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(
      2,
      "0",
    )}${String(now.getDate()).padStart(2, "0")}`;

    const [last] = await conn.execute(
      `SELECT order_number
       FROM orders
       WHERE order_number LIKE ?
       ORDER BY id DESC
       LIMIT 1`,
      [`SWS-${date}-%`],
    );

    const seq = last.length
      ? String(parseInt(last[0].order_number.split("-")[2], 10) + 1).padStart(
          4,
          "0",
        )
      : "0001";

    const order_number = `SWS-${date}-${seq}`;

    const [result] = await conn.execute(
      `INSERT INTO orders
        (order_number, customer_id, blueprint_id, type, order_type, status,
          walkin_customer_name, walkin_customer_phone,
          payment_method, payment_status,
          delivery_address, notes, subtotal, total)
      VALUES (?, ?, NULL, 'online', 'blueprint', 'pending', ?, ?, ?, 'unpaid', ?, ?, 0, 0)`,
      [
        order_number,
        req.user.id,
        String(name).trim(),
        String(phone).trim(),
        toAllowedBlueprintPaymentMethod(payment_method) || "gcash",
        delivery_address ? String(delivery_address).trim() : null,
        notes ? String(notes).trim() : null,
      ],
    );

    const order_id = result.insertId;

    for (const item of cleanedItems) {
      const slimCustomizationSnapshot = sanitizeCustomizationSnapshotForStorage(
        item.customization_snapshot,
      );

      const slimEditorSnapshot = sanitizeEditorSnapshotForStorage(
        item.editor_snapshot,
      );

      const customization_json = JSON.stringify({
        blueprint_id: item.blueprint_id,
        image_url: item.image_url,
        preview_image_url: item.preview_image_url,
        base_blueprint_title: item.base_blueprint_title,
        template_profile: item.template_profile,
        template_category: item.template_category,
        product_name: item.product_name,
        wood_type: item.wood_type,
        finish_color: item.finish_color,
        color: item.color,
        door_style: item.door_style,
        hardware: item.hardware,
        width: item.width,
        height: item.height,
        depth: item.depth,
        unit: item.unit,
        comments: item.comments,
        initial_message: item.initial_message,
        customization_snapshot: slimCustomizationSnapshot,
        editor_snapshot: slimEditorSnapshot,
      });

      const resolvedProductId = await resolveExistingProductId(
        conn,
        item.product_id,
      );

      const [itemResult] = await conn.execute(
        `INSERT INTO order_items
          (order_id, product_id, product_name, quantity, unit_price, variation_id, customization_json)
        VALUES (?, ?, ?, ?, 0, NULL, ?)`,
        [
          order_id,
          resolvedProductId,
          item.product_name,
          item.quantity,
          customization_json,
        ],
      );

      const orderItemId = itemResult.insertId;

      let linkedMessageId = null;
      const hasReferencePhotos =
        Array.isArray(item.reference_photos) &&
        item.reference_photos.length > 0;

      if (item.initial_message || hasReferencePhotos) {
        linkedMessageId = await insertCustomOrderMessage(conn, {
          orderId: order_id,
          orderItemId,
          senderId: req.user.id,
          senderRole: "customer",
          message: item.initial_message || "Uploaded reference photos.",
        });
      }

      for (const photo of item.reference_photos || []) {
        const saved = await saveBase64ReferencePhoto(photo);
        if (!saved) continue;

        await insertCustomOrderAttachment(conn, {
          orderId: order_id,
          orderItemId,
          messageId: linkedMessageId,
          uploadedBy: req.user.id,
          fileUrl: saved.file_url,
          fileName: saved.file_name,
          mimeType: saved.mime_type,
          fileSize: saved.file_size,
          attachmentType: "reference_photo",
        });
      }
    }

    await conn.commit();

    return res.status(201).json({
      message: "Custom request submitted successfully.",
      order_id,
      order_number,
      detail_url: `/custom-requests/${order_id}`,
    });
  } catch (err) {
    if (conn) {
      try {
        await conn.rollback();
      } catch {}
    }

    console.error("[customer.customorders POST]", err);
    return res
      .status(500)
      .json({ message: "Server error.", error: err.message });
  } finally {
    if (conn) conn.release();
  }
};

/* ── Get Customer's Custom Orders ── */
exports.getCustomOrders = async (req, res) => {
  try {
    const [orders] = await db.execute(
      `SELECT
          id,
          order_number,
          status,
          payment_method,
          payment_status,
          total,
          created_at
       FROM orders
       WHERE customer_id = ? AND order_type = 'blueprint'
       ORDER BY created_at DESC`,
      [req.user.id],
    );

    return res.json(orders);
  } catch (err) {
    console.error("[customer.customorders GET]", err);
    return res
      .status(500)
      .json({ message: "Server error.", error: err.message });
  }
};

/* ── Get Single Customer Custom Order / Request Detail ── */
exports.getCustomOrderById = async (req, res) => {
  const orderId = toPositiveInt(req.params.id, 0);

  if (!orderId) {
    return res.status(400).json({ message: "Invalid custom request ID." });
  }

  let conn;
  try {
    conn = await db.getConnection();

    const [orders] = await conn.execute(
      `SELECT
          id,
          order_number,
          customer_id,
          blueprint_id,
          type,
          order_type,
          status,
          payment_method,
          payment_status,
          delivery_address,
          notes,
          subtotal,
          tax,
          discount,
          total,
          down_payment,
          payment_proof,
          created_at,
          updated_at
       FROM orders
       WHERE id = ?
         AND customer_id = ?
         AND order_type = 'blueprint'
       LIMIT 1`,
      [orderId, req.user.id],
    );

    if (!orders.length) {
      return res.status(404).json({ message: "Custom request not found." });
    }

    const order = orders[0];

    const [items] = await conn.execute(
      `SELECT
          id,
          order_id,
          product_name,
          quantity,
          unit_price,
          subtotal,
          customization_json
       FROM order_items
       WHERE order_id = ?
       ORDER BY id ASC`,
      [orderId],
    );

    const normalizedItems = items.map(normalizeCustomOrderItem);

    const [paymentRows] = await conn.execute(
      `SELECT
          id,
          order_id,
          amount,
          payment_method,
          proof_url,
          status,
          notes,
          verified_by,
          verified_at,
          created_at
       FROM payment_transactions
       WHERE order_id = ?
       ORDER BY id DESC`,
      [orderId],
    );

    const normalizedPayments = paymentRows.map((row) => ({
      id: row.id,
      order_id: row.order_id,
      amount: roundMoney(row.amount || 0),
      payment_method: String(row.payment_method || "").trim(),
      proof_url: signUploadPath(toTrimmedStringOrNull(row.proof_url)),
      status: normalize(row.status),
      notes: toTrimmedStringOrNull(row.notes),
      verified_by: row.verified_by || null,
      verified_at: row.verified_at || null,
      created_at: row.created_at || null,
    }));

    const totalVerifiedPayments = roundMoney(
      normalizedPayments
        .filter((payment) => payment.status === "verified")
        .reduce((sum, payment) => sum + Number(payment.amount || 0), 0),
    );

    const totalPendingPayments = roundMoney(
      normalizedPayments
        .filter((payment) => payment.status === "pending")
        .reduce((sum, payment) => sum + Number(payment.amount || 0), 0),
    );

    const latestEstimation = await getLatestEstimationForBlueprint(
      conn,
      order.blueprint_id,
    );

    const discussionData = await getCustomOrderDiscussion(conn, orderId);

    const normalizedItemsWithPhotos = normalizedItems.map((item) => ({
      ...item,
      reference_photos: discussionData.attachments.filter(
        (attachment) =>
          Number(attachment.order_item_id || 0) === Number(item.id) &&
          attachment.attachment_type === "reference_photo",
      ),
    }));

    const quotedTotal = roundMoney(
      latestEstimation?.grand_total || order.total || 0,
    );

    const downPaymentDue = roundMoney(
      order.down_payment ||
        (quotedTotal > 0 ? calcDownPaymentAmount(quotedTotal) : 0),
    );

    const hasVerifiedDownPayment =
      downPaymentDue > 0 && totalVerifiedPayments + 0.0001 >= downPaymentDue;

    const balanceDue = roundMoney(
      Math.max(quotedTotal - totalVerifiedPayments, 0),
    );

    return res.json({
      ...order,
      items: normalizedItemsWithPhotos,
      latest_estimation: latestEstimation,
      payment_transactions: normalizedPayments,
      discussion: discussionData.messages,
      payment_summary: {
        quoted_total: quotedTotal,
        down_payment_due: downPaymentDue,
        total_verified: totalVerifiedPayments,
        total_pending: totalPendingPayments,
        balance_due: balanceDue,
        has_verified_down_payment: hasVerifiedDownPayment,
        latest_transaction: normalizedPayments[0] || null,
      },
      total_items: normalizedItemsWithPhotos.length,
      total_units: normalizedItemsWithPhotos.reduce(
        (sum, item) => sum + Math.max(1, Number(item.quantity || 1)),
        0,
      ),
    });
  } catch (err) {
    console.error("[customer.customorders GET ONE]", err);
    return res
      .status(500)
      .json({ message: "Server error.", error: err.message });
  } finally {
    if (conn) conn.release();
  }
};

const normalize = (value) =>
  String(value || "")
    .trim()
    .toLowerCase();

const roundMoney = (value) =>
  Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

const calcDownPaymentAmount = (total) => roundMoney(roundMoney(total) * 0.3);

const toAllowedBlueprintPaymentMethod = (value) => {
  const key = normalize(value).replace(/\s+/g, "_");
  return ["cod", "cop", "cash", "gcash", "bank_transfer"].includes(key)
    ? key
    : null;
};

const toPaymentTransactionMethod = (value) => {
  const key = toAllowedBlueprintPaymentMethod(value);
  if (!key) return null;
  return key;
};

const resolveExistingProductId = async (conn, value) => {
  const id = toPositiveInt(value, 0);
  if (!id) return null;

  const [[row]] = await conn.execute(
    `SELECT id FROM products WHERE id = ? LIMIT 1`,
    [id],
  );

  return row?.id || null;
};

const insertNotificationSafe = async (
  conn,
  userId,
  { type = "order_update", title, message },
) => {
  if (!userId) return;

  try {
    await conn.execute(
      `INSERT INTO notifications
        (user_id, type, title, message, is_read, channel, sent_at, created_at)
       VALUES (?, ?, ?, ?, 0, 'system', NOW(), NOW())`,
      [userId, type, title, message],
    );
  } catch (err) {
    console.error("[customer.customorders notification skipped]", err);
  }
};

const getLatestEstimationForBlueprint = async (conn, blueprintId) => {
  if (!Number(blueprintId)) return null;

  const [rows] = await conn.execute(
    `SELECT
      e.id,
      e.blueprint_id,
      e.version,
      e.status,
      e.material_cost,
      e.labor_cost,
      e.tax,
      e.discount,
      e.grand_total,
      e.estimation_data,
      e.approved_by,
      e.approved_at,
      e.created_at,
      e.updated_at
   FROM estimations e
   WHERE e.blueprint_id = ?
   ORDER BY e.created_at DESC
   LIMIT 1`,
    [blueprintId],
  );

  if (!rows.length) return null;

  const est = rows[0];
  const estimationData = parseJSON(est.estimation_data, {}) || {};

  const [itemRows] = await conn.execute(
    `SELECT
        id,
        component_id,
        raw_material_id,
        description,
        quantity,
        unit_cost,
        subtotal
     FROM estimation_items
     WHERE estimation_id = ?
     ORDER BY id ASC`,
    [est.id],
  );

  return {
    id: est.id,
    blueprint_id: est.blueprint_id,
    version: est.version,
    status: normalize(est.status),
    material_cost: Number(est.material_cost || 0),
    labor_cost: Number(est.labor_cost || 0),
    overhead_cost: Number(estimationData.overhead_cost || 0),
    tax: Number(est.tax || 0),
    discount: Number(est.discount || 0),
    subtotal: Number(
      estimationData.subtotal ||
        Number(est.material_cost || 0) +
          Number(est.labor_cost || 0) +
          Number(estimationData.overhead_cost || 0),
    ),
    grand_total: Number(est.grand_total || 0),
    notes: String(estimationData.notes || "").trim(),
    approved_by: est.approved_by || null,
    approved_at: est.approved_at || null,
    created_at: est.created_at || null,
    updated_at: est.updated_at || null,
    items: itemRows.map((row) => ({
      id: row.id,
      component_id: row.component_id || null,
      raw_material_id: row.raw_material_id || null,
      description: row.description || "",
      quantity: Number(row.quantity || 0),
      unit_cost: Number(row.unit_cost || 0),
      subtotal: Number(row.subtotal || 0),
    })),
  };
};

exports.acceptEstimation = async (req, res) => {
  const orderId = toPositiveInt(req.params.id, 0);

  if (!orderId) {
    return res.status(400).json({ message: "Invalid custom request ID." });
  }

  let conn;
  try {
    conn = await db.getConnection();
    await conn.beginTransaction();

    const [orders] = await conn.execute(
      `SELECT id, order_number, customer_id, blueprint_id, status, order_type
       FROM orders
       WHERE id = ?
         AND customer_id = ?
         AND order_type = 'blueprint'
       LIMIT 1`,
      [orderId, req.user.id],
    );

    if (!orders.length) {
      await conn.rollback();
      return res.status(404).json({ message: "Custom request not found." });
    }

    const order = orders[0];

    if (!order.blueprint_id) {
      await conn.rollback();
      return res.status(400).json({
        message: "No quotation is linked to this request yet.",
      });
    }

    const latestEstimation = await getLatestEstimationForBlueprint(
      conn,
      order.blueprint_id,
    );

    if (!latestEstimation) {
      await conn.rollback();
      return res.status(404).json({
        message: "No quotation found for this request.",
      });
    }

    if (!["sent", "approved"].includes(latestEstimation.status)) {
      await conn.rollback();
      return res.status(400).json({
        message: "Only sent quotations can be approved by the customer.",
      });
    }

    const quotedTotal = roundMoney(latestEstimation.grand_total || 0);
    const subtotal = roundMoney(latestEstimation.subtotal || 0);
    const tax = roundMoney(latestEstimation.tax || 0);
    const discount = roundMoney(latestEstimation.discount || 0);
    const downPaymentAmount = calcDownPaymentAmount(quotedTotal);

    if (!(quotedTotal > 0)) {
      await conn.rollback();
      return res.status(400).json({
        message: "Quotation total is invalid. Please contact the admin.",
      });
    }

    if (latestEstimation.status !== "approved") {
      await conn.execute(
        `UPDATE estimations
         SET status = 'approved',
             approved_by = ?,
             approved_at = NOW(),
             updated_at = NOW()
         WHERE id = ?`,
        [req.user.id, latestEstimation.id],
      );
    }

    await conn.execute(
      `UPDATE orders
       SET subtotal = ?,
           tax = ?,
           discount = ?,
           total = ?,
           down_payment = ?,
           status = 'confirmed',
           payment_status = 'unpaid',
           updated_at = NOW()
       WHERE id = ?`,
      [subtotal, tax, discount, quotedTotal, downPaymentAmount, order.id],
    );

    const [bpRows] = await conn.execute(
      `SELECT creator_id
       FROM blueprints
       WHERE id = ?
       LIMIT 1`,
      [order.blueprint_id],
    );

    const blueprint = bpRows[0] || null;

    await insertNotificationSafe(conn, blueprint?.creator_id, {
      type: "estimation_customer_approved",
      title: "Quotation Approved by Customer",
      message: `Customer approved the quotation for ${order.order_number}. Required 30% down payment: ₱${downPaymentAmount.toFixed(2)}.`,
    });

    await conn.commit();

    return res.json({
      message: "Quotation approved successfully.",
      quoted_total: quotedTotal,
      down_payment: downPaymentAmount,
    });
  } catch (err) {
    if (conn) {
      try {
        await conn.rollback();
      } catch {}
    }

    console.error("[customer.customorders ACCEPT ESTIMATION]", err);
    return res.status(500).json({
      message: "Failed to approve quotation.",
      error: err.message,
    });
  } finally {
    if (conn) conn.release();
  }
};

exports.requestEstimationRevision = async (req, res) => {
  const orderId = toPositiveInt(req.params.id, 0);
  const note = String(req.body?.note || "").trim();

  if (!orderId) {
    return res.status(400).json({ message: "Invalid custom request ID." });
  }

  let conn;
  try {
    conn = await db.getConnection();
    await conn.beginTransaction();

    const [orders] = await conn.execute(
      `SELECT id, order_number, customer_id, blueprint_id, status, order_type
       FROM orders
       WHERE id = ?
         AND customer_id = ?
         AND order_type = 'blueprint'
       LIMIT 1`,
      [orderId, req.user.id],
    );

    if (!orders.length) {
      await conn.rollback();
      return res.status(404).json({ message: "Custom request not found." });
    }

    const order = orders[0];

    if (!order.blueprint_id) {
      await conn.rollback();
      return res.status(400).json({
        message: "No quotation is linked to this request yet.",
      });
    }

    const latestEstimation = await getLatestEstimationForBlueprint(
      conn,
      order.blueprint_id,
    );

    if (!latestEstimation) {
      await conn.rollback();
      return res.status(404).json({
        message: "No quotation found for this request.",
      });
    }

    if (!["sent", "approved"].includes(latestEstimation.status)) {
      await conn.rollback();
      return res.status(400).json({
        message: "This quotation cannot be sent back for revision.",
      });
    }

    await conn.execute(
      `UPDATE estimations
       SET status = 'rejected',
           approved_by = NULL,
           approved_at = NULL,
           updated_at = NOW()
       WHERE id = ?`,
      [latestEstimation.id],
    );

    await conn.execute(
      `UPDATE blueprints
       SET stage = 'estimation'
       WHERE id = ?`,
      [order.blueprint_id],
    );

    const [bpRows] = await conn.execute(
      `SELECT creator_id
       FROM blueprints
       WHERE id = ?
       LIMIT 1`,
      [order.blueprint_id],
    );

    const blueprint = bpRows[0] || null;

    await insertNotificationSafe(conn, blueprint?.creator_id, {
      type: "estimation_revision_requested",
      title: "Customer Requested Quotation Revision",
      message: note
        ? `Customer requested a quotation revision for ${order.order_number}. Note: ${note}`
        : `Customer requested a quotation revision for ${order.order_number}.`,
    });

    await conn.commit();

    return res.json({
      message: "Revision request sent successfully.",
    });
  } catch (err) {
    if (conn) {
      try {
        await conn.rollback();
      } catch {}
    }
    console.error("[customer.customorders REQUEST REVISION]", err);
    return res.status(500).json({
      message: "Failed to request quotation revision.",
      error: err.message,
    });
  } finally {
    if (conn) conn.release();
  }
};

exports.rejectEstimation = async (req, res) => {
  const orderId = toPositiveInt(req.params.id, 0);
  const reason = String(req.body?.reason || "").trim();

  if (!orderId) {
    return res.status(400).json({ message: "Invalid custom request ID." });
  }

  let conn;
  try {
    conn = await db.getConnection();
    await conn.beginTransaction();

    const [orders] = await conn.execute(
      `SELECT id, order_number, customer_id, blueprint_id, status, order_type
       FROM orders
       WHERE id = ?
         AND customer_id = ?
         AND order_type = 'blueprint'
       LIMIT 1`,
      [orderId, req.user.id],
    );

    if (!orders.length) {
      await conn.rollback();
      return res.status(404).json({ message: "Custom request not found." });
    }

    const order = orders[0];

    if (!order.blueprint_id) {
      await conn.rollback();
      return res.status(400).json({
        message: "No quotation is linked to this request yet.",
      });
    }

    const latestEstimation = await getLatestEstimationForBlueprint(
      conn,
      order.blueprint_id,
    );

    if (!latestEstimation) {
      await conn.rollback();
      return res.status(404).json({
        message: "No quotation found for this request.",
      });
    }

    await conn.execute(
      `UPDATE estimations
       SET status = 'rejected',
           approved_by = NULL,
           approved_at = NULL,
           updated_at = NOW()
       WHERE id = ?`,
      [latestEstimation.id],
    );

    await conn.execute(
      `UPDATE orders
       SET status = 'cancelled',
           cancellation_reason = ?,
           cancelled_at = NOW()
       WHERE id = ?`,
      [reason || "Customer rejected the quotation.", order.id],
    );

    const [bpRows] = await conn.execute(
      `SELECT creator_id
       FROM blueprints
       WHERE id = ?
       LIMIT 1`,
      [order.blueprint_id],
    );

    const blueprint = bpRows[0] || null;

    await insertNotificationSafe(conn, blueprint?.creator_id, {
      type: "estimation_rejected",
      title: "Customer Rejected Quotation",
      message: reason
        ? `Customer rejected the quotation for ${order.order_number}. Reason: ${reason}`
        : `Customer rejected the quotation for ${order.order_number}.`,
    });

    await conn.commit();

    return res.json({
      message: "Quotation rejected successfully.",
    });
  } catch (err) {
    if (conn) {
      try {
        await conn.rollback();
      } catch {}
    }
    console.error("[customer.customorders REJECT ESTIMATION]", err);
    return res.status(500).json({
      message: "Failed to reject quotation.",
      error: err.message,
    });
  } finally {
    if (conn) conn.release();
  }
};

exports.submitDownPayment = async (req, res) => {
  const orderId = toPositiveInt(req.params.id, 0);
  const orderPaymentMethod = toAllowedBlueprintPaymentMethod(
    req.body?.payment_method,
  );
  const txPaymentMethod = toPaymentTransactionMethod(req.body?.payment_method);
  const submittedAmount = roundMoney(req.body?.amount || 0);
  const proofUrl = req.file ? `/uploads/proofs/${req.file.filename}` : null;

  if (!orderId) {
    return res.status(400).json({ message: "Invalid custom request ID." });
  }

  if (!orderPaymentMethod || !txPaymentMethod) {
    return res.status(400).json({
      message: "Choose a valid payment method for the 30% down payment.",
    });
  }

  if (!proofUrl) {
    return res.status(400).json({
      message: "Upload your proof of payment for the 30% down payment.",
    });
  }

  if (!(submittedAmount > 0)) {
    return res.status(400).json({
      message: "Enter a valid payment amount for this submission.",
    });
  }

  let conn;
  try {
    conn = await db.getConnection();
    await conn.beginTransaction();

    const [orders] = await conn.execute(
      `SELECT
          id,
          order_number,
          customer_id,
          blueprint_id,
          order_type,
          status,
          total,
          down_payment,
          payment_status
       FROM orders
       WHERE id = ?
         AND customer_id = ?
         AND order_type = 'blueprint'
       LIMIT 1`,
      [orderId, req.user.id],
    );

    if (!orders.length) {
      await conn.rollback();
      return res.status(404).json({ message: "Custom request not found." });
    }

    const order = orders[0];
    const normalizedStatus = normalize(order.status);

    if (!["confirmed", "contract_released"].includes(normalizedStatus)) {
      await conn.rollback();
      return res.status(400).json({
        message:
          "You can submit the 30% down payment only after approving the quotation.",
      });
    }

    const latestEstimation = await getLatestEstimationForBlueprint(
      conn,
      order.blueprint_id,
    );

    const quotedTotal = roundMoney(
      latestEstimation?.grand_total || order.total || 0,
    );

    const requiredDownPayment = roundMoney(
      order.down_payment ||
        (quotedTotal > 0 ? calcDownPaymentAmount(quotedTotal) : 0),
    );

    const [paymentRows] = await conn.execute(
      `SELECT id, amount, status
      FROM payment_transactions
      WHERE order_id = ?
      ORDER BY id DESC`,
      [order.id],
    );

    const totalVerifiedPayments = roundMoney(
      paymentRows
        .filter((row) => normalize(row.status) === "verified")
        .reduce((sum, row) => sum + Number(row.amount || 0), 0),
    );

    if (totalVerifiedPayments + 0.0001 >= requiredDownPayment) {
      await conn.rollback();
      return res.status(400).json({
        message: "Your 30% down payment is already verified.",
      });
    }

    const remainingVerifiedBalance = roundMoney(
      Math.max(requiredDownPayment - totalVerifiedPayments, 0),
    );

    if (submittedAmount - remainingVerifiedBalance > 0.0001) {
      await conn.rollback();
      return res.status(400).json({
        message: `Submitted amount cannot exceed the remaining required verified balance of ₱${remainingVerifiedBalance.toFixed(2)}.`,
      });
    }

    await conn.execute(
      `INSERT INTO payment_transactions
        (order_id, amount, payment_method, proof_url, status, notes)
      VALUES (?, ?, ?, ?, 'pending', ?)`,
      [
        order.id,
        submittedAmount,
        txPaymentMethod,
        proofUrl,
        "Customer submitted down payment proof for custom blueprint order.",
      ],
    );

    await conn.execute(
      `UPDATE orders
       SET payment_method = ?,
           payment_proof = ?,
           payment_status = 'partial',
           updated_at = NOW()
       WHERE id = ?`,
      [orderPaymentMethod, proofUrl, order.id],
    );

    const [bpRows] = await conn.execute(
      `SELECT creator_id
       FROM blueprints
       WHERE id = ?
       LIMIT 1`,
      [order.blueprint_id],
    );

    const blueprint = bpRows[0] || null;

    await insertNotificationSafe(conn, blueprint?.creator_id, {
      type: "blueprint_down_payment_submitted",
      title: "30% Down Payment Submitted",
      message: `Customer submitted the 30% down payment for ${order.order_number}. Please verify the payment proof.`,
    });

    await conn.commit();

    return res.json({
      message: "Down payment proof submitted successfully.",
      submitted_amount: submittedAmount,
      remaining_required: remainingVerifiedBalance,
      proof_url: proofUrl,
    });
  } catch (err) {
    if (conn) {
      try {
        await conn.rollback();
      } catch {}
    }

    console.error("[customer.customorders SUBMIT DOWN PAYMENT]", err);
    return res.status(500).json({
      message: "Failed to submit 30% down payment.",
      error: err.message,
    });
  } finally {
    if (conn) conn.release();
  }
};

exports.postCustomOrderMessage = async (req, res) => {
  const orderId = toPositiveInt(req.params.id, 0);
  const message = String(req.body?.message || "").trim();
  const files = Array.isArray(req.files) ? req.files : [];

  if (!orderId) {
    return res.status(400).json({ message: "Invalid custom request ID." });
  }

  if (!message && !files.length) {
    return res.status(400).json({
      message: "Write a message or upload at least one attachment.",
    });
  }

  let conn;
  try {
    conn = await db.getConnection();
    await conn.beginTransaction();

    const [orders] = await conn.execute(
      `SELECT id, order_number, customer_id, blueprint_id
       FROM orders
       WHERE id = ?
         AND customer_id = ?
         AND order_type = 'blueprint'
       LIMIT 1`,
      [orderId, req.user.id],
    );

    if (!orders.length) {
      await conn.rollback();
      return res.status(404).json({ message: "Custom request not found." });
    }

    const order = orders[0];

    const messageId = await insertCustomOrderMessage(conn, {
      orderId: order.id,
      orderItemId: null,
      senderId: req.user.id,
      senderRole: "customer",
      message: message || "Uploaded attachment.",
    });

    for (const file of files) {
      await insertCustomOrderAttachment(conn, {
        orderId: order.id,
        orderItemId: null,
        messageId,
        uploadedBy: req.user.id,
        fileUrl: `/uploads/custom-request-assets/${file.filename}`,
        fileName: slugifyFilename(file.originalname || file.filename),
        mimeType: toTrimmedStringOrNull(file.mimetype),
        fileSize: Number(file.size || 0) || null,
        attachmentType: "chat_attachment",
      });
    }

    const [bpRows] = await conn.execute(
      `SELECT creator_id
       FROM blueprints
       WHERE id = ?
       LIMIT 1`,
      [order.blueprint_id],
    );

    const blueprint = bpRows[0] || null;

    await insertNotificationSafe(conn, blueprint?.creator_id, {
      type: "custom_request_new_message",
      title: "New Customer Discussion Message",
      message: `Customer sent a new discussion message for ${order.order_number}.`,
    });

    await conn.commit();

    return res.json({
      message: "Discussion message sent successfully.",
    });
  } catch (err) {
    if (conn) {
      try {
        await conn.rollback();
      } catch {}
    }

    console.error("[customer.customorders POST MESSAGE]", err);
    return res.status(500).json({
      message: "Failed to send discussion message.",
      error: err.message,
    });
  } finally {
    if (conn) conn.release();
  }
};
