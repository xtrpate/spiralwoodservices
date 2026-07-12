import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../services/api";
import toast from "react-hot-toast";

const POLICY_STYLE = {
  full_refund: {
    bg: "#f4f4f5",
    color: "#18181b",
    border: "#e4e4e7",
    label: "Full Refund",
  },
  processing_fee: {
    bg: "#ffffff",
    color: "#52525b",
    border: "#d4d4d8",
    label: "15% Fee Applied",
  },
  non_refundable: {
    bg: "#fef2f2",
    color: "#991b1b",
    border: "#fecaca",
    label: "Non-Refundable",
  },
  rejected: {
    bg: "#fef2f2",
    color: "#dc2626",
    border: "#fecaca",
    label: "Rejected",
  },
};

const DECISION_STYLE = {
  pending: {
    bg: "#ffffff",
    color: "#52525b",
    border: "#d4d4d8",
    label: "Pending",
  },
  approved: {
    bg: "#f4f4f5",
    color: "#18181b",
    border: "#e4e4e7",
    label: "Approved",
  },
  rejected: {
    bg: "#fef2f2",
    color: "#dc2626",
    border: "#fecaca",
    label: "Rejected",
  },
};

const normalize = (value) =>
  String(value || "")
    .trim()
    .toLowerCase();

const getChannelMeta = (channel) => {
  const key = normalize(channel);
  return key === "online"
    ? { label: "Online", bg: "#f4f4f5", color: "#18181b", border: "#e4e4e7" }
    : { label: "Walk-in", bg: "#ffffff", color: "#52525b", border: "#d4d4d8" };
};

const formatMoney = (value) =>
  `₱ ${Number(value || 0).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const formatDateTime = (value) => {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return parsed.toLocaleString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

const getDecisionStatus = (row) => {
  const explicit = normalize(row?.decision_status);
  if (explicit) return explicit;

  if (row?.approved_by == null) return "pending";
  if (normalize(row?.policy_applied) === "rejected") return "rejected";
  return "approved";
};

export default function CancellationsPage() {
  const navigate = useNavigate();

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [search, setSearch] = useState("");
  const [decisionFilter, setDecisionFilter] = useState("");
  const [showPolicy, setShowPolicy] = useState(false);
  const [processing, setProcessing] = useState(false);
  const processingLockRef = useRef(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/orders/cancellations");
      setRows(Array.isArray(data) ? data : []);
    } catch (err) {
      toast.error(
        err?.response?.data?.message || "Failed to load cancellation requests.",
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const filteredRows = useMemo(() => {
    const term = normalize(search);

    return rows.filter((row) => {
      const decision = getDecisionStatus(row);
      const haystack = [
        row.order_number,
        row.customer_name,
        row.requested_by_name,
        row.reason,
        row.policy_applied,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return (
        (!decisionFilter || decision === decisionFilter) &&
        (!term || haystack.includes(term))
      );
    });
  }, [rows, search, decisionFilter]);

  const stats = useMemo(() => {
    const pending = rows.filter(
      (row) => getDecisionStatus(row) === "pending",
    ).length;
    const approved = rows.filter(
      (row) => getDecisionStatus(row) === "approved",
    ).length;
    const rejected = rows.filter(
      (row) => getDecisionStatus(row) === "rejected",
    ).length;
    const refundExposure = rows
      .filter((row) => getDecisionStatus(row) === "approved")
      .reduce((sum, row) => sum + Number(row.refund_amount || 0), 0);

    return [
      { label: "Total Requests", value: rows.length },
      { label: "Pending Review", value: pending },
      { label: "Approved", value: approved },
      { label: "Rejected", value: rejected },
      { label: "Refund Exposure", value: formatMoney(refundExposure) },
    ];
  }, [rows]);

  const handleProcess = async ({ approved, refund_amount, policy_applied }) => {
    if (!modal?.row?.order_id) return;
    if (processingLockRef.current) return;

    processingLockRef.current = true;
    setProcessing(true);

    try {
      await api.post(`/orders/${modal.row.order_id}/cancellation`, {
        approved,
        refund_amount,
        policy_applied,
      });

      toast.success(approved ? "Refund approved." : "Refund rejected.");
      setModal(null);
      load();
    } catch (err) {
      // 400/409/500/network errors are already toasted once by the shared
      // Axios interceptor. It intentionally skips 404, so handle only
      // that case here to avoid a duplicate toast.
      if (err?.response?.status === 404) {
        toast.error(
          err?.response?.data?.message ||
            "Cancellation request was not found.",
        );
      }
    } finally {
      processingLockRef.current = false;
      setProcessing(false);
    }
  };

  return (
    <div style={pageShell}>
      <div style={headerBlock}>
        <div>
          <div style={eyebrow}>Sales & Orders</div>
          <h1 style={pageTitle}>Cancellations & Refunds</h1>
          <p style={pageSubtitle}>
            Keep review decisions clean, consistent, and tied to the server-side
            refund policy.
          </p>
        </div>

        <div style={summaryPill}>{rows.length} total requests</div>
      </div>

      <div style={statsGrid}>
        {stats.map((item) => (
          <div key={item.label} style={statCard}>
            <div style={statLabel}>{item.label}</div>
            <div style={statValue}>{item.value}</div>
          </div>
        ))}
      </div>

      <div style={infoCard}>
        <div style={infoHeader}>
          <div>
            <div style={infoTitle}>Cancellation policy guide</div>
            <div style={infoSubtitle}>
              Show only when needed instead of always taking vertical space.
            </div>
          </div>

          <button
            onClick={() => setShowPolicy((prev) => !prev)}
            style={btnGhost}
          >
            {showPolicy ? "Hide Policy" : "View Policy"}
          </button>
        </div>

        {showPolicy && (
          <div style={policyBody}>
            <div>
              • Standard orders cancelled before shipment → full refund.
            </div>
            <div>
              • Custom blueprint orders after down payment but before contract
              release → 15% processing fee.
            </div>
            <div>• After contract release → non-refundable.</div>
            <div>
              • POS same-day void before the item leaves the premises → full
              refund.
            </div>
          </div>
        )}
      </div>

      <div style={filterCard}>
        <div style={filterTopRow}>
          <input
            placeholder="Search order, customer, requester, or reason..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ ...inputBase, ...searchInput }}
          />

          <select
            value={decisionFilter}
            onChange={(e) => setDecisionFilter(e.target.value)}
            style={{ ...inputBase, minWidth: 180 }}
          >
            <option value="">All Decisions</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>

          <button
            onClick={() => {
              setSearch("");
              setDecisionFilter("");
            }}
            style={btnGhost}
          >
            Reset
          </button>
        </div>

        <div style={statusRow}>
          <button
            type="button"
            onClick={() => setDecisionFilter("")}
            style={{
              ...statusChip,
              background: decisionFilter ? "#f4f4f5" : "#18181b",
              color: decisionFilter ? "#52525b" : "#ffffff",
              borderColor: decisionFilter ? "#e4e4e7" : "#18181b",
            }}
          >
            All
          </button>

          {Object.entries(DECISION_STYLE).map(([key, meta]) => {
            const isActive = decisionFilter === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setDecisionFilter(key)}
                style={{
                  ...statusChip,
                  background: isActive ? "#18181b" : meta.bg,
                  color: isActive ? "#ffffff" : meta.color,
                  borderColor: isActive ? "#18181b" : meta.border,
                }}
              >
                {meta.label}
              </button>
            );
          })}

          <div style={filtersMeta}>
            {search || decisionFilter
              ? "Filtered view"
              : "Showing all requests"}
          </div>
        </div>
      </div>

      <div style={tableCard}>
        <div style={tableHeader}>
          <div>
            <h2 style={tableTitle}>Cancellation Requests</h2>
            <p style={tableSubtitle}>
              Use the table for scanning, then open a single request only when
              you need to process it.
            </p>
          </div>
        </div>

        <div style={tableWrap}>
          <table style={table}>
            <thead>
              <tr style={theadRow}>
                {[
                  "Order",
                  "Customer",
                  "Requested By",
                  "Channel",
                  "Reason",
                  "Policy",
                  "Refund",
                  "Decision",
                  "Actions",
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
                  <td colSpan={9} style={emptyCell}>
                    Loading cancellation requests...
                  </td>
                </tr>
              ) : filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={9} style={emptyCell}>
                    <div style={emptyState}>
                      <div style={emptyStateTitle}>
                        No cancellation requests found
                      </div>
                      <div style={emptyStateText}>
                        New requests will appear here after customers submit a
                        cancellation or refund request.
                      </div>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredRows.map((row) => {
                  const decision = getDecisionStatus(row);
                  const decisionMeta =
                    DECISION_STYLE[decision] || DECISION_STYLE.pending;
                  const policyKey =
                    normalize(row.policy_applied) ||
                    (decision === "rejected" ? "rejected" : "");
                  const policyMeta = POLICY_STYLE[policyKey];
                  const channelMeta = getChannelMeta(row.channel);

                  return (
                    <tr key={row.id} style={tbodyRow}>
                      <td style={td}>
                        <button
                          onClick={() =>
                            navigate(`/admin/orders/${row.order_id}`)
                          }
                          style={orderLink}
                        >
                          {row.order_number ||
                            `#${String(row.order_id).padStart(5, "0")}`}
                        </button>
                        <div style={secondaryText}>
                          Requested {formatDateTime(row.created_at)}
                        </div>
                      </td>

                      <td style={td}>
                        <div style={primaryText}>
                          {row.customer_name || "Customer"}
                        </div>
                        <div style={secondaryText}>
                          Order #{String(row.order_id).padStart(5, "0")}
                        </div>
                      </td>

                      <td style={td}>
                        <div style={primaryText}>
                          {row.requested_by_name || "Customer"}
                        </div>
                        <div style={secondaryText}>
                          {row.approved_by_name
                            ? `Processed by ${row.approved_by_name}`
                            : "Awaiting admin review"}
                        </div>
                      </td>

                      <td style={td}>
                        <span
                          style={{
                            ...softBadge,
                            background: channelMeta.bg,
                            color: channelMeta.color,
                            border: `1px solid ${channelMeta.border}`,
                          }}
                        >
                          {channelMeta.label}
                        </span>
                      </td>

                      <td style={td}>
                        <div style={reasonText}>
                          {row.reason || "No reason provided."}
                        </div>
                      </td>

                      <td style={td}>
                        {policyMeta ? (
                          <span
                            style={{
                              ...softBadge,
                              background: policyMeta.bg,
                              color: policyMeta.color,
                              border: `1px solid ${policyMeta.border}`,
                            }}
                          >
                            {policyMeta.label}
                          </span>
                        ) : (
                          <span style={secondaryText}>Pending review</span>
                        )}
                      </td>

                      <td
                        style={{
                          ...td,
                          fontWeight: 700,
                          color:
                            Number(row.refund_amount || 0) > 0
                              ? "#18181b"
                              : "#71717a",
                        }}
                      >
                        {Number(row.refund_amount || 0) > 0
                          ? formatMoney(row.refund_amount)
                          : "—"}
                      </td>

                      <td style={td}>
                        <span
                          style={{
                            ...softBadge,
                            background: decisionMeta.bg,
                            color: decisionMeta.color,
                            border: `1px solid ${decisionMeta.border}`,
                          }}
                        >
                          {decisionMeta.label}
                        </span>
                      </td>

                      <td style={td}>
                        <div style={actionsRow}>
                          <button
                            onClick={() =>
                              navigate(`/admin/orders/${row.order_id}`)
                            }
                            style={btnView}
                          >
                            View order
                          </button>

                          {decision === "pending" && (
                            <button
                              onClick={() => setModal({ row })}
                              style={btnApprove}
                            >
                              Process
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {modal && (
        <ProcessModal
          row={modal.row}
          onClose={() => setModal(null)}
          onSubmit={handleProcess}
          processing={processing}
        />
      )}
    </div>
  );
}

function ProcessModal({ row, onClose, onSubmit, processing }) {
  const [approved, setApproved] = useState(true);
  const [policy, setPolicy] = useState("full_refund");
  const [refund, setRefund] = useState(
    Number(row.total_amount || 0).toFixed(2),
  );

  const handlePolicyChange = (nextPolicy) => {
    setPolicy(nextPolicy);

    const total = Number(row.total_amount || 0);

    if (nextPolicy === "full_refund") setRefund(total.toFixed(2));
    if (nextPolicy === "processing_fee") setRefund((total * 0.85).toFixed(2));
    if (nextPolicy === "non_refundable") setRefund("0.00");
  };

  const handleSubmit = () => {
    const numericRefund = Number(refund || 0);

    if (approved) {
      if (Number.isNaN(numericRefund) || numericRefund < 0) {
        toast.error("Refund amount must be 0 or higher.");
        return;
      }

      onSubmit({
        approved: true,
        refund_amount: numericRefund,
        policy_applied: policy,
      });
      return;
    }

    onSubmit({
      approved: false,
      refund_amount: 0,
      policy_applied: null,
    });
  };

  return (
    <div style={overlay}>
      <div style={modalBox}>
        <h3 style={modalTitle}>Process Cancellation Request</h3>
        <p style={modalSubtitle}>
          {row.order_number ||
            `Order #${String(row.order_id).padStart(5, "0")}`}{" "}
          · Total {formatMoney(row.total_amount)}
        </p>

        <div style={infoPanel}>
          <div>
            <strong>Customer:</strong> {row.customer_name || "Customer"}
          </div>
          <div>
            <strong>Requested by:</strong> {row.requested_by_name || "Customer"}
          </div>
          <div>
            <strong>Requested on:</strong> {formatDateTime(row.created_at)}
          </div>
          <div>
            <strong>Reason:</strong> {row.reason || "No reason provided."}
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={labelSm}>Decision</label>
          <div style={radioRow}>
            <label style={radioLabel}>
              <input
                type="radio"
                checked={approved}
                onChange={() => setApproved(true)}
              />
              Approve refund
            </label>

            <label style={radioLabel}>
              <input
                type="radio"
                checked={!approved}
                onChange={() => setApproved(false)}
              />
              Reject refund
            </label>
          </div>
        </div>

        {approved ? (
          <>
            <div style={{ marginBottom: 14 }}>
              <label style={labelSm}>Cancellation Policy</label>
              <select
                value={policy}
                onChange={(e) => handlePolicyChange(e.target.value)}
                style={inputFull}
              >
                <option value="full_refund">Full Refund</option>
                <option value="processing_fee">15% Processing Fee</option>
                <option value="non_refundable">Non-Refundable</option>
              </select>
            </div>

            <div style={{ marginBottom: 18 }}>
              <label style={labelSm}>Refund Amount (₱)</label>
              <input
                type="number"
                step="0.01"
                value={refund}
                readOnly
                style={{
                  ...inputFull,
                  background: "#f4f4f5",
                  color: "#52525b",
                }}
              />
              <div style={helperText}>
                Preview only. Final refund amount is still validated and
                enforced by the backend.
              </div>
            </div>
          </>
        ) : (
          <div style={rejectNote}>
            No refund will be recorded for this request. The order remains
            cancelled — this decision does not change the order status.
          </div>
        )}

        <div style={modalActions}>
          <button onClick={onClose} style={btnGhost} disabled={processing}>
            Close
          </button>
          <button
            onClick={handleSubmit}
            style={approved ? btnPrimary : btnDeclineAction}
            disabled={processing}
          >
            {processing
              ? "Processing..."
              : approved
                ? "Approve Refund"
                : "Reject Refund"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const pageShell = {
  maxWidth: 1180,
  margin: "0 auto",
  display: "flex",
  flexDirection: "column",
  gap: 16,
};

const headerBlock = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 14,
  flexWrap: "wrap",
};

const eyebrow = {
  fontSize: 10,
  fontWeight: 800,
  letterSpacing: "1.2px",
  textTransform: "uppercase",
  color: "#71717a",
  marginBottom: 8,
};

const pageTitle = {
  margin: 0,
  fontSize: 24,
  lineHeight: 1.1,
  fontWeight: 800,
  color: "#0a0a0a",
  letterSpacing: "-0.02em",
};

const pageSubtitle = {
  margin: "8px 0 0",
  color: "#52525b",
  fontSize: 13,
  lineHeight: 1.55,
};

const summaryPill = {
  background: "#ffffff",
  border: "1px solid #e4e4e7",
  borderRadius: 12,
  padding: "10px 14px",
  fontSize: 12,
  fontWeight: 700,
  color: "#18181b",
  boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
};

const statsGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
  gap: 12,
};

const statCard = {
  background: "#ffffff",
  border: "1px solid #e4e4e7",
  borderRadius: 12,
  padding: "16px 18px",
  boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
};

const statLabel = {
  fontSize: 10,
  fontWeight: 800,
  letterSpacing: "1px",
  textTransform: "uppercase",
  color: "#71717a",
  marginBottom: 8,
};

const statValue = {
  fontSize: 24,
  fontWeight: 800,
  color: "#0a0a0a",
  lineHeight: 1,
  letterSpacing: "-0.02em",
};

const infoCard = {
  background: "#ffffff",
  border: "1px solid #e4e4e7",
  borderRadius: 16,
  padding: 16,
  boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
};

const infoHeader = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  flexWrap: "wrap",
};

const infoTitle = {
  fontSize: 14,
  fontWeight: 800,
  color: "#0a0a0a",
};

const infoSubtitle = {
  marginTop: 4,
  fontSize: 12,
  color: "#52525b",
};

const policyBody = {
  marginTop: 16,
  display: "grid",
  gap: 8,
  padding: "14px 16px",
  borderRadius: 12,
  background: "#fafafa",
  border: "1px solid #e4e4e7",
  color: "#52525b",
  fontSize: 13,
  lineHeight: 1.6,
};

const filterCard = {
  background: "#ffffff",
  border: "1px solid #e4e4e7",
  borderRadius: 16,
  padding: 16,
  boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
};

const filterTopRow = {
  display: "flex",
  flexWrap: "wrap",
  gap: 10,
  marginBottom: 16,
};

const inputBase = {
  height: 38,
  borderRadius: 8,
  border: "1px solid #e4e4e7",
  background: "#ffffff",
  padding: "0 14px",
  fontSize: 13,
  color: "#18181b",
  outline: "none",
};

const searchInput = {
  flex: "1 1 320px",
  minWidth: 260,
};

const statusRow = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  alignItems: "center",
};

const statusChip = {
  padding: "6px 14px",
  borderRadius: 999,
  border: "1px solid transparent",
  fontSize: 11,
  fontWeight: 600,
  cursor: "pointer",
  transition: "all 0.15s ease",
};

const filtersMeta = {
  marginLeft: "auto",
  fontSize: 12,
  color: "#71717a",
  fontWeight: 500,
};

const tableCard = {
  background: "#ffffff",
  border: "1px solid #e4e4e7",
  borderRadius: 16,
  overflow: "hidden",
  boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
};

const tableHeader = {
  padding: "20px 20px 14px",
  borderBottom: "1px solid #e4e4e7",
};

const tableTitle = {
  margin: 0,
  fontSize: 18,
  fontWeight: 800,
  color: "#0a0a0a",
  letterSpacing: "-0.01em",
};

const tableSubtitle = {
  margin: "4px 0 0",
  fontSize: 13,
  color: "#52525b",
};

const tableWrap = {
  width: "100%",
  overflowX: "auto",
};

const table = {
  width: "100%",
  borderCollapse: "collapse",
  minWidth: 920,
};

const theadRow = {
  background: "#fafafa",
};

const th = {
  padding: "14px 16px",
  textAlign: "left",
  fontSize: 10,
  fontWeight: 800,
  textTransform: "uppercase",
  letterSpacing: "1px",
  color: "#71717a",
  borderBottom: "1px solid #e4e4e7",
};

const tbodyRow = {
  background: "#ffffff",
};

const td = {
  padding: "16px 16px",
  fontSize: 13,
  color: "#18181b",
  borderBottom: "1px solid #f4f4f5",
  verticalAlign: "middle",
};

const orderLink = {
  background: "none",
  border: "none",
  color: "#18181b",
  padding: 0,
  fontSize: 13,
  fontWeight: 800,
  cursor: "pointer",
};

const primaryText = {
  fontSize: 13,
  fontWeight: 700,
  color: "#0a0a0a",
};

const secondaryText = {
  marginTop: 4,
  fontSize: 11,
  color: "#71717a",
};

const reasonText = {
  maxWidth: 240,
  fontSize: 12,
  lineHeight: 1.55,
  color: "#52525b",
};

const softBadge = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "4px 10px",
  borderRadius: 999,
  fontSize: 11,
  fontWeight: 600,
  whiteSpace: "nowrap",
};

const actionsRow = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
};

const btnView = {
  padding: "8px 14px",
  borderRadius: 8,
  border: "1px solid #e4e4e7",
  background: "#f4f4f5",
  color: "#18181b",
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
  transition: "background 0.2s",
};

const btnApprove = {
  padding: "8px 14px",
  borderRadius: 8,
  border: "1px solid #18181b",
  background: "#18181b",
  color: "#ffffff",
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
  transition: "background 0.2s",
};

const btnGhost = {
  padding: "9px 14px",
  borderRadius: 8,
  border: "1px solid #e4e4e7",
  background: "#f4f4f5",
  color: "#18181b",
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
  transition: "background 0.2s",
};

const btnPrimary = {
  padding: "10px 18px",
  borderRadius: 8,
  border: "1px solid #18181b",
  background: "#18181b",
  color: "#ffffff",
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
  transition: "background 0.2s",
};

const emptyCell = {
  padding: 32,
  textAlign: "center",
  color: "#71717a",
  fontSize: 13,
};

const emptyState = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
  alignItems: "center",
};

const emptyStateTitle = {
  fontWeight: 800,
  color: "#0a0a0a",
  fontSize: 15,
};

const emptyStateText = {
  maxWidth: 420,
  lineHeight: 1.55,
};

const overlay = {
  position: "fixed",
  inset: 0,
  background: "rgba(0, 0, 0, 0.6)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 1000,
  padding: 20,
};

const modalBox = {
  background: "#fff",
  borderRadius: 16,
  padding: 28,
  width: 500,
  maxWidth: "100%",
  border: "1px solid #e4e4e7",
  boxShadow: "0 25px 60px rgba(0, 0, 0, 0.15)",
};

const modalTitle = {
  margin: 0,
  fontSize: 18,
  fontWeight: 800,
  color: "#0a0a0a",
};

const modalSubtitle = {
  margin: "6px 0 20px",
  fontSize: 13,
  color: "#52525b",
};

const infoPanel = {
  background: "#fafafa",
  border: "1px solid #e4e4e7",
  borderRadius: 12,
  padding: "14px 16px",
  marginBottom: 20,
  display: "grid",
  gap: 10,
  fontSize: 13,
  color: "#18181b",
  lineHeight: 1.55,
};

const labelSm = {
  display: "block",
  fontSize: 12,
  fontWeight: 800,
  color: "#18181b",
  marginBottom: 8,
};

const radioRow = {
  display: "flex",
  gap: 20,
  flexWrap: "wrap",
};

const radioLabel = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  fontSize: 13,
  color: "#18181b",
  fontWeight: 500,
};

const inputFull = {
  width: "100%",
  height: 40,
  borderRadius: 8,
  border: "1px solid #e4e4e7",
  background: "#ffffff",
  padding: "0 14px",
  fontSize: 13,
  color: "#18181b",
  boxSizing: "border-box",
  outline: "none",
};

const helperText = {
  marginTop: 8,
  fontSize: 11,
  color: "#71717a",
  lineHeight: 1.5,
};

const rejectNote = {
  padding: "14px 16px",
  borderRadius: 12,
  background: "#fef2f2",
  border: "1px solid #fecaca",
  color: "#991b1b",
  fontSize: 13,
  lineHeight: 1.55,
};

const modalActions = {
  marginTop: 24,
  display: "flex",
  justifyContent: "flex-end",
  gap: 12,
  flexWrap: "wrap",
};

const btnDeclineAction = {
  padding: "10px 18px",
  borderRadius: 8,
  border: "1px solid #fecaca",
  background: "#fef2f2",
  color: "#dc2626",
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
  transition: "background 0.2s",
};