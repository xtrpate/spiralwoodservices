// controllers/websiteController.js
const pool = require("../../config/db");
const path = require("path");
const fs = require("fs");

// Setting-key categorization for audit metadata only — does not affect
// validation or business behavior. Values are never logged, only which
// category of keys changed.
const PAYMENT_SETTING_KEYS = [
  "bank_account_name",
  "bank_account_number",
  "bank_transfer_enabled",
  "gcash_enabled",
  "gcash_number",
  "cod_enabled",
  "cop_enabled",
];
const MESSAGE_SETTING_KEYS = [
  "email_footer",
  "checkout_note",
];
const POLICY_SETTING_KEYS = [
  "warranty_period_days",
  "cancellation_fee_pct",
];

// Strict allow-list mapping each known non-logo setting key to its
// database group_name. Any key not in this map is ignored entirely —
// no row is read, written, or added to changedKeys. site_logo is
// deliberately absent: it may only ever come from req.file, never
// from a normal request-body field.
const SETTING_KEY_GROUPS = {
  site_name: "display",
  show_faq_section: "display",
  show_about_section: "display",
  business_address: "display",
  business_phone: "display",
  cod_enabled: "payment",
  cop_enabled: "payment",
  gcash_enabled: "payment",
  bank_transfer_enabled: "payment",
  gcash_number: "payment",
  bank_account_name: "payment",
  bank_account_number: "payment",
  email_footer: "email",
  checkout_note: "email",
  warranty_period_days: "policy",
  cancellation_fee_pct: "policy",
};

// Only these three static pages may be created or updated. Any other
// slug is rejected before touching the database.
const KNOWN_PAGE_SLUGS = ["about_us", "contact", "faq"];

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

    const [[existingLogo]] = await conn.query(
      "SELECT value FROM website_settings WHERE setting_key = ? LIMIT 1",
      ["site_logo"],
    );
    const hasLogoBefore = Boolean(existingLogo?.value);

    const [existingRows] = await conn.query(
      "SELECT setting_key, value, group_name FROM website_settings",
    );
    const existingMap = new Map(
      existingRows.map((r) => [r.setting_key, { value: r.value, group_name: r.group_name }]),
    );

    const changedKeys = [];
    for (const [key, value] of Object.entries(req.body)) {
      const groupName = SETTING_KEY_GROUPS[key];
      if (!groupName) continue; // unknown/arbitrary key — ignored entirely

      const existing = existingMap.get(key);

      // Normalize to strings before comparing — website_settings.value is
      // TEXT, but a direct JSON request could send a number or boolean,
      // which would otherwise falsely register as "changed" every time.
      const nextValue =
        value === null || value === undefined ? "" : String(value);
      const previousValue =
        existing?.value === null || existing?.value === undefined
          ? ""
          : String(existing.value);

      const valueChanged = !existing || previousValue !== nextValue;
      const groupChanged = !existing || existing.group_name !== groupName;
      if (!valueChanged && !groupChanged) continue; // genuine no-op, skip

      await conn.query(
        `INSERT INTO website_settings
           (setting_key, value, group_name, updated_by)
         VALUES
           (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           value = VALUES(value),
           group_name = VALUES(group_name),
           updated_by = VALUES(updated_by)`,
        [key, nextValue, groupName, parseInt(req.user.id)],
      );
      changedKeys.push(key);
    }
    if (req.file) {
      const logoUrl = `/uploads/settings/${req.file.filename}`;
      await conn.query(
        "UPDATE website_settings SET value = ?, updated_by = ? WHERE setting_key = ?",
        [logoUrl, parseInt(req.user.id), "site_logo"],
      );
    }

    const [[updatedLogo]] = await conn.query(
      "SELECT value FROM website_settings WHERE setting_key = ? LIMIT 1",
      ["site_logo"],
    );
    const hasLogoAfter = Boolean(updatedLogo?.value);

    await conn.commit();

    if (changedKeys.length > 0 || Boolean(req.file)) {
      req.auditRecord = {
        old: {
          has_logo: hasLogoBefore,
        },
        new: {
          keys_changed: changedKeys,
          business_name_changed: changedKeys.includes("site_name"),
          contact_info_changed: changedKeys.some((k) =>
            ["business_address", "business_phone"].includes(k),
          ),
          payment_settings_changed: changedKeys.some((k) =>
            PAYMENT_SETTING_KEYS.includes(k),
          ),
          message_settings_changed: changedKeys.some((k) =>
            MESSAGE_SETTING_KEYS.includes(k),
          ),
          policy_settings_changed: changedKeys.some((k) =>
            POLICY_SETTING_KEYS.includes(k),
          ),
          has_logo: hasLogoAfter,
          logo_uploaded_this_update: Boolean(req.file),
        },
      };
    }

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

    req.auditRecord = {
      id: r.insertId,
      new: { is_visible: Boolean(is_visible) },
    };

    res.status(201).json({ message: "FAQ created.", id: r.insertId });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.updateFaq = async (req, res) => {
  try {
    const { question, answer, sort_order, is_visible } = req.body;
    const faqId = parseInt(req.params.id);

    const [[oldFaq]] = await pool.query(
      "SELECT question, answer, sort_order, is_visible FROM faqs WHERE id = ?",
      [faqId],
    );

    // ── FIXED: Parsed ID ──
    const [updateResult] = await pool.query(
      "UPDATE faqs SET question=?,answer=?,sort_order=?,is_visible=? WHERE id=?",
      [
        question,
        answer,
        sort_order,
        is_visible ? 1 : 0,
        faqId,
      ],
    );

    if (oldFaq && updateResult.affectedRows > 0) {
      req.auditRecord = {
        id: faqId,
        old: {
          is_visible: Boolean(oldFaq.is_visible),
          sort_order: oldFaq.sort_order ?? null,
        },
        new: {
          is_visible: Boolean(is_visible),
          sort_order: sort_order ?? null,
          question_changed: oldFaq.question !== question,
          answer_changed: oldFaq.answer !== answer,
        },
      };
    }

    res.json({ message: "FAQ updated." });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.deleteFaq = async (req, res) => {
  try {
    const faqId = parseInt(req.params.id);

    const [[oldFaq]] = await pool.query(
      "SELECT is_visible FROM faqs WHERE id = ?",
      [faqId],
    );

    // ── FIXED: Parsed ID ──
    const [deleteResult] = await pool.query("DELETE FROM faqs WHERE id = ?", [
      faqId,
    ]);

    if (oldFaq && deleteResult.affectedRows > 0) {
      req.auditRecord = {
        id: faqId,
        old: { is_visible: Boolean(oldFaq.is_visible) },
      };
    }

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
    const slug = req.params.slug;

    if (!KNOWN_PAGE_SLUGS.includes(slug)) {
      return res.status(404).json({ message: "Page not found." });
    }

    const [[oldPage]] = await pool.query(
      "SELECT id, title, content, is_visible FROM static_pages WHERE slug = ?",
      [slug],
    );

    const isNew = !oldPage;
    const titleChanged = isNew || oldPage.title !== title;
    const contentChanged = isNew || oldPage.content !== content;

    // Normalize is_visible explicitly — Boolean("false") is true, so a
    // naive Boolean() coercion of a submitted string would misreport an
    // intended "hide this page" as no change (or as a change when there
    // isn't one).
    const nextVisible =
      is_visible === true ||
      is_visible === 1 ||
      is_visible === "1" ||
      is_visible === "true"
        ? 1
        : 0;
    const visibilityChanged =
      isNew || Number(oldPage.is_visible) !== nextVisible;

    if (!isNew && !titleChanged && !contentChanged && !visibilityChanged) {
      // Genuine no-op resubmission — nothing changed, skip the write
      // and the audit record entirely.
      return res.json({ message: "Page updated." });
    }

    const [upsertResult] = await pool.query(
      `INSERT INTO static_pages
         (slug, title, content, is_visible, updated_by)
       VALUES
         (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         title = VALUES(title),
         content = VALUES(content),
         is_visible = VALUES(is_visible),
         updated_by = VALUES(updated_by)`,
      [slug, title, content, nextVisible, parseInt(req.user.id)],
    );

    req.auditRecord = {
      id: oldPage?.id || upsertResult.insertId || null,
      old: { is_visible: isNew ? null : Boolean(oldPage.is_visible) },
      new: {
        page_slug: slug,
        title_changed: titleChanged,
        content_changed: contentChanged,
        is_visible: Boolean(nextVisible),
        page_created: isNew,
      },
    };

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