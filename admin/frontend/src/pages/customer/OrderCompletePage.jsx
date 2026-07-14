import { useNavigate } from "react-router-dom";
import { ChevronRight, CheckCircle2, ShoppingBag } from "lucide-react";
import "./cart.css";

export default function OrderCompletePage() {
  const navigate = useNavigate();

  return (
    <div className="fm-cart-shell">
      {/* Progress Tracker (Step 3 Active) */}
      <div className="fm-cart-progress">
        <div className="fm-cart-step">
          <span className="fm-cart-step-num">1</span>
          <span>Shopping Cart</span>
        </div>
        <ChevronRight size={16} className="fm-cart-progress-arrow" />
        <div className="fm-cart-step">
          <span className="fm-cart-step-num">2</span>
          <span>Checkout Details</span>
        </div>
        <ChevronRight size={16} className="fm-cart-progress-arrow" />
        <div className="fm-cart-step active">
          <span className="fm-cart-step-num">3</span>
          <span>Order Complete</span>
        </div>
      </div>

      {/* Success Message Body */}
      <div className="order-success" style={{ marginTop: "40px" }}>
        <div
          className="order-success-icon"
          style={{ background: "#111111", color: "#ffffff" }}
        >
          <CheckCircle2 size={40} />
        </div>

        <h2>Your Order is Complete!</h2>
        <p>
          Thank you for your purchase. We have successfully received your order
          and it is now waiting for confirmation.
        </p>

        <div className="fm-cart-empty-actions" style={{ marginTop: "32px" }}>
          <button
            type="button"
            className="fm-cart-secondary-btn"
            onClick={() => navigate("/cart")}
          >
            Back to Cart
          </button>

          <button
            type="button"
            className="fm-cart-primary-btn"
            onClick={() => navigate("/catalog")}
          >
            <ShoppingBag size={16} />
            Continue Shopping
          </button>
        </div>

        <div style={{ marginTop: "32px" }}>
          <button
            onClick={() => navigate("/orders")}
            style={{
              background: "transparent",
              border: "none",
              color: "#6b7280",
              textDecoration: "underline",
              cursor: "pointer",
              fontSize: "0.9rem",
              fontWeight: 600,
            }}
          >
            View order history
          </button>
        </div>
      </div>
    </div>
  );
}
