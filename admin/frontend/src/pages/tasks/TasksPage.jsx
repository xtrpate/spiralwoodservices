// src/pages/tasks/TasksPage.jsx
import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../services/api";
import toast from "react-hot-toast";
import useAuthStore from "../../store/authStore";

const PRIORITY_ROLES = [
  "Cabinet Maker",
  "Installer",
  "Quality Inspector",
  "Other",
];

const REQUIRED_PRODUCTION_ROLES = [
  "Cutting Machine",
  "Edge Banding",
  "Horizontal Drilling",
  "Retouching",
  "Packing",
];

const STATUS_META = {
  pending: {
    label: "Pending",
    bg: "#ffffff",
    color: "#52525b",
    border: "#d4d4d8",
  },
  in_progress: {
    label: "In Progress",
    bg: "#f4f4f5",
    color: "#18181b",
    border: "#e4e4e7",
  },
  completed: {
    label: "Completed",
    bg: "#0a0a0a",
    color: "#ffffff",
    border: "#0a0a0a",
  },
  blocked: {
    label: "Blocked",
    bg: "#fef2f2",
    color: "#991b1b",
    border: "#fecaca",
  },
};

const ROLE_COLOR = {
  "Cabinet Maker": { bg: "#18181b", color: "#ffffff", border: "#18181b" },
  Installer: { bg: "#f4f4f5", color: "#18181b", border: "#e4e4e7" },
  "Quality Inspector": { bg: "#ffffff", color: "#52525b", border: "#d4d4d8" },
  Other: { bg: "#fafafa", color: "#71717a", border: "#e4e4e7" },
};

const BLANK = {
  title: "",
  description: "",
  assigned_to: "",
  task_role: "Other",
  due_date: "",
  order_id: "",
  blueprint_id: "",
};

export default function TasksPage() {
  const { user: me } = useAuthStore();
  const isAdmin = me?.role === "admin";
  const navigate = useNavigate();

  const [tasks, setTasks] = useState([]);
  const [staff, setStaff] = useState([]);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(BLANK);
  const [target, setTarget] = useState(null);
  const [saving, setSaving] = useState(false);
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterRole, setFilterRole] = useState("all");
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: t } = await api.get("/tasks");
      setTasks(t);
      if (isAdmin) {
        const [{ data: s }, { data: o }] = await Promise.all([
          api.get("/tasks/staff-list"),
          api.get("/tasks/orders-list"),
        ]);
        setStaff(s);
        setOrders(o);
      }
    } catch {
      toast.error("Failed to load tasks.");
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    load();
  }, [load]);

  const openCreate = () => {
    setForm(BLANK);
    setTarget(null);
    setModal("create");
  };
  const toPhilippineDateTimeLocal = (isoString) => {
    if (!isoString) return "";
    const date = new Date(isoString);
    if (Number.isNaN(date.getTime())) return "";
    const ph = new Date(date.getTime() + 8 * 60 * 60 * 1000);
    const yyyy = ph.getUTCFullYear();
    const mm = String(ph.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(ph.getUTCDate()).padStart(2, "0");
    const hh = String(ph.getUTCHours()).padStart(2, "0");
    const mi = String(ph.getUTCMinutes()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
  };
  const openEdit = (t) => {
    setForm({
      title: t.title,
      description: t.description || "",
      assigned_to: String(t.assigned_to || ""),
      task_role: t.task_role,
      due_date: toPhilippineDateTimeLocal(t.due_date),
      order_id: t.order_id ? String(t.order_id) : "",
      blueprint_id: t.blueprint_id ? String(t.blueprint_id) : "",
      status: t.status,
    });
    setTarget(t);
    setModal("edit");
  };
  const openView = (t) => {
    setTarget(t);
    setModal("view");
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        ...form,
        order_id: form.order_id || null,
        blueprint_id: form.blueprint_id || null,
      };
      if (modal === "create") {
        await api.post("/tasks", payload);
        toast.success("Task assigned! Staff has been notified.");
      } else {
        const { data } = await api.put(`/tasks/${target.id}`, payload);
        toast.success(data?.message || "Task updated.");
      }
      setModal(null);
      load();
    } catch (err) {
      if (err.response?.status === 404) {
        toast.error(err.response?.data?.message || "Task not found.");
      }
    } finally {
      setSaving(false);
    }
  };

  const handleStatusUpdate = async (taskId, status) => {
    try {
      await api.put(`/tasks/${taskId}/status`, { status });
      toast.success(`Marked as ${STATUS_META[status]?.label || status}.`);
      load();
    } catch {
      toast.error("Failed to update status.");
    }
  };

  const handleDelete = async (taskId) => {
    if (!window.confirm("Delete this task? This cannot be undone.")) return;
    try {
      await api.delete(`/tasks/${taskId}`);
      toast.success("Task deleted.");
      load();
    } catch (err) {
      if (err.response?.status === 404) {
        toast.error(err.response?.data?.message || "Task not found.");
      }
    }
  };

  // Filters
  const filtered = tasks.filter((t) => {
    const mStatus = filterStatus === "all" || t.status === filterStatus;
    const mRole = filterRole === "all" || t.task_role === filterRole;
    const mSearch =
      !search ||
      t.title.toLowerCase().includes(search.toLowerCase()) ||
      t.assigned_to_name.toLowerCase().includes(search.toLowerCase()) ||
      (t.order_number || "").toLowerCase().includes(search.toLowerCase());
    return mStatus && mRole && mSearch;
  });

  const stats = {
    total: tasks.length,
    pending: tasks.filter((t) => t.status === "pending").length,
    in_progress: tasks.filter((t) => t.status === "in_progress").length,
    completed: tasks.filter((t) => t.status === "completed").length,
    blocked: tasks.filter((t) => t.status === "blocked").length,
  };

  const isOverdue = (t) =>
    t.due_date && t.status !== "completed" && new Date(t.due_date) < new Date();

  // ── Styles ──────────────────────────────────────────────────────────────────
  const S = {
    page: {
      padding: "28px 32px",
      background: "#f4f4f5",
      minHeight: "100vh",
      fontFamily: "'Inter', sans-serif",
    },
    header: {
      display: "flex",
      alignItems: "flex-start",
      justifyContent: "space-between",
      marginBottom: 24,
      flexWrap: "wrap",
      gap: 16,
    },
    title: {
      fontSize: 24,
      fontWeight: 800,
      color: "#0a0a0a",
      margin: 0,
      letterSpacing: "-0.02em",
    },
    sub: { fontSize: 13, color: "#52525b", marginTop: 4 },
    statRow: {
      display: "grid",
      gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
      gap: 14,
      marginBottom: 24,
    },
    stat: {
      background: "#fff",
      border: "1px solid #e4e4e7",
      borderRadius: 12,
      padding: "16px 20px",
      boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
    },
    statNum: {
      fontSize: 26,
      fontWeight: 800,
      color: "#0a0a0a",
      letterSpacing: "-0.02em",
    },
    statLbl: {
      fontSize: 10,
      color: "#71717a",
      marginTop: 4,
      textTransform: "uppercase",
      letterSpacing: "1px",
      fontWeight: 800,
    },
    toolbar: {
      display: "flex",
      gap: 10,
      marginBottom: 20,
      alignItems: "center",
      flexWrap: "wrap",
    },
    input: {
      padding: "9px 14px",
      border: "1px solid #e4e4e7",
      borderRadius: 8,
      fontSize: 13,
      background: "#fff",
      outline: "none",
      color: "#18181b",
    },
    select: {
      padding: "9px 14px",
      border: "1px solid #e4e4e7",
      borderRadius: 8,
      fontSize: 13,
      background: "#fff",
      cursor: "pointer",
      color: "#18181b",
      outline: "none",
    },
    btn: {
      padding: "9px 18px",
      borderRadius: 8,
      border: "none",
      cursor: "pointer",
      fontSize: 13,
      fontWeight: 700,
      transition: "background 0.2s",
    },
    btnPrim: {
      background: "#18181b",
      color: "#fff",
      border: "1px solid #18181b",
    },
    btnGray: {
      background: "#f4f4f5",
      color: "#18181b",
      border: "1px solid #e4e4e7",
    },
    btnRed: {
      background: "#fef2f2",
      color: "#991b1b",
      border: "1px solid #fecaca",
    },
    card: {
      background: "#fff",
      border: "1px solid #e4e4e7",
      borderRadius: 12,
      padding: "18px 20px",
      marginBottom: 12,
      boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
    },
    tag: (bg, color, border) => ({
      display: "inline-block",
      padding: "2px 10px",
      borderRadius: 20,
      fontSize: 11,
      fontWeight: 600,
      background: bg,
      color,
      border: `1px solid ${border || bg}`,
    }),
    overlay: {
      position: "fixed",
      inset: 0,
      background: "rgba(0,0,0,.6)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 1000,
      padding: 20,
    },
    modal: {
      background: "#fff",
      borderRadius: 16,
      width: 560,
      maxWidth: "100%",
      maxHeight: "90vh",
      overflowY: "auto",
      padding: 32,
      boxShadow: "0 25px 60px rgba(0,0,0,.15)",
      border: "1px solid #e4e4e7",
    },
    mTitle: {
      fontSize: 20,
      fontWeight: 800,
      color: "#0a0a0a",
      marginBottom: 24,
      letterSpacing: "-0.01em",
    },
    label: {
      fontSize: 12,
      fontWeight: 800,
      color: "#18181b",
      display: "block",
      marginBottom: 8,
    },
    mInput: {
      width: "100%",
      padding: "10px 14px",
      border: "1px solid #e4e4e7",
      borderRadius: 8,
      fontSize: 13,
      boxSizing: "border-box",
      outline: "none",
      color: "#0a0a0a",
    },
    mRow: { marginBottom: 18 },
    half: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 },
  };

  const isEditingRequiredProductionTask =
    modal === "edit" && REQUIRED_PRODUCTION_ROLES.includes(target?.task_role);

  return (
    <div style={S.page}>
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div style={S.header}>
        <div>
          <h1 style={S.title}>Task Assignments</h1>
          <p style={S.sub}>
            {isAdmin
              ? "Assign project tasks to staff and track progress."
              : "Your assigned tasks and their current status."}
          </p>
        </div>
      </div>

      {/* ── Stats ──────────────────────────────────────────────────────────── */}
      <div style={S.statRow}>
        {[
          { label: "Total", value: stats.total, color: "#0a0a0a" },
          { label: "Pending", value: stats.pending, color: "#52525b" },
          { label: "In Progress", value: stats.in_progress, color: "#18181b" },
          { label: "Completed", value: stats.completed, color: "#0a0a0a" },
          { label: "Blocked", value: stats.blocked, color: "#dc2626" },
        ].map((s) => (
          <div key={s.label} style={S.stat}>
            <div style={{ ...S.statNum, color: s.color }}>{s.value}</div>
            <div style={S.statLbl}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* ── Toolbar ────────────────────────────────────────────────────────── */}
      <div style={S.toolbar}>
        <input
          style={{ ...S.input, flex: "1 1 230px", minWidth: 200 }}
          placeholder="Search title, staff, order…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          style={S.select}
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
        >
          <option value="all">All Status</option>
          <option value="pending">Pending</option>
          <option value="in_progress">In Progress</option>
          <option value="completed">Completed</option>
          <option value="blocked">Blocked</option>
        </select>
        <select
          style={S.select}
          value={filterRole}
          onChange={(e) => setFilterRole(e.target.value)}
        >
          <option value="all">All Roles</option>
          {REQUIRED_PRODUCTION_ROLES.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <span
          style={{
            fontSize: 12,
            color: "#71717a",
            marginLeft: "auto",
            fontWeight: 600,
          }}
        >
          {filtered.length} task{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* ── Task List ──────────────────────────────────────────────────────── */}
      {loading ? (
        <div
          style={{
            textAlign: "center",
            padding: 60,
            color: "#71717a",
            fontWeight: 600,
            fontSize: 13,
          }}
        >
          Loading tasks…
        </div>
      ) : filtered.length === 0 ? (
        <div
          style={{
            textAlign: "center",
            padding: 60,
            color: "#71717a",
            fontWeight: 600,
            fontSize: 13,
          }}
        >
          {isAdmin
            ? 'No tasks yet. Click "+ Assign Task" to get started.'
            : "No tasks assigned to you."}
        </div>
      ) : (
        filtered.map((t) => {
          const sm = STATUS_META[t.status] || STATUS_META.pending;
          const rc = ROLE_COLOR[t.task_role] || ROLE_COLOR["Other"];
          const overdue = isOverdue(t);
          return (
            <div
              key={t.id}
              style={{
                ...S.card,
                borderColor: overdue ? "#fecaca" : "#e4e4e7",
                borderLeft: `4px solid ${overdue ? "#dc2626" : sm.color}`,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                }}
              >
                {/* Left side */}
                <div style={{ flex: 1 }}>
                  <div
                    style={{
                      display: "flex",
                      gap: 8,
                      alignItems: "center",
                      marginBottom: 8,
                      flexWrap: "wrap",
                    }}
                  >
                    <span style={S.tag(sm.bg, sm.color, sm.border)}>
                      {sm.label}
                    </span>
                    <span style={S.tag(rc.bg, rc.color, rc.border)}>
                      {t.task_role}
                    </span>
                    {overdue && (
                      <span style={S.tag("#fef2f2", "#991b1b", "#fecaca")}>
                        ⚠ Overdue
                      </span>
                    )}
                    {!t.is_read && (
                      <span style={S.tag("#18181b", "#ffffff", "#18181b")}>
                        ● New
                      </span>
                    )}
                  </div>
                  <div
                    style={{
                      fontSize: 16,
                      fontWeight: 800,
                      color: "#0a0a0a",
                      marginBottom: 6,
                    }}
                  >
                    {t.title}
                  </div>
                  {t.description && (
                    <div
                      style={{
                        fontSize: 13,
                        color: "#52525b",
                        marginBottom: 10,
                        lineHeight: 1.5,
                      }}
                    >
                      {t.description}
                    </div>
                  )}
                  <div
                    style={{
                      fontSize: 12,
                      color: "#71717a",
                      display: "flex",
                      gap: 16,
                      flexWrap: "wrap",
                      fontWeight: 500,
                    }}
                  >
                    <span>
                      👤{" "}
                      <b style={{ color: "#18181b" }}>{t.assigned_to_name}</b>
                    </span>
                    <span>📌 By {t.assigned_by_name}</span>
                    {t.order_number && <span>🛒 Order #{t.order_number}</span>}
                    {t.blueprint_title && <span>🗺 {t.blueprint_title}</span>}
                    {t.due_date && (
                      <span style={{ color: overdue ? "#dc2626" : "#71717a" }}>
                        📅 Due{" "}
                        {new Date(t.due_date).toLocaleDateString("en-PH")}
                      </span>
                    )}
                    {t.completed_at && (
                      <span style={{ color: "#0a0a0a", fontWeight: 700 }}>
                        ✓ {new Date(t.completed_at).toLocaleDateString("en-PH")}
                      </span>
                    )}
                  </div>
                </div>

                {/* Right side actions */}
                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    marginLeft: 16,
                    flexShrink: 0,
                    flexWrap: "wrap",
                    justifyContent: "flex-end",
                  }}
                >
                  <button
                    style={{ ...S.btn, ...S.btnGray, padding: "7px 14px" }}
                    onClick={() => openView(t)}
                  >
                    View
                  </button>
                  {isAdmin && (
                    <>
                      {!REQUIRED_PRODUCTION_ROLES.includes(t.task_role) && (
                        <button
                          style={{ ...S.btn, ...S.btnGray, padding: "7px 14px" }}
                          onClick={() => openEdit(t)}
                        >
                          Edit
                        </button>
                      )}
                      {!REQUIRED_PRODUCTION_ROLES.includes(t.task_role) && (
                        <button
                          style={{ ...S.btn, ...S.btnRed, padding: "7px 14px" }}
                          onClick={() => handleDelete(t.id)}
                        >
                          Delete
                        </button>
                      )}
                    </>
                  )}
                  {isAdmin &&
                    REQUIRED_PRODUCTION_ROLES.includes(t.task_role) &&
                    t.order_id && (
                      <button
                        style={{ ...S.btn, ...S.btnGray, padding: "7px 14px" }}
                        onClick={() => navigate(`/admin/orders/${t.order_id}`)}
                      >
                        Open Order
                      </button>
                    )}
                  {!isAdmin && t.status !== "completed" && (
                    <select
                      style={{
                        ...S.select,
                        fontSize: 12,
                        padding: "6px 12px",
                        height: 33,
                      }}
                      value={t.status}
                      onChange={(e) => handleStatusUpdate(t.id, e.target.value)}
                    >
                      <option value="pending">Pending</option>
                      <option value="in_progress">In Progress</option>
                      <option value="completed">Completed</option>
                      <option value="blocked">Blocked</option>
                    </select>
                  )}
                </div>
              </div>
            </div>
          );
        })
      )}

      {/* ── Create / Edit Modal ─────────────────────────────────────────────── */}
      {(modal === "create" || modal === "edit") && (
        <div style={S.overlay} onClick={() => setModal(null)}>
          <div style={S.modal} onClick={(e) => e.stopPropagation()}>
            <div style={S.mTitle}>
              {modal === "create" ? "Assign New Task" : "Edit Task"}
            </div>
            <form onSubmit={handleSave}>
              <div style={S.mRow}>
                <label style={S.label}>Task Title *</label>
                <input
                  style={S.mInput}
                  value={form.title}
                  required
                  placeholder="e.g. Build cabinet for Order #1023"
                  onChange={(e) =>
                    setForm((p) => ({ ...p, title: e.target.value }))
                  }
                />
              </div>
              <div style={S.mRow}>
                <label style={S.label}>Description</label>
                <textarea
                  style={{ ...S.mInput, height: 90, resize: "vertical" }}
                  value={form.description}
                  placeholder="Additional instructions or notes…"
                  onChange={(e) =>
                    setForm((p) => ({ ...p, description: e.target.value }))
                  }
                />
              </div>
              <div style={S.half}>
                <div style={S.mRow}>
                  <label style={S.label}>Assign To *</label>
                  <select
                    style={S.mInput}
                    value={form.assigned_to}
                    required
                    onChange={(e) =>
                      setForm((p) => ({ ...p, assigned_to: e.target.value }))
                    }
                  >
                    <option value="">Select staff…</option>
                    {staff.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} (
                        {s.staff_type === "indoor"
                          ? "Indoor Staff"
                          : s.staff_type}
                        )
                      </option>
                    ))}
                  </select>
                </div>
                <div style={S.mRow}>
                  <label style={S.label}>Task Role</label>
                  {isEditingRequiredProductionTask ? (
                    <select style={S.mInput} value={form.task_role} disabled>
                      <option value={form.task_role}>{form.task_role}</option>
                    </select>
                  ) : (
                    <select
                      style={S.mInput}
                      value={form.task_role}
                      onChange={(e) =>
                        setForm((p) => ({ ...p, task_role: e.target.value }))
                      }
                    >
                      {PRIORITY_ROLES.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
                <div style={S.mRow}>
                  <label style={S.label}>Due Date & Time</label>
                  <input
                    type="datetime-local"
                    style={S.mInput}
                    value={form.due_date}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, due_date: e.target.value }))
                    }
                  />
                </div>
                {modal === "edit" && (
                  <div style={S.mRow}>
                    <label style={S.label}>Status</label>
                    <select
                      style={S.mInput}
                      value={form.status}
                      onChange={(e) =>
                        setForm((p) => ({ ...p, status: e.target.value }))
                      }
                    >
                      <option value="pending">Pending</option>
                      <option value="in_progress">In Progress</option>
                      <option value="completed">Completed</option>
                      <option value="blocked">Blocked</option>
                    </select>
                  </div>
                )}
              </div>
              <div style={S.half}>
                <div style={S.mRow}>
                  <label style={S.label}>Link to Order (optional)</label>
                  {isEditingRequiredProductionTask ? (
                    <select style={S.mInput} value={form.order_id} disabled>
                      <option value={form.order_id}>
                        {target?.order_number
                          ? `#${target.order_number}`
                          : "Linked order"}
                      </option>
                    </select>
                  ) : (
                    <select
                      style={S.mInput}
                      value={form.order_id}
                      onChange={(e) =>
                        setForm((p) => ({ ...p, order_id: e.target.value }))
                      }
                    >
                      <option value="">No linked order</option>
                      {orders.map((o) => (
                        <option key={o.id} value={o.id}>
                          #{o.order_number} ({o.status})
                        </option>
                      ))}
                    </select>
                  )}
                  {isEditingRequiredProductionTask && (
                    <div style={{ fontSize: 11, color: "#71717a", marginTop: 4 }}>
                      Production step and order are managed through Orders → Blueprint.
                    </div>
                  )}
                </div>
              </div>
              <div
                style={{
                  display: "flex",
                  gap: 12,
                  justifyContent: "flex-end",
                  marginTop: 12,
                }}
              >
                <button
                  type="button"
                  style={{ ...S.btn, ...S.btnGray }}
                  onClick={() => setModal(null)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{ ...S.btn, ...S.btnPrim }}
                  disabled={saving}
                >
                  {saving
                    ? "Saving…"
                    : modal === "create"
                      ? "Assign Task"
                      : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── View Modal ──────────────────────────────────────────────────────── */}
      {modal === "view" &&
        target &&
        (() => {
          const sm = STATUS_META[target.status] || STATUS_META.pending;
          const rc = ROLE_COLOR[target.task_role] || ROLE_COLOR["Other"];
          return (
            <div style={S.overlay} onClick={() => setModal(null)}>
              <div style={S.modal} onClick={(e) => e.stopPropagation()}>
                <div style={S.mTitle}>Task Details</div>
                <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
                  <span style={S.tag(sm.bg, sm.color, sm.border)}>
                    {sm.label}
                  </span>
                  <span style={S.tag(rc.bg, rc.color, rc.border)}>
                    {target.task_role}
                  </span>
                </div>
                {[
                  ["Title", target.title],
                  ["Description", target.description || "—"],
                  ["Assigned To", target.assigned_to_name || "—"],
                  ["Assigned By", target.assigned_by_name],
                  [
                    "Linked Order",
                    target.order_number ? `#${target.order_number}` : "—",
                  ],
                  ["Blueprint", target.blueprint_title || "—"],
                  [
                    "Due Date",
                    target.due_date
                      ? new Date(target.due_date).toLocaleString("en-PH")
                      : "—",
                  ],
                  [
                    "Accepted At",
                    target.accepted_at
                      ? new Date(target.accepted_at).toLocaleString("en-PH")
                      : "—",
                  ],
                  [
                    "Completed",
                    target.completed_at
                      ? new Date(target.completed_at).toLocaleString("en-PH")
                      : "—",
                  ],
                  [
                    "Created",
                    new Date(target.created_at).toLocaleString("en-PH"),
                  ],
                ].map(([k, v]) => (
                  <div
                    key={k}
                    style={{
                      display: "flex",
                      gap: 16,
                      marginBottom: 12,
                      fontSize: 13,
                      borderBottom: "1px solid #f4f4f5",
                      paddingBottom: 8,
                    }}
                  >
                    <span
                      style={{
                        fontWeight: 700,
                        color: "#71717a",
                        minWidth: 130,
                      }}
                    >
                      {k}
                    </span>
                    <span style={{ color: "#18181b", fontWeight: 500 }}>
                      {v}
                    </span>
                  </div>
                ))}
                <div
                  style={{
                    display: "flex",
                    justifyContent: "flex-end",
                    marginTop: 24,
                  }}
                >
                  <button
                    style={{ ...S.btn, ...S.btnGray }}
                    onClick={() => setModal(null)}
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          );
        })()}

    </div>
  );
}
