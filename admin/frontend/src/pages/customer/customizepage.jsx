import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import api, { buildAssetUrl } from "../../services/api";
import { Search, X } from "lucide-react";
import { useCustomCart } from "./customcartcontext";
import { useCart } from "./cartcontext";
import useAuthStore from "../../store/authStore";
import CustomerBlueprintViewer from "./CustomerBlueprintViewer";
import "./customizepage.css";
import CustomerTemplateWorkbench from "./CustomerTemplateWorkbench";

// 👉 ADDED: Peso formatter for prices
const formatPeso = (value) =>
  `₱${Number(value || 0).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const FALLBACK_WOOD_TYPES = [
  "Oak",
  "Pine",
  "Walnut",
  "Mahogany",
  "Maple",
  "Plywood",
  "MDF",
];

const FALLBACK_FINISHES = [
  "Natural",
  "White",
  "Black",
  "Brown",
  "Dark Walnut",
  "Light Oak",
  "Custom (see comments)",
];

const FALLBACK_DOOR_STYLES = [
  "Flat Panel",
  "Raised Panel",
  "Shaker",
  "Louvered",
  "Glass Panel",
  "Open (No Door)",
];

const FALLBACK_HARDWARE = [
  "Silver Handles",
  "Gold Handles",
  "Black Handles",
  "Knobs",
  "Concealed Hinges",
  "Exposed Hinges",
  "No Hardware",
];

const TEMPLATE_PROFILES = {
  chair: {
    id: "chair",
    title: "Chair Template",
    category: "Chair Template",
    keywords: [
      "chair",
      "dining chair",
      "seat",
      "backrest",
      "stool",
      "armchair",
      "bench chair",
    ],
    defaultDimensions: { width: 480, height: 900, depth: 520 },
    dimensionRanges: {
      width: { min: 380, max: 700, default: 480 },
      height: { min: 750, max: 1300, default: 900 },
      depth: { min: 380, max: 700, default: 520 },
    },
    labels: {
      width: "Overall Width",
      height: "Overall Height",
      depth: "Seat Depth",
      hardware: "Leg Style / Hardware",
    },
    materials: ["Oak", "Pine", "Walnut", "Mahogany", "Maple"],
    finishes: ["Natural", "Walnut", "Dark Walnut", "Black", "White", "Brown"],
    hardware: [
      "Wood Legs",
      "Metal Legs",
      "Floor Protectors",
      "Plastic Glides",
      "No Extra Hardware",
    ],
    doorStyles: [],
    showDoorStyle: false,
    showHardware: true,
    shortNote:
      "Structure is locked. You may only adjust allowed size, wood, finish, and optional build details.",
  },

  table: {
    id: "table",
    title: "Table Template",
    category: "Table Template",
    keywords: [
      "table",
      "desk",
      "console",
      "counter",
      "tabletop",
      "work table",
      "coffee table",
      "side table",
    ],
    defaultDimensions: { width: 1200, height: 750, depth: 700 },
    dimensionRanges: {
      width: { min: 600, max: 2400, default: 1200 },
      height: { min: 650, max: 1100, default: 750 },
      depth: { min: 400, max: 1200, default: 700 },
    },
    labels: {
      width: "Table Width",
      height: "Table Height",
      depth: "Table Depth",
      hardware: "Base / Hardware",
    },
    materials: ["Oak", "Pine", "Walnut", "Mahogany", "Maple", "MDF"],
    finishes: ["Natural", "Walnut", "Dark Walnut", "Black", "White", "Brown"],
    hardware: [
      "Wood Legs",
      "Metal Legs",
      "Adjustable Feet",
      "Cable Hole",
      "No Extra Hardware",
    ],
    doorStyles: [],
    showDoorStyle: false,
    showHardware: true,
    shortNote:
      "Main structure stays fixed. You can adjust the allowed size, wood finish, and base details only.",
  },

  cabinet: {
    id: "cabinet",
    title: "Cabinet Template",
    category: "Cabinet Template",
    keywords: [
      "cabinet",
      "closet",
      "wardrobe",
      "drawer",
      "kitchen",
      "storage",
      "shelf cabinet",
      "door panel",
      "divider",
    ],
    defaultDimensions: { width: 1200, height: 2100, depth: 600 },
    dimensionRanges: {
      width: { min: 600, max: 3200, default: 1200 },
      height: { min: 1600, max: 3120, default: 2100 },
      depth: { min: 420, max: 780, default: 600 },
    },
    labels: {
      width: "Cabinet Width",
      height: "Cabinet Height",
      depth: "Cabinet Depth",
      hardware: "Hardware",
    },
    materials: ["Oak", "Plywood", "MDF", "Walnut", "Mahogany", "Maple"],
    finishes: [
      "Natural",
      "White",
      "Black",
      "Brown",
      "Dark Walnut",
      "Light Oak",
    ],
    hardware: FALLBACK_HARDWARE,
    doorStyles: FALLBACK_DOOR_STYLES,
    showDoorStyle: true,
    showHardware: true,
    shortNote:
      "Core cabinet structure is fixed. Only admin-approved dimensions, materials, finish, and accessories can be changed.",
  },

  shelf: {
    id: "shelf",
    title: "Shelf Template",
    category: "Shelf Template",
    keywords: ["shelf", "rack", "bookcase", "display shelf"],
    defaultDimensions: { width: 900, height: 1800, depth: 350 },
    dimensionRanges: {
      width: { min: 500, max: 1800, default: 900 },
      height: { min: 900, max: 2600, default: 1800 },
      depth: { min: 220, max: 600, default: 350 },
    },
    labels: {
      width: "Shelf Width",
      height: "Shelf Height",
      depth: "Shelf Depth",
      hardware: "Shelf Hardware",
    },
    materials: ["Oak", "Plywood", "MDF", "Walnut", "Maple"],
    finishes: ["Natural", "White", "Black", "Brown", "Light Oak"],
    hardware: ["Wall Brackets", "Adjustable Feet", "No Extra Hardware"],
    doorStyles: [],
    showDoorStyle: false,
    showHardware: true,
    shortNote:
      "Shelf body is fixed. You can adjust allowed size, material, finish, and simple hardware only.",
  },

  generic: {
    id: "generic",
    title: "Furniture Template",
    category: "Furniture Template",
    keywords: [],
    defaultDimensions: { width: 1000, height: 900, depth: 500 },
    dimensionRanges: {
      width: { min: 400, max: 2400, default: 1000 },
      height: { min: 600, max: 2400, default: 900 },
      depth: { min: 300, max: 1200, default: 500 },
    },
    labels: {
      width: "Width",
      height: "Height",
      depth: "Depth",
      hardware: "Hardware",
    },
    materials: FALLBACK_WOOD_TYPES,
    finishes: FALLBACK_FINISHES,
    hardware: FALLBACK_HARDWARE,
    doorStyles: FALLBACK_DOOR_STYLES,
    showDoorStyle: true,
    showHardware: true,
    shortNote:
      "Only approved customer-editable values can be changed. The main structure remains based on the admin template.",
  },
};

const resolveImageSrc = (src) => {
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

const toPositiveNumber = (value) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

const formatMm = (value) => {
  const n = toPositiveNumber(value);
  return n > 0 ? `${Math.round(n)} mm` : "—";
};

const uniqueStrings = (items = []) => [
  ...new Set(items.map((item) => String(item || "").trim()).filter(Boolean)),
];

const clamp = (value, min, max) => {
  if (!Number.isFinite(value)) return min;
  if (Number.isFinite(min) && value < min) return min;
  if (Number.isFinite(max) && value > max) return max;
  return value;
};

const resolveBaseDimensionValue = (...candidates) => {
  for (const value of candidates) {
    const n = toPositiveNumber(value);
    if (n > 0) return n;
  }
  return 0;
};

const extractSceneItems = (source) => {
  if (!source || typeof source !== "object") return [];
  const safeScene = source.scene || {};
  const safeSceneData = source.sceneData || {};

  const candidates = [
    source.components,
    source.objects,
    source.items,
    source.parts,
    source.meshes,
    safeScene.components,
    safeScene.objects,
    safeSceneData.components,
    safeSceneData.objects,
  ];

  const found = candidates.find(Array.isArray);
  return found || [];
};

const computeSceneBounds = (blueprint = {}) => {
  const items = [
    ...extractSceneItems(blueprint?.view_3d_data),
    ...extractSceneItems(blueprint?.design_data),
    ...(Array.isArray(blueprint?.components) ? blueprint.components : []),
  ];

  if (!items.length) return null;

  const normalized = items
    .map((item) => ({
      x: Number(item?.x ?? item?.position_x ?? 0) || 0,
      y: Number(item?.y ?? item?.position_y ?? 0) || 0,
      z: Number(item?.z ?? item?.position_z ?? 0) || 0,
      width: Math.max(
        1,
        Number(item?.width ?? item?.w ?? item?.width_mm ?? 0) || 0,
      ),
      height: Math.max(
        1,
        Number(item?.height ?? item?.h ?? item?.height_mm ?? 0) || 0,
      ),
      depth: Math.max(
        1,
        Number(item?.depth ?? item?.d ?? item?.depth_mm ?? 0) || 0,
      ),
    }))
    .filter((item) => item.width > 0 && item.height > 0 && item.depth > 0);

  if (!normalized.length) return null;

  const minX = Math.min(...normalized.map((c) => c.x));
  const minY = Math.min(...normalized.map((c) => c.y));
  const minZ = Math.min(...normalized.map((c) => c.z));

  const maxX = Math.max(...normalized.map((c) => c.x + c.width));
  const maxY = Math.max(...normalized.map((c) => c.y + c.height));
  const maxZ = Math.max(...normalized.map((c) => c.z + c.depth));

  return {
    width: Math.round(maxX - minX),
    height: Math.round(maxY - minY),
    depth: Math.round(maxZ - minZ),
  };
};

const detectProfileFromSceneItems = (blueprint = {}) => {
  const items = [
    ...extractSceneItems(blueprint?.view_3d_data),
    ...extractSceneItems(blueprint?.design_data),
    ...(Array.isArray(blueprint?.components) ? blueprint.components : []),
  ];

  const haystack = items
    .flatMap((item) => [
      item?.type,
      item?.label,
      item?.category,
      item?.groupType,
      item?.blueprintStyle,
      item?.templateType,
      item?.partCode,
    ])
    .map((value) =>
      String(value || "")
        .trim()
        .toLowerCase(),
    )
    .join(" ");

  if (!haystack) return null;

  if (
    haystack.includes("chair") ||
    haystack.includes("seat panel") ||
    haystack.includes("back slat") ||
    haystack.includes("chair_front_leg") ||
    haystack.includes("chair_back_leg")
  ) {
    return TEMPLATE_PROFILES.chair;
  }

  if (haystack.includes("coffee table") || haystack.includes("coffee_table")) {
    return TEMPLATE_PROFILES.table;
  }

  if (
    haystack.includes("table") ||
    haystack.includes("desk") ||
    haystack.includes("dt_top_panel")
  ) {
    return TEMPLATE_PROFILES.table;
  }

  if (
    haystack.includes("bed") ||
    haystack.includes("bed_frame") ||
    haystack.includes("headboard")
  ) {
    return TEMPLATE_PROFILES.bed || TEMPLATE_PROFILES.generic;
  }

  if (
    haystack.includes("cabinet") ||
    haystack.includes("closet") ||
    haystack.includes("wardrobe") ||
    haystack.includes("wr_side_panel") ||
    haystack.includes("wr_divider") ||
    haystack.includes("wr_shelf")
  ) {
    return TEMPLATE_PROFILES.cabinet;
  }

  return null;
};

const mapTemplateTypeToProfile = (value = "") => {
  const raw = String(value || "")
    .trim()
    .toLowerCase();

  if (!raw) return null;

  if (raw.includes("chair")) return TEMPLATE_PROFILES.chair;

  if (
    raw.includes("table") ||
    raw.includes("coffee_table") ||
    raw.includes("coffee table")
  ) {
    return TEMPLATE_PROFILES.table;
  }

  if (
    raw.includes("cabinet") ||
    raw.includes("closet") ||
    raw.includes("wardrobe")
  ) {
    return TEMPLATE_PROFILES.cabinet;
  }

  if (
    raw.includes("shelf") ||
    raw.includes("rack") ||
    raw.includes("bookcase")
  ) {
    return TEMPLATE_PROFILES.shelf;
  }

  return null;
};

const buildTemplateHaystack = (blueprint = {}) =>
  [
    blueprint?.title,
    blueprint?.description,
    blueprint?.category,
    blueprint?.template_type,
    blueprint?.template_category,
    blueprint?.product_type,
    blueprint?.primary_material,
    blueprint?.wood_type,
    blueprint?.preview_template_type,
    blueprint?.import_template_type,
    blueprint?.furnitureType,
    blueprint?.design_data?.templateType,
    blueprint?.design_data?.importTemplateType,
    blueprint?.design_data?.import_type,
    blueprint?.design_data?.furnitureType,
    blueprint?.design_data?.blueprintSetup?.furnitureType,
    blueprint?.view_3d_data?.templateType,
    blueprint?.view_3d_data?.importTemplateType,
    blueprint?.view_3d_data?.furnitureType,
  ]
    .map((item) => String(item || "").toLowerCase())
    .join(" ");

const detectTemplateProfile = (blueprint = {}) => {
  const sceneProfile = detectProfileFromSceneItems(blueprint);
  if (sceneProfile) return sceneProfile;

  const explicitProfile =
    mapTemplateTypeToProfile(blueprint?.preview_template_type) ||
    mapTemplateTypeToProfile(blueprint?.import_template_type) ||
    mapTemplateTypeToProfile(blueprint?.design_data?.templateType) ||
    mapTemplateTypeToProfile(blueprint?.design_data?.importTemplateType) ||
    mapTemplateTypeToProfile(blueprint?.design_data?.import_type) ||
    mapTemplateTypeToProfile(blueprint?.design_data?.furnitureType) ||
    mapTemplateTypeToProfile(
      blueprint?.design_data?.blueprintSetup?.furnitureType,
    ) ||
    mapTemplateTypeToProfile(blueprint?.view_3d_data?.templateType) ||
    mapTemplateTypeToProfile(blueprint?.view_3d_data?.importTemplateType) ||
    mapTemplateTypeToProfile(blueprint?.view_3d_data?.furnitureType);

  if (explicitProfile) return explicitProfile;

  const haystack = buildTemplateHaystack(blueprint);

  const orderedProfiles = [
    TEMPLATE_PROFILES.chair,
    TEMPLATE_PROFILES.table,
    TEMPLATE_PROFILES.cabinet,
    TEMPLATE_PROFILES.shelf,
  ];

  for (const profile of orderedProfiles) {
    if (profile.keywords.some((keyword) => haystack.includes(keyword))) {
      return profile;
    }
  }

  return TEMPLATE_PROFILES.generic;
};

const resolveSavedTemplateProfile = (blueprint = {}) => {
  const explicit =
    mapTemplateTypeToProfile(blueprint?.template_profile) ||
    mapTemplateTypeToProfile(blueprint?.preview_template_type) ||
    mapTemplateTypeToProfile(blueprint?.import_template_type) ||
    mapTemplateTypeToProfile(blueprint?.design_data?.templateType) ||
    mapTemplateTypeToProfile(blueprint?.design_data?.importTemplateType) ||
    mapTemplateTypeToProfile(blueprint?.design_data?.import_type) ||
    mapTemplateTypeToProfile(blueprint?.design_data?.furnitureType) ||
    mapTemplateTypeToProfile(
      blueprint?.design_data?.blueprintSetup?.furnitureType,
    ) ||
    mapTemplateTypeToProfile(blueprint?.view_3d_data?.templateType) ||
    mapTemplateTypeToProfile(blueprint?.view_3d_data?.importTemplateType) ||
    mapTemplateTypeToProfile(blueprint?.view_3d_data?.furnitureType);

  return explicit || detectTemplateProfile(blueprint);
};

const normalizeDimensionRule = (sourceRule, fallbackRule) => {
  const sourceMin = toPositiveNumber(sourceRule?.min);
  const sourceMax = toPositiveNumber(sourceRule?.max);
  const sourceDefault = toPositiveNumber(sourceRule?.default);

  const looksAbsurd =
    !sourceMin ||
    !sourceMax ||
    sourceMin >= sourceMax ||
    sourceMin > fallbackRule.max * 1.35 ||
    sourceMax > fallbackRule.max * 1.8 ||
    sourceMax < fallbackRule.min;

  if (looksAbsurd) {
    return { ...fallbackRule };
  }

  return {
    min: sourceMin,
    max: sourceMax,
    default: clamp(sourceDefault || fallbackRule.default, sourceMin, sourceMax),
  };
};

const resolveDimensionConfig = (blueprint = {}, dimRules = {}, profile) => {
  const sceneBounds =
    blueprint?.scene_bounds || computeSceneBounds(blueprint) || null;

  const bounds =
    blueprint?.bounds ||
    blueprint?.design_data?.bounds ||
    blueprint?.view_3d_data?.bounds ||
    {};
  const defaultDims = blueprint?.default_dimensions || {};

  const widthRuleBase = normalizeDimensionRule(
    dimRules?.width,
    profile.dimensionRanges.width,
  );
  const heightRuleBase = normalizeDimensionRule(
    dimRules?.height,
    profile.dimensionRanges.height,
  );
  const depthRuleBase = normalizeDimensionRule(
    dimRules?.depth,
    profile.dimensionRanges.depth,
  );

  const baseWidth = resolveBaseDimensionValue(
    sceneBounds?.width,
    bounds?.width,
    defaultDims?.width_mm,
    defaultDims?.width,
    profile.defaultDimensions.width,
  );

  const baseHeight = resolveBaseDimensionValue(
    sceneBounds?.height,
    bounds?.height,
    defaultDims?.height_mm,
    defaultDims?.height,
    profile.defaultDimensions.height,
  );

  const baseDepth = resolveBaseDimensionValue(
    sceneBounds?.depth,
    bounds?.depth,
    defaultDims?.depth_mm,
    defaultDims?.depth,
    profile.defaultDimensions.depth,
  );

  const widthRule = {
    ...widthRuleBase,
    min: Math.min(widthRuleBase.min, baseWidth || widthRuleBase.min),
    max: Math.max(widthRuleBase.max, baseWidth || widthRuleBase.max),
  };

  const heightRule = {
    ...heightRuleBase,
    min: Math.min(heightRuleBase.min, baseHeight || heightRuleBase.min),
    max: Math.max(heightRuleBase.max, baseHeight || heightRuleBase.max),
  };

  const depthRule = {
    ...depthRuleBase,
    min: Math.min(depthRuleBase.min, baseDepth || depthRuleBase.min),
    max: Math.max(depthRuleBase.max, baseDepth || depthRuleBase.max),
  };

  return {
    rules: {
      width: {
        ...widthRule,
        default: clamp(
          baseWidth || widthRule.default,
          widthRule.min,
          widthRule.max,
        ),
      },
      height: {
        ...heightRule,
        default: clamp(
          baseHeight || heightRule.default,
          heightRule.min,
          heightRule.max,
        ),
      },
      depth: {
        ...depthRule,
        default: clamp(
          baseDepth || depthRule.default,
          depthRule.min,
          depthRule.max,
        ),
      },
    },
    defaultDimensions: {
      width_mm: baseWidth || widthRule.default,
      height_mm: baseHeight || heightRule.default,
      depth_mm: baseDepth || depthRule.default,
    },
  };
};

const resolveOptionSet = (allowed, fallback) => {
  const cleanAllowed = uniqueStrings(Array.isArray(allowed) ? allowed : []);
  return cleanAllowed.length ? cleanAllowed : fallback;
};

const stableText = (value) =>
  String(value ?? "")
    .trim()
    .toLowerCase();

const slimComponentForKey = (component = {}) => ({
  id: stableText(component?.id),
  type: stableText(component?.type),
  label: stableText(component?.label),
  x: Math.round(Number(component?.x || 0) || 0),
  y: Math.round(Number(component?.y || 0) || 0),
  z: Math.round(Number(component?.z || 0) || 0),
  width: Math.round(Number(component?.width || 0) || 0),
  height: Math.round(Number(component?.height || 0) || 0),
  depth: Math.round(Number(component?.depth || 0) || 0),
  rotationX: Math.round(Number(component?.rotationX || 0) || 0),
  rotationY: Math.round(Number(component?.rotationY || 0) || 0),
  rotationZ: Math.round(Number(component?.rotationZ || 0) || 0),
  fill: stableText(component?.fill),
  color: stableText(component?.color),
  finish_color: stableText(component?.finish_color),
  finish: stableText(component?.finish),
  material: stableText(component?.material),
  qty: Math.max(1, Number(component?.qty || 1)),
});

const buildStableCustomCartKey = ({
  productId,
  templateProfile,
  width,
  height,
  depth,
  woodType,
  finishColor,
  color,
  doorStyle,
  hardware,
  initialMessage,
  components,
  referencePhotos,
}) => {
  const signature = JSON.stringify({
    productId: Number(productId || 0) || 0,
    templateProfile: stableText(templateProfile),
    width: Math.round(Number(width || 0) || 0),
    height: Math.round(Number(height || 0) || 0),
    depth: Math.round(Number(depth || 0) || 0),
    woodType: stableText(woodType),
    finishColor: stableText(finishColor),
    color: stableText(color),
    doorStyle: stableText(doorStyle),
    hardware: stableText(hardware),
    initialMessage: stableText(initialMessage),
    components: (Array.isArray(components) ? components : [])
      .map(slimComponentForKey)
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
    referencePhotos: (Array.isArray(referencePhotos) ? referencePhotos : [])
      .map((photo) => ({
        name: stableText(photo?.name),
        type: stableText(photo?.type),
        data_url: String(photo?.data_url || "").trim(),
      }))
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
  });

  let hash = 5381;
  for (let i = 0; i < signature.length; i += 1) {
    hash = ((hash << 5) + hash + signature.charCodeAt(i)) >>> 0;
  }

  return `custom_${Number(productId || 0) || "blueprint"}_${hash.toString(36)}`;
};

function ProductImage({ src, alt }) {
  const [hasError, setHasError] = useState(false);

  if (!src || hasError) {
    return (
      <div className="cust-img-placeholder">
        <span>🪵</span>
        <small>{alt}</small>
      </div>
    );
  }

  return (
    <img
      src={resolveImageSrc(src)}
      alt={alt}
      className="cust-product-img"
      onError={() => setHasError(true)}
    />
  );
}

function SkeletonCard() {
  return (
    <div className="product-skeleton">
      <div className="skeleton-img" />
      <div className="skeleton-body">
        <div className="skeleton-line short" />
        <div className="skeleton-line medium" />
        <div className="skeleton-line" />
      </div>
    </div>
  );
}

function ModalShell({ title, subtitle, onClose, children, wide = false }) {
  return (
    <div className="cust-modal-backdrop" onClick={onClose}>
      <div
        className={`cust-modal ${wide ? "cust-modal-wide" : ""}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="cust-modal-head">
          <div>
            <h2>{title}</h2>
            {subtitle ? <p>{subtitle}</p> : null}
          </div>

          <button type="button" className="cust-modal-close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="cust-modal-content">{children}</div>
      </div>
    </div>
  );
}

function InfoCard({ label, value }) {
  return (
    <div className="cust-info-card">
      <div className="cust-info-label">{label}</div>
      <div className="cust-info-value">{value || "—"}</div>
    </div>
  );
}

function RuleHint({ min, max }) {
  if (!min && !max) return null;

  return (
    <div className="cust-rule-hint">
      Allowed: {min ? `${Math.round(min)} mm` : "—"} to{" "}
      {max ? `${Math.round(max)} mm` : "—"}
    </div>
  );
}

function SectionTitle({ icon, title }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        marginBottom: 8,
        fontWeight: 700,
      }}
    >
      {icon}
      <span>{title}</span>
    </div>
  );
}

function useBlueprintDetail(id, open) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    if (!id || !open) {
      setDetail(null);
      setLoading(false);
      setError("");
      return;
    }

    (async () => {
      setLoading(true);
      setError("");

      try {
        const response = await api.get(`/customer/blueprints/${id}`);
        if (active) setDetail(response.data);
      } catch (err) {
        if (active) {
          setError(
            err.response?.data?.message ||
              err.response?.data?.error ||
              "Failed to load blueprint details.",
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [id, open]);

  return { detail, loading, error };
}

function ViewModal({ product, onClose, onCustomize }) {
  const { detail, loading, error } = useBlueprintDetail(product?.id, !!product);

  if (!product) return null;

  const blueprint = detail || product;

  return (
    <ModalShell
      title={blueprint.title || "Template Preview"}
      subtitle="Preview the approved furniture template before customizing."
      onClose={onClose}
      wide
    >
      {loading ? (
        <div className="cust-modal-state">Loading template preview…</div>
      ) : error ? (
        <div className="cust-modal-error">{error}</div>
      ) : (
        <div style={{ display: "grid", gap: 14 }}>
          <CustomerTemplateWorkbench blueprint={blueprint} readOnly />

          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: 10,
            }}
          >
            <button type="button" className="cust-view-btn" onClick={onClose}>
              Close
            </button>

            <button
              type="button"
              className="cust-customize-btn"
              onClick={() => onCustomize?.(blueprint)}
            >
              Customize
            </button>
          </div>
        </div>
      )}
    </ModalShell>
  );
}

function CustomizeModal({ product, onClose, onAdd }) {
  const { detail, loading, error } = useBlueprintDetail(product?.id, !!product);

  if (!product) return null;

  const blueprint = detail || product;

  return (
    <ModalShell
      title={blueprint.title || "Customize Template"}
      subtitle="Customer configurator with approved editable options only."
      onClose={onClose}
      wide
    >
      {loading ? (
        <div className="cust-modal-state">Loading customization workspace…</div>
      ) : error ? (
        <div className="cust-modal-error">{error}</div>
      ) : (
        <CustomerTemplateWorkbench
          blueprint={blueprint}
          readOnly={false}
          confirmLabel="Add to Custom Cart"
          onConfirm={(draft) => onAdd(blueprint, draft)}
        />
      )}
    </ModalShell>
  );
}

function ProductCard({ product, onView, onCustomize }) {
  const profile = detectTemplateProfile(product || {});
  const dimensionConfig = resolveDimensionConfig(
    product,
    product?.customization_rules?.dimensions || {},
    profile,
  );
  const dimensions = dimensionConfig.defaultDimensions;

  return (
    <div className="cust-product-card">
      <div className="cust-product-image-wrap">
        {product.has_saved_3d ? (
          <div
            style={{
              width: "100%",
              height: "100%",
              minHeight: 255,
              borderRadius: 18,
              overflow: "hidden",
              background: "#f7f2ea",
            }}
          >
            <CustomerBlueprintViewer
              blueprint={product}
              targetDimensionsMm={{
                widthMm: dimensions.width_mm,
                heightMm: dimensions.height_mm,
                depthMm: dimensions.depth_mm,
              }}
              readOnly
              showHumanControls={false}
              compact
              defaultPreset="front"
              defaultShowHuman={false}
            />
          </div>
        ) : (
          <ProductImage
            src={product.preview_image_url || product.thumbnail_url}
            alt={product.title}
          />
        )}
      </div>

      <div className="cust-product-meta">
        <div className="cust-category">{profile.category}</div>

        <h3 className="cust-product-title">{product.title}</h3>

        <p className="cust-product-desc">
          {product.description ||
            "Customizable template from the admin blueprint gallery."}
        </p>

        <div className="cust-tag-row">
          <span className="custom-spec-tag">Made to Order</span>
          <span className="custom-spec-tag">Admin Blueprint</span>
          <span className="custom-spec-tag">
            {product.has_saved_3d ? "Admin 3D Ready" : "Thumbnail Only"}
          </span>
        </div>

        <div className="cust-dim-summary">
          {formatMm(dimensions.width_mm)} × {formatMm(dimensions.height_mm)} ×{" "}
          {formatMm(dimensions.depth_mm)}
        </div>

        {/* 👉 ADDED: Display the base price here! */}
        <div
          style={{
            marginTop: 12,
            fontSize: 16,
            fontWeight: 800,
            color: "#0a0a0a",
          }}
        >
          {Number(product.base_price) > 0
            ? formatPeso(product.base_price)
            : "Price to be quoted"}
        </div>

        <div className="cust-card-actions">
          <button
            type="button"
            className="cust-view-btn"
            onClick={() => onView(product)}
          >
            View
          </button>

          <button
            type="button"
            className="cust-customize-btn"
            onClick={() => onCustomize(product)}
          >
            Customize
          </button>
        </div>
      </div>
    </div>
  );
}

export default function CustomizePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuthStore();
  const { addToCustomCart } = useCustomCart();
  const { cartCount } = useCart();

  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [viewingProduct, setViewingProduct] = useState(null);
  const [customizingProduct, setCustomizingProduct] = useState(null);
  const [toastMessage, setToastMessage] = useState("");

  const requireCustomerLogin = useCallback(
    (product = null) => {
      if (user?.role === "customer") return true;

      const params = new URLSearchParams(location.search);
      if (product?.id) {
        params.set("template", String(product.id));
      }

      const searchString = params.toString();
      const redirectTo = `${location.pathname}${
        searchString ? `?${searchString}` : ""
      }`;

      navigate("/login", {
        replace: false,
        state: {
          from: {
            pathname: location.pathname,
            search: searchString ? `?${searchString}` : "",
          },
          redirectTo,
        },
      });

      return false;
    },
    [user, navigate, location.pathname, location.search],
  );

  const closeCustomizeModal = useCallback(() => {
    setCustomizingProduct(null);

    const params = new URLSearchParams(location.search);
    if (params.has("template")) {
      params.delete("template");
      const nextSearch = params.toString();
      navigate(`${location.pathname}${nextSearch ? `?${nextSearch}` : ""}`, {
        replace: true,
      });
    }
  }, [location.pathname, location.search, navigate]);

  const fetchProducts = useCallback(
    async (query = search) => {
      setLoading(true);

      try {
        const response = await api.get("/customer/blueprints", {
          params: {
            q: query || undefined,
            limit: 50,
          },
        });

        setProducts(response.data?.blueprints || []);
        setTotal(response.data?.total || 0);
      } catch (err) {
        console.error(err);
        setProducts([]);
        setTotal(0);
      } finally {
        setLoading(false);
      }
    },
    [search],
  );

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const q = params.get("q") || "";
    setSearch(q);
  }, [location.search]);

  useEffect(() => {
    fetchProducts(search);
  }, [fetchProducts, search]);

  useEffect(() => {
    if (!toastMessage) return undefined;

    const timer = setTimeout(() => setToastMessage(""), 2500);
    return () => clearTimeout(timer);
  }, [toastMessage]);

  useEffect(() => {
    if (user?.role !== "customer" || !products.length) return;

    const params = new URLSearchParams(location.search);
    const templateId = Number(params.get("template") || 0);
    if (!templateId) return;

    const matched = products.find((item) => Number(item.id) === templateId);
    if (matched) {
      setCustomizingProduct((prev) =>
        Number(prev?.id) === templateId ? prev : matched,
      );
    }
  }, [user, products, location.search]);

  const handleSearch = (event) => {
    event.preventDefault();
    const q = search.trim();

    navigate(`/customize${q ? `?q=${encodeURIComponent(q)}` : ""}`, {
      replace: false,
    });
  };

  const handleAdd = (product, draft = {}) => {
    if (!requireCustomerLogin(product)) return;
    const profile = resolveSavedTemplateProfile(product || {});
    const bounds = draft?.bounds || {};
    const defaultDimensions = draft?.defaultDimensions || {};
    const metadata = draft?.metadata || {};

    const width =
      Math.round(
        Number(bounds?.width) || Number(defaultDimensions?.width_mm) || 0,
      ) || 0;

    const height =
      Math.round(
        Number(bounds?.height) || Number(defaultDimensions?.height_mm) || 0,
      ) || 0;

    const depth =
      Math.round(
        Number(bounds?.depth) || Number(defaultDimensions?.depth_mm) || 0,
      ) || 0;

    const woodType =
      metadata?.wood_type ||
      product?.primary_material ||
      product?.wood_type ||
      "";

    const finishColor = metadata?.finish_color || product?.finish_color || "";

    const doorStyle = metadata?.door_style || product?.door_style || "";

    const hardware = metadata?.hardware || product?.hardware || "";

    const initialMessage = String(
      draft?.initial_message || draft?.comments || "",
    ).trim();

    const referencePhotos = Array.isArray(draft?.reference_photos)
      ? draft.reference_photos
      : [];

    const normalizedComponents = Array.isArray(draft?.components)
      ? draft.components
      : [];

    const stableCustomKey = buildStableCustomCartKey({
      productId: product?.id,
      templateProfile: profile?.id,
      width,
      height,
      depth,
      woodType,
      finishColor,
      color: finishColor,
      doorStyle,
      hardware,
      initialMessage,
      components: normalizedComponents,
      referencePhotos,
    });

    const lightweightReferencePhotos = referencePhotos.map((photo) => ({
      id: photo.id,
      name: photo.name,
      type: photo.type,
      size: photo.size,
    }));

    addToCustomCart({
      key: stableCustomKey,
      blueprint_id: product.id,
      product_id: product.id,
      product_name: product.title,
      image_url: product.preview_image_url || product.thumbnail_url || "",
      preview_image_url:
        product.preview_image_url || product.thumbnail_url || "",
      item_type: "custom",
      quantity: Math.max(1, Number(draft?.quantity || 1)),

      // 👉 ADDED: Attach the base price to the cart payload instead of 0!
      unit_price: Number(product.base_price || 0),

      wood_type: woodType,
      finish_color: finishColor,
      color: finishColor,
      door_style: doorStyle,
      hardware,

      width,
      height,
      depth,
      unit: "mm",
      comments: initialMessage,
      initial_message: initialMessage,
      reference_photos: lightweightReferencePhotos,

      base_blueprint_title: product.title,
      template_profile: profile.id,
      template_category: profile.category,

      customization_snapshot: {
        width_mm: width,
        height_mm: height,
        depth_mm: depth,
        wood_type: woodType,
        finish_color: finishColor,
        door_style: doorStyle,
        hardware,
        comments: initialMessage,
        initial_message: initialMessage,
        reference_photo_count: lightweightReferencePhotos.length,
        template_profile: profile.id,
      },

      editor_snapshot: {
        worldSize: draft?.worldSize || null,
        components: normalizedComponents,
      },
    });

    setCustomizingProduct(null);
    setToastMessage(`"${product.title}" added to cart!`);
  };

  const renderedCards = useMemo(() => {
    if (loading) {
      return Array.from({ length: 6 }).map((_, index) => (
        <SkeletonCard key={index} />
      ));
    }

    if (!products.length) {
      return (
        <div className="cust-empty-state">
          No custom blueprint templates found.
        </div>
      );
    }

    return products.map((product) => (
      <ProductCard
        key={product.id}
        product={product}
        onView={setViewingProduct}
        onCustomize={(selectedProduct) => {
          if (!requireCustomerLogin(selectedProduct)) return;
          setCustomizingProduct(selectedProduct);
        }}
      />
    ));
  }, [loading, products]);

  return (
    <div className="cust-page">
      {toastMessage ? (
        <div className="cust-floating-toast">{toastMessage}</div>
      ) : null}

      <div className="page-hero">
        <div>
          <h1>Customize Your Order</h1>
          <p>
            Choose an admin-approved furniture template, preview it, then
            customize only the values allowed by the admin blueprint rules.
          </p>
        </div>

        <button
          type="button"
          className="cust-primary-btn"
          onClick={() => navigate("/cart")}
        >
          View Cart {cartCount > 0 ? `(${cartCount})` : ""}
        </button>
      </div>

      <form className="cust-search-bar" onSubmit={handleSearch}>
        <div className="cust-search-input-wrap">
          <Search size={18} />
          <input
            type="text"
            placeholder="Search templates..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <button type="submit" className="cust-search-btn">
          Search
        </button>

        <span className="cust-search-count">
          {total} design{total !== 1 ? "s" : ""} available
        </span>
      </form>

      <div className="cust-products-grid">{renderedCards}</div>

      {viewingProduct ? (
        <ViewModal
          product={viewingProduct}
          onClose={() => setViewingProduct(null)}
          onCustomize={(blueprint) => {
            setViewingProduct(null);
            setCustomizingProduct(blueprint);
          }}
        />
      ) : null}

      {customizingProduct ? (
        <CustomizeModal
          product={customizingProduct}
          onClose={closeCustomizeModal}
          onAdd={handleAdd}
        />
      ) : null}
    </div>
  );
}
