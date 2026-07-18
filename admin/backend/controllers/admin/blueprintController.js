// controllers/blueprintController.js
const path = require("path");
const pool = require("../../config/db");
const {
  resolveLifecycleByBlueprint,
  resolveLifecycleByOrder,
} = require("../../services/blueprintLifecycleService");

// ── Helpers ──────────────────────────────────────────────────────────────────
function safeJsonParse(value, fallback = {}) {
  try {
    if (value == null || value === "") return fallback;
    return typeof value === "string" ? JSON.parse(value) : value;
  } catch {
    return fallback;
  }
}

// Stable comparison helpers for the JSON-text blueprint columns, used only
// to detect whether a value meaningfully changed for audit purposes — the
// normalized output is never logged, only the boolean comparison result.
function sortJsonValue(value) {
  if (Array.isArray(value)) {
    return value.map(sortJsonValue);
  }
  if (value && typeof value === "object") {
    return Object.keys(value)
      .sort()
      .reduce((result, key) => {
        result[key] = sortJsonValue(value[key]);
        return result;
      }, {});
  }
  return value;
}
function normalizeJsonForComparison(value, fallback) {
  return JSON.stringify(sortJsonValue(safeJsonParse(value, fallback)));
}
function normalizeEstimationItems(items = []) {
  return (Array.isArray(items) ? items : [])
    .map((item, index) => {
      const quantity = Number(item.quantity) || 1;
      const unitCost = Number(item.unit_cost) || 0;
      const subtotal =
        item.subtotal != null
          ? Number(item.subtotal) || 0
          : quantity * unitCost;

      return {
        id: item.id || index + 1,
        component_id: item.component_id ? Number(item.component_id) : null,
        raw_material_id: item.raw_material_id
          ? Number(item.raw_material_id)
          : null,
        name: item.name || item.description || "",
        description: item.description || item.name || "",
        quantity,
        unit: item.unit || "pc",
        unit_cost: unitCost,
        note: item.note || "",
        source_key: item.source_key || item.sourceKey || "",
        source_type: item.source_type || item.sourceType || "",
        subtotal,
      };
    })
    .filter((item) => item.name.trim() !== "");
}

function groupDraftItems(items = []) {
  const grouped = new Map();

  for (const raw of Array.isArray(items) ? items : []) {
    const quantity = Number(raw.quantity || 0);
    if (!Number.isFinite(quantity) || quantity <= 0) continue;

    const unitCost = Number(raw.unit_cost || 0) || 0;
    const key = [
      String(raw.raw_material_id || ""),
      String(raw.name || "")
        .trim()
        .toLowerCase(),
      String(raw.unit || "pc")
        .trim()
        .toLowerCase(),
      String(raw.note || "")
        .trim()
        .toLowerCase(),
    ].join("|");

    if (!grouped.has(key)) {
      grouped.set(key, {
        id: grouped.size + 1,
        component_id: null,
        raw_material_id: raw.raw_material_id || null,
        name: String(raw.name || "Item").trim(),
        description: String(raw.description || raw.name || "Item").trim(),
        quantity,
        unit: raw.unit || "pc",
        unit_cost: unitCost,
        note: String(raw.note || "").trim(),
        subtotal: Number((quantity * unitCost).toFixed(2)),
      });
      continue;
    }

    const existing = grouped.get(key);
    existing.quantity = Number((existing.quantity + quantity).toFixed(4));
    existing.subtotal = Number(
      (existing.quantity * existing.unit_cost).toFixed(2),
    );
  }

  return Array.from(grouped.values()).map((item, index) => ({
    ...item,
    id: index + 1,
  }));
}

function findRawMaterialMatch(rawMaterials = [], candidate = "") {
  const needle = String(candidate || "")
    .trim()
    .toLowerCase();

  if (!needle) return null;

  return (
    rawMaterials.find(
      (row) =>
        String(row.name || "")
          .trim()
          .toLowerCase() === needle,
    ) ||
    rawMaterials.find((row) =>
      needle.includes(
        String(row.name || "")
          .trim()
          .toLowerCase(),
      ),
    ) ||
    rawMaterials.find((row) =>
      String(row.name || "")
        .trim()
        .toLowerCase()
        .includes(needle),
    ) ||
    null
  );
}

function computeEstimationTotals({
  items = [],
  labor_cost = 0,
  overhead_cost = 0,
  tax_rate = 12,
  discount = 0,
}) {
  const material_cost = items.reduce(
    (sum, item) =>
      sum + (Number(item.quantity) || 0) * (Number(item.unit_cost) || 0),
    0,
  );

  const laborCost = Number(labor_cost) || 0;
  const overheadCost = Number(overhead_cost) || 0;
  const discountAmt = Number(discount) || 0;
  const taxRate = Number(tax_rate) || 0;

  const subtotal = material_cost + laborCost + overheadCost;
  const afterDiscount = subtotal - discountAmt;
  const tax_amount = afterDiscount * (taxRate / 100);
  const grand_total = afterDiscount + tax_amount;

  return {
    material_cost,
    items_total: material_cost,
    labor_cost: laborCost,
    overhead_cost: overheadCost,
    tax_rate: taxRate,
    discount: discountAmt,
    subtotal,
    tax_amount,
    grand_total,
  };
}

async function buildAutoEstimationDraft(conn, blueprintId) {
  const [[blueprint]] = await conn.query(
    `SELECT id, title, design_data
     FROM blueprints
     WHERE id = ?
     LIMIT 1`,
    [parseInt(blueprintId)],
  );

  if (!blueprint) return null;

  const designData = safeJsonParse(blueprint.design_data, {}) || {};

  const [[linkedOrder]] = await conn.query(
    `SELECT
        o.id AS order_id,
        o.order_number,
        oi.product_id,
        oi.product_name,
        oi.customization_json,
        COALESCE(NULLIF(oi.quantity, 0), 1) AS order_quantity
      FROM orders o
      LEFT JOIN order_items oi ON oi.order_id = o.id
      WHERE o.blueprint_id = ?
      ORDER BY oi.id ASC
      LIMIT 1`,
    [parseInt(blueprintId)],
  );

  const orderQty = Math.max(1, Number(linkedOrder?.order_quantity) || 1);

  const customization =
    safeJsonParse(linkedOrder?.customization_json, {}) || {};

  // ── FIXED: Added empty array [] ──
  const [rawMaterialRows] = await conn.query(
    `SELECT id, name, unit, unit_cost
     FROM raw_materials
     ORDER BY name ASC`,
    [],
  );

  let resolvedProductId = Number(linkedOrder?.product_id) || null;

  if (!resolvedProductId && linkedOrder?.product_name) {
    const [[matchedProduct]] = await conn.query(
      `SELECT id, name, production_cost
       FROM products
       WHERE name = ?
       ORDER BY id DESC
       LIMIT 1`,
      [linkedOrder.product_name],
    );

    if (matchedProduct?.id) {
      resolvedProductId = Number(matchedProduct.id) || null;
    }
  }

  if (resolvedProductId) {
    const [bomRows] = await conn.query(
      `SELECT
          bom.raw_material_id,
          bom.quantity AS bom_quantity,
          rm.name AS material_name,
          rm.unit,
          rm.unit_cost
        FROM bill_of_materials bom
        INNER JOIN raw_materials rm ON rm.id = bom.raw_material_id
        WHERE bom.product_id = ?
        ORDER BY rm.name ASC`,
      [resolvedProductId],
    );

    if (bomRows.length) {
      const items = bomRows.map((row, index) => {
        const quantity = (Number(row.bom_quantity) || 0) * orderQty;
        const unitCost = Number(row.unit_cost) || 0;

        return {
          id: index + 1,
          component_id: null,
          raw_material_id: Number(row.raw_material_id) || null,
          name: row.material_name || `Material ${index + 1}`,
          description: `Auto-filled from BOM for ${linkedOrder?.product_name || blueprint.title || "blueprint product"}`,
          quantity,
          unit: row.unit || "pc",
          unit_cost: unitCost,
          note: "Auto-generated from bill of materials",
          subtotal: quantity * unitCost,
        };
      });

      const totals = computeEstimationTotals({
        items,
        labor_cost: 0,
        overhead_cost: 0,
        tax_rate: 12,
        discount: 0,
      });

      return {
        source: "bom",
        status: "draft",
        version: 0,
        notes: `Auto-generated from BOM for ${linkedOrder?.product_name || blueprint.title || "blueprint product"}. Review and adjust before saving.`,
        items,
        ...totals,
      };
    }

    const [[product]] = await conn.query(
      `SELECT id, name, production_cost
       FROM products
       WHERE id = ?
       LIMIT 1`,
      [resolvedProductId],
    );

    if (product && Number(product.production_cost) > 0) {
      const items = [
        {
          id: 1,
          component_id: null,
          raw_material_id: null,
          name:
            product.name ||
            linkedOrder?.product_name ||
            blueprint.title ||
            "Blueprint Product",
          description: "Fallback production-cost estimate",
          quantity: orderQty,
          unit: "unit",
          unit_cost: Number(product.production_cost) || 0,
          note: "Auto-generated from product production cost fallback",
          subtotal: orderQty * (Number(product.production_cost) || 0),
        },
      ];

      const totals = computeEstimationTotals({
        items,
        labor_cost: 0,
        overhead_cost: 0,
        tax_rate: 12,
        discount: 0,
      });

      return {
        source: "product_production_cost",
        status: "draft",
        version: 0,
        notes: `No BOM found. Auto-generated from product production cost fallback for ${product.name || linkedOrder?.product_name || blueprint.title || "product"}.`,
        items,
        ...totals,
      };
    }
  }

  const [componentRows] = await conn.query(
    `SELECT
        bc.raw_material_id,
        rm.name AS material_name,
        rm.unit,
        rm.unit_cost,
        SUM(COALESCE(bc.quantity, 1)) AS component_quantity,
        COUNT(*) AS component_count
      FROM blueprint_components bc
      INNER JOIN raw_materials rm ON rm.id = bc.raw_material_id
      WHERE bc.blueprint_id = ?
        AND bc.raw_material_id IS NOT NULL
      GROUP BY bc.raw_material_id, rm.name, rm.unit, rm.unit_cost
      ORDER BY rm.name ASC`,
    [parseInt(blueprintId)],
  );

  if (componentRows.length) {
    const items = componentRows.map((row, index) => {
      const quantity = (Number(row.component_quantity) || 0) * orderQty;
      const unitCost = Number(row.unit_cost) || 0;

      return {
        id: index + 1,
        component_id: null,
        raw_material_id: Number(row.raw_material_id) || null,
        name: row.material_name || `Material ${index + 1}`,
        description: `Component-based auto estimate (${Number(row.component_count) || 0} component refs)`,
        quantity,
        unit: row.unit || "pc",
        unit_cost: unitCost,
        note: "Auto-generated from blueprint component raw material mapping",
        subtotal: quantity * unitCost,
      };
    });

    const totals = computeEstimationTotals({
      items,
      labor_cost: 0,
      overhead_cost: 0,
      tax_rate: 12,
      discount: 0,
    });

    return {
      source: "blueprint_components",
      status: "draft",
      version: 0,
      notes:
        "No BOM found. Auto-generated from blueprint component raw material mapping.",
      items,
      ...totals,
    };
  }

  const cutListRows = Array.isArray(designData?.conversionCutListRows)
    ? designData.conversionCutListRows
    : [];

  if (cutListRows.length) {
    const groupedItems = groupDraftItems(
      cutListRows.map((row, index) => {
        const materialName =
          row?.material ||
          row?.boardMaterial ||
          customization?.wood_type ||
          "Material";

        const matchedMaterial = findRawMaterialMatch(
          rawMaterialRows,
          materialName,
        );

        const isAreaUnit =
          String(row?.estimationUnit || "")
            .trim()
            .toLowerCase() === "panel_area";

        const quantity = isAreaUnit
          ? Number(
              ((Number(row?.totalAreaSqM || 0) || 0) * orderQty).toFixed(4),
            )
          : Math.max(1, (Number(row?.qty || 0) || 1) * orderQty);

        const name =
          row?.sampleLabel ||
          [row?.partFamily, row?.partRole].filter(Boolean).join(" / ") ||
          `Cut List Item ${index + 1}`;

        const note = [
          materialName || null,
          row?.widthMm && row?.heightMm
            ? `${row.widthMm}×${row.heightMm}${row?.depthMm ? `×${row.depthMm}` : ""} mm`
            : null,
          row?.thicknessMm ? `${row.thicknessMm} mm thick` : null,
        ]
          .filter(Boolean)
          .join(" · ");

        return {
          component_id: null,
          raw_material_id: matchedMaterial?.id || null,
          name,
          description: name,
          quantity,
          unit: matchedMaterial?.unit || (isAreaUnit ? "sq.m" : "pc"),
          unit_cost: Number(matchedMaterial?.unit_cost || 0),
          note,
          subtotal: quantity * Number(matchedMaterial?.unit_cost || 0),
        };
      }),
    );

    if (groupedItems.length) {
      const totals = computeEstimationTotals({
        items: groupedItems,
        labor_cost: 0,
        overhead_cost: 0,
        tax_rate: 12,
        discount: 0,
      });

      return {
        source: "design_data_cutlist",
        status: "draft",
        version: 0,
        notes:
          "Auto-generated from blueprint cut list data. Review and adjust before saving.",
        items: groupedItems,
        ...totals,
      };
    }
  }

  const designComponents = Array.isArray(designData?.components)
    ? designData.components
    : [];

  if (designComponents.length) {
    const groupedItems = groupDraftItems(
      designComponents.map((row, index) => {
        const materialName =
          row?.material ||
          row?.wood_type ||
          customization?.wood_type ||
          "Material";

        const matchedMaterial = findRawMaterialMatch(
          rawMaterialRows,
          materialName,
        );

        const quantity =
          Math.max(1, Number(row?.qty || row?.quantity || 1)) * orderQty;

        const width = Number(row?.width || row?.widthMm || 0);
        const height = Number(row?.height || row?.heightMm || 0);
        const depth = Number(row?.depth || row?.depthMm || 0);

        const name =
          row?.label || row?.name || row?.type || `Component ${index + 1}`;

        const note = [
          materialName || null,
          width || height || depth ? `${width}×${height}×${depth} mm` : null,
          row?.finish ? `Finish: ${row.finish}` : null,
        ]
          .filter(Boolean)
          .join(" · ");

        return {
          component_id: null,
          raw_material_id: matchedMaterial?.id || null,
          name,
          description: name,
          quantity,
          unit: matchedMaterial?.unit || "pc",
          unit_cost: Number(matchedMaterial?.unit_cost || 0),
          note,
          subtotal: quantity * Number(matchedMaterial?.unit_cost || 0),
        };
      }),
    );

    if (groupedItems.length) {
      const totals = computeEstimationTotals({
        items: groupedItems,
        labor_cost: 0,
        overhead_cost: 0,
        tax_rate: 12,
        discount: 0,
      });

      return {
        source: "design_data_components",
        status: "draft",
        version: 0,
        notes:
          "Auto-generated from blueprint component data. Review and adjust before saving.",
        items: groupedItems,
        ...totals,
      };
    }
  }

  return null;
}

function getBlueprintFileMeta(file) {
  if (!file) {
    return {
      source: null,
      file_url: null,
      file_type: null,
      default_thumbnail_url: null,
    };
  }

  const ext = path
    .extname(file.originalname || "")
    .replace(".", "")
    .toLowerCase();

  const allowed = new Set(["pdf", "png", "jpg", "jpeg", "svg"]);

  if (!allowed.has(ext)) {
    const err = new Error(
      "Only PDF, PNG, JPG, JPEG, and SVG blueprint files are allowed.",
    );
    err.statusCode = 400;
    throw err;
  }

  const file_url = `/uploads/blueprints/${file.filename}`;
  const default_thumbnail_url = ["png", "jpg", "jpeg", "svg"].includes(ext)
    ? file_url
    : null;

  return {
    source: "imported",
    file_url,
    file_type: ext,
    default_thumbnail_url,
  };
}

const REFERENCE_VIEWS = ["front", "back", "left", "right", "top"];

function createEmptyReferenceFiles() {
  return {
    front: null,
    back: null,
    left: null,
    right: null,
    top: null,
  };
}

function normalizeReferenceFilesMap(value = {}, fallbackTitle = "") {
  const next = createEmptyReferenceFiles();

  REFERENCE_VIEWS.forEach((view) => {
    const normalized = normalizeReferenceFile(
      value?.[view],
      fallbackTitle ? `${fallbackTitle} ${view}` : `${view} reference`,
    );

    if (normalized) {
      next[view] = normalized;
    }
  });

  return next;
}

function buildUploadedReferenceFiles(uploadedFiles = {}, fallbackTitle = "") {
  const next = createEmptyReferenceFiles();

  REFERENCE_VIEWS.forEach((view) => {
    const file = uploadedFiles?.[view];
    if (!file) return;

    const meta = getBlueprintFileMeta(file);

    next[view] = normalizeReferenceFile(
      {
        url: meta.file_url,
        type: meta.file_type,
        name: file.originalname || `${fallbackTitle || "Reference"} ${view}`,
        source: "imported",
      },
      fallbackTitle ? `${fallbackTitle} ${view}` : `${view} reference`,
    );
  });

  return next;
}

function hasAnyReferenceFiles(referenceFiles = {}) {
  return REFERENCE_VIEWS.some((view) => referenceFiles?.[view]?.url);
}

function normalizeReferenceFile(value, fallbackTitle = "") {
  const url = value?.url || value?.file_url || null;
  const type = String(value?.type || value?.file_type || "")
    .trim()
    .toLowerCase();

  if (!url || !type) return null;

  return {
    url,
    type,
    name:
      value?.name ||
      (fallbackTitle ? `${fallbackTitle}.${type}` : path.basename(url)),
    source: "imported",
  };
}

function mergeDesignData(value, blueprintLike = {}, fallbackTitle = "") {
  const base = safeJsonParse(value, {});
  const designData =
    base && typeof base === "object" && !Array.isArray(base) ? { ...base } : {};

  if (!Array.isArray(designData.components)) designData.components = [];
  if (!designData.unit) designData.unit = "mm";

  const existingReferenceFiles = normalizeReferenceFilesMap(
    designData.reference_files || designData.referenceFiles,
    fallbackTitle,
  );

  const incomingReferenceFiles = normalizeReferenceFilesMap(
    blueprintLike.reference_files || blueprintLike.referenceFiles,
    fallbackTitle,
  );

  const existingReference = normalizeReferenceFile(
    designData.reference_file || designData.referenceFile,
    fallbackTitle,
  );

  const blueprintReference = normalizeReferenceFile(
    blueprintLike,
    fallbackTitle,
  );

  const finalReferenceFiles = createEmptyReferenceFiles();

  REFERENCE_VIEWS.forEach((view) => {
    finalReferenceFiles[view] =
      incomingReferenceFiles[view] || existingReferenceFiles[view] || null;
  });

  if (!finalReferenceFiles.front) {
    finalReferenceFiles.front = blueprintReference || existingReference || null;
  }

  if (hasAnyReferenceFiles(finalReferenceFiles)) {
    designData.reference_files = finalReferenceFiles;
    designData.reference_file = finalReferenceFiles.front || null;
  } else {
    delete designData.reference_files;
    delete designData.reference_file;
  }

  delete designData.referenceFiles;
  delete designData.referenceFile;

  return JSON.stringify(designData);
}

function normalizeSource(sourceValue, hasFile = false) {
  if (hasFile) return "imported";

  const value = String(sourceValue || "")
    .trim()
    .toLowerCase();

  if (value === "imported") return "imported";
  if (value === "manual") return "created";
  if (value === "created") return "created";

  return "created";
}

async function backfillLegacyArchivedDates() {
  await pool.query(
    `UPDATE blueprints
     SET archived_at = COALESCE(updated_at, created_at, NOW())
     WHERE is_deleted = 1
       AND archived_at IS NULL`,
  );
}

async function deleteBlueprintCascade(conn, blueprintIds = []) {
  if (!Array.isArray(blueprintIds) || !blueprintIds.length) return;

  const bpPlaceholders = blueprintIds.map(() => "?").join(",");

  const [estimationRows] = await conn.query(
    `SELECT id
     FROM estimations
     WHERE blueprint_id IN (${bpPlaceholders})`,
    blueprintIds,
  );

  const estimationIds = estimationRows.map((row) => row.id);

  if (estimationIds.length) {
    const estPlaceholders = estimationIds.map(() => "?").join(",");

    await conn.query(
      `DELETE FROM estimation_items
       WHERE estimation_id IN (${estPlaceholders})`,
      estimationIds,
    );
  }

  await conn.query(
    `DELETE FROM blueprint_revisions
     WHERE blueprint_id IN (${bpPlaceholders})`,
    blueprintIds,
  );

  await conn.query(
    `DELETE FROM blueprint_components
     WHERE blueprint_id IN (${bpPlaceholders})`,
    blueprintIds,
  );

  await conn.query(
    `DELETE FROM estimations
     WHERE blueprint_id IN (${bpPlaceholders})`,
    blueprintIds,
  );

  await conn.query(
    `DELETE FROM blueprints
     WHERE id IN (${bpPlaceholders})`,
    blueprintIds,
  );
}

async function purgeExpiredArchivedBlueprints() {
  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    const [expiredRows] = await conn.query(
      `SELECT b.id
       FROM blueprints b
       LEFT JOIN orders o ON o.blueprint_id = b.id
       WHERE b.is_deleted = 1
         AND COALESCE(b.archived_at, b.updated_at, b.created_at) IS NOT NULL
         AND DATEDIFF(CURDATE(), DATE(COALESCE(b.archived_at, b.updated_at, b.created_at))) >= 30
         AND o.id IS NULL
       GROUP BY b.id`,
    );

    if (!expiredRows.length) {
      await conn.commit();
      return;
    }

    const blueprintIds = expiredRows.map((row) => row.id);

    await deleteBlueprintCascade(conn, blueprintIds);

    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

// ── GET /api/blueprints ───────────────────────────────────────────────────────
exports.getAll = async (req, res) => {
  try {
    await backfillLegacyArchivedDates();
    await purgeExpiredArchivedBlueprints();

    const { tab = "my", page = 1, limit = 20, search = "" } = req.query;

    const pageNum = Number(page) || 1;
    const limitNum = Number(limit) || 20;
    const offset = (pageNum - 1) * limitNum;

    const where = [];
    const params = [];

    if (tab === "my") {
      where.push("b.creator_id = ? AND b.is_deleted = 0");
      params.push(parseInt(req.user.id));
    }

    if (tab === "imports") {
      where.push("b.source = 'imported' AND b.is_deleted = 0");
    }

    if (tab === "gallery") {
      where.push(
        "(b.is_template = 1 OR b.is_gallery = 1) AND b.is_deleted = 0",
      );
    }

    if (tab === "archive") {
      where.push("b.is_deleted = 1");
    }

    if (String(search).trim()) {
      const keyword = `%${String(search).trim()}%`;
      where.push(`(
        b.title LIKE ?
        OR COALESCE(b.description, '') LIKE ?
        OR COALESCE(u.name, '') LIKE ?
        OR COALESCE(c.name, '') LIKE ?
        OR COALESCE(b.file_type, '') LIKE ?
      )`);
      params.push(keyword, keyword, keyword, keyword, keyword);
    }

    const whereSQL = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const baseFrom = `
      FROM blueprints b
      JOIN users u ON u.id = b.creator_id
      LEFT JOIN users c ON c.id = b.client_id
    `;

    const [rows] = await pool.query(
      `SELECT b.id, b.title, b.description, b.stage, b.source,
              b.file_url, b.file_type, b.thumbnail_url,
              b.is_template, b.is_gallery, b.is_deleted, b.archived_at,
              b.created_at, b.updated_at,
              u.name AS creator_name,
              c.name AS client_name,
              CASE
                WHEN b.is_deleted = 1
                  THEN GREATEST(0, 30 - DATEDIFF(CURDATE(), DATE(COALESCE(b.archived_at, b.updated_at, b.created_at))))
                ELSE NULL
              END AS archive_days_left,
              CASE
                WHEN b.is_deleted = 1
                  THEN DATE_ADD(DATE(COALESCE(b.archived_at, b.updated_at, b.created_at)), INTERVAL 30 DAY)
                ELSE NULL
              END AS archive_expires_at
       ${baseFrom}
       ${whereSQL}
       ORDER BY
         CASE
           WHEN b.is_deleted = 1 THEN COALESCE(b.archived_at, b.updated_at, b.created_at)
           ELSE b.updated_at
         END DESC,
         b.id DESC
       LIMIT ? OFFSET ?`,
      [...params, parseInt(limitNum), parseInt(offset)],
    );

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total
       ${baseFrom}
       ${whereSQL}`,
      params,
    );

    res.json({ rows, total });
  } catch (err) {
    console.error("getAll blueprints error:", err);
    res.status(err.statusCode || 500).json({ message: err.message });
  }
};

// ── GET /api/blueprints/:id ───────────────────────────────────────────────────
exports.getOne = async (req, res) => {
  try {
    const [[bp]] = await pool.query(
      `SELECT b.*, u.name AS creator_name, c.name AS client_name,
              CASE
                WHEN b.is_deleted = 1
                  THEN GREATEST(0, 30 - DATEDIFF(CURDATE(), DATE(COALESCE(b.archived_at, b.updated_at, b.created_at))))
                ELSE NULL
              END AS archive_days_left,
              CASE
                WHEN b.is_deleted = 1
                  THEN DATE_ADD(DATE(COALESCE(b.archived_at, b.updated_at, b.created_at)), INTERVAL 30 DAY)
                ELSE NULL
              END AS archive_expires_at
       FROM blueprints b
       JOIN users u ON u.id = b.creator_id
       LEFT JOIN users c ON c.id = b.client_id
       WHERE b.id = ?`,
      [parseInt(req.params.id)],
    );

    if (!bp) {
      return res.status(404).json({ message: "Blueprint not found." });
    }

    const [components] = await pool.query(
      "SELECT * FROM blueprint_components WHERE blueprint_id = ?",
      [parseInt(req.params.id)],
    );

    const [revisions] = await pool.query(
      `SELECT br.*, u.name AS revised_by_name
       FROM blueprint_revisions br
       LEFT JOIN users u ON u.id = br.revised_by
       WHERE br.blueprint_id = ?
       ORDER BY br.revision_number DESC`,
      [parseInt(req.params.id)],
    );

    const normalizedDesignData = mergeDesignData(bp.design_data, bp, bp.title);

    res.json({
      ...bp,
      design_data: normalizedDesignData,
      components,
      revision_history: revisions,
    });
  } catch (err) {
    console.error("getOne blueprint error:", err);
    res.status(err.statusCode || 500).json({ message: err.message });
  }
};

// ── POST /api/blueprints ──────────────────────────────────────────────────────
exports.create = async (req, res) => {
  try {
    const {
      title,
      description,
      client_id,
      is_template,
      is_gallery,
      stage,
      source,
      thumbnail_url,
      design_data,
    } = req.body;

    if (!String(title || "").trim()) {
      return res.status(400).json({ message: "Blueprint title is required." });
    }

    const finalTitle = String(title).trim();
    const uploadedReferenceFiles = buildUploadedReferenceFiles(
      req.referenceFiles,
      finalTitle,
    );
    const primaryReference = uploadedReferenceFiles.front || null;
    const fileMeta = getBlueprintFileMeta(req.file);
    const normalizedSource = normalizeSource(
      source,
      !!req.file || hasAnyReferenceFiles(uploadedReferenceFiles),
    );
    const finalStage = String(stage || "").trim() || "design";
    const finalThumbnail =
      thumbnail_url ||
      primaryReference?.url ||
      fileMeta.default_thumbnail_url ||
      null;

    const finalDesignData = mergeDesignData(
      design_data,
      {
        file_url: primaryReference?.url || fileMeta.file_url,
        file_type: primaryReference?.type || fileMeta.file_type,
        reference_files: uploadedReferenceFiles,
      },
      finalTitle,
    );

    const [r] = await pool.query(
      `INSERT INTO blueprints
        (title, description, creator_id, client_id, source, stage, file_url, file_type, thumbnail_url, design_data, is_template, is_gallery, is_deleted, archived_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        finalTitle,
        description || null,
        parseInt(req.user.id),
        client_id ? parseInt(client_id) : null,
        fileMeta.source || normalizedSource,
        finalStage,
        fileMeta.file_url,
        fileMeta.file_type,
        finalThumbnail,
        finalDesignData,
        Number(is_template) ? 1 : 0,
        Number(is_gallery) ? 1 : 0,
        0,
        null,
      ],
    );

    req.auditRecord = {
      id: r.insertId,
      new: {
        stage: finalStage,
        source: fileMeta.source || normalizedSource,
        is_template: Boolean(Number(is_template)),
        is_gallery: Boolean(Number(is_gallery)),
        file_uploaded: Boolean(req.file),
        reference_files_uploaded: hasAnyReferenceFiles(uploadedReferenceFiles),
      },
    };

    res.status(201).json({
      message: "Blueprint created.",
      id: r.insertId,
      blueprint: {
        id: r.insertId,
        title: finalTitle,
        source: fileMeta.source || normalizedSource,
        stage: finalStage,
        file_url: primaryReference?.url || fileMeta.file_url,
        file_type: primaryReference?.type || fileMeta.file_type,
        thumbnail_url: finalThumbnail,
        design_data: finalDesignData,
      },
    });
  } catch (err) {
    console.error("create blueprint error:", err);
    res.status(err.statusCode || 500).json({ message: err.message });
  }
};

// ── PUT /api/blueprints/:id ───────────────────────────────────────────────────
exports.update = async (req, res) => {
  try {
    const [[bp]] = await pool.query("SELECT * FROM blueprints WHERE id = ?", [
      parseInt(req.params.id),
    ]);

    if (!bp) {
      return res.status(404).json({ message: "Blueprint not found." });
    }

    const locked = safeJsonParse(bp.locked_fields, []);
    const updates = { ...req.body };
    const uploadedReferenceFiles = buildUploadedReferenceFiles(
      req.referenceFiles,
      bp.title || "",
    );
    const hasUploadedReferenceFiles = hasAnyReferenceFiles(
      uploadedReferenceFiles,
    );
    const fileMeta = getBlueprintFileMeta(req.file);

    locked.forEach((field) => delete updates[field]);

    const allowedCols = [
      "title",
      "description",
      "stage",
      "design_data",
      "view_3d_data",
      "locked_fields",
      "thumbnail_url",
      "is_template",
      "is_gallery",
      "client_id",
      "source",
      "file_url",
      "file_type",
      "base_price",
    ];

    const filtered = Object.fromEntries(
      Object.entries(updates).filter(([key]) => allowedCols.includes(key)),
    );

    const incomingHasDesignData = Object.prototype.hasOwnProperty.call(
      filtered,
      "design_data",
    );

    if (req.file) {
      filtered.source = fileMeta.source;
      filtered.file_url = fileMeta.file_url;
      filtered.file_type = fileMeta.file_type;

      if (!filtered.thumbnail_url) {
        filtered.thumbnail_url = fileMeta.default_thumbnail_url;
      }
    }

    if (filtered.source) {
      filtered.source = normalizeSource(
        filtered.source,
        !!req.file || hasUploadedReferenceFiles,
      );
    }

    if (filtered.title != null && !String(filtered.title).trim()) {
      return res
        .status(400)
        .json({ message: "Blueprint title cannot be empty." });
    }

    if (filtered.title != null) {
      filtered.title = String(filtered.title).trim();
    }

    if (incomingHasDesignData || req.file || hasUploadedReferenceFiles) {
      filtered.design_data = mergeDesignData(
        incomingHasDesignData ? filtered.design_data : bp.design_data,
        {
          file_url: filtered.file_url || bp.file_url,
          file_type: filtered.file_type || bp.file_type,
          reference_files: uploadedReferenceFiles,
        },
        filtered.title || bp.title,
      );
    }

    if (!Object.keys(filtered).length) {
      return res.status(400).json({ message: "No updatable fields." });
    }

    // Compare bp (old row, SELECT * already fetched above) against the
    // final normalized `filtered` values — a key being present in
    // `filtered` only means it was submitted/derived, not that its value
    // actually differs from what's already stored.
    const BOOLEAN_NUMERIC_FIELDS = ["is_template", "is_gallery"];
    const NULLABLE_ID_FIELDS = ["client_id"];
    const JSON_FIELDS = ["design_data", "view_3d_data", "locked_fields"];
    const normNum = (v) =>
      v === null || v === undefined || v === "" ? null : Number(v);

    const actualChangedFields = Object.keys(filtered).filter((key) => {
      const oldVal = bp[key];
      const newVal = filtered[key];
      if (BOOLEAN_NUMERIC_FIELDS.includes(key)) {
        return Boolean(Number(oldVal)) !== Boolean(Number(newVal));
      }
      if (NULLABLE_ID_FIELDS.includes(key)) {
        return normNum(oldVal) !== normNum(newVal);
      }
      if (JSON_FIELDS.includes(key)) {
        const fallback = key === "locked_fields" ? [] : {};
        return (
          normalizeJsonForComparison(oldVal, fallback) !==
          normalizeJsonForComparison(newVal, fallback)
        );
      }
      return String(oldVal ?? "") !== String(newVal ?? "");
    });

    if (incomingHasDesignData) {
      const [[{ maxRev }]] = await pool.query(
        `SELECT COALESCE(MAX(revision_number), 0) AS maxRev
         FROM blueprint_revisions
         WHERE blueprint_id = ?`,
        [parseInt(req.params.id)],
      );

      await pool.query(
        `INSERT INTO blueprint_revisions
          (blueprint_id, revision_number, stage_at_save, revision_data, revised_by)
         VALUES (?,?,?,?,?)`,
        [
          parseInt(req.params.id),
          maxRev + 1,
          bp.stage,
          bp.design_data,
          parseInt(req.user.id),
        ],
      );
    }

    const sets = Object.keys(filtered)
      .map((key) => `${key} = ?`)
      .join(", ");

    await pool.query(
      `UPDATE blueprints
       SET ${sets}
       WHERE id = ?`,
      [...Object.values(filtered), parseInt(req.params.id)],
    );

    // A revision row is written whenever incomingHasDesignData is true,
    // even if the normalized design content turns out equivalent — that
    // write is real and must be captured even when actualChangedFields
    // ends up empty. An empty fields_changed array is expected/valid
    // whenever revision_created is true but no other column changed.
    const revisionCreated = incomingHasDesignData;

    if (actualChangedFields.length > 0 || revisionCreated) {
      req.auditRecord = {
        id: parseInt(req.params.id),
        new: {
          fields_changed: actualChangedFields,
          stage_changed: actualChangedFields.includes("stage"),
          design_data_changed: actualChangedFields.includes("design_data"),
          file_uploaded: Boolean(req.file),
          reference_files_uploaded: hasUploadedReferenceFiles,
          revision_created: revisionCreated,
        },
      };
    }

    res.json({
      message: "Blueprint updated.",
      blueprint: {
        id: Number(req.params.id),
        ...filtered,
      },
    });
  } catch (err) {
    console.error("update blueprint error:", err);
    res.status(err.statusCode || 500).json({ message: err.message });
  }
};

// ── DELETE /api/blueprints/:id (soft delete → archive) ───────────────────────
exports.archive = async (req, res) => {
  try {
    const [[bp]] = await pool.query(
      `SELECT id, stage, is_deleted
       FROM blueprints
       WHERE id = ?
       LIMIT 1`,
      [parseInt(req.params.id)],
    );

    if (!bp) {
      return res.status(404).json({ message: "Blueprint not found." });
    }

    const [updateResult] = await pool.query(
      `UPDATE blueprints
       SET is_deleted = 1,
           stage = 'archived',
           archived_at = NOW()
       WHERE id = ?`,
      [parseInt(req.params.id)],
    );

    if (updateResult.affectedRows > 0) {
      req.auditRecord = {
        id: parseInt(req.params.id),
        old: { stage: bp.stage, archived: Boolean(Number(bp.is_deleted)) },
        new: { stage: "archived", archived: true },
      };
    }

    res.json({ message: "Blueprint archived." });
  } catch (err) {
    console.error("archive blueprint error:", err);
    res.status(err.statusCode || 500).json({ message: err.message });
  }
};

// ── PATCH /api/blueprints/:id/restore ────────────────────────────────────────
exports.restore = async (req, res) => {
  try {
    const [[bp]] = await pool.query(
      `SELECT id, stage, is_deleted, archived_at
       FROM blueprints
       WHERE id = ?
       LIMIT 1`,
      [parseInt(req.params.id)],
    );

    if (!bp) {
      return res.status(404).json({ message: "Blueprint not found." });
    }

    const wasArchived =
      Number(bp.is_deleted) === 1 ||
      bp.archived_at != null ||
      bp.stage === "archived";

    await pool.query(
      `UPDATE blueprints
       SET is_deleted = 0,
           archived_at = NULL,
           stage = CASE
             WHEN stage = 'archived' THEN 'design'
             ELSE stage
           END
       WHERE id = ?`,
      [parseInt(req.params.id)],
    );

    if (wasArchived) {
      const newStage = bp.stage === "archived" ? "design" : bp.stage;
      req.auditRecord = {
        id: parseInt(req.params.id),
        old: { stage: bp.stage, archived: Boolean(Number(bp.is_deleted)) },
        new: { restored: true, archived: false, stage: newStage },
      };
    }

    res.json({ message: "Blueprint restored." });
  } catch (err) {
    console.error("restore blueprint error:", err);
    res.status(err.statusCode || 500).json({ message: err.message });
  }
};

// ── DELETE /api/blueprints/:id/permanent ─────────────────────────────────────
exports.permanentDelete = async (req, res) => {
  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    const [[bp]] = await conn.query(
      `SELECT id, is_deleted, stage
       FROM blueprints
       WHERE id = ?
       LIMIT 1`,
      [parseInt(req.params.id)],
    );

    if (!bp) {
      await conn.rollback();
      return res.status(404).json({ message: "Blueprint not found." });
    }

    if (Number(bp.is_deleted) !== 1) {
      await conn.rollback();
      return res.status(400).json({
        message: "Only archived blueprints can be permanently deleted.",
      });
    }

    const [[linkedOrder]] = await conn.query(
      `SELECT id
       FROM orders
       WHERE blueprint_id = ?
       LIMIT 1`,
      [parseInt(req.params.id)],
    );

    if (linkedOrder) {
      await conn.rollback();
      return res.status(400).json({
        message: "Cannot permanently delete blueprint linked to an order.",
      });
    }

    await deleteBlueprintCascade(conn, [Number(req.params.id)]);

    await conn.commit();

    req.auditRecord = {
      id: parseInt(req.params.id),
      old: { archived: true, stage: bp.stage },
      new: { permanently_deleted: true },
    };

    res.json({ message: "Blueprint permanently deleted." });
  } catch (err) {
    await conn.rollback();
    console.error("permanentDelete blueprint error:", err);
    res.status(err.statusCode || 500).json({ message: err.message });
  } finally {
    conn.release();
  }
};

// ── GET /api/blueprints/:id/estimation ───────────────────────────────────────
exports.getEstimation = async (req, res) => {
  const conn = await pool.getConnection();

  try {
    const blueprintId = parseInt(req.params.id);
    const lifecycle = await resolveLifecycleByBlueprint(conn, { blueprintId });

    // ── MULTIPLE_ORDER_OWNERS: no auto-draft, no active estimation ────────
    // Never guessed, never served — manual review required.
    if (lifecycle.reason === "MULTIPLE_ORDER_OWNERS") {
      return res.status(409).json({
        message: lifecycle.message,
        integrity_warning: true,
        integrity_reason: lifecycle.reason,
        conflicting_order_ids: lifecycle.conflicting_order_ids,
      });
    }

    // ── STALE_ESTIMATION: never serve the stale row as the active one ─────
    if (lifecycle.reason === "STALE_ESTIMATION") {
      const response = {
        id: null,
        blueprint_id: Number(blueprintId),
        integrity_warning: true,
        integrity_reason: lifecycle.reason,
        stale_candidate: lifecycle.stale_candidate
          ? {
              id: lifecycle.stale_candidate.id,
              created_at: lifecycle.stale_candidate.created_at,
              status: lifecycle.stale_candidate.status,
              grand_total: lifecycle.stale_candidate.grand_total,
            }
          : null,
        can_create_replacement_estimation:
          lifecycle.can_create_replacement_estimation,
        recovery_block_reason: lifecycle.recovery_block_reason,
      };

      // Only attach an unpersisted recovery draft when recovery is actually
      // allowed — reuses the same generator as the NO_ESTIMATION path below.
      if (lifecycle.can_create_replacement_estimation) {
        const autoDraft = await buildAutoEstimationDraft(conn, blueprintId);

        if (autoDraft) {
          Object.assign(response, {
            version: autoDraft.version || 0,
            status: autoDraft.status || "draft",
            auto_generated: true,
            auto_source: autoDraft.source || "unknown",
            is_recovery_draft: true,
            persisted: false,
            items: autoDraft.items || [],
            material_cost: autoDraft.material_cost || 0,
            items_total: autoDraft.items_total || 0,
            labor_cost: autoDraft.labor_cost || 0,
            overhead_cost: autoDraft.overhead_cost || 0,
            tax_rate: autoDraft.tax_rate ?? 12,
            discount: autoDraft.discount || 0,
            notes: autoDraft.notes || "",
            subtotal: autoDraft.subtotal || 0,
            tax_amount: autoDraft.tax_amount || 0,
            grand_total: autoDraft.grand_total || 0,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });
        }
      }

      return res.json(response);
    }

    // ── NO_ESTIMATION (or a resolved-but-missing blueprint): preserve the
    //    existing auto-draft behavior exactly, unchanged from before. ──────
    if (!lifecycle.estimation) {
      const autoDraft = await buildAutoEstimationDraft(conn, blueprintId);

      if (!autoDraft) {
        return res.status(404).json({ message: "No estimation yet." });
      }

      return res.json({
        id: null,
        blueprint_id: Number(blueprintId),
        version: autoDraft.version || 0,
        status: autoDraft.status || "draft",
        auto_generated: true,
        auto_source: autoDraft.source || "unknown",
        items: autoDraft.items || [],
        material_cost: autoDraft.material_cost || 0,
        items_total: autoDraft.items_total || 0,
        labor_cost: autoDraft.labor_cost || 0,
        overhead_cost: autoDraft.overhead_cost || 0,
        tax_rate: autoDraft.tax_rate ?? 12,
        discount: autoDraft.discount || 0,
        notes: autoDraft.notes || "",
        subtotal: autoDraft.subtotal || 0,
        tax_amount: autoDraft.tax_amount || 0,
        grand_total: autoDraft.grand_total || 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    }

    // ── Normal path: lifecycle-valid estimation only ───────────────────────
    const est = lifecycle.estimation;

    const [itemRows] = await conn.query(
      `SELECT id, estimation_id, component_id, raw_material_id, description, quantity, unit_cost, subtotal
       FROM estimation_items
       WHERE estimation_id = ?
       ORDER BY id ASC`,
      [parseInt(est.id)],
    );

    const meta = safeJsonParse(est.estimation_data, {});
    const dbItems = itemRows.map((row) => ({
      id: row.id,
      name: row.description || "",
      description: row.description || "",
      quantity: Number(row.quantity) || 1,
      unit: "pc",
      unit_cost: Number(row.unit_cost) || 0,
      note: "",
      source_key: "",
      source_type: "",
      subtotal:
        row.subtotal != null
          ? Number(row.subtotal) || 0
          : (Number(row.quantity) || 0) * (Number(row.unit_cost) || 0),
    }));

    const normalizedItems = normalizeEstimationItems(
      Array.isArray(meta.items) && meta.items.length ? meta.items : dbItems,
    );

    const computed = computeEstimationTotals({
      items: normalizedItems,
      labor_cost: meta.labor_cost ?? est.labor_cost ?? 0,
      overhead_cost: meta.overhead_cost ?? 0,
      tax_rate: meta.tax_rate ?? 12,
      discount: est.discount ?? meta.discount ?? 0,
    });

    const materialCostRaw = Number(est.material_cost);
    const laborCostRaw = Number(est.labor_cost);
    const taxRaw = Number(est.tax);
    const grandTotalRaw = Number(est.grand_total);
    const discountRaw = Number(est.discount);

    const material_cost = Number.isFinite(materialCostRaw)
      ? materialCostRaw
      : computed.material_cost;

    const labor_cost = Number.isFinite(laborCostRaw)
      ? laborCostRaw
      : computed.labor_cost;

    const overhead_cost = Number(meta.overhead_cost) || 0;
    const tax_rate = Number(meta.tax_rate ?? 12);
    const discount = Number.isFinite(discountRaw)
      ? discountRaw
      : computed.discount;

    const subtotal = material_cost + labor_cost + overhead_cost;

    const tax_amount = Number.isFinite(taxRaw) ? taxRaw : computed.tax_amount;

    const grand_total = Number.isFinite(grandTotalRaw)
      ? grandTotalRaw
      : computed.grand_total;

    res.json({
      ...est,
      items: normalizedItems,
      material_cost,
      items_total: material_cost,
      labor_cost,
      overhead_cost,
      tax_rate,
      discount,
      notes: meta.notes || "",
      subtotal,
      tax_amount,
      grand_total,
      integrity_warning: false,
      created_at: est.created_at || new Date().toISOString(),
      updated_at: est.updated_at || est.created_at || new Date().toISOString(),
    });
  } catch (err) {
    console.error("getEstimation error:", err);
    res.status(err.statusCode || 500).json({ message: err.message });
  } finally {
    conn.release();
  }
};

// ── POST /api/blueprints/:id/estimation ──────────────────────────────────────
exports.saveEstimation = async (req, res) => {
  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    const blueprintId = parseInt(req.params.id);

    const [[bp]] = await conn.query(
      `SELECT id, stage, is_deleted
       FROM blueprints
       WHERE id = ?
       LIMIT 1`,
      [blueprintId],
    );

    if (!bp) {
      await conn.rollback();
      return res.status(404).json({ message: "Blueprint not found." });
    }

    if (Number(bp.is_deleted) === 1) {
      await conn.rollback();
      return res
        .status(400)
        .json({ message: "Cannot save estimation for archived blueprint." });
    }

    const initialLifecycle = await resolveLifecycleByBlueprint(conn, {
      blueprintId,
    });

    // MULTIPLE_ORDER_OWNERS always blocks — never guessed, manual review
    // required regardless of any other condition. Structural ambiguity
    // across multiple orders isn't something a single-row lock can
    // protect against, so this check runs against the unlocked
    // classification.
    if (initialLifecycle.reason === "MULTIPLE_ORDER_OWNERS") {
      await conn.rollback();
      return res.status(409).json({
        message: initialLifecycle.message,
        integrity_reason: initialLifecycle.reason,
        conflicting_order_ids: initialLifecycle.conflicting_order_ids,
      });
    }

    if (
      initialLifecycle.status === "BLOCKED" &&
      initialLifecycle.reason !== "STALE_ESTIMATION"
    ) {
      // Realistically only BLUEPRINT_NOT_FOUND can reach here from a
      // blueprint-scoped call (e.g. a race where the blueprint was
      // deleted between the check above and this resolution).
      await conn.rollback();
      return res.status(409).json({
        message: initialLifecycle.message,
        integrity_reason: initialLifecycle.reason,
      });
    }

    // ── Concurrency protection ─────────────────────────────────────────
    // Re-resolve under a common lock (order+blueprint if linked, else the
    // blueprint row alone) with current (FOR UPDATE) reads of everything
    // that gates this write, so nothing here uses a pre-lock snapshot.
    let lifecycle = initialLifecycle;

    if (initialLifecycle.order) {
      lifecycle = await resolveLifecycleByOrder(conn, {
        orderId: initialLifecycle.order.id,
        lockOrder: true,
        lockBlueprint: true,
        lockEstimation: true,
        lockContext: true,
      });

      if (lifecycle.reason === "MULTIPLE_ORDER_OWNERS") {
        await conn.rollback();
        return res.status(409).json({
          message: lifecycle.message,
          integrity_reason: lifecycle.reason,
          conflicting_order_ids: lifecycle.conflicting_order_ids,
        });
      }

      if (
        lifecycle.status === "BLOCKED" &&
        lifecycle.reason !== "STALE_ESTIMATION"
      ) {
        await conn.rollback();
        return res.status(409).json({
          message: lifecycle.message,
          integrity_reason: lifecycle.reason,
        });
      }
    } else {
      lifecycle = await resolveLifecycleByBlueprint(conn, {
        blueprintId,
        lockBlueprint: true,
        lockEstimation: true,
      });

      if (lifecycle.reason === "MULTIPLE_ORDER_OWNERS") {
        await conn.rollback();
        return res.status(409).json({
          message: lifecycle.message,
          integrity_reason: lifecycle.reason,
          conflicting_order_ids: lifecycle.conflicting_order_ids,
        });
      }

      if (
        lifecycle.status === "BLOCKED" &&
        lifecycle.reason !== "STALE_ESTIMATION"
      ) {
        await conn.rollback();
        return res.status(409).json({
          message: lifecycle.message,
          integrity_reason: lifecycle.reason,
        });
      }
    }

    // Re-checked against the just-locked blueprint row, not the earlier
    // unlocked read at the top of this function.
    if (
      lifecycle.blueprint &&
      (Number(lifecycle.blueprint.is_deleted) === 1 ||
        String(lifecycle.blueprint.stage || "").toLowerCase() === "archived")
    ) {
      await conn.rollback();
      return res.status(409).json({
        message: "Cannot save estimation for archived blueprint.",
        integrity_reason: "BLUEPRINT_ARCHIVED",
      });
    }

    // STALE_ESTIMATION blocks unless the (now-locked, re-checked)
    // resolver confirms a replacement is still safe to create.
    if (
      lifecycle.reason === "STALE_ESTIMATION" &&
      !lifecycle.can_create_replacement_estimation
    ) {
      await conn.rollback();
      return res.status(409).json({
        message: lifecycle.message,
        integrity_reason: lifecycle.reason,
        recovery_block_reason: lifecycle.recovery_block_reason,
      });
    }

    // Final order-state gate, re-checked against the locked row. A
    // linked order must be exactly "confirmed" — "pending" is no longer
    // accepted here, since a blueprint only ever gets linked to an order
    // once that order has already been approved into "confirmed" by
    // approveCustomRequest. Blueprint-only context (no linked order)
    // skips this gate entirely.
    const order = lifecycle.order;

    if (order) {
      const normalizedStatus = String(order.status || "").toLowerCase();

      if (normalizedStatus !== "confirmed") {
        await conn.rollback();
        return res.status(409).json({
          message: `Order status is "${order.status}"; must be exactly "confirmed" to save an estimation.`,
          integrity_reason: "ORDER_NOT_CONFIRMED",
        });
      }

      if (lifecycle.contract) {
        await conn.rollback();
        return res.status(409).json({
          message: "A contract already exists for this order.",
          integrity_reason: "CONTRACT_EXISTS",
        });
      }

      if (lifecycle.verified_payment_total > 0) {
        await conn.rollback();
        return res.status(409).json({
          message: `Order already has a verified payment total of ${lifecycle.verified_payment_total}.`,
          integrity_reason: "VERIFIED_PAYMENT_EXISTS",
        });
      }

      if (lifecycle.has_pending_payment_transaction) {
        await conn.rollback();
        return res.status(409).json({
          message: "Order has a pending payment proof awaiting review.",
          integrity_reason: "PENDING_PAYMENT_EXISTS",
        });
      }
    }

    const {
      items = [],
      labor_cost = 0,
      overhead_cost = 0,
      tax_rate = 12,
      discount = 0,
      notes = "",
    } = req.body;

    const normalizedItems = normalizeEstimationItems(items);

    const totals = computeEstimationTotals({
      items: normalizedItems,
      labor_cost,
      overhead_cost,
      tax_rate,
      discount,
    });

    // Version calculation uses the lifecycle-valid estimation only — a
    // stale row is never used to derive the next version number, so a
    // reused blueprint_id can no longer inflate a fresh blueprint's first
    // real estimation into "version 4" or similar.
    const version = lifecycle.estimation
      ? Number(lifecycle.estimation.version || 0) + 1
      : 1;

    const estimation_data = JSON.stringify({
      items: normalizedItems,
      labor_cost: totals.labor_cost,
      overhead_cost: totals.overhead_cost,
      tax_rate: totals.tax_rate,
      discount: totals.discount,
      notes,
      material_cost: totals.material_cost,
      items_total: totals.items_total,
      subtotal: totals.subtotal,
      tax_amount: totals.tax_amount,
      grand_total: totals.grand_total,
    });

    const [insertResult] = await conn.query(
      `INSERT INTO estimations
        (blueprint_id, version, material_cost, labor_cost, tax, discount, grand_total, estimation_data, status)
       VALUES (?,?,?,?,?,?,?,?,'draft')`,
      [
        blueprintId,
        version,
        totals.material_cost,
        totals.labor_cost,
        totals.tax_amount,
        totals.discount,
        totals.grand_total,
        estimation_data,
      ],
    );

    for (const item of normalizedItems) {
      await conn.query(
        `INSERT INTO estimation_items
          (estimation_id, component_id, raw_material_id, description, quantity, unit_cost)
        VALUES (?,?,?,?,?,?)`,
        [
          insertResult.insertId,
          item.component_id || null,
          item.raw_material_id || null,
          item.name,
          item.quantity,
          item.unit_cost,
        ],
      );
    }

    await conn.query(
      `UPDATE blueprints
       SET stage = 'estimation'
       WHERE id = ? AND is_deleted = 0`,
      [blueprintId],
    );

    // Restricted to the ONE canonical linked order, locked and re-checked
    // moments earlier — never a blanket WHERE blueprint_id = ? match.
    // The WHERE clause repeats order_type/status as a final DB-level
    // backstop even though both were already verified under lock above,
    // and affectedRows is checked so the new estimation can never be
    // committed while the order it belongs to silently failed to update.
    if (order) {
      const [orderUpdateResult] = await conn.query(
        `UPDATE orders
         SET subtotal = ?,
             tax = ?,
             discount = ?,
             total = ?,
             down_payment = ?,
             updated_at = NOW()
         WHERE id = ?
           AND order_type = 'blueprint'
           AND status = 'confirmed'`,
        [
          totals.subtotal,
          totals.tax_amount,
          totals.discount,
          totals.grand_total,
          Number((totals.grand_total * 0.3).toFixed(2)),
          order.id,
        ],
      );

      if (orderUpdateResult.affectedRows === 0) {
        await conn.rollback();
        return res.status(409).json({
          message:
            "Order status changed before the estimation could be saved. Please refresh and try again.",
          integrity_reason: "ORDER_STATE_CHANGED",
        });
      }
    }

    await conn.commit();

    req.auditRecord = {
      id: insertResult.insertId,
      old: null,
      new: {
        blueprint_id: blueprintId,
        estimation_created: true,
        version,
        status: "draft",
        changed_fields: ["estimation"],
      },
    };

    res.status(201).json({
      message: "Estimation saved.",
      id: insertResult.insertId,
      estimation: {
        id: insertResult.insertId,
        blueprint_id: blueprintId,
        version,
        items: normalizedItems,
        material_cost: totals.material_cost,
        items_total: totals.items_total,
        labor_cost: totals.labor_cost,
        overhead_cost: totals.overhead_cost,
        tax_rate: totals.tax_rate,
        discount: totals.discount,
        notes,
        subtotal: totals.subtotal,
        tax_amount: totals.tax_amount,
        grand_total: totals.grand_total,
        status: "draft",
      },
    });
  } catch (err) {
    await conn.rollback();
    console.error("saveEstimation error:", err);
    res.status(err.statusCode || 500).json({ message: err.message });
  } finally {
    conn.release();
  }
};

exports.approveEstimation = async (req, res) => {
  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    const blueprintId = Number(req.params.id) || 0;

    const [[bp]] = await conn.query(
      `SELECT id, is_deleted
       FROM blueprints
       WHERE id = ?
       LIMIT 1`,
      [blueprintId],
    );

    if (!bp) {
      await conn.rollback();
      return res.status(404).json({ message: "Blueprint not found." });
    }

    if (Number(bp.is_deleted) === 1) {
      await conn.rollback();
      return res.status(400).json({
        message: "Cannot send estimation for archived blueprint.",
      });
    }

    const initialLifecycle = await resolveLifecycleByBlueprint(conn, {
      blueprintId,
    });

    if (initialLifecycle.status === "BLOCKED") {
      await conn.rollback();
      return res.status(409).json({
        message: initialLifecycle.message,
        integrity_reason: initialLifecycle.reason,
        conflicting_order_ids: initialLifecycle.conflicting_order_ids,
        can_create_replacement_estimation:
          initialLifecycle.can_create_replacement_estimation,
        recovery_block_reason: initialLifecycle.recovery_block_reason,
      });
    }

    // Common order+blueprint lock + current (FOR UPDATE) reads of the
    // estimation and contract/payment context — see
    // blueprintLifecycleService.js header comment for why each is needed.
    let lifecycle = initialLifecycle;

    if (initialLifecycle.order) {
      lifecycle = await resolveLifecycleByOrder(conn, {
        orderId: initialLifecycle.order.id,
        lockOrder: true,
        lockBlueprint: true,
        lockEstimation: true,
        lockContext: true,
      });

      if (lifecycle.status === "BLOCKED") {
        await conn.rollback();
        return res.status(409).json({
          message: lifecycle.message,
          integrity_reason: lifecycle.reason,
          conflicting_order_ids: lifecycle.conflicting_order_ids,
          can_create_replacement_estimation:
            lifecycle.can_create_replacement_estimation,
          recovery_block_reason: lifecycle.recovery_block_reason,
        });
      }
    }

    // Re-checked against the just-locked blueprint row, not the earlier
    // unlocked read at the top of this function.
    if (
      lifecycle.blueprint &&
      (Number(lifecycle.blueprint.is_deleted) === 1 ||
        String(lifecycle.blueprint.stage || "").toLowerCase() === "archived")
    ) {
      await conn.rollback();
      return res.status(409).json({
        message: "Cannot send estimation for archived blueprint.",
        integrity_reason: "BLUEPRINT_ARCHIVED",
      });
    }

    if (!lifecycle.estimation) {
      await conn.rollback();
      return res.status(404).json({
        message: "No estimation found to send.",
      });
    }

    const latestEstimation = lifecycle.estimation;
    const order = lifecycle.order;

    if (!order) {
      await conn.rollback();
      return res.status(400).json({
        message: "This blueprint is not yet linked to an order.",
      });
    }

    if (String(order.status || "").toLowerCase() !== "confirmed") {
      await conn.rollback();
      return res.status(400).json({
        message: `Order must be confirmed before a quotation can be sent (current status: "${order.status}").`,
      });
    }

    if (lifecycle.contract) {
      await conn.rollback();
      return res.status(400).json({
        message:
          "A contract already exists for this order; the quotation can no longer be sent for revision.",
      });
    }

    if (lifecycle.verified_payment_total > 0) {
      await conn.rollback();
      return res.status(400).json({
        message: `Order already has a verified payment total of ${lifecycle.verified_payment_total}; this quotation can no longer be revised or re-sent.`,
      });
    }

    if (lifecycle.has_pending_payment_transaction) {
      await conn.rollback();
      return res.status(400).json({
        message:
          "Order has a pending payment proof awaiting review; resolve it through the normal payment-review flow before sending a new quotation.",
      });
    }

    const currentStatus = String(latestEstimation.status || "")
      .trim()
      .toLowerCase();

    if (currentStatus === "approved") {
      await conn.commit();
      return res.json({
        message: "Quotation is already approved by the customer.",
        estimation: latestEstimation,
      });
    }

    if (currentStatus === "sent") {
      await conn.commit();
      return res.json({
        message: "Quotation is already sent to the customer.",
        estimation: latestEstimation,
      });
    }

    if (currentStatus === "rejected") {
      await conn.rollback();
      return res.status(409).json({
        message:
          "This quotation was rejected by the customer and needs a revised estimation before it can be sent again.",
        integrity_reason: "ESTIMATION_REJECTED",
      });
    }

    if (currentStatus !== "draft") {
      await conn.rollback();
      return res.status(409).json({
        message:
          "Quotation state changed before it could be sent. Please refresh and try again.",
        integrity_reason: "ESTIMATION_STATE_CHANGED",
      });
    }

    // affectedRows is defense-in-depth; the lockEstimation read above
    // already row-locks this exact record.
    const [updateResult] = await conn.query(
      `UPDATE estimations
       SET status = 'sent',
           approved_by = NULL,
           approved_at = NULL,
           updated_at = NOW()
       WHERE id = ?
         AND status = 'draft'`,
      [parseInt(latestEstimation.id)],
    );

    if (updateResult.affectedRows === 0) {
      const [[freshEstimation]] = await conn.query(
        `SELECT *
         FROM estimations
         WHERE id = ?
         LIMIT 1
         FOR UPDATE`,
        [parseInt(latestEstimation.id)],
      );

      await conn.rollback();

      if (!freshEstimation) {
        return res.status(404).json({ message: "No estimation found to send." });
      }

      const freshStatus = String(freshEstimation.status || "")
        .trim()
        .toLowerCase();

      if (freshStatus === "sent") {
        return res.json({
          message: "Quotation is already sent to the customer.",
          estimation: freshEstimation,
        });
      }

      if (freshStatus === "approved") {
        return res.json({
          message: "Quotation is already approved by the customer.",
          estimation: freshEstimation,
        });
      }

      if (freshStatus === "rejected") {
        return res.status(409).json({
          message:
            "This quotation was rejected by the customer and needs a revised estimation before it can be sent again.",
          integrity_reason: "ESTIMATION_REJECTED",
        });
      }

      return res.status(409).json({
        message:
          "Quotation state changed before it could be sent. Please refresh and try again.",
        integrity_reason: "ESTIMATION_STATE_CHANGED",
      });
    }

    await conn.query(
      `UPDATE blueprints
       SET stage = 'approval'
       WHERE id = ?`,
      [blueprintId],
    );

    if (Number(order.customer_id) > 0) {
      try {
        await conn.query(
          `INSERT INTO notifications
            (user_id, type, title, message, is_read, channel, sent_at, created_at)
           VALUES (?, ?, ?, ?, 0, 'system', NOW(), NOW())`,
          [
            parseInt(order.customer_id),
            "estimation_sent",
            "Quotation Ready for Review",
            `Your quotation for ${order.order_number || `order #${order.id}`} is ready. Please review it from your custom request page.`,
          ],
        );
      } catch (notifyErr) {
        console.error("[approveEstimation notification skipped]", notifyErr);
      }
    }

    const [[sentEstimation]] = await conn.query(
      `SELECT *
       FROM estimations
       WHERE id = ?
       LIMIT 1`,
      [parseInt(latestEstimation.id)],
    );

    await conn.commit();

    req.auditRecord = {
      id: parseInt(latestEstimation.id),
      old: { status: currentStatus },
      new: {
        status: "sent",
        changed_fields: [
          "status",
          ...(latestEstimation.approved_by != null ? ["approved_by"] : []),
          ...(latestEstimation.approved_at != null ? ["approved_at"] : []),
        ],
      },
    };

    return res.json({
      message: "Quotation sent to customer for approval.",
      estimation: sentEstimation,
    });
  } catch (err) {
    await conn.rollback();
    console.error("approveEstimation error:", err);
    return res.status(err.statusCode || 500).json({
      message: err.message || "Failed to send quotation to customer.",
    });
  } finally {
    conn.release();
  }
};