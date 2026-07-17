// controllers/customer/customer.notifications.js
const db = require("../../config/db");

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

/* ── Get Customer Notifications ── */
exports.getNotifications = async (req, res) => {
  try {
    const [notifications] = await db.query(
      `SELECT id, type, title, message, is_read, created_at
       FROM notifications
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT 20`,
      [req.user.id],
    );
    res.json(notifications);
  } catch (err) {
    console.error("[customer.notifications GET /]", err);
    res.status(500).json({ message: "Error fetching notifications" });
  }
};

/* ── Mark One Notification as Read (ownership-safe, idempotent) ── */
exports.markNotificationRead = async (req, res) => {
  try {
    const notificationId = parseStrictPositiveInt(req.params.id);
    if (!notificationId) {
      return res.status(400).json({ message: "Invalid notification ID." });
    }

    const [[owned]] = await db.query(
      `SELECT id, is_read
       FROM notifications
       WHERE id = ? AND user_id = ?
       LIMIT 1`,
      [notificationId, req.user.id],
    );

    if (!owned) {
      return res.status(404).json({ message: "Notification not found." });
    }

    if (owned.is_read) {
      return res.json({ message: "Notification marked as read" });
    }

    const [result] = await db.query(
      `UPDATE notifications
       SET is_read = 1
       WHERE id = ? AND user_id = ? AND is_read = 0`,
      [notificationId, req.user.id],
    );

    if (result.affectedRows !== 1) {
      return res.status(409).json({
        message: "Notification changed. Refresh and try again.",
      });
    }

    res.json({ message: "Notification marked as read" });
  } catch (err) {
    console.error("[customer.notifications PATCH /:id/read]", err);
    res.status(500).json({ message: "Error updating notification" });
  }
};

/* ── Mark All Notifications as Read ── */
exports.markAllNotificationsRead = async (req, res) => {
  try {
    await db.query(
      `UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0`,
      [req.user.id],
    );
    res.json({ message: "All notifications marked as read" });
  } catch (err) {
    console.error("[customer.notifications PATCH /read-all]", err);
    res.status(500).json({ message: "Error updating notifications" });
  }
};