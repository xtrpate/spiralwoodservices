import { useState, useEffect, useMemo } from "react";
import api from "../../services/api";
import { Calendar, MapPin } from "lucide-react";

// Builds a safe Google Maps link: valid finite in-range coords first,
// then falls back to the text address, or null if neither exists.
// Guards explicitly against null/undefined BEFORE calling Number() —
// Number(null) coerces to 0 (a "valid" but wrong coordinate), which
// is what let null,null through the old Number.isFinite(Number(x)) check.
const getGoogleMapsHref = (lat, lng, address) => {
  const hasLat = lat !== null && lat !== undefined && lat !== "";
  const hasLng = lng !== null && lng !== undefined && lng !== "";

  if (hasLat && hasLng) {
    const latNum = Number(lat);
    const lngNum = Number(lng);
    if (
      Number.isFinite(latNum) &&
      Number.isFinite(lngNum) &&
      latNum >= -90 &&
      latNum <= 90 &&
      lngNum >= -180 &&
      lngNum <= 180
    ) {
      return `https://www.google.com/maps/search/?api=1&query=${latNum},${lngNum}`;
    }
  }

  const trimmedAddress = String(address || "").trim();
  if (trimmedAddress) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(trimmedAddress)}`;
  }

  return null;
};

export default function RiderHistory() {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  // Date filter state
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  useEffect(() => {
    api
      .get("/pos/deliveries/history")
      .then((res) => setHistory(res.data))
      .catch((err) => console.error("Failed to load history", err))
      .finally(() => setLoading(false));
  }, []);

  // Filter the history based on the selected dates
  const filteredHistory = useMemo(() => {
    return history.filter((h) => {
      if (!startDate && !endDate) return true;

      const itemDate = new Date(h.updated_at);
      itemDate.setHours(0, 0, 0, 0);

      if (startDate) {
        const sDate = new Date(startDate);
        sDate.setHours(0, 0, 0, 0);
        if (itemDate < sDate) return false;
      }
      if (endDate) {
        const eDate = new Date(endDate);
        eDate.setHours(0, 0, 0, 0);
        if (itemDate > eDate) return false;
      }
      return true;
    });
  }, [history, startDate, endDate]);

  if (loading)
    return (
      <div
        style={{
          padding: "40px",
          textAlign: "center",
          color: "#71717a",
          fontWeight: 600,
          fontSize: 13,
          fontFamily: "'Inter', sans-serif",
        }}
      >
        Loading history...
      </div>
    );

  return (
    <div
      style={{
        padding: "32px 40px",
        maxWidth: "1200px",
        margin: "0 auto",
        fontFamily: "'Inter', sans-serif",
      }}
    >
      {/* ── Header & Date Filter ── */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: "24px",
          flexWrap: "wrap",
          gap: "16px",
        }}
      >
        <div>
          <h2
            style={{
              margin: "0 0 4px 0",
              fontSize: "24px",
              color: "#0a0a0a",
              fontWeight: 800,
              letterSpacing: "-0.02em",
            }}
          >
            Delivery History
          </h2>
          <p
            style={{
              margin: 0,
              color: "#52525b",
              fontSize: "13px",
              lineHeight: 1.5,
            }}
          >
            Review past deliveries and customer details.
          </p>
        </div>

        {/* Date Range Picker matching the Cashier UI */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
            background: "#ffffff",
            padding: "8px 14px",
            borderRadius: "12px",
            border: "1px solid #e4e4e7",
            boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
            flexWrap: "wrap",
          }}
        >
          <Calendar size={16} color="#71717a" />
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            style={{
              border: "1px solid #e4e4e7",
              borderRadius: "8px",
              padding: "6px 10px",
              outline: "none",
              color: "#18181b",
              fontSize: "13px",
              background: "#fff",
            }}
          />
          <span style={{ color: "#71717a", fontSize: "13px", fontWeight: 600 }}>
            to
          </span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            style={{
              border: "1px solid #e4e4e7",
              borderRadius: "8px",
              padding: "6px 10px",
              outline: "none",
              color: "#18181b",
              fontSize: "13px",
              background: "#fff",
            }}
          />
        </div>
      </div>

      {/* ── Data Table ── */}
      {filteredHistory.length === 0 ? (
        <div
          style={{
            padding: "40px",
            background: "#fff",
            borderRadius: "16px",
            border: "1px solid #e4e4e7",
            color: "#71717a",
            textAlign: "center",
            fontSize: "13px",
            fontWeight: 600,
            boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
          }}
        >
          No completed or failed deliveries found for this date range.
        </div>
      ) : (
        <div
          style={{
            background: "#fff",
            borderRadius: "16px",
            border: "1px solid #e4e4e7",
            overflowX: "auto",
            boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
          }}
        >
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              whiteSpace: "nowrap",
              textAlign: "left",
            }}
          >
            <thead
              style={{
                background: "#fafafa",
                borderBottom: "1px solid #e4e4e7",
              }}
            >
              <tr>
                <th style={thStyle}>Date & Time</th>
                <th style={thStyle}>Order #</th>
                <th style={thStyle}>Customer</th>
                <th style={thStyle}>Total</th>
                <th style={thStyle}>Payment</th>
                <th style={thStyle}>Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredHistory.map((h) => {
                const mapsHref = getGoogleMapsHref(
                  h.delivery_lat,
                  h.delivery_lng,
                  h.address,
                );
                return (
                <tr
                  key={h.delivery_id}
                  style={{ borderBottom: "1px solid #f4f4f5" }}
                >
                  <td style={tdStyle}>
                    <div style={{ color: "#52525b", fontWeight: 500 }}>
                      {new Date(h.updated_at).toLocaleDateString("en-PH", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </div>
                    <div
                      style={{
                        color: "#71717a",
                        fontSize: "12px",
                        marginTop: "2px",
                        fontWeight: 500,
                      }}
                    >
                      {new Date(h.updated_at).toLocaleTimeString("en-PH", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </div>
                  </td>

                  <td
                    style={{ ...tdStyle, fontWeight: "800", color: "#0a0a0a" }}
                  >
                    {h.order_number}
                  </td>

                  <td style={tdStyle}>
                    <div style={{ fontWeight: "700", color: "#18181b" }}>
                      {h.customer_name}
                    </div>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        fontSize: "12px",
                        color: "#71717a",
                        maxWidth: "200px",
                        marginTop: "2px",
                      }}
                    >
                      <span
                        style={{
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {h.address || "No address provided"}
                      </span>
                      {mapsHref ? (
                        <a
                          href={mapsHref}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Open in Google Maps"
                          style={{ flexShrink: 0, lineHeight: 0 }}
                        >
                          <MapPin size={12} color="#2563eb" />
                        </a>
                      ) : (
                        <span
                          title="Location unavailable"
                          style={{ flexShrink: 0, lineHeight: 0 }}
                        >
                          <MapPin size={12} color="#d4d4d8" />
                        </span>
                      )}
                    </div>
                  </td>

                  <td
                    style={{ ...tdStyle, fontWeight: "800", color: "#0a0a0a" }}
                  >
                    ₱
                    {Number(h.total || 0).toLocaleString("en-PH", {
                      minimumFractionDigits: 2,
                    })}
                  </td>

                  <td style={tdStyle}>
                    <span
                      style={{
                        color: "#52525b",
                        textTransform: "capitalize",
                        fontWeight: 600,
                      }}
                    >
                      {h.payment_status || "Pending"}
                    </span>
                  </td>

                  <td style={tdStyle}>
                    <span
                      style={{
                        padding: "4px 10px",
                        borderRadius: "999px",
                        fontSize: "10px",
                        fontWeight: "800",
                        textTransform: "uppercase",
                        letterSpacing: "1px",
                        background:
                          h.status === "delivered" ? "#0a0a0a" : "#fef2f2",
                        color: h.status === "delivered" ? "#ffffff" : "#991b1b",
                        border: `1px solid ${h.status === "delivered" ? "#0a0a0a" : "#fecaca"}`,
                      }}
                    >
                      {h.status}
                    </span>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// Reusable styles to keep the JSX clean
const thStyle = {
  padding: "14px 20px",
  textAlign: "left",
  fontSize: "10px",
  fontWeight: "800",
  color: "#71717a",
  textTransform: "uppercase",
  letterSpacing: "1px",
};

const tdStyle = {
  padding: "16px 20px",
  fontSize: "13px",
  color: "#18181b",
  verticalAlign: "middle",
};