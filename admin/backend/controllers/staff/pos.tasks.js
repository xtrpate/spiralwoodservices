// controllers/staff/pos.tasks.js
const db = require("../../config/db"); // Uses the unified db config

const ensureIndoorAssignee = async (userId) => {
  // ── FIXED: Switched to .query and parsed ID ──
  const [rows] = await db.query(
    `SELECT id, name, role, staff_type, is_active
     FROM users
     WHERE id = ?
     LIMIT 1`,
    [parseInt(userId)],
  );

  if (!rows.length) return null;

  const user = rows[0];

  if (user.role !== "staff") return null;
  if (user.staff_type !== "indoor") return null;
  if (!user.is_active) return null;

  return user;
};

const normalize = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");

const REQUIRED_PRODUCTION_STEPS = [
  "Cutting Machine",
  "Edge Banding",
  "Horizontal Drilling",
  "Retouching",
  "Packing",
];

const REQUIRED_PRODUCTION_STEP_KEYS = REQUIRED_PRODUCTION_STEPS.map(normalize);

const validateProductionSequence = async ({
  orderId,
  taskRole,
  currentStatus,
  nextStatus,
}) => {
  const currentTaskRoleKey = normalize(taskRole);
  const currentStepIndex =
    REQUIRED_PRODUCTION_STEP_KEYS.indexOf(currentTaskRoleKey);

  if (!orderId || currentStepIndex === -1) {
    return null;
  }

  const normalizedCurrentStatus = normalize(currentStatus);
  const normalizedNextStatus = normalize(nextStatus);

  // ── FIXED: Switched to .query and parsed ID ──
  const [packetRows] = await db.query(
    `SELECT id, task_role, status
     FROM project_tasks
     WHERE order_id = ?`,
    [parseInt(orderId)],
  );

  const packetMap = new Map(
    packetRows.map((row) => [normalize(row.task_role), row]),
  );

  for (let i = 0; i < currentStepIndex; i += 1) {
    const previousStepLabel = REQUIRED_PRODUCTION_STEPS[i];
    const previousStepKey = REQUIRED_PRODUCTION_STEP_KEYS[i];
    const previousStep = packetMap.get(previousStepKey);

    if (!previousStep || normalize(previousStep.status) !== "completed") {
      return `Complete ${previousStepLabel} first before starting ${taskRole}.`;
    }
  }

  if (
    normalizedNextStatus === "in_progress" &&
    !["pending", "blocked"].includes(normalizedCurrentStatus)
  ) {
    return "Only a pending or blocked step can be started.";
  }

  if (
    normalizedNextStatus === "completed" &&
    normalizedCurrentStatus !== "in_progress"
  ) {
    return "Only an in-progress step can be marked as completed.";
  }

  if (
    normalizedNextStatus === "blocked" &&
    normalizedCurrentStatus !== "in_progress"
  ) {
    return "Only an in-progress step can be marked as blocked.";
  }

  return null;
};

/* ── Get User Notifications ── */
exports.getNotifications = async (req, res) => {
  try {
    // ── FIXED: Switched to .query and parsed ID ──
    const [notifications] = await db.query(
      `SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 20`,
      [parseInt(req.user.id)],
    );
    res.json(notifications);
  } catch (err) {
    console.error("[pos.tasks GET /notifications]", err);
    res.status(500).json({ message: "Error fetching notifications" });
  }
};

/* ── Mark Notification as Read ── */
exports.markNotificationRead = async (req, res) => {
  try {
    // ── FIXED: Switched to .query and parsed IDs ──
    await db.query(
      `UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?`,
      [parseInt(req.params.id), parseInt(req.user.id)],
    );
    res.json({ message: "Notification marked as read" });
  } catch (err) {
    res.status(500).json({ message: "Error updating notification" });
  }
};

/* ── Mark All Notifications as Read ── */
exports.markAllNotificationsRead = async (req, res) => {
  try {
    // ── FIXED: Switched to .query and parsed ID ──
    await db.query(
      `UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0`,
      [parseInt(req.user.id)],
    );
    res.json({ message: "All notifications marked as read" });
  } catch (err) {
    console.error("[pos.tasks PATCH /notifications/read-all]", err);
    res.status(500).json({ message: "Error updating notifications" });
  }
};

/* ── Get Projects Requiring Allocation ── */
exports.getProjects = async (req, res) => {
  try {
    // ── FIXED: Switched to .query and added empty array [] ──
    const [projects] = await db.query(
      `
      SELECT 
        o.id,
        o.order_number,
        COALESCE(u.name, o.walkin_customer_name, 'Walk-in Customer') AS customer_name,
        o.status,
        o.delivery_address,
        o.created_at,
        (
          SELECT COUNT(*)
          FROM project_tasks pt
          WHERE pt.order_id = o.id
        ) AS assigned_tasks_count
      FROM orders o
      LEFT JOIN users u ON o.customer_id = u.id
      WHERE o.status IN ('confirmed', 'production')
      ORDER BY o.created_at DESC
    `,
      [],
    );
    res.json(projects);
  } catch (err) {
    console.error("[pos.tasks GET /projects]", err);
    res.status(500).json({ message: "Server error.", error: err.message });
  }
};

/* ── Get Staff Workload ── */
exports.getStaff = async (req, res) => {
  try {
    // ── FIXED: Switched to .query and added empty array [] ──
    const [staff] = await db.query(
      `SELECT
         u.id,
         u.name,
         u.role,
         u.staff_type,
         u.phone,
         (
           SELECT COUNT(*)
           FROM project_tasks pt
           WHERE pt.assigned_to = u.id
             AND pt.status IN ('pending', 'in_progress')
         ) AS active_tasks
       FROM users u
       WHERE u.role = 'staff'
         AND u.staff_type = 'indoor'
         AND u.is_active = 1
       ORDER BY u.name ASC`,
      [],
    );

    res.json(staff);
  } catch (err) {
    console.error("[pos.tasks GET /staff]", err);
    res.status(500).json({ message: "Server error.", error: err.message });
  }
};

/* ── Get Unread Count ── */
exports.getUnreadCount = async (req, res) => {
  try {
    // ── FIXED: Switched to .query and parsed ID ──
    const [taskRows] = await db.query(
      `SELECT COUNT(*) as count FROM project_tasks WHERE assigned_to = ? AND is_read = 0`,
      [parseInt(req.user.id)],
    );

    // ── FIXED: Switched to .query and parsed ID ──
    const [notifRows] = await db.query(
      `SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = 0`,
      [parseInt(req.user.id)],
    );

    res.json({
      task_count: taskRows[0].count,
      notification_count: notifRows[0].count,
    });
  } catch (err) {
    res.status(500).json({ message: "Error fetching unread count" });
  }
};

/* ── Get Tasks (Admin sees all, Staff sees theirs) ── */
exports.getTasks = async (req, res) => {
  try {
    let query = `
      SELECT t.*, 
             assignee.name AS assigned_to_name, 
             assigner.name AS assigned_by_name, 
             o.order_number,
             o.delivery_address
      FROM project_tasks t
      LEFT JOIN users assignee ON t.assigned_to = assignee.id
      LEFT JOIN users assigner ON t.assigned_by = assigner.id
      LEFT JOIN orders o ON t.order_id = o.id
    `;
    const queryParams = [];

    if (req.user.role !== "admin") {
      query += ` WHERE t.assigned_to = ?`;
      queryParams.push(parseInt(req.user.id));
    }

    query += ` ORDER BY t.created_at DESC`;

    // ── FIXED: Switched to .query ──
    const [tasks] = await db.query(query, queryParams);
    res.json(tasks);
  } catch (err) {
    console.error("[pos.tasks GET /]", err);
    res.status(500).json({ message: "Server error.", error: err.message });
  }
};

/* ── Create/Assign Task ── */
exports.createTask = async (req, res) => {
  const {
    order_id,
    blueprint_id,
    assigned_to,
    task_role,
    title,
    description,
    due_date,
  } = req.body;

  if (!assigned_to || !title) {
    return res
      .status(400)
      .json({ message: "Assigned staff and task title are required." });
  }

  try {
    const assignee = await ensureIndoorAssignee(assigned_to);

    if (!assignee) {
      return res.status(400).json({
        message: "Only active indoor staff can be assigned to project tasks.",
      });
    }

    if (order_id) {
      // ── FIXED: Switched to .query ──
      await db.query(
        `UPDATE orders SET status = 'production' WHERE id = ? AND status = 'confirmed'`,
        [parseInt(order_id)],
      );
    }

    // ── FIXED: Switched to .query ──
    const [result] = await db.query(
      `INSERT INTO project_tasks 
        (order_id, blueprint_id, assigned_to, assigned_by, task_role, title, description, due_date, status, is_read) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', 0)`,
      [
        order_id ? parseInt(order_id) : null,
        blueprint_id ? parseInt(blueprint_id) : null,
        parseInt(assigned_to),
        parseInt(req.user.id),
        task_role || "Other",
        title,
        description || "",
        due_date || null,
      ],
    );

    // ── FIXED: Switched to .query ──
    await db.query(
      `INSERT INTO notifications (user_id, type, title, message, channel, sent_at) 
       VALUES (?, 'assignment', 'New Task Assigned', ?, 'system', NOW())`,
      [parseInt(assigned_to), `You have been assigned a new task: ${title}`],
    );

    res.status(201).json({
      message: "Task assigned successfully.",
      task_id: result.insertId,
    });
  } catch (err) {
    console.error("[pos.tasks POST /]", err);
    res.status(500).json({ message: "Server error.", error: err.message });
  }
};

/* ── Accept Task ── */
exports.acceptTask = async (req, res) => {
  try {
    const taskId = parseInt(req.params.id);
    const userId = parseInt(req.user.id);

    // ── FIXED: Switched to .query and parsed IDs ──
    const [tasks] = await db.query(
      `SELECT * FROM project_tasks WHERE id = ? AND assigned_to = ?`,
      [taskId, userId],
    );

    if (tasks.length === 0) {
      return res.status(400).json({ message: "Task not found." });
    }
    const task = tasks[0];

    if (normalize(task.status) !== "pending") {
      return res
        .status(400)
        .json({ message: "Task already accepted or blocked." });
    }

    const sequenceError = await validateProductionSequence({
      orderId: task.order_id,
      taskRole: task.task_role,
      currentStatus: "pending",
      nextStatus: "in_progress",
    });

    if (sequenceError) {
      return res.status(400).json({ message: sequenceError });
    }

    // ── FIXED: Switched to .query ──
    const [result] = await db.query(
      `UPDATE project_tasks SET status = 'in_progress', is_read = 1, accepted_at = NOW() 
       WHERE id = ? AND assigned_to = ? AND status = 'pending'`,
      [taskId, userId],
    );

    if (result.affectedRows !== 1) {
      return res.status(409).json({
        message:
          "Task status or assignment changed before this update was completed. Refresh and try again.",
      });
    }

    // ── FIXED: Switched to .query ──
    await db.query(
      `INSERT INTO notifications (user_id, type, title, message, channel, sent_at) 
       VALUES (?, 'task_update', 'Task Accepted', ?, 'system', NOW())`,
      [
        parseInt(task.assigned_by),
        `${req.user.name || "A staff member"} has accepted the task: ${task.title}`,
      ],
    );

    res.json({ message: "Assignment accepted." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error accepting task" });
  }
};

/* ── Update Task Status ── */
exports.updateTaskStatus = async (req, res) => {
  const { status } = req.body;
  const taskId = parseInt(req.params.id); // Parsed ID here

  const validStatuses = ["pending", "in_progress", "completed", "blocked"];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ message: "Invalid status." });
  }

  try {
    // ── FIXED: Switched to .query ──
    const [rows] = await db.query(
      `SELECT id, title, status, assigned_to, assigned_by, completed_at, order_id, task_role
       FROM project_tasks
       WHERE id = ?
       LIMIT 1`,
      [taskId],
    );

    if (!rows.length) {
      return res.status(404).json({ message: "Task not found." });
    }

    const existing = rows[0];
    const isAdmin = req.user.role === "admin";
    const isOwner = Number(existing.assigned_to) === Number(req.user.id);

    if (!isAdmin && !isOwner) {
      return res.status(403).json({
        message: "You can only update tasks assigned to you.",
      });
    }

    if (existing.status === "completed" && status !== "completed") {
      return res.status(400).json({
        message: "Completed tasks can no longer be changed.",
      });
    }

    if (!isAdmin && status === "pending") {
      return res.status(400).json({
        message: "Staff cannot move a task back to pending.",
      });
    }

    const sequenceError = await validateProductionSequence({
      orderId: existing.order_id,
      taskRole: existing.task_role,
      currentStatus: existing.status,
      nextStatus: status,
    });

    if (sequenceError) {
      return res.status(400).json({ message: sequenceError });
    }

    let completedAt = existing.completed_at || null;

    if (status === "completed" && existing.status !== "completed") {
      completedAt = new Date();
    } else if (status !== "completed") {
      completedAt = null;
    }

    // ── FIXED: Switched to .query ──
    const [result] = await db.query(
      `UPDATE project_tasks
       SET status = ?, completed_at = ?, is_read = 1, updated_at = NOW()
       WHERE id = ? AND status = ? AND assigned_to = ?`,
      [status, completedAt, taskId, existing.status, existing.assigned_to],
    );

    if (result.affectedRows !== 1) {
      return res.status(409).json({
        message:
          "Task status or assignment changed before this update was completed. Refresh and try again.",
      });
    }

    if (existing.assigned_by) {
      const statusLabel = String(status).replace(/_/g, " ");

      // ── FIXED: Switched to .query ──
      await db.query(
        `INSERT INTO notifications (user_id, type, title, message, channel, sent_at)
         VALUES (?, 'task_update', 'Task Status Updated', ?, 'system', NOW())`,
        [
          parseInt(existing.assigned_by),
          `${req.user.name || "A staff member"} updated step "${existing.task_role}" to ${statusLabel} for ${existing.title}.`,
        ],
      );
    }

    let becameProductionReady = false;

    if (existing.order_id && existing.assigned_by) {
      // ── FIXED: Switched to .query ──
      const [packetRows] = await db.query(
        `SELECT task_role, status
         FROM project_tasks
         WHERE order_id = ?`,
        [parseInt(existing.order_id)],
      );

      const existingStepKeys = new Set(
        packetRows.map((row) => normalize(row.task_role)).filter(Boolean),
      );

      const completedStepKeys = new Set(
        packetRows
          .filter((row) => normalize(row.status) === "completed")
          .map((row) => normalize(row.task_role))
          .filter(Boolean),
      );

      const missingSteps = REQUIRED_PRODUCTION_STEP_KEYS.filter(
        (step) => !existingStepKeys.has(step),
      );

      const incompleteSteps = REQUIRED_PRODUCTION_STEP_KEYS.filter(
        (step) => !completedStepKeys.has(step),
      );

      if (status === "blocked") {
        // ── FIXED: Switched to .query ──
        await db.query(
          `INSERT INTO notifications (user_id, type, title, message, channel, sent_at)
           VALUES (?, 'task_blocked', 'Production Blocker Reported', ?, 'system', NOW())`,
          [
            parseInt(existing.assigned_by),
            `${req.user.name || "A staff member"} reported a blocker on ${existing.task_role} for Order #${existing.order_id}.`,
          ],
        );
      }

      if (
        status === "completed" &&
        missingSteps.length === 0 &&
        incompleteSteps.length === 0
      ) {
        // ── FIXED: Switched to .query ──
        await db.query(
          `INSERT INTO notifications (user_id, type, title, message, channel, sent_at)
           VALUES (?, 'production_ready', 'Production Ready for Shipping', ?, 'system', NOW())`,
          [
            parseInt(existing.assigned_by),
            `${req.user.name || "A staff member"} completed the full production workflow for Order #${existing.order_id}. The order is now ready for shipping review.`,
          ],
        );
        becameProductionReady = true;
      }
    }

    if (becameProductionReady) {
      try {
        await db.query(
          `INSERT INTO audit_logs
             (user_id, action, table_name, record_id, old_values, new_values, ip_address)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            req.user.id,
            "mark_production_ready_for_shipping",
            "orders",
            parseInt(existing.order_id),
            JSON.stringify({ ready_for_shipping: false }),
            JSON.stringify({
              ready_for_shipping: true,
              completed_required_steps: REQUIRED_PRODUCTION_STEP_KEYS.length,
            }),
            req.ip || null,
          ],
        );
      } catch (auditErr) {
        console.error(
          "[pos.tasks] readiness audit insert failed:",
          auditErr.message,
        );
      }
    }
    req.auditRecord = {
      id: taskId,
      old: { status: existing.status },
      new: { status },
    };
    res.json({ message: "Task status updated successfully." });
  } catch (err) {
    console.error("[pos.tasks PUT /:id/status]", err);
    res.status(500).json({ message: "Server error." });
  }
};

/* ── Update Task (Admin edit / Staff status update fallback) ── */
exports.updateTask = async (req, res) => {
  const id = parseInt(req.params.id);
  const {
    order_id,
    blueprint_id,
    assigned_to,
    task_role,
    title,
    description,
    due_date,
    status,
  } = req.body;

  try {
    // ── FIXED: Switched to .query ──
    const [rows] = await db.query(`SELECT * FROM project_tasks WHERE id = ?`, [
      id,
    ]);

    if (!rows.length) {
      return res.status(404).json({ message: "Task not found." });
    }

    const existing = rows[0];

    if (req.user.role !== "admin") {
      const triedToEditProtectedFields = [
        order_id,
        blueprint_id,
        assigned_to,
        task_role,
        title,
        description,
        due_date,
      ].some((value) => value !== undefined);

      if (triedToEditProtectedFields) {
        return res.status(403).json({
          message: "Staff can only update the status of their own task.",
        });
      }

      req.body = { status: status ?? existing.status };
      return exports.updateTaskStatus(req, res);
    }

    const validStatuses = ["pending", "in_progress", "completed", "blocked"];
    if (status !== undefined && !validStatuses.includes(status)) {
      return res.status(400).json({ message: "Invalid status." });
    }

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

    const parseOptionalId = (value, existingValue) => {
      if (value === undefined) return { value: existingValue, valid: true };
      if (value === null || value === "") return { value: null, valid: true };
      const parsed = parseStrictPositiveInt(value);
      return parsed === null
        ? { value: null, valid: false }
        : { value: parsed, valid: true };
    };

    const nextAssignedTo = parseStrictPositiveInt(assigned_to);
    if (!nextAssignedTo) {
      return res.status(400).json({
        message: "Assign To is required and must be a valid staff ID.",
      });
    }

    const orderIdResult = parseOptionalId(order_id, existing.order_id);
    if (!orderIdResult.valid) {
      return res.status(400).json({ message: "Invalid order reference." });
    }
    const nextOrderId = orderIdResult.value;

    const blueprintIdResult = parseOptionalId(
      blueprint_id,
      existing.blueprint_id,
    );
    if (!blueprintIdResult.valid) {
      return res.status(400).json({ message: "Invalid blueprint reference." });
    }
    const nextBlueprintId = blueprintIdResult.value;

    const PH_OFFSET_MS = 8 * 60 * 60 * 1000;
    const parsePhilippineDateTimeLocal = (value) => {
      if (typeof value !== "string") return undefined;
      const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
      if (!match) return undefined;
      const [, yStr, moStr, dStr, hStr, miStr] = match;
      const y = Number(yStr),
        mo = Number(moStr),
        d = Number(dStr),
        h = Number(hStr),
        mi = Number(miStr);
      const utcMs = Date.UTC(y, mo - 1, d, h, mi) - PH_OFFSET_MS;
      const result = new Date(utcMs);
      const check = new Date(utcMs + PH_OFFSET_MS);
      if (
        check.getUTCFullYear() !== y ||
        check.getUTCMonth() !== mo - 1 ||
        check.getUTCDate() !== d ||
        check.getUTCHours() !== h ||
        check.getUTCMinutes() !== mi
      ) {
        return undefined;
      }
      return result;
    };

    let nextDueDate;
    if (due_date === undefined) {
      nextDueDate = existing.due_date;
    } else if (due_date === "" || due_date === null) {
      nextDueDate = null;
    } else {
      nextDueDate = parsePhilippineDateTimeLocal(due_date);
      if (nextDueDate === undefined) {
        return res.status(400).json({ message: "Invalid due date." });
      }
    }

    const nextTaskRole = task_role ?? existing.task_role;
    const nextTitle = title ?? existing.title;
    const nextDescription = description ?? existing.description;
    const nextStatus = status ?? existing.status;

    const existingDueMinute = existing.due_date
      ? Math.floor(new Date(existing.due_date).getTime() / 60000)
      : null;
    const nextDueMinute = nextDueDate
      ? Math.floor(nextDueDate.getTime() / 60000)
      : null;

    const orderIdChanged = existing.order_id !== nextOrderId;
    const blueprintIdChanged = existing.blueprint_id !== nextBlueprintId;
    const assignedToChanged = existing.assigned_to !== nextAssignedTo;
    const taskRoleChanged = existing.task_role !== nextTaskRole;
    const titleChanged = existing.title !== nextTitle;
    const descriptionChanged =
      (existing.description ?? "") !== (nextDescription ?? "");
    const dueDateChanged = existingDueMinute !== nextDueMinute;
    const statusChanged = existing.status !== nextStatus;

    const anyFieldChanged =
      orderIdChanged ||
      blueprintIdChanged ||
      assignedToChanged ||
      taskRoleChanged ||
      titleChanged ||
      descriptionChanged ||
      dueDateChanged ||
      statusChanged;

    if (!anyFieldChanged) {
      return res.json({ message: "No changes were made." });
    }

    const descriptionForUpdate = descriptionChanged
      ? nextDescription
      : existing.description;
    const dueDateForUpdate = dueDateChanged ? nextDueDate : existing.due_date;

    const assignee = await ensureIndoorAssignee(nextAssignedTo);
    if (!assignee) {
      return res.status(400).json({
        message: "Only active indoor staff can be assigned to project tasks.",
      });
    }

    if (nextOrderId) {
      const [[orderExists]] = await db.query(
        `SELECT id FROM orders WHERE id = ? LIMIT 1`,
        [nextOrderId],
      );
      if (!orderExists) {
        return res.status(400).json({ message: "Linked order not found." });
      }
    }

    if (nextBlueprintId) {
      const [[blueprintExists]] = await db.query(
        `SELECT id FROM blueprints WHERE id = ? LIMIT 1`,
        [nextBlueprintId],
      );
      if (!blueprintExists) {
        return res
          .status(400)
          .json({ message: "Linked blueprint not found." });
      }
    }

    if (existing.status === "completed" && nextStatus !== "completed") {
      return res.status(400).json({
        message: "Completed tasks can no longer be changed.",
      });
    }

    const normalizedExistingRole = normalize(existing.task_role);
    const normalizedNextRole = normalize(nextTaskRole);
    const existingHasRequiredRole = REQUIRED_PRODUCTION_STEP_KEYS.includes(
      normalizedExistingRole,
    );
    const nextHasRequiredRole = REQUIRED_PRODUCTION_STEP_KEYS.includes(
      normalizedNextRole,
    );

    if (nextHasRequiredRole && !nextOrderId) {
      return res.status(400).json({
        message: "A required production step must be linked to an order.",
      });
    }

    if (
      (orderIdChanged || taskRoleChanged) &&
      (existingHasRequiredRole || nextHasRequiredRole)
    ) {
      return res.status(400).json({
        message:
          "Production workflow order and step role must be managed through the production assignment workflow.",
      });
    }

    if (statusChanged) {
      const sequenceError = await validateProductionSequence({
        orderId: nextOrderId,
        taskRole: nextTaskRole,
        currentStatus: existing.status,
        nextStatus,
      });

      if (sequenceError) {
        return res.status(400).json({ message: sequenceError });
      }
    }

    let completedAt = existing.completed_at;
    if (nextStatus === "completed" && existing.status !== "completed") {
      completedAt = new Date();
    } else if (nextStatus !== "completed") {
      completedAt = null;
    }

    // ── FIXED: Switched to .query ──
    const [result] = await db.query(
      `UPDATE project_tasks
       SET order_id = ?, blueprint_id = ?, assigned_to = ?, task_role = ?,
           title = ?, description = ?, due_date = ?, status = ?, completed_at = ?, updated_at = NOW()
       WHERE id = ?
         AND order_id <=> ? AND blueprint_id <=> ? AND assigned_to <=> ?
         AND CAST(task_role AS BINARY) <=> CAST(? AS BINARY)
         AND CAST(title AS BINARY) <=> CAST(? AS BINARY)
         AND CAST(description AS BINARY) <=> CAST(? AS BINARY)
         AND due_date <=> ? AND status <=> ?`,
      [
        nextOrderId,
        nextBlueprintId,
        nextAssignedTo,
        nextTaskRole,
        nextTitle,
        descriptionForUpdate,
        dueDateForUpdate,
        nextStatus,
        completedAt,
        id,
        existing.order_id,
        existing.blueprint_id,
        existing.assigned_to,
        existing.task_role,
        existing.title,
        existing.description,
        existing.due_date,
        existing.status,
      ],
    );

    if (result.affectedRows !== 1) {
      return res.status(409).json({
        message:
          "Task was changed before this update was completed. Refresh and try again.",
      });
    }

    if (assignedToChanged) {
      // ── FIXED: Switched to .query ──
      await db.query(
        `INSERT INTO notifications (user_id, type, title, message, channel, sent_at)
         VALUES (?, 'assignment', 'Task Updated', ?, 'system', NOW())`,
        [
          nextAssignedTo,
          `A task has been assigned/updated: ${nextTitle}`,
        ],
      );
    }

    res.json({ message: "Task updated successfully." });
  } catch (err) {
    console.error("[pos.tasks PUT /:id]", err);
    res.status(500).json({ message: "Server error." });
  }
};

exports.deleteTask = async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Only admins can delete tasks." });
    }

    // ── FIXED: Switched to .query and parsed ID ──
    const [result] = await db.query(`DELETE FROM project_tasks WHERE id = ?`, [
      parseInt(req.params.id),
    ]);

    if (!result.affectedRows) {
      return res.status(404).json({ message: "Task not found." });
    }

    res.json({ message: "Task deleted successfully." });
  } catch (err) {
    console.error("[pos.tasks DELETE /:id]", err);
    res.status(500).json({ message: "Server error.", error: err.message });
  }
};