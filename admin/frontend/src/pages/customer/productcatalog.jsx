import { useState, useEffect, useCallback } from "react";
import { Search, CheckCircle2 } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";

import api, { buildAssetUrl } from "../../services/api";
import "./productcatalog.css";
import { useCart } from "./cartcontext";



const clampNumber = (value, min, max) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return min;
  if (num < min) return min;
  if (num > max) return max;
  return num;
};

const formatPeso = (value) =>
  `₱${Number(value || 0).toLocaleString("en-PH", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;

const formatTypeLabel = (type) => {
  const raw = String(type || "standard")
    .replace(/_/g, " ")
    .trim();
  if (!raw) return "Standard";
  return raw.replace(/\b\w/g, (char) => char.toUpperCase());
};

const ProductImage = ({ src, alt, className, style, imgStyle }) => {
  const [errored, setErrored] = useState(false);
  const resolvedSrc = buildAssetUrl(src);

  if (!resolvedSrc || errored) {
    return (
      <div className={className} style={style}>
        <div className="product-img-placeholder-icon">🪵</div>
        <div className="product-img-alt">{alt}</div>
      </div>
    );
  }

  return (
    <img
      src={resolvedSrc}
      alt={alt}
      className={className}
      style={{
        width: "100%",
        height: "100%",
        objectFit: "contain",
        ...style,
        ...imgStyle,
      }}
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

const StockBadge = ({ status }) => {
  const map = {
    in_stock: { cls: "stock-pill stock-available", label: "In Stock" },
    low_stock: { cls: "stock-pill stock-limited", label: "Low Stock" },
    out_of_stock: { cls: "stock-pill stock-unavailable", label: "Out of Stock" },
  };

  const { cls, label } = map[status] || {
    cls: "stock-pill stock-available",
    label: status || "Available",
  };

  return <span className={cls}>{label}</span>;
};

export default function ProductCatalog() {
  const navigate = useNavigate();
  const location = useLocation();

  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [total, setTotal] = useState(0);

  const { addToCart } = useCart();

  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("all");
  const [stockFilter, setStockFilter] = useState("all");
  const [priceMin, setPriceMin] = useState("");
  const [priceMax, setPriceMax] = useState("");
  const [tempPriceMin, setTempPriceMin] = useState("");
  const [tempPriceMax, setTempPriceMax] = useState("");
  const [priceBounds, setPriceBounds] = useState({ min: 0, max: 0 });
  const [sortBy, setSortBy] = useState("name_asc");

  const [selVariation, setSelVariation] = useState(null);
  const [qty, setQty] = useState(1);
  const [cartMsg, setCartMsg] = useState("");
  const [urlMapped, setUrlMapped] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);

  const [toastMsg, setToastMsg] = useState("");
  const [isHiding, setIsHiding] = useState(false);

  useEffect(() => {
    if (!toastMsg) return;

    // Start slide-out animation after 2.7 seconds
    const hideTimer = setTimeout(() => {
      setIsHiding(true);
    }, 2700);

    // Completely remove it from the screen at 3.0 seconds
    const removeTimer = setTimeout(() => {
      setToastMsg("");
      setIsHiding(false);
    }, 3000);

    return () => {
      clearTimeout(hideTimer);
      clearTimeout(removeTimer);
    };
  }, [toastMsg]);

  const fetchProducts = useCallback(async () => {
    setLoading(true);

    try {
      const params = {
        type: "standard",
        sort: sortBy,
      };

      if (search) params.q = search;
      if (catFilter !== "all") params.category_id = catFilter;
      if (stockFilter !== "all") params.stock_status = stockFilter;
      if (priceMin !== "") params.price_min = priceMin;
      if (priceMax !== "") params.price_max = priceMax;

      const res = await api.get("/customer/products", { params });

      const rawProducts = Array.isArray(res.data?.products)
        ? res.data.products
        : [];

      const visibleProducts = rawProducts.filter(
        (item) => String(item?.type || "").toLowerCase() !== "blueprint",
      );

      const backendCategories = Array.isArray(res.data?.categories)
        ? res.data.categories
        : [];

      const nextMin = Number(res.data?.priceRange?.min || 0);
      const nextMax = Number(res.data?.priceRange?.max || 0);

      setProducts(visibleProducts);
      setCategories(backendCategories);
      setTotal(Number(res.data?.total || visibleProducts.length || 0));
      setPriceBounds({
        min: nextMin,
        max: nextMax,
      });

      setTempPriceMin((prev) => {
        if (!nextMax) return "";
        if (priceMin !== "" || priceMax !== "") {
          const current = Number(prev || priceMin || nextMin);
          return String(clampNumber(current, nextMin, nextMax));
        }
        return String(nextMin);
      });

      setTempPriceMax((prev) => {
        if (!nextMax) return "";
        if (priceMin !== "" || priceMax !== "") {
          const current = Number(prev || priceMax || nextMax);
          return String(clampNumber(current, nextMin, nextMax));
        }
        return String(nextMax);
      });
    } catch (err) {
      console.error(err);
      setProducts([]);
      setCategories([]);
      setTotal(0);
      toast.error(
        err?.response?.data?.message || "Failed to load catalog products.",
      );
    } finally {
      setLoading(false);
    }
  }, [search, catFilter, stockFilter, priceMin, priceMax, sortBy]);

  useEffect(() => {
    const timer = setTimeout(fetchProducts, 300);
    return () => clearTimeout(timer);
  }, [fetchProducts]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const q = params.get("q") || "";
    const categoryName = params.get("category");

    setSearch(q);

    if (!categoryName) {
      setCatFilter("all");
    }

    setUrlMapped(false);
  }, [location.search]);

  useEffect(() => {
    if (urlMapped || categories.length === 0) return;

    const params = new URLSearchParams(location.search);
    const categoryName = params.get("category");

    if (categoryName) {
      const match = categories.find(
        (cat) =>
          String(cat.name || "").toLowerCase() === categoryName.toLowerCase(),
      );
      if (match) {
        setCatFilter(String(match.id));
      }
    }

    setUrlMapped(true);
  }, [categories, location.search, urlMapped]);

  const needsOptionSelection = (product) =>
    (product?.variations?.length || 0) > 0;

  const openProduct = (product) => {
    setSelected(product);
    setSelVariation(null);
    setQty(1);
    setCartMsg("");
  };

  const quickAddToCart = (product) => {
    if (!product || product.stock_status === "out_of_stock") return;

    if (needsOptionSelection(product)) {
      openProduct(product);
      return;
    }

    const stock = Number(product.stock || 0);
    if (stock <= 0) return;

    addToCart({
      key: `${product.id}`,
      product_id: product.id,
      variation_id: null,
      product_name: product.name,
      unit_price: parseFloat(product.online_price),
      production_cost: product.production_cost ?? 0,
      quantity: 1,
      max_stock: stock,
      image_url: product.image_url || null,
    });

    setToastMsg(`"${product.name}" successfully added to your cart!`);
    setIsHiding(false);

    
  };

  const handleCardAddToCart = (product) => {
    if (!product || product.stock_status === "out_of_stock") return;

    if (needsOptionSelection(product)) {
      openProduct(product);
      return;
    }

    quickAddToCart(product);
  };

  const handleModalAddToCart = () => {
    if (!selected) return;

    const hasVariations = selected.variations?.length > 0;
    if (hasVariations && !selVariation) {
      setCartMsg("Please select a variation first.");
      return;
    }

    const key = selVariation
      ? `${selected.id}-${selVariation.id}`
      : `${selected.id}`;

    const price = selVariation?.selling_price ?? selected.online_price;
    const stock = Number(selVariation?.stock ?? selected.stock ?? 0);
    const name = selVariation
      ? `${selected.name} (${selVariation.variation_name})`
      : selected.name;

    if (stock <= 0) {
      setCartMsg("This item is currently out of stock.");
      return;
    }

    addToCart({
      key,
      product_id: selected.id,
      variation_id: selVariation?.id || null,
      product_name: name,
      unit_price: parseFloat(price),
      production_cost: selVariation?.unit_cost ?? selected.production_cost ?? 0,
      quantity: Number(qty || 1),
      max_stock: stock,
      image_url: selected.image_url || null,
    });

    setToastMsg('"{$name}" successfully added to your cart!');
    setIsHiding(false);    
    setSelected(null);
  };

  const clearFilters = () => {
    setSearch("");
    setCatFilter("all");
    setStockFilter("all");
    setPriceMin("");
    setPriceMax("");
    setSortBy("name_asc");

    if (priceBounds.max > 0) {
      setTempPriceMin(String(priceBounds.min));
      setTempPriceMax(String(priceBounds.max));
    } else {
      setTempPriceMin("");
      setTempPriceMax("");
    }

    navigate(location.pathname, { replace: true });
  };

  const applyPriceFilter = () => {
    if (!priceBounds.max) return;

    let nextMin = Number(tempPriceMin || priceBounds.min);
    let nextMax = Number(tempPriceMax || priceBounds.max);

    if (!Number.isFinite(nextMin)) nextMin = priceBounds.min;
    if (!Number.isFinite(nextMax)) nextMax = priceBounds.max;

    nextMin = clampNumber(nextMin, priceBounds.min, priceBounds.max);
    nextMax = clampNumber(nextMax, priceBounds.min, priceBounds.max);

    if (nextMin > nextMax) {
      [nextMin, nextMax] = [nextMax, nextMin];
    }

    setTempPriceMin(String(nextMin));
    setTempPriceMax(String(nextMax));

    if (nextMin === priceBounds.min && nextMax === priceBounds.max) {
      setPriceMin("");
      setPriceMax("");
      return;
    }

    setPriceMin(String(nextMin));
    setPriceMax(String(nextMax));
  };

  const resetPriceFilter = () => {
    if (!priceBounds.max) return;
    setPriceMin("");
    setPriceMax("");
    setTempPriceMin(String(priceBounds.min));
    setTempPriceMax(String(priceBounds.max));
  };

  const hasActiveFilters =
    search ||
    catFilter !== "all" ||
    stockFilter !== "all" ||
    priceMin !== "" ||
    priceMax !== "";

  const sliderMin = Number(priceBounds.min || 0);
  const sliderMax = Number(priceBounds.max || 0);
  const safeSliderMax = sliderMax > sliderMin ? sliderMax : sliderMin + 1;

  const currentMin = clampNumber(
    Number(tempPriceMin || sliderMin),
    sliderMin,
    safeSliderMax,
  );
  const currentMax = clampNumber(
    Number(tempPriceMax || safeSliderMax),
    sliderMin,
    safeSliderMax,
  );

  const normalizedMin = Math.min(currentMin, currentMax);
  const normalizedMax = Math.max(currentMin, currentMax);

  const minPercent =
    ((normalizedMin - sliderMin) / (safeSliderMax - sliderMin)) * 100;
  const maxPercent =
    ((normalizedMax - sliderMin) / (safeSliderMax - sliderMin)) * 100;

  const detailRows = selected
    ? [
        { label: "CATEGORY", value: selected.category || "—" },
        { label: "TYPE", value: formatTypeLabel(selected.type) },
        {
          label: "STOCK",
          value: `${Number(selected.stock || 0).toLocaleString("en-PH")} units`,
        },
        ...(selected.barcode
          ? [{ label: "BARCODE", value: selected.barcode }]
          : []),
      ]
    : [];

  return (
    <div className="catalog-page-shell">

      <div className="premium-toast-container">
        {toastMsg && (
          <div className={`premium-toast ${isHiding ? "hiding" : ""}`}>
            <CheckCircle2 size={20} color="#10b981" />
            <span>{toastMsg}</span>
          </div>
        )}
      </div>
      
      <div className="catalog-breadcrumbs">
        <button type="button" onClick={() => navigate("/")}>
          Home
        </button>
        <span>/</span>
        <span>Products</span>
      </div>

      <div className="catalog-page-head">
        <div className="catalog-page-copy">
          <h1>Product Catalog</h1>
          <p>
            Browse ready-made furniture and cabinet products designed for
            premium spaces, everyday storage, and custom woodwork needs.
          </p>
        </div>

        <div className="catalog-page-meta">
          {!loading && (
            <div className="catalog-results-info">
              Showing {products.length}
              {total && total !== products.length ? ` of ${total}` : ""} product
              {products.length !== 1 ? "s" : ""}
            </div>
          )}

          <div className="catalog-sort">
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
              <option value="name_asc">Name A–Z</option>
              <option value="name_desc">Name Z–A</option>
              <option value="price_asc">Price: Low to High</option>
              <option value="price_desc">Price: High to Low</option>
              <option value="newest">Newest First</option>
            </select>
          </div>
        </div>
      </div>

      <div className="catalog-layout">
        <aside className="catalog-sidebar">
          <div className="sidebar-title">Refine by Category</div>

          <div className="filter-section">
            <div className="filter-options">
              <button
                type="button"
                className={`filter-option ${catFilter === "all" ? "active" : ""}`}
                onClick={() => setCatFilter("all")}
              >
                <span>All Categories</span>
                <span className="filter-count">{total}</span>
              </button>

              {categories.map((cat) => (
                <button
                  type="button"
                  key={cat.id}
                  className={`filter-option ${
                    catFilter === String(cat.id) ? "active" : ""
                  }`}
                  onClick={() => setCatFilter(String(cat.id))}
                >
                  <span>{cat.name}</span>
                  <span className="filter-count">
                    {Number(cat.product_count || 0)}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="filter-section">
            <div className="sidebar-title sidebar-subtitle">Availability</div>

            <div className="filter-options">
              {[
                { val: "all", label: "All" },
                { val: "in_stock", label: "In Stock" },
                { val: "low_stock", label: "Low Stock" },
                { val: "out_of_stock", label: "Out of Stock" },
              ].map((opt) => (
                <button
                  type="button"
                  key={opt.val}
                  className={`filter-option ${
                    stockFilter === opt.val ? "active" : ""
                  }`}
                  onClick={() => setStockFilter(opt.val)}
                >
                  <span>{opt.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="filter-section">
            <div className="sidebar-title sidebar-subtitle">
              Filter by Price
            </div>

            <div className="price-slider-shell">
              <div className="price-slider-label">
                Price: {formatPeso(normalizedMin)} — {formatPeso(normalizedMax)}
              </div>

              <div className="price-slider-wrap">
                <div className="price-slider-track" />
                <div
                  className="price-slider-progress"
                  style={{
                    left: `${minPercent}%`,
                    right: `${100 - maxPercent}%`,
                  }}
                />

                <input
                  type="range"
                  min={sliderMin}
                  max={safeSliderMax}
                  value={normalizedMin}
                  onChange={(e) => {
                    const nextValue = Math.min(
                      Number(e.target.value),
                      Number(tempPriceMax || safeSliderMax),
                    );
                    setTempPriceMin(String(nextValue));
                  }}
                  className="price-range-input"
                  disabled={!sliderMax}
                />

                <input
                  type="range"
                  min={sliderMin}
                  max={safeSliderMax}
                  value={normalizedMax}
                  onChange={(e) => {
                    const nextValue = Math.max(
                      Number(e.target.value),
                      Number(tempPriceMin || sliderMin),
                    );
                    setTempPriceMax(String(nextValue));
                  }}
                  className="price-range-input"
                  disabled={!sliderMax}
                />
              </div>

              <div className="price-inputs">
                <input
                  type="number"
                  min={sliderMin}
                  max={safeSliderMax}
                  placeholder="Min"
                  value={tempPriceMin}
                  onChange={(e) => setTempPriceMin(e.target.value)}
                />
                <span>—</span>
                <input
                  type="number"
                  min={sliderMin}
                  max={safeSliderMax}
                  placeholder="Max"
                  value={tempPriceMax}
                  onChange={(e) => setTempPriceMax(e.target.value)}
                />
              </div>

              <div className="price-filter-actions">
                <button
                  type="button"
                  className="price-apply-btn"
                  onClick={applyPriceFilter}
                  disabled={!sliderMax}
                >
                  Filter
                </button>

                {(priceMin !== "" || priceMax !== "") && (
                  <button
                    type="button"
                    className="price-reset-btn"
                    onClick={resetPriceFilter}
                  >
                    Reset
                  </button>
                )}
              </div>
            </div>
          </div>

          {hasActiveFilters && (
            <button
              type="button"
              className="clear-filters"
              onClick={clearFilters}
            >
              Clear All Filters
            </button>
          )}
        </aside>

        <div className="catalog-main">
          <div className="catalog-toolbar">
            <div className="catalog-search-shell">
              <div className="catalog-search">
                <Search size={16} />
                <input
                  type="text"
                  placeholder="Search products..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onFocus={() => setSearchFocused(true)}
                  onBlur={() => setTimeout(() => setSearchFocused(false), 200)}
                />
              </div>

              {searchFocused && search.trim().length > 0 && (
                <div className="catalog-search-dropdown">
                  {loading ? (
                    <div className="catalog-search-item-empty">Searching...</div>
                  ) : products.length === 0 ? (
                    <div className="catalog-search-item-empty">
                      No results found for "{search}"
                    </div>
                  ) : (
                    <>
                      {products.slice(0, 6).map((product) => (
                        <button
                          key={product.id}
                          type="button"
                          className="catalog-search-item"
                          onClick={() => {
                            openProduct(product);
                            setSearchFocused(false);
                          }}
                        >
                          <div className="catalog-search-item-thumb">
                            <img
                              src={buildAssetUrl(product.image_url)}
                              alt={product.name}
                              onError={(e) => {
                                e.currentTarget.style.display = "none";
                              }}
                            />
                          </div>

                          <div className="catalog-search-item-copy">
                            <div className="catalog-search-item-name">
                              {product.name}
                            </div>
                            <div className="catalog-search-item-cat">
                              {product.category || "Uncategorized"}
                            </div>
                          </div>

                          <div className="catalog-search-item-price">
                            ₱
                            {parseFloat(product.online_price).toLocaleString(
                              "en-PH",
                              {
                                minimumFractionDigits: 2,
                              },
                            )}
                          </div>
                        </button>
                      ))}

                      {products.length > 6 && (
                        <div className="catalog-search-item-more">
                          View all {products.length} results in the catalog
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>

            {hasActiveFilters && (
              <button
                type="button"
                className="catalog-clear-inline"
                onClick={clearFilters}
              >
                Clear all filters
              </button>
            )}
          </div>

          <div className="product-grid">
            {loading ? (
              Array(8)
                .fill(0)
                .map((_, i) => <SkeletonCard key={i} />)
            ) : products.length === 0 ? (
              <div className="catalog-empty">
                <div className="catalog-empty-icon">🪵</div>
                <h3>No products found</h3>
                <p>Try adjusting your filters or search term.</p>
              </div>
            ) : (
              products.map((product) => (
                <div key={product.id} className="product-card">
                  <button
                    type="button"
                    className="product-card-image-button"
                    onClick={() => openProduct(product)}
                  >
                    <div className="product-img-box">
                      <ProductImage
                        src={product.image_url}
                        alt={product.name}
                        className="product-img-fallback"
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: 8,
                          width: "100%",
                          height: "100%",
                          position: "absolute",
                          inset: 0,
                        }}
                        imgStyle={{
                          position: "absolute",
                          inset: 0,
                          width: "100%",
                          height: "100%",
                          objectFit: "cover",
                          objectPosition: "center",
                          padding: 0,
                        }}
                      />
                    </div>
                  </button>
                  <div className="product-card-body">
                    <div className="product-card-category">
                      {product.category || "Uncategorized"}
                    </div>

                    <div className="product-card-name">{product.name}</div>

                    <div className="product-card-price">
                      ₱
                      {parseFloat(product.online_price).toLocaleString("en-PH", {
                        minimumFractionDigits: 2,
                      })}
                    </div>

                    <div className="product-card-stock-wrap">
                      <StockBadge status={product.stock_status} />
                    </div>

                    <div className="product-card-actions">
                      <button
                        type="button"
                        className="btn-view"
                        onClick={() => openProduct(product)}
                      >
                        View
                      </button>

                      <button
                        type="button"
                        className="btn-add-cart"
                        disabled={product.stock_status === "out_of_stock"}
                        onClick={() => handleCardAddToCart(product)}
                      >
                        {product.stock_status === "out_of_stock"
                          ? "Unavailable"
                          : "Add to Cart"}
                      </button>
                    </div>
                  </div>
                  
                  
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {selected && (
        <div
          className="detail-modal-overlay"
          onClick={(e) => e.target === e.currentTarget && setSelected(null)}
        >
          <div className="detail-modal">
            <div className="detail-modal-left">
              <div className="detail-main-image">
                <ProductImage
                  src={selected.image_url}
                  alt={selected.name}
                  className="product-img-fallback"
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                    width: "100%",
                    height: "100%",
                  }}
                  imgStyle={{
                    width: "100%",
                    height: "100%",
                    objectFit: "contain",
                    padding: "28px",
                  }}
                />
              </div>

              <div className="detail-thumb-row">
                <div className="detail-thumb active">
                  <ProductImage
                    src={selected.image_url}
                    alt={selected.name}
                    className="product-img-fallback"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: "100%",
                      height: "100%",
                    }}
                    imgStyle={{
                      width: "100%",
                      height: "100%",
                      objectFit: "contain",
                      padding: "10px",
                    }}
                  />
                </div>
              </div>
            </div>

            <div className="detail-modal-right">
              <div className="detail-category">
                {selected.category || "Uncategorized"}
              </div>

              <h2 className="detail-name">{selected.name}</h2>

              <div className="detail-price">
                ₱
                {parseFloat(
                  selVariation?.selling_price ?? selected.online_price,
                ).toLocaleString("en-PH", {
                  minimumFractionDigits: 2,
                })}
              </div>

              {selected.description ? (
                <p className="detail-description">{selected.description}</p>
              ) : null}

              {selected.variations?.length > 0 && (
                <div className="detail-section">
                  <h4>Available Options</h4>

                  <div className="variation-grid">
                    {selected.variations.map((variation) => (
                      <button
                        type="button"
                        key={variation.id}
                        className={`var-chip ${
                          selVariation?.id === variation.id ? "selected" : ""
                        }`}
                        onClick={() => setSelVariation(variation)}
                        disabled={variation.stock <= 0}
                      >
                        {variation.variation_name}
                        {variation.stock > 0
                          ? ` — ₱${parseFloat(
                              variation.selling_price,
                            ).toLocaleString("en-PH")}`
                          : " (Out)"}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="detail-section">
                <div className="detail-info-table">
                  {detailRows.map((row) => (
                    <div key={row.label} className="detail-info-row">
                      <span>{row.label}</span>
                      <strong>{row.value}</strong>
                    </div>
                  ))}
                </div>
              </div>

              <div className="detail-action-row">
                <div className="detail-qty-block">
                  <span className="detail-qty-label">Quantity</span>

                  <div className="qty-controls">
                    <button
                      type="button"
                      className="qty-btn"
                      onClick={() =>
                        setQty((value) => Math.max(1, Number(value || 1) - 1))
                      }
                    >
                      -
                    </button>

                    <input
                      type="number"
                      className="qty-val"
                      min="1"
                      max={
                        Number(selVariation?.stock ?? selected.stock ?? 1) || 1
                      }
                      value={qty}
                      onChange={(e) => {
                        const newQty = parseInt(e.target.value, 10);
                        const maxStock =
                          Number(selVariation?.stock ?? selected.stock ?? 1) ||
                          1;
                        if (!isNaN(newQty) && newQty > 0) {
                          setQty(Math.min(newQty, maxStock));
                        } else if (e.target.value === "") {
                          setQty("");
                        }
                      }}
                      onBlur={() => {
                        if (!qty || Number(qty) < 1) setQty(1);
                      }}
                    />

                    <button
                      type="button"
                      className="qty-btn"
                      onClick={() => {
                        const maxStock =
                          Number(selVariation?.stock ?? selected.stock ?? 1) ||
                          1;
                        setQty((value) =>
                          Math.min(Number(value || 1) + 1, maxStock),
                        );
                      }}
                    >
                      +
                    </button>
                  </div>
                </div>

                <div className="detail-button-row">
                  <button
                    type="button"
                    className="detail-add-btn"
                    disabled={selected.stock_status === "out_of_stock"}
                    onClick={handleModalAddToCart}
                  >
                    {selected.stock_status === "out_of_stock"
                      ? "Unavailable"
                      : "Add to Cart"}
                  </button>

                  <button
                    type="button"
                    className="detail-close-btn"
                    onClick={() => setSelected(null)}
                  >
                    Close
                  </button>
                </div>
              </div>

              {cartMsg ? <div className="detail-message">{cartMsg}</div> : null}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}