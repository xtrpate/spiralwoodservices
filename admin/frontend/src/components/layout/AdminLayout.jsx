// src/components/layout/AdminLayout.jsx – Sidebar + topbar shell
import React, { useState, useEffect } from "react";
import { Outlet, NavLink, useNavigate } from "react-router-dom";
import useAuthStore from "../../store/authStore";
import toast from "react-hot-toast";
import { useCart } from "../../pages/customer/cartcontext";
import NotificationBell from "../NotificationBell";
import "./AdminLayout.css";

const NAV_ITEMS = [
  { section: "Dashboard" },
  {
    label: "Dashboard",
    path: "/admin/dashboard",
    icon: "📊",
    roles: ["admin"],
  },

  { section: "Management" },
  {
    label: "Task Assignments",
    path: "/admin/tasks",
    icon: "📋",
    roles: ["admin", "staff"],
  },
  {
    label: "Appointments",
    path: "/admin/appointments",
    icon: "📅",
    roles: ["admin"],
  },
  {
    label: "Delivery Scheduling",
    path: "/admin/delivery",
    icon: "🚚",
    roles: ["admin"],
  },

  {
    label: "Products",
    path: "/admin/products",
    icon: "📦",
    roles: ["admin", "staff"],
  },
  { section: "Inventory" },
  {
    label: "Raw Materials",
    path: "/admin/inventory/raw",
    icon: "🪵",
    roles: ["admin", "staff"],
  },
  {
    label: "Build Materials",
    path: "/admin/inventory/build",
    icon: "🔧",
    roles: ["admin", "staff"],
  },
  {
    label: "Stock Movement",
    path: "/admin/inventory/movements",
    icon: "🔄",
    roles: ["admin", "staff"],
  },
  {
    label: "Suppliers",
    path: "/admin/inventory/suppliers",
    icon: "🏭",
    roles: ["admin", "staff"],
  },
  { section: "Blueprints" },
  {
    label: "Blueprint Mgmt",
    path: "/admin/blueprints",
    icon: "🗺️",
    roles: ["admin", "staff"],
  },
  {
    label: "Contracts",
    path: "/admin/contracts",
    icon: "📝",
    roles: ["admin"],
  },
  { section: "Sales & Orders" },
  {
    label: "Orders",
    path: "/admin/orders",
    icon: "🛒",
    roles: ["admin", "staff"],
  },
  {
    label: "Cancellations",
    path: "/admin/orders/cancellations",
    icon: "❌",
    roles: ["admin"],
  },
  {
    label: "Sales Reports",
    path: "/admin/sales",
    icon: "📈",
    roles: ["admin", "staff"],
  },
  {
    label: "Warranty",
    path: "/admin/warranty",
    icon: "🛡️",
    roles: ["admin", "staff"],
  },
  { section: "Management" },
  {
    label: "Customers",
    path: "/admin/customers",
    icon: "👥",
    roles: ["admin"],
  },
  {
    label: "Users & Roles",
    path: "/admin/users",
    icon: "🔑",
    roles: ["admin"],
  },
  {
    label: "Audit Logs",
    path: "/admin/audit-logs",
    icon: "🧾",
    roles: ["admin"],
  },
  { section: "Website" },
  {
    label: "Site Settings",
    path: "/admin/website/settings",
    icon: "⚙️",
    roles: ["admin"],
  },
  { label: "FAQs", path: "/admin/website/faqs", icon: "❓", roles: ["admin"] },
  {
    label: "Page Content",
    path: "/admin/website/pages",
    icon: "📄",
    roles: ["admin"],
  },
  { label: "Backup", path: "/admin/backup", icon: "💾", roles: ["admin"] },
];

export default function AdminLayout() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const [open, setOpen] = useState(true);
  const { clearCart } = useCart();

  const [showLogoutModal, setShowLogoutModal] = useState(false);

  // Mobile/tablet off-canvas drawer state — independent from the desktop
  // `open` (collapsed/expanded width) state above. Only relevant below
  // the 1023px breakpoint defined in AdminLayout.css.
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (user && user.role === "customer") {
      toast.error("Access restricted. Redirecting to storefront.");
      navigate("/");
    }
  }, [user, navigate]);

  // Lock background scroll while the mobile drawer is open. Scoped to this
  // component only — cleans itself up on close/unmount, and nothing else
  // in the app currently touches document.body.style.overflow.
  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  const handleLogout = () => {
    setShowLogoutModal(true);
  };
  const confirmLogout = () => {
    setShowLogoutModal(false);
    logout();
    clearCart(false);
    navigate("/login");
  };

  const visibleItems = NAV_ITEMS.filter(
    (item) => item.section || !item.roles || item.roles.includes(user?.role),
  );

  return (
    <div
      className="wisdom-admin-shell"
      style={{
        display: "flex",
        minHeight: "100vh",
        fontFamily: "Inter, sans-serif",
      }}
    >
      {/* Mobile/tablet backdrop — only rendered (and visible via CSS) below
          the 1023px breakpoint, tapping it closes the drawer. */}
      {mobileOpen && (
        <div
          className="wisdom-sidebar-overlay"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* ── Sidebar ──────────────────────────────────────────────────────── */}
      <aside
        className={`wisdom-sidebar ${mobileOpen ? "mobile-open" : ""}`}
        style={{
          width: open ? 240 : 64,
          background: "#0a0a0a" /* 👉 Pitch black background */,
          color: "#e5e7eb",
          transition: "width .2s",
          overflow: "hidden",
          flexShrink: 0,
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Brand */}
        <div
          style={{
            padding: "20px 16px",
            borderBottom: "1px solid #27272a" /* 👉 Dark gray border */,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 22 }}>🪵</span>
            {open && (
              <span
                style={{
                  fontWeight: 800,
                  fontSize: 16,
                  color: "#ffffff" /* 👉 Pure white text */,
                  whiteSpace: "nowrap",
                  letterSpacing: "0.02em",
                }}
              >
                WISDOM Admin
              </span>
            )}
          </div>

          {/* Mobile-only close button — hidden on desktop via CSS */}
          <button
            type="button"
            className="wisdom-sidebar-close"
            onClick={() => setMobileOpen(false)}
            aria-label="Close menu"
          >
            ✕
          </button>
        </div>

        {/* Navigation */}
        <nav style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
          {visibleItems.map((item, i) => {
            if (item.section) {
              return open ? (
                <div
                  key={i}
                  style={{
                    padding: "12px 16px 4px",
                    fontSize: 10,
                    textTransform: "uppercase",
                    letterSpacing: 1.2,
                    color:
                      "#71717a" /* 👉 Neutral mid-gray for section headers */,
                    fontWeight: 700,
                  }}
                >
                  {item.section}
                </div>
              ) : (
                <div
                  key={i}
                  style={{
                    borderTop: "1px solid #27272a",
                    margin: "8px 0",
                  }} /* 👉 Dark gray border */
                />
              );
            }
            return (
              <NavLink
                key={item.path}
                to={item.path}
                end
                onClick={() => setMobileOpen(false)}
                style={({ isActive }) => ({
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "9px 16px",
                  color: isActive ? "#ffffff" : "#a1a1aa",
                  background: isActive ? "#27272a" : "transparent",
                  textDecoration: "none",
                  fontSize: 13,
                  fontWeight: isActive ? 600 : 500,
                  whiteSpace: "nowrap",
                  borderLeft: isActive
                    ? "3px solid #ffffff"
                    : "3px solid transparent",
                  transition: "all .15s",
                })}
              >
                <span style={{ fontSize: 16 }}>{item.icon}</span>
                {open && item.label}
              </NavLink>
            );
          })}
        </nav>

        {/* Toggle — desktop collapse/expand only, hidden on mobile via CSS */}
        <button
          className="wisdom-sidebar-collapse-toggle"
          onClick={() => setOpen((o) => !o)}
          style={{
            background:
              "#18181b" /* 👉 Slightly lighter black for the button */,
            border: "none",
            borderTop: "1px solid #27272a",
            color: "#a1a1aa",
            padding: "14px 12px",
            cursor: "pointer",
            textAlign: "center",
            transition: "color 0.2s",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "#ffffff")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "#a1a1aa")}
        >
          {open ? "◀" : "▶"}
        </button>
      </aside>

      {/* ── Main Area ────────────────────────────────────────────────────── */}
      <div
        className="wisdom-admin-main"
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          background:
            "#f4f4f5" /* 👉 Clean, neutral light gray background instead of baby blue */,
          minWidth: 0,
        }}
      >
        {/* Topbar */}
        <header
          className="wisdom-admin-topbar"
          style={{
            background: "#ffffff",
            borderBottom: "1px solid #e4e4e7" /* 👉 Neutral border */,
            padding: "12px 24px",
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            gap: 16,
          }}
        >
          {/* Mobile-only hamburger — hidden on desktop via CSS */}
          <button
            type="button"
            className="wisdom-hamburger-btn"
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
          >
            ☰
          </button>

          <NotificationBell />

          <span
            className="wisdom-admin-user-badge"
            style={{ fontSize: 13, color: "#52525b", fontWeight: 500 }}
          >
            👤 {user?.name}{" "}
            <span
              style={{
                fontSize: 11,
                background: "#f4f4f5" /* 👉 Clean gray badge */,
                color: "#18181b" /* 👉 Almost black text */,
                padding: "3px 10px",
                borderRadius: 20,
                fontWeight: 600,
                letterSpacing: "0.02em",
                marginLeft: "4px",
              }}
            >
              {user?.role}
            </span>
          </span>
          <button
            onClick={handleLogout}
            style={{
              background:
                "#18181b" /* 👉 Sleek black logout button instead of bright red */,
              color: "#ffffff",
              border: "none",
              padding: "7px 18px",
              borderRadius: 6,
              cursor: "pointer",
              fontSize: 12,
              fontWeight: 600,
              transition: "background 0.2s",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "#3f3f46")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "#18181b")}
          >
            Logout
          </button>
        </header>

        {/* Page Content */}
        <main style={{ flex: 1, padding: 24, overflowY: "auto" }}>
          <Outlet />
        </main>
      </div>
      {showLogoutModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.6)",
            backdropFilter: "blur(4px)",
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              background: "#0a0a0a",
              width: "min(360px, 90vw)",
              padding: 24,
              borderRadius: 16,
              boxShadow: "0 20px 40px rgba(0,0,0,0.2)",
              border: "1px solid #27272a",
              fontFamily: "Inter, sans-serif",
            }}
          >
            <h2
              style={{
                marginTop: 0,
                color: "#ffffff",
                fontWeight: 800,
                fontSize: 18,
                letterSpacing: "-0.01em",
                marginBottom: 8,
              }}
            >
              Sign out
            </h2>
            <p
              style={{
                fontSize: 13,
                color: "#a1a1aa",
                marginBottom: 24,
                lineHeight: 1.5,
              }}
            >
              Are you sure you want to log out of your account? You will need to
              sign back in to access the admin portal.
            </p>

            <div
              style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}
            >
              <button
                onClick={() => setShowLogoutModal(false)}
                style={{
                  padding: "9px 16px",
                  background: "transparent",
                  border: "1px solid #3f3f46",
                  color: "#e5e7eb",
                  borderRadius: 8,
                  cursor: "pointer",
                  fontSize: 13,
                  fontWeight: 600,
                  transition: "background 0.2s",
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.background = "#27272a")
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.background = "transparent")
                }
              >
                Cancel
              </button>
              <button
                onClick={confirmLogout}
                style={{
                  padding: "9px 16px",
                  background: "#ffffff",
                  color: "#0a0a0a",
                  border: "none",
                  borderRadius: 8,
                  cursor: "pointer",
                  fontWeight: 700,
                  fontSize: 13,
                  transition: "opacity 0.2s",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.8")}
                onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
              >
                Yes, log out
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
