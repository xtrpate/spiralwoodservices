// src/components/CustomerNotificationBell.jsx
import React, { useState, useEffect, useCallback } from "react";
import { Bell } from "lucide-react";
import api from "../services/api";

export default function CustomerNotificationBell() {
  const [notifications, setNotifications] = useState([]);
  const [open, setOpen] = useState(false);

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  const fetchNotifications = useCallback(async () => {
    try {
      const { data } = await api.get("/customer/notifications");
      setNotifications(data);
    } catch {
      // A failed notification fetch must never break the surrounding page.
    }
  }, []);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  useEffect(() => {
    const iv = setInterval(fetchNotifications, 30000);
    return () => clearInterval(iv);
  }, [fetchNotifications]);

  const markAllRead = async () => {
    try {
      await api.patch("/customer/notifications/read-all");
      setNotifications((p) => p.map((n) => ({ ...n, is_read: 1 })));
    } catch {}
  };

  const markOneRead = async (id) => {
    try {
      await api.patch(`/customer/notifications/${id}/read`);
      setNotifications((p) =>
        p.map((n) => (n.id === id ? { ...n, is_read: 1 } : n)),
      );
    } catch {}
  };

  return (
    <div style={{ position: "relative" }}>
      <button
        type="button"
        className="cust-icon-btn"
        onClick={() => setOpen((v) => !v)}
        aria-label="Notifications"
        title="Notifications"
      >
        <Bell size={21} />
        {unreadCount > 0 && (
          <span className="cust-count-badge">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <div
            style={{ position: "fixed", inset: 0, zIndex: 999 }}
            onClick={() => setOpen(false)}
          />
          <div
            style={{
              position: "absolute",
              top: "calc(100% + 8px)",
              right: 0,
              width: 340,
              maxWidth: "90vw",
              maxHeight: "70vh",
              overflowY: "auto",
              background: "#ffffff",
              borderRadius: 12,
              border: "1px solid #e4e4e7",
              boxShadow: "0 20px 50px rgba(0,0,0,0.15)",
              zIndex: 1000,
              padding: 16,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 12,
              }}
            >
              <div style={{ fontSize: 15, fontWeight: 700, color: "#18181b" }}>
                Notifications
              </div>
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={markAllRead}
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: "#3f3f46",
                    background: "#f4f4f5",
                    border: "1px solid #e4e4e7",
                    borderRadius: 8,
                    padding: "6px 10px",
                    cursor: "pointer",
                  }}
                >
                  Mark all read
                </button>
              )}
            </div>

            {notifications.length === 0 ? (
              <div
                style={{
                  textAlign: "center",
                  color: "#71717a",
                  padding: "24px 8px",
                  fontSize: 13,
                }}
              >
                No notifications yet.
              </div>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.id}
                  onClick={() => {
                    if (!n.is_read) markOneRead(n.id);
                  }}
                  style={{
                    padding: "10px 12px",
                    borderRadius: 8,
                    marginBottom: 8,
                    cursor: "pointer",
                    background: n.is_read ? "#ffffff" : "#fafafa",
                    border: `1px solid ${n.is_read ? "#e4e4e7" : "#d4d4d8"}`,
                  }}
                >
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 700,
                      color: "#18181b",
                      marginBottom: 4,
                    }}
                  >
                    {n.title}
                  </div>
                  <div style={{ fontSize: 13, color: "#52525b" }}>
                    {n.message}
                  </div>
                </div>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}