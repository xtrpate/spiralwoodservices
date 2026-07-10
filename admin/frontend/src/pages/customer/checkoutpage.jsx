import { useState, useEffect, useMemo, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import api, { buildAssetUrl } from "../../services/api";
import { useCart } from "./cartcontext";
import useAuthStore from "../../store/authStore";
import toast from "react-hot-toast";
import LocationPicker from "../../components/LocationPicker";
import "./customizepage.css";

const PAYMENT_METHODS = [
  {
    value: "cod",
    icon: "💵",
    label: "Cash on Delivery",
    desc: "Pay when the order is delivered.",
  },
  {
    value: "cop",
    icon: "🏪",
    label: "Cash on Pick-up",
    desc: "Pay when the order is picked up.",
  },
  {
    value: "paymongo",
    icon: "💳",
    label: "Pay Online",
    desc: "Pay securely via GCash, Maya, Bank, or Card.",
  },
];

const isBlueprintItem = (item = {}) =>
  String(item?.cart_type || item?.item_type || "")
    .trim()
    .toLowerCase() === "blueprint";

const resolveCartImageSrc = (src) => {
  const raw = String(src || "").trim();
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

const formatPeso = (value) =>
  `₱${Number(value || 0).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

export default function CheckoutPage() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { cart, removeMany } = useCart();

  const [checkoutItems, setCheckoutItems] = useState([]);
  const [selectionReady, setSelectionReady] = useState(false);
  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState({
    name: user?.name || "",
    phone: user?.phone || "",
    delivery_address: user?.address || "",
    payment_method: "",
    notes: "",
  });

  // Shopee/Lazada-style default delivery address.
  // useDefaultAddress: whether this order is currently using the saved
  //   profile address/pin as a shortcut (checkbox state).
  // deliveryPin: the CURRENT checkout pin for this order only — never
  //   written back to the user's profile.
  // userToggledRef: becomes true the moment the customer manually edits
  //   the address text or the map pin (typing, search, click, drag,
  //   clear, or current-location). Once true, incoming profile updates
  //   stop silently overwriting the customer's in-progress choice.
  const [useDefaultAddress, setUseDefaultAddress] = useState(() =>
    Boolean(String(user?.address || "").trim()),
  );
  const [deliveryPin, setDeliveryPin] = useState(() =>
    user?.address_lat != null && user?.address_lng != null
      ? { lat: Number(user.address_lat), lng: Number(user.address_lng) }
      : null,
  );
  const userToggledRef = useRef(false);

  useEffect(() => {
    setForm((prev) => ({
      ...prev,
      name: user?.name || prev.name || "",
      phone: user?.phone || prev.phone || "",
      delivery_address: userToggledRef.current
        ? prev.delivery_address
        : user?.address || prev.delivery_address || "",
    }));

    if (userToggledRef.current) return;

    const hasDefault = Boolean(String(user?.address || "").trim());
    setUseDefaultAddress(hasDefault);
    setDeliveryPin(
      hasDefault && user?.address_lat != null && user?.address_lng != null
        ? { lat: Number(user.address_lat), lng: Number(user.address_lng) }
        : null,
    );
  }, [user]);

  // Re-checking "Use my default delivery address" always pulls the
  // latest saved profile values, even if the customer had switched
  // to a custom address/pin earlier in this session.
  const handleToggleDefaultAddress = (checked) => {
    userToggledRef.current = true;
    setUseDefaultAddress(checked);
    if (checked) {
      setField("delivery_address", user?.address || "");
      setDeliveryPin(
        user?.address_lat != null && user?.address_lng != null
          ? { lat: Number(user.address_lat), lng: Number(user.address_lng) }
          : null,
      );
    }
  };

  // Any manual address text edit is a custom-address override for this
  // order only — it never touches users.address. LocationPicker now owns
  // the address input itself, so this receives plain text, not an event.
  const handleAddressInputChange = (text) => {
    userToggledRef.current = true;
    setUseDefaultAddress(false);
    setField("delivery_address", text);
  };

  // Fired for every LocationPicker pin change: click-to-place, drag,
  // search result, "use my current location", and "clear pin" (which
  // calls onChange(null)). All of these are custom-address overrides.
  const handlePinChange = (next) => {
    userToggledRef.current = true;
    setUseDefaultAddress(false);
    setDeliveryPin(next);
  };

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("cust_selected_keys");
      const parsed = raw ? JSON.parse(raw) : [];

      if (!Array.isArray(parsed) || !parsed.length) {
        navigate("/cart");
        return;
      }

      const selectedKeys = parsed
        .map((entry) =>
          typeof entry === "string" ? entry : entry?.key || null,
        )
        .filter(Boolean);

      if (!selectedKeys.length) {
        sessionStorage.removeItem("cust_selected_keys");
        navigate("/cart");
        return;
      }

      const keySet = new Set(selectedKeys);
      const matchedItems = (Array.isArray(cart) ? cart : []).filter(
        (item) => keySet.has(item.key) && !isBlueprintItem(item),
      );

      if (!matchedItems.length) {
        sessionStorage.removeItem("cust_selected_keys");
        navigate("/cart");
        return;
      }

      setCheckoutItems(matchedItems);
      setSelectionReady(true);
    } catch {
      sessionStorage.removeItem("cust_selected_keys");
      navigate("/cart");
    }
  }, [cart, navigate]);

  const setField = (key, value) =>
    setForm((prev) => ({
      ...prev,
      [key]: value,
    }));

  const totalUnits = useMemo(
    () =>
      checkoutItems.reduce(
        (sum, item) => sum + Math.max(1, Number(item.quantity || 1)),
        0,
      ),
    [checkoutItems],
  );

  const subtotal = useMemo(
    () =>
      checkoutItems.reduce(
        (sum, item) =>
          sum +
          Number(item.unit_price || 0) *
            Math.max(1, Number(item.quantity || 1)),
        0,
      ),
    [checkoutItems],
  );

  const total = subtotal;

  const hasDefaultAddress = Boolean(String(user?.address || "").trim());
  // COP (Cash on Pick-up) needs no delivery address or map at all.
  const showAddressSection = form.payment_method !== "cop";

  const handleSubmit = async (e) => {
    if (e?.preventDefault) e.preventDefault();

    // 👉 FIX 3: Replaced all setError calls with toast.error
    if (!checkoutItems.length) {
      toast.error("No selected ready-made items found for checkout.");
      return;
    }

    if (!String(form.name || "").trim()) {
      toast.error("Please enter your full name.");
      return;
    }

    if (!String(form.phone || "").trim()) {
      toast.error("Please enter your phone number.");
      return;
    }

    if (!String(form.payment_method || "").trim()) {
      toast.error("Please select a payment method.");
      return;
    }

    if (
      form.payment_method !== "cop" &&
      !String(form.delivery_address || "").trim()
    ) {
      toast.error("Please enter your delivery address.");
      return;
    }

    const payloadItems = checkoutItems.map((item) => ({
      key: item.key,
      product_id: item.product_id,
      variation_id: item.variation_id || null,
      product_name: item.product_name,
      quantity: Math.max(1, Number(item.quantity || 1)),
      unit_price: Number(item.unit_price || 0),
    }));

    const isPickup = form.payment_method === "cop";

    const formData = new FormData();
    formData.append("items", JSON.stringify(payloadItems));
    formData.append("name", String(form.name || "").trim());
    formData.append("phone", String(form.phone || "").trim());
    formData.append(
      "delivery_address",
      isPickup ? "" : String(form.delivery_address || "").trim(),
    );
    formData.append("payment_method", String(form.payment_method || "").trim());
    formData.append("notes", String(form.notes || "").trim());
    formData.append("subtotal", String(subtotal));
    formData.append("total", String(total));

    // Only ever send a complete pair — never a single lat or lng — and
    // never for pickup orders, which have no delivery destination.
    if (
      !isPickup &&
      Number.isFinite(deliveryPin?.lat) &&
      Number.isFinite(deliveryPin?.lng)
    ) {
      formData.append("delivery_lat", String(deliveryPin.lat));
      formData.append("delivery_lng", String(deliveryPin.lng));
    }

    setLoading(true);

    try {
      const res = await api.post("/customer/orders", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      const submittedKeys = payloadItems
        .map((item) => item.key)
        .filter(Boolean);
      removeMany(submittedKeys);
      sessionStorage.removeItem("cust_selected_keys");

      if (res?.data?.payment_url) {
        window.location.assign(res.data.payment_url);
        return;
      }

      navigate("/orders", { replace: true });
    } catch (err) {
      // 👉 FIX 4: Use toast for backend API errors too
      toast.error(
        err.response?.data?.message ||
          err.response?.data?.error ||
          "Failed to place order. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  if (!selectionReady) {
    return (
      <div className="checkout-page">
        <div className="page-hero">
          <h1>Checkout</h1>
          <p>Loading selected ready-made items…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="checkout-page">
      <div
        className="page-hero"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
        }}
      >
        <div>
          <h1>Checkout</h1>
          <p>Review your ready-made items and place your order</p>
        </div>

        <button className="btn btn-secondary" onClick={() => navigate("/cart")}>
          ← Back to Cart
        </button>
      </div>

      <div className="checkout-layout">
        <div className="checkout-form-panel">
          <div className="checkout-section">
            <div className="checkout-section-header">
              <div className="checkout-section-num">🛒</div>
              <h3>Your Ready-Made Items</h3>
              <span
                style={{ marginLeft: "auto", fontSize: 12, color: "#111111" }}
              >
                {checkoutItems.length} item
                {checkoutItems.length !== 1 ? "s" : ""} • {totalUnits} unit
                {totalUnits !== 1 ? "s" : ""}
              </span>
            </div>

            <div className="checkout-items-preview">
              {checkoutItems.map((item) => (
                <div key={item.key} className="checkout-item-row">
                  <div className="checkout-item-thumb">
                    {item.image_url || item.preview_image_url ? (
                      <img
                        src={resolveCartImageSrc(
                          item.image_url || item.preview_image_url,
                        )}
                        alt={item.product_name}
                        style={{
                          width: "100%",
                          height: "100%",
                          objectFit: "cover",
                          borderRadius: 8,
                        }}
                        onError={(e) => {
                          e.target.style.display = "none";
                          if (e.target.nextSibling) {
                            e.target.nextSibling.style.display = "flex";
                          }
                        }}
                      />
                    ) : null}

                    <div
                      style={{
                        display:
                          item.image_url || item.preview_image_url
                            ? "none"
                            : "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        height: "100%",
                        fontSize: 20,
                      }}
                    >
                      🪵
                    </div>
                  </div>

                  <div className="checkout-item-details">
                    <div className="checkout-item-name">
                      {item.product_name}
                    </div>

                    <div
                      style={{
                        fontSize: 12,
                        color: "#111111",
                        marginTop: 4,
                        fontWeight: 500,
                      }}
                    >
                      Ready-Made Product
                    </div>

                    {item.stock_status ? (
                      <div
                        className="checkout-item-sub"
                        style={{ marginTop: 4 }}
                      >
                        Stock: {item.stock_status}
                      </div>
                    ) : null}
                  </div>

                  <div className="checkout-item-qty">×{item.quantity || 1}</div>

                  <div className="checkout-item-price">
                    {formatPeso(
                      Number(item.unit_price || 0) *
                        Math.max(1, Number(item.quantity || 1)),
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="checkout-section">
            <div className="checkout-section-header">
              <div className="checkout-section-num">1</div>
              <h3>Contact Information</h3>
            </div>

            <div className="checkout-section-body">
              <div className="form-grid">
                <div className="form-field">
                  <label>Full Name *</label>
                  <input
                    type="text"
                    placeholder="Juan dela Cruz"
                    value={form.name}
                    onChange={(e) => setField("name", e.target.value)}
                  />
                </div>

                <div className="form-field">
                  <label>Phone Number *</label>
                  <input
                    type="tel"
                    placeholder="09XXXXXXXXX"
                    value={form.phone}
                    onChange={(e) => setField("phone", e.target.value)}
                  />
                </div>

                {showAddressSection ? (
                  <>
                    {hasDefaultAddress && (
                      <div className="form-field full">
                        <label
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            cursor: "pointer",
                          }}
                        >
                          <span
                            style={{
                              position: "relative",
                              display: "inline-flex",
                              width: 18,
                              height: 18,
                              flexShrink: 0,
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={useDefaultAddress}
                              onChange={(e) =>
                                handleToggleDefaultAddress(e.target.checked)
                              }
                              style={{
                                position: "absolute",
                                inset: 0,
                                width: "100%",
                                height: "100%",
                                margin: 0,
                                padding: 0,
                                opacity: 0,
                                cursor: "pointer",
                              }}
                            />
                            <span
                              aria-hidden="true"
                              style={{
                                width: 18,
                                height: 18,
                                boxSizing: "border-box",
                                borderRadius: 4,
                                border: useDefaultAddress
                                  ? "2px solid #1d4ed8"
                                  : "2px solid #999",
                                background: useDefaultAddress
                                  ? "#1d4ed8"
                                  : "#fff",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                flexShrink: 0,
                                pointerEvents: "none",
                              }}
                            >
                              {useDefaultAddress && (
                                <svg
                                  width="11"
                                  height="11"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="white"
                                  strokeWidth="4"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                >
                                  <polyline points="20 6 9 17 4 12" />
                                </svg>
                              )}
                            </span>
                          </span>
                          Use my default delivery address
                        </label>

                        {useDefaultAddress && (
                          <div
                            style={{
                              fontSize: 13,
                              color: "#444",
                              marginTop: 6,
                              paddingLeft: 26,
                            }}
                          >
                            📍 {user?.address}
                          </div>
                        )}
                      </div>
                    )}

                    {!useDefaultAddress && (
                      <div className="form-field full">
                        <LocationPicker
                          label="Use a different delivery address"
                          addressValue={form.delivery_address}
                          onAddressChange={handleAddressInputChange}
                          value={deliveryPin}
                          onChange={handlePinChange}
                        />
                      </div>
                    )}
                  </>
                ) : (
                  <div className="form-field full">
                    <p
                      style={{
                        fontSize: 13,
                        color: "#666",
                        margin: 0,
                      }}
                    >
                      Cash on Pick-up — no delivery address needed. You'll
                      pay and collect your order in-store.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="checkout-section">
            <div className="checkout-section-header">
              <div className="checkout-section-num">2</div>
              <h3>Payment Method</h3>
            </div>

            <div className="checkout-section-body">
              <div className="payment-methods">
                {PAYMENT_METHODS.map((method) => (
                  <div
                    key={method.value}
                    className={`payment-method-card ${
                      form.payment_method === method.value ? "selected" : ""
                    }`}
                    onClick={() => setField("payment_method", method.value)}
                  >
                    <div className="payment-method-icon">{method.icon}</div>

                    <div className="payment-method-info">
                      <span className="payment-method-name">
                        {method.label}
                      </span>
                      <span className="payment-method-desc">{method.desc}</span>
                    </div>

                    <div
                      className={`payment-method-check ${
                        form.payment_method === method.value ? "selected" : ""
                      }`}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="checkout-section">
            <div className="checkout-section-header">
              <div className="checkout-section-num">3</div>
              <h3>Additional Notes</h3>
            </div>

            <div className="checkout-section-body">
              <div className="form-field">
                <textarea
                  className="order-notes"
                  rows={3}
                  placeholder="Any other instructions for your order…"
                  value={form.notes}
                  onChange={(e) => setField("notes", e.target.value)}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="checkout-summary">
          <div className="checkout-summary-header">
            <h3>Order Summary</h3>
          </div>

          <div className="checkout-summary-items">
            {checkoutItems.map((item) => (
              <div key={item.key} className="checkout-summary-item">
                <div>
                  <div className="checkout-summary-item-name">
                    {item.product_name}
                  </div>
                  <div className="checkout-summary-item-qty">
                    ×{item.quantity || 1}
                  </div>
                </div>

                <div className="checkout-summary-item-price">
                  {formatPeso(
                    Number(item.unit_price || 0) *
                      Math.max(1, Number(item.quantity || 1)),
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="checkout-summary-totals">
            <div className="summary-row">
              <span>Subtotal</span>
              <span>{formatPeso(subtotal)}</span>
            </div>

            <div className="summary-row">
              <span>Shipping</span>
              <span style={{ color: "#111111", fontWeight: 700 }}>
                Calculated by store
              </span>
            </div>

            <div className="summary-row">
              <span>Total</span>
              <span style={{ color: "#111111", fontWeight: 800 }}>
                {formatPeso(total)}
              </span>
            </div>

            <p className="summary-note" style={{ marginTop: 10 }}>
              This checkout is for ready-made products only.
            </p>
          </div>

          <button
            className="place-order-btn"
            onClick={handleSubmit}
            disabled={loading || !checkoutItems.length}
          >
            {loading ? "Placing Order…" : "Place Order"}
          </button>
        </div>
      </div>
    </div>
  );
}