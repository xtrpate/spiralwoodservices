const db = require("../../config/db");
const fs = require("fs");
const path = require("path");
const { authenticate, requireCustomer } = require("../../middleware/auth");
const { signUploadPath } = require("../../utils/signedUrl");
const { verifyBufferSignature } = require("../../utils/verifyFileSignature");
const {
  resolveLifecycleByOrder,
} = require("../../services/blueprintLifecycleService");

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

// Thrown when a reference photo's declared image MIME type doesn't match
// its actual decoded byte content — i.e. a spoofed data URL. Kept as a
// distinct error type so the caller can reject the whole order with a
// clear 400 instead of this bubbling up as a generic 500.
class ReferencePhotoValidationError extends Error {}

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

  // Decode first, then verify the REAL bytes match the declared image
  // type before anything touches disk. Buffer.from never throws on
  // malformed base64 — a corrupted/truncated string just decodes to a
  // shorter or garbled buffer, which safely fails the signature check
  // below instead of crashing the server.
  const fileBuffer = Buffer.from(base64Body, "base64");

  if (!verifyBufferSignature(fileBuffer, ext)) {
    throw new ReferencePhotoValidationError(
      "One of the uploaded reference photos does not match its declared image type.",
    );
  }

  const filename = `custom_ref_${Date.now()}_${Math.random()
    .toString(36)
    .slice(2, 10)}${ext}`;

  const absolutePath = path.join(customRequestAssetsDir, filename);
  await fs.promises.writeFile(absolutePath, fileBuffer);

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
        let saved;
        try {
          saved = await saveBase64ReferencePhoto(photo);
        } catch (photoErr) {
          if (photoErr instanceof ReferencePhotoValidationError) {
            await conn.rollback();
            return res.status(400).json({ message: photoErr.message });
          }
          throw photoErr;
        }

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
  const orderId = parseStrictPositiveInt(req.params.id);

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

    // Resolved through the lifecycle service — never selects an
    // estimation by blueprint_id alone, and never falls back to
    // order.total (which may itself be corrupted) when the lifecycle is
    // blocked. No admin notification is created merely because the
    // customer opened this read endpoint.
    const lifecycle = await resolveLifecycleByOrder(conn, { orderId });

    let latestEstimation = null;
    let quotationAvailable = false;
    let quotationActionBlocked = false;
    let quotationIntegrityWarning = false;
    let quotationMessage = null;
    let quotedTotal = 0;

    if (lifecycle.status === "OK" && lifecycle.estimation) {
      const normalizedEstimation = await normalizeLifecycleEstimation(
        conn,
        lifecycle.estimation,
      );

      // A lifecycle-valid estimation is not automatically customer-
      // actionable. Draft (still being built by admin) and rejected
      // (already sent back for revision) are normal, non-corruption
      // states — they must never be exposed as the active quotation.
      if (["sent", "approved"].includes(normalizedEstimation.status)) {
        latestEstimation = normalizedEstimation;
        quotedTotal = roundMoney(normalizedEstimation.grand_total || 0);
        quotationAvailable = true;
      } else if (normalizedEstimation.status === "draft") {
        quotationMessage = "Your quotation is being prepared by our team.";
      } else if (normalizedEstimation.status === "rejected") {
        quotationMessage = "Your quotation is being revised by our team.";
      } else {
        // Any other/unexpected status value — same safe non-corruption
        // default as NO_ESTIMATION, never exposed.
        quotationMessage = "Your quotation is not available yet.";
      }
    } else if (
      lifecycle.reason === "NO_ESTIMATION" ||
      lifecycle.reason === "NO_BLUEPRINT_LINKED"
    ) {
      // Normal, non-corruption state — nothing has been saved yet.
      quotationMessage = "Your quotation is not available yet.";
    } else {
      // STALE_ESTIMATION, MULTIPLE_ORDER_OWNERS, BLUEPRINT_NOT_FOUND, or
      // any other integrity conflict. Never expose stale_candidate,
      // conflicting_order_ids, or the internal reason code to the
      // customer — a generic, calm message only.
      quotationActionBlocked = true;
      quotationIntegrityWarning = true;
      quotationMessage =
        "Your quotation is being reviewed by our team. Please contact support if you need assistance.";
    }

    const discussionData = await getCustomOrderDiscussion(conn, orderId);

    const normalizedItemsWithPhotos = normalizedItems.map((item) => ({
      ...item,
      reference_photos: discussionData.attachments.filter(
        (attachment) =>
          Number(attachment.order_item_id || 0) === Number(item.id) &&
          attachment.attachment_type === "reference_photo",
      ),
    }));

    const downPaymentDue = roundMoney(
      quotationAvailable && quotedTotal > 0
        ? calcDownPaymentAmount(quotedTotal)
        : 0,
    );

    const hasVerifiedDownPayment =
      downPaymentDue > 0 && totalVerifiedPayments + 0.0001 >= downPaymentDue;

    const balanceDue = roundMoney(
      Math.max(quotedTotal - totalVerifiedPayments, 0),
    );

    // ── Payment eligibility (UI guidance only — the write endpoints
    // above remain authoritative and re-derive every one of these facts
    // themselves under lock). Never derived from order.payment_status.
    const canonicalOrderStatus = normalize(order.status);
    const hasRealContract = Boolean(lifecycle.contract);
    const blueprintArchivedForPayment = lifecycle.blueprint
      ? isBlueprintArchived(lifecycle.blueprint)
      : false;
    const estimationApprovedForPayment = latestEstimation?.status === "approved";
    const rawOrderTotal = Number(order.total || 0);
    const totalsValidForPayment =
      quotationAvailable &&
      quotedTotal > 0 &&
      rawOrderTotal > 0 &&
      Math.abs(rawOrderTotal - quotedTotal) <= 0.01;
    const hasPendingPayment = normalizedPayments.some(
      (payment) => payment.status === "pending",
    );
    const isFullyPaid =
      quotedTotal > 0 && totalVerifiedPayments + 0.0001 >= quotedTotal;

    const REMAINING_BALANCE_STAGES = new Set([
      "contract_released",
      "production",
      "shipping",
      "delivered",
    ]);

    let canSubmitInitialDownPayment = false;
    let canSubmitRemainingBalance = false;
    let paymentStage = "unavailable";
    let paymentActionMessage =
      "Please contact support if you need assistance with payment.";

    if (quotationActionBlocked || quotationIntegrityWarning) {
      paymentStage = "unavailable";
      paymentActionMessage =
        "Your payment options are temporarily unavailable while our team reviews this order. Please contact support if you need assistance.";
    } else if (!quotationAvailable) {
      paymentStage = "unavailable";
      paymentActionMessage = quotationMessage || "Payment is not available yet.";
    } else if (canonicalOrderStatus === "cancelled") {
      paymentStage = "unavailable";
      paymentActionMessage =
        "This order is closed and no further payment action is available.";
    } else if (canonicalOrderStatus === "completed") {
      if (isFullyPaid) {
        paymentStage = "fully_paid";
        paymentActionMessage = "Your full payment has been verified.";
      } else {
        paymentStage = "unavailable";
        paymentActionMessage =
          "This order is closed and no further payment action is available.";
      }
    } else if (hasPendingPayment) {
      paymentStage = "pending_review";
      paymentActionMessage = "Your payment proof is awaiting admin verification.";
    } else if (isFullyPaid) {
      paymentStage = "fully_paid";
      paymentActionMessage = "Your full payment has been verified.";
    } else if (!totalsValidForPayment || blueprintArchivedForPayment) {
      paymentStage = "unavailable";
      paymentActionMessage =
        "Please contact support if you need assistance with payment.";
    } else if (!estimationApprovedForPayment) {
      paymentStage = "unavailable";
      paymentActionMessage =
        "Approve your quotation first before submitting a payment.";
    } else if (canonicalOrderStatus === "confirmed") {
      if (hasRealContract) {
        paymentStage = "unavailable";
        paymentActionMessage =
          "Please contact support if you need assistance with payment.";
      } else if (!hasVerifiedDownPayment) {
        canSubmitInitialDownPayment = true;
        paymentStage = "initial";
        paymentActionMessage = "Submit your 30% down payment proof to proceed.";
      } else {
        paymentStage = "awaiting_contract";
        paymentActionMessage =
          "Your initial payment is verified. We're preparing your contract next.";
      }
    } else if (REMAINING_BALANCE_STAGES.has(canonicalOrderStatus)) {
      if (!hasRealContract || !hasVerifiedDownPayment) {
        paymentStage = "unavailable";
        paymentActionMessage =
          "Please contact support if you need assistance with payment.";
      } else if (balanceDue > 0) {
        canSubmitRemainingBalance = true;
        paymentStage = "remaining_balance";
        paymentActionMessage = "Submit your remaining balance payment proof.";
      } else {
        paymentStage = "fully_paid";
        paymentActionMessage = "Your full payment has been verified.";
      }
    } else {
      paymentStage = "unavailable";
      paymentActionMessage =
        "Please contact support if you need assistance with payment.";
    }

    return res.json({
      ...order,
      items: normalizedItemsWithPhotos,
      latest_estimation: latestEstimation,
      quotation_available: quotationAvailable,
      quotation_action_blocked: quotationActionBlocked,
      quotation_integrity_warning: quotationIntegrityWarning,
      quotation_message: quotationMessage,
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
        can_submit_initial_down_payment: canSubmitInitialDownPayment,
        can_submit_remaining_balance: canSubmitRemainingBalance,
        payment_stage: paymentStage,
        payment_action_message: paymentActionMessage,
      },
      total_items: normalizedItemsWithPhotos.length,
      total_units: normalizedItemsWithPhotos.reduce(
        (sum, item) => sum + Math.max(1, Number(item.quantity || 1)),
        0,
      ),
    });
  } catch (err) {
    console.error("[customer.customorders GET ONE]", err);
    return res.status(500).json({ message: "Server error." });
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

// Safely deletes an uploaded file from disk when the request that
// accepted it does not end up successfully committing (validation
// failure, lifecycle conflict, rolled-back transaction, or any other
// early exit). Never throws, never exposes the filesystem path or the
// underlying error to the customer — logged server-side only. ENOENT
// (already gone) is not an error worth logging.
const cleanupUploadedFile = async (filePath) => {
  if (!filePath) return;
  try {
    await fs.promises.unlink(filePath);
  } catch (err) {
    if (err && err.code !== "ENOENT") {
      console.error(
        "[customer.customorders] Failed to remove orphaned upload:",
        err.message || err,
      );
    }
  }
};
// non-numeric strings (unlike the pre-existing toPositiveInt above, which
// silently truncates a value like "5.5" to 5 via parseInt). Used only by
// the 5 functions hardened in this pass; toPositiveInt itself is left
// untouched since other, unrelated functions in this file still use it.
const parseStrictPositiveInt = (value) => {
  if (value === undefined || value === null) return null;
  const str = String(value).trim();
  if (!/^\d+$/.test(str)) return null;
  const num = Number(str);
  return Number.isSafeInteger(num) && num > 0 ? num : null;
};

// payment_status is derived ONLY from verified payment_transactions rows
// — never hard-reset to a fixed value, and never based on a stored
// column that could itself be stale.
const deriveBlueprintPaymentStatus = (verifiedTotal, total) => {
  if (Number(total) > 0 && Number(verifiedTotal) + 0.0001 >= Number(total)) {
    return "paid";
  }
  if (Number(verifiedTotal) > 0) return "partial";
  return "unpaid";
};

const isBlueprintArchived = (blueprint) =>
  Number(blueprint?.is_deleted) === 1 ||
  normalize(blueprint?.stage) === "archived";

// Single, safe, generic response for any lifecycle integrity conflict —
// never exposes stale estimation ids, conflicting order ids, internal
// reason codes, SQL messages, or stack traces to the customer.
const sendLifecycleConflict = (res) =>
  res.status(409).json({
    message:
      "Your quotation is being reviewed by our team. No changes were made.",
  });

// Replaces getLatestEstimationForBlueprint. Never queries the current
// estimation using blueprint_id, never falls back to stale_candidate, and
// never chooses an estimation by latest created_at/version on its own —
// it only normalizes an estimation object the caller has ALREADY resolved
// through resolveLifecycleByOrder (i.e. lifecycle.estimation), and loads
// that estimation's line items strictly by its own primary key.
const normalizeLifecycleEstimation = async (conn, estimation) => {
  if (!estimation) return null;

  const estimationData = parseJSON(estimation.estimation_data, {}) || {};

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
    [estimation.id],
  );

  return {
    id: estimation.id,
    blueprint_id: estimation.blueprint_id,
    version: estimation.version,
    status: normalize(estimation.status),
    material_cost: Number(estimation.material_cost || 0),
    labor_cost: Number(estimation.labor_cost || 0),
    overhead_cost: Number(estimationData.overhead_cost || 0),
    tax: Number(estimation.tax || 0),
    discount: Number(estimation.discount || 0),
    subtotal: Number(
      estimationData.subtotal ||
        Number(estimation.material_cost || 0) +
          Number(estimation.labor_cost || 0) +
          Number(estimationData.overhead_cost || 0),
    ),
    grand_total: Number(estimation.grand_total || 0),
    notes: String(estimationData.notes || "").trim(),
    approved_by: estimation.approved_by || null,
    approved_at: estimation.approved_at || null,
    created_at: estimation.created_at || null,
    updated_at: estimation.updated_at || null,
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
  const orderId = parseStrictPositiveInt(req.params.id);

  if (!orderId) {
    return res.status(400).json({ message: "Invalid custom request ID." });
  }

  let conn = null;
  let transactionActive = false;
  let connectionReusable = true;

  try {
    conn = await db.getConnection();
    await conn.beginTransaction();
    transactionActive = true;

    // Customer ownership confirmed and locked FIRST, on a query fully
    // scoped by customer_id — never exposes or locks another customer's
    // order, regardless of what resolveLifecycleByOrder does internally.
    const [ownedOrders] = await conn.execute(
      `SELECT id
       FROM orders
       WHERE id = ?
         AND customer_id = ?
         AND order_type = 'blueprint'
       LIMIT 1
       FOR UPDATE`,
      [orderId, req.user.id],
    );

    if (!ownedOrders.length) {
      await conn.rollback();
      transactionActive = false;
      return res.status(404).json({ message: "Custom request not found." });
    }

    const lifecycle = await resolveLifecycleByOrder(conn, {
      orderId,
      lockOrder: true,
      lockBlueprint: true,
    });

    if (
      lifecycle.status !== "OK" ||
      !lifecycle.order ||
      !lifecycle.blueprint ||
      !lifecycle.estimation
    ) {
      await conn.rollback();
      transactionActive = false;
      return sendLifecycleConflict(res);
    }

    const order = lifecycle.order;
    const blueprint = lifecycle.blueprint;
    const estimation = lifecycle.estimation;

    if (normalize(order.order_type) !== "blueprint") {
      await conn.rollback();
      transactionActive = false;
      return sendLifecycleConflict(res);
    }

    if (isBlueprintArchived(blueprint)) {
      await conn.rollback();
      transactionActive = false;
      return sendLifecycleConflict(res);
    }

    if (normalize(order.status) !== "confirmed") {
      await conn.rollback();
      transactionActive = false;
      return res.status(400).json({
        message: `Order must be confirmed to approve a quotation (current status: "${order.status}").`,
      });
    }

    if (normalize(estimation.status) !== "sent") {
      await conn.rollback();
      transactionActive = false;
      return res.status(400).json({
        message: "Only a sent quotation can be approved.",
      });
    }

    if (lifecycle.contract) {
      await conn.rollback();
      transactionActive = false;
      return sendLifecycleConflict(res);
    }

    // The estimations table has no subtotal column — estimation.subtotal
    // on the raw resolver row is always undefined. Reuse the same
    // parsing logic as normalizeLifecycleEstimation (estimation_data.
    // subtotal, falling back to material_cost + labor_cost + overhead)
    // instead of duplicating it, so orders.subtotal is never silently
    // written as 0 just because the raw column doesn't exist.
    const normalizedEstimation = await normalizeLifecycleEstimation(
      conn,
      estimation,
    );

    const quotedTotal = roundMoney(normalizedEstimation.grand_total || 0);
    const subtotal = roundMoney(normalizedEstimation.subtotal || 0);
    const tax = roundMoney(normalizedEstimation.tax || 0);
    const discount = roundMoney(normalizedEstimation.discount || 0);
    const downPaymentAmount = calcDownPaymentAmount(quotedTotal);

    if (!(quotedTotal > 0)) {
      await conn.rollback();
      transactionActive = false;
      return res.status(400).json({
        message: "Quotation total is invalid. Please contact the admin.",
      });
    }

    // Guarded estimation update — status must still read 'sent' at write
    // time, not just at the moment it was resolved above.
    const [estUpdateResult] = await conn.execute(
      `UPDATE estimations
       SET status = 'approved',
           approved_by = ?,
           approved_at = NOW(),
           updated_at = NOW()
       WHERE id = ?
         AND status = 'sent'`,
      [req.user.id, estimation.id],
    );

    if (estUpdateResult.affectedRows === 0) {
      await conn.rollback();
      transactionActive = false;
      return res.status(409).json({
        message:
          "This quotation was already updated. Please refresh and try again.",
        integrity_reason: "ESTIMATION_STATE_CHANGED",
      });
    }

    // payment_status derived from verified payment_transactions only —
    // never hard-reset to a fixed value.
    const [paymentRows] = await conn.execute(
      `SELECT status, amount FROM payment_transactions WHERE order_id = ?`,
      [order.id],
    );
    const verifiedTotal = roundMoney(
      paymentRows
        .filter((row) => normalize(row.status) === "verified")
        .reduce((sum, row) => sum + Number(row.amount || 0), 0),
    );
    const derivedPaymentStatus = deriveBlueprintPaymentStatus(
      verifiedTotal,
      quotedTotal,
    );

    // Guarded order update — restricted to the one canonical, locked,
    // customer-owned order.
    const [orderUpdateResult] = await conn.execute(
      `UPDATE orders
       SET subtotal = ?,
           tax = ?,
           discount = ?,
           total = ?,
           down_payment = ?,
           status = 'confirmed',
           payment_status = ?,
           updated_at = NOW()
       WHERE id = ?
         AND customer_id = ?
         AND order_type = 'blueprint'
         AND status = 'confirmed'`,
      [
        subtotal,
        tax,
        discount,
        quotedTotal,
        downPaymentAmount,
        derivedPaymentStatus,
        order.id,
        req.user.id,
      ],
    );

    if (orderUpdateResult.affectedRows === 0) {
      await conn.rollback();
      transactionActive = false;
      return res.status(409).json({
        message: "Order status changed before this could be saved. Please refresh and try again.",
        integrity_reason: "ORDER_STATE_CHANGED",
      });
    }

    const [[creatorRow]] = await conn.execute(
      `SELECT creator_id FROM blueprints WHERE id = ? LIMIT 1`,
      [blueprint.id],
    );

    await insertNotificationSafe(conn, creatorRow?.creator_id || null, {
      type: "estimation_customer_approved",
      title: "Quotation Approved by Customer",
      message: `Customer approved the quotation for ${order.order_number}. Required 30% down payment: ₱${downPaymentAmount.toFixed(2)}.`,
    });

    await conn.commit();
    transactionActive = false;

    return res.json({
      message: "Quotation approved successfully.",
      quoted_total: quotedTotal,
      down_payment: downPaymentAmount,
    });
  } catch (err) {
    if (conn && transactionActive) {
      try {
        await conn.rollback();
        transactionActive = false;
      } catch (rollbackErr) {
        console.error(
          "[customer.customorders ACCEPT ESTIMATION] rollback failed:",
          rollbackErr.message || rollbackErr,
        );
        connectionReusable = false;
      }
    }
    console.error("[customer.customorders ACCEPT ESTIMATION]", err);
    return res.status(500).json({ message: "Failed to approve quotation." });
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

exports.requestEstimationRevision = async (req, res) => {
  const orderId = parseStrictPositiveInt(req.params.id);
  const note = String(req.body?.note || "").trim();

  if (!orderId) {
    return res.status(400).json({ message: "Invalid custom request ID." });
  }

  let conn = null;
  let transactionActive = false;
  let connectionReusable = true;

  try {
    conn = await db.getConnection();
    await conn.beginTransaction();
    transactionActive = true;

    const [ownedOrders] = await conn.execute(
      `SELECT id
       FROM orders
       WHERE id = ?
         AND customer_id = ?
         AND order_type = 'blueprint'
       LIMIT 1
       FOR UPDATE`,
      [orderId, req.user.id],
    );

    if (!ownedOrders.length) {
      await conn.rollback();
      transactionActive = false;
      return res.status(404).json({ message: "Custom request not found." });
    }

    const lifecycle = await resolveLifecycleByOrder(conn, {
      orderId,
      lockOrder: true,
      lockBlueprint: true,
    });

    if (
      lifecycle.status !== "OK" ||
      !lifecycle.order ||
      !lifecycle.blueprint ||
      !lifecycle.estimation
    ) {
      await conn.rollback();
      transactionActive = false;
      return sendLifecycleConflict(res);
    }

    const order = lifecycle.order;
    const blueprint = lifecycle.blueprint;
    const estimation = lifecycle.estimation;

    if (normalize(order.order_type) !== "blueprint") {
      await conn.rollback();
      transactionActive = false;
      return sendLifecycleConflict(res);
    }

    if (isBlueprintArchived(blueprint)) {
      await conn.rollback();
      transactionActive = false;
      return sendLifecycleConflict(res);
    }

    if (normalize(order.status) !== "confirmed") {
      await conn.rollback();
      transactionActive = false;
      return res.status(400).json({
        message: `Order must be confirmed to request a revision (current status: "${order.status}").`,
      });
    }

    if (normalize(estimation.status) !== "sent") {
      await conn.rollback();
      transactionActive = false;
      return res.status(400).json({
        message: "This quotation cannot be sent back for revision.",
      });
    }

    if (lifecycle.contract) {
      await conn.rollback();
      transactionActive = false;
      return sendLifecycleConflict(res);
    }

    if (lifecycle.has_pending_payment_transaction) {
      await conn.rollback();
      transactionActive = false;
      return res.status(400).json({
        message:
          "A payment proof is already under review for this order. Please wait for it to be resolved before requesting a revision.",
      });
    }

    if (Number(lifecycle.verified_payment_total || 0) > 0) {
      await conn.rollback();
      transactionActive = false;
      return res.status(400).json({
        message:
          "This order already has a verified payment, so the quotation can no longer be sent back for revision.",
      });
    }

    const [estUpdateResult] = await conn.execute(
      `UPDATE estimations
       SET status = 'rejected',
           approved_by = NULL,
           approved_at = NULL,
           updated_at = NOW()
       WHERE id = ?
         AND status = 'sent'`,
      [estimation.id],
    );

    if (estUpdateResult.affectedRows === 0) {
      await conn.rollback();
      transactionActive = false;
      return res.status(409).json({
        message:
          "This quotation was already updated. Please refresh and try again.",
        integrity_reason: "ESTIMATION_STATE_CHANGED",
      });
    }

    await conn.execute(
      `UPDATE blueprints
       SET stage = 'estimation'
       WHERE id = ?`,
      [blueprint.id],
    );

    const [[creatorRow]] = await conn.execute(
      `SELECT creator_id FROM blueprints WHERE id = ? LIMIT 1`,
      [blueprint.id],
    );

    await insertNotificationSafe(conn, creatorRow?.creator_id || null, {
      type: "estimation_revision_requested",
      title: "Customer Requested Quotation Revision",
      message: note
        ? `Customer requested a quotation revision for ${order.order_number}. Note: ${note}`
        : `Customer requested a quotation revision for ${order.order_number}.`,
    });

    await conn.commit();
    transactionActive = false;

    return res.json({
      message: "Revision request sent successfully.",
    });
  } catch (err) {
    if (conn && transactionActive) {
      try {
        await conn.rollback();
        transactionActive = false;
      } catch (rollbackErr) {
        console.error(
          "[customer.customorders REQUEST REVISION] rollback failed:",
          rollbackErr.message || rollbackErr,
        );
        connectionReusable = false;
      }
    }
    console.error("[customer.customorders REQUEST REVISION]", err);
    return res
      .status(500)
      .json({ message: "Failed to request quotation revision." });
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

exports.rejectEstimation = async (req, res) => {
  const orderId = parseStrictPositiveInt(req.params.id);
  const reason = String(req.body?.reason || "").trim();

  if (!orderId) {
    return res.status(400).json({ message: "Invalid custom request ID." });
  }

  let conn = null;
  let transactionActive = false;
  let connectionReusable = true;

  try {
    conn = await db.getConnection();
    await conn.beginTransaction();
    transactionActive = true;

    const [ownedOrders] = await conn.execute(
      `SELECT id
       FROM orders
       WHERE id = ?
         AND customer_id = ?
         AND order_type = 'blueprint'
       LIMIT 1
       FOR UPDATE`,
      [orderId, req.user.id],
    );

    if (!ownedOrders.length) {
      await conn.rollback();
      transactionActive = false;
      return res.status(404).json({ message: "Custom request not found." });
    }

    const lifecycle = await resolveLifecycleByOrder(conn, {
      orderId,
      lockOrder: true,
      lockBlueprint: true,
    });

    if (
      lifecycle.status !== "OK" ||
      !lifecycle.order ||
      !lifecycle.blueprint ||
      !lifecycle.estimation
    ) {
      await conn.rollback();
      transactionActive = false;
      return sendLifecycleConflict(res);
    }

    const order = lifecycle.order;
    const blueprint = lifecycle.blueprint;
    const estimation = lifecycle.estimation;

    if (normalize(order.order_type) !== "blueprint") {
      await conn.rollback();
      transactionActive = false;
      return sendLifecycleConflict(res);
    }

    if (isBlueprintArchived(blueprint)) {
      await conn.rollback();
      transactionActive = false;
      return sendLifecycleConflict(res);
    }

    if (normalize(order.status) !== "confirmed") {
      await conn.rollback();
      transactionActive = false;
      return res.status(400).json({
        message: `Order must be confirmed to reject a quotation (current status: "${order.status}").`,
      });
    }

    if (normalize(estimation.status) !== "sent") {
      await conn.rollback();
      transactionActive = false;
      return res.status(400).json({
        message: "This quotation cannot be rejected in its current state.",
      });
    }

    // Payment or contract activity already exists — direct the customer
    // to the normal cancellation/refund process instead of letting this
    // endpoint cancel the order directly.
    if (
      lifecycle.contract ||
      lifecycle.has_pending_payment_transaction ||
      Number(lifecycle.verified_payment_total || 0) > 0
    ) {
      await conn.rollback();
      transactionActive = false;
      return res.status(400).json({
        message:
          "This order already has payment or contract activity. Please use the standard order cancellation/refund request instead of rejecting the quotation directly.",
      });
    }

    const [estUpdateResult] = await conn.execute(
      `UPDATE estimations
       SET status = 'rejected',
           approved_by = NULL,
           approved_at = NULL,
           updated_at = NOW()
       WHERE id = ?
         AND status = 'sent'`,
      [estimation.id],
    );

    if (estUpdateResult.affectedRows === 0) {
      await conn.rollback();
      transactionActive = false;
      return res.status(409).json({
        message:
          "This quotation was already updated. Please refresh and try again.",
        integrity_reason: "ESTIMATION_STATE_CHANGED",
      });
    }

    const [orderUpdateResult] = await conn.execute(
      `UPDATE orders
       SET status = 'cancelled',
           cancellation_reason = ?,
           cancelled_at = NOW()
       WHERE id = ?
         AND customer_id = ?
         AND order_type = 'blueprint'
         AND status = 'confirmed'`,
      [
        reason || "Customer rejected the quotation.",
        order.id,
        req.user.id,
      ],
    );

    if (orderUpdateResult.affectedRows === 0) {
      await conn.rollback();
      transactionActive = false;
      return res.status(409).json({
        message:
          "Order status changed before this could be saved. Please refresh and try again.",
        integrity_reason: "ORDER_STATE_CHANGED",
      });
    }

    const [[creatorRow]] = await conn.execute(
      `SELECT creator_id FROM blueprints WHERE id = ? LIMIT 1`,
      [blueprint.id],
    );

    await insertNotificationSafe(conn, creatorRow?.creator_id || null, {
      type: "estimation_rejected",
      title: "Customer Rejected Quotation",
      message: reason
        ? `Customer rejected the quotation for ${order.order_number}. Reason: ${reason}`
        : `Customer rejected the quotation for ${order.order_number}.`,
    });

    await conn.commit();
    transactionActive = false;

    return res.json({
      message: "Quotation rejected successfully.",
    });
  } catch (err) {
    if (conn && transactionActive) {
      try {
        await conn.rollback();
        transactionActive = false;
      } catch (rollbackErr) {
        console.error(
          "[customer.customorders REJECT ESTIMATION] rollback failed:",
          rollbackErr.message || rollbackErr,
        );
        connectionReusable = false;
      }
    }
    console.error("[customer.customorders REJECT ESTIMATION]", err);
    return res.status(500).json({ message: "Failed to reject quotation." });
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

exports.submitDownPayment = async (req, res) => {
  const orderId = parseStrictPositiveInt(req.params.id);
  const orderPaymentMethod = toAllowedBlueprintPaymentMethod(
    req.body?.payment_method,
  );
  const txPaymentMethod = toPaymentTransactionMethod(req.body?.payment_method);
  const submittedAmount = roundMoney(req.body?.amount || 0);
  const proofUrl = req.file ? `/uploads/proofs/${req.file.filename}` : null;

  let conn = null;
  let transactionActive = false;
  let connectionReusable = true;
  // Set true only once the payment transaction insert and the guarded
  // order update have both committed successfully. Everything else —
  // validation failures, lifecycle conflicts, rollbacks, connection
  // failures — leaves this false, and the finally block below removes
  // the uploaded file from disk in every one of those cases.
  let proofCommitted = false;

  try {
    // Validation checks are inside the try block (not early-returned
    // before it) specifically so the finally block's cleanup still runs
    // for them — disk-based Multer has already written req.file to disk
    // by the time this function runs, even for a request that fails
    // basic validation.
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

    conn = await db.getConnection();
    await conn.beginTransaction();
    transactionActive = true;

    // This endpoint is only for the INITIAL 30% down payment, on a
    // customer-owned blueprint order. The separate later remaining-
    // balance payment flow is not merged into this function.
    const [ownedOrders] = await conn.execute(
      `SELECT id
       FROM orders
       WHERE id = ?
         AND customer_id = ?
         AND order_type = 'blueprint'
       LIMIT 1
       FOR UPDATE`,
      [orderId, req.user.id],
    );

    if (!ownedOrders.length) {
      await conn.rollback();
      transactionActive = false;
      return res.status(404).json({ message: "Custom request not found." });
    }

    const lifecycle = await resolveLifecycleByOrder(conn, {
      orderId,
      lockOrder: true,
      lockBlueprint: true,
    });

    if (
      lifecycle.status !== "OK" ||
      !lifecycle.order ||
      !lifecycle.blueprint ||
      !lifecycle.estimation
    ) {
      await conn.rollback();
      transactionActive = false;
      return sendLifecycleConflict(res);
    }

    const order = lifecycle.order;
    const blueprint = lifecycle.blueprint;
    const estimation = lifecycle.estimation;

    if (normalize(order.order_type) !== "blueprint") {
      await conn.rollback();
      transactionActive = false;
      return sendLifecycleConflict(res);
    }

    if (isBlueprintArchived(blueprint)) {
      await conn.rollback();
      transactionActive = false;
      return sendLifecycleConflict(res);
    }

    // Only "confirmed" — contract_released is intentionally not accepted
    // here; that stage belongs to the separate remaining-balance flow,
    // which this function does not implement.
    if (normalize(order.status) !== "confirmed") {
      await conn.rollback();
      transactionActive = false;
      return res.status(400).json({
        message:
          "You can submit the 30% down payment only after approving the quotation.",
      });
    }

    if (normalize(estimation.status) !== "approved") {
      await conn.rollback();
      transactionActive = false;
      return res.status(400).json({
        message: "The quotation must be approved before submitting a down payment.",
      });
    }

    if (lifecycle.contract) {
      await conn.rollback();
      transactionActive = false;
      return sendLifecycleConflict(res);
    }

    const estimationGrandTotal = Number(estimation.grand_total || 0);

    if (!(estimationGrandTotal > 0)) {
      await conn.rollback();
      transactionActive = false;
      return res.status(400).json({
        message: "Quotation total is invalid. Please contact the admin.",
      });
    }

    const orderTotal = Number(order.total || 0);

    if (!(orderTotal > 0)) {
      await conn.rollback();
      transactionActive = false;
      return res.status(400).json({
        message: "Order total is not finalized yet. Please contact the admin.",
      });
    }

    if (Math.abs(orderTotal - estimationGrandTotal) > 0.01) {
      await conn.rollback();
      transactionActive = false;
      return sendLifecycleConflict(res);
    }

    // Required down payment is always server-calculated fresh from the
    // lifecycle-valid estimation's grand_total — never trusted from the
    // stored orders.down_payment column.
    const requiredDownPayment = calcDownPaymentAmount(estimationGrandTotal);

    if (lifecycle.has_pending_payment_transaction) {
      await conn.rollback();
      transactionActive = false;
      return res.status(400).json({
        message:
          "A payment proof is already awaiting review for this order. Please wait for it to be verified or rejected before submitting another.",
      });
    }

    const verifiedTotal = Number(lifecycle.verified_payment_total || 0);

    if (verifiedTotal + 0.0001 >= requiredDownPayment) {
      await conn.rollback();
      transactionActive = false;
      return res.status(400).json({
        message: "Your 30% down payment is already verified.",
      });
    }

    const remainingVerifiedBalance = roundMoney(
      Math.max(requiredDownPayment - verifiedTotal, 0),
    );

    if (submittedAmount - remainingVerifiedBalance > 0.0001) {
      await conn.rollback();
      transactionActive = false;
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

    // payment_status is intentionally NOT touched here — it changes only
    // after admin verification and is always derived from verified
    // payment_transactions rows, never set directly by this endpoint.
    const [orderUpdateResult] = await conn.execute(
      `UPDATE orders
       SET payment_method = ?,
           payment_proof = ?,
           updated_at = NOW()
       WHERE id = ?
         AND customer_id = ?
         AND order_type = 'blueprint'
         AND status = 'confirmed'`,
      [orderPaymentMethod, proofUrl, order.id, req.user.id],
    );

    if (orderUpdateResult.affectedRows === 0) {
      await conn.rollback();
      transactionActive = false;
      return res.status(409).json({
        message:
          "Order status changed before this could be saved. Please refresh and try again.",
        integrity_reason: "ORDER_STATE_CHANGED",
      });
    }

    const [[creatorRow]] = await conn.execute(
      `SELECT creator_id FROM blueprints WHERE id = ? LIMIT 1`,
      [blueprint.id],
    );

    await insertNotificationSafe(conn, creatorRow?.creator_id || null, {
      type: "blueprint_down_payment_submitted",
      title: "30% Down Payment Submitted",
      message: `Customer submitted the 30% down payment for ${order.order_number}. Please verify the payment proof.`,
    });

    await conn.commit();
    transactionActive = false;
    proofCommitted = true;

    return res.json({
      message: "Down payment proof submitted successfully.",
      submitted_amount: submittedAmount,
      remaining_required: remainingVerifiedBalance,
      proof_url: proofUrl,
    });
  } catch (err) {
    if (conn && transactionActive) {
      try {
        await conn.rollback();
        transactionActive = false;
      } catch (rollbackErr) {
        console.error(
          "[customer.customorders SUBMIT DOWN PAYMENT] rollback failed:",
          rollbackErr.message || rollbackErr,
        );
        connectionReusable = false;
      }
    }
    console.error("[customer.customorders SUBMIT DOWN PAYMENT]", err);
    return res
      .status(500)
      .json({ message: "Failed to submit 30% down payment." });
  } finally {
    if (conn) {
      if (connectionReusable) {
        conn.release();
      } else {
        conn.destroy();
      }
    }

    if (!proofCommitted && req.file?.path) {
      await cleanupUploadedFile(req.file.path);
    }
  }
};

// This endpoint is only for the LATER remaining-balance payment, once a
// real contract exists — the exact opposite lifecycle stage from
// submitDownPayment (which requires NO contract and status==='confirmed'
// only). The two never overlap and are never merged.
exports.submitRemainingBalancePayment = async (req, res) => {
  const orderId = parseStrictPositiveInt(req.params.id);
  const orderPaymentMethod = toAllowedBlueprintPaymentMethod(
    req.body?.payment_method,
  );
  const txPaymentMethod = toPaymentTransactionMethod(req.body?.payment_method);
  const submittedAmount = roundMoney(req.body?.amount || 0);
  const proofUrl = req.file ? `/uploads/proofs/${req.file.filename}` : null;

  let conn = null;
  let transactionActive = false;
  let connectionReusable = true;
  // Set true only once the payment transaction insert and the guarded
  // order update have both committed successfully. Everything else —
  // validation failures, lifecycle conflicts, rollbacks, connection
  // failures — leaves this false, and the finally block below removes
  // the uploaded file from disk in every one of those cases.
  let proofCommitted = false;

  try {
    // Validation checks are inside the try block (not early-returned
    // before it) specifically so the finally block's cleanup still runs
    // for them — disk-based Multer has already written req.file to disk
    // by the time this function runs, even for a request that fails
    // basic validation.
    if (!orderId) {
      return res.status(400).json({ message: "Invalid custom request ID." });
    }

    if (!orderPaymentMethod || !txPaymentMethod) {
      return res.status(400).json({
        message: "Choose a valid payment method for the remaining balance.",
      });
    }

    if (!proofUrl) {
      return res.status(400).json({
        message: "Upload your proof of payment for the remaining balance.",
      });
    }

    if (!(submittedAmount > 0)) {
      return res.status(400).json({
        message: "Enter a valid payment amount for this submission.",
      });
    }

    conn = await db.getConnection();
    await conn.beginTransaction();
    transactionActive = true;

    // Same customer-ownership lock pattern as submitDownPayment — this
    // order-first lock is what serializes this submission against
    // another customer payment submission, the rider's
    // updateDeliveryStatus collection, admin status changes, and any
    // other order-locked payment flow.
    const [ownedOrders] = await conn.execute(
      `SELECT id
       FROM orders
       WHERE id = ?
         AND customer_id = ?
         AND order_type = 'blueprint'
       LIMIT 1
       FOR UPDATE`,
      [orderId, req.user.id],
    );

    if (!ownedOrders.length) {
      await conn.rollback();
      transactionActive = false;
      return res.status(404).json({ message: "Custom request not found." });
    }

    const lifecycle = await resolveLifecycleByOrder(conn, {
      orderId,
      lockOrder: true,
      lockBlueprint: true,
    });

    if (
      lifecycle.status !== "OK" ||
      !lifecycle.order ||
      !lifecycle.blueprint ||
      !lifecycle.estimation
    ) {
      await conn.rollback();
      transactionActive = false;
      return sendLifecycleConflict(res);
    }

    const order = lifecycle.order;
    const blueprint = lifecycle.blueprint;
    const estimation = lifecycle.estimation;

    if (normalize(order.order_type) !== "blueprint") {
      await conn.rollback();
      transactionActive = false;
      return sendLifecycleConflict(res);
    }

    if (isBlueprintArchived(blueprint)) {
      await conn.rollback();
      transactionActive = false;
      return sendLifecycleConflict(res);
    }

    // Remaining-balance submission is allowed only in these four stages
    // — every one of them requires a real contract to already exist.
    // Confirmed belongs exclusively to submitDownPayment; pending has no
    // blueprint linkage yet; completed/cancelled are terminal and are
    // never reopened here.
    const REMAINING_BALANCE_ALLOWED_STAGES = new Set([
      "contract_released",
      "production",
      "shipping",
      "delivered",
    ]);

    if (!REMAINING_BALANCE_ALLOWED_STAGES.has(normalize(order.status))) {
      await conn.rollback();
      transactionActive = false;
      return res.status(400).json({
        message:
          "The remaining balance can only be submitted after your contract has been released.",
      });
    }

    if (normalize(estimation.status) !== "approved") {
      await conn.rollback();
      transactionActive = false;
      return sendLifecycleConflict(res);
    }

    // The opposite requirement from submitDownPayment: a real contract
    // MUST already exist. Never created, repaired, relinked, or inferred
    // here.
    if (!lifecycle.contract) {
      await conn.rollback();
      transactionActive = false;
      return sendLifecycleConflict(res);
    }

    const approvedTotal = roundMoney(estimation.grand_total || 0);

    if (!(approvedTotal > 0)) {
      await conn.rollback();
      transactionActive = false;
      return res.status(400).json({
        message: "Quotation total is invalid. Please contact the admin.",
      });
    }

    const orderTotal = roundMoney(order.total || 0);

    if (!(orderTotal > 0)) {
      await conn.rollback();
      transactionActive = false;
      return res.status(400).json({
        message: "Order total is not finalized yet. Please contact the admin.",
      });
    }

    if (Math.abs(orderTotal - approvedTotal) > 0.01) {
      await conn.rollback();
      transactionActive = false;
      return sendLifecycleConflict(res);
    }

    // Locked, freshly-read, real payment_transactions rows only — never
    // trusting the resolver's own (unlocked) totals for this critical
    // gate, and never a synthetic display row (this table never contains
    // one; those exist only in the admin getOne response).
    const [lockedPayments] = await conn.execute(
      `SELECT
          id,
          amount,
          status,
          payment_method,
          proof_url
       FROM payment_transactions
       WHERE order_id = ?
       ORDER BY id
       FOR UPDATE`,
      [order.id],
    );

    const verifiedPaymentTotal = roundMoney(
      lockedPayments
        .filter((row) => normalize(row.status) === "verified")
        .reduce((sum, row) => {
          const amount = Number(row.amount);
          return Number.isFinite(amount) && amount > 0 ? sum + amount : sum;
        }, 0),
    );

    const pendingPaymentTotal = roundMoney(
      lockedPayments
        .filter((row) => normalize(row.status) === "pending")
        .reduce((sum, row) => {
          const amount = Number(row.amount);
          return Number.isFinite(amount) && amount > 0 ? sum + amount : sum;
        }, 0),
    );

    const hasPendingPayment = lockedPayments.some(
      (row) => normalize(row.status) === "pending",
    );

    // The initial 30% must already be verified — real, verified
    // transactions only; pending and rejected amounts never count.
    const requiredInitialDownPayment = calcDownPaymentAmount(approvedTotal);

    if (verifiedPaymentTotal + 0.0001 < requiredInitialDownPayment) {
      await conn.rollback();
      transactionActive = false;
      return res.status(400).json({
        message:
          "The initial 30% down payment must be verified before submitting the remaining balance.",
      });
    }

    const remainingBalance = roundMoney(
      Math.max(approvedTotal - verifiedPaymentTotal, 0),
    );

    if (!(remainingBalance > 0) || verifiedPaymentTotal >= approvedTotal) {
      await conn.rollback();
      transactionActive = false;
      return res.status(400).json({
        message: "This order is already fully paid.",
      });
    }

    // Only one pending payment proof may exist at a time — the same rule
    // as the initial endpoint. Multiple resolved submissions may still
    // add up toward the full total over time, just never simultaneously.
    if (hasPendingPayment) {
      await conn.rollback();
      transactionActive = false;
      return res.status(400).json({
        message:
          "A payment proof is already awaiting review for this order. Please wait for it to be verified or rejected before submitting another.",
      });
    }

    // The client may submit any positive amount up to the true remaining
    // balance — never required to pay it off in a single proof. The
    // Phase B2F-B admin verify-time overpayment gate remains the final
    // backstop regardless of this check.
    if (submittedAmount - remainingBalance > 0.0001) {
      await conn.rollback();
      transactionActive = false;
      return res.status(400).json({
        message: `Submitted amount cannot exceed the remaining balance of ₱${remainingBalance.toFixed(2)}.`,
      });
    }

    // Pending only — never verified, never marks the order paid. Admin
    // verification remains required.
    await conn.execute(
      `INSERT INTO payment_transactions
        (order_id, amount, payment_method, proof_url, status, notes)
      VALUES (?, ?, ?, ?, 'pending', ?)`,
      [
        order.id,
        submittedAmount,
        txPaymentMethod,
        proofUrl,
        "Customer submitted remaining-balance payment proof for custom blueprint order.",
      ],
    );

    // Same restricted, canonical-order-only update as submitDownPayment —
    // never touches payment_status, order status, total, down_payment,
    // contract, or blueprint linkage.
    const [orderUpdateResult] = await conn.execute(
      `UPDATE orders
       SET payment_method = ?,
           payment_proof = ?,
           updated_at = NOW()
       WHERE id = ?
         AND customer_id = ?
         AND order_type = 'blueprint'
         AND status IN ('contract_released', 'production', 'shipping', 'delivered')`,
      [orderPaymentMethod, proofUrl, order.id, req.user.id],
    );

    if (orderUpdateResult.affectedRows === 0) {
      await conn.rollback();
      transactionActive = false;
      return res.status(409).json({
        message:
          "Order status changed before this could be saved. Please refresh and try again.",
        integrity_reason: "ORDER_STATE_CHANGED",
      });
    }

    const [[creatorRow]] = await conn.execute(
      `SELECT creator_id FROM blueprints WHERE id = ? LIMIT 1`,
      [blueprint.id],
    );

    await insertNotificationSafe(conn, creatorRow?.creator_id || null, {
      type: "blueprint_remaining_balance_submitted",
      title: "Remaining Balance Payment Submitted",
      message: `Customer submitted a remaining-balance payment proof for ${order.order_number}. Please verify the payment proof.`,
    });

    await conn.commit();
    transactionActive = false;
    proofCommitted = true;

    return res.json({
      message: "Remaining-balance payment proof submitted successfully.",
      submitted_amount: submittedAmount,
      verified_total: verifiedPaymentTotal,
      remaining_before_submission: remainingBalance,
      proof_url: proofUrl,
    });
  } catch (err) {
    if (conn && transactionActive) {
      try {
        await conn.rollback();
        transactionActive = false;
      } catch (rollbackErr) {
        console.error(
          "[customer.customorders SUBMIT REMAINING BALANCE] rollback failed:",
          rollbackErr.message || rollbackErr,
        );
        connectionReusable = false;
      }
    }
    console.error("[customer.customorders SUBMIT REMAINING BALANCE]", err);
    return res
      .status(500)
      .json({ message: "Failed to submit remaining-balance payment." });
  } finally {
    if (conn) {
      if (connectionReusable) {
        conn.release();
      } else {
        conn.destroy();
      }
    }

    if (!proofCommitted && req.file?.path) {
      await cleanupUploadedFile(req.file.path);
    }
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
