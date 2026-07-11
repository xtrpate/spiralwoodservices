import React, { useCallback, useEffect, useRef, useState } from "react";
import api from "../../services/api";

const ACTION_LABELS = {
  create_product: "Create Product",
  update_product: "Update Product",
  delete_product: "Delete Product",
  update_order_status: "Update Order Status",
  verify_payment: "Verify Payment",
  update_customer_status: "Update Customer Status",
  create_user: "Create User",
  update_user: "Update User",
  reset_user_password: "Reset User Password",
  delete_user: "Delete User",
  create_raw_material: "Create Raw Material",
  update_raw_material: "Update Raw Material",
  delete_raw_material: "Delete Raw Material",
  create_supplier: "Create Supplier",
  update_supplier: "Update Supplier",
  delete_supplier: "Delete Supplier",
  create_stock_movement: "Create Stock Movement",
  create_delivery: "Create Delivery",
  update_delivery_status: "Update Delivery Status",
};

const KNOWN_ACTIONS = Object.keys(ACTION_LABELS);
const KNOWN_TABLES = [
  "products",
  "orders",
  "payment_transactions",
  "users",
  "raw_materials",
  "suppliers",
  "stock_movements",
  "deliveries",
];
const LIMIT_OPTIONS = [10, 20, 50, 100];

const DEFAULT_FILTERS = {
  search: "",
  action: "",
  table_name: "",
  user_id: "",
  date_from: "",
  date_to: "",
  page: 1,
  limit: 20,
};

const DEFAULT_PAGINATION = {
  page: 1,
  limit: 20,
  total: 0,
  totalPages: 0,
  hasNextPage: false,
  hasPreviousPage: false,
};

// Turns "some_action_name" into "Some Action Name". Used both as the
// fallback for action labels not in ACTION_LABELS, and for table_name.
const humanize = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return "—";
  return raw
    .replace(/_/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
};

const formatActionLabel = (action) => ACTION_LABELS[action] || humanize(action);

const formatDateTime = (value) => {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return parsed.toLocaleString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

// Never trust old_values/new_values blindly — they're raw text from the
// database. Parse defensively; anything that isn't a clean JSON object
// is treated as "no data" rather than risking a render crash.
const safeParseJSON = (value) => {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "object") return value;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
};

export default function AuditLogsPage() {
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [searchInput, setSearchInput] = useState("");
  const [logs, setLogs] = useState([]);
  const [pagination, setPagination] = useState(DEFAULT_PAGINATION);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [detailLog, setDetailLog] = useState(null);

  // Debounce free-text search only — dropdowns/dates apply immediately.
  useEffect(() => {
    const trimmed = searchInput.trim();
    const t = setTimeout(() => {
      setFilters((prev) =>
        prev.search === trimmed ? prev : { ...prev, search: trimmed, page: 1 },
      );
    }, 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Guards against rapid filter changes causing an older, slower response
  // to overwrite a newer one — no request is actually aborted (api.js's
  // shared response interceptor treats a cancelled request the same as a
  // network error and would toast "Cannot connect to server", which isn't
  // accurate here), so stale responses are simply ignored on arrival.
  const requestSeq = useRef(0);

  const load = useCallback(async () => {
    const seq = ++requestSeq.current;
    setLoading(true);
    setError("");
    try {
      const params = { page: filters.page, limit: filters.limit };
      if (filters.search) params.search = filters.search;
      if (filters.action) params.action = filters.action;
      if (filters.table_name) params.table_name = filters.table_name;
      if (filters.user_id) params.user_id = filters.user_id;
      if (filters.date_from) params.date_from = filters.date_from;
      if (filters.date_to) params.date_to = filters.date_to;

      const { data } = await api.get("/audit-logs", { params });
      if (seq !== requestSeq.current) return;

      setLogs(Array.isArray(data?.logs) ? data.logs : []);
      setPagination(data?.pagination || DEFAULT_PAGINATION);
    } catch (err) {
      if (seq !== requestSeq.current) return;
      setLogs([]);
      setPagination(DEFAULT_PAGINATION);
      setError(
        err?.response?.data?.message ||
          "Failed to load audit logs. Please try again.",
      );
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    load();
  }, [load]);

  const setFilter = (key, value) =>
    setFilters((prev) => ({ ...prev, [key]: value, page: 1 }));

  const clearFilters = () => {
    setSearchInput("");
    setFilters((prev) => ({ ...DEFAULT_FILTERS, limit: prev.limit }));
  };

  const goToPage = (nextPage) =>
    setFilters((prev) => ({ ...prev, page: nextPage }));

  const activeFilterCount = [
    "search",
    "action",
    "table_name",
    "user_id",
    "date_from",
    "date_to",
  ].filter((key) => Boolean(filters[key])).length;

  return (
    <div style={pageShell}>
      <div style={headerBlock}>
        <div>
          <div style={eyebrow}>Management</div>
          <h1 style={pageTitle}>Audit Logs</h1>
          <p style={pageSubtitle}>
            Accountability trail of admin and staff actions across the system.
          </p>
        </div>
        <div style={summaryPill}>{pagination.total} total records</div>
      </div>

      <div style={filterCard}>
        <div style={filterTopRow}>
          <input
            placeholder="Search by user, email, action, table, or record ID..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            style={{ ...inputBase, ...searchInputStyle }}
          />

          <select
            value={filters.action}
            onChange={(e) => setFilter("action", e.target.value)}
            style={{ ...inputBase, minWidth: 170 }}
          >
            <option value="">All actions</option>
            {KNOWN_ACTIONS.map((a) => (
              <option key={a} value={a}>
                {formatActionLabel(a)}
              </option>
            ))}
          </select>

          <select
            value={filters.table_name}
            onChange={(e) => setFilter("table_name", e.target.value)}
            style={{ ...inputBase, minWidth: 150 }}
          >
            <option value="">All modules</option>
            {KNOWN_TABLES.map((t) => (
              <option key={t} value={t}>
                {humanize(t)}
              </option>
            ))}
          </select>

          <input
            type="number"
            min="1"
            step="1"
            placeholder="User ID"
            value={filters.user_id}
            onChange={(e) => setFilter("user_id", e.target.value)}
            style={{ ...inputBase, minWidth: 110 }}
          />

          <input
            type="date"
            value={filters.date_from}
            onChange={(e) => setFilter("date_from", e.target.value)}
            style={{ ...inputBase, minWidth: 150 }}
          />
          <input
            type="date"
            value={filters.date_to}
            onChange={(e) => setFilter("date_to", e.target.value)}
            style={{ ...inputBase, minWidth: 150 }}
          />

          <select
            value={filters.limit}
            onChange={(e) =>
              setFilters((prev) => ({
                ...prev,
                limit: Number(e.target.value),
                page: 1,
              }))
            }
            style={{ ...inputBase, minWidth: 110 }}
          >
            {LIMIT_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n} / page
              </option>
            ))}
          </select>

          <button onClick={clearFilters} style={btnGhost}>
            Clear Filters
          </button>
        </div>

        <div style={filtersMeta}>
          {activeFilterCount > 0
            ? `${activeFilterCount} active filter(s)`
            : "No active filters"}
        </div>
      </div>

      <div style={tableCard}>
        <div style={tableHeader}>
          <h2 style={tableTitle}>Activity</h2>
          <p style={tableSubtitle}>
            Newest actions first. Click "View Details" to see the full
            before/after change.
          </p>
        </div>

        <div style={tableWrap}>
          <table style={table}>
            <thead>
              <tr style={theadRow}>
                {[
                  "Date & Time",
                  "User",
                  "Email",
                  "Action",
                  "Module",
                  "Record ID",
                  "IP Address",
                  "",
                ].map((label) => (
                  <th key={label} style={th}>
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} style={emptyCell}>
                    Loading audit logs...
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={8} style={emptyCell}>
                    <div style={emptyState}>
                      <div style={emptyStateTitle}>Couldn't load audit logs</div>
                      <div style={emptyStateText}>{error}</div>
                    </div>
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={8} style={emptyCell}>
                    <div style={emptyState}>
                      <div style={emptyStateTitle}>No matching records</div>
                      <div style={emptyStateText}>
                        Try clearing the filters or widening the date range.
                      </div>
                    </div>
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.id} style={tbodyRow}>
                    <td style={td}>{formatDateTime(log.created_at)}</td>
                    <td style={td}>{log.user_name || "System"}</td>
                    <td style={td}>{log.user_email || "—"}</td>
                    <td style={td}>
                      <span style={softBadge}>
                        {formatActionLabel(log.action)}
                      </span>
                    </td>
                    <td style={td}>{humanize(log.table_name)}</td>
                    <td style={td}>{log.record_id ?? "—"}</td>
                    <td style={td}>{log.ip_address || "—"}</td>
                    <td style={td}>
                      <button
                        style={btnView}
                        onClick={() => setDetailLog(log)}
                      >
                        View Details
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {pagination.total > 0 && (
          <div style={paginationBar}>
            <span style={paginationText}>
              Page {pagination.page} of {Math.max(pagination.totalPages, 1)} ·{" "}
              {pagination.total} record(s)
            </span>

            <div style={{ display: "flex", gap: 8 }}>
              <button
                disabled={!pagination.hasPreviousPage}
                onClick={() => goToPage(pagination.page - 1)}
                style={{
                  ...btnGhost,
                  opacity: pagination.hasPreviousPage ? 1 : 0.55,
                  cursor: pagination.hasPreviousPage ? "pointer" : "not-allowed",
                }}
              >
                Previous
              </button>
              <button
                disabled={!pagination.hasNextPage}
                onClick={() => goToPage(pagination.page + 1)}
                style={{
                  ...btnGhost,
                  opacity: pagination.hasNextPage ? 1 : 0.55,
                  cursor: pagination.hasNextPage ? "pointer" : "not-allowed",
                }}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {detailLog && (
        <AuditDetailModal log={detailLog} onClose={() => setDetailLog(null)} />
      )}
    </div>
  );
}

function ValuesPanel({ title, emptyLabel, data }) {
  const parsed = safeParseJSON(data);
  const entries = parsed ? Object.entries(parsed) : [];

  return (
    <div style={panel}>
      <div style={panelTitle}>{title}</div>
      {entries.length === 0 ? (
        <div style={emptyValueText}>{emptyLabel}</div>
      ) : (
        <div style={valueList}>
          {entries.map(([key, val]) => (
            <div key={key} style={valueRow}>
              <span style={valueKey}>{humanize(key)}</span>
              <span style={valueVal}>
                {val === null || val === undefined || val === ""
                  ? "—"
                  : typeof val === "object"
                    ? JSON.stringify(val)
                    : String(val)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AuditDetailModal({ log, onClose }) {
  return (
    <div style={overlay}>
      <div style={detailModal}>
        <div style={modalHeader}>
          <div>
            <div style={modalEyebrow}>Audit Entry</div>
            <h3 style={modalTitle}>{formatActionLabel(log.action)}</h3>
            <div style={modalSubline}>{formatDateTime(log.created_at)}</div>
          </div>
          <button onClick={onClose} style={closeBtn}>
            ✕
          </button>
        </div>

        <div style={{ padding: 24 }}>
          <div style={detailGrid}>
            <DetailRow label="User" value={log.user_name || "System"} />
            <DetailRow label="Email" value={log.user_email || "—"} />
            <DetailRow label="Action" value={formatActionLabel(log.action)} />
            <DetailRow label="Module" value={humanize(log.table_name)} />
            <DetailRow label="Record ID" value={log.record_id ?? "—"} />
            <DetailRow label="IP Address" value={log.ip_address || "—"} />
          </div>

          <div style={{ display: "grid", gap: 16, marginTop: 16 }}>
            <ValuesPanel
              title="Previous Values"
              emptyLabel="No previous values"
              data={log.old_values}
            />
            <ValuesPanel
              title="New Values"
              emptyLabel="No new values"
              data={log.new_values}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function DetailRow({ label, value }) {
  return (
    <div>
      <div style={detailLabel}>{label}</div>
      <div style={detailValue}>{value}</div>
    </div>
  );
}

/* ─── Styles (matches existing admin table pages, e.g. OrdersPage.jsx) ─── */
const pageShell = { maxWidth: 1180, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 };
const headerBlock = { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 14, flexWrap: "wrap" };
const eyebrow = { fontSize: 10, fontWeight: 800, letterSpacing: "1px", textTransform: "uppercase", color: "#71717a", marginBottom: 8 };
const pageTitle = { margin: 0, fontSize: 24, lineHeight: 1.1, fontWeight: 800, color: "#0a0a0a", letterSpacing: "-0.02em" };
const pageSubtitle = { margin: "8px 0 0", color: "#52525b", fontSize: 13, lineHeight: 1.55, maxWidth: 620 };
const summaryPill = { background: "#ffffff", border: "1px solid #e4e4e7", borderRadius: 12, padding: "10px 14px", fontSize: 12, fontWeight: 700, color: "#18181b", boxShadow: "0 1px 2px rgba(0,0,0,0.02)" };
const filterCard = { background: "#ffffff", border: "1px solid #e4e4e7", borderRadius: 16, padding: 16, boxShadow: "0 1px 2px rgba(0,0,0,0.02)" };
const filterTopRow = { display: "flex", gap: 10, flexWrap: "wrap" };
const inputBase = { height: 38, padding: "0 14px", border: "1px solid #e4e4e7", borderRadius: 8, background: "#ffffff", color: "#18181b", fontSize: 13, fontWeight: 500, outline: "none" };
const searchInputStyle = { flex: "1 1 320px", minWidth: 240 };
const filtersMeta = { marginTop: 10, fontSize: 12, color: "#71717a", fontWeight: 500 };
const tableCard = { background: "#ffffff", border: "1px solid #e4e4e7", borderRadius: 16, overflow: "hidden", boxShadow: "0 1px 2px rgba(0,0,0,0.02)" };
const tableHeader = { padding: "20px 20px 14px", borderBottom: "1px solid #e4e4e7" };
const tableTitle = { margin: 0, fontSize: 18, fontWeight: 800, color: "#0a0a0a", letterSpacing: "-0.01em" };
const tableSubtitle = { margin: "4px 0 0", fontSize: 13, color: "#52525b", lineHeight: 1.5 };
const tableWrap = { width: "100%", overflowX: "auto" };
const table = { width: "100%", borderCollapse: "separate", borderSpacing: 0, minWidth: 920 };
const theadRow = { background: "#fafafa" };
const th = { textAlign: "left", padding: "14px 16px", fontSize: 10, fontWeight: 800, color: "#71717a", textTransform: "uppercase", letterSpacing: "1px", borderBottom: "1px solid #e4e4e7" };
const tbodyRow = { background: "#ffffff" };
const td = { padding: "16px 16px", color: "#18181b", fontSize: 13, borderBottom: "1px solid #f4f4f5", verticalAlign: "middle" };
const softBadge = { display: "inline-flex", alignItems: "center", padding: "4px 10px", borderRadius: 999, background: "#f4f4f5", color: "#52525b", border: "1px solid #e4e4e7", fontSize: 11, fontWeight: 600, whiteSpace: "nowrap" };
const btnView = { height: 32, padding: "0 14px", borderRadius: 8, border: "1px solid #e4e4e7", background: "#f4f4f5", color: "#18181b", fontSize: 12, fontWeight: 700, cursor: "pointer" };
const btnGhost = { height: 38, padding: "0 16px", borderRadius: 8, border: "1px solid #e4e4e7", background: "#f4f4f5", color: "#18181b", fontSize: 13, fontWeight: 600, cursor: "pointer" };
const emptyCell = { padding: 32, textAlign: "center", color: "#71717a", fontSize: 13 };
const emptyState = { display: "inline-flex", flexDirection: "column", gap: 6, maxWidth: 420 };
const emptyStateTitle = { fontSize: 15, fontWeight: 800, color: "#0a0a0a" };
const emptyStateText = { fontSize: 13, lineHeight: 1.55, color: "#52525b" };
const paginationBar = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "16px 20px", background: "#fafafa", flexWrap: "wrap" };
const paginationText = { fontSize: 13, fontWeight: 600, color: "#71717a" };
const overlay = { position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 20 };
const detailModal = { width: "100%", maxWidth: 640, maxHeight: "90vh", overflowY: "auto", background: "#fff", borderRadius: 20, boxShadow: "0 25px 60px rgba(0,0,0,0.15)" };
const modalHeader = { padding: "24px 24px 16px", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, borderBottom: "1px solid #e4e4e7" };
const modalEyebrow = { fontSize: 10, fontWeight: 800, letterSpacing: "1px", textTransform: "uppercase", color: "#71717a", marginBottom: 8 };
const modalTitle = { margin: 0, fontSize: 20, fontWeight: 800, color: "#0a0a0a", lineHeight: 1.15 };
const modalSubline = { marginTop: 8, fontSize: 13, color: "#52525b" };
const closeBtn = { width: 36, height: 36, borderRadius: 999, border: "1px solid #e4e4e7", background: "#fafafa", color: "#52525b", fontSize: 16, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" };
const detailGrid = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 };
const detailLabel = { fontSize: 10, fontWeight: 800, letterSpacing: "1px", textTransform: "uppercase", color: "#71717a", marginBottom: 4 };
const detailValue = { fontSize: 13, fontWeight: 600, color: "#18181b", wordBreak: "break-word" };
const panel = { background: "#fafafa", border: "1px solid #e4e4e7", borderRadius: 12, padding: 16 };
const panelTitle = { fontSize: 11, fontWeight: 800, color: "#0a0a0a", textTransform: "uppercase", letterSpacing: "1px", marginBottom: 12 };
const emptyValueText = { fontSize: 13, color: "#71717a", fontStyle: "italic" };
const valueList = { display: "flex", flexDirection: "column", gap: 8 };
const valueRow = { display: "flex", justifyContent: "space-between", gap: 12, fontSize: 12.5, borderBottom: "1px solid #eee", paddingBottom: 6 };
const valueKey = { color: "#71717a", fontWeight: 600, flexShrink: 0 };
const valueVal = { color: "#18181b", fontWeight: 600, textAlign: "right", wordBreak: "break-word" };