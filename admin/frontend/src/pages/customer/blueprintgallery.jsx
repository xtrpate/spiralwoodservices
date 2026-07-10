/**
 * pages/blueprintgallery.jsx
 * Blueprint Gallery — mirrors Product Catalog layout
 * Browse pre-made blueprints and add to cart
 */
import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { Search, ShoppingCart, Eye } from "lucide-react";
import { useCart } from "./cartcontext";
import "./blueprintgallery.css";
import { Search, ShoppingCart, Eye, PenTool } from "lucide-react";

const API = "http://localhost:5000";

/* ── Image with fallback ── */
const BlueprintImage = ({ src, alt, className }) => {
  const [errored, setErrored] = useState(false);
  if (!src || errored) {
    return (
      <div
        className={className}
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "#f5f0eb",
          height: "100%",
        }}
      >
        <div style={{ fontSize: 38, marginBottom: 6 }}>📐</div>
        <div
          style={{
            fontSize: 11,
            color: "#bbb",
            textAlign: "center",
            padding: "0 8px",
          }}
        >
          {alt}
        </div>
      </div>
    );
  }
  return (
    <img
      src={`${API}/${src}`}
      alt={alt}
      className={className}
      style={{ width: "100%", height: "100%", objectFit: "cover" }}
      onError={() => setErrored(true)}
    />
  );
};

const SkeletonCard = () => (
  <div className="product-skeleton">
    <div className="skeleton-img" />
    <div className="skeleton-body">
      <div className="skeleton-line short" />
      <div className="skeleton-line medium" />
      <div className="skeleton-line" />
    </div>
  </div>
);

/* ── Blueprint Detail Modal ── */
function BlueprintModal({ blueprint, onClose, onAddToCart }) {
  const [full, setFull] = useState(null);
  const [loading, setLoading] = useState(true);
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);

  useEffect(() => {
    axios
      .get(`/api/customer/blueprints/${blueprint.id}`)
      .then((r) => setFull(r.data))
      .catch(() => setFull(blueprint))
      .finally(() => setLoading(false));
  }, [blueprint.id]);

  const bp = full || blueprint;
  const price = parseFloat(bp.base_price || 0);

  const handleAdd = () => {
    onAddToCart(bp, qty);
    setAdded(true);
    setTimeout(() => setAdded(false), 2000);
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-box modal-box-wide"
        onClick={(e) => e.stopPropagation()}
      >
        <button className="modal-close" onClick={onClose}>
          ✕
        </button>

        {loading ? (
          <div
            style={{ textAlign: "center", padding: "60px 20px", color: "#aaa" }}
          >
            <div className="bp-spinner" />
            <p>Loading…</p>
          </div>
        ) : (
          <div className="bp-modal-body">
            {/* Left: image */}
            <div className="bp-modal-img-side">
              <div className="bp-modal-img-wrap">
                <BlueprintImage
                  src={bp.thumbnail_url}
                  alt={bp.title}
                  className="bp-modal-main-img"
                />
              </div>
              {bp.is_template === 1 && (
                <span
                  className="badge badge-blue"
                  style={{ marginTop: 10, display: "inline-block" }}
                >
                  📐 Template Available
                </span>
              )}
            </div>

            {/* Right: info */}
            <div className="bp-modal-info-side">
              {bp.wood_type && (
                <div className="product-card-category">{bp.wood_type}</div>
              )}
              <h2 className="bp-modal-title">{bp.title}</h2>
              {bp.description && (
                <p className="bp-modal-desc">{bp.description}</p>
              )}

              {/* Price */}
              <div className="bp-modal-price">
                {price > 0 ? (
                  <>
                    ₱
                    {price.toLocaleString("en-PH", {
                      minimumFractionDigits: 2,
                    })}
                    <span className="bp-price-note"> starting price</span>
                  </>
                ) : (
                  <span className="bp-price-tbd">
                    Price to be quoted by admin
                  </span>
                )}
              </div>

              {/* Components */}
              {bp.components?.length > 0 && (
                <div className="bp-modal-components">
                  <div className="bp-comp-title">
                    📦 {bp.components.length} Component
                    {bp.components.length !== 1 ? "s" : ""}
                  </div>
                  <div className="bp-comp-list">
                    {bp.components.map((c, i) => (
                      <div key={i} className="bp-comp-row">
                        <span className="bp-comp-name">
                          {c.name || c.component_name || `Part ${i + 1}`}
                        </span>
                        {c.quantity && (
                          <span className="bp-comp-qty">×{c.quantity}</span>
                        )}
                        {c.material && (
                          <span className="bp-comp-mat">{c.material}</span>
                        )}
                        {(c.width || c.height || c.depth) && (
                          <span className="bp-comp-dim">
                            {[c.width, c.height, c.depth]
                              .filter(Boolean)
                              .join("×")}
                            {c.unit || ""}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Qty + Add */}
              <div className="bp-modal-actions">
                <div className="qty-control">
                  <button
                    className="qty-btn"
                    onClick={() => setQty((q) => Math.max(1, q - 1))}
                  >
                    −
                  </button>
                  <span className="qty-value">{qty}</span>
                  <button
                    className="qty-btn"
                    onClick={() => setQty((q) => q + 1)}
                  >
                    +
                  </button>
                </div>
                <button
                  className={`btn-add-cart ${added ? "btn-added" : ""}`}
                  onClick={handleAdd}
                >
                  <ShoppingCart size={15} />
                  {added
                    ? "Added to Cart!"
                    : price > 0
                      ? "Add to Cart"
                      : "Add (Price TBD)"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════
   Main Blueprint Gallery Page
══════════════════════════════════════ */
export default function BlueprintGallery({ embedded = false }) {
  const { addToCart } = useCart();

  const [blueprints, setBlueprints] = useState([]);
  const [woodTypes, setWoodTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [selected, setSelected] = useState(null);
  const [toastMsg, setToastMsg] = useState("");

  const [search, setSearch] = useState("");
  const [woodFilter, setWoodFilter] = useState("all");
  const [sortBy, setSortBy] = useState("newest");
  const [page, setPage] = useState(1);
  const LIMIT = 24;

  const fetchBlueprints = useCallback(
    async (ov = {}) => {
      setLoading(true);
      try {
        const params = {
          q: ov.search ?? search,
          wood_type:
            (ov.wood ?? woodFilter) === "all" ? "" : (ov.wood ?? woodFilter),
          sort: ov.sort ?? sortBy,
          page: ov.page ?? page,
          limit: LIMIT,
        };
        Object.keys(params).forEach((k) => {
          if (!params[k]) delete params[k];
        });
        const res = await axios.get("/api/customer/blueprints", { params });
        setBlueprints(res.data.blueprints);
        setTotal(res.data.total);
        if (res.data.wood_types?.length) setWoodTypes(res.data.wood_types);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    },
    [search, woodFilter, sortBy, page],
  );

  useEffect(() => {
    fetchBlueprints();
  }, []);

  const applyFilter = (key, val) => {
    if (key === "wood") {
      setWoodFilter(val);
      fetchBlueprints({ wood: val, page: 1 });
      setPage(1);
    }
    if (key === "sort") {
      setSortBy(val);
      fetchBlueprints({ sort: val, page: 1 });
      setPage(1);
    }
  };

  const handleSearch = (e) => {
    e.preventDefault();
    setPage(1);
    fetchBlueprints({ search, page: 1 });
  };

  const clearFilters = () => {
    setSearch("");
    setWoodFilter("all");
    setSortBy("newest");
    setPage(1);
    fetchBlueprints({ search: "", wood: "", sort: "newest", page: 1 });
  };

  const handleAddToCart = (bp, qty) => {
    addToCart({
      key: `bp_${bp.id}`,
      product_id: null,
      blueprint_id: bp.id,
      product_name: bp.title,
      unit_price: parseFloat(bp.base_price || 0),
      quantity: qty,
      max_stock: 999,
      item_type: "blueprint",
      wood_type: bp.wood_type || "",
      image_url: bp.thumbnail_url || "",
    });
    setToastMsg(`"${bp.title}" added to cart!`);
    setTimeout(() => setToastMsg(""), 2500);
    setSelected(null);
  };

  const hasFilters = woodFilter !== "all" || search || sortBy !== "newest";
  const totalPages = Math.ceil(total / LIMIT);

  return (
    <div className={embedded ? "bp-embedded" : "catalog-page"}>
      {/* Toast */}
      {toastMsg && (
        <div className="cart-toast">
          <ShoppingCart size={15} /> {toastMsg}
        </div>
      )}

      {/* Hero — hidden when embedded */}
      {!embedded && (
        <div className="page-hero">
          <h1>Blueprint Gallery</h1>
          <p>
            Browse our pre-designed furniture blueprints — order one and we'll
            custom build it for you
          </p>
        </div>
      )}

      <div className={embedded ? "bp-embedded-layout" : "catalog-layout"}>
        {/* ── Sidebar — hidden when embedded (catalog already has sidebar) ── */}
        {!embedded && (
          <aside className="catalog-sidebar">
            <div className="sidebar-title">Filters</div>

            {/* Search */}
            <div className="filter-section">
              <div className="filter-label">Search</div>
              <form onSubmit={handleSearch} style={{ display: "flex", gap: 6 }}>
                <input
                  className="filter-search-input"
                  type="text"
                  placeholder="Search blueprints…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <button type="submit" className="filter-search-btn">
                  <Search size={14} />
                </button>
              </form>
            </div>

            {/* Wood Type */}
            {woodTypes.length > 0 && (
              <div className="filter-section">
                <div className="filter-label">Wood Type</div>
                <div className="filter-options">
                  <div
                    className={`filter-option ${woodFilter === "all" ? "active" : ""}`}
                    onClick={() => applyFilter("wood", "all")}
                  >
                    All Types
                  </div>
                  {woodTypes.map((wt) => (
                    <div
                      key={wt}
                      className={`filter-option ${woodFilter === wt ? "active" : ""}`}
                      onClick={() => applyFilter("wood", wt)}
                    >
                      {wt}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Sort */}
            <div className="filter-section">
              <div className="filter-label">Sort By</div>
              <div className="filter-options">
                {[
                  { val: "newest", label: "Newest First" },
                  { val: "price_asc", label: "Price: Low → High" },
                  { val: "price_desc", label: "Price: High → Low" },
                  { val: "title_asc", label: "Name A → Z" },
                ].map((o) => (
                  <div
                    key={o.val}
                    className={`filter-option ${sortBy === o.val ? "active" : ""}`}
                    onClick={() => applyFilter("sort", o.val)}
                  >
                    {o.label}
                  </div>
                ))}
              </div>
            </div>

            {hasFilters && (
              <button className="clear-filters" onClick={clearFilters}>
                ✕ Clear Filters
              </button>
            )}
          </aside>
        )}

        {/* ── Main grid ── */}
        <div className="catalog-main">
          <div className="catalog-results-bar">
            <span className="catalog-count">
              {loading
                ? "Loading…"
                : `${total} blueprint${total !== 1 ? "s" : ""} found`}
            </span>
          </div>

          {loading ? (
            <div className="products-grid">
              {Array.from({ length: 8 }).map((_, i) => (
                <SkeletonCard key={i} />
              ))}
            </div>
          ) : blueprints.length === 0 ? (
            <div className="bp-empty-premium">
              <div className="bp-empty-icon-wrapper">
                <PenTool size={48} strokeWidth={1.5} />
              </div>
              <h2>No blueprints found</h2>
              <p>
                {hasFilters 
                  ? "We couldn't find any blueprints matching your current filters. Try adjusting your search criteria."
                  : "The blueprint gallery is currently empty. Check back later for new custom designs!"}
              </p>
              {hasFilters && (
                <div className="bp-empty-actions">
                  <button
                    type="button"
                    className="bp-primary-btn"
                    onClick={clearFilters}
                  >
                    Clear Filters
                  </button>
                </div>
              )}
            </div>
          ) : (
            <>
              <div className="products-grid">
                {blueprints.map((bp) => {
                  const price = parseFloat(bp.base_price || 0);
                  return (
                    <div key={bp.id} className="product-card">
                      {/* Thumbnail */}
                      <div
                        className="product-card-img"
                        style={{ cursor: "pointer" }}
                        onClick={() => setSelected(bp)}
                      >
                        <BlueprintImage
                          src={bp.thumbnail_url}
                          alt={bp.title}
                          className="product-card-img"
                        />
                        <div className="product-card-badges">
                          {bp.is_template === 1 && (
                            <span className="badge badge-blue">Template</span>
                          )}
                        </div>
                      </div>

                      {/* Info */}
                      <div className="product-card-body">
                        {bp.wood_type && (
                          <div className="product-card-category">
                            {bp.wood_type}
                          </div>
                        )}
                        <div className="product-card-name">{bp.title}</div>
                        {bp.description && (
                          <div className="product-card-desc">
                            {bp.description}
                          </div>
                        )}

                        <div className="product-card-footer">
                          <div className="product-card-price">
                            {price > 0 ? (
                              <>
                                ₱
                                {price.toLocaleString("en-PH", {
                                  minimumFractionDigits: 2,
                                })}
                              </>
                            ) : (
                              <span style={{ color: "#aaa", fontSize: 13 }}>
                                Price TBD
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="product-card-actions">
                          <button
                            className="btn-view"
                            onClick={() => setSelected(bp)}
                          >
                            <Eye size={14} /> View
                          </button>
                          <button
                            className="btn-add-cart"
                            onClick={() => handleAddToCart(bp, 1)}
                          >
                            <ShoppingCart size={14} /> Order
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {totalPages > 1 && (
                <div className="catalog-pagination">
                  <button
                    className="page-btn"
                    disabled={page === 1}
                    onClick={() => {
                      setPage((p) => p - 1);
                      fetchBlueprints({ page: page - 1 });
                    }}
                  >
                    ← Prev
                  </button>
                  <span className="page-info">
                    Page {page} of {totalPages}
                  </span>
                  <button
                    className="page-btn"
                    disabled={page === totalPages}
                    onClick={() => {
                      setPage((p) => p + 1);
                      fetchBlueprints({ page: page + 1 });
                    }}
                  >
                    Next →
                  </button>
                </div>
              )}
            </>
          )}
        </div>
        {/* end catalog-main / bp-embedded-layout */}
      </div>
      {/* end catalog-layout / bp-embedded */}

      {/* Detail modal */}
      {selected && (
        <BlueprintModal
          blueprint={selected}
          onClose={() => setSelected(null)}
          onAddToCart={handleAddToCart}
        />
      )}
    </div>
  );
}
