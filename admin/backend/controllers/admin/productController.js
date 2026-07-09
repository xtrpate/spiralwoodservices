// controllers/productController.js – Product Management (Admin)
const pool = require("../../config/db");
const {
  isValidNonNegativeNumber,
  isValidNonNegativeInteger,
  isNonEmptyString,
} = require("../../utils/validators");

// Shared helper: rolls back the transaction, releases the connection,
// and sends a clear 400 error. Used by both create and update below.
async function respondInvalid(conn, res, message) {
  await conn.rollback();
  conn.release();
  return res.status(400).json({ message });
}

// ── GET /api/products ─────────────────────────────────────────────────────────
exports.getAll = async (req, res) => {
  try {
    const {
      search,
      type,
      status,
      category_id,
      featured,
      page = 1,
      limit = 20,
    } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const where = ["1=1"];
    const params = [];

    if (search) {
      where.push("(p.name LIKE ? OR p.barcode LIKE ?)");
      params.push(`%${search}%`, `%${search}%`);
    }
    if (type) {
      where.push("p.type = ?");
      params.push(type);
    }
    if (status) {
      where.push("p.stock_status = ?");
      params.push(status);
    }
    if (category_id) {
      where.push("p.category_id = ?");
      params.push(category_id);
    }
    if (featured) {
      where.push("p.is_featured = ?");
      params.push(featured === "true" ? 1 : 0);
    }

    const [products] = await pool.query(
      `SELECT p.*, c.name AS category_name
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       WHERE ${where.join(" AND ")}
       ORDER BY p.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), offset],
    );

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM products p WHERE ${where.join(" AND ")}`,
      params,
    );

    res.json({ products, total, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ── GET /api/products/:id ─────────────────────────────────────────────────────
exports.getOne = async (req, res) => {
  try {
    const [[product]] = await pool.query(
      `SELECT p.*, c.name AS category_name
       FROM products p LEFT JOIN categories c ON c.id = p.category_id
       WHERE p.id = ?`,
      [parseInt(req.params.id)],
    );
    if (!product)
      return res.status(404).json({ message: "Product not found." });

    const [variations] = await pool.query(
      "SELECT * FROM product_variations WHERE product_id = ?",
      [parseInt(req.params.id)],
    );
    const [bom] = await pool.query(
      `SELECT bom.*, rm.name AS material_name, rm.unit
       FROM bill_of_materials bom
       JOIN raw_materials rm ON rm.id = bom.raw_material_id
       WHERE bom.product_id = ?`,
      [parseInt(req.params.id)],
    );

    res.json({ ...product, variations, bill_of_materials: bom });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ── POST /api/products ────────────────────────────────────────────────────────
exports.create = async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const {
      barcode,
      name,
      description,
      category_id,
      type = "standard",
      online_price,
      walkin_price,
      production_cost,
      stock,
      reorder_point,
      is_featured = false,
      is_published = 1,
      blueprint_id,
      variations = "[]",
      bill_of_materials = "[]",
    } = req.body;

    // ── Input validation ──────────────────────────────────────────────
    if (!isNonEmptyString(name)) {
      return respondInvalid(conn, res, "Product name is required.");
    }
    if (online_price === undefined || online_price === null || online_price === "") {
      return respondInvalid(conn, res, "Online price is required.");
    }
    if (!isValidNonNegativeNumber(online_price)) {
      return respondInvalid(conn, res, "Online price must be a valid non-negative number.");
    }
    if (walkin_price === undefined || walkin_price === null || walkin_price === "") {
      return respondInvalid(conn, res, "Walk-in price is required.");
    }
    if (!isValidNonNegativeNumber(walkin_price)) {
      return respondInvalid(conn, res, "Walk-in price must be a valid non-negative number.");
    }
    if (!isValidNonNegativeNumber(production_cost)) {
      return respondInvalid(conn, res, "Production cost must be a valid non-negative number.");
    }
    if (!isValidNonNegativeInteger(stock)) {
      return respondInvalid(conn, res, "Stock must be a valid non-negative whole number.");
    }
    if (!isValidNonNegativeInteger(reorder_point)) {
      return respondInvalid(conn, res, "Reorder point must be a valid non-negative whole number.");
    }

    const image_url = req.file
      ? `/uploads/products/${req.file.filename}`
      : null;

    const numOnlinePrice = online_price ? parseFloat(online_price) : 0;
    const numWalkinPrice = walkin_price ? parseFloat(walkin_price) : 0;
    const numProdCost = production_cost ? parseFloat(production_cost) : 0;
    const numStock = stock ? parseInt(stock) : 0;
    const numReorder = reorder_point ? parseInt(reorder_point) : 0;
    const boolFeatured =
      is_featured === "true" || is_featured === 1 || is_featured === true
        ? 1
        : 0;
    const catId =
      category_id && !isNaN(parseInt(category_id))
        ? parseInt(category_id)
        : null;
    const bpId =
      blueprint_id && !isNaN(parseInt(blueprint_id))
        ? parseInt(blueprint_id)
        : null;

    const [result] = await conn.query(
      `INSERT INTO products
         (barcode, name, description, category_id, type, image_url, is_featured, is_published, blueprint_id,
          online_price, walkin_price, production_cost, stock, reorder_point)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        barcode || null,
        name,
        description || null,
        catId,
        type,
        image_url,
        boolFeatured,
        is_published,
        bpId,
        numOnlinePrice,
        numWalkinPrice,
        numProdCost,
        numStock,
        numReorder,
      ],
    );
    const productId = result.insertId;

    // Auto-set stock_status
    await conn.query(
      `UPDATE products SET stock_status =
         CASE WHEN stock <= 0 THEN 'out_of_stock'
              WHEN stock <= reorder_point THEN 'low_stock'
              ELSE 'in_stock' END
       WHERE id = ?`,
      [productId],
    );

    // Variations
    const parsedVars =
      typeof variations === "string" ? JSON.parse(variations) : variations;
    for (const v of parsedVars) {
      const vLabel = v.name || v.value || "unnamed";
      if (!isValidNonNegativeNumber(v.unit_cost)) {
        return respondInvalid(conn, res, `Invalid unit cost for variation "${vLabel}".`);
      }
      if (!isValidNonNegativeNumber(v.selling_price)) {
        return respondInvalid(conn, res, `Invalid selling price for variation "${vLabel}".`);
      }
      if (!isValidNonNegativeInteger(v.stock)) {
        return respondInvalid(conn, res, `Invalid stock for variation "${vLabel}".`);
      }
      await conn.query(
        `INSERT INTO product_variations
           (product_id, variation_type, variation_value, variation_name,
            unit_cost, selling_price, stock)
         VALUES (?,?,?,?,?,?,?)`,
        [
          productId,
          v.type,
          v.value,
          v.name,
          v.unit_cost ? parseFloat(v.unit_cost) : 0,
          v.selling_price ? parseFloat(v.selling_price) : 0,
          v.stock ? parseInt(v.stock) : 0,
        ],
      );
    }

    // Bill of Materials
    const parsedBOM =
      typeof bill_of_materials === "string"
        ? JSON.parse(bill_of_materials)
        : bill_of_materials;
    for (const b of parsedBOM) {
      if (
        b.raw_material_id === undefined ||
        b.raw_material_id === null ||
        b.raw_material_id === "" ||
        !isValidNonNegativeInteger(b.raw_material_id) ||
        Number(b.raw_material_id) <= 0
      ) {
        return respondInvalid(conn, res, "Each bill of materials row needs a valid raw material selected.");
      }
      if (!isValidNonNegativeNumber(b.quantity)) {
        return respondInvalid(conn, res, "Bill of materials quantity must be a valid non-negative number.");
      }
      await conn.query(
        "INSERT INTO bill_of_materials (product_id, raw_material_id, quantity) VALUES (?,?,?)",
        [
          productId,
          parseInt(b.raw_material_id),
          b.quantity ? parseFloat(b.quantity) : 0,
        ],
      );
    }

    await conn.commit();
    req.auditRecord = { id: productId, new: { name, type } };
    res.status(201).json({ message: "Product created.", id: productId });
  } catch (err) {
    await conn.rollback();
    console.error("Create Error:", err);
    res.status(500).json({ message: err.message });
  } finally {
    conn.release();
  }
};

// ── PUT /api/products/:id ─────────────────────────────────────────────────────
exports.update = async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const productId = parseInt(req.params.id);

    const [[old]] = await conn.query("SELECT * FROM products WHERE id = ?", [
      productId,
    ]);
    if (!old) return res.status(404).json({ message: "Product not found." });

    // 👉 THE FIX: Explicitly allow only real database columns to prevent 'category_name' crashes
    const allowedColumns = [
      "barcode",
      "name",
      "description",
      "category_id",
      "type",
      "is_featured",
      "online_price",
      "walkin_price",
      "production_cost",
      "stock",
      "reorder_point",
      "is_published",
    ];

    // ── Input validation (only for fields actually being updated) ──────
    if (req.body.name !== undefined && !isNonEmptyString(req.body.name)) {
      return respondInvalid(conn, res, "Product name cannot be empty.");
    }
    if (
      req.body.online_price !== undefined &&
      (req.body.online_price === "" || !isValidNonNegativeNumber(req.body.online_price))
    ) {
      return respondInvalid(conn, res, "Online price must be a valid non-negative number.");
    }
    if (
      req.body.walkin_price !== undefined &&
      (req.body.walkin_price === "" || !isValidNonNegativeNumber(req.body.walkin_price))
    ) {
      return respondInvalid(conn, res, "Walk-in price must be a valid non-negative number.");
    }
    if (
      req.body.production_cost !== undefined &&
      !isValidNonNegativeNumber(req.body.production_cost)
    ) {
      return respondInvalid(conn, res, "Production cost must be a valid non-negative number.");
    }
    if (req.body.stock !== undefined && !isValidNonNegativeInteger(req.body.stock)) {
      return respondInvalid(conn, res, "Stock must be a valid non-negative whole number.");
    }
    if (
      req.body.reorder_point !== undefined &&
      !isValidNonNegativeInteger(req.body.reorder_point)
    ) {
      return respondInvalid(conn, res, "Reorder point must be a valid non-negative whole number.");
    }

    const updateData = {};
    allowedColumns.forEach((col) => {
      if (req.body[col] !== undefined) {
        // Safe conversions for numbers and booleans
        if (col === "is_featured" || col === "is_published") {
          updateData[col] =
            req.body[col] === "true" ||
            req.body[col] === 1 ||
            req.body[col] === true
              ? 1
              : 0;
        } else if (
          ["online_price", "walkin_price", "production_cost"].includes(col)
        ) {
          updateData[col] = req.body[col] ? parseFloat(req.body[col]) : 0;
        } else if (["stock", "reorder_point"].includes(col)) {
          updateData[col] = req.body[col] ? parseInt(req.body[col]) : 0;
        } else if (col === "category_id") {
          updateData[col] =
            req.body[col] && !isNaN(parseInt(req.body[col]))
              ? parseInt(req.body[col])
              : null;
        } else {
          updateData[col] = req.body[col] || null;
        }
      }
    });

    if (req.file) {
      updateData.image_url = `/uploads/products/${req.file.filename}`;
    }

    const keys = Object.keys(updateData);
    if (keys.length > 0) {
      const sets = keys.map((k) => `${k} = ?`).join(", ");
      const vals = [...Object.values(updateData), productId];
      await conn.query(`UPDATE products SET ${sets} WHERE id = ?`, vals);
    }

    // Recalculate stock_status
    await conn.query(
      `UPDATE products SET stock_status =
         CASE WHEN stock <= 0 THEN 'out_of_stock'
              WHEN stock <= reorder_point THEN 'low_stock'
              ELSE 'in_stock' END
       WHERE id = ?`,
      [productId],
    );

    // Replace variations if provided
    if (req.body.variations) {
      await conn.query("DELETE FROM product_variations WHERE product_id = ?", [
        productId,
      ]);
      const parsedVars =
        typeof req.body.variations === "string"
          ? JSON.parse(req.body.variations)
          : req.body.variations;
      for (const v of parsedVars) {
        const vLabel = v.name || v.value || "unnamed";
        if (!isValidNonNegativeNumber(v.unit_cost)) {
          return respondInvalid(conn, res, `Invalid unit cost for variation "${vLabel}".`);
        }
        if (!isValidNonNegativeNumber(v.selling_price)) {
          return respondInvalid(conn, res, `Invalid selling price for variation "${vLabel}".`);
        }
        if (!isValidNonNegativeInteger(v.stock)) {
          return respondInvalid(conn, res, `Invalid stock for variation "${vLabel}".`);
        }
        await conn.query(
          `INSERT INTO product_variations
             (product_id, variation_type, variation_value, variation_name, unit_cost, selling_price, stock)
           VALUES (?,?,?,?,?,?,?)`,
          [
            productId,
            v.type,
            v.value,
            v.name,
            v.unit_cost ? parseFloat(v.unit_cost) : 0,
            v.selling_price ? parseFloat(v.selling_price) : 0,
            v.stock ? parseInt(v.stock) : 0,
          ],
        );
      }
    }

    // Replace BOM if provided
    if (req.body.bill_of_materials) {
      await conn.query("DELETE FROM bill_of_materials WHERE product_id = ?", [
        productId,
      ]);
      const parsedBOM =
        typeof req.body.bill_of_materials === "string"
          ? JSON.parse(req.body.bill_of_materials)
          : req.body.bill_of_materials;
      for (const b of parsedBOM) {
        if (
          b.raw_material_id === undefined ||
          b.raw_material_id === null ||
          b.raw_material_id === "" ||
          !isValidNonNegativeInteger(b.raw_material_id) ||
          Number(b.raw_material_id) <= 0
        ) {
          return respondInvalid(conn, res, "Each bill of materials row needs a valid raw material selected.");
        }
        if (!isValidNonNegativeNumber(b.quantity)) {
          return respondInvalid(conn, res, "Bill of materials quantity must be a valid non-negative number.");
        }
        await conn.query(
          "INSERT INTO bill_of_materials (product_id, raw_material_id, quantity) VALUES (?,?,?)",
          [
            productId,
            parseInt(b.raw_material_id),
            b.quantity ? parseFloat(b.quantity) : 0,
          ],
        );
      }
    }

    await conn.commit();
    req.auditRecord = { id: productId, old, new: updateData };
    res.json({ message: "Product updated successfully." });
  } catch (err) {
    await conn.rollback();
    console.error("Update Error:", err);
    res.status(500).json({ message: err.message });
  } finally {
    conn.release();
  }
};

// ── DELETE /api/products/:id ──────────────────────────────────────────────────
exports.remove = async (req, res) => {
  try {
    const [[p]] = await pool.query(
      "SELECT id, name FROM products WHERE id = ?",
      [parseInt(req.params.id)],
    );
    if (!p) return res.status(404).json({ message: "Product not found." });

    await pool.query("DELETE FROM products WHERE id = ?", [
      parseInt(req.params.id),
    ]);

    req.auditRecord = { id: req.params.id, old: p };
    res.json({ message: "Product deleted." });
  } catch (err) {
    // 👉 THE FIX: Catch the specific Foreign Key Constraint error!
    if (err.code === "ER_ROW_IS_REFERENCED_2") {
      return res.status(400).json({
        message:
          "Cannot delete this product because it is part of existing customer orders. Please unpublish it instead to hide it from the store.",
      });
    }

    // Fallback for any other database errors
    res.status(500).json({ message: err.message });
  }
};

// ── PATCH /api/products/:id/featured ─────────────────────────────────────────
exports.toggleFeatured = async (req, res) => {
  try {
    await pool.query(
      "UPDATE products SET is_featured = NOT is_featured WHERE id = ?",
      [parseInt(req.params.id)],
    );
    const [[{ is_featured }]] = await pool.query(
      "SELECT is_featured FROM products WHERE id = ?",
      [parseInt(req.params.id)],
    );
    res.json({ is_featured: !!is_featured });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ── GET /api/products/report ──────────────────────────────────────────────────
exports.getReport = async (req, res) => {
  try {
    // ── FIXED: Added empty array [] ──
    const [rows] = await pool.query(
      `SELECT p.barcode, p.name, c.name AS category, p.type,
              p.online_price, p.walkin_price, p.production_cost,
              p.profit_margin, p.stock, p.stock_status, p.is_featured
       FROM products p LEFT JOIN categories c ON c.id = p.category_id
       ORDER BY p.name ASC`,
      [],
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ── PATCH /api/products/bulk-publish ─────────────────────────────────────────
exports.bulkPublish = async (req, res) => {
  try {
    const { ids, is_published } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ message: "No product IDs provided." });
    }

    // Convert true/false to MySQL's 1/0
    const publishValue = is_published ? 1 : 0;

    // The (?) automatically unpacks the array of IDs for MySQL
    await pool.query("UPDATE products SET is_published = ? WHERE id IN (?)", [
      publishValue,
      ids,
    ]);

    res.json({ message: "Products updated successfully." });
  } catch (err) {
    console.error("[bulkPublish Error]:", err);
    res.status(500).json({ message: err.message });
  }
};

// ── PATCH /api/products/:id/publish ─────────────────────────────────────────
exports.togglePublish = async (req, res) => {
  try {
    const { is_published } = req.body;
    const publishValue = is_published ? 1 : 0;

    await pool.query("UPDATE products SET is_published = ? WHERE id = ?", [
      publishValue,
      parseInt(req.params.id),
    ]);

    res.json({ is_published: !!publishValue });
  } catch (err) {
    console.error("[togglePublish Error]:", err);
    res.status(500).json({ message: err.message });
  }
};

// ── PATCH /api/products/blueprint/:blueprint_id/unpublish ─────────────────
exports.unpublishByBlueprint = async (req, res) => {
  try {
    const blueprintId = parseInt(req.params.blueprint_id);

    const [result] = await pool.query(
      "UPDATE products SET is_published = 0 WHERE blueprint_id = ?",
      [blueprintId],
    );

    if (result.affectedRows === 0) {
      return res
        .status(404)
        .json({ message: "No live products found for this blueprint." });
    }

    res.json({ message: "Blueprint product unpublished successfully." });
  } catch (err) {
    console.error("[unpublishByBlueprint Error]:", err);
    res.status(500).json({ message: err.message });
  }
};