import { useState, useEffect } from "react";
import api, { buildAssetUrl } from "../../services/api";
import { Search, FileText, Eye, X } from "lucide-react";

export default function BlueprintView() {
  const [blueprints, setBlueprints] = useState([]);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchBlueprints = async (q = "") => {
    setLoading(true);
    try {
      const res = await api.get(
        `/pos/blueprints${q ? `?q=${encodeURIComponent(q)}` : ""}`,
      );
      setBlueprints(res.data);
    } catch {}
    setLoading(false);
  };

  useEffect(() => {
    fetchBlueprints();
  }, []);

  useEffect(() => {
    const t = setTimeout(() => fetchBlueprints(query), 400);
    return () => clearTimeout(t);
  }, [query]);

  const openBlueprint = async (id) => {
    const res = await api.get(`/pos/blueprints/${id}`);
    setSelected(res.data);
  };

  // UI UPDATE: Converted to return monochrome inline styles instead of CSS classes
  const getStageStyle = (s) => {
    const stage = String(s || "").toLowerCase();
    switch (stage) {
      case "design":
      case "estimation":
      case "approval":
        return {
          background: "#ffffff",
          color: "#52525b",
          border: "1px solid #d4d4d8",
        };
      case "production":
      case "delivery":
        return {
          background: "#f4f4f5",
          color: "#18181b",
          border: "1px solid #e4e4e7",
        };
      case "completed":
        return {
          background: "#0a0a0a",
          color: "#ffffff",
          border: "1px solid #0a0a0a",
        };
      case "archived":
      default:
        return {
          background: "#fafafa",
          color: "#71717a",
          border: "1px solid #e4e4e7",
        };
    }
  };

  return (
    <div style={{ fontFamily: "'Inter', sans-serif" }}>
      <div style={{ marginBottom: 24 }}>
        <h1
          style={{
            margin: 0,
            fontSize: 24,
            fontWeight: 800,
            color: "#0a0a0a",
            letterSpacing: "-0.02em",
          }}
        >
          Blueprint Management
        </h1>
        <p
          style={{
            margin: "6px 0 0",
            fontSize: 13,
            color: "#52525b",
            lineHeight: 1.5,
          }}
        >
          View blueprints assigned to your projects (read-only)
        </p>
      </div>

      <div style={{ position: "relative", marginBottom: 24 }}>
        <Search
          size={18}
          style={{
            position: "absolute",
            left: 14,
            top: "50%",
            transform: "translateY(-50%)",
            color: "#71717a",
          }}
        />
        <input
          type="text"
          placeholder="Search blueprints by title..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{
            width: "100%",
            padding: "12px 14px 12px 42px",
            border: "1px solid #e4e4e7",
            borderRadius: 8,
            fontSize: 13,
            color: "#18181b",
            boxSizing: "border-box",
            outline: "none",
            background: "#fff",
          }}
        />
      </div>

      {loading ? (
        <p
          style={{
            color: "#71717a",
            textAlign: "center",
            padding: 40,
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          Loading blueprints...
        </p>
      ) : blueprints.length === 0 ? (
        <div
          style={{
            background: "#fff",
            border: "1px dashed #d4d4d8",
            borderRadius: 12,
            textAlign: "center",
            padding: 40,
            color: "#71717a",
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          No blueprints found.
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
            gap: 16,
          }}
        >
          {blueprints.map((bp) => (
            <div
              key={bp.id}
              style={{
                background: "#fff",
                border: "1px solid #e4e4e7",
                borderRadius: 12,
                padding: 16,
                cursor: "pointer",
                transition: "all 0.2s",
                boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
              }}
              onClick={() => openBlueprint(bp.id)}
              onMouseEnter={(e) => {
                e.currentTarget.style.boxShadow =
                  "0 10px 25px rgba(0,0,0,0.05)";
                e.currentTarget.style.borderColor = "#d4d4d8";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.boxShadow = "0 1px 2px rgba(0,0,0,0.02)";
                e.currentTarget.style.borderColor = "#e4e4e7";
              }}
            >
              {bp.thumbnail_url ? (
                <img
                  src={buildAssetUrl(bp.thumbnail_url)}
                  alt={bp.title}
                  style={{
                    width: "100%",
                    height: 140,
                    objectFit: "cover",
                    borderRadius: 8,
                    marginBottom: 16,
                    border: "1px solid #e4e4e7",
                  }}
                />
              ) : (
                <div
                  style={{
                    width: "100%",
                    height: 140,
                    background: "#f4f4f5",
                    border: "1px solid #e4e4e7",
                    borderRadius: 8,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    marginBottom: 16,
                    fontSize: 36,
                  }}
                >
                  📐
                </div>
              )}
              <div
                style={{
                  fontWeight: 800,
                  fontSize: 15,
                  color: "#0a0a0a",
                  marginBottom: 4,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {bp.title}
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: "#52525b",
                  marginBottom: 12,
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                  lineHeight: 1.5,
                  minHeight: 36,
                }}
              >
                {bp.description || "No description provided."}
              </div>
              <div
                style={{
                  display: "flex",
                  gap: 6,
                  flexWrap: "wrap",
                  alignItems: "center",
                }}
              >
                <span
                  style={{
                    ...getStageStyle(bp.stage),
                    padding: "4px 10px",
                    borderRadius: 999,
                    fontSize: 10,
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.5px",
                  }}
                >
                  {bp.stage}
                </span>
                {bp.is_template && (
                  <span
                    style={{
                      background: "#18181b",
                      color: "#fff",
                      border: "1px solid #18181b",
                      padding: "4px 10px",
                      borderRadius: 999,
                      fontSize: 10,
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: "0.5px",
                    }}
                  >
                    Template
                  </span>
                )}
                {bp.is_gallery && (
                  <span
                    style={{
                      background: "#f4f4f5",
                      color: "#18181b",
                      border: "1px solid #e4e4e7",
                      padding: "4px 10px",
                      borderRadius: 999,
                      fontSize: 10,
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: "0.5px",
                    }}
                  >
                    Gallery
                  </span>
                )}
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: "#71717a",
                  marginTop: 12,
                  fontWeight: 500,
                }}
              >
                By {bp.creator_name} •{" "}
                {new Date(bp.created_at).toLocaleDateString("en-PH")}
              </div>
              <button
                style={{
                  marginTop: 16,
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  background: "#fafafa",
                  border: "1px solid #e4e4e7",
                  color: "#18181b",
                  padding: "8px 0",
                  borderRadius: 8,
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: "pointer",
                  transition: "background 0.2s",
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.background = "#e4e4e7")
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.background = "#fafafa")
                }
              >
                <Eye size={14} /> View Blueprint
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Blueprint Detail Modal */}
      {selected && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.6)",
            zIndex: 200,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
          }}
        >
          <div
            style={{
              background: "#fff",
              borderRadius: 16,
              border: "1px solid #e4e4e7",
              width: "100%",
              maxWidth: 680,
              maxHeight: "85vh",
              overflowY: "auto",
              padding: 32,
              boxShadow: "0 25px 60px rgba(0,0,0,0.15)",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                marginBottom: 24,
              }}
            >
              <div>
                <h2
                  style={{
                    fontWeight: 800,
                    fontSize: 22,
                    color: "#0a0a0a",
                    marginBottom: 8,
                    letterSpacing: "-0.01em",
                  }}
                >
                  {selected.title}
                </h2>
                <div style={{ display: "flex", gap: 6 }}>
                  <span
                    style={{
                      ...getStageStyle(selected.stage),
                      padding: "4px 10px",
                      borderRadius: 999,
                      fontSize: 10,
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: "0.5px",
                    }}
                  >
                    {selected.stage}
                  </span>
                  {selected.is_template && (
                    <span
                      style={{
                        background: "#18181b",
                        color: "#fff",
                        border: "1px solid #18181b",
                        padding: "4px 10px",
                        borderRadius: 999,
                        fontSize: 10,
                        fontWeight: 700,
                        textTransform: "uppercase",
                        letterSpacing: "0.5px",
                      }}
                    >
                      Template
                    </span>
                  )}
                </div>
              </div>
              <button
                style={{
                  background: "#f4f4f5",
                  border: "1px solid #e4e4e7",
                  color: "#52525b",
                  borderRadius: "50%",
                  width: 32,
                  height: 32,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  transition: "background 0.2s",
                }}
                onClick={() => setSelected(null)}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.background = "#e4e4e7")
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.background = "#f4f4f5")
                }
              >
                <X size={16} />
              </button>
            </div>

            {selected.thumbnail_url && (
              <img
                src={buildAssetUrl(selected.thumbnail_url)}
                alt=""
                style={{
                  width: "100%",
                  maxHeight: 300,
                  objectFit: "contain",
                  background: "#fafafa",
                  border: "1px solid #e4e4e7",
                  borderRadius: 12,
                  marginBottom: 24,
                  padding: 8,
                }}
              />
            )}

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 16,
                marginBottom: 24,
                background: "#fafafa",
                border: "1px solid #e4e4e7",
                borderRadius: 12,
                padding: 16,
              }}
            >
              {[
                ["Description", selected.description || "—"],
                ["Creator", selected.creator_name],
                ["Client", selected.client_name || "—"],
                ["Source", selected.source],
                [
                  "Created",
                  new Date(selected.created_at).toLocaleDateString("en-PH"),
                ],
                [
                  "Updated",
                  new Date(selected.updated_at).toLocaleDateString("en-PH"),
                ],
              ].map(([label, val]) => (
                <div key={label}>
                  <div
                    style={{
                      fontSize: 10,
                      color: "#71717a",
                      fontWeight: 800,
                      textTransform: "uppercase",
                      letterSpacing: "1px",
                      marginBottom: 4,
                    }}
                  >
                    {label}
                  </div>
                  <div
                    style={{ fontSize: 13, color: "#18181b", fontWeight: 500 }}
                  >
                    {val}
                  </div>
                </div>
              ))}
            </div>

            {selected.components && selected.components.length > 0 && (
              <>
                <h4
                  style={{
                    fontWeight: 800,
                    fontSize: 16,
                    color: "#0a0a0a",
                    marginBottom: 12,
                  }}
                >
                  Components ({selected.components.length})
                </h4>
                <div
                  style={{
                    border: "1px solid #e4e4e7",
                    borderRadius: 12,
                    overflow: "hidden",
                  }}
                >
                  <table
                    style={{
                      width: "100%",
                      borderCollapse: "collapse",
                      fontSize: 13,
                      textAlign: "left",
                    }}
                  >
                    <thead>
                      <tr
                        style={{
                          background: "#fafafa",
                          borderBottom: "1px solid #e4e4e7",
                        }}
                      >
                        {["Label", "Type", "W×H×D (mm)", "Wood", "Finish"].map(
                          (h) => (
                            <th
                              key={h}
                              style={{
                                padding: "12px 16px",
                                fontSize: 10,
                                fontWeight: 800,
                                color: "#71717a",
                                textTransform: "uppercase",
                                letterSpacing: "1px",
                              }}
                            >
                              {h}
                            </th>
                          ),
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {selected.components.map((c) => (
                        <tr
                          key={c.id}
                          style={{ borderBottom: "1px solid #f4f4f5" }}
                        >
                          <td
                            style={{
                              padding: "14px 16px",
                              color: "#18181b",
                              fontWeight: 600,
                            }}
                          >
                            {c.label || "—"}
                          </td>
                          <td
                            style={{ padding: "14px 16px", color: "#52525b" }}
                          >
                            {c.component_type || "—"}
                          </td>
                          <td
                            style={{ padding: "14px 16px", color: "#52525b" }}
                          >
                            {c.width_mm}×{c.height_mm}×{c.depth_mm}
                          </td>
                          <td
                            style={{ padding: "14px 16px", color: "#52525b" }}
                          >
                            {c.wood_type || "—"}
                          </td>
                          <td
                            style={{ padding: "14px 16px", color: "#52525b" }}
                          >
                            {c.finish_color || "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            <div
              style={{
                marginTop: 24,
                padding: "14px 16px",
                background: "#fafafa",
                border: "1px solid #e4e4e7",
                borderRadius: 10,
                fontSize: 12,
                color: "#52525b",
                fontWeight: 500,
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <span>📋</span> This is a read-only view. Contact admin to modify
              blueprints.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
