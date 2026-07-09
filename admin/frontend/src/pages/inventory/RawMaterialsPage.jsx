// src/pages/inventory/RawMaterialsPage.jsx
import React, { useEffect, useState, useCallback } from "react";
import api from "../../services/api";
import toast from "react-hot-toast";

const STOCK_COLORS = {
  in_stock: ["#f4f4f5", "#18181b", "#e4e4e7"],
  low_stock: ["#ffffff", "#52525b", "#d4d4d8"],
  out_of_stock: ["#fef2f2", "#991b1b", "#fecaca"],
};

export default function RawMaterialsPage() {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [filters, setFilters] = useState({ search: "", status: "", page: 1 });
  const [modal, setModal] = useState(null); // null | { mode: 'add'|'edit', data: {} }
  const [saving, setSaving] = useState(false);
  const [suppliers, setSuppliers] = useState([]);

  const load = useCallback(async () => {
    const { data } = await api.get("/inventory/raw", {
      params: { ...filters, limit: 20 },
    });
    setItems(data.rows);
    setTotal(data.total);
  }, [filters]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    api.get("/suppliers").then((r) => setSuppliers(r.data));
  }, []);

  const openAdd = () =>
    setModal({
      mode: "add",
      data: {
        name: "",
        unit: "",
        quantity: 0,
        reorder_point: 0,
        unit_cost: 0,
        supplier_id: "",
      },
    });
  const openEdit = (item) => setModal({ mode: "edit", data: { ...item } });

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (modal.mode === "add") {
        await api.post("/inventory/raw", modal.data);
        toast.success("Raw material added.");
      } else {
        await api.put(`/inventory/raw/${modal.data.id}`, modal.data);
        toast.success("Raw material updated.");
      }
      setModal(null);
      load();
    } catch (error) {
      // Toast na yung message dito ay ginagawa na ng global interceptor
      // sa api.js — hindi na natin uulitin dito. Ang catch lang ay para
      // pigilan yung "Uncaught runtime errors" crash at panatilihing
      // bukas ang modal.
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this raw material?")) return;
    try {
      await api.delete(`/inventory/raw/${id}`);
      toast.success("Deleted.");
      load();
    } catch (error) {
      // Parehong dahilan — global interceptor na ang nag-a-toast.
    }
  };

  const setField = (k, v) =>
    setModal((m) => ({ ...m, data: { ...m.data, [k]: v } }));

  return (
    <div>
      <div style={header}>
        <h1 style={title}>Raw Materials Inventory</h1>
        <button onClick={openAdd} style={btnPrimary}>
          + Add Material
        </button>
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
        <input
          placeholder="Search..."
          value={filters.search}
          onChange={(e) =>
            setFilters((f) => ({ ...f, search: e.target.value, page: 1 }))
          }
          style={inputSm}
        />
        <select
          value={filters.status}
          onChange={(e) =>
            setFilters((f) => ({ ...f, status: e.target.value, page: 1 }))
          }
          style={inputSm}
        >
          <option value="">All Status</option>
          <option value="in_stock">In Stock</option>
          <option value="low_stock">Low Stock</option>
          <option value="out_of_stock">Out of Stock</option>
        </select>
      </div>

      <div style={tableCard}>
        <table
          style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}
        >
          <thead>
            <tr style={{ background: "#fafafa" }}>
              {[
                "Name",
                "Supplier",
                "Unit",
                "Qty",
                "Reorder Pt",
                "Unit Cost",
                "Total Value",
                "Status",
                "Actions",
              ].map((h) => (
                <th key={h} style={th}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const [bg, color, border] = STOCK_COLORS[item.stock_status] || [
                "#f4f4f5",
                "#18181b",
                "#e4e4e7",
              ];
              return (
                <tr key={item.id} style={{ borderBottom: "1px solid #f4f4f5" }}>
                  <td style={td}>
                    <strong style={{ color: "#0a0a0a" }}>{item.name}</strong>
                  </td>
                  <td style={{ ...td, color: "#52525b" }}>
                    {item.supplier_name || "—"}
                  </td>
                  <td style={{ ...td, color: "#71717a" }}>{item.unit}</td>
                  <td style={{ ...td, fontWeight: 700 }}>{item.quantity}</td>
                  <td style={{ ...td, color: "#52525b" }}>
                    {item.reorder_point}
                  </td>
                  <td style={td}>₱ {Number(item.unit_cost).toFixed(2)}</td>
                  <td style={{ ...td, fontWeight: 600 }}>
                    ₱ {(item.quantity * item.unit_cost).toFixed(2)}
                  </td>
                  <td style={td}>
                    <span
                      style={{
                        background: bg,
                        color,
                        border: `1px solid ${border}`,
                        padding: "2px 10px",
                        borderRadius: 12,
                        fontSize: 11,
                        fontWeight: 600,
                      }}
                    >
                      {item.stock_status?.replace("_", " ")}
                    </span>
                  </td>
                  <td style={td}>
                    <button onClick={() => openEdit(item)} style={btnEdit}>
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(item.id)}
                      style={{
                        ...btnEdit,
                        background: "#fef2f2",
                        color: "#991b1b",
                        border: "1px solid #fecaca",
                        marginLeft: 6,
                      }}
                    >
                      Del
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {modal && (
        <div style={overlay}>
          <div style={modalBox}>
            <h3
              style={{
                margin: "0 0 20px",
                fontSize: 18,
                fontWeight: 800,
                color: "#0a0a0a",
              }}
            >
              {modal.mode === "add" ? "Add Raw Material" : "Edit Raw Material"}
            </h3>
            <form onSubmit={handleSave}>
              {[
                ["Name *", "name", "text", true],
                ["Unit *", "unit", "text", true],
                ["Quantity", "quantity", "number"],
                ["Reorder Point", "reorder_point", "number"],
                ["Unit Cost (₱)", "unit_cost", "number"],
              ].map(([label, key, type, req]) => (
                <div key={key} style={{ marginBottom: 12 }}>
                  <label style={labelSm}>{label}</label>
                  <input
                    type={type || "text"}
                    required={req}
                    // 👉 Assign step="0.01" for cost, but step="1" for integers
                    step={
                      type === "number"
                        ? key === "unit_cost"
                          ? "0.01"
                          : "1"
                        : undefined
                    }
                    // 👉 Prevent typing "." or "e" for strictly integer fields
                    onKeyDown={(e) => {
                      if (
                        (key === "quantity" || key === "reorder_point") &&
                        (e.key === "." || e.key === "e")
                      ) {
                        e.preventDefault();
                      }
                    }}
                    value={modal.data[key] || ""}
                    onChange={(e) => setField(key, e.target.value)}
                    style={inputFull}
                  />
                </div>
              ))}
              <div style={{ marginBottom: 12 }}>
                <label style={labelSm}>Supplier</label>
                <select
                  value={modal.data.supplier_id || ""}
                  onChange={(e) => setField("supplier_id", e.target.value)}
                  style={inputFull}
                >
                  <option value="">None</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <div
                style={{
                  display: "flex",
                  gap: 10,
                  justifyContent: "flex-end",
                  marginTop: 24,
                }}
              >
                <button
                  type="button"
                  onClick={() => setModal(null)}
                  style={btnGhost}
                >
                  Cancel
                </button>
                <button type="submit" disabled={saving} style={btnPrimary}>
                  {saving ? "Saving..." : "Save"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Reusable styles ──────────────────────────────────────────────────────────
const header = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: 20,
};
const title = {
  fontSize: 24,
  fontWeight: 800,
  color: "#0a0a0a",
  margin: 0,
  letterSpacing: "-0.02em",
};
const tableCard = {
  background: "#fff",
  borderRadius: 12,
  border: "1px solid #e4e4e7",
  boxShadow: "0 1px 2px rgba(0,0,0,.02)",
  overflow: "hidden",
};
const th = {
  textAlign: "left",
  padding: "13px 16px",
  fontSize: 10,
  fontWeight: 800,
  color: "#71717a",
  textTransform: "uppercase",
  letterSpacing: 1,
};
const td = {
  padding: "14px 16px",
  color: "#18181b",
  verticalAlign: "middle",
};
const inputSm = {
  padding: "8px 12px",
  border: "1px solid #e4e4e7",
  borderRadius: 6,
  fontSize: 13,
  minWidth: 160,
  outline: "none",
  color: "#18181b",
};
const inputFull = {
  width: "100%",
  padding: "10px 12px",
  border: "1px solid #e4e4e7",
  borderRadius: 8,
  fontSize: 13,
  boxSizing: "border-box",
  outline: "none",
  color: "#18181b",
};
const labelSm = {
  fontSize: 12,
  fontWeight: 700,
  color: "#52525b",
  display: "block",
  marginBottom: 6,
};
const btnPrimary = {
  padding: "9px 18px",
  background: "#18181b",
  color: "#ffffff",
  border: "none",
  borderRadius: 6,
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 600,
  transition: "background 0.2s",
};
const btnGhost = {
  padding: "9px 18px",
  background: "#f4f4f5",
  color: "#18181b",
  border: "1px solid #e4e4e7",
  borderRadius: 6,
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 600,
  transition: "background 0.2s",
};
const btnEdit = {
  padding: "5px 14px",
  background: "#f4f4f5",
  color: "#18181b",
  border: "1px solid #e4e4e7",
  borderRadius: 6,
  cursor: "pointer",
  fontSize: 12,
  fontWeight: 600,
};
const overlay = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,.6)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 1000,
};
const modalBox = {
  background: "#fff",
  borderRadius: 16,
  padding: 32,
  width: 460,
  maxHeight: "85vh",
  overflowY: "auto",
  border: "1px solid #e4e4e7",
  boxShadow: "0 20px 60px rgba(0,0,0,.15)",
};