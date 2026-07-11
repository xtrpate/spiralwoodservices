// controllers/inventoryController.js – Raw Materials, Build Materials, Stock Movement
const pool = require("../../config/db");
const {
  isValidNonNegativeInteger,
  isValidUnitLabel,
  isNonEmptyString,
  isValidPhoneNumber,
  isValidEmail,
} = require("../../utils/validators");
const POSITIVE_MOVEMENT_TYPES = new Set(["in", "return"]);

const computeStockStatus = (quantity, reorderPoint = 0) => {
  const qty = Number(quantity) || 0;
  const reorder = Number(reorderPoint) || 0;

  if (qty <= 0) return "out_of_stock";
  if (qty <= reorder) return "low_stock";
  return "in_stock";
};

// ═══════════════════════════════════════════════════════════
// RAW MATERIALS
// ═══════════════════════════════════════════════════════════

exports.getRawMaterials = async (req, res) => {
  try {
    const {
      search,
      status,
      supplier_id,
      category_id,
      page = 1,
      limit = 20,
    } = req.query;
    const offset = (page - 1) * limit;
    const where = ["1=1"];
    const params = [];

    if (search) {
      where.push("(rm.name LIKE ?)");
      params.push(`%${search}%`);
    }
    if (status) {
      where.push("rm.stock_status = ?");
      params.push(status);
    }
    if (supplier_id) {
      where.push("rm.supplier_id = ?");
      params.push(supplier_id);
    }
    if (category_id) {
      where.push("rm.category_id = ?");
      params.push(category_id);
    }

    const [rows] = await pool.query(
      `SELECT rm.*, s.name AS supplier_name, c.name AS category_name
       FROM raw_materials rm
       LEFT JOIN suppliers s  ON s.id  = rm.supplier_id
       LEFT JOIN categories c ON c.id  = rm.category_id
       WHERE ${where.join(" AND ")}
       ORDER BY rm.name ASC
       LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), parseInt(offset)],
    );

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM raw_materials rm WHERE ${where.join(" AND ")}`,
      params,
    );

    res.json({ rows, total });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.createRawMaterial = async (req, res) => {
  try {
    const {
      name,
      category_id = null,
      unit,
      quantity = 0,
      reorder_point = 0,
      unit_cost = 0,
      supplier_id = null,
    } = req.body;

    const qty = Number(quantity);
    const reorderPoint = Number(reorder_point);
    const unitCost = Number(unit_cost);

    if (!name || !String(name).trim()) {
      return res.status(400).json({ message: "Material name is required." });
    }

    if (!unit || !String(unit).trim()) {
      return res.status(400).json({ message: "Unit is required." });
    }

    if (!isValidUnitLabel(unit)) {
      return res.status(400).json({
        message: "Unit must be a valid text label such as pcs, kg, meter, or sheet.",
      });
    }

    if ([qty, reorderPoint, unitCost].some((v) => Number.isNaN(v) || v < 0)) {
      return res.status(400).json({
        message:
          "Quantity, reorder point, and unit cost must be valid non-negative numbers.",
      });
    }

    if (
      category_id !== null &&
      category_id !== undefined &&
      category_id !== "" &&
      (!isValidNonNegativeInteger(category_id) || Number(category_id) <= 0)
    ) {
      return res.status(400).json({ message: "Category must be a valid selection." });
    }

    if (
      supplier_id !== null &&
      supplier_id !== undefined &&
      supplier_id !== "" &&
      (!isValidNonNegativeInteger(supplier_id) || Number(supplier_id) <= 0)
    ) {
      return res.status(400).json({ message: "Supplier must be a valid selection." });
    }

    const status = computeStockStatus(qty, reorderPoint);

    const [r] = await pool.query(
      `INSERT INTO raw_materials
         (name, category_id, unit, quantity, reorder_point, unit_cost, supplier_id, stock_status)
       VALUES (?,?,?,?,?,?,?,?)`,
      [
        String(name).trim(),
        category_id ? parseInt(category_id) : null,
        String(unit).trim(),
        qty,
        reorderPoint,
        unitCost,
        supplier_id ? parseInt(supplier_id) : null,
        status,
      ],
    );

    const [[savedMaterial]] = await pool.query(
      `SELECT id, name, category_id, unit, quantity, reorder_point, unit_cost, supplier_id, stock_status
       FROM raw_materials WHERE id = ?`,
      [r.insertId],
    );

    if (savedMaterial) {
      req.auditRecord = { id: r.insertId, old: null, new: savedMaterial };
    }

    res.status(201).json({ message: "Raw material created.", id: r.insertId });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.updateRawMaterial = async (req, res) => {
  try {
    const {
      name,
      category_id = null,
      unit,
      quantity = 0,
      reorder_point = 0,
      unit_cost = 0,
      supplier_id = null,
    } = req.body;

    const qty = Number(quantity);
    const reorderPoint = Number(reorder_point);
    const unitCost = Number(unit_cost);

    if (!name || !String(name).trim()) {
      return res.status(400).json({ message: "Material name is required." });
    }

    if (!unit || !String(unit).trim()) {
      return res.status(400).json({ message: "Unit is required." });
    }

    if (!isValidUnitLabel(unit)) {
      return res.status(400).json({
        message: "Unit must be a valid text label such as pcs, kg, meter, or sheet.",
      });
    }

    if ([qty, reorderPoint, unitCost].some((v) => Number.isNaN(v) || v < 0)) {
      return res.status(400).json({
        message:
          "Quantity, reorder point, and unit cost must be valid non-negative numbers.",
      });
    }

    if (
      category_id !== null &&
      category_id !== undefined &&
      category_id !== "" &&
      (!isValidNonNegativeInteger(category_id) || Number(category_id) <= 0)
    ) {
      return res.status(400).json({ message: "Category must be a valid selection." });
    }

    if (
      supplier_id !== null &&
      supplier_id !== undefined &&
      supplier_id !== "" &&
      (!isValidNonNegativeInteger(supplier_id) || Number(supplier_id) <= 0)
    ) {
      return res.status(400).json({ message: "Supplier must be a valid selection." });
    }

    const status = computeStockStatus(qty, reorderPoint);

    const materialId = parseInt(req.params.id);

    const [[before]] = await pool.query(
      `SELECT id, name, category_id, unit, quantity, reorder_point, unit_cost, supplier_id, stock_status
       FROM raw_materials WHERE id = ?`,
      [materialId],
    );

    const [updateResult] = await pool.query(
      `UPDATE raw_materials
       SET name=?, category_id=?, unit=?, quantity=?,
           reorder_point=?, unit_cost=?, supplier_id=?, stock_status=?
       WHERE id=?`,
      [
        String(name).trim(),
        category_id ? parseInt(category_id) : null,
        String(unit).trim(),
        qty,
        reorderPoint,
        unitCost,
        supplier_id ? parseInt(supplier_id) : null,
        status,
        materialId,
      ],
    );

    if (before && updateResult.affectedRows > 0) {
      const [[after]] = await pool.query(
        `SELECT id, name, category_id, unit, quantity, reorder_point, unit_cost, supplier_id, stock_status
         FROM raw_materials WHERE id = ?`,
        [materialId],
      );

      if (after) {
        req.auditRecord = { id: materialId, old: before, new: after };
      }
    }

    res.json({ message: "Raw material updated." });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.deleteRawMaterial = async (req, res) => {
  try {
    const materialId = parseInt(req.params.id);

    const [[before]] = await pool.query(
      `SELECT id, name, category_id, unit, quantity, reorder_point, unit_cost, supplier_id, stock_status
       FROM raw_materials WHERE id = ?`,
      [materialId],
    );

    const [deleteResult] = await pool.query(
      "DELETE FROM raw_materials WHERE id = ?",
      [materialId],
    );

    if (before && deleteResult.affectedRows > 0) {
      req.auditRecord = {
        id: materialId,
        old: before,
        new: { action: "deleted" },
      };
    }

    res.json({ message: "Raw material deleted." });
  } catch (err) {
    if (err.code === "ER_ROW_IS_REFERENCED_2") {
      return res.status(400).json({
        message:
          "Cannot delete this raw material because it is used in one or more product recipes (bill of materials) or stock movement records.",
      });
    }
    res.status(500).json({ message: err.message });
  }
};

// ═══════════════════════════════════════════════════════════
// STOCK MOVEMENTS
// ═══════════════════════════════════════════════════════════

exports.getStockMovements = async (req, res) => {
  try {
    const {
      type,
      from,
      to,
      product_id,
      material_id,
      page = 1,
      limit = 30,
    } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const where = ["1=1"];
    const params = [];

    if (type) {
      where.push("sm.type = ?");
      params.push(type);
    }
    if (product_id) {
      where.push("sm.product_id = ?");
      params.push(product_id);
    }
    if (material_id) {
      where.push("sm.material_id = ?");
      params.push(material_id);
    }
    if (from && to) {
      where.push("DATE(sm.created_at) BETWEEN ? AND ?");
      params.push(from, to);
    }

    const [rows] = await pool.query(
      `SELECT sm.*, u.name AS created_by_name,
              rm.name AS material_name, p.name AS product_name,
              s.name AS supplier_name
       FROM stock_movements sm
       LEFT JOIN users u         ON u.id  = sm.created_by
       LEFT JOIN raw_materials rm ON rm.id = sm.material_id
       LEFT JOIN products p       ON p.id  = sm.product_id
       LEFT JOIN suppliers s      ON s.id  = sm.supplier_id
       WHERE ${where.join(" AND ")}
       ORDER BY sm.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), parseInt(offset)],
    );

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM stock_movements sm WHERE ${where.join(" AND ")}`,
      params,
    );

    res.json({ rows, total });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.createStockMovement = async (req, res) => {
  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    const {
      material_id,
      product_id,
      type,
      quantity,
      supplier_id,
      order_id,
      reference,
      notes,
    } = req.body;

    const movementQty = Number(quantity);

    if (!["in", "out", "adjustment", "return"].includes(type)) {
      await conn.rollback();
      return res.status(400).json({ message: "Invalid stock movement type." });
    }

    if (!material_id && !product_id) {
      await conn.rollback();
      return res.status(400).json({
        message: "Please select either a raw material or a build material.",
      });
    }

    if (material_id && product_id) {
      await conn.rollback();
      return res.status(400).json({
        message:
          "Only one target is allowed per movement: raw material OR build material.",
      });
    }

    if (Number.isNaN(movementQty) || movementQty <= 0) {
      await conn.rollback();
      return res.status(400).json({
        message: "Quantity must be a valid number greater than 0.",
      });
    }

    if (
      supplier_id !== null &&
      supplier_id !== undefined &&
      supplier_id !== "" &&
      (!isValidNonNegativeInteger(supplier_id) || Number(supplier_id) <= 0)
    ) {
      await conn.rollback();
      return res.status(400).json({ message: "Supplier must be a valid selection." });
    }

    if (
      order_id !== null &&
      order_id !== undefined &&
      order_id !== "" &&
      (!isValidNonNegativeInteger(order_id) || Number(order_id) <= 0)
    ) {
      await conn.rollback();
      return res.status(400).json({ message: "Order reference must be a valid selection." });
    }

    const delta = POSITIVE_MOVEMENT_TYPES.has(type)
      ? movementQty
      : -movementQty;

    // ───────────────────────────────────────────────────────────
    // RAW MATERIAL DIRECT MOVEMENT
    // ───────────────────────────────────────────────────────────
    if (material_id) {
      const [[material]] = await conn.query(
        `SELECT id, name, quantity, reorder_point
         FROM raw_materials
         WHERE id = ?
         FOR UPDATE`,
        [parseInt(material_id)],
      );

      if (!material) {
        await conn.rollback();
        return res.status(404).json({ message: "Raw material not found." });
      }

      const currentQty = Number(material.quantity) || 0;
      const newQty = currentQty + delta;

      if (newQty < 0) {
        await conn.rollback();
        return res.status(400).json({
          message: `Insufficient stock for ${material.name}. Available: ${currentQty}, needed: ${movementQty}.`,
        });
      }

      const [r] = await conn.query(
        `INSERT INTO stock_movements
           (material_id, product_id, type, quantity, supplier_id, order_id, reference, notes, created_by)
         VALUES (?,?,?,?,?,?,?,?,?)`,
        [
          parseInt(material_id),
          null,
          type,
          movementQty,
          supplier_id ? parseInt(supplier_id) : null,
          order_id ? parseInt(order_id) : null,
          reference || null,
          notes || null,
          parseInt(req.user.id),
        ],
      );

      await conn.query(
        `UPDATE raw_materials
         SET quantity = ?, stock_status = ?
         WHERE id = ?`,
        [
          newQty,
          computeStockStatus(newQty, material.reorder_point),
          parseInt(material_id),
        ],
      );

      await conn.commit();

      req.auditRecord = {
        id: r.insertId,
        old: null,
        new: {
          material_id: parseInt(material_id),
          product_id: null,
          type,
          quantity: movementQty,
          supplier_id: supplier_id ? parseInt(supplier_id) : null,
          order_id: order_id ? parseInt(order_id) : null,
          reference: reference || null,
          notes: notes || null,
          previous_stock: currentQty,
          new_stock: newQty,
        },
      };

      return res.status(201).json({
        message: "Stock movement recorded.",
        id: r.insertId,
      });
    }

    // ───────────────────────────────────────────────────────────
    // BUILD MATERIAL / PRODUCT MOVEMENT
    // ───────────────────────────────────────────────────────────
    const [[product]] = await conn.query(
      `SELECT id, name, stock, reorder_point
       FROM products
       WHERE id = ?
       FOR UPDATE`,
      [parseInt(product_id)],
    );

    if (!product) {
      await conn.rollback();
      return res.status(404).json({ message: "Build material not found." });
    }

    const currentProductStock = Number(product.stock) || 0;

    // PRODUCT STOCK-IN = PRODUCTION
    // kapag nag-stock in ng build material, automatic deduct sa BOM raw materials
    if (type === "in") {
      const [bomRows] = await conn.query(
        `SELECT
            bom.raw_material_id,
            bom.quantity AS bom_quantity,
            rm.name AS material_name,
            rm.quantity AS available_quantity,
            rm.reorder_point
         FROM bill_of_materials bom
         INNER JOIN raw_materials rm ON rm.id = bom.raw_material_id
         WHERE bom.product_id = ?
         FOR UPDATE`,
        [parseInt(product_id)],
      );

      if (!bomRows.length) {
        await conn.rollback();
        return res.status(400).json({
          message: `No bill of materials found for ${product.name}.`,
        });
      }

      const shortages = [];
      const consumptionRows = bomRows.map((row) => {
        const requiredQty = (Number(row.bom_quantity) || 0) * movementQty;
        const availableQty = Number(row.available_quantity) || 0;

        if (requiredQty <= 0) {
          shortages.push(`${row.material_name} has an invalid BOM quantity.`);
        } else if (availableQty < requiredQty) {
          shortages.push(
            `${row.material_name} (available: ${availableQty}, needed: ${requiredQty})`,
          );
        }

        return {
          raw_material_id: row.raw_material_id,
          material_name: row.material_name,
          requiredQty,
          availableQty,
          reorder_point: Number(row.reorder_point) || 0,
        };
      });

      if (shortages.length) {
        await conn.rollback();
        return res.status(400).json({
          message: `Insufficient raw materials: ${shortages.join(", ")}`,
        });
      }

      // 1) record main product stock-in movement
      const [r] = await conn.query(
        `INSERT INTO stock_movements
           (material_id, product_id, type, quantity, supplier_id, order_id, reference, notes, created_by)
         VALUES (?,?,?,?,?,?,?,?,?)`,
        [
          null,
          parseInt(product_id),
          type,
          movementQty,
          supplier_id ? parseInt(supplier_id) : null,
          order_id ? parseInt(order_id) : null,
          reference || null,
          notes || null,
          parseInt(req.user.id),
        ],
      );

      // 2) add finished product stock
      const newProductStock = currentProductStock + movementQty;

      await conn.query(
        `UPDATE products
         SET stock = ?, stock_status = ?
         WHERE id = ?`,
        [
          newProductStock,
          computeStockStatus(newProductStock, product.reorder_point),
          parseInt(product_id),
        ],
      );

      // 3) deduct every raw material in BOM
      const bomDeductions = [];

      for (const item of consumptionRows) {
        const newRawQty = item.availableQty - item.requiredQty;

        await conn.query(
          `UPDATE raw_materials
           SET quantity = ?, stock_status = ?
           WHERE id = ?`,
          [
            newRawQty,
            computeStockStatus(newRawQty, item.reorder_point),
            parseInt(item.raw_material_id),
          ],
        );

        const [autoResult] = await conn.query(
          `INSERT INTO stock_movements
             (material_id, product_id, type, quantity, supplier_id, order_id, reference, notes, created_by)
           VALUES (?,?,?,?,?,?,?,?,?)`,
          [
            parseInt(item.raw_material_id),
            parseInt(product_id),
            "out",
            item.requiredQty,
            null,
            order_id ? parseInt(order_id) : null,
            reference || `PRODUCTION-${product_id}`,
            notes
              ? `${notes} | Auto-deducted for production of ${product.name}`
              : `Auto-deducted for production of ${product.name} x ${movementQty}`,
            parseInt(req.user.id),
          ],
        );

        bomDeductions.push({
          movement_id: autoResult.insertId,
          material_id: parseInt(item.raw_material_id),
          material_name: item.material_name,
          quantity: item.requiredQty,
          previous_stock: item.availableQty,
          new_stock: newRawQty,
        });
      }

      await conn.commit();

      req.auditRecord = {
        id: r.insertId,
        old: null,
        new: {
          material_id: null,
          product_id: parseInt(product_id),
          type,
          quantity: movementQty,
          supplier_id: supplier_id ? parseInt(supplier_id) : null,
          order_id: order_id ? parseInt(order_id) : null,
          reference: reference || null,
          notes: notes || null,
          previous_stock: currentProductStock,
          new_stock: newProductStock,
          auto_raw_material_deductions: bomDeductions,
        },
      };

      return res.status(201).json({
        message:
          "Product stock added and raw materials were deducted automatically.",
        id: r.insertId,
      });
    }

    // PRODUCT STOCK-OUT / RETURN / ADJUSTMENT
    const newProductStock = currentProductStock + delta;

    if (newProductStock < 0) {
      await conn.rollback();
      return res.status(400).json({
        message: `Insufficient stock for ${product.name}. Available: ${currentProductStock}, needed: ${movementQty}.`,
      });
    }

    const [r] = await conn.query(
      `INSERT INTO stock_movements
         (material_id, product_id, type, quantity, supplier_id, order_id, reference, notes, created_by)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [
        null,
        parseInt(product_id),
        type,
        movementQty,
        supplier_id ? parseInt(supplier_id) : null,
        order_id ? parseInt(order_id) : null,
        reference || null,
        notes || null,
        parseInt(req.user.id),
      ],
    );

    await conn.query(
      `UPDATE products
       SET stock = ?, stock_status = ?
       WHERE id = ?`,
      [
        newProductStock,
        computeStockStatus(newProductStock, product.reorder_point),
        parseInt(product_id),
      ],
    );

    await conn.commit();

    req.auditRecord = {
      id: r.insertId,
      old: null,
      new: {
        material_id: null,
        product_id: parseInt(product_id),
        type,
        quantity: movementQty,
        supplier_id: supplier_id ? parseInt(supplier_id) : null,
        order_id: order_id ? parseInt(order_id) : null,
        reference: reference || null,
        notes: notes || null,
        previous_stock: currentProductStock,
        new_stock: newProductStock,
      },
    };

    return res.status(201).json({
      message: "Stock movement recorded.",
      id: r.insertId,
    });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ message: err.message });
  } finally {
    conn.release();
  }
};

// ═══════════════════════════════════════════════════════════
// SUPPLIERS
// ═══════════════════════════════════════════════════════════

exports.getSuppliers = async (req, res) => {
  try {
    const { search } = req.query;
    const where = search ? "WHERE name LIKE ?" : "";
    const params = search ? [`%${search}%`] : [];
    const [rows] = await pool.query(
      `SELECT * FROM suppliers ${where} ORDER BY name ASC`,
      params,
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.createSupplier = async (req, res) => {
  try {
    const { name, address, contact_number, email } = req.body;

    if (!isNonEmptyString(name)) {
      return res.status(400).json({ message: "Supplier name is required." });
    }

    if (
      contact_number !== null &&
      contact_number !== undefined &&
      contact_number !== "" &&
      !isValidPhoneNumber(contact_number)
    ) {
      return res.status(400).json({
        message:
          "Contact number must be a valid phone number (digits, spaces, dashes, or + only).",
      });
    }

    if (
      email !== null &&
      email !== undefined &&
      email !== "" &&
      !isValidEmail(email)
    ) {
      return res.status(400).json({ message: "Email must be a valid email address." });
    }

    const [r] = await pool.query(
      "INSERT INTO suppliers (name, address, contact_number, email) VALUES (?,?,?,?)",
      [name, address, contact_number, email],
    );

    const [[savedSupplier]] = await pool.query(
      "SELECT id, name, address, contact_number, email FROM suppliers WHERE id = ?",
      [r.insertId],
    );

    if (savedSupplier) {
      req.auditRecord = { id: r.insertId, old: null, new: savedSupplier };
    }

    res.status(201).json({ message: "Supplier created.", id: r.insertId });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.updateSupplier = async (req, res) => {
  try {
    const { name, address, contact_number, email } = req.body;

    if (!isNonEmptyString(name)) {
      return res.status(400).json({ message: "Supplier name is required." });
    }

    if (
      contact_number !== null &&
      contact_number !== undefined &&
      contact_number !== "" &&
      !isValidPhoneNumber(contact_number)
    ) {
      return res.status(400).json({
        message:
          "Contact number must be a valid phone number (digits, spaces, dashes, or + only).",
      });
    }

    if (
      email !== null &&
      email !== undefined &&
      email !== "" &&
      !isValidEmail(email)
    ) {
      return res.status(400).json({ message: "Email must be a valid email address." });
    }

    const supplierId = parseInt(req.params.id);

    const [[before]] = await pool.query(
      "SELECT id, name, address, contact_number, email FROM suppliers WHERE id = ?",
      [supplierId],
    );

    const [updateResult] = await pool.query(
      "UPDATE suppliers SET name=?,address=?,contact_number=?,email=? WHERE id=?",
      [name, address, contact_number, email, supplierId],
    );

    if (before && updateResult.affectedRows > 0) {
      const [[after]] = await pool.query(
        "SELECT id, name, address, contact_number, email FROM suppliers WHERE id = ?",
        [supplierId],
      );

      if (after) {
        req.auditRecord = { id: supplierId, old: before, new: after };
      }
    }

    res.json({ message: "Supplier updated." });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.deleteSupplier = async (req, res) => {
  try {
    const supplierId = parseInt(req.params.id);

    const [[before]] = await pool.query(
      "SELECT id, name, address, contact_number, email FROM suppliers WHERE id = ?",
      [supplierId],
    );

    const [deleteResult] = await pool.query(
      "DELETE FROM suppliers WHERE id = ?",
      [supplierId],
    );

    if (before && deleteResult.affectedRows > 0) {
      req.auditRecord = {
        id: supplierId,
        old: before,
        new: { action: "deleted" },
      };
    }

    res.json({ message: "Supplier deleted." });
  } catch (err) {
    if (err.code === "ER_ROW_IS_REFERENCED_2") {
      return res.status(400).json({
        message:
          "Cannot delete this supplier because it is linked to one or more raw materials or stock movement records.",
      });
    }
    res.status(500).json({ message: err.message });
  }
};