// src/pages/website/StaticPagesPage.jsx – Static Page Content (About Us, Contact, FAQ)
import React, { useEffect, useState } from "react";
import api from "../../services/api";
import toast from "react-hot-toast";

const PAGE_META = {
  about_us: {
    label: "About Us",
    icon: "🏢",
    hint: "Tell customers about Spiral Wood Services — history, mission, and what makes you unique.",
    preview: "Shown on the /about page of the customer website.",
  },
  contact: {
    label: "Contact Us",
    icon: "📞",
    hint: "Provide contact details, business hours, and how customers can reach you.",
    preview: "Shown on the /contact page of the customer website.",
  },
  faq: {
    label: "FAQ Intro",
    icon: "❓",
    hint: "Introductory text shown above the FAQ list. Individual Q&As are managed in the FAQ section.",
    preview: "Shown at the top of the /faq page.",
  },
};

export default function StaticPagesPage() {
  const [pages, setPages] = useState({}); // slug → page object
  const [active, setActive] = useState("about_us");
  const [form, setForm] = useState({
    title: "",
    content: "",
    is_visible: true,
  });
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showPrev, setShowPrev] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/website/pages");
      const map = {};
      data.forEach((p) => {
        map[p.slug] = p;
      });
      setPages(map);
      // Load first tab
      const first = map["about_us"];
      if (first)
        setForm({
          title: first.title,
          content: first.content,
          is_visible: !!first.is_visible,
        });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  // Switch tabs – warn about unsaved changes
  const switchTab = (slug) => {
    if (dirty && !window.confirm("You have unsaved changes. Discard them?"))
      return;
    setActive(slug);
    const p = pages[slug];
    setForm(
      p
        ? { title: p.title, content: p.content, is_visible: !!p.is_visible }
        : { title: "", content: "", is_visible: true },
    );
    setDirty(false);
    setShowPrev(false);
  };

  const setF = (k, v) => {
    setForm((f) => ({ ...f, [k]: v }));
    setDirty(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.put(`/website/pages/${active}`, form);
      toast.success(`${PAGE_META[active]?.label} page saved.`);
      // Update local cache
      setPages((p) => ({ ...p, [active]: { ...p[active], ...form } }));
      setDirty(false);
    } finally {
      setSaving(false);
    }
  };

  const meta = PAGE_META[active];

  if (loading) return <div style={center}>Loading pages...</div>;

  return (
    <div>
      {/* ── Header ─────────────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: 20,
          flexWrap: "wrap",
          gap: 16,
        }}
      >
        <div>
          <h1 style={pageTitle}>Page Content</h1>
          <p style={{ fontSize: 13, color: "#52525b", margin: "4px 0 0" }}>
            Edit the content of static pages shown on the customer website.
          </p>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button
            onClick={() => setShowPrev((p) => !p)}
            style={{
              ...btnGhost,
              background: showPrev ? "#18181b" : "#f4f4f5",
              color: showPrev ? "#ffffff" : "#18181b",
              border: `1px solid ${showPrev ? "#18181b" : "#e4e4e7"}`,
            }}
          >
            {showPrev ? "📝 Edit Mode" : "👁 Preview"}
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !dirty}
            style={{
              ...btnPrimary,
              opacity: !dirty ? 0.5 : 1,
              cursor: !dirty ? "not-allowed" : "pointer",
            }}
          >
            {saving ? "Saving..." : dirty ? "💾 Save Page" : "✓ Saved"}
          </button>
        </div>
      </div>

      {dirty && (
        <div
          style={{
            background: "#fefce8",
            border: "1px solid #fde047",
            borderRadius: 12,
            padding: "12px 16px",
            marginBottom: 20,
            fontSize: 13,
            fontWeight: 600,
            color: "#a16207",
          }}
        >
          ⚠️ You have unsaved changes on the <strong>{meta?.label}</strong>{" "}
          page.
        </div>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(220px, 1fr) 3.5fr",
          gap: 20,
        }}
      >
        {/* ── Page Selector ──────────────────────────────────────── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {Object.entries(PAGE_META).map(([slug, m]) => {
            const page = pages[slug];
            const isActive = slug === active;
            return (
              <button
                key={slug}
                onClick={() => switchTab(slug)}
                style={{
                  padding: "16px",
                  border: "1px solid",
                  borderColor: isActive ? "#18181b" : "#e4e4e7",
                  borderRadius: 12,
                  cursor: "pointer",
                  textAlign: "left",
                  background: isActive ? "#fafafa" : "#ffffff",
                  color: isActive ? "#0a0a0a" : "#52525b",
                  boxShadow: isActive ? "none" : "0 1px 2px rgba(0,0,0,.02)",
                  borderLeft: isActive
                    ? "4px solid #18181b"
                    : "4px solid transparent",
                  transition: "all 0.2s",
                }}
              >
                <div style={{ fontSize: 24, marginBottom: 6 }}>{m.icon}</div>
                <div
                  style={{
                    fontWeight: 800,
                    fontSize: 13,
                    letterSpacing: "0.01em",
                  }}
                >
                  {m.label}
                </div>
                <div
                  style={{
                    fontSize: 11,
                    marginTop: 4,
                    fontWeight: 600,
                    color: "#71717a",
                  }}
                >
                  {page?.is_visible ? "👁 Visible" : "🙈 Hidden"}
                </div>
              </button>
            );
          })}
        </div>

        {/* ── Editor / Preview ───────────────────────────────────── */}
        <div style={card}>
          {/* Card header */}
          <div
            style={{
              padding: "20px 24px",
              borderBottom: "1px solid #e4e4e7",
              background: "#fafafa",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: 16,
            }}
          >
            <div>
              <h3
                style={{
                  margin: 0,
                  fontSize: 16,
                  fontWeight: 800,
                  color: "#0a0a0a",
                  letterSpacing: "-0.01em",
                }}
              >
                {meta?.icon} {meta?.label}
              </h3>
              <p
                style={{
                  margin: "4px 0 0",
                  fontSize: 12,
                  color: "#71717a",
                  fontWeight: 500,
                }}
              >
                {meta?.preview}
              </p>
            </div>
            {/* Visibility toggle */}
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                cursor: "pointer",
              }}
            >
              <span style={{ fontSize: 12, color: "#52525b", fontWeight: 700 }}>
                Visible on site
              </span>
              <div
                onClick={() => setF("is_visible", !form.is_visible)}
                style={{
                  width: 44,
                  height: 24,
                  borderRadius: 12,
                  cursor: "pointer",
                  background: form.is_visible ? "#18181b" : "#d4d4d8",
                  position: "relative",
                  transition: "background .2s",
                  flexShrink: 0,
                }}
              >
                <div
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: "50%",
                    background: "#fff",
                    position: "absolute",
                    top: 3,
                    left: form.is_visible ? 23 : 3,
                    transition: "left .2s",
                    boxShadow: "0 1px 3px rgba(0,0,0,.2)",
                  }}
                />
              </div>
            </label>
          </div>

          <div style={{ padding: 24 }}>
            {!showPrev ? (
              /* ── Edit mode ────────────────────────────────────── */
              <>
                <div style={{ marginBottom: 20 }}>
                  <label style={labelSm}>Page Title</label>
                  <input
                    value={form.title || ""}
                    onChange={(e) => setF("title", e.target.value)}
                    style={inputFull}
                    placeholder={`${meta?.label} page title`}
                  />
                </div>
                <div>
                  <label style={labelSm}>
                    Page Content
                    <span
                      style={{
                        fontWeight: 500,
                        color: "#71717a",
                        marginLeft: 8,
                        fontSize: 11,
                      }}
                    >
                      Supports plain text. Use double line breaks for
                      paragraphs.
                    </span>
                  </label>
                  <textarea
                    value={form.content || ""}
                    onChange={(e) => setF("content", e.target.value)}
                    rows={20}
                    style={{
                      ...inputFull,
                      resize: "vertical",
                      lineHeight: 1.6,
                      fontFamily: "inherit",
                    }}
                    placeholder={`Write the content for the ${meta?.label} page here...`}
                  />
                  <p
                    style={{
                      fontSize: 11,
                      color: "#a1a1aa",
                      marginTop: 8,
                      fontWeight: 600,
                    }}
                  >
                    {(form.content || "").length} characters &nbsp;·&nbsp;{" "}
                    {(form.content || "").split("\n").filter(Boolean).length}{" "}
                    lines
                  </p>
                </div>
              </>
            ) : (
              /* ── Preview mode ─────────────────────────────────── */
              <div
                style={{
                  background: "#fafafa",
                  borderRadius: 12,
                  border: "1px solid #e4e4e7",
                  padding: 32,
                  minHeight: 400,
                }}
              >
                <div
                  style={{
                    marginBottom: 12,
                    fontSize: 10,
                    color: "#71717a",
                    textTransform: "uppercase",
                    letterSpacing: "1px",
                    fontWeight: 800,
                  }}
                >
                  Preview — {meta?.label} Page
                </div>
                <h2
                  style={{
                    fontSize: 24,
                    fontWeight: 800,
                    color: "#0a0a0a",
                    margin: "0 0 20px",
                    letterSpacing: "-0.02em",
                  }}
                >
                  {form.title || meta?.label}
                </h2>
                <div
                  style={{
                    fontSize: 14,
                    color: "#18181b",
                    lineHeight: 1.7,
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {form.content || (
                    <span
                      style={{
                        color: "#a1a1aa",
                        fontStyle: "italic",
                        fontWeight: 500,
                      }}
                    >
                      No content yet.
                    </span>
                  )}
                </div>
                {!form.is_visible && (
                  <div
                    style={{
                      marginTop: 32,
                      padding: "12px 16px",
                      background: "#fef2f2",
                      border: "1px solid #fecaca",
                      borderRadius: 10,
                      fontSize: 13,
                      fontWeight: 600,
                      color: "#991b1b",
                    }}
                  >
                    ⚠️ This page is currently <strong>hidden</strong> from the
                    website.
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
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
  borderRadius: 16,
  border: "1px solid #e4e4e7",
  boxShadow: "0 1px 2px rgba(0,0,0,.02)",
  overflow: "hidden",
};
const center = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  height: 300,
  color: "#71717a",
  fontWeight: 600,
  fontSize: 14,
};
const labelSm = {
  fontSize: 12,
  fontWeight: 800,
  color: "#18181b",
  display: "block",
  marginBottom: 8,
};
const inputFull = {
  width: "100%",
  padding: "12px 14px",
  border: "1px solid #e4e4e7",
  borderRadius: 8,
  fontSize: 13,
  color: "#18181b",
  boxSizing: "border-box",
  outline: "none",
};
const btnPrimary = {
  padding: "10px 20px",
  background: "#18181b",
  color: "#fff",
  border: "1px solid #18181b",
  borderRadius: 8,
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 700,
  transition: "background 0.2s",
};
const btnGhost = {
  padding: "10px 20px",
  background: "#f4f4f5",
  color: "#18181b",
  border: "1px solid #e4e4e7",
  borderRadius: 8,
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 700,
  transition: "all 0.2s",
};