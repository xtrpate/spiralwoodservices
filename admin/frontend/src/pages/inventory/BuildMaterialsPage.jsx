import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../services/api";
import toast from "react-hot-toast";

export default function BuildMaterialsPage() {
  const [products, setProducts] = useState([]);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(null); // for BOM view

  useEffect(() => {
    api
      .get("/products", { params: { limit: 100, search } })
      .then((r) => setProducts(r.data.products));
  }, [search]);

  return (
    <div>
      <h1 style={title}>Build Materials Inventory</h1>
      <p style={{ color: "#52525b", fontSize: 13, marginBottom: 16 }}>
        Finished goods linked to Bill of Materials. Stock auto-updates on each
        transaction.
      </p>
      <input
        placeholder="Search products..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={inputSm}
      />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: selected ? "1fr 1fr" : "1fr",
          gap: 20,
          marginTop: 16,
        }}
      >
        <div style={tableCard}>
          <table
            style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}
          >
            <thead>
              <tr style={{ background: "#fafafa" }}>
                {[
                  "Name",
                  "Type",
                  "Walk-in Price",
                  "Prod Cost",
                  "Profit",
                  "Stock",
                  "Status",
                  "BOM",
                ].map((h) => (
                  <th key={h} style={th}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {products.map((p) => {
                const margin = (
                  (p.profit_margin / p.walkin_price) *
                  100
                ).toFixed(1);
                const sc = p.stock_status;
                const badge =
                  sc === "in_stock"
                    ? ["#f4f4f5", "#18181b", "#e4e4e7"]
                    : sc === "low_stock"
                      ? ["#ffffff", "#52525b", "#d4d4d8"]
                      : ["#fef2f2", "#991b1b", "#fecaca"];
                return (
                  <tr key={p.id} style={{ borderBottom: "1px solid #f4f4f5" }}>
                    <td style={td}>
                      <strong style={{ color: "#0a0a0a", fontWeight: 700 }}>
                        {p.name}
                      </strong>
                    </td>
                    <td style={td}>{p.type}</td>
                    <td style={td}>
                      ₱ {Number(p.walkin_price).toLocaleString()}
                    </td>
                    <td style={td}>
                      ₱ {Number(p.production_cost).toLocaleString()}
                    </td>
                    <td
                      style={{
                        ...td,
                        fontWeight: 600,
                        color: p.profit_margin > 0 ? "#18181b" : "#dc2626",
                      }}
                    >
                      ₱ {Number(p.profit_margin).toLocaleString()} ({margin}%)
                    </td>
                    <td style={{ ...td, fontWeight: 600 }}>{p.stock}</td>
                    <td style={td}>
                      <span
                        style={{
                          background: badge[0],
                          color: badge[1],
                          border: `1px solid ${badge[2]}`,
                          padding: "2px 10px",
                          borderRadius: 12,
                          fontSize: 11,
                          fontWeight: 600,
                        }}
                      >
                        {sc?.replace("_", " ")}
                      </span>
                    </td>
                    <td style={td}>
                      <button
                        onClick={() =>
                          setSelected(selected?.id === p.id ? null : p)
                        }
                        style={btnEdit}
                      >
                        View BOM
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {selected && (
          <BOMPanel product={selected} onClose={() => setSelected(null)} />
        )}
      </div>
    </div>
  );
}

function BOMPanel({ product, onClose }) {
  const [bom, setBom] = useState([]);
  const navigate = useNavigate();
  useEffect(() => {
    api
      .get(`/products/${product.id}`)
      .then((r) => setBom(r.data.bill_of_materials || []));
  }, [product.id]);

  return (
    <div
      style={{
        background: "#fff",
        borderRadius: 12,
        padding: 24,
        border: "1px solid #e4e4e7",
        boxShadow: "0 1px 2px rgba(0,0,0,.02)",
        position: "sticky",
        top: 0,
        alignSelf: "start",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 16,
        }}
      >
        <h3
          style={{ margin: 0, fontSize: 16, fontWeight: 800, color: "#0a0a0a" }}
        >
          Bill of Materials: {product.name}
        </h3>
        <button
          onClick={onClose}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            fontSize: 18,
            color: "#71717a",
          }}
        >
          ✕
        </button>
      </div>
      {bom.length === 0 ? (
        <div>
          <p style={{ color: "#71717a", fontSize: 13, marginBottom: 12 }}>
            No bill of materials defined. Add or edit BOM from the Product
            Edit page before using Product Stock-In.
          </p>
          <button
            onClick={() => navigate(`/admin/products/${product.id}/edit`)}
            style={btnEdit}
          >
            Edit Product
          </button>
        </div>
      ) : (
        <table
          style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}
        >
          <thead>
            <tr>
              <th style={{ ...th, background: "#fafafa" }}>Material</th>
              <th style={{ ...th, background: "#fafafa" }}>Unit</th>
              <th style={{ ...th, background: "#fafafa" }}>Quantity</th>
            </tr>
          </thead>
          <tbody>
            {bom.map((b, i) => (
              <tr key={i} style={{ borderBottom: "1px solid #f4f4f5" }}>
                <td style={td}>{b.material_name}</td>
                <td style={{ ...td, color: "#71717a" }}>{b.unit}</td>
                <td style={{ ...td, fontWeight: 600 }}>{b.quantity}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Stock Movement Page
// ────────────────────────────────────────────────────────────────────────────
export function StockMovementPage() {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [filters, setFilters] = useState({
    type: "",
    from: "",
    to: "",
    page: 1,
  });
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({
    material_id: "",
    product_id: "",
    type: "in",
    quantity: "",
    notes: "",
  });
  const [rawMats, setRawMats] = useState([]);
  const [products, setProducts] = useState([]);

  const load = async () => {
    const { data } = await api.get("/inventory/movements", {
      params: { ...filters, limit: 30 },
    });
    setRows(data.rows);
    setTotal(data.total);
  };

  useEffect(() => {
    load();
  }, [filters]); // eslint-disable-line

  useEffect(() => {
    api.get("/inventory/raw").then((r) => setRawMats(r.data.rows || []));
    api
      .get("/products", { params: { limit: 100 } })
      .then((r) => setProducts(r.data.products || []));
  }, []);

  const resetForm = () => {
    setForm({
      material_id: "",
      product_id: "",
      type: "in",
      quantity: "",
      notes: "",
    });
  };

  const handleMaterialChange = (value) => {
    setForm((f) => ({
      ...f,
      material_id: value,
      product_id: value ? "" : f.product_id,
    }));
  };

  const handleProductChange = (value) => {
    setForm((f) => ({
      ...f,
      product_id: value,
      material_id: value ? "" : f.material_id,
    }));
  };

  const isMaterialTarget = Boolean(form.material_id);
  const isProductTarget = Boolean(form.product_id);

  const helperMessage =
    isProductTarget && form.type === "in"
      ? "Product stock-in ito. Automatic babawasan ang linked raw materials based sa BOM. Kapag kulang ang raw materials, hindi ito mase-save."
      : isProductTarget && form.type === "out"
        ? "Product stock-out ito. Mababawasan ang finished product stock. Kapag kulang ang product stock, hindi ito mase-save."
        : isMaterialTarget && form.type === "in"
          ? "Raw material stock-in ito. Pang-delivery o restock ng supplier."
          : isMaterialTarget && form.type === "out"
            ? "Raw material stock-out ito. Manual bawas ng raw material stock."
            : "Pumili ng Raw Material o Product. Isa lang ang puwedeng target bawat movement.";

  const handleSave = async (e) => {
    e.preventDefault();

    try {
      if (!form.material_id && !form.product_id) {
        toast.error("Pumili ng raw material o product.");
        return;
      }

      const payload = {
        material_id: form.material_id || null,
        product_id: form.product_id || null,
        type: form.type,
        quantity: Number(form.quantity),
        notes: form.notes?.trim() || null,
      };

      await api.post("/inventory/movements", payload);

      toast.success(
        payload.product_id && payload.type === "in"
          ? "Production recorded. Product stock added and BOM materials deducted."
          : "Stock movement recorded.",
      );

      setModal(false);
      resetForm();
      load();
    } catch (err) {
      // Global interceptor sa api.js na ang nag-a-toast ng error message —
      // hindi na natin uulitin dito. Ang catch lang ay para pigilan ang
      // uncaught crash at panatilihing bukas ang modal.
    }
  };

  return (
    <div>
      <div style={headerDiv}>
        <h1 style={title}>Stock Movement Tracking</h1>
        <button onClick={() => setModal(true)} style={btnPrimary}>
          + Record Movement
        </button>
      </div>
      <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
        <select
          value={filters.type}
          onChange={(e) =>
            setFilters((f) => ({ ...f, type: e.target.value, page: 1 }))
          }
          style={inputSm}
        >
          <option value="">All Types</option>
          <option value="in">In (Delivery)</option>
          <option value="out">Out (Sales/Production)</option>
          <option value="adjustment">Adjustment</option>
          <option value="return">Return</option>
        </select>
        <input
          type="date"
          value={filters.from}
          onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value }))}
          style={inputSm}
        />
        <input
          type="date"
          value={filters.to}
          onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value }))}
          style={inputSm}
        />
      </div>
      <div style={tableCard}>
        <table
          style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}
        >
          <thead>
            <tr style={{ background: "#fafafa" }}>
              {[
                "Date",
                "Type",
                "Material / Product",
                "Supplier",
                "Qty",
                "Notes",
                "By",
              ].map((h) => (
                <th key={h} style={th}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              return (
                <tr key={r.id} style={{ borderBottom: "1px solid #f4f4f5" }}>
                  <td style={{ ...td, color: "#71717a" }}>
                    {new Date(r.created_at).toLocaleDateString("en-PH")}
                  </td>
                  <td style={td}>
                    <span
                      style={{
                        background: "#f4f4f5",
                        color: "#18181b",
                        border: "1px solid #e4e4e7",
                        padding: "2px 10px",
                        borderRadius: 12,
                        fontSize: 11,
                        fontWeight: 600,
                        textTransform: "capitalize",
                      }}
                    >
                      {r.type}
                    </span>
                  </td>
                  <td style={{ ...td, fontWeight: 600, color: "#0a0a0a" }}>
                    {r.material_name || r.product_name || "—"}
                  </td>
                  <td style={td}>{r.supplier_name || "—"}</td>
                  <td
                    style={{
                      ...td,
                      fontWeight: 700,
                      color:
                        r.type === "in" || r.type === "return"
                          ? "#18181b"
                          : "#52525b",
                    }}
                  >
                    {r.type === "in" || r.type === "return" ? "+" : "-"}
                    {r.quantity}
                  </td>
                  <td style={td}>{r.notes || "—"}</td>
                  <td style={{ ...td, color: "#71717a" }}>
                    {r.created_by_name}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {modal && (
        <div style={overlayStyle}>
          <div style={modalBox}>
            <h3
              style={{
                margin: "0 0 20px",
                fontSize: 18,
                fontWeight: 800,
                color: "#0a0a0a",
              }}
            >
              Record Stock Movement
            </h3>
            <form onSubmit={handleSave}>
              <div style={{ marginBottom: 12 }}>
                <label style={labelSm}>Movement Type *</label>
                <select
                  required
                  value={form.type}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, type: e.target.value }))
                  }
                  style={inputFull}
                >
                  <option value="in">In – Delivery / Production</option>
                  <option value="out">Out – Sales / Usage</option>
                  <option value="adjustment">Adjustment</option>
                  <option value="return">Return</option>
                </select>
              </div>
              <div style={{ marginBottom: 12 }}>
                <label style={labelSm}>Raw Material</label>
                <select
                  value={form.material_id}
                  onChange={(e) => handleMaterialChange(e.target.value)}
                  style={inputFull}
                >
                  <option value="">None</option>
                  {rawMats.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </div>
              <div style={{ marginBottom: 12 }}>
                <label style={labelSm}>Product / Build Material</label>
                <select
                  value={form.product_id}
                  onChange={(e) => handleProductChange(e.target.value)}
                  style={inputFull}
                >
                  <option value="">None</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <div
                style={{
                  marginBottom: 16,
                  padding: "12px 14px",
                  borderRadius: 8,
                  background: "#f4f4f5",
                  border: "1px solid #e4e4e7",
                  color: "#52525b",
                  fontSize: 12,
                  lineHeight: 1.5,
                }}
              >
                {helperMessage}
              </div>

              <div style={{ marginBottom: 12 }}>
                <label style={labelSm}>Quantity *</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  min="0.01"
                  value={form.quantity}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, quantity: e.target.value }))
                  }
                  style={inputFull}
                />
              </div>
              <div style={{ marginBottom: 20 }}>
                <label style={labelSm}>Notes / Reference</label>
                <textarea
                  value={form.notes}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, notes: e.target.value }))
                  }
                  rows={2}
                  style={{ ...inputFull, resize: "vertical" }}
                />
              </div>
              <div
                style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}
              >
                <button
                  type="button"
                  onClick={() => setModal(false)}
                  style={btnGhost}
                >
                  Cancel
                </button>
                <button type="submit" style={btnPrimary}>
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Suppliers Page
// ────────────────────────────────────────────────────────────────────────────
export function SuppliersPage() {
  const [suppliers, setSuppliers] = useState([]);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({
    name: "",
    address: "",
    contact_number: "",
    email: "",
  });

  const load = () => api.get("/suppliers").then((r) => setSuppliers(r.data));
  useEffect(() => {
    load();
  }, []);

  const openAdd = () => {
    setForm({ name: "", address: "", contact_number: "", email: "" });
    setModal("add");
  };
  const openEdit = (s) => {
    setForm(s);
    setModal("edit");
  };

  const handleSave = async (e) => {
    e.preventDefault();
    try {
      if (modal === "add") await api.post("/suppliers", form);
      else await api.put(`/suppliers/${form.id}`, form);
      setModal(null);
      load();
    } catch (error) {
      // Global interceptor sa api.js na ang nag-a-toast ng error message.
      // Ang catch lang ay para pigilan ang "Uncaught runtime errors"
      // crash at panatilihing bukas ang modal.
    }
  };

  return (
    <div>
      <div style={headerDiv}>
        <h1 style={title}>Supplier Management</h1>
        <button onClick={openAdd} style={btnPrimary}>
          + Add Supplier
        </button>
      </div>
      <div style={tableCard}>
        <table
          style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}
        >
          <thead>
            <tr style={{ background: "#fafafa" }}>
              {["Name", "Address", "Contact", "Email", "Actions"].map((h) => (
                <th key={h} style={th}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {suppliers.map((s) => (
              <tr key={s.id} style={{ borderBottom: "1px solid #f4f4f5" }}>
                <td style={td}>
                  <strong style={{ color: "#0a0a0a" }}>{s.name}</strong>
                </td>
                <td style={{ ...td, color: "#52525b" }}>{s.address || "—"}</td>
                <td style={td}>{s.contact_number || "—"}</td>
                <td style={{ ...td, color: "#52525b" }}>{s.email || "—"}</td>
                <td style={td}>
                  <button onClick={() => openEdit(s)} style={btnEdit}>
                    Edit
                  </button>
                  <button
                    onClick={async () => {
                      if (window.confirm("Delete supplier?")) {
                        try {
                          await api.delete(`/suppliers/${s.id}`);
                          load();
                        } catch (error) {
                          // Global interceptor na ang nag-a-toast ng error.
                        }
                      }
                    }}
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
            ))}
          </tbody>
        </table>
      </div>
      {modal && (
        <div style={overlayStyle}>
          <div style={modalBox}>
            <h3
              style={{
                margin: "0 0 20px",
                fontSize: 18,
                fontWeight: 800,
                color: "#0a0a0a",
              }}
            >
              {modal === "add" ? "Add Supplier" : "Edit Supplier"}
            </h3>
            <form onSubmit={handleSave}>
              {[
                ["Company Name *", "name", "text", true],
                ["Address", "address", "text"],
                ["Contact Number", "contact_number", "text"],
                ["Email", "email", "email"],
              ].map(([label, key, type, req]) => (
                <div key={key} style={{ marginBottom: 12 }}>
                  <label style={labelSm}>{label}</label>
                  <input
                    type={type || "text"}
                    required={req}
                    value={form[key] || ""}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, [key]: e.target.value }))
                    }
                    style={inputFull}
                  />
                </div>
              ))}
              <div
                style={{
                  display: "flex",
                  gap: 10,
                  justifyContent: "flex-end",
                  marginTop: 20,
                }}
              >
                <button
                  type="button"
                  onClick={() => setModal(null)}
                  style={btnGhost}
                >
                  Cancel
                </button>
                <button type="submit" style={btnPrimary}>
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Shared Styles ───────────────────────────────────────────────────────────
const headerDiv = {
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
  minWidth: 140,
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
const overlayStyle = {
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
  width: 480,
  maxHeight: "85vh",
  overflowY: "auto",
  border: "1px solid #e4e4e7",
  boxShadow: "0 20px 60px rgba(0,0,0,.15)",
};