// src/pages/sales/SalesReportPage.jsx – Sales Reports (POS / Online / Combined)
import React, { useEffect, useState, useCallback } from "react";
import api from "../../services/api";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const TABS = [
  { key: "walkin", label: "🏪 POS / Walk-in Report" },
  { key: "online", label: "🌐 Online Sales Report" },
  { key: "", label: "📊 Combined Report" },
];

const PERIODS = [
  { value: "daily", label: "Today" },
  { value: "weekly", label: "This Week" },
  { value: "monthly", label: "This Month" },
  { value: "yearly", label: "This Year" },
  { value: "custom", label: "Custom Range" },
];

const STATUS_STYLE = {
  pending: { bg: "#ffffff", color: "#52525b", border: "#d4d4d8" },
  confirmed: { bg: "#f4f4f5", color: "#18181b", border: "#e4e4e7" },
  contract_released: { bg: "#f4f4f5", color: "#18181b", border: "#e4e4e7" },
  production: { bg: "#f4f4f5", color: "#18181b", border: "#e4e4e7" },
  shipping: { bg: "#f4f4f5", color: "#18181b", border: "#e4e4e7" },
  delivered: { bg: "#18181b", color: "#ffffff", border: "#18181b" },
  completed: { bg: "#0a0a0a", color: "#ffffff", border: "#0a0a0a" },
  cancelled: { bg: "#fef2f2", color: "#991b1b", border: "#fecaca" },
};

const formatStatusLabel = (value) =>
  String(value || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());

const formatChannelLabel = (value) =>
  String(value || "").toLowerCase() === "online" ? "Online" : "Walk-in";

const formatMoney = (value) =>
  `₱ ${Number(value || 0).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

export default function SalesReportPage() {
  const [tab, setTab] = useState(""); // '' = combined
  const [period, setPeriod] = useState("monthly");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { channel: tab };

      if (period === "custom" && from && to) {
        params.from = from;
        params.to = to;
      } else if (period !== "custom") {
        params.period = period;
      }

      const { data: res } = await api.get("/sales/report", { params });
      setData(res);
    } finally {
      setLoading(false);
    }
  }, [tab, period, from, to]);

  useEffect(() => {
    if (period === "custom") return;
    load();
  }, [load, period]);

  const handleApplyCustomRange = () => {
    if (!from || !to) return;
    if (from > to) return;
    load();
  };

  const exportPDF = () => {
    if (!data) return;

    const doc = new jsPDF({ orientation: "landscape" });
    const tabLabel =
      TABS.find((t) => t.key === tab)?.label || "Combined Report";
    const cleanTabLabel = tabLabel.replace(/[🏪🌐📊]/g, "").trim();
    const dateStr =
      period === "custom"
        ? `${from} to ${to}`
        : PERIODS.find((p) => p.value === period)?.label || "";

    doc.setFontSize(16).setFont("helvetica", "bold");
    doc.text("Spiral Wood Services", 148, 14, { align: "center" });

    doc.setFontSize(11).setFont("helvetica", "normal");
    doc.text("8 Sitio Laot, Prenza 1, Marilao, Bulacan", 148, 20, {
      align: "center",
    });

    doc.setFontSize(13).setFont("helvetica", "bold");
    doc.text(`SALES REPORT — ${cleanTabLabel}`, 148, 28, {
      align: "center",
    });

    doc.setFontSize(10).setFont("helvetica", "normal");
    doc.text(
      `Period: ${dateStr}    |    Generated: ${new Date().toLocaleString("en-PH")}`,
      148,
      34,
      { align: "center" },
    );

    const s = data.summary || {};
    doc.setFontSize(10).setFont("helvetica", "bold");
    doc.text(`Total Orders: ${s.total_orders || 0}`, 14, 44);
    doc.text(`Total Revenue: ${formatMoney(s.total_revenue)}`, 60, 44);
    doc.text(`Total Profit: ${formatMoney(s.total_profit)}`, 120, 44);
    doc.text(`Avg Order Value: ${formatMoney(s.avg_order_value)}`, 190, 44);

    autoTable(doc, {
      startY: 50,
      head: [
        [
          "Order ID",
          "Customer",
          "Phone",
          "Channel",
          "Payment",
          "Amount (₱)",
          "Profit (₱)",
          "Status",
          "Delivery",
          "Date",
        ],
      ],
      body: (data.orders || []).map((o) => [
        `#${String(o.id).padStart(5, "0")}`,
        o.customer_name || "—",
        o.customer_phone || "—",
        formatChannelLabel(o.channel),
        o.payment_method?.replace(/_/g, " ") || "—",
        Number(o.total_amount || 0).toFixed(2),
        Number(o.total_profit || 0).toFixed(2),
        formatStatusLabel(o.status),
        o.delivery_status || "—",
        new Date(o.created_at).toLocaleDateString("en-PH"),
      ]),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [24, 24, 27] } /* 👉 Dark gray/black header */,
      alternateRowStyles: { fillColor: [244, 244, 245] },
    });

    if (data.products?.length) {
      autoTable(doc, {
        startY: doc.lastAutoTable.finalY + 10,
        head: [["Product", "Units Sold", "Revenue (₱)", "Profit (₱)"]],
        body: data.products
          .slice(0, 20)
          .map((p) => [
            p.product_name,
            p.units_sold,
            Number(p.revenue || 0).toFixed(2),
            Number(p.profit || 0).toFixed(2),
          ]),
        styles: { fontSize: 8 },
        headStyles: {
          fillColor: [39, 39, 42],
        } /* 👉 Lighter gray/black header */,
        tableWidth: 120,
        margin: { left: 14 },
      });
    }

    const finalY = doc.lastAutoTable.finalY + 20;
    doc.setFontSize(10).setFont("helvetica", "normal");
    doc.text("Prepared by:", 14, finalY);
    doc.text("___________________________", 14, finalY + 16);
    doc.text("Authorized Signatory / Owner", 14, finalY + 22);

    doc.save(
      `wisdom_sales_report_${tab || "combined"}_${dateStr.replace(/\s+/g, "_")}.pdf`,
    );
  };

  const handlePrint = () => {
    window.print();
  };

  const s = data?.summary;

  return (
    <div id="print-area">
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 20,
        }}
      >
        <h1 style={pageTitle}>Sales Reports</h1>

        <div className="no-print" style={{ display: "flex", gap: 8 }}>
          <button onClick={exportPDF} style={btnGhost}>
            📄 Export PDF
          </button>
          <button onClick={handlePrint} style={btnGhost}>
            🖨️ Print
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div
        className="no-print"
        style={{
          display: "flex",
          gap: 4,
          borderBottom: "2px solid #e4e4e7",
          marginBottom: 20,
        }}
      >
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              padding: "10px 20px",
              border: "none",
              background: "none",
              cursor: "pointer",
              fontWeight: 800,
              fontSize: 13,
              letterSpacing: "0.02em",
              color: tab === t.key ? "#18181b" : "#71717a",
              borderBottom:
                tab === t.key ? "2px solid #18181b" : "2px solid transparent",
              marginBottom: -2,
              transition: "all 0.2s ease",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div
        className="no-print"
        style={{
          display: "flex",
          gap: 10,
          flexWrap: "wrap",
          marginBottom: 24,
          alignItems: "center",
        }}
      >
        {PERIODS.map((p) => (
          <button
            key={p.value}
            onClick={() => setPeriod(p.value)}
            style={{
              padding: "8px 18px",
              border: "1px solid",
              borderRadius: 20,
              cursor: "pointer",
              fontSize: 12,
              fontWeight: 700,
              background: period === p.value ? "#18181b" : "#ffffff",
              color: period === p.value ? "#ffffff" : "#52525b",
              borderColor: period === p.value ? "#18181b" : "#d4d4d8",
              transition: "all 0.2s ease",
            }}
          >
            {p.label}
          </button>
        ))}

        {period === "custom" && (
          <>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              style={inputSm}
            />
            <span style={{ color: "#71717a", fontSize: 13, fontWeight: 600 }}>
              to
            </span>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              style={inputSm}
            />
            <button
              onClick={handleApplyCustomRange}
              style={btnPrimary}
              disabled={!from || !to || from > to}
            >
              Apply
            </button>

            {from && to && from > to && (
              <span style={{ color: "#dc2626", fontSize: 12, fontWeight: 700 }}>
                End date must be later than or equal to the start date.
              </span>
            )}
          </>
        )}
      </div>

      {/* KPI Summary */}
      {s && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              tab === "" ? "repeat(3, 1fr)" : "repeat(4, 1fr)",
            gap: 20,
            marginBottom: 32,
          }}
        >
          <KpiCard
            label="Total Orders"
            value={s.total_orders}
            color="#18181b"
            icon="🛒"
          />
          <KpiCard
            label="Total Revenue"
            value={formatMoney(s.total_revenue)}
            color="#18181b"
            icon="💰"
          />
          <KpiCard
            label="Total Profit"
            value={formatMoney(s.total_profit)}
            color="#059669"
            icon="📈"
          />
          <KpiCard
            label="Avg Order Value"
            value={formatMoney(s.avg_order_value)}
            color="#18181b"
            icon="🧾"
          />

          {tab === "" && (
            <>
              <KpiCard
                label="Online Orders"
                value={s.online_count}
                color="#18181b"
                icon="🌐"
              />
              <KpiCard
                label="Walk-in Orders"
                value={s.walkin_count}
                color="#18181b"
                icon="🏪"
              />
            </>
          )}
        </div>
      )}

      {loading ? (
        <div style={center}>Loading report...</div>
      ) : !data ? null : (
        <>
          {/* Orders Table */}
          <div style={{ ...card, marginBottom: 20 }}>
            <div
              style={{
                padding: "20px",
                borderBottom: "1px solid #e4e4e7",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <h3 style={sectionTitle}>
                {tab === "walkin"
                  ? "POS Transactions"
                  : tab === "online"
                    ? "Online Orders"
                    : "All Transactions"}
              </h3>
              <span style={{ fontSize: 12, color: "#71717a", fontWeight: 700 }}>
                {data.orders.length} records
              </span>
            </div>

            <div style={{ overflowX: "auto" }}>
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  fontSize: 13,
                }}
              >
                <thead>
                  <tr style={{ background: "#fafafa" }}>
                    {[
                      "Order ID",
                      "Customer",
                      "Channel",
                      "Payment",
                      "Amount",
                      "Profit",
                      "Status",
                      "Delivery",
                      "Receipt",
                      "Date",
                    ].map((h) => (
                      <th key={h} style={th}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody>
                  {data.orders.length === 0 ? (
                    <tr>
                      <td
                        colSpan={10}
                        style={{
                          textAlign: "center",
                          padding: 40,
                          color: "#71717a",
                          fontWeight: 600,
                          fontSize: 13,
                        }}
                      >
                        No records for this period.
                      </td>
                    </tr>
                  ) : (
                    data.orders.map((o) => {
                      const statusKey = String(o.status || "").toLowerCase();
                      const ss = STATUS_STYLE[statusKey] || {
                        bg: "#f4f4f5",
                        color: "#52525b",
                        border: "#d4d4d8",
                      };

                      return (
                        <tr
                          key={o.id}
                          style={{ borderBottom: "1px solid #f4f4f5" }}
                        >
                          <td style={td}>
                            <span style={{ fontWeight: 800, color: "#0a0a0a" }}>
                              #{String(o.id).padStart(5, "0")}
                            </span>
                          </td>

                          <td style={td}>
                            <div style={{ fontWeight: 600, color: "#18181b" }}>
                              {o.customer_name}
                            </div>
                            <div
                              style={{
                                fontSize: 11,
                                color: "#71717a",
                                marginTop: 2,
                              }}
                            >
                              {o.customer_phone || ""}
                            </div>
                          </td>

                          <td style={td}>
                            <span
                              style={{
                                background:
                                  String(o.channel || "").toLowerCase() ===
                                  "online"
                                    ? "#f4f4f5"
                                    : "#ffffff",
                                color:
                                  String(o.channel || "").toLowerCase() ===
                                  "online"
                                    ? "#18181b"
                                    : "#52525b",
                                border:
                                  String(o.channel || "").toLowerCase() ===
                                  "online"
                                    ? "1px solid #e4e4e7"
                                    : "1px solid #d4d4d8",
                                padding: "2px 10px",
                                borderRadius: 12,
                                fontSize: 11,
                                fontWeight: 700,
                              }}
                            >
                              {formatChannelLabel(o.channel)}
                            </span>
                          </td>

                          <td
                            style={{
                              ...td,
                              fontSize: 12,
                              color: "#52525b",
                              fontWeight: 500,
                            }}
                          >
                            {o.payment_method?.replace(/_/g, " ") || "—"}
                          </td>

                          <td
                            style={{ ...td, fontWeight: 700, color: "#0a0a0a" }}
                          >
                            {formatMoney(o.total_amount)}
                          </td>

                          <td
                            style={{ ...td, color: "#059669", fontWeight: 700 }}
                          >
                            {formatMoney(o.total_profit)}
                          </td>

                          <td style={td}>
                            <span
                              style={{
                                background: ss.bg,
                                color: ss.color,
                                border: `1px solid ${ss.border}`,
                                padding: "2px 10px",
                                borderRadius: 12,
                                fontSize: 11,
                                fontWeight: 700,
                              }}
                            >
                              {formatStatusLabel(o.status)}
                            </span>
                          </td>

                          <td style={td}>
                            {o.delivery_status ? (
                              <span
                                style={{
                                  fontSize: 12,
                                  color: "#52525b",
                                  fontWeight: 500,
                                }}
                              >
                                {o.delivery_status}
                              </span>
                            ) : (
                              <span style={{ color: "#a1a1aa" }}>—</span>
                            )}
                          </td>

                          <td style={td}>
                            {o.receipt_number ? (
                              <span
                                style={{
                                  fontSize: 11,
                                  color: "#0a0a0a",
                                  fontWeight: 700,
                                }}
                              >
                                {o.receipt_number}
                              </span>
                            ) : (
                              <span style={{ color: "#a1a1aa" }}>—</span>
                            )}
                          </td>

                          <td
                            style={{
                              ...td,
                              fontSize: 12,
                              color: "#71717a",
                              fontWeight: 500,
                            }}
                          >
                            {new Date(o.created_at).toLocaleDateString("en-PH")}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>

                {data.orders.length > 0 && (
                  <tfoot>
                    <tr
                      style={{
                        background: "#fafafa",
                        borderTop: "2px solid #e4e4e7",
                      }}
                    >
                      <td
                        colSpan={4}
                        style={{
                          ...td,
                          fontWeight: 800,
                          textAlign: "right",
                          color: "#0a0a0a",
                        }}
                      >
                        TOTALS
                      </td>
                      <td style={{ ...td, fontWeight: 800, color: "#0a0a0a" }}>
                        {formatMoney(s.total_revenue)}
                      </td>
                      <td style={{ ...td, fontWeight: 800, color: "#059669" }}>
                        {formatMoney(s.total_profit)}
                      </td>
                      <td colSpan={4} />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>

          {/* Top Products Breakdown */}
          {data.products?.length > 0 && (
            <div style={card}>
              <div
                style={{
                  padding: "20px",
                  borderBottom: "1px solid #e4e4e7",
                }}
              >
                <h3 style={sectionTitle}>Product Sales Breakdown</h3>
              </div>

              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  fontSize: 13,
                }}
              >
                <thead>
                  <tr style={{ background: "#fafafa" }}>
                    {[
                      "#",
                      "Product Name",
                      "Units Sold",
                      "Revenue (₱)",
                      "Profit (₱)",
                      "Revenue Share",
                    ].map((h) => (
                      <th key={h} style={th}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody>
                  {data.products.map((p, i) => {
                    const share =
                      Number(s.total_revenue) > 0
                        ? (
                            (Number(p.revenue || 0) / Number(s.total_revenue)) *
                            100
                          ).toFixed(1)
                        : "0.0";

                    return (
                      <tr key={i} style={{ borderBottom: "1px solid #f4f4f5" }}>
                        <td
                          style={{
                            ...td,
                            color: "#a1a1aa",
                            fontWeight: 700,
                            width: 32,
                          }}
                        >
                          {i + 1}
                        </td>

                        <td
                          style={{ ...td, fontWeight: 600, color: "#18181b" }}
                        >
                          {p.product_name}
                        </td>

                        <td style={{ ...td, fontWeight: 600 }}>
                          {p.units_sold}
                        </td>

                        <td
                          style={{ ...td, fontWeight: 700, color: "#0a0a0a" }}
                        >
                          {formatMoney(p.revenue)}
                        </td>

                        <td
                          style={{ ...td, color: "#059669", fontWeight: 700 }}
                        >
                          {formatMoney(p.profit)}
                        </td>

                        <td style={td}>
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 12,
                            }}
                          >
                            <div
                              style={{
                                flex: 1,
                                background: "#f4f4f5",
                                borderRadius: 4,
                                height: 8,
                                overflow: "hidden",
                              }}
                            >
                              <div
                                style={{
                                  width: `${share}%`,
                                  background: "#18181b",
                                  height: "100%",
                                  borderRadius: 4,
                                }}
                              />
                            </div>
                            <span
                              style={{
                                fontSize: 12,
                                color: "#52525b",
                                fontWeight: 600,
                                width: 36,
                              }}
                            >
                              {share}%
                            </span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      <style>{`
        @media print {
          @page {
            size: landscape;
            margin: 12mm;
          }

          body * {
            visibility: hidden !important;
          }

          #print-area,
          #print-area * {
            visibility: visible !important;
          }

          #print-area {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            background: #fff;
          }

          .no-print {
            display: none !important;
          }

          button {
            display: none !important;
          }
        }
      `}</style>
    </div>
  );
}

function KpiCard({ label, value, color, icon }) {
  return (
    <div
      style={{
        background: "#fff",
        borderRadius: 12,
        padding: "24px 20px",
        border: "1px solid #e4e4e7",
        borderLeft: `5px solid ${color}`,
        boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
        }}
      >
        <div>
          <p
            style={{
              fontSize: 10,
              color: "#71717a",
              margin: 0,
              textTransform: "uppercase",
              letterSpacing: "1px",
              fontWeight: 800,
            }}
          >
            {label}
          </p>
          <p
            style={{
              fontSize: 26,
              fontWeight: 800,
              color: "#0a0a0a",
              margin: "6px 0 0",
              letterSpacing: "-0.02em",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
            title={String(value)}
          >
            {value}
          </p>
        </div>
        <div
          style={{
            fontSize: 24,
            background: "#f4f4f5",
            width: 48,
            height: 48,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 12,
            flexShrink: 0,
          }}
        >
          {icon}
        </div>
      </div>
    </div>
  );
}

const pageTitle = {
  fontSize: 24,
  fontWeight: 800,
  color: "#0a0a0a",
  margin: 0,
  letterSpacing: "-0.02em",
};

const sectionTitle = {
  fontSize: 18,
  fontWeight: 800,
  color: "#0a0a0a",
  margin: 0,
  letterSpacing: "-0.01em",
};

const card = {
  background: "#fff",
  borderRadius: 16,
  border: "1px solid #e4e4e7",
  boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
  overflow: "hidden",
};

const th = {
  textAlign: "left",
  padding: "14px 16px",
  fontSize: 10,
  fontWeight: 800,
  color: "#71717a",
  textTransform: "uppercase",
  letterSpacing: "1px",
};

const td = {
  padding: "14px 16px",
  color: "#18181b",
  verticalAlign: "middle",
};

const center = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  height: 200,
  color: "#71717a",
  fontSize: 14,
  fontWeight: 600,
};

const inputSm = {
  padding: "8px 14px",
  border: "1px solid #e4e4e7",
  borderRadius: 8,
  fontSize: 13,
  color: "#18181b",
  outline: "none",
};

const btnPrimary = {
  padding: "9px 20px",
  background: "#18181b",
  color: "#fff",
  border: "none",
  borderRadius: 8,
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 700,
  transition: "background 0.2s",
};

const btnGhost = {
  padding: "9px 16px",
  background: "#f4f4f5",
  color: "#18181b",
  border: "1px solid #e4e4e7",
  borderRadius: 8,
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 700,
  transition: "background 0.2s",
};
