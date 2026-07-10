import { useState, useEffect } from "react";
import api from "../../services/api";
import { Package, Truck, CheckCircle, MapPin } from "lucide-react";

export default function RiderDashboard() {
  const [stats, setStats] = useState(null);
  const [activeDeliveries, setActiveDeliveries] = useState([]);
  const [loading, setLoading] = useState(true);

  // Get formatted date like "Saturday, April 18, 2026"
  const todayDateString = new Date().toLocaleDateString("en-PH", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  useEffect(() => {
    // Fetch both the dashboard stats AND the active deliveries list at the same time
    Promise.all([
      api.get("/pos/deliveries/dashboard"),
      api.get("/pos/deliveries"), // Reusing your existing endpoint from DeliveryManagement
    ])
      .then(([statsRes, deliveriesRes]) => {
        setStats(statsRes.data);

        // Filter only active deliveries (scheduled or in_transit) for the table, max 5
        const active = (
          Array.isArray(deliveriesRes.data) ? deliveriesRes.data : []
        )
          .filter((d) => d.status === "scheduled" || d.status === "in_transit")
          .slice(0, 5);
        setActiveDeliveries(active);
      })
      .catch((err) => console.error("Failed to load rider dashboard data", err))
      .finally(() => setLoading(false));
  }, []);

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
        Loading dashboard...
      </div>
    );

  return (
    <div
      style={{
        padding: "32px 40px",
        maxWidth: "1400px",
        margin: "0 auto",
        display: "flex",
        flexDirection: "column",
        gap: "24px",
        fontFamily: "'Inter', sans-serif",
      }}
    >
      {/* ── Header ── */}
      <div>
        <h2
          style={{
            margin: 0,
            fontSize: "24px",
            color: "#0a0a0a",
            fontWeight: 800,
            letterSpacing: "-0.02em",
          }}
        >
          Driver Dashboard
        </h2>
        <p
          style={{
            margin: "6px 0 0",
            color: "#52525b",
            fontSize: "13px",
            lineHeight: 1.5,
          }}
        >
          Today's overview — {todayDateString}
        </p>
      </div>

      {/* ── Summary Cards (Matching Cashier UI) ── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: "16px",
        }}
      >
        {/* Card 1: Total Assigned */}
        <div style={statCard}>
          <div
            style={{ ...iconWrapper, background: "#f4f4f5", color: "#18181b" }}
          >
            <Package size={24} strokeWidth={2.5} />
          </div>
          <div>
            <div style={statNumber}>{stats?.total_deliveries || 0}</div>
            <div style={statLabel}>Total Assigned Today</div>
          </div>
        </div>

        {/* Card 2: In Transit / Pending */}
        <div style={statCard}>
          <div
            style={{ ...iconWrapper, background: "#18181b", color: "#ffffff" }}
          >
            <Truck size={24} strokeWidth={2.5} />
          </div>
          <div>
            <div style={statNumber}>{stats?.pending_today || 0}</div>
            <div style={statLabel}>Pending / In Transit</div>
          </div>
        </div>

        {/* Card 3: Completed */}
        <div style={statCard}>
          <div
            style={{ ...iconWrapper, background: "#f4f4f5", color: "#18181b" }}
          >
            <CheckCircle size={24} strokeWidth={2.5} />
          </div>
          <div>
            <div style={statNumber}>{stats?.completed_today || 0}</div>
            <div style={statLabel}>Successfully Delivered</div>
          </div>
        </div>
      </div>

      {/* ── Today's Itinerary Table (Matching Cashier UI) ── */}
      <div
        style={{
          background: "#ffffff",
          borderRadius: "16px",
          border: "1px solid #e4e4e7",
          padding: "0",
          boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            padding: "20px 24px",
            borderBottom: "1px solid #f4f4f5",
            background: "#fafafa",
          }}
        >
          <MapPin size={20} color="#0a0a0a" />
          <h3
            style={{
              margin: 0,
              fontSize: "16px",
              color: "#0a0a0a",
              fontWeight: 800,
            }}
          >
            Active Deliveries Today
          </h3>
        </div>

        {activeDeliveries.length === 0 ? (
          <div
            style={{
              color: "#71717a",
              padding: "40px",
              textAlign: "center",
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            No pending deliveries right now. You're all caught up!
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                whiteSpace: "nowrap",
                textAlign: "left",
              }}
            >
              <thead>
                <tr style={{ background: "#ffffff" }}>
                  <th style={thStyle}>Order #</th>
                  <th style={thStyle}>Customer</th>
                  <th style={thStyle}>Destination</th>
                  <th style={thStyle}>Status</th>
                </tr>
              </thead>
              <tbody>
                {activeDeliveries.map((delivery) => (
                  <tr
                    key={delivery.id}
                    style={{ borderBottom: "1px solid #f4f4f5" }}
                  >
                    <td
                      style={{ ...tdStyle, fontWeight: 800, color: "#0a0a0a" }}
                    >
                      {delivery.order_number}
                    </td>
                    <td style={{ ...tdStyle, fontWeight: 600 }}>
                      {delivery.customer_name}
                    </td>
                    <td
                      style={{
                        ...tdStyle,
                        color: "#52525b",
                        maxWidth: "300px",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                        }}
                      >
                        <span
                          style={{
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                          title={delivery.address}
                        >
                          {delivery.address}
                        </span>
                        {Number.isFinite(Number(delivery.delivery_lat)) &&
                          Number.isFinite(Number(delivery.delivery_lng)) && (
                            <a
                              href={`https://www.google.com/maps/search/?api=1&query=${delivery.delivery_lat},${delivery.delivery_lng}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              title="Open in Google Maps"
                              style={{ flexShrink: 0, lineHeight: 0 }}
                            >
                              <MapPin size={14} color="#2563eb" />
                            </a>
                          )}
                      </div>
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
                            delivery.status === "in_transit"
                              ? "#18181b"
                              : "#f4f4f5",
                          color:
                            delivery.status === "in_transit"
                              ? "#ffffff"
                              : "#18181b",
                          border:
                            delivery.status === "in_transit"
                              ? "1px solid #18181b"
                              : "1px solid #e4e4e7",
                        }}
                      >
                        {delivery.status.replace("_", " ")}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// Reusable Styles matching the Cashier Dashboard Theme
const statCard = {
  background: "#ffffff",
  borderRadius: "16px",
  border: "1px solid #e4e4e7",
  padding: "20px 24px",
  display: "flex",
  alignItems: "center",
  gap: "16px",
  boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
};

const iconWrapper = {
  width: "44px",
  height: "44px",
  borderRadius: "12px",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const statNumber = {
  fontSize: "24px",
  fontWeight: 800,
  color: "#0a0a0a",
  lineHeight: 1,
  letterSpacing: "-0.02em",
};

const statLabel = {
  fontSize: "10px",
  color: "#71717a",
  fontWeight: 800,
  marginTop: "6px",
  textTransform: "uppercase",
  letterSpacing: "1px",
};

const thStyle = {
  padding: "14px 24px",
  textAlign: "left",
  fontSize: "10px",
  fontWeight: "800",
  color: "#71717a",
  textTransform: "uppercase",
  letterSpacing: "1px",
  borderBottom: "1px solid #e4e4e7",
};

const tdStyle = {
  padding: "16px 24px",
  fontSize: "13px",
  color: "#18181b",
};