// controllers/websiteController.js
const pool = require("../../config/db");
const path = require("path");
const fs = require("fs");

// ── SETTINGS ─────────────────────────────────────────────────────────────────
exports.getSettings = async (req, res) => {
  try {
    // ── FIXED: Added empty array [] ──
    const [rows] = await pool.query(
      "SELECT setting_key, value, group_name FROM website_settings ORDER BY group_name, setting_key",
      [],
    );
    const grouped = rows.reduce((acc, r) => {
      (acc[r.group_name] = acc[r.group_name] || {})[r.setting_key] = r.value;
      return acc;
    }, {});
    res.json(grouped);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.updateSettings = async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    for (const [key, value] of Object.entries(req.body)) {
      await conn.query(
        "UPDATE website_settings SET value = ?, updated_by = ? WHERE setting_key = ?",
        [value, parseInt(req.user.id), key],
      );
    }
    if (req.file) {
      const logoUrl = `/uploads/settings/${req.file.filename}`;
      await conn.query(
        'UPDATE website_settings SET value = ?, updated_by = ? WHERE setting_key = "site_logo"',
        [logoUrl, parseInt(req.user.id)],
      );
    }
    await conn.commit();
    res.json({ message: "Settings updated." });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ message: err.message });
  } finally {
    conn.release();
  }
};

// ── FAQs ─────────────────────────────────────────────────────────────────────
exports.getFaqs = async (req, res) => {
  try {
    // ── FIXED: Added empty array [] ──
    const [rows] = await pool.query(
      "SELECT * FROM faqs ORDER BY sort_order ASC, id ASC",
      [],
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.createFaq = async (req, res) => {
  try {
    const { question, answer, sort_order = 0, is_visible = true } = req.body;
    const [r] = await pool.query(
      "INSERT INTO faqs (question, answer, sort_order, is_visible, created_by) VALUES (?,?,?,?,?)",
      [question, answer, sort_order, is_visible ? 1 : 0, parseInt(req.user.id)],
    );
    res.status(201).json({ message: "FAQ created.", id: r.insertId });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.updateFaq = async (req, res) => {
  try {
    const { question, answer, sort_order, is_visible } = req.body;
    // ── FIXED: Parsed ID ──
    await pool.query(
      "UPDATE faqs SET question=?,answer=?,sort_order=?,is_visible=? WHERE id=?",
      [
        question,
        answer,
        sort_order,
        is_visible ? 1 : 0,
        parseInt(req.params.id),
      ],
    );
    res.json({ message: "FAQ updated." });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.deleteFaq = async (req, res) => {
  try {
    // ── FIXED: Parsed ID ──
    await pool.query("DELETE FROM faqs WHERE id = ?", [
      parseInt(req.params.id),
    ]);
    res.json({ message: "FAQ deleted." });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ── STATIC PAGES ─────────────────────────────────────────────────────────────
exports.getPages = async (req, res) => {
  try {
    // ── FIXED: Added empty array [] ──
    const [rows] = await pool.query(
      "SELECT * FROM static_pages ORDER BY slug",
      [],
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getPage = async (req, res) => {
  try {
    const [[page]] = await pool.query(
      "SELECT * FROM static_pages WHERE slug = ?",
      [req.params.slug],
    );
    if (!page) return res.status(404).json({ message: "Page not found." });
    res.json(page);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.updatePage = async (req, res) => {
  try {
    const { title, content, is_visible } = req.body;
    await pool.query(
      "UPDATE static_pages SET title=?,content=?,is_visible=?,updated_by=? WHERE slug=?",
      [
        title,
        content,
        is_visible ? 1 : 0,
        parseInt(req.user.id),
        req.params.slug,
      ],
    );
    res.json({ message: "Page updated." });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ── BACKUP ───────────────────────────────────────────────────────────────────
async function generateSQLDump(filePath) {
  const conn = await pool.getConnection();
  const lines = [];

  lines.push("-- WISDOM Database Backup");
  lines.push(`-- Generated: ${new Date().toISOString()}`);
  lines.push(`-- Database: ${process.env.DB_NAME || "wisdom_db"}`);
  lines.push("");
  lines.push("SET FOREIGN_KEY_CHECKS=0;");
  lines.push('SET SQL_MODE="NO_AUTO_VALUE_ON_ZERO";');
  lines.push("");

  try {
    // Get all tables
    const [tables] = await conn.query("SHOW TABLES", []);
    const tableNames = tables.map((t) => Object.values(t)[0]);

    for (const table of tableNames) {
      // DROP + CREATE TABLE
      const [[createRow]] = await conn.query(
        `SHOW CREATE TABLE \`${table}\``,
        [],
      );
      const createSQL = createRow["Create Table"];
      lines.push(`-- Table: ${table}`);
      lines.push(`DROP TABLE IF EXISTS \`${table}\`;`);
      lines.push(createSQL + ";");
      lines.push("");

      // Row data
      const [rows] = await conn.query(`SELECT * FROM \`${table}\``, []);
      if (rows.length > 0) {
        const cols = Object.keys(rows[0])
          .map((c) => `\`${c}\``)
          .join(", ");
        const chunkSize = 100;
        for (let i = 0; i < rows.length; i += chunkSize) {
          const chunk = rows.slice(i, i + chunkSize);
          const values = chunk
            .map(
              (row) =>
                "(" +
                Object.values(row)
                  .map((v) => {
                    if (v === null) return "NULL";
                    if (typeof v === "number") return v;
                    if (v instanceof Date)
                      return `'${v.toISOString().slice(0, 19).replace("T", " ")}'`;
                    return `'${String(v).replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
                  })
                  .join(", ") +
                ")",
            )
            .join(",\n");
          lines.push(`INSERT INTO \`${table}\` (${cols}) VALUES`);
          lines.push(values + ";");
        }
        lines.push("");
      }
    }

    lines.push("SET FOREIGN_KEY_CHECKS=1;");
    fs.writeFileSync(filePath, lines.join("\n"), "utf8");
  } finally {
    conn.release();
  }
}

exports.getBackupLogs = async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT bl.*, u.name AS triggered_by_name,
              bl.storage_path AS file_url 
       FROM backup_logs bl
       LEFT JOIN users u ON u.id = bl.triggered_by
       ORDER BY bl.created_at DESC LIMIT 50`,
      [],
    );
    const normalized = rows.map((r) => ({
      ...r,
      filename: r.file_name,
      file_size: r.file_size_kb,
      file_url: `/backup/download/${r.file_name}`,
      triggered_by: r.triggered_by_name || "System",
    }));
    res.json(normalized);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.triggerManualBackup = async (req, res) => {
  try {
    const backupDir =
      process.env.BACKUP_DIR || path.join(__dirname, "../../backups");
    const absDir = path.isAbsolute(backupDir)
      ? backupDir
      : path.join(__dirname, "../../", backupDir);

    if (!fs.existsSync(absDir)) fs.mkdirSync(absDir, { recursive: true });

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const fileName = `wisdom_backup_manual_${timestamp}.sql`;
    const filePath = path.join(absDir, fileName);

    // 👉 This is the variable that went missing!
    let backupError = null;
    let sizeKb = 0;

    try {
      await generateSQLDump(filePath);
      sizeKb = fs.existsSync(filePath)
        ? Math.round(fs.statSync(filePath).size / 1024)
        : 0;
    } catch (e) {
      backupError = e.message;
    }

    const status = backupError ? "failed" : "success";

    await pool.query(
      `INSERT INTO backup_logs (type, triggered_by, file_name, file_size_kb, storage_path, status, notes)
       VALUES ('manual', ?, ?, ?, ?, ?, ?)`,
      [
        parseInt(req.user.id),
        fileName,
        sizeKb,
        filePath,
        status,
        backupError || null,
      ],
    );

    if (backupError) {
      return res.status(500).json({ message: "Backup failed: " + backupError });
    }

    res.json({
      message: "Backup completed successfully.",
      file: fileName,
      size_kb: sizeKb,
      file_url: `/backup/download/${fileName}`,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ── DOWNLOAD a specific backup file (admin-only, filename strictly validated) ─
const BACKUP_FILENAME_RE = /^[A-Za-z0-9_-]+\.sql$/;

exports.downloadBackup = async (req, res) => {
  try {
    const filename = String(req.params.filename || "");

    if (!BACKUP_FILENAME_RE.test(filename)) {
      return res.status(400).json({ message: "Invalid backup filename." });
    }

    const backupDir =
      process.env.BACKUP_DIR || path.join(__dirname, "../../backups");
    const absDir = path.isAbsolute(backupDir)
      ? backupDir
      : path.join(__dirname, "../../", backupDir);

    const filePath = path.join(absDir, filename);

    // Defense in depth: resolved file must still live directly inside absDir.
    if (path.dirname(filePath) !== absDir) {
      return res.status(400).json({ message: "Invalid backup filename." });
    }

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ message: "Backup file not found." });
    }

    res.download(filePath, filename);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};