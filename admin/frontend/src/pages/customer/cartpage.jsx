/**
 * src/pages/customer/cartpage.jsx
 * Unified cart page
 * Handles both:
 * - standard / ready-made items
 * - blueprint / custom template items
 */
import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  Trash2,
  Plus,
  Minus,
  ArrowRight,
  ShoppingBag,
  Scissors,
  Package,
  AlertCircle,
  ChevronRight,
} from "lucide-react";
import { buildAssetUrl } from "../../services/api";
import { useCart } from "./cartcontext";
import useAuthStore from "../../store/authStore";
import "./cart.css";

const resolveImageSrc = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return "";

  if (
    raw.startsWith("http://") ||
    raw.startsWith("https://") ||
    raw.startsWith("data:") ||
    raw.startsWith("blob:") ||
    raw.startsWith("/template-previews/") ||
    raw.startsWith("/images/") ||
    raw.startsWith("/assets/")
  ) {
    return raw;
  }

  return buildAssetUrl(raw);
};

const isBlueprintItem = (item = {}) =>
  String(item?.cart_type || item?.item_type || "")
    .trim()
    .toLowerCase() === "blueprint";

const formatPeso = (value) =>
  `₱${Number(value || 0).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
  })}`;

export default function CartPage() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const customerUser = user?.role === "customer" ? user : null;
  const { cart, updateQty, removeItem, clearCart } = useCart();

  const [selected, setSelected] = useState(new Set());
  const [checkoutError, setCheckoutError] = useState("");

  useEffect(() => {
    setSelected((prev) => {
      const cartKeys = new Set(cart.map((i) => i.key));
      const next = new Set([...prev].filter((k) => cartKeys.has(k)));

      cart.forEach((i) => {
        if (!prev.has(i.key)) next.add(i.key);
      });

      return next;
    });
  }, [cart]);

  useEffect(() => {
    if (!checkoutError) return;
    const timer = setTimeout(() => setCheckoutError(""), 3500);
    return () => clearTimeout(timer);
  }, [checkoutError]);

  const toggleItem = (key) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const allChecked = cart.length > 0 && selected.size === cart.length;

  const toggleAll = () => {
    if (allChecked) {
      setSelected(new Set());
    } else {
      setSelected(new Set(cart.map((i) => i.key)));
    }
  };

  const selectedItems = useMemo(
    () => cart.filter((i) => selected.has(i.key)),
    [cart, selected],
  );

  const selectedLineCount = selectedItems.length;
  const selectedUnits = selectedItems.reduce(
    (sum, item) => sum + Math.max(1, Number(item.quantity || 1)),
    0,
  );

  const selectedPricedSubtotal = selectedItems.reduce((sum, item) => {
    if (isBlueprintItem(item)) return sum;
    return sum + Number(item.unit_price || 0) * Number(item.quantity || 0);
  }, 0);

  const hasBlueprintSelected = selectedItems.some((item) =>
    isBlueprintItem(item),
  );
  const hasStandardSelected = selectedItems.some(
    (item) => !isBlueprintItem(item),
  );
  const isMixedSelection = hasBlueprintSelected && hasStandardSelected;

  const mixedSelectionMessage =
    "Your selection contains ready-made and custom items. Please check them out separately.";

  const checkoutButtonLabel = !customerUser
    ? "Sign in to Continue"
    : isMixedSelection
      ? "Select One Order Type"
      : hasBlueprintSelected
        ? "Proceed to Custom Checkout"
        : "Proceed to Checkout";

  const checkoutButtonDisabled = selected.size === 0 || isMixedSelection;

  const handleCheckout = () => {
    if (!selectedItems.length) return;

    setCheckoutError("");

    if (isMixedSelection) {
      setCheckoutError(mixedSelectionMessage);
      return;
    }

    if (!customerUser) {
      navigate("/login", {
        state: {
          redirectTo: "/cart",
        },
      });
      return;
    }

    if (hasBlueprintSelected) {
      const blueprintKeys = selectedItems.map((item) => item.key);
      sessionStorage.setItem(
        "cust_selected_custom_checkout",
        JSON.stringify(blueprintKeys),
      );
      navigate("/custom-checkout");
      return;
    }

    const standardKeys = selectedItems.map((item) => item.key);
    sessionStorage.setItem("cust_selected_keys", JSON.stringify(standardKeys));
    navigate("/checkout");
  };

  const summaryNote = isMixedSelection
    ? "You selected both ready-made and custom items. Please separate them before continuing."
    : hasBlueprintSelected
      ? "Custom / blueprint items follow quotation-based checkout."
      : "Shipping and final totals will be confirmed during checkout.";

  if (cart.length === 0) {
    return (
      <div className="fm-cart-shell">
        <div className="fm-cart-progress">
          <div className="fm-cart-step active">
            <span className="fm-cart-step-num">1</span>
            <span>Shopping Cart</span>
          </div>
          <ChevronRight size={16} className="fm-cart-progress-arrow" />
          <div className="fm-cart-step">
            <span className="fm-cart-step-num">2</span>
            <span>Checkout Details</span>
          </div>
          <ChevronRight size={16} className="fm-cart-progress-arrow" />
          <div className="fm-cart-step">
            <span className="fm-cart-step-num">3</span>
            <span>Order Complete</span>
          </div>
        </div>

        <div className="fm-cart-empty-premium">
          <div className="fm-cart-empty-icon-wrapper">
            <ShoppingBag size={48} strokeWidth={1.5} />
          </div>
          <h2>Your cart is currently empty</h2>
          <p>
            Looks like you haven't added anything yet. Discover our premium 
            ready-made furniture or start a custom blueprint design.
          </p>

          <div className="fm-cart-empty-actions">
            <button
              type="button"
              className="fm-cart-primary-btn"
              onClick={() => navigate("/catalog")}
            >
              <Package size={16} />
              Shop Ready-Made
            </button>

            <button
              type="button"
              className="fm-cart-secondary-btn"
              onClick={() => navigate("/customize")}
            >
              <Scissors size={16} />
              Custom Blueprint
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fm-cart-shell">
      <div className="fm-cart-progress">
        <div className="fm-cart-step active">
          <span className="fm-cart-step-num">1</span>
          <span>Shopping Cart</span>
        </div>

        <ChevronRight size={16} className="fm-cart-progress-arrow" />

        <div className="fm-cart-step">
          <span className="fm-cart-step-num">2</span>
          <span>Checkout Details</span>
        </div>

        <ChevronRight size={16} className="fm-cart-progress-arrow" />

        <div className="fm-cart-step">
          <span className="fm-cart-step-num">3</span>
          <span>Order Complete</span>
        </div>
      </div>

      <div className="fm-cart-grid">
        <section className="fm-cart-main">
          <div className="fm-cart-head-row">
            <div className="fm-cart-head-col product">Product</div>
            <div className="fm-cart-head-col price">Price</div>
            <div className="fm-cart-head-col qty">Quantity</div>
            <div className="fm-cart-head-col subtotal">Subtotal</div>
          </div>

          <div className="fm-cart-toolbar">
            <label className="fm-cart-select-all">
              <input
                type="checkbox"
                checked={allChecked}
                onChange={toggleAll}
              />
              <span>Select all</span>
            </label>

            <button
              type="button"
              className="fm-cart-clear-btn"
              onClick={clearCart}
            >
              Clear all
            </button>
          </div>

          <div className="fm-cart-items">
            {cart.map((item) => {
              const isChecked = selected.has(item.key);
              const blueprint = isBlueprintItem(item);
              const imageSrc = resolveImageSrc(
                item.image_url || item.preview_image_url,
              );
              const lineSubtotal =
                Number(item.unit_price || 0) * Number(item.quantity || 0);

              return (
                <article
                  key={item.key}
                  className={`fm-cart-item ${
                    isChecked ? "selected" : "dimmed"
                  }`}
                >
                  <div className="fm-cart-product-cell">
                    <div className="fm-cart-product-top">
                      <button
  type="button"
  className="fm-cart-remove-circle"
  onClick={() => {
    const itemName = item.base_blueprint_title || item.product_name || "this item";
    
    const confirmDelete = window.confirm(`Are you sure you want to remove "${itemName}" from your cart?`);
  
    if (confirmDelete) {
      removeItem(item.key);
    }
  }}
  aria-label={`Remove ${item.base_blueprint_title || item.product_name}`}
>
  <Trash2 size={14} />
</button>

                      <input
                        type="checkbox"
                        className="fm-cart-item-check"
                        checked={isChecked}
                        onChange={() => toggleItem(item.key)}
                      />

                      <div className="fm-cart-thumb">
                        {imageSrc ? (
                          <img
                            src={imageSrc}
                            alt={item.product_name}
                            onError={(e) => {
                              e.currentTarget.style.display = "none";
                              const fallback =
                                e.currentTarget.parentElement?.querySelector(
                                  ".fm-cart-thumb-fallback",
                                );
                              if (fallback) fallback.style.display = "flex";
                            }}
                          />
                        ) : null}

                        <div
                          className="fm-cart-thumb-fallback"
                          style={{ display: imageSrc ? "none" : "flex" }}
                        >
                          {blueprint ? "📐" : "🪵"}
                        </div>
                      </div>

                      <div className="fm-cart-product-copy">
                        <h3>
                          {item.base_blueprint_title || item.product_name}
                        </h3>

                        <div className="fm-cart-meta-line status">
                          {blueprint ? (
                            <>
                              <Scissors size={14} />
                              <span>Custom / Blueprint Request</span>
                            </>
                          ) : (
                            <>
                              <Package size={14} />
                              <span>Ready-Made Product</span>
                            </>
                          )}
                        </div>

                        {item.wood_type ? (
                          <div className="fm-cart-meta-line">
                            <span>{item.wood_type}</span>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  <div className="fm-cart-price-cell" data-label="Price">
                    {blueprint
                      ? "Price to be quoted"
                      : formatPeso(item.unit_price)}
                  </div>

                  <div className="fm-cart-qty-cell" data-label="Quantity">
                    <div className="fm-cart-qty-box">
                      <button
                        type="button"
                        className="fm-cart-qty-btn"
                        onClick={() => updateQty(item.key, -1)}
                      >
                        <Minus size={14} />
                      </button>

                      <input
                        type="number"
                        className="fm-cart-qty-value"
                        value={item.quantity || 1}
                        min="1"
                        onChange={(e) => {
                          const newQty = parseInt(e.target.value, 10);

                          // Only update if it's a valid number greater than 0
                          if (!isNaN(newQty) && newQty > 0) {
                            // Calculate the difference because updateQty adds/subtracts
                            const delta = newQty - item.quantity;
                            updateQty(item.key, delta);
                          }
                        }}
                        style={{
                          width: "46px",
                          textAlign: "center",
                          border: "none",
                          outline: "none",
                          background: "transparent",
                          fontSize: "inherit",
                          fontWeight: "inherit",
                          color: "inherit",
                        }}
                      />

                      <button
                        type="button"
                        className="fm-cart-qty-btn"
                        onClick={() => updateQty(item.key, 1)}
                      >
                        <Plus size={14} />
                      </button>
                    </div>
                  </div>

                  <div className="fm-cart-subtotal-cell" data-label="Subtotal">
                    {blueprint ? "TBD" : formatPeso(lineSubtotal)}
                  </div>
                </article>
              );
            })}
          </div>

          {selected.size > 0 && selected.size < cart.length && (
            <div className="fm-cart-selection-note">
              {selected.size} of {cart.length} line
              {cart.length !== 1 ? "s" : ""} selected
            </div>
          )}

          <div className="fm-cart-bottom-actions">
            <button
              type="button"
              className="fm-cart-secondary-btn"
              onClick={() => navigate("/catalog")}
            >
              ← Continue shopping
            </button>
          </div>
        </section>

        <aside className="fm-cart-summary">
          <div className="fm-cart-summary-card">
            <h2>Cart Totals</h2>

            <div className="fm-cart-summary-row">
              <span>
                Selected ({selectedLineCount} line
                {selectedLineCount !== 1 ? "s" : ""} • {selectedUnits} unit
                {selectedUnits !== 1 ? "s" : ""})
              </span>
              <strong>{formatPeso(selectedPricedSubtotal)}</strong>
            </div>

            <div className="fm-cart-summary-row">
              <span>Shipping</span>
              <strong className="green">Calculated at checkout</strong>
            </div>

            <div className="fm-cart-summary-divider" />

            <div className="fm-cart-summary-total">
              <span>Total</span>
              <strong>{formatPeso(selectedPricedSubtotal)}</strong>
            </div>

            <p className="fm-cart-summary-note">{summaryNote}</p>

            {selected.size === 0 && (
              <p className="fm-cart-warning-note">
                Select at least one item to continue.
              </p>
            )}

            {(isMixedSelection || checkoutError) && (
              <div className="fm-cart-alert">
                <AlertCircle size={16} />
                <span>
                  {isMixedSelection ? mixedSelectionMessage : checkoutError}
                </span>
              </div>
            )}

            <button
              type="button"
              className={`fm-cart-checkout-btn ${!customerUser ? "guest" : ""}`}
              onClick={handleCheckout}
              disabled={checkoutButtonDisabled}
              title={
                isMixedSelection
                  ? "Select only one order type to continue."
                  : ""
              }
            >
              <span>{checkoutButtonLabel}</span>
              <ArrowRight size={16} />
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}
