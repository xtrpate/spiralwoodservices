// src/pages/backup/BackupPage.jsx – Database Backup Management (Admin)
import React, { useEffect, useState } from "react";
import api from "../../services/api";
import toast from "react-hot-toast";

export default function BackupPage() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [triggering, setTrigger] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/backup/logs");
      setLogs(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const downloadBackup = async (log) => {
    try {
      const res = await api.get(log.file_url, { responseType: "blob" });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement("a");
      a.href = url;
      a.download = log.filename || "backup.sql";
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      toast.error("Download failed. Please try again.");
    }
  };

  const triggerBackup = async () => {
    if (!window.confirm("Run a manual database backup now?")) return;
    setTrigger(true);
    try {
      const { data } = await api.post("/backup/trigger");
      toast.success(
        `Backup completed! File: ${data.file} (${data.size_kb} KB)`,
      );
      load();
    } catch (err) {
      const msg =
        err.response?.data?.message || "Backup failed. Check server logs.";
      toast.error(msg, { duration: 6000 });
    } finally {
      setTrigger(false);
    }
  };

  const successCount = logs.filter((l) => l.status === "success").length;
  const failCount = logs.filter((l) => l.status === "failed").length;
  const lastSuccess = logs.find((l) => l.status === "success");

  return (
    <div>
      {/* ── Header ─────────────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: 20,
        }}
      >
        <div>
          <h1 style={pageTitle}>Database Backup</h1>
          <p style={{ fontSize: 13, color: "#52525b", margin: "4px 0 0" }}>
            Automated backups run twice daily (12:00 AM and 12:00 PM). Trigger a
            manual backup anytime.
          </p>
        </div>
        <button
          onClick={triggerBackup}
          disabled={triggering}
          style={btnPrimary}
          onMouseEnter={(e) =>
            !triggering && (e.currentTarget.style.background = "#3f3f46")
          }
          onMouseLeave={(e) =>
            !triggering && (e.currentTarget.style.background = "#18181b")
          }
        >
          {triggering ? "⏳ Running Backup..." : "🗄️ Run Backup Now"}
        </button>
      </div>

      {/* ── Summary Cards ───────────────────────────────────────── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 14,
          marginBottom: 24,
        }}
      >
        <StatCard
          label="Total Backups"
          value={logs.length}
          color="#18181b"
          icon="🗄️"
        />
        <StatCard
          label="Successful"
          value={successCount}
          color="#18181b"
          icon="✅"
        />
        <StatCard
          label="Failed"
          value={failCount}
          color="#dc2626"
          icon="❌"
          alert={failCount > 0}
        />
        <StatCard
          label="Last Successful"
          value={
            lastSuccess
              ? new Date(lastSuccess.created_at).toLocaleDateString("en-PH")
              : "None"
          }
          color="#18181b"
          icon="🕐"
        />
      </div>

      {/* ── Schedule Info ────────────────────────────────────────── */}
      <div
        style={{
          background: "#f4f4f5",
          border: "1px solid #e4e4e7",
          borderRadius: 10,
          padding: "14px 18px",
          marginBottom: 20,
          fontSize: 13,
          color: "#18181b",
        }}
      >
        <strong>📅 Automated Schedule:</strong>&nbsp; Backups are automatically
        triggered at <strong>12:00 AM</strong> and <strong>12:00 PM</strong>{" "}
        daily via server cron job. Files are saved to the{" "}
        <code
          style={{
            background: "#e4e4e7",
            padding: "2px 6px",
            borderRadius: 4,
            fontWeight: 600,
          }}
        >
          /backups
        </code>{" "}
        directory on the server.
      </div>

      {/* ── Logs Table ───────────────────────────────────────────── */}
      <div style={card}>
        <div
          style={{
            padding: "14px 20px",
            borderBottom: "1px solid #e4e4e7",
            background: "#fafafa",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <h3
            style={{
              margin: 0,
              fontSize: 14,
              fontWeight: 800,
              color: "#0a0a0a",
            }}
          >
            Backup History
          </h3>
          <span style={{ fontSize: 12, color: "#71717a", fontWeight: 600 }}>
            {logs.length} records
          </span>
        </div>
        <table
          style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}
        >
          <thead>
            <tr style={{ background: "#ffffff" }}>
              {[
                "#",
                "Type",
                "Filename",
                "File Size",
                "Status",
                "Triggered By",
                "Date & Time",
                "Download",
              ].map((h) => (
                <th key={h} style={th}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} style={centerCell}>
                  Loading backup logs...
                </td>
              </tr>
            ) : logs.length === 0 ? (
              <tr>
                <td colSpan={8} style={centerCell}>
                  No backup records yet. Run a backup to get started.
                </td>
              </tr>
            ) : (
              logs.map((log, i) => {
                const isSuccess = log.status === "success";
                const sizeMB = log.file_size
                  ? log.file_size >= 1024
                    ? (log.file_size / 1024).toFixed(2) + " MB"
                    : log.file_size + " KB"
                  : "—";
                return (
                  <tr
                    key={log.id}
                    style={{ borderBottom: "1px solid #f4f4f5" }}
                  >
                    <td style={{ ...td, color: "#a1a1aa", fontWeight: 600 }}>
                      {i + 1}
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
                        }}
                      >
                        {log.type === "auto" ? "⏰ Auto" : "🖐 Manual"}
                      </span>
                    </td>
                    <td
                      style={{
                        ...td,
                        fontFamily: "monospace",
                        fontSize: 12,
                        color: "#52525b",
                      }}
                    >
                      {log.filename || "—"}
                    </td>
                    <td style={td}>{sizeMB}</td>
                    <td style={td}>
                      <span
                        style={{
                          background: isSuccess ? "#f4f4f5" : "#fef2f2",
                          color: isSuccess ? "#18181b" : "#991b1b",
                          border: `1px solid ${isSuccess ? "#e4e4e7" : "#fecaca"}`,
                          padding: "2px 10px",
                          borderRadius: 12,
                          fontSize: 11,
                          fontWeight: 600,
                        }}
                      >
                        {isSuccess ? "✅ Success" : "❌ Failed"}
                      </span>
                      {!isSuccess && log.error_message && (
                        <div
                          style={{
                            fontSize: 11,
                            color: "#dc2626",
                            marginTop: 4,
                          }}
                        >
                          {log.error_message.slice(0, 60)}
                        </div>
                      )}
                    </td>
                    <td style={{ ...td, fontWeight: 500 }}>
                      {log.triggered_by || "System"}
                    </td>
                    <td style={{ ...td, fontSize: 12, color: "#71717a" }}>
                      {new Date(log.created_at).toLocaleString("en-PH")}
                    </td>
                    <td style={td}>
                      {isSuccess && log.file_url ? (
                        <button
                          type="button"
                          onClick={() => downloadBackup(log)}
                          style={dlBtn}
                          onMouseEnter={(e) =>
                            (e.currentTarget.style.background = "#3f3f46")
                          }
                          onMouseLeave={(e) =>
                            (e.currentTarget.style.background = "#18181b")
                          }
                        >
                          ⬇ Download
                        </button>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Stat Card ─────────────────────────────────────────────────────────────────
function StatCard({ label, value, color, icon, alert }) {
  return (
    <div
      style={{
        background: "#fff",
        borderRadius: 12,
        padding: "18px 20px",
        border: "1px solid #e4e4e7",
        borderLeft: `4px solid ${alert ? "#ef4444" : color}`,
        boxShadow: "0 1px 2px rgba(0,0,0,.02)",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
        }}
      >
        <div>
          <p
            style={{
              fontSize: 10,
              fontWeight: 800,
              color: "#71717a",
              margin: 0,
              textTransform: "uppercase",
              letterSpacing: 1.2,
            }}
          >
            {label}
          </p>
          <p
            style={{
              fontSize: 24,
              fontWeight: 800,
              color: alert ? "#ef4444" : "#0a0a0a",
              margin: "6px 0 0",
              letterSpacing: "-0.02em",
            }}
          >
            {value}
          </p>
        </div>
        <span style={{ fontSize: 22 }}>{icon}</span>
      </div>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const pageTitle = {
  fontSize: 24,
  fontWeight: 800,
  color: "#0a0a0a",
  margin: 0,
  letterSpacing: "-0.02em",
};
const card = {
  background: "#fff",
  borderRadius: 12,
  border: "1px solid #e4e4e7",
  overflow: "hidden",
  boxShadow: "0 1px 2px rgba(0,0,0,.02)",
};
const th = {
  textAlign: "left",
  padding: "12px 16px",
  fontSize: 10,
  fontWeight: 800,
  color: "#71717a",
  textTransform: "uppercase",
  letterSpacing: 1,
};
const td = { padding: "14px 16px", color: "#18181b", verticalAlign: "middle" };
const centerCell = { textAlign: "center", padding: 40, color: "#a1a1aa" };
const btnPrimary = {
  padding: "9px 22px",
  background: "#18181b",
  color: "#fff",
  border: "none",
  borderRadius: 6,
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 600,
  transition: "background 0.2s",
};
const dlBtn = {
  padding: "6px 14px",
  background: "#18181b",
  color: "#ffffff",
  border: "none",
  borderRadius: 6,
  cursor: "pointer",
  fontSize: 11,
  fontWeight: 700,
  textDecoration: "none",
  display: "inline-block",
  transition: "background 0.2s",
};