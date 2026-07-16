// src/components/NotificationBell.jsx
import React, { useState, useEffect, useCallback } from "react";
import toast from "react-hot-toast";
import api from "../services/api";

const S = {
  btn: {
    padding: "9px 18px",
    borderRadius: 8,
    border: "none",
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 700,
    transition: "background 0.2s",
  },
  btnGray: {
    background: "#f4f4f5",
    color: "#18181b",
    border: "1px solid #e4e4e7",
  },
  btnIcon: {
    width: 36,
    height: 36,
    borderRadius: 8,
    border: "1px solid #e4e4e7",
    background: "#f4f4f5",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 16,
    transition: "background 0.2s",
  },
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,.6)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1000,
    padding: 20,
  },
  modal: {
    background: "#fff",
    borderRadius: 16,
    width: 480,
    maxWidth: "100%",
    maxHeight: "90vh",
    overflowY: "auto",
    padding: 32,
    boxShadow: "0 25px 60px rgba(0,0,0,.15)",
    border: "1px solid #e4e4e7",
  },
  mTitle: {
    fontSize: 20,
    fontWeight: 800,
    color: "#0a0a0a",
    marginBottom: 24,
    letterSpacing: "-0.01em",
  },
  notifItem: (isRead) => ({
    padding: "14px 16px",
    borderRadius: 10,
    marginBottom: 10,
    cursor: "pointer",
    background: isRead ? "#ffffff" : "#fafafa",
    border: `1px solid ${isRead ? "#e4e4e7" : "#d4d4d8"}`,
    transition: "background 0.2s",
  }),
};

export default function NotificationBell({ compact = false }) {
  const [notifications, setNotifications] = useState([]);
  const [open, setOpen] = useState(false);

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  const fetchNotifications = useCallback(async () => {
    try {
      const { data } = await api.get("/tasks/notifications");
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
      await api.patch("/tasks/notifications/read-all");
      setNotifications((p) => p.map((n) => ({ ...n, is_read: 1 })));
      toast.success("All notifications cleared.");
    } catch {}
  };

  const markOneRead = async (id) => {
    try {
      await api.patch(`/tasks/notifications/${id}/read`);
      setNotifications((p) =>
        p.map((n) => (n.id === id ? { ...n, is_read: 1 } : n)),
      );
    } catch {}
  };

  return (
    <>
      <button
        style={
          compact
            ? { ...S.btnIcon, position: "relative" }
            : { ...S.btn, ...S.btnGray, position: "relative" }
        }
        onClick={() => setOpen(true)}
        aria-label={compact ? "Notifications" : undefined}
        title={compact ? "Notifications" : undefined}
      >
        {compact ? "🔔" : "🔔 Notifications"}
        {unreadCount > 0 && (
          <span
            style={{
              position: "absolute",
              top: -6,
              right: -6,
              background: "#dc2626",
              color: "#fff",
              borderRadius: "50%",
              width: 20,
              height: 20,
              fontSize: 10,
              fontWeight: 800,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              border: "2px solid #f4f4f5",
            }}
          >
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div style={S.overlay} onClick={() => setOpen(false)}>
          <div
            style={{ ...S.modal, width: 480 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 20,
              }}
            >
              <div style={{ ...S.mTitle, marginBottom: 0 }}>
                🔔 Notifications
              </div>
              {unreadCount > 0 && (
                <button
                  style={{
                    ...S.btn,
                    ...S.btnGray,
                    fontSize: 12,
                    padding: "6px 12px",
                  }}
                  onClick={markAllRead}
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
                  padding: 30,
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                No notifications yet.
              </div>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.id}
                  style={S.notifItem(!n.is_read)}
                  onClick={() => {
                    if (!n.is_read) markOneRead(n.id);
                  }}
                >
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 800,
                      color: "#18181b",
                      marginBottom: 4,
                    }}
                  >
                    {n.title}
                  </div>
                  <div
                    style={{
                      fontSize: 13,
                      color: "#52525b",
                      marginBottom: 8,
                      lineHeight: 1.5,
                    }}
                  >
                    {n.message}
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: "#71717a",
                      display: "flex",
                      justifyContent: "space-between",
                      fontWeight: 600,
                    }}
                  >
                    <span>
                      {new Date(n.created_at).toLocaleString("en-PH")}
                    </span>
                    {!n.is_read && (
                      <span style={{ color: "#0a0a0a", fontWeight: 800 }}>
                        ● Unread
                      </span>
                    )}
                  </div>
                </div>
              ))
            )}
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                marginTop: 16,
              }}
            >
              <button
                style={{ ...S.btn, ...S.btnGray }}
                onClick={() => setOpen(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
