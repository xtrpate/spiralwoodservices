import { useState, useEffect } from "react";
import api from "../../services/api";
import { Search, Package } from "lucide-react";

export default function InventoryLookup() {
  const [products, setProducts] = useState([]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get("/pos/products/all")
      .then((r) => {
        setProducts(Array.isArray(r.data) ? r.data : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const getStockStatus = (p) => {
    const stock = Number(p.stock || 0);
    const reorderPoint = Number(p.reorder_point || 0);

    if (stock <= 0) return "out_of_stock";
    if (stock <= reorderPoint) return "low_stock";
    return "in_stock";
  };

  const getStockStatusStyle = (s) => {
    if (s === "in_stock")
      return {
        background: "#f4f4f5",
        color: "#18181b",
        border: "1px solid #e4e4e7",
      };
    if (s === "low_stock")
      return {
        background: "#ffffff",
        color: "#52525b",
        border: "1px solid #d4d4d8",
      };
    return {
      background: "#fef2f2",
      color: "#991b1b",
      border: "1px solid #fecaca",
    };
  };

  const filtered = products.filter((p) => {
    const matchQ =
      !query ||
      p.name?.toLowerCase().includes(query.toLowerCase()) ||
      (p.barcode && p.barcode.includes(query));

    const matchF = filter === "all" || getStockStatus(p) === filter;

    return matchQ && matchF;
  });

  const counts = {
    in_stock: products.filter((p) => getStockStatus(p) === "in_stock").length,
    low_stock: products.filter((p) => getStockStatus(p) === "low_stock").length,
    out_of_stock: products.filter((p) => getStockStatus(p) === "out_of_stock")
      .length,
  };

  return (
    <div style={{ fontFamily: "'Inter', sans-serif", paddingBottom: 40 }}>
      <div style={{ marginBottom: 24 }}>
        <h1
          style={{
            margin: 0,
            fontSize: 24,
            fontWeight: 800,
            color: "#0a0a0a",
            letterSpacing: "-0.02em",
          }}
        >
          Inventory Lookup
        </h1>
        <p
          style={{
            margin: "6px 0 0",
            fontSize: 13,
            color: "#52525b",
            lineHeight: 1.5,
          }}
        >
          Check real-time stock availability to assist customers (read-only)
        </p>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 16,
          marginBottom: 24,
        }}
      >
        <div style={statCardStyle}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              background: "#f4f4f5",
              color: "#18181b",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Package size={22} />
          </div>
          <div>
            <div style={statValueStyle}>{counts.in_stock}</div>
            <div style={statLabelStyle}>In Stock</div>
          </div>
        </div>

        <div style={statCardStyle}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              background: "#ffffff",
              border: "1px solid #e4e4e7",
              color: "#52525b",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Package size={22} />
          </div>
          <div>
            <div style={statValueStyle}>{counts.low_stock}</div>
            <div style={statLabelStyle}>Low Stock</div>
          </div>
        </div>

        <div style={statCardStyle}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              background: "#fef2f2",
              color: "#dc2626",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Package size={22} />
          </div>
          <div>
            <div style={{ ...statValueStyle, color: "#dc2626" }}>
              {counts.out_of_stock}
            </div>
            <div style={statLabelStyle}>Out of Stock</div>
          </div>
        </div>

        <div style={statCardStyle}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              background: "#18181b",
              color: "#ffffff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Package size={22} />
          </div>
          <div>
            <div style={statValueStyle}>{products.length}</div>
            <div style={statLabelStyle}>Total Products</div>
          </div>
        </div>
      </div>

      <div style={{ ...cardStyle, marginBottom: 20, padding: 16 }}>
        <div
          style={{
            display: "flex",
            gap: 16,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <div style={{ position: "relative", flex: 1, minWidth: 260 }}>
            <Search
              size={16}
              style={{
                position: "absolute",
                left: 14,
                top: "50%",
                transform: "translateY(-50%)",
                color: "#71717a",
              }}
            />
            <input
              type="text"
              placeholder="Search by product name or barcode..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              style={{
                width: "100%",
                padding: "10px 14px 10px 40px",
                border: "1px solid #e4e4e7",
                borderRadius: 8,
                fontSize: 13,
                color: "#18181b",
                boxSizing: "border-box",
                outline: "none",
                background: "#fff",
              }}
            />
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {["all", "in_stock", "low_stock", "out_of_stock"].map((f) => {
              const isActive = filter === f;
              return (
                <button
                  key={f}
                  style={{
                    padding: "8px 16px",
                    borderRadius: 8,
                    border: isActive
                      ? "1px solid #18181b"
                      : "1px solid #e4e4e7",
                    background: isActive ? "#18181b" : "#f4f4f5",
                    color: isActive ? "#ffffff" : "#18181b",
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: "pointer",
                    transition: "all 0.2s ease",
                    textTransform: "capitalize",
                  }}
                  onClick={() => setFilter(f)}
                >
                  {f === "all" ? "All" : f.replace(/_/g, " ")}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div style={cardStyle}>
        {loading ? (
          <p
            style={{
              textAlign: "center",
              color: "#71717a",
              padding: 40,
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            Loading inventory...
          </p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: 13,
                textAlign: "left",
              }}
            >
              <thead>
                <tr style={{ background: "#fafafa" }}>
                  <th style={thStyle}>Barcode</th>
                  <th style={thStyle}>Product Name</th>
                  <th style={thStyle}>Category</th>
                  <th style={thStyle}>Type</th>
                  <th style={thStyle}>Walk-in Price</th>
                  <th style={thStyle}>Stock</th>
                  <th style={thStyle}>Reorder Pt.</th>
                  <th style={thStyle}>Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td
                      colSpan={8}
                      style={{
                        textAlign: "center",
                        color: "#71717a",
                        padding: 40,
                        fontSize: 13,
                        fontWeight: 600,
                      }}
                    >
                      No products found.
                    </td>
                  </tr>
                ) : (
                  filtered.map((p) => {
                    const status = getStockStatus(p);
                    const statusStyle = getStockStatusStyle(status);

                    return (
                      <tr
                        key={p.id}
                        style={{ borderBottom: "1px solid #f4f4f5" }}
                      >
                        <td
                          style={{
                            ...tdStyle,
                            fontSize: 12,
                            color: "#71717a",
                            fontFamily: "monospace",
                            letterSpacing: "0.5px",
                          }}
                        >
                          {p.barcode || "—"}
                        </td>
                        <td
                          style={{
                            ...tdStyle,
                            fontWeight: 700,
                            color: "#0a0a0a",
                          }}
                        >
                          {p.name}
                        </td>
                        <td style={{ ...tdStyle, color: "#52525b" }}>
                          {p.category || "—"}
                        </td>
                        <td
                          style={{
                            ...tdStyle,
                            textTransform: "capitalize",
                            color: "#52525b",
                          }}
                        >
                          {p.type || "—"}
                        </td>
                        <td
                          style={{
                            ...tdStyle,
                            fontWeight: 600,
                            color: "#18181b",
                          }}
                        >
                          ₱
                          {parseFloat(p.walkin_price || 0).toLocaleString(
                            "en-PH",
                            {
                              minimumFractionDigits: 2,
                            },
                          )}
                        </td>
                        <td
                          style={{
                            ...tdStyle,
                            fontWeight: 800,
                            color:
                              Number(p.stock) <= 0
                                ? "#dc2626"
                                : Number(p.stock) <=
                                    Number(p.reorder_point || 0)
                                  ? "#52525b"
                                  : "#0a0a0a",
                          }}
                        >
                          {p.stock}
                        </td>
                        <td style={{ ...tdStyle, color: "#a1a1aa" }}>
                          {p.reorder_point ?? 0}
                        </td>
                        <td style={tdStyle}>
                          <span
                            style={{
                              ...statusStyle,
                              padding: "4px 10px",
                              borderRadius: 999,
                              fontSize: 11,
                              fontWeight: 700,
                              textTransform: "capitalize",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {status.replace(/_/g, " ")}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Reusable Styles ──────────────────────────────────────────

const statCardStyle = {
  background: "#fff",
  border: "1px solid #e4e4e7",
  borderRadius: 16,
  padding: "20px 24px",
  display: "flex",
  alignItems: "center",
  gap: 16,
  boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
};

const statValueStyle = {
  fontSize: 24,
  fontWeight: 800,
  color: "#0a0a0a",
  letterSpacing: "-0.02em",
  lineHeight: 1,
};

const statLabelStyle = {
  fontSize: 10,
  fontWeight: 800,
  color: "#71717a",
  textTransform: "uppercase",
  letterSpacing: "1px",
  marginTop: 6,
};

const cardStyle = {
  background: "#ffffff",
  border: "1px solid #e4e4e7",
  borderRadius: 16,
  boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
  overflow: "hidden",
};

const thStyle = {
  padding: "14px 16px",
  fontSize: 10,
  fontWeight: 800,
  color: "#71717a",
  textTransform: "uppercase",
  letterSpacing: "1px",
  borderBottom: "1px solid #e4e4e7",
};

const tdStyle = {
  padding: "16px",
  color: "#18181b",
  verticalAlign: "middle",
};
