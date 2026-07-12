// src/pages/blueprints/BlueprintsPage.jsx
import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import api, { buildAssetUrl } from "../../services/api";
import toast from "react-hot-toast";

const STAGE_COLORS = {
  design: ["#ffffff", "#52525b", "#d4d4d8"],
  estimation: ["#fafafa", "#18181b", "#e4e4e7"],
  approval: ["#f4f4f5", "#18181b", "#e4e4e7"],
  production: ["#18181b", "#ffffff", "#18181b"],
  delivery: ["#18181b", "#ffffff", "#18181b"],
  completed: ["#0a0a0a", "#ffffff", "#0a0a0a"],
  archived: ["#f4f4f5", "#71717a", "#e4e4e7"],
};

const TABS = ["my", "imports", "gallery", "archive"];
const ALLOWED_IMPORT_EXTENSIONS = ["pdf", "png", "jpg", "jpeg", "svg"];
const MAX_IMPORT_FILE_SIZE_MB = 15;

const CREATE_MODES = [
  { value: "scratch", label: "Scratch Design" },
  { value: "reference", label: "Reference Import" },
];

const DEFAULT_CREATE_FORM = {
  title: "",
  description: "",
  startMode: "scratch",
  is_template: false,
  is_gallery: false,
};

const EMPTY_REFERENCE_FILES = {
  front: null,
  back: null,
  left: null,
  right: null,
  top: null,
};

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-PH");
}

function getFileExtension(filename = "") {
  const parts = String(filename).split(".");
  return parts.length > 1 ? parts.pop().toLowerCase() : "";
}

function validateImportFile(file) {
  if (!file) {
    return "Please select a file.";
  }

  const ext = getFileExtension(file.name);
  if (!ALLOWED_IMPORT_EXTENSIONS.includes(ext)) {
    return "Only PDF, PNG, JPG, JPEG, and SVG blueprint files are allowed.";
  }

  const maxBytes = MAX_IMPORT_FILE_SIZE_MB * 1024 * 1024;
  if (file.size > maxBytes) {
    return `File size must not exceed ${MAX_IMPORT_FILE_SIZE_MB}MB.`;
  }

  return null;
}

function getBlueprintIcon(fileType) {
  const type = String(fileType || "").toLowerCase();

  if (type === "pdf") return "📄";
  if (type === "svg") return "🧩";
  if (["png", "jpg", "jpeg"].includes(type)) return "🖼️";

  return "🗺️";
}

function canEstimateAtStage(stage = "") {
  return ["design", "estimation", "approval"].includes(
    String(stage || "").toLowerCase(),
  );
}

function getDesignActionLabel(stage = "", isImported = false) {
  const normalizedStage = String(stage || "").toLowerCase();
  const isViewOnlyStage = ["production", "delivery", "completed"].includes(
    normalizedStage,
  );

  if (isImported) {
    return isViewOnlyStage ? "🧩 View Design" : "🧩 Open Design";
  }

  return isViewOnlyStage ? "👁 View Design" : "✏️ Design";
}

function getStageLabel(stage = "") {
  const normalized = String(stage || "").toLowerCase();

  if (normalized === "design") return "Design";
  if (normalized === "estimation") return "Estimation";
  if (normalized === "approval") return "Approval";
  if (normalized === "production") return "Production";
  if (normalized === "delivery") return "Delivery";
  if (normalized === "completed") return "Completed";
  if (normalized === "archived") return "Archived";

  return normalized || "Design";
}

export default function BlueprintsPage() {
  const navigate = useNavigate();

  const [tab, setTab] = useState("my");
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [importModal, setImportModal] = useState(false);
  const [importForm, setImportForm] = useState({ title: "", file: null });
  const [importing, setImporting] = useState(false);

  const [createModal, setCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState(DEFAULT_CREATE_FORM);
  const [creating, setCreating] = useState(false);

  const [deletingId, setDeletingId] = useState(null);
  const [restoringId, setRestoringId] = useState(null);
  const [archivingId, setArchivingId] = useState(null);

  const [deleteConfirmModal, setDeleteConfirmModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const [archiveConfirmModal, setArchiveConfirmModal] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState(null);

  const [imageErrors, setImageErrors] = useState({});
  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/blueprints", {
        params: { tab, search, limit: 20 },
      });

      setItems(Array.isArray(data?.rows) ? data.rows : []);
      setTotal(Number(data?.total) || 0);
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to load blueprints.");
    }
  }, [tab, search]);

  useEffect(() => {
    load();
  }, [load]);

  const openArchiveConfirm = (bp) => {
    setArchiveTarget(bp);
    setArchiveConfirmModal(true);
  };

  const closeArchiveConfirm = () => {
    if (archivingId) return;
    setArchiveConfirmModal(false);
    setArchiveTarget(null);
  };

  const confirmArchive = async () => {
    if (!archiveTarget?.id) return;

    try {
      setArchivingId(archiveTarget.id);
      await api.delete(`/blueprints/${archiveTarget.id}`);
      toast.success("Blueprint archived.");
      setArchiveConfirmModal(false);
      setArchiveTarget(null);
      load();
    } catch (err) {
      toast.error(
        err?.response?.data?.message || "Failed to archive blueprint.",
      );
    } finally {
      setArchivingId(null);
    }
  };

  const updateCreateForm = (key, value) => {
    setCreateForm((prev) => ({ ...prev, [key]: value }));
  };

  const closeCreateModal = () => {
    if (creating) return;
    setCreateModal(false);
    setCreateForm(DEFAULT_CREATE_FORM);
  };

  const handleRestore = async (id) => {
    try {
      setRestoringId(id);
      await api.patch(`/blueprints/${id}/restore`);
      toast.success("Blueprint restored.");
      load();
    } catch (err) {
      toast.error(
        err?.response?.data?.message || "Failed to restore blueprint.",
      );
    } finally {
      setRestoringId(null);
    }
  };

  const openDeleteConfirm = (bp) => {
    setDeleteTarget(bp);
    setDeleteConfirmModal(true);
  };

  const closeDeleteConfirm = () => {
    if (deletingId) return;
    setDeleteConfirmModal(false);
    setDeleteTarget(null);
  };

  const confirmPermanentDelete = async () => {
    if (!deleteTarget?.id) return;

    try {
      setDeletingId(deleteTarget.id);
      await api.delete(`/blueprints/${deleteTarget.id}/permanent`);
      toast.success("Blueprint deleted permanently.");
      setDeleteConfirmModal(false);
      setDeleteTarget(null);
      load();
    } catch (err) {
      // api.js's shared interceptor already toasts status 400 (generic
      // message block), 403, 422, 500, and network/no-response errors. It
      // intentionally does NOT toast 401 (session cleanup/redirect only)
      // or 404. Only fall back locally for 404, so this failure is never
      // shown to the admin twice. Same pattern already proven in
      // OrderDetailPage's payment review flow.
      if (err?.response?.status === 404) {
        toast.error(
          err?.response?.data?.message ||
            "Failed to permanently delete blueprint.",
        );
      }
    } finally {
      setDeletingId(null);
    }
  };

  const handleImport = async (e) => {
    e.preventDefault();

    if (!importForm.title.trim()) {
      toast.error("Please enter a blueprint title.");
      return;
    }

    const fileError = validateImportFile(importForm.file);
    if (fileError) {
      toast.error(fileError);
      return;
    }

    setImporting(true);

    try {
      const fd = new FormData();
      fd.append("title", importForm.title.trim());
      fd.append("source", "imported");
      fd.append("stage", "design");
      fd.append("file", importForm.file);

      await api.post("/blueprints", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      toast.success("Blueprint file imported.");
      setImportModal(false);
      setImportForm({ title: "", file: null });
      setTab("imports");
      load();
    } catch (err) {
      toast.error(
        err?.response?.data?.message || "Failed to import blueprint file.",
      );
    } finally {
      setImporting(false);
    }
  };

  const handleCreateBlueprint = async (e) => {
    e.preventDefault();

    if (!createForm.title.trim()) {
      toast.error("Please enter a blueprint title.");
      return;
    }

    const publishToCustomer = Boolean(createForm.is_gallery);
    const markAsTemplate = Boolean(createForm.is_template || publishToCustomer);
    const cleanedDescription = String(createForm.description || "").trim();

    const emptyCalibration = {
      points: [],
      realDistanceMm: 0,
      pixelsPerMm: 0,
      isCalibrated: false,
    };

    const designSeed = {
      startMode: createForm.startMode,
      unit: "mm",
      editorMode:
        createForm.startMode === "reference" ? "reference" : "editable",
      blueprintSetup: {
        startMode: createForm.startMode,
        unit: "mm",
      },
      components: [],
      reference_files: EMPTY_REFERENCE_FILES,
      traceObjects: [],
      traceObjectsByView: {
        front: [],
        back: [],
        left: [],
        right: [],
        top: [],
      },
      referenceCalibration: emptyCalibration,
      referenceCalibrationByView: {
        front: { ...emptyCalibration },
        back: { ...emptyCalibration },
        left: { ...emptyCalibration },
        right: { ...emptyCalibration },
        top: { ...emptyCalibration },
      },
    };

    setCreating(true);

    try {
      let res;

      try {
        res = await api.post("/blueprints", {
          title: createForm.title.trim(),
          description: cleanedDescription || null,
          source: "created",
          stage: "design",
          is_template: markAsTemplate ? 1 : 0,
          is_gallery: publishToCustomer ? 1 : 0,
          design_data: JSON.stringify(designSeed),
        });
      } catch {
        const fd = new FormData();
        fd.append("title", createForm.title.trim());
        fd.append("description", cleanedDescription || "");
        fd.append("source", "created");
        fd.append("stage", "design");
        fd.append("is_template", markAsTemplate ? "1" : "0");
        fd.append("is_gallery", publishToCustomer ? "1" : "0");
        fd.append("design_data", JSON.stringify(designSeed));

        res = await api.post("/blueprints", fd, {
          headers: { "Content-Type": "multipart/form-data" },
        });
      }

      const newId =
        res?.data?.id || res?.data?.blueprint?.id || res?.data?.data?.id;

      if (!newId) {
        throw new Error("No blueprint ID returned.");
      }

      toast.success("Blueprint created.");
      closeCreateModal();

      if (createForm.startMode === "reference") {
        navigate(`/admin/blueprints/${newId}/import`);
        return;
      }

      navigate(`/admin/blueprints/${newId}/design`);
    } catch (err) {
      toast.error(
        err?.response?.data?.message ||
          err?.message ||
          "Failed to create blueprint.",
      );
    } finally {
      setCreating(false);
    }
  };

  const handleOpenFile = (fileUrl) => {
    if (!fileUrl) {
      toast.error("No imported file available.");
      return;
    }

    window.open(buildAssetUrl(fileUrl), "_blank", "noopener,noreferrer");
  };

  return (
    <div>
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
          <h1 style={pageTitle}>Blueprint Management</h1>
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={() => setImportModal(true)} style={btnGhost}>
            📂 Import File
          </button>
          <button onClick={() => setCreateModal(true)} style={btnPrimary}>
            + New Blueprint
          </button>
        </div>
      </div>

      <div
        style={{
          display: "flex",
          gap: 4,
          marginBottom: 20,
          borderBottom: "2px solid #e4e4e7",
          overflowX: "auto",
        }}
      >
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: "10px 20px",
              border: "none",
              background: "none",
              cursor: "pointer",
              fontWeight: 800,
              fontSize: 13,
              letterSpacing: "0.02em",
              color: tab === t ? "#18181b" : "#71717a",
              borderBottom:
                tab === t ? "2px solid #18181b" : "2px solid transparent",
              marginBottom: -2,
              textTransform: "capitalize",
              whiteSpace: "nowrap",
              transition: "all 0.2s ease",
            }}
          >
            {t === "my"
              ? "My Blueprints"
              : t === "imports"
                ? "Device Imports"
                : t === "gallery"
                  ? "Blueprint Gallery"
                  : "Archive"}
          </button>
        ))}

        <span
          style={{
            marginLeft: "auto",
            fontSize: 12,
            color: "#71717a",
            fontWeight: 600,
            alignSelf: "center",
          }}
        >
          {total} items
        </span>
      </div>

      <input
        placeholder="Search blueprints..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={{ ...inputSm, marginBottom: 20, minWidth: 300 }}
      />

      {items.length === 0 ? (
        <div
          style={{
            background: "#fff",
            borderRadius: 16,
            padding: 60,
            textAlign: "center",
            color: "#71717a",
            border: "1px solid #e4e4e7",
            boxShadow: "0 1px 2px rgba(0,0,0,.02)",
            fontWeight: 600,
            fontSize: 14,
          }}
        >
          No blueprints found in this section.
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
            gap: 16,
          }}
        >
          {items.map((bp) => {
            const displayStage = String(
              bp.display_stage || bp.stage || "design",
            ).toLowerCase();
            const [stageBg, stageColor, stageBorder] = STAGE_COLORS[
              displayStage
            ] || ["#f4f4f5", "#18181b", "#e4e4e7"];
            const isTemplate = Number(bp.is_template) === 1;
            const hasThumbnail = !!bp.thumbnail_url && !imageErrors[bp.id];
            const isImported =
              String(bp.source || "").toLowerCase() === "imported";
            const isCompleted = displayStage === "completed";
            const isFinalStage = ["delivery", "completed"].includes(
              displayStage,
            );
            const displayDate =
              tab === "archive"
                ? bp.archived_at || bp.updated_at || bp.created_at
                : bp.updated_at || bp.created_at;

            const isDeleting = deletingId === bp.id;
            const isRestoring = restoringId === bp.id;
            const isArchiving = archivingId === bp.id;
            const isBusy = isDeleting || isRestoring || isArchiving;

            const cardBorderColor = isCompleted ? "#18181b" : "#e4e4e7";

            return (
              <div
                key={bp.id}
                style={{
                  background: "#fff",
                  borderRadius: 16,
                  border: `1px solid ${cardBorderColor}`,
                  boxShadow: "0 1px 2px rgba(0,0,0,.02)",
                  overflow: "hidden",
                  display: "flex",
                  flexDirection: "column",
                  minHeight: 280,
                  transition: "all .2s ease",
                }}
              >
                <div
                  style={{
                    height: 140,
                    background: hasThumbnail ? "#f4f4f5" : "#fafafa",
                    borderBottom: "1px solid #e4e4e7",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    position: "relative",
                    overflow: "hidden",
                  }}
                >
                  {hasThumbnail ? (
                    <img
                      src={buildAssetUrl(bp.thumbnail_url)}
                      alt=""
                      onError={() =>
                        setImageErrors((prev) => ({
                          ...prev,
                          [bp.id]: true,
                        }))
                      }
                      style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "contain",
                        display: "block",
                        padding: 10,
                      }}
                    />
                  ) : (
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: 8,
                        color: "#a1a1aa",
                      }}
                    >
                      <span
                        style={{ fontSize: 42, opacity: 0.5 }}
                        aria-hidden="true"
                      >
                        {getBlueprintIcon(bp.file_type)}
                      </span>
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          color: "#71717a",
                          textTransform: "uppercase",
                          letterSpacing: "1px",
                        }}
                      >
                        {isCompleted
                          ? "Completed Blueprint"
                          : "Blueprint Preview"}
                      </span>
                    </div>
                  )}

                  <span
                    style={{
                      position: "absolute",
                      top: 12,
                      right: 12,
                      background: stageBg,
                      color: stageColor,
                      border: `1px solid ${stageBorder || stageBg}`,
                      padding: "4px 12px",
                      borderRadius: 999,
                      fontSize: 10,
                      fontWeight: 800,
                      whiteSpace: "nowrap",
                      textTransform: "uppercase",
                      letterSpacing: "1px",
                    }}
                  >
                    {getStageLabel(displayStage)}
                  </span>

                  {isTemplate && (
                    <span
                      style={{
                        position: "absolute",
                        top: 12,
                        left: 12,
                        background: "#f4f4f5",
                        color: "#18181b",
                        border: "1px solid #e4e4e7",
                        padding: "4px 10px",
                        borderRadius: 999,
                        fontSize: 10,
                        fontWeight: 800,
                        letterSpacing: "1px",
                      }}
                    >
                      TEMPLATE
                    </span>
                  )}
                  {Number(bp.is_gallery) === 1 && (
                    <span
                      style={{
                        position: "absolute",
                        top: isTemplate ? 42 : 12,
                        left: 12,
                        background: "#18181b",
                        color: "#ffffff",
                        border: "1px solid #18181b",
                        padding: "4px 10px",
                        borderRadius: 999,
                        fontSize: 10,
                        fontWeight: 800,
                        letterSpacing: "1px",
                      }}
                    >
                      GALLERY
                    </span>
                  )}
                  {isImported && (
                    <span
                      style={{
                        position: "absolute",
                        bottom: 12,
                        right: 12,
                        background: "#ffffff",
                        color: "#52525b",
                        border: "1px solid #d4d4d8",
                        padding: "4px 10px",
                        borderRadius: 999,
                        fontSize: 10,
                        fontWeight: 800,
                        letterSpacing: "1px",
                        textTransform: "uppercase",
                      }}
                    >
                      {bp.file_type ? bp.file_type : "file"}
                    </span>
                  )}
                </div>

                <div
                  style={{
                    padding: 16,
                    display: "flex",
                    flexDirection: "column",
                    flex: 1,
                  }}
                >
                  <h3
                    style={{
                      margin: "0 0 6px",
                      fontSize: 16,
                      fontWeight: 800,
                      color: "#0a0a0a",
                      lineHeight: 1.35,
                      minHeight: 40,
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      wordBreak: "break-word",
                      letterSpacing: "-0.01em",
                    }}
                  >
                    {bp.title || "Untitled Blueprint"}
                  </h3>

                  <div style={{ minHeight: 36 }}>
                    {!!bp.client_name && (
                      <p
                        style={{
                          fontSize: 12,
                          color: "#52525b",
                          fontWeight: 600,
                          margin: "0 0 6px",
                          lineHeight: 1.4,
                          display: "-webkit-box",
                          WebkitLineClamp: 1,
                          WebkitBoxOrient: "vertical",
                          overflow: "hidden",
                        }}
                      >
                        Client: {bp.client_name}
                      </p>
                    )}

                    {isImported && (
                      <p
                        style={{
                          fontSize: 12,
                          color: "#71717a",
                          margin: "0 0 6px",
                          lineHeight: 1.4,
                          fontWeight: 500,
                        }}
                      >
                        Imported reference
                        {bp.file_type
                          ? ` · ${String(bp.file_type).toUpperCase()}`
                          : ""}
                      </p>
                    )}
                  </div>

                  <p
                    style={{
                      fontSize: 11,
                      color: "#71717a",
                      margin: "0 0 16px",
                      fontWeight: 500,
                    }}
                  >
                    By {bp.creator_name || "Admin"} · {formatDate(displayDate)}
                  </p>

                  {tab === "archive" && bp.archive_days_left != null && (
                    <p
                      style={{
                        fontSize: 11,
                        margin: "0 0 14px",
                        fontWeight: 800,
                        textTransform: "uppercase",
                        letterSpacing: "0.5px",
                        color:
                          Number(bp.archive_days_left) <= 5
                            ? "#dc2626"
                            : "#d97706",
                      }}
                    >
                      {Number(bp.archive_days_left) === 0
                        ? "Expires today"
                        : `${bp.archive_days_left} day${Number(bp.archive_days_left) === 1 ? "" : "s"} left`}
                    </p>
                  )}

                  <div
                    style={{
                      marginTop: "auto",
                      paddingTop: 14,
                      borderTop: "1px solid #f4f4f5",
                      display: "flex",
                      gap: 8,
                      flexWrap: "wrap",
                    }}
                  >
                    {tab !== "archive" ? (
                      <>
                        <button
                          onClick={() =>
                            navigate(`/admin/blueprints/${bp.id}/design`)
                          }
                          style={
                            isCompleted
                              ? {
                                  ...btnEdit,
                                  background: "#18181b",
                                  color: "#ffffff",
                                  border: "1px solid #18181b",
                                }
                              : btnEdit
                          }
                          disabled={isBusy}
                        >
                          {getDesignActionLabel(displayStage, isImported)}
                        </button>

                        {isImported && !!bp.file_url && (
                          <button
                            onClick={() => handleOpenFile(bp.file_url)}
                            style={btnGhost}
                            disabled={isBusy}
                          >
                            📄 Open File
                          </button>
                        )}

                        {canEstimateAtStage(displayStage) && (
                          <button
                            onClick={() =>
                              navigate(`/admin/blueprints/${bp.id}/estimation`)
                            }
                            style={btnPrimary}
                            disabled={isBusy}
                          >
                            💰 Estimate
                          </button>
                        )}

                        <button
                          onClick={() => openArchiveConfirm(bp)}
                          style={{
                            ...btnGhost,
                            opacity: isArchiving ? 0.7 : 1,
                            cursor: isArchiving ? "not-allowed" : "pointer",
                          }}
                          disabled={isBusy}
                        >
                          {isArchiving ? "Archiving..." : "🗑 Archive"}
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => handleRestore(bp.id)}
                          style={{
                            ...btnEdit,
                            opacity: isRestoring ? 0.7 : 1,
                            cursor: isRestoring ? "not-allowed" : "pointer",
                          }}
                          disabled={isBusy}
                        >
                          {isRestoring ? "Restoring..." : "↩ Restore"}
                        </button>

                        <button
                          onClick={() => openDeleteConfirm(bp)}
                          style={{
                            ...btnDanger,
                            opacity: isDeleting ? 0.7 : 1,
                            cursor: isDeleting ? "not-allowed" : "pointer",
                          }}
                          disabled={isBusy}
                        >
                          {isDeleting ? "Deleting..." : "🗑 Delete"}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {importModal && (
        <div style={overlay}>
          <div style={modalBox}>
            <h3
              style={{
                margin: "0 0 16px",
                fontSize: 20,
                fontWeight: 800,
                color: "#0a0a0a",
                letterSpacing: "-0.01em",
              }}
            >
              Import Blueprint File
            </h3>
            <p
              style={{
                fontSize: 13,
                color: "#52525b",
                marginBottom: 20,
                lineHeight: 1.6,
              }}
            >
              Accepted blueprint files: PDF, PNG, JPG, JPEG, SVG.
              <br />
              Imported files can be opened in the design tool as a traceable
              background/reference.
            </p>

            <form onSubmit={handleImport}>
              <div style={{ marginBottom: 16 }}>
                <label style={labelSm}>Blueprint Title *</label>
                <input
                  required
                  value={importForm.title}
                  onChange={(e) =>
                    setImportForm((f) => ({ ...f, title: e.target.value }))
                  }
                  style={inputFull}
                  placeholder="Enter blueprint title"
                />
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={labelSm}>
                  Blueprint File (PDF / PNG / JPG / JPEG / SVG) *
                </label>
                <input
                  type="file"
                  required
                  accept=".pdf,.png,.jpg,.jpeg,.svg"
                  onChange={(e) =>
                    setImportForm((f) => ({
                      ...f,
                      file: e.target.files?.[0] || null,
                    }))
                  }
                  style={inputFull}
                />
              </div>

              {!!importForm.file && (
                <div
                  style={{
                    marginBottom: 20,
                    padding: "12px 14px",
                    background: "#fafafa",
                    border: "1px solid #e4e4e7",
                    borderRadius: 8,
                    fontSize: 13,
                    color: "#18181b",
                  }}
                >
                  <div style={{ marginBottom: 4 }}>
                    <strong style={{ fontWeight: 800 }}>Selected:</strong>{" "}
                    {importForm.file.name}
                  </div>
                  <div>
                    <strong style={{ fontWeight: 800 }}>Size:</strong>{" "}
                    {(importForm.file.size / (1024 * 1024)).toFixed(2)} MB
                  </div>
                </div>
              )}

              <div
                style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}
              >
                <button
                  type="button"
                  onClick={() => {
                    setImportModal(false);
                    setImportForm({ title: "", file: null });
                  }}
                  style={btnGhost}
                >
                  Cancel
                </button>
                <button type="submit" disabled={importing} style={btnPrimary}>
                  {importing ? "Importing..." : "Import"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {createModal && (
        <div style={overlay}>
          <div style={{ ...modalBox, width: 580 }}>
            <h3
              style={{
                margin: "0 0 24px",
                fontSize: 20,
                fontWeight: 800,
                color: "#0a0a0a",
                letterSpacing: "-0.01em",
              }}
            >
              Create New Blueprint
            </h3>

            <form onSubmit={handleCreateBlueprint}>
              <div style={{ marginBottom: 16 }}>
                <label style={labelSm}>Blueprint Title *</label>
                <input
                  required
                  value={createForm.title}
                  onChange={(e) => updateCreateForm("title", e.target.value)}
                  style={inputFull}
                  placeholder="Enter blueprint title"
                />
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={labelSm}>Description</label>
                <textarea
                  value={createForm.description}
                  onChange={(e) =>
                    updateCreateForm("description", e.target.value)
                  }
                  style={{
                    ...inputFull,
                    minHeight: 100,
                    resize: "vertical",
                    fontFamily: "inherit",
                  }}
                  placeholder="Short admin description for this furniture blueprint"
                />
              </div>

              <div style={{ marginBottom: 20 }}>
                <label style={labelSm}>Start Mode *</label>
                <select
                  value={createForm.startMode}
                  onChange={(e) =>
                    updateCreateForm("startMode", e.target.value)
                  }
                  style={inputFull}
                >
                  {CREATE_MODES.map((mode) => (
                    <option key={mode.value} value={mode.value}>
                      {mode.label}
                    </option>
                  ))}
                </select>
              </div>

              <div
                style={{
                  marginBottom: 20,
                  padding: "16px",
                  borderRadius: 12,
                  background: "#fafafa",
                  border: "1px solid #e4e4e7",
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 800,
                    color: "#0a0a0a",
                    marginBottom: 12,
                    textTransform: "uppercase",
                    letterSpacing: "1px",
                  }}
                >
                  Publish Options
                </div>

                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    fontSize: 13,
                    fontWeight: 600,
                    color: "#18181b",
                    marginBottom: 12,
                    cursor: "pointer",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={!!createForm.is_template}
                    onChange={(e) =>
                      updateCreateForm("is_template", e.target.checked)
                    }
                    style={{ accentColor: "#18181b", width: 16, height: 16 }}
                  />
                  Mark as Admin Template
                </label>

                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    fontSize: 13,
                    fontWeight: 600,
                    color: "#18181b",
                    cursor: "pointer",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={!!createForm.is_gallery}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setCreateForm((prev) => ({
                        ...prev,
                        is_gallery: checked,
                        is_template: checked ? true : prev.is_template,
                      }));
                    }}
                    style={{ accentColor: "#18181b", width: 16, height: 16 }}
                  />
                  Show in Customer Customize Gallery
                </label>

                <div
                  style={{
                    marginTop: 12,
                    fontSize: 12,
                    color: "#71717a",
                    lineHeight: 1.5,
                  }}
                >
                  Customer gallery items are automatically treated as templates.
                </div>
              </div>

              <div
                style={{
                  marginBottom: 24,
                  padding: "12px 16px",
                  borderRadius: 8,
                  background: "#f4f4f5",
                  border: "1px solid #e4e4e7",
                  fontSize: 13,
                  color: "#18181b",
                  lineHeight: 1.6,
                }}
              >
                <div style={{ marginBottom: 4 }}>
                  <strong style={{ fontWeight: 800 }}>Unit:</strong> MM only
                </div>
                <div style={{ color: "#52525b" }}>
                  {createForm.startMode === "reference"
                    ? "After create, this will open the reference import page."
                    : "After create, this will open the editor. Furniture type and dimensions will come from the actual design."}
                </div>
              </div>

              <div
                style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}
              >
                <button
                  type="button"
                  onClick={closeCreateModal}
                  style={btnGhost}
                >
                  Cancel
                </button>
                <button type="submit" disabled={creating} style={btnPrimary}>
                  {creating ? "Creating..." : "Create"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deleteConfirmModal && deleteTarget && (
        <div style={overlay}>
          <div style={{ ...modalBox, width: 440 }}>
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: "50%",
                background: "#fef2f2",
                color: "#dc2626",
                border: "1px solid #fecaca",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 24,
                marginBottom: 20,
              }}
            >
              🗑
            </div>

            <h3
              style={{
                margin: "0 0 10px",
                fontSize: 20,
                fontWeight: 800,
                color: "#0a0a0a",
                letterSpacing: "-0.01em",
              }}
            >
              Delete Archived Blueprint?
            </h3>

            <p
              style={{
                margin: "0 0 8px",
                fontSize: 13,
                color: "#52525b",
                lineHeight: 1.6,
              }}
            >
              You are about to permanently delete:
            </p>

            <div
              style={{
                marginBottom: 16,
                padding: "14px 16px",
                borderRadius: 10,
                background: "#fafafa",
                border: "1px solid #e4e4e7",
                fontSize: 14,
                fontWeight: 800,
                color: "#0a0a0a",
                wordBreak: "break-word",
              }}
            >
              {deleteTarget.title || "Untitled Blueprint"}
            </div>

            <p
              style={{
                margin: "0 0 24px",
                fontSize: 13,
                color: "#71717a",
                lineHeight: 1.6,
              }}
            >
              This action cannot be undone and may also remove related
              estimation data.
            </p>

            <div
              style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}
            >
              <button
                type="button"
                onClick={closeDeleteConfirm}
                disabled={deletingId === deleteTarget.id}
                style={{
                  ...btnGhost,
                  opacity: deletingId === deleteTarget.id ? 0.7 : 1,
                  cursor:
                    deletingId === deleteTarget.id ? "not-allowed" : "pointer",
                }}
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={confirmPermanentDelete}
                disabled={deletingId === deleteTarget.id}
                style={{
                  ...btnDanger,
                  opacity: deletingId === deleteTarget.id ? 0.7 : 1,
                  cursor:
                    deletingId === deleteTarget.id ? "not-allowed" : "pointer",
                }}
              >
                {deletingId === deleteTarget.id
                  ? "Deleting..."
                  : "Yes, Delete Permanently"}
              </button>
            </div>
          </div>
        </div>
      )}

      {archiveConfirmModal && archiveTarget && (
        <div style={overlay}>
          <div style={{ ...modalBox, width: 440 }}>
            <h3
              style={{
                margin: "0 0 10px",
                fontSize: 20,
                fontWeight: 800,
                color: "#0a0a0a",
                letterSpacing: "-0.01em",
              }}
            >
              Archive Blueprint?
            </h3>

            <p
              style={{
                margin: "0 0 20px",
                fontSize: 13,
                color: "#52525b",
                lineHeight: 1.6,
              }}
            >
              Are you sure you want to move{" "}
              <strong>"{archiveTarget.title || "Untitled Blueprint"}"</strong>{" "}
              to the archive? Archived blueprints will be permanently deleted
              after 30 days.
            </p>

            <div
              style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}
            >
              <button
                type="button"
                onClick={closeArchiveConfirm}
                disabled={archivingId === archiveTarget.id}
                style={{
                  ...btnGhost,
                  opacity: archivingId === archiveTarget.id ? 0.7 : 1,
                  cursor:
                    archivingId === archiveTarget.id
                      ? "not-allowed"
                      : "pointer",
                }}
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={confirmArchive}
                disabled={archivingId === archiveTarget.id}
                style={{
                  ...btnDanger,
                  opacity: archivingId === archiveTarget.id ? 0.7 : 1,
                  cursor:
                    archivingId === archiveTarget.id
                      ? "not-allowed"
                      : "pointer",
                }}
              >
                {archivingId === archiveTarget.id
                  ? "Archiving..."
                  : "Archive Blueprint"}
              </button>
            </div>
          </div>
        </div>
      )}
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

const inputSm = {
  padding: "9px 14px",
  border: "1px solid #e4e4e7",
  borderRadius: 8,
  fontSize: 13,
  outline: "none",
  color: "#18181b",
};

const inputFull = {
  width: "100%",
  padding: "10px 14px",
  border: "1px solid #e4e4e7",
  borderRadius: 8,
  fontSize: 13,
  color: "#18181b",
  boxSizing: "border-box",
  outline: "none",
};

const labelSm = {
  fontSize: 12,
  fontWeight: 800,
  color: "#18181b",
  display: "block",
  marginBottom: 8,
};

const btnPrimary = {
  padding: "9px 18px",
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
  padding: "9px 18px",
  background: "#f4f4f5",
  color: "#18181b",
  border: "1px solid #e4e4e7",
  borderRadius: 8,
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 700,
  transition: "background 0.2s",
};

const btnEdit = {
  padding: "6px 14px",
  background: "#f4f4f5",
  color: "#18181b",
  border: "1px solid #e4e4e7",
  borderRadius: 6,
  cursor: "pointer",
  fontSize: 12,
  fontWeight: 700,
  transition: "background 0.2s",
};

const btnGhostMini = {
  padding: "6px 12px",
  background: "#ffffff",
  color: "#52525b",
  border: "1px solid #e4e4e7",
  borderRadius: 6,
  cursor: "pointer",
  fontSize: 12,
  fontWeight: 700,
  transition: "background 0.2s",
};

const btnDanger = {
  padding: "9px 18px",
  background: "#fef2f2",
  color: "#dc2626",
  border: "1px solid #fecaca",
  borderRadius: 8,
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 700,
  transition: "background 0.2s",
};

const overlay = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,.6)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 1000,
  padding: 20,
};

const modalBox = {
  background: "#fff",
  borderRadius: 16,
  padding: 32,
  width: 480,
  maxHeight: "90vh",
  overflowY: "auto",
  border: "1px solid #e4e4e7",
  boxShadow: "0 25px 60px rgba(0,0,0,.15)",
};