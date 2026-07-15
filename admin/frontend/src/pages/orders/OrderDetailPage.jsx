// src/pages/orders/OrderDetailPage.jsx – compact polished detail view (Admin)
import React, { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api, { buildAssetUrl } from "../../services/api";
import toast from "react-hot-toast";
import CustomerTemplateWorkbench from "../customer/CustomerTemplateWorkbench";
import OrderDiscussionPanel from "./OrderDiscussionPanel";

const STATUS_STYLE = {
  pending: { bg: "#ffffff", color: "#52525b", border: "#d4d4d8" },
  confirmed: { bg: "#f4f4f5", color: "#18181b", border: "#e4e4e7" },
  contract_released: { bg: "#f4f4f5", color: "#18181b", border: "#e4e4e7" },
  production: { bg: "#f4f4f5", color: "#18181b", border: "#e4e4e7" },
  shipping: { bg: "#f4f4f5", color: "#18181b", border: "#e4e4e7" },
  delivered: { bg: "#18181b", color: "#ffffff", border: "#18181b" },
  completed: { bg: "#0a0a0a", color: "#ffffff", border: "#0a0a0a" },
  cancelled: { bg: "#fef2f2", color: "#991b1b", border: "#fecaca" },
};

const STATUS_LABELS = {
  pending: "Pending",
  confirmed: "Confirmed",
  contract_released: "Contract Released",
  production: "Production",
  shipping: "Shipping",
  delivered: "Delivered",
  completed: "Completed",
  cancelled: "Cancelled",
};

const ONLINE_STANDARD_DELIVERY_TIMELINE = [
  "pending",
  "confirmed",
  "shipping",
  "delivered",
  "completed",
];

const ONLINE_STANDARD_PICKUP_TIMELINE = ["pending", "confirmed", "completed"];

const BLUEPRINT_TIMELINE = [
  "pending",
  "confirmed",
  "contract_released",
  "production",
  "shipping",
  "delivered",
  "completed",
];

const WALKIN_PICKUP_TIMELINE = ["pending", "confirmed", "completed"];

const WALKIN_DELIVERY_TIMELINE = [
  "pending",
  "confirmed",
  "shipping",
  "delivered",
  "completed",
];

const WALKIN_BLUEPRINT_TIMELINE = [
  "pending",
  "confirmed",
  "contract_released",
  "production",
  "completed",
];

const DETAIL_TABS = [
  { key: "overview", label: "Overview" },
  { key: "payment", label: "Payment" },
  { key: "fulfillment", label: "Fulfillment" },
  { key: "blueprint", label: "Blueprint" },
  { key: "discussion", label: "Discussion" },
];

const STATUS_TRANSITIONS = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["contract_released", "production", "cancelled"],
  contract_released: ["production", "cancelled"],
  production: ["shipping", "cancelled"],
  shipping: ["delivered", "completed"],
  delivered: ["completed"],
  completed: [],
  cancelled: [],
};

const PAYMENT_STYLE = {
  unpaid: { bg: "#fef2f2", color: "#991b1b", border: "#fecaca" },
  paid: { bg: "#18181b", color: "#ffffff", border: "#18181b" },
  partial: { bg: "#ffffff", color: "#52525b", border: "#d4d4d8" },
  pending: { bg: "#ffffff", color: "#52525b", border: "#d4d4d8" },
  verified: { bg: "#0a0a0a", color: "#ffffff", border: "#0a0a0a" },
  rejected: { bg: "#fef2f2", color: "#dc2626", border: "#fecaca" },
};

const TASK_STYLE = {
  pending: { bg: "#ffffff", color: "#52525b", border: "#d4d4d8" },
  in_progress: { bg: "#f4f4f5", color: "#18181b", border: "#e4e4e7" },
  completed: { bg: "#0a0a0a", color: "#ffffff", border: "#0a0a0a" },
};

const normalize = (value) => String(value || "").toLowerCase();

function normalizeTaskRole(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}

const BLUEPRINT_TASK_ROLE_OPTIONS = [
  "Cutting Machine",
  "Edge Banding",
  "Horizontal Drilling",
  "Retouching",
  "Packing",
];

const REQUIRED_BLUEPRINT_TASK_ROLES =
  BLUEPRINT_TASK_ROLE_OPTIONS.map(normalizeTaskRole);

const getTaskRoleLabel = (role) =>
  BLUEPRINT_TASK_ROLE_OPTIONS.find(
    (option) => normalizeTaskRole(option) === normalizeTaskRole(role),
  ) || titleCase(role);

const titleCase = (value) => {
  const str = String(value || "").replace(/_/g, " ");
  return str ? str.charAt(0).toUpperCase() + str.slice(1) : "—";
};

const prettify = (value) =>
  String(value ?? "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());

const formatMoney = (value) =>
  `₱ ${Number(value || 0).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
  })}`;

const formatDateTime = (value) => {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("en-PH");
};

const formatDate = (value) => {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleDateString("en-PH", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
};

const getStatusLabel = (status) =>
  STATUS_LABELS[normalize(status)] || titleCase(status);

const getChannelMeta = (channel) => {
  const key = normalize(channel);
  return key === "online"
    ? { label: "Online", bg: "#f4f4f5", color: "#18181b", border: "#e4e4e7" }
    : { label: "Walk-in", bg: "#ffffff", color: "#52525b", border: "#d4d4d8" };
};

const getTone = (
  styleMap,
  key,
  fallback = { bg: "#f4f4f5", color: "#18181b", border: "#e4e4e7" },
) => styleMap[normalize(key)] || fallback;

const getTimelineStepState = (steps, currentStatus, stepKey) => {
  const currentIndex = steps.indexOf(currentStatus);
  const stepIndex = steps.indexOf(stepKey);

  if (currentIndex === -1) {
    return stepIndex === 0 ? "current" : "upcoming";
  }

  if (stepIndex < currentIndex) return "done";
  if (stepIndex === currentIndex) return "current";
  return "upcoming";
};

const getTimelineNote = (
  step,
  {
    order,
    blueprintTasks,
    hasBlueprintTasks,
    completedBlueprintTasks,
    hasSignedDeliveryReceipt,
    isWalkInOrder,
  },
) => {
  switch (step) {
    case "pending":
      return order?.created_at
        ? `Created ${formatDate(order.created_at)}`
        : "Awaiting review";

    case "confirmed":
      return normalize(
        order?.payment_status_display || order?.payment_status,
      ) === "paid"
        ? "Payment settled"
        : titleCase(
            order?.payment_status_display || order?.payment_status || "unpaid",
          );

    case "contract_released":
      return order?.contract ? "Contract available" : "Waiting for contract";

    case "production":
      if (hasBlueprintTasks) {
        return `${completedBlueprintTasks.length}/${blueprintTasks.length} blueprint task${
          blueprintTasks.length === 1 ? "" : "s"
        } completed`;
      }
      return "Ready for production";

    case "shipping":
      if (order?.delivery?.scheduled_date) {
        return `Scheduled ${formatDate(order.delivery.scheduled_date)}`;
      }
      return order?.delivery
        ? "Delivery prepared"
        : "Awaiting delivery schedule";

    case "delivered":
      if (isWalkInOrder) {
        return order?.delivery?.delivered_date
          ? `Delivered ${formatDate(order.delivery.delivered_date)}`
          : order?.delivery
            ? "Delivery completed"
            : "Not yet delivered";
      }

      return hasSignedDeliveryReceipt
        ? "Signed receipt uploaded"
        : order?.delivery
          ? "Awaiting signed receipt"
          : "Not yet delivered";

    case "completed":
      return normalize(
        order?.payment_status_display || order?.payment_status,
      ) === "paid"
        ? "Transaction closed"
        : "Order finalized";
    default:
      return "";
  }
};

const safeParseUrls = (raw) => {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.filter(Boolean);
    if (typeof parsed === "string" && parsed.trim()) return [parsed];
  } catch {
    return [raw]; // If it's just a normal URL string, return it in an array
  }
  return [];
};

const getProofType = (url) => {
  const cleanUrl = String(url || "")
    .split("?")[0]
    .toLowerCase();

  if (/\.(jpg|jpeg|png|gif|webp|bmp|svg)$/.test(cleanUrl)) return "image";
  if (/\.pdf$/.test(cleanUrl)) return "pdf";
  return "other";
};

const hasCustomEditorSnapshot = (item) =>
  Array.isArray(item?.editor_snapshot?.components) &&
  item.editor_snapshot.components.length > 0;

const getCustomRequestDims = (item = {}) => {
  const components = Array.isArray(item?.editor_snapshot?.components)
    ? item.editor_snapshot.components
    : [];

  if (!components.length) {
    return {
      width: Number(item.requested_width) || 0,
      height: Number(item.requested_height) || 0,
      depth: Number(item.requested_depth) || 0,
    };
  }

  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;

  components.forEach((comp) => {
    const x = Number(comp?.x) || 0;
    const y = Number(comp?.y) || 0;
    const z = Number(comp?.z) || 0;
    const w = Math.max(0, Number(comp?.width) || 0);
    const h = Math.max(0, Number(comp?.height) || 0);
    const d = Math.max(0, Number(comp?.depth) || 0);

    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    minZ = Math.min(minZ, z);

    maxX = Math.max(maxX, x + w);
    maxY = Math.max(maxY, y + h);
    maxZ = Math.max(maxZ, z + d);
  });

  return {
    width: Math.round(maxX - minX) || Number(item.requested_width) || 0,
    height: Math.round(maxY - minY) || Number(item.requested_height) || 0,
    depth: Math.round(maxZ - minZ) || Number(item.requested_depth) || 0,
  };
};

const buildCustomRequestPreviewBlueprint = (item) => {
  const components = Array.isArray(item?.editor_snapshot?.components)
    ? item.editor_snapshot.components
    : [];

  const worldSize =
    item?.editor_snapshot?.worldSize &&
    typeof item.editor_snapshot.worldSize === "object"
      ? item.editor_snapshot.worldSize
      : { w: 6400, h: 3200, d: 5200 };

  const dims = getCustomRequestDims(item);

  return {
    id: item.product_id || item.id,
    title: item.display_name || item.product_name || "Custom Furniture",
    thumbnail_url: item.preview_image_url || "",
    preview_image_url: item.preview_image_url || "",
    default_dimensions: {
      width_mm: dims.width,
      height_mm: dims.height,
      depth_mm: dims.depth,
    },
    bounds: {
      width: dims.width,
      height: dims.height,
      depth: dims.depth,
    },
    design_data: {
      components,
      worldSize,
      bounds: {
        width: dims.width,
        height: dims.height,
        depth: dims.depth,
      },
    },
    view_3d_data: {
      components,
      worldSize,
      bounds: {
        width: dims.width,
        height: dims.height,
        depth: dims.depth,
      },
    },
    metadata: {
      wood_type: item.requested_wood_type || "",
      finish_color: item.requested_finish_color || "",
      door_style: item.requested_door_style || "",
      hardware: item.requested_hardware || "",
    },
  };
};

export default function OrderDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);

  const [statusModal, setStatusModal] = useState(false);
  const [newStatus, setNewStatus] = useState("");
  // Guards against double-submit: without this, a fast double-click (or a
  // slow network) can fire handleStatusUpdate twice concurrently — the
  // first call succeeds, then the second arrives after the status has
  // already changed and gets rejected as an "invalid transition",
  // producing a confusing error+error+success toast sequence even
  // though the update itself worked correctly.
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const paymentReviewLockRef = useRef(false);
  const [reviewingPayment, setReviewingPayment] = useState({ id: null, action: "" });

  const [proofPreview, setProofPreview] = useState({
    open: false,
    url: "",
    type: "other",
  });

  const [deliveryReceiptPreview, setDeliveryReceiptPreview] = useState({
    open: false,
    url: "",
    type: "other",
  });

  const [customRequestPreviewItem, setCustomRequestPreviewItem] =
    useState(null);
  const [customRequestActionLoading, setCustomRequestActionLoading] =
    useState("");
  const [activeTab, setActiveTab] = useState("overview");
  const canUseDiscussion = normalize(order?.order_type) === "blueprint";

  const [assignModal, setAssignModal] = useState(false);
  const [assignableStaff, setAssignableStaff] = useState([]);
  const [loadingAssignable, setLoadingAssignable] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [updatingTaskId, setUpdatingTaskId] = useState(null);
  const [assignmentBlueprintId, setAssignmentBlueprintId] = useState(null);
  const [assignForm, setAssignForm] = useState({
    staff_id: "",
    due_date: "",
    note: "",
  });

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/orders/${id}`);
      setOrder(data);
      setNewStatus(data.status);
    } catch (err) {
      toast.error(
        err?.response?.data?.message || "Failed to load order details.",
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [id]); // eslint-disable-line

  useEffect(() => {
    if (activeTab === "discussion" && !canUseDiscussion) {
      setActiveTab("overview");
    }
  }, [activeTab, canUseDiscussion]);

  const handleStatusUpdate = async () => {
    if (updatingStatus) return;

    const nextStatus = normalize(newStatus);

    if (!nextStatus || nextStatus === currentOrderStatus) {
      toast.error("Select a valid next status first.");
      return;
    }

    const blueprintTasks = Array.isArray(order?.blueprint_tasks)
      ? order.blueprint_tasks
      : [];
    const hasBlueprintTasks = blueprintTasks.length > 0;

    if (
      isBlueprintOrder &&
      ["shipping", "delivered", "completed"].includes(nextStatus)
    ) {
      if (!hasRequiredBlueprintTaskPacket) {
        toast.error(
          `Create all required production tasks first: ${missingRequiredBlueprintTaskRoles
            .map(getTaskRoleLabel)
            .join(", ")}.`,
        );
        return;
      }
      if (!allBlueprintTasksCompleted) {
        toast.error(
          `Complete all required production tasks first: ${incompleteRequiredBlueprintTaskRoles
            .map(getTaskRoleLabel)
            .join(", ")}.`,
        );
        return;
      }
    }

    // 👉 NEW: Strict Payment Verification Check
    if (
      !isBlueprintOrder &&
      nextStatus === "shipping" &&
      normalizedPaymentMethod !== "cod" &&
      paymentBalance > 0
    ) {
      toast.error("The payment need to be verified first.");
      return;
    }

    // 👉 NEW: Strict Delivery Rider Checks
    if (
      hasDeliveryRequirement &&
      ["delivered", "completed"].includes(nextStatus)
    ) {
      if (!order?.delivery) {
        toast.error("You need to assign a delivery rider first.");
        return;
      }
      if (!hasSignedDeliveryReceipt) {
        toast.error("It must be delivered and finished by the rider first.");
        return;
      }
    }

    if (
      isBlueprintOrder &&
      nextStatus === "production" &&
      !hasRequiredBlueprintDownPayment
    ) {
      toast.error(
        "Blueprint orders require at least a 30% verified down payment before moving to production.",
      );
      return;
    }

    setUpdatingStatus(true);
    try {
      await api.patch(`/orders/${id}/status`, { status: newStatus });
      toast.success(`Status updated to "${titleCase(newStatus)}".`);
      setStatusModal(false);
      load();
    } catch (err) {
      toast.error(
        err?.response?.data?.message || "Failed to update order status.",
      );
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handleAccept = async () => {
    try {
      await api.post(`/orders/${id}/accept`);
      toast.success("Order accepted.");
      load();
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to accept order.");
    }
  };

  const handleDecline = async () => {
    const reason = window.prompt("Enter reason for declining:");
    if (reason === null) return;

    try {
      await api.post(`/orders/${id}/decline`, { reason });
      toast.success("Order declined.");
      load();
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to decline order.");
    }
  };

  
  

  const verifyPayment = async (paymentId, action) => {
    if (paymentReviewLockRef.current) return;
    paymentReviewLockRef.current = true;
    setReviewingPayment({ id: paymentId, action });
    try {
      const { data } = await api.post(`/orders/${id}/verify-payment`, {
        payment_id: paymentId,
        action,
      });
      toast.success(data?.message || `Payment ${action}.`);
      await load();
    } catch (err) {
      // api.js's shared interceptor already toasts status 400 (generic
      // message block), 403, 422, 500, and network/no-response errors. It
      // intentionally does NOT toast 401 (session cleanup/redirect only)
      // or 404. Only fall back locally for 404, so no failure is ever
      // shown to the admin twice.
      if (err?.response?.status === 404) {
        toast.error(
          err?.response?.data?.message || `Failed to mark payment as ${action}.`,
        );
      }
    } finally {
      paymentReviewLockRef.current = false;
      setReviewingPayment({ id: null, action: "" });
    }
  };



  const openProofPreview = (url) => {
    const resolvedUrl = buildAssetUrl(url);
    setProofPreview({
      open: true,
      url: resolvedUrl,
      type: getProofType(resolvedUrl),
    });
  };

  const closeProofPreview = () => {
    setProofPreview({
      open: false,
      url: "",
      type: "other",
    });
  };

  const openDeliveryReceiptPreview = (url) => {
    const resolvedUrl = buildAssetUrl(url);
    setDeliveryReceiptPreview({
      open: true,
      url: resolvedUrl,
      type: getProofType(resolvedUrl),
    });
  };

  const closeDeliveryReceiptPreview = () => {
    setDeliveryReceiptPreview({
      open: false,
      url: "",
      type: "other",
    });
  };

  const openCustomRequestPreview = (item) => {
    setCustomRequestPreviewItem(item || null);
  };

  const closeCustomRequestPreview = () => {
    setCustomRequestPreviewItem(null);
  };

  const handleCustomRequestAction = async (action) => {
    if (!order?.id) return;

    let payload = {};

    

    if (action === "reject") {
      const reason = window.prompt("Enter rejection reason:");
      if (reason === null) return;
      payload = { reason };
    }

    setCustomRequestActionLoading(action);

    try {
      const { data } = await api.post(
        `/orders/${order.id}/custom-request/${action}`,
        payload,
      );

      toast.success(data?.message || "Custom request updated.");
      load();
    } catch (err) {
      toast.error(
        err?.response?.data?.message || "Failed to update custom request.",
      );
    } finally {
      setCustomRequestActionLoading("");
    }
  };

  const openAssignModal = async () => {
    if (!blueprintId) {
      toast.error("This order is not linked to a blueprint.");
      return;
    }

    if (!canAssignBlueprintStaff) {
      toast.error(
        "Staff assignment is only available after contract release or during production.",
      );
      return;
    }

    if (hasBlueprintTasks) {
      toast.error(
        "This production order already has a primary indoor staff assignment.",
      );
      return;
    }

    setLoadingAssignable(true);
    try {
      const { data } = await api.get(`/orders/${id}/assignable-staff`);
      setAssignableStaff(Array.isArray(data?.staff) ? data.staff : []);
      setAssignmentBlueprintId(data?.blueprint_id || blueprintId);
      setAssignForm({
        staff_id: "",
        due_date: "",
        note: "",
      });
      setAssignModal(true);
    } catch (err) {
      toast.error(
        err?.response?.data?.message || "Failed to load assignable staff.",
      );
    } finally {
      setLoadingAssignable(false);
    }
  };

  const handleAssignStaff = async () => {
    if (hasBlueprintTasks) {
      toast.error(
        "This production order already has a primary indoor staff assignment.",
      );
      return;
    }

    if (!assignForm.staff_id) {
      toast.error("Please select a staff member.");
      return;
    }

    if (!assignForm.due_date) {
      toast.error("Due date is required.");
      return;
    }

    const parsedDueDate = new Date(assignForm.due_date);
    if (Number.isNaN(parsedDueDate.getTime())) {
      toast.error("Due date is invalid.");
      return;
    }

    if (parsedDueDate.getTime() < Date.now() - 60000) {
      toast.error("Due date cannot be in the past.");
      return;
    }

    setAssigning(true);
    try {
      const payload = {
        staff_id: Number(assignForm.staff_id),
        due_date: `${assignForm.due_date.replace("T", " ")}:00`,
        note: assignForm.note.trim(),
      };

      await api.patch(`/orders/${id}/assign-staff`, payload);
      toast.success("Primary indoor staff assigned successfully.");
      setAssignModal(false);
      load();
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to assign staff.");
    } finally {
      setAssigning(false);
    }
  };

  const handleTaskStatusUpdate = async (taskId, nextStatus) => {
    setUpdatingTaskId(taskId);

    try {
      const { data } = await api.patch(`/orders/${id}/tasks/${taskId}/status`, {
        status: nextStatus,
      });

      toast.success(
        data?.message || `Task marked as "${titleCase(nextStatus)}".`,
      );
      load();
    } catch (err) {
      toast.error(
        err?.response?.data?.message || "Failed to update task status.",
      );
    } finally {
      setUpdatingTaskId(null);
    }
  };

  if (loading) return <div style={center}>Loading order...</div>;
  if (!order) return <div style={center}>Order not found.</div>;

  const normalizedOrderStatus = normalize(order?.status);
  const statusTone = getTone(STATUS_STYLE, normalizedOrderStatus);
  const channelMeta = getChannelMeta(order?.channel || order?.type);
  const normalizedPaymentStatus = normalize(
    order?.payment_status_display || order?.payment_status || "unpaid",
  );
  const normalizedPaymentMethod = normalize(order?.payment_method);
  const isCashLikePaymentMethod = ["cash", "cod", "cop"].includes(
    normalizedPaymentMethod,
  );
  const orderPaymentTone = getTone(PAYMENT_STYLE, normalizedPaymentStatus);
  const PAY_METHOD_LABELS = {
    cod: "Cash on Delivery",
    cop: "Cash on Pick-up",
    gcash: "GCash",
    bank_transfer: "Bank Transfer",
    paymongo: "Online Payment",
    cash: "Cash",
  };

  const blueprintTasks = Array.isArray(order?.blueprint_tasks)
    ? order.blueprint_tasks
    : [];

  const hasBlueprintTasks = blueprintTasks.length > 0;

  const activeBlueprintTasks = blueprintTasks.filter((task) =>
    ["pending", "in_progress"].includes(normalize(task?.status)),
  );

  const completedBlueprintTasks = blueprintTasks.filter(
    (task) => normalize(task?.status) === "completed",
  );

  const existingBlueprintTaskRoles = new Set(
    blueprintTasks
      .map((task) => normalizeTaskRole(task?.task_role))
      .filter(Boolean),
  );

  const completedBlueprintTaskRoles = new Set(
    completedBlueprintTasks
      .map((task) => normalizeTaskRole(task?.task_role))
      .filter(Boolean),
  );

  const missingRequiredBlueprintTaskRoles =
    REQUIRED_BLUEPRINT_TASK_ROLES.filter(
      (role) => !existingBlueprintTaskRoles.has(role),
    );

  const incompleteRequiredBlueprintTaskRoles =
    REQUIRED_BLUEPRINT_TASK_ROLES.filter(
      (role) => !completedBlueprintTaskRoles.has(role),
    );

  const hasRequiredBlueprintTaskPacket =
    missingRequiredBlueprintTaskRoles.length === 0;

  const allBlueprintTasksCompleted =
    incompleteRequiredBlueprintTaskRoles.length === 0;

  const isDeliveryPhaseOrDone = [
    "shipping",
    "delivered",
    "completed",
    "cancelled",
  ].includes(normalizedOrderStatus);

  const currentOrderStatus = normalizedOrderStatus;
  const currentChannel = normalize(order?.channel || order?.type);
  const isWalkInOrder =
    currentChannel === "walkin" || currentChannel === "walk-in";

  const isOnlineOrder = currentChannel === "online";
  const hasPaymentRecords =
    Array.isArray(order?.payments) && order.payments.length > 0;
  const hasPendingPaymentActions =
    hasPaymentRecords &&
    order.payments.some((payment) => normalize(payment?.status) === "pending");
  const verifiedPaymentTotal = Number(order?.payment_verified_total || 0);
  const paymentBalance = Number(order?.payment_balance || 0);
  const hasContractTerms = Boolean(
    String(order?.contract?.materials_used || "").trim(),
  );
  const totalAmount = Number(order?.total_amount || order?.total || 0);
  const requiredBlueprintDownPayment = Number((totalAmount * 0.3).toFixed(2));

  const blueprintId =
    order?.contract?.blueprint_id || order?.blueprint_id || null;
  const canAssignBlueprintStaff =
    Boolean(blueprintId) &&
    ["contract_released", "production"].includes(normalize(order?.status));

  const hasBlueprintFlow = Boolean(
    blueprintId || order?.contract || hasBlueprintTasks,
  );

  const isBlueprintOrder =
    normalize(order?.order_type) === "blueprint" ||
    Boolean(blueprintId || order?.contract);
  const hasDeliveryRequirement = Boolean(
    order?.delivery ||
    String(order?.delivery_address || "").trim() ||
    String(order?.requested_delivery_date || "").trim(),
  );

  const latestEstimation = order?.latest_estimation || null;
  const hasEstimation = Boolean(latestEstimation?.id);
  const estimationStatus = normalize(latestEstimation?.status);
  const estimationApproved = estimationStatus === "approved";
  const estimationSentToCustomer = estimationStatus === "sent";
  const estimationRejectedByCustomer = estimationStatus === "rejected";

  const isStandardOrder = !isBlueprintOrder;

  const isWalkInStandardOrder = isWalkInOrder && isStandardOrder;
  const isWalkInPickupOrder = isWalkInStandardOrder && !hasDeliveryRequirement;
  const isWalkInDeliveryOrder = isWalkInStandardOrder && hasDeliveryRequirement;

  const isOnlineStandardOrder = isOnlineOrder && isStandardOrder;
  const isOnlineStandardPickupOrder =
    isOnlineStandardOrder && normalizedPaymentMethod === "cop";

  const isOnlineStandardDeliveryOrder =
    isOnlineStandardOrder && !isOnlineStandardPickupOrder;
  const requiresDeliveryReceiptForCompletion = hasDeliveryRequirement;
  const needsContractFirst =
    isBlueprintOrder &&
    normalizedOrderStatus === "confirmed" &&
    estimationApproved &&
    !order?.contract;
  const hasRequiredBlueprintDownPayment =
    normalizedPaymentStatus === "paid" ||
    verifiedPaymentTotal >= Math.max(0, requiredBlueprintDownPayment - 0.01);

  const standardNeedsFullPaymentBeforeFulfillment =
    !isWalkInOrder &&
    !isBlueprintOrder &&
    normalizedPaymentMethod !== "cod" &&
    paymentBalance > 0;

  const blueprintNeedsDownPaymentBeforeProduction =
    isBlueprintOrder &&
    ["confirmed", "contract_released"].includes(normalizedOrderStatus) &&
    !hasRequiredBlueprintDownPayment;
  const effectiveStatusTransitions = isBlueprintOrder
    ? isWalkInOrder
      ? {
          pending: ["confirmed", "cancelled"],
          confirmed: ["contract_released", "cancelled"],
          contract_released: ["production", "cancelled"],
          production: ["completed", "cancelled"],
          shipping: ["completed"],
          delivered: ["completed"],
          completed: [],
          cancelled: [],
        }
      : {
          pending: ["confirmed", "cancelled"],
          confirmed: ["contract_released", "cancelled"],
          contract_released: ["production", "cancelled"],
          production: ["shipping", "cancelled"],
          shipping: ["delivered", "completed"],
          delivered: ["completed"],
          completed: [],
          cancelled: [],
        }
    : isWalkInPickupOrder
      ? {
          pending: ["confirmed", "cancelled"],
          confirmed: ["completed", "cancelled"],
          contract_released: ["production", "cancelled"],
          production: ["completed", "cancelled"],
          shipping: ["completed"],
          delivered: ["completed"],
          completed: [],
          cancelled: [],
        }
      : isWalkInDeliveryOrder
        ? {
            pending: ["confirmed", "cancelled"],
            confirmed: ["shipping", "cancelled"],
            contract_released: ["production", "cancelled"],
            production: ["shipping", "cancelled"],
            shipping: ["delivered", "cancelled"],
            delivered: ["completed"],
            completed: [],
            cancelled: [],
          }
        : isOnlineStandardPickupOrder
          ? {
              pending: ["confirmed", "cancelled"],
              confirmed: ["completed", "cancelled"],
              contract_released: ["production", "cancelled"],
              production: ["completed", "cancelled"],
              shipping: ["completed"],
              delivered: ["completed"],
              completed: [],
              cancelled: [],
            }
          : {
              pending: ["confirmed", "cancelled"],
              confirmed: ["shipping", "cancelled"],
              contract_released: ["production", "cancelled"],
              production: ["shipping", "cancelled"],
              shipping: ["delivered", "completed"],
              delivered: ["completed"],
              completed: [],
              cancelled: [],
            };
  const allowedNextStatuses =
    effectiveStatusTransitions[currentOrderStatus] || [];
  const hasSignedDeliveryReceipt = Boolean(order?.delivery?.signed_receipt);
  const selectableNextStatuses = allowedNextStatuses.filter((status) => {
    const normalizedStatus = normalize(status);

    const blockedByIncompleteTasks =
      isBlueprintOrder &&
      ["shipping", "delivered", "completed"].includes(normalizedStatus) &&
      (!hasRequiredBlueprintTaskPacket || !allBlueprintTasksCompleted);

    const blockedByMissingReceipt =
      !isWalkInOrder &&
      normalizedStatus === "completed" &&
      (!order?.delivery || !hasSignedDeliveryReceipt);

    const blockedByUnsettledPayment =
      normalizedStatus === "completed" && paymentBalance > 0;

    const blockedByStandardFullPayment =
      !isWalkInOrder &&
      !isBlueprintOrder &&
      normalizedPaymentMethod !== "cod" &&
      ["shipping", "delivered"].includes(normalize(status)) &&
      paymentBalance > 0;

    const blockedByBlueprintDownPayment =
      isBlueprintOrder &&
      normalizedStatus === "production" &&
      !hasRequiredBlueprintDownPayment;

    return !(
      blockedByIncompleteTasks ||
      blockedByMissingReceipt ||
      blockedByUnsettledPayment ||
      blockedByStandardFullPayment ||
      blockedByBlueprintDownPayment
    );
  });

  const shouldShowMissingDeliverySection =
    requiresDeliveryReceiptForCompletion &&
    !order?.delivery &&
    ["shipping", "delivered", "completed"].includes(normalizedOrderStatus);

  const shouldShowStatusButton =
    currentOrderStatus !== "pending" &&
    selectableNextStatuses.length > 0 &&
    !needsContractFirst;
  const shouldShowFulfillmentTab = Boolean(
    order?.delivery ||
    order?.contract ||
    shouldShowMissingDeliverySection ||
    ["production", "shipping", "delivered", "completed"].includes(
      normalizedOrderStatus,
    ),
  );

  const nextStepLabel =
    normalizedOrderStatus === "pending"
      ? "Review & accept"
      : normalizedOrderStatus === "confirmed"
        ? isWalkInPickupOrder
          ? "Complete order"
          : isWalkInDeliveryOrder
            ? "Schedule / dispatch delivery"
            : isOnlineStandardPickupOrder
              ? paymentBalance > 0
                ? "Await payment before completion"
                : "Complete order"
              : isOnlineStandardDeliveryOrder
                ? normalizedPaymentMethod === "cod"
                  ? "Prepare shipping or delivery"
                  : paymentBalance > 0
                    ? "Await full payment before shipping"
                    : "Prepare shipping or delivery"
                : isBlueprintOrder
                  ? !hasEstimation
                    ? "Create estimate"
                    : estimationSentToCustomer
                      ? "Waiting for customer approval"
                      : estimationRejectedByCustomer
                        ? "Revise and resend estimate"
                        : !estimationApproved
                          ? "Finalize / send estimate"
                          : !order?.contract
                            ? "Generate contract"
                            : "Review order"
                  : "Review order"
        : normalizedOrderStatus === "contract_released"
          ? "Move to production"
          : normalizedOrderStatus === "production"
            ? isWalkInOrder
              ? "Complete order when finished"
              : "Prepare shipping or delivery"
            : normalizedOrderStatus === "shipping"
              ? "Mark delivered after handoff"
              : normalizedOrderStatus === "delivered"
                ? requiresDeliveryReceiptForCompletion &&
                  !hasSignedDeliveryReceipt
                  ? "Upload signed receipt and complete"
                  : "Complete order"
                : normalizedOrderStatus === "completed"
                  ? "Order closed"
                  : normalizedOrderStatus === "cancelled"
                    ? "Order closed"
                    : "Review order";

  const timelineSteps = isWalkInPickupOrder
    ? WALKIN_PICKUP_TIMELINE
    : isWalkInDeliveryOrder
      ? WALKIN_DELIVERY_TIMELINE
      : isOnlineStandardPickupOrder
        ? ONLINE_STANDARD_PICKUP_TIMELINE
        : isOnlineStandardDeliveryOrder
          ? ONLINE_STANDARD_DELIVERY_TIMELINE
          : hasBlueprintFlow
            ? isWalkInOrder && !hasDeliveryRequirement
              ? WALKIN_BLUEPRINT_TIMELINE
              : BLUEPRINT_TIMELINE
            : ONLINE_STANDARD_DELIVERY_TIMELINE;

  const timelineCurrentKey =
    normalizedOrderStatus === "cancelled"
      ? order?.delivery
        ? "shipping"
        : hasBlueprintTasks
          ? "production"
          : normalizedPaymentStatus === "paid"
            ? "confirmed"
            : "pending"
      : currentOrderStatus;

  const assignmentPhaseText =
    normalizedOrderStatus === "shipping"
      ? "Ready for delivery / dispatched"
      : normalizedOrderStatus === "delivered"
        ? "Delivered, awaiting final completion"
        : normalizedOrderStatus === "completed"
          ? "Order completed"
          : normalizedOrderStatus === "cancelled"
            ? "Order cancelled"
            : allBlueprintTasksCompleted
              ? "All required production tasks completed"
              : canAssignBlueprintStaff
                ? missingRequiredBlueprintTaskRoles.length > 0
                  ? `Assign remaining: ${missingRequiredBlueprintTaskRoles
                      .map(getTaskRoleLabel)
                      .join(", ")}`
                  : `Complete remaining: ${incompleteRequiredBlueprintTaskRoles
                      .map(getTaskRoleLabel)
                      .join(", ")}`
                : "Waiting for contract release / production stage";

  const customRequestItems = Array.isArray(order?.custom_request_items)
    ? order.custom_request_items
    : [];

  const hasCustomRequestItems = customRequestItems.length > 0;

  const customRequestPreviewBlueprint = customRequestPreviewItem
    ? buildCustomRequestPreviewBlueprint(customRequestPreviewItem)
    : null;

  const needsCustomRequestAdminReview =
    hasCustomRequestItems && normalizedOrderStatus === "pending";
  const summaryCards = [
    {
      label: "Current Status",
      value: getStatusLabel(order?.status),
      tone: statusTone,
    },
    {
      label: "Payment Status",
      value: titleCase(
        order?.payment_status_display || order?.payment_status || "unpaid",
      ),
      tone: orderPaymentTone,
    },
    {
      label: "Total Amount",
      value: formatMoney(totalAmount),
      tone: { bg: "#f4f4f5", color: "#18181b", border: "#e4e4e7" },
    },
    hasBlueprintFlow
      ? {
          label: "Blueprint Tasks",
          value: hasBlueprintTasks
            ? `${completedBlueprintTasks.length}/${blueprintTasks.length}`
            : "Ready",
          tone: { bg: "#ffffff", color: "#52525b", border: "#d4d4d8" },
        }
      : {
          label: "Next Step",
          value: nextStepLabel,
          tone: { bg: "#ffffff", color: "#52525b", border: "#d4d4d8" },
        },
  ];

  const visibleTabs = DETAIL_TABS.filter((tab) => {
    if (tab.key === "blueprint")
      return Boolean(blueprintId || order.contract || hasBlueprintTasks);

    if (tab.key === "discussion") return canUseDiscussion;

    if (tab.key === "fulfillment") return shouldShowFulfillmentTab;

    if (tab.key === "payment")
      return Boolean(
        hasPaymentRecords || normalizedPaymentStatus || isOnlineOrder,
      );

    return true;
  });

  return (
    <div style={pageShell}>
      <div style={heroCard}>
        <div style={heroTop}>
          <div style={{ flex: 1, minWidth: 280 }}>
            <div style={eyebrow}>Sales & Orders</div>

            <div style={heroTitleRow}>
              <button onClick={() => navigate("/admin/orders")} style={btnBack}>
                ← Orders
              </button>

              <h1 style={pageTitle}>
                Order #{String(order.id).padStart(5, "0")}
              </h1>

              <span
                style={{
                  ...pill,
                  background: statusTone.bg,
                  color: statusTone.color,
                  border: `1px solid ${statusTone.border}`,
                }}
              >
                {getStatusLabel(order.status)}
              </span>

              <span
                style={{
                  ...pill,
                  background: channelMeta.bg,
                  color: channelMeta.color,
                  border: `1px solid ${channelMeta.border}`,
                }}
              >
                {channelMeta.label}
              </span>
            </div>

            <p style={pageSubtitle}>
              Review payment progress, contract status, delivery details, and
              blueprint task handoff for this order.
            </p>
          </div>



          <div style={heroActions}>
            {normalizedOrderStatus === "pending" &&
              isOnlineStandardOrder && (
                <>
                  <button onClick={handleAccept} style={btnAccept}>
                    Accept
                  </button>
                  <button onClick={handleDecline} style={btnDecline}>
                    Decline
                  </button>
                </>
              )}
            
            {isBlueprintOrder &&
              normalizedOrderStatus === "confirmed" &&
              blueprintId &&
              (!hasEstimation ||
                estimationRejectedByCustomer ||
                estimationStatus === "draft") && (
                <button
                  onClick={() =>
                    navigate(`/admin/blueprints/${blueprintId}/estimation`)
                  }
                  style={btnPrimary}
                >
                  {hasEstimation ? "Revise Estimate" : "Create Estimate"}
                </button>
              )}

            {isBlueprintOrder &&
              normalizedOrderStatus === "confirmed" &&
              blueprintId &&
              estimationSentToCustomer && (
                <span style={mutedBadge}>
                  Waiting for customer quotation decision.
                </span>
              )}

            {needsContractFirst && (
              <button
                onClick={() =>
                  navigate("/admin/contracts", {
                    state: {
                      contractDraft: {
                        blueprint_id: String(blueprintId),
                        order_id: String(order.id),
                      },
                    },
                  })
                }
                style={btnPrimary}
              >
                Generate Contract
              </button>
            )}

            {shouldShowStatusButton && (
              <button
                onClick={() => {
                  setNewStatus(selectableNextStatuses[0] || currentOrderStatus);
                  setStatusModal(true);
                }}
                style={btnPrimary}
              >
                Update Status
              </button>
            )}
          </div>
        </div>

        <div style={statsGrid}>
          {summaryCards.map((card) => (
            <div key={card.label} style={statCard}>
              <div style={statTop}>
                <div style={statLabel}>{card.label}</div>
                <span
                  style={{
                    ...toneDot,
                    background: card.tone.color,
                    boxShadow: `0 0 0 3px ${card.tone.border}`,
                  }}
                />
              </div>
              <div style={statValue}>{card.value}</div>
            </div>
          ))}
        </div>
        {standardNeedsFullPaymentBeforeFulfillment && (
          <div style={{ ...alertWarning, marginTop: 10 }}>
            Standard delivery orders require full payment before they can move
            to shipping or delivered.
          </div>
        )}

        {blueprintNeedsDownPaymentBeforeProduction && (
          <div style={{ ...alertWarning, marginTop: 10 }}>
            Blueprint orders require at least a 30% verified down payment before
            they can move to production.
          </div>
        )}

        <div style={detailTabRow}>
          {visibleTabs.map((tab) => {
            const isActive = activeTab === tab.key;

            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                style={{
                  ...detailTabButton,
                  background: isActive ? "#18181b" : "#ffffff",
                  color: isActive ? "#ffffff" : "#52525b",
                  borderColor: isActive ? "#18181b" : "#e4e4e7",
                }}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>
      {activeTab === "overview" && (
        <>
          <Section title="Order Progress">
            {normalizedOrderStatus === "cancelled" && (
              <div style={timelineCancelNotice}>
                This order has been cancelled. Progress stopped before
                completion.
              </div>
            )}

            <div style={timelineScroller}>
              <div
                style={{
                  ...timelineRail,
                  gridTemplateColumns: `repeat(${timelineSteps.length}, minmax(0, 1fr))`,
                }}
              >
                {timelineSteps.map((step, index) => {
                  const stepState = getTimelineStepState(
                    timelineSteps,
                    timelineCurrentKey,
                    step,
                  );

                  const stepTone = getTone(STATUS_STYLE, step);
                  const note =
                    stepState === "upcoming"
                      ? ""
                      : getTimelineNote(step, {
                          order,
                          blueprintTasks,
                          hasBlueprintTasks,
                          completedBlueprintTasks,
                          hasSignedDeliveryReceipt,
                          isWalkInOrder,
                        });

                  const isDoneStep = stepState === "done";
                  const isCurrentStep = stepState === "current";

                  const leftLineActive =
                    normalizedOrderStatus !== "cancelled" &&
                    index > 0 &&
                    (isDoneStep || isCurrentStep);

                  const rightLineActive =
                    normalizedOrderStatus !== "cancelled" &&
                    index < timelineSteps.length - 1 &&
                    isDoneStep;

                  return (
                    <div key={step} style={timelineStep}>
                      <div style={timelineTopLine}>
                        <div
                          style={{
                            ...timelineLine,
                            background:
                              index === 0
                                ? "transparent"
                                : leftLineActive
                                  ? "#18181b"
                                  : "#e4e4e7",
                          }}
                        />

                        <div
                          style={{
                            ...timelineDot,
                            ...(stepState === "done"
                              ? {
                                  background: "#18181b", // Force black fill
                                  borderColor: "#18181b",
                                  color: "#ffffff", // Force white checkmark
                                }
                              : stepState === "current"
                                ? step === "completed" &&
                                  normalizedOrderStatus === "completed"
                                  ? {
                                      background: "#18181b", // Force black fill
                                      borderColor: "#18181b",
                                      color: "#ffffff", // Force white checkmark
                                      boxShadow: `0 0 0 4px #f4f4f5`, // Clean gray outer ring
                                    }
                                  : {
                                      background: stepTone.bg,
                                      borderColor: stepTone.border,
                                      color: stepTone.color,
                                      boxShadow: `0 0 0 3px #ffffff`,
                                    }
                                : {}),
                          }}
                        >
                          {stepState === "done" ||
                          (stepState === "current" &&
                            step === "completed" &&
                            normalizedOrderStatus === "completed")
                            ? "✓"
                            : index + 1}
                        </div>

                        <div
                          style={{
                            ...timelineLine,
                            background:
                              index === timelineSteps.length - 1
                                ? "transparent"
                                : rightLineActive
                                  ? "#18181b"
                                  : "#e4e4e7",
                          }}
                        />
                      </div>

                      <div
                        style={{
                          ...timelineStepTitle,
                          color:
                            stepState === "upcoming" ? "#a1a1aa" : "#0a0a0a",
                        }}
                      >
                        {getStatusLabel(step)}
                      </div>

                      {note ? <div style={timelineStepNote}>{note}</div> : null}
                    </div>
                  );
                })}
              </div>
            </div>
          </Section>

          <div style={sectionGrid}>
            <Section title="Customer Information">
              <InfoRow label="Name" value={order.customer_name || "—"} />
              <InfoRow label="Email" value={order.customer_email || "—"} />
              <InfoRow label="Phone" value={order.customer_phone || "—"} />
              <InfoRow label="Address" value={order.customer_address || "—"} />
              {String(order.delivery_address || "").trim() && (
                <InfoRow
                  label="Delivery Address"
                  value={
                    <>
                      {order.delivery_address}
                      {Number.isFinite(Number(order.delivery_lat)) &&
                        Number.isFinite(Number(order.delivery_lng)) && (
                          <a
                            href={`https://www.google.com/maps/search/?api=1&query=${order.delivery_lat},${order.delivery_lng}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              marginLeft: 8,
                              fontSize: 12,
                              fontWeight: 700,
                              color: "#2563eb",
                              whiteSpace: "nowrap",
                            }}
                          >
                            Open in Google Maps ↗
                          </a>
                        )}
                    </>
                  }
                />
              )}
            </Section>

            <Section title="Order Overview">
              <InfoRow
                label="Date Placed"
                value={formatDateTime(order.created_at)}
              />
              <InfoRow
                label="Payment Method"
                value={
                  PAY_METHOD_LABELS[normalize(order.payment_method)] ||
                  titleCase(order.payment_method) ||
                  "—"
                }
              />
              <InfoRow
                label="Payment Status"
                value={titleCase(
                  order.payment_status_display ||
                    order.payment_status ||
                    "unpaid",
                )}
              />
              <InfoRow label="Channel" value={channelMeta.label} />
              <InfoRow
                label="Total Amount"
                value={formatMoney(totalAmount)}
                bold
              />
            </Section>
          </div>
          {hasCustomRequestItems && (
            <Section title="Custom Request Intake">
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                  flexWrap: "wrap",
                  marginBottom: 14,
                }}
              >
                <div style={{ maxWidth: 720 }}>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 800,
                      color: "#0a0a0a",
                      marginBottom: 6,
                    }}
                  >
                    Submitted customer customization request
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      color: "#52525b",
                      lineHeight: 1.6,
                    }}
                  >
                    Review the submitted dimensions, finish, hardware, and the
                    exact edited draft before approving the request for
                    estimation.
                  </div>
                </div>

                {needsCustomRequestAdminReview ? (
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button
                      onClick={() => handleCustomRequestAction("approve")}
                      disabled={customRequestActionLoading === "approve"}
                      style={btnAccept}
                    >
                      {customRequestActionLoading === "approve"
                        ? "Approving..."
                        : "Approve for Estimation"}
                    </button>

                    

                    <button
                      onClick={() => handleCustomRequestAction("reject")}
                      disabled={customRequestActionLoading === "reject"}
                      style={btnDecline}
                    >
                      {customRequestActionLoading === "reject"
                        ? "Rejecting..."
                        : "Reject"}
                    </button>
                  </div>
                ) : (
                  <span style={mutedBadge}>
                    Custom request intake already reviewed.
                  </span>
                )}
              </div>

              <div style={{ display: "grid", gap: 12 }}>
                {customRequestItems.map((item) => {
                  const dims = getCustomRequestDims(item);
                  const canPreview = hasCustomEditorSnapshot(item);

                  return (
                    <div
                      key={item.id}
                      style={{
                        border: "1px solid #e4e4e7",
                        borderRadius: 14,
                        padding: 14,
                        background: "#fff",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          gap: 12,
                          alignItems: "flex-start",
                          flexWrap: "wrap",
                          marginBottom: 10,
                        }}
                      >
                        <div>
                          <div
                            style={{
                              fontSize: 15,
                              fontWeight: 800,
                              color: "#0a0a0a",
                              marginBottom: 4,
                            }}
                          >
                            {item.display_name ||
                              item.product_name ||
                              "Custom Furniture"}
                          </div>

                          <div style={{ fontSize: 12, color: "#71717a" }}>
                            Customer-submitted custom draft
                          </div>
                        </div>

                        {canPreview ? (
                          <button
                            onClick={() => openCustomRequestPreview(item)}
                            style={btnView}
                          >
                            View Submitted Design
                          </button>
                        ) : null}
                      </div>

                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns:
                            "repeat(auto-fit, minmax(180px, 1fr))",
                          gap: 10,
                        }}
                      >
                        <MiniInfo
                          label="Wood Type"
                          value={item.requested_wood_type || "—"}
                        />
                        <MiniInfo
                          label="Finish"
                          value={item.requested_finish_color || "—"}
                        />

                        {String(item.requested_door_style || "").trim() ? (
                          <MiniInfo
                            label="Door Style"
                            value={item.requested_door_style}
                          />
                        ) : null}

                        {String(item.requested_hardware || "").trim() ? (
                          <MiniInfo
                            label="Hardware"
                            value={item.requested_hardware}
                          />
                        ) : null}

                        <MiniInfo
                          label="Dimensions"
                          value={`W ${dims.width || 0} • H ${dims.height || 0} • D ${dims.depth || 0} ${item.requested_unit || "mm"}`}
                        />
                        <MiniInfo
                          label="Quantity"
                          value={String(item.quantity || 1)}
                        />
                      </div>

                      {item.requested_comments ? (
                        <div style={textBlock}>
                          <div style={textBlockTitle}>Customer comments</div>
                          <p style={multilineText}>{item.requested_comments}</p>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </Section>
          )}
          {isBlueprintOrder && (
            <Section title="Estimate / Quotation">
              <InfoRow
                label="Estimation Status"
                value={
                  hasEstimation
                    ? estimationSentToCustomer
                      ? "Sent to customer"
                      : estimationRejectedByCustomer
                        ? "Revision requested"
                        : titleCase(latestEstimation.status)
                    : "No estimate yet"
                }
              />
              <InfoRow
                label="Version"
                value={
                  hasEstimation ? `v${latestEstimation.version || 1}` : "—"
                }
              />
              <InfoRow
                label="Last Updated"
                value={
                  hasEstimation
                    ? formatDateTime(latestEstimation.updated_at)
                    : "—"
                }
              />
              <InfoRow
                label="Quoted Total"
                value={
                  hasEstimation
                    ? formatMoney(latestEstimation.grand_total)
                    : "—"
                }
                bold
              />

              {blueprintId &&
                normalizedOrderStatus === "confirmed" &&
                (!hasEstimation ||
                  estimationRejectedByCustomer ||
                  estimationStatus === "draft") && (
                  <div style={{ marginTop: 12 }}>
                    <button
                      onClick={() =>
                        navigate(`/admin/blueprints/${blueprintId}/estimation`)
                      }
                      style={btnPrimary}
                    >
                      {hasEstimation ? "Revise Estimate" : "Create Estimate"}
                    </button>
                  </div>
                )}

              {blueprintId &&
                normalizedOrderStatus === "confirmed" &&
                estimationSentToCustomer && (
                  <div style={{ marginTop: 12 }}>
                    <span style={mutedBadge}>
                      Quotation already sent. Waiting for customer approval,
                      revision request, or rejection.
                    </span>
                  </div>
                )}
            </Section>
          )}
          <Section title="Order Items">
            <TableShell>
              <table style={table}>
                <thead>
                  <tr style={theadRow}>
                    {[
                      "Product",
                      "Qty",
                      "Unit Price",
                      "Production Cost",
                      "Subtotal",
                    ].map((h) => (
                      <th key={h} style={th}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(order.items || []).map((item, i) => (
                    <tr key={i} style={tbodyRow}>
                      <td style={td}>{item.product_name}</td>
                      <td style={td}>{item.quantity}</td>
                      <td style={td}>{formatMoney(item.unit_price)}</td>
                      <td style={{ ...td, color: "#71717a" }}>
                        {formatMoney(item.production_cost)}
                      </td>
                      <td style={{ ...td, fontWeight: 700, color: "#0a0a0a" }}>
                        {formatMoney(item.subtotal)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={tfootRow}>
                    <td
                      colSpan={4}
                      style={{
                        ...td,
                        textAlign: "right",
                        fontWeight: 800,
                        color: "#0a0a0a",
                      }}
                    >
                      Total
                    </td>
                    <td style={{ ...td, fontWeight: 800, color: "#0a0a0a" }}>
                      {formatMoney(totalAmount)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </TableShell>
          </Section>
        </>
      )}

      {activeTab === "payment" && (
        <>
          <Section title="Payment Transactions">
            {!hasPaymentRecords ? (
              normalizedPaymentStatus === "paid" && isCashLikePaymentMethod ? (
                <div style={infoNotice}>
                  Paid via{" "}
                  {PAY_METHOD_LABELS[normalize(order?.payment_method)] ||
                    titleCase(order?.payment_method)}{" "}
                  / no separate payment transaction record was recorded.
                </div>
              ) : isOnlineOrder && normalizedPaymentStatus === "paid" ? (
                <div style={infoNotice}>
                  This order is marked as paid, but no payment transaction
                  record is linked yet.
                </div>
              ) : isOnlineOrder ? (
                <EmptyText>No online payment transaction record yet.</EmptyText>
              ) : (
                <EmptyText>No payment records yet.</EmptyText>
              )
            ) : (
              <TableShell>
                <table style={table}>
                  <thead>
                    <tr style={theadRow}>
                      {[
                        "Amount",
                        "Method",
                        "Status",
                        "Proof",
                        "Verified By",
                        "Date",
                        ...(hasPendingPaymentActions ? ["Actions"] : []),
                      ].map((h) => (
                        <th key={h} style={th}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {order.payments.map((payment) => {
                      const paymentTone = getTone(
                        PAYMENT_STYLE,
                        payment.status,
                      );

                      return (
                        <tr key={payment.id} style={tbodyRow}>
                          <td
                            style={{ ...td, fontWeight: 700, color: "#0a0a0a" }}
                          >
                            {formatMoney(payment.amount)}
                          </td>
                          <td style={td}>
                            {PAY_METHOD_LABELS[
                              normalize(payment.payment_method)
                            ] || titleCase(payment.payment_method)}
                          </td>
                          <td style={td}>
                            <span
                              style={{
                                ...pill,
                                background: paymentTone.bg,
                                color: paymentTone.color,
                                border: `1px solid ${paymentTone.border}`,
                              }}
                            >
                              {titleCase(payment.status)}
                            </span>
                          </td>
                          <td style={td}>
                            {payment.proof_url ? (
                              <div
                                style={{
                                  display: "flex",
                                  gap: 8,
                                  flexWrap: "wrap",
                                }}
                              >
                                {safeParseUrls(payment.proof_url).map(
                                  (url, idx, arr) => (
                                    <button
                                      key={idx}
                                      type="button"
                                      onClick={() => openProofPreview(url)}
                                      style={previewLinkButton}
                                    >
                                      View Proof {arr.length > 1 ? idx + 1 : ""}
                                    </button>
                                  ),
                                )}
                              </div>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td style={{ ...td, color: "#71717a" }}>
                            {payment.verified_by || "—"}
                          </td>
                          <td style={{ ...td, color: "#71717a" }}>
                            {formatDate(payment.created_at)}
                          </td>
                          {hasPendingPaymentActions ? (
                            <td style={td}>
                              {normalize(payment.status) === "pending" ? (
                                <div style={inlineActions}>
                                  <button
                                    onClick={() =>
                                      verifyPayment(payment.id, "verified")
                                    }
                                    disabled={reviewingPayment.id !== null}
                                    style={btnAccept}
                                  >
                                    {reviewingPayment.id === payment.id &&
                                    reviewingPayment.action === "verified"
                                      ? "Verifying..."
                                      : "Verify"}
                                  </button>
                                  <button
                                    onClick={() =>
                                      verifyPayment(payment.id, "rejected")
                                    }
                                    disabled={reviewingPayment.id !== null}
                                    style={btnDecline}
                                  >
                                    {reviewingPayment.id === payment.id &&
                                    reviewingPayment.action === "rejected"
                                      ? "Rejecting..."
                                      : "Reject"}
                                  </button>
                                </div>
                              ) : (
                                <span style={mutedInline}>
                                  No action needed
                                </span>
                              )}
                            </td>
                          ) : null}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </TableShell>
            )}
          </Section>
          <Section title="Payment Summary">
            <InfoRow
              label="Verified Paid Amount"
              value={formatMoney(verifiedPaymentTotal)}
            />
            <InfoRow
              label="Remaining Balance"
              value={formatMoney(paymentBalance)}
              bold
            />

            {normalizedOrderStatus === "delivered" &&
              paymentBalance > 0 &&
              !hasPendingPaymentActions && (
                <div style={{ marginTop: 14 }}>
                  <div style={{ ...alertWarning, marginBottom: 12 }}>
                    This order still has an unpaid remaining balance. The
                    assigned rider should record the on-site collection from the
                    delivery page first, then admin can verify the pending
                    payment here before marking the order as completed.
                  </div>
                </div>
              )}

            {hasPendingPaymentActions && (
              <div style={{ marginTop: 14 }}>
                <div style={infoNotice}>
                  A payment proof is waiting for admin verification in the
                  payment transactions table above.
                </div>
              </div>
            )}
          </Section>
        </>
      )}

      {activeTab === "fulfillment" && (
        <>
          {!(
            order.delivery ||
            order.contract ||
            shouldShowMissingDeliverySection
          ) ? (
            <Section title="Fulfillment">
              <EmptyText>
                No fulfillment records yet. Delivery details and contract
                handoff will appear here after the order moves forward.
              </EmptyText>
            </Section>
          ) : (
            <div style={detailPairGrid}>
              {order.delivery ? (
                <Section title="Delivery Information">
                  <InfoRow
                    label="Scheduled Date"
                    value={
                      order.delivery.scheduled_date
                        ? formatDateTime(order.delivery.scheduled_date)
                        : "—"
                    }
                  />
                  <InfoRow
                    label="Status"
                    value={titleCase(order.delivery.status)}
                  />
                  <InfoRow
                    label="Delivered On"
                    value={
                      order.delivery.delivered_date
                        ? formatDateTime(order.delivery.delivered_date)
                        : "—"
                    }
                  />
                  <InfoRow
                    label="Address"
                    value={
                      <>
                        {order.delivery.address || "—"}
                        {Number.isFinite(Number(order.delivery_lat)) &&
                          Number.isFinite(Number(order.delivery_lng)) && (
                            <a
                              href={`https://www.google.com/maps/search/?api=1&query=${order.delivery_lat},${order.delivery_lng}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{
                                marginLeft: 8,
                                fontSize: 12,
                                fontWeight: 700,
                                color: "#2563eb",
                                whiteSpace: "nowrap",
                              }}
                            >
                              Open in Google Maps ↗
                            </a>
                          )}
                      </>
                    }
                  />
                  <InfoRow
                    label="Signed Receipt"
                    value={
                      order.delivery.signed_receipt ? (
                        <div
                          style={{ display: "flex", gap: 8, flexWrap: "wrap" }}
                        >
                          {safeParseUrls(order.delivery.signed_receipt).map(
                            (url, idx, arr) => (
                              <button
                                key={idx}
                                type="button"
                                onClick={() => openDeliveryReceiptPreview(url)}
                                style={previewLinkButton}
                              >
                                View Receipt {arr.length > 1 ? idx + 1 : ""}
                              </button>
                            ),
                          )}
                        </div>
                      ) : (
                        "Awaiting rider upload"
                      )
                    }
                  />

                  {!order.delivery.signed_receipt &&
                    ["shipping", "delivered"].includes(
                      normalizedOrderStatus,
                    ) && (
                      <div style={noticeBox}>
                        <div style={noticeTitle}>
                          Awaiting Rider Proof of Delivery
                        </div>
                        <div
                          style={{
                            fontSize: 12,
                            color: "#52525b",
                            lineHeight: 1.6,
                          }}
                        >
                          The assigned delivery rider should upload the signed
                          receipt / proof of delivery from the rider delivery
                          page. This admin order view is summary-only by
                          default.
                        </div>
                      </div>
                    )}
                </Section>
              ) : shouldShowMissingDeliverySection ? (
                <Section title="Delivery Information">
                  <div
                    style={{
                      background: "#fafafa",
                      border: "1px solid #e4e4e7",
                      color: "#18181b",
                      borderRadius: 12,
                      padding: "10px 14px",
                      fontSize: 12,
                      fontWeight: 800,
                      marginBottom: 8,
                    }}
                  >
                    This order is already in the delivery phase, but no delivery
                    record is linked yet.
                  </div>

                  <div
                    style={{
                      fontSize: 12,
                      color: "#52525b",
                      lineHeight: 1.5,
                    }}
                  >
                    Create or link a delivery record first before uploading a
                    signed delivery receipt.
                  </div>
                </Section>
              ) : null}

              {order.contract && (
                <Section title="Contract">
                  <InfoRow
                    label="Generated On"
                    value={formatDateTime(order.contract.created_at)}
                  />
                  <InfoRow
                    label="Warranty Terms"
                    value={order.contract.warranty_terms || "—"}
                  />

                  {hasContractTerms && (
                    <div style={textBlock}>
                      <div style={textBlockTitle}>Contract Terms</div>
                      <p style={multilineText}>
                        {order.contract.materials_used}
                      </p>
                    </div>
                  )}
                </Section>
              )}
            </div>
          )}
        </>
      )}

      {activeTab === "blueprint" && (
        <>
          {(blueprintId || order.contract || hasBlueprintTasks) && (
            <Section title="Blueprint Assignment">
              <InfoRow
                label="Blueprint Reference"
                value={
                  blueprintId ? (
                    <button
                      onClick={() =>
                        navigate(`/admin/blueprints/${blueprintId}/design`)
                      }
                      style={linkButton}
                    >
                      BP-{String(blueprintId).padStart(5, "0")}
                    </button>
                  ) : (
                    "—"
                  )
                }
              />
              <InfoRow label="Assignment Phase" value={assignmentPhaseText} />
              <InfoRow
                label="Active Assignment Count"
                value={String(activeBlueprintTasks.length)}
              />
              <InfoRow
                label="Completed Task Count"
                value={String(completedBlueprintTasks.length)}
              />
              {needsContractFirst && (
                <div style={{ ...alertWarning, marginTop: 12 }}>
                  Generate the contract first from Contracts before moving this
                  blueprint order into production or assigning staff.
                </div>
              )}

              {blueprintTasks.length > 0 ? (
                <div style={taskList}>
                  <div style={taskListHeader}>Current Blueprint Tasks</div>

                  {blueprintTasks.map((task) => {
                    const taskStatus = normalize(task.status);
                    const taskTone = getTone(TASK_STYLE, taskStatus);
                    const isActive = ["pending", "in_progress"].includes(
                      taskStatus,
                    );

                    return (
                      <div key={task.id} style={taskCard}>
                        <div style={taskTop}>
                          <div>
                            <div style={taskTitle}>
                              {task.task_role || "Task"}
                            </div>
                            <div style={taskMeta}>
                              Assigned to {task.assigned_to_name || "—"} • by{" "}
                              {task.assigned_by_name || "—"}
                            </div>
                          </div>

                          <span
                            style={{
                              ...pill,
                              background: taskTone.bg,
                              color: taskTone.color,
                              border: `1px solid ${taskTone.border}`,
                            }}
                          >
                            {titleCase(task.status)}
                          </span>
                        </div>

                        <div style={taskDetailsGrid}>
                          <MiniInfo
                            label="Due Date"
                            value={
                              task.due_date
                                ? formatDateTime(task.due_date)
                                : "—"
                            }
                          />
                          <MiniInfo
                            label="Note"
                            value={task.description || "—"}
                          />
                        </div>

                        <div style={taskActions}>
                          {isDeliveryPhaseOrDone ? (
                            <span style={mutedBadge}>
                              Production packet locked during
                              delivery/completion
                            </span>
                          ) : (
                            <span style={mutedBadge}>
                              Staff updates this step from the Production Work
                              Queue
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <EmptyText>No blueprint staff assignments yet.</EmptyText>
              )}

              {canAssignBlueprintStaff && !hasBlueprintTasks && (
                <div style={{ marginTop: 12 }}>
                  <button
                    onClick={openAssignModal}
                    disabled={!blueprintId || loadingAssignable}
                    style={{
                      ...btnPrimary,
                      opacity: !blueprintId || loadingAssignable ? 0.75 : 1,
                      cursor:
                        !blueprintId || loadingAssignable
                          ? "not-allowed"
                          : "pointer",
                    }}
                    title="Assign primary indoor staff"
                  >
                    {loadingAssignable
                      ? "Loading Staff..."
                      : "Assign Indoor Staff"}
                  </button>
                </div>
              )}

              {canAssignBlueprintStaff && hasBlueprintTasks && (
                <div style={{ marginTop: 12 }}>
                  <span style={mutedBadge}>
                    Primary indoor staff already assigned for this production
                    order.
                  </span>
                </div>
              )}
            </Section>
          )}
        </>
      )}
      {activeTab === "discussion" && canUseDiscussion && (
        <OrderDiscussionPanel
          orderId={order?.id || id}
          enabled={canUseDiscussion}
        />
      )}
      {customRequestPreviewItem && customRequestPreviewBlueprint && (
        <div style={overlay} onClick={closeCustomRequestPreview}>
          <div
            style={{ ...modalBox, width: 1100, maxWidth: "96vw" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={modalHeader}>
              <div>
                <h3 style={modalTitle}>
                  {customRequestPreviewItem.display_name ||
                    customRequestPreviewItem.product_name ||
                    "Custom Furniture"}
                </h3>
                <p style={modalSubtitle}>
                  Read-only preview of the exact submitted customer draft.
                </p>
              </div>
            </div>

            <div style={{ paddingTop: 6 }}>
              <CustomerTemplateWorkbench
                blueprint={customRequestPreviewBlueprint}
                readOnly
              />
            </div>

            <div style={modalActions}>
              <button onClick={closeCustomRequestPreview} style={btnPrimary}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {proofPreview.open && (
        <div style={overlay}>
          <div style={{ ...modalBox, width: 820, maxWidth: "96vw" }}>
            <div style={modalHeader}>
              <div>
                <h3 style={modalTitle}>Payment Proof Preview</h3>
                <p style={modalSubtitle}>
                  Review the uploaded payment proof before verifying the
                  transaction.
                </p>
              </div>
            </div>

            <div style={proofPreviewBox}>
              {proofPreview.type === "image" ? (
                <img
                  src={buildAssetUrl(proofPreview.url)}
                  alt="Payment proof"
                  style={proofPreviewImage}
                />
              ) : proofPreview.type === "pdf" ? (
                <iframe
                  src={buildAssetUrl(proofPreview.url)}
                  title="Payment proof preview"
                  style={proofPreviewFrame}
                />
              ) : (
                <div style={proofPreviewFallback}>
                  Inline preview is not available for this file type.
                </div>
              )}
            </div>

            <div style={modalActions}>
              <a
                href={proofPreview.url}
                target="_blank"
                rel="noreferrer"
                style={btnSecondaryLink}
              >
                Open in New Tab
              </a>
              <button onClick={closeProofPreview} style={btnPrimary}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
      {deliveryReceiptPreview.open && (
        <div style={overlay}>
          <div style={{ ...modalBox, width: 820, maxWidth: "96vw" }}>
            <div style={modalHeader}>
              <div>
                <h3 style={modalTitle}>Signed Delivery Receipt</h3>
                <p style={modalSubtitle}>
                  Review the uploaded signed delivery receipt for this order.
                </p>
              </div>
            </div>

            <div style={proofPreviewBox}>
              {deliveryReceiptPreview.type === "image" ? (
                <img
                  src={deliveryReceiptPreview.url}
                  alt="Signed delivery receipt"
                  style={proofPreviewImage}
                />
              ) : deliveryReceiptPreview.type === "pdf" ? (
                <iframe
                  src={deliveryReceiptPreview.url}
                  title="Signed delivery receipt preview"
                  style={proofPreviewFrame}
                />
              ) : (
                <div style={proofPreviewFallback}>
                  Inline preview is not available for this file type.
                </div>
              )}
            </div>

            <div style={modalActions}>
              <a
                href={deliveryReceiptPreview.url}
                target="_blank"
                rel="noreferrer"
                style={btnSecondaryLink}
              >
                Open in New Tab
              </a>
              <button onClick={closeDeliveryReceiptPreview} style={btnPrimary}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
      {statusModal && (
        <div style={overlay}>
          <div style={modalBox}>
            <div style={modalHeader}>
              <div>
                <h3 style={modalTitle}>Update Order Status</h3>
                <p style={modalSubtitle}>
                  Choose the next valid status for this order.
                </p>
              </div>
            </div>

            {hasBlueprintTasks && !allBlueprintTasksCompleted && (
              <div style={alertWarning}>
                Shipping, delivered, and completed are locked until all
                blueprint tasks are marked completed.
              </div>
            )}

            {/* 👉 NEW: Warnings for Rider Assignments */}
            {hasDeliveryRequirement &&
              !order?.delivery &&
              ["delivered", "completed"].includes(newStatus) && (
                <div style={alertWarning}>
                  You need to assign a delivery rider first.
                </div>
              )}

            {hasDeliveryRequirement &&
              order?.delivery &&
              !hasSignedDeliveryReceipt &&
              ["delivered", "completed"].includes(newStatus) && (
                <div style={alertWarning}>
                  It must be delivered and finished by the rider first.
                </div>
              )}

            {/* 👉 NEW: Warning for Payment Verification */}
            {!isBlueprintOrder &&
              newStatus === "shipping" &&
              normalizedPaymentMethod !== "cod" &&
              paymentBalance > 0 && (
                <div style={alertWarning}>
                  The payment need to be verified first.
                </div>
              )}

            {paymentBalance > 0 && newStatus === "completed" && (
              <div style={alertWarning}>
                Completed is locked until the remaining balance is fully paid.
              </div>
            )}

            {blueprintNeedsDownPaymentBeforeProduction &&
              newStatus === "production" && (
                <div style={alertWarning}>
                  Production is locked for blueprint orders until at least 30%
                  verified down payment is completed.
                </div>
              )}

            <label style={labelSm}>New Status</label>
            <select
              value={newStatus}
              onChange={(e) => setNewStatus(e.target.value)}
              style={{ ...inputFull, marginBottom: 20 }}
              disabled={updatingStatus}
            >
              {!allowedNextStatuses.length && (
                <option value="">No further status available</option>
              )}

              {allowedNextStatuses.map((status) => {
                const normalizedStatus = normalize(status);

                const blockedByIncompleteTasks =
                  isBlueprintOrder &&
                  ["shipping", "delivered", "completed"].includes(
                    normalizedStatus,
                  ) &&
                  (!hasRequiredBlueprintTaskPacket ||
                    !allBlueprintTasksCompleted);

                // 👉 NEW: Disable logic for the dropdown options
                const blockedByUnverifiedPayment =
                  !isBlueprintOrder &&
                  normalizedStatus === "shipping" &&
                  normalizedPaymentMethod !== "cod" &&
                  paymentBalance > 0;

                const blockedByNoRiderAssigned =
                  hasDeliveryRequirement &&
                  ["delivered", "completed"].includes(normalizedStatus) &&
                  !order?.delivery;

                const blockedByRiderNotFinished =
                  hasDeliveryRequirement &&
                  ["delivered", "completed"].includes(normalizedStatus) &&
                  order?.delivery &&
                  !hasSignedDeliveryReceipt;

                const blockedByUnsettledPayment =
                  normalizedStatus === "completed" && paymentBalance > 0;

                const blockedByBlueprintDownPayment =
                  isBlueprintOrder &&
                  normalizedStatus === "production" &&
                  !hasRequiredBlueprintDownPayment;

                return (
                  <option
                    key={status}
                    value={status}
                    disabled={
                      blockedByIncompleteTasks ||
                      blockedByUnverifiedPayment ||
                      blockedByNoRiderAssigned ||
                      blockedByRiderNotFinished ||
                      blockedByUnsettledPayment ||
                      blockedByBlueprintDownPayment
                    }
                  >
                    {getStatusLabel(status)}
                    {blockedByIncompleteTasks
                      ? " — complete blueprint tasks first"
                      : blockedByUnverifiedPayment
                        ? " — the payment need to be verified first"
                        : blockedByNoRiderAssigned
                          ? " — you need to assign a delivery rider first"
                          : blockedByRiderNotFinished
                            ? " — rider must finish delivery first"
                            : blockedByBlueprintDownPayment
                              ? " — 30% verified down payment required first"
                              : blockedByUnsettledPayment
                                ? " — full payment required first"
                                : ""}
                  </option>
                );
              })}
            </select>

            <div style={modalActions}>
              <button
                onClick={() => setStatusModal(false)}
                style={btnGhost}
                disabled={updatingStatus}
              >
                Cancel
              </button>
              <button
                onClick={handleStatusUpdate}
                style={btnPrimary}
                disabled={
                  !allowedNextStatuses.length ||
                  !newStatus ||
                  updatingStatus
                }
              >
                {updatingStatus ? "Updating…" : "Update Status"}
              </button>
            </div>
          </div>
        </div>
      )}

      {assignModal && (
        <div style={overlay}>
          <div style={{ ...modalBox, width: 540 }}>
            <div style={modalHeader}>
              <div>
                <h3 style={modalTitle}>
                  Assign Indoor Staff to Production Order
                </h3>
                <p style={modalSubtitle}>
                  Order #{String(order.id).padStart(5, "0")}
                  {assignmentBlueprintId
                    ? ` • Blueprint BP-${String(assignmentBlueprintId).padStart(5, "0")}`
                    : ""}
                </p>
              </div>
            </div>

            <div style={formGrid}>
              <div>
                <label style={labelSm}>Primary Indoor Staff</label>
                <select
                  value={assignForm.staff_id}
                  onChange={(e) =>
                    setAssignForm((prev) => ({
                      ...prev,
                      staff_id: e.target.value,
                    }))
                  }
                  style={inputFull}
                >
                  <option value="">— Select Staff —</option>
                  {assignableStaff.map((staff) => (
                    <option key={staff.id} value={staff.id}>
                      {staff.name} — {staff.active_task_count} active production
                      order
                      {Number(staff.active_task_count) === 1 ? "" : "s"}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={labelSm}>Production Workflow</label>
                <div
                  style={{
                    ...inputFull,
                    background: "#fafafa",
                    color: "#52525b",
                    lineHeight: 1.6,
                    minHeight: "auto",
                  }}
                >
                  This indoor staff will handle the full production workflow:
                  <br />
                  • Cutting Machine
                  <br />
                  • Edge Banding
                  <br />
                  • Horizontal Drilling
                  <br />
                  • Retouching
                  <br />• Packing
                </div>
              </div>
            </div>

            <div style={{ marginTop: 16 }}>
              <label style={labelSm}>Due Date</label>
              <input
                type="datetime-local"
                value={assignForm.due_date}
                onChange={(e) =>
                  setAssignForm((prev) => ({
                    ...prev,
                    due_date: e.target.value,
                  }))
                }
                style={inputFull}
              />
            </div>

            <div style={{ marginTop: 16 }}>
              <label style={labelSm}>Assignment Note (optional)</label>
              <textarea
                rows={4}
                value={assignForm.note}
                onChange={(e) =>
                  setAssignForm((prev) => ({ ...prev, note: e.target.value }))
                }
                style={{ ...inputFull, resize: "vertical", paddingTop: 10 }}
                placeholder="Add instructions or production notes..."
              />
            </div>

            {assignableStaff.length === 0 && (
              <div style={{ ...alertWarning, marginTop: 16 }}>
                No active staff available for assignment.
              </div>
            )}

            <div style={modalActions}>
              <button onClick={() => setAssignModal(false)} style={btnGhost}>
                Cancel
              </button>
              <button
                onClick={handleAssignStaff}
                disabled={assigning || assignableStaff.length === 0}
                style={btnPrimary}
              >
                {assigning ? "Assigning..." : "Assign Indoor Staff"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div style={sectionCard}>
      <div style={sectionHeader}>
        <h3 style={sectionTitle}>{title}</h3>
      </div>
      {children}
    </div>
  );
}

function InfoRow({ label, value, bold }) {
  return (
    <div style={infoRow}>
      <span style={infoLabel}>{label}</span>
      <span style={{ ...infoValue, fontWeight: bold ? 800 : 600 }}>
        {value}
      </span>
    </div>
  );
}

function MiniInfo({ label, value }) {
  return (
    <div style={miniInfoCard}>
      <div style={miniInfoLabel}>{label}</div>
      <div style={miniInfoValue}>{value}</div>
    </div>
  );
}

function EmptyText({ children }) {
  return <p style={emptyText}>{children}</p>;
}

function TableShell({ children }) {
  return <div style={tableShell}>{children}</div>;
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const pageShell = {
  maxWidth: 1120,
  margin: "0 auto",
  display: "flex",
  flexDirection: "column",
  gap: 16,
};

const heroCard = {
  background: "#ffffff",
  border: "1px solid #e4e4e7",
  borderRadius: 16,
  padding: "16px 20px",
  boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
};

const heroTop = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 12,
  flexWrap: "wrap",
  marginBottom: 12,
};

const eyebrow = {
  fontSize: 10,
  fontWeight: 800,
  letterSpacing: "1.2px",
  textTransform: "uppercase",
  color: "#71717a",
  marginBottom: 8,
};

const heroTitleRow = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  flexWrap: "wrap",
};

const pageTitle = {
  margin: 0,
  fontSize: 24,
  lineHeight: 1.12,
  fontWeight: 800,
  color: "#0a0a0a",
  letterSpacing: "-0.02em",
};

const pageSubtitle = {
  margin: "8px 0 0",
  fontSize: 13,
  color: "#52525b",
  lineHeight: 1.55,
  maxWidth: 620,
};

const heroActions = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  flexWrap: "wrap",
};

const detailTabRow = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  marginTop: 16,
  paddingTop: 16,
  borderTop: "1px solid #e4e4e7",
};

const detailTabButton = {
  padding: "8px 16px",
  borderRadius: 8,
  border: "1px solid #e4e4e7",
  background: "#ffffff",
  color: "#52525b",
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
  transition: "all 0.2s ease",
};

const statsGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
  gap: 12,
};

const statCard = {
  background: "#fafafa",
  border: "1px solid #e4e4e7",
  borderRadius: 12,
  padding: "12px 14px",
};

const statTop = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 8,
  marginBottom: 8,
};

const toneDot = {
  display: "inline-block",
  width: 8,
  height: 8,
  borderRadius: 999,
  flexShrink: 0,
};

const statLabel = {
  fontSize: 10,
  fontWeight: 800,
  letterSpacing: "1px",
  textTransform: "uppercase",
  color: "#71717a",
};

const statValue = {
  fontSize: 20,
  fontWeight: 800,
  color: "#0a0a0a",
  letterSpacing: "-0.01em",
};

const sectionGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
  gap: 16,
};

const detailPairGrid = {
  display: "grid",
  gridTemplateColumns: "1.1fr 0.9fr",
  gap: 16,
  alignItems: "start",
};

const sectionCard = {
  background: "#ffffff",
  border: "1px solid #e4e4e7",
  borderRadius: 16,
  padding: "16px 20px",
  boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
};

const sectionHeader = {
  marginBottom: 14,
  paddingBottom: 10,
  borderBottom: "1px solid #f4f4f5",
};

const sectionTitle = {
  margin: 0,
  fontSize: 16,
  fontWeight: 800,
  color: "#0a0a0a",
};

const infoRow = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 14,
  padding: "8px 0",
  borderBottom: "1px solid #fafafa",
};

const infoLabel = {
  fontSize: 12,
  color: "#71717a",
  fontWeight: 700,
  minWidth: 120,
};

const infoValue = {
  fontSize: 13,
  color: "#18181b",
  textAlign: "right",
  maxWidth: "72%",
  wordBreak: "break-word",
  lineHeight: 1.45,
};

const tableShell = {
  width: "100%",
  overflowX: "auto",
  border: "1px solid #e4e4e7",
  borderRadius: 12,
};

const table = {
  width: "100%",
  borderCollapse: "separate",
  borderSpacing: 0,
  minWidth: 680,
};

const theadRow = {
  background: "#fafafa",
};

const tbodyRow = {
  background: "#ffffff",
};

const tfootRow = {
  background: "#fafafa",
};

const th = {
  textAlign: "left",
  padding: "12px 14px",
  fontSize: 10,
  fontWeight: 800,
  color: "#71717a",
  textTransform: "uppercase",
  letterSpacing: "1px",
  borderBottom: "1px solid #e4e4e7",
};

const td = {
  padding: "12px 14px",
  color: "#18181b",
  fontSize: 13,
  borderBottom: "1px solid #f4f4f5",
  verticalAlign: "middle",
};

const emptyText = {
  margin: 0,
  fontSize: 13,
  color: "#71717a",
  lineHeight: 1.5,
};

const infoNotice = {
  background: "#fafafa",
  border: "1px solid #e4e4e7",
  color: "#18181b",
  borderRadius: 12,
  padding: "10px 14px",
  fontSize: 12,
  fontWeight: 700,
};

const noticeBox = {
  marginTop: 16,
  padding: 14,
  background: "#fafafa",
  borderRadius: 12,
  border: "1px dashed #d4d4d8",
};

const noticeTitle = {
  fontSize: 12,
  fontWeight: 800,
  color: "#18181b",
  marginBottom: 10,
};

const textBlock = {
  marginTop: 16,
  padding: 14,
  borderRadius: 12,
  background: "#fafafa",
  border: "1px solid #e4e4e7",
};

const textBlockTitle = {
  fontSize: 10,
  fontWeight: 800,
  color: "#18181b",
  marginBottom: 8,
  textTransform: "uppercase",
  letterSpacing: "1px",
};

const multilineText = {
  margin: 0,
  fontSize: 13,
  color: "#52525b",
  lineHeight: 1.6,
  whiteSpace: "pre-wrap",
};

const taskList = {
  marginTop: 16,
  border: "1px solid #e4e4e7",
  borderRadius: 12,
  overflow: "hidden",
};

const taskListHeader = {
  padding: "10px 14px",
  background: "#fafafa",
  borderBottom: "1px solid #e4e4e7",
  fontSize: 10,
  fontWeight: 800,
  color: "#71717a",
  textTransform: "uppercase",
  letterSpacing: "1px",
};

const taskCard = {
  padding: 14,
  borderBottom: "1px solid #f4f4f5",
  background: "#ffffff",
};

const taskTop = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 10,
  marginBottom: 12,
};

const taskTitle = {
  fontSize: 14,
  fontWeight: 800,
  color: "#0a0a0a",
  marginBottom: 4,
};

const taskMeta = {
  fontSize: 12,
  color: "#71717a",
  lineHeight: 1.5,
};

const taskDetailsGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
  gap: 10,
  marginBottom: 12,
};

const miniInfoCard = {
  background: "#fafafa",
  border: "1px solid #e4e4e7",
  borderRadius: 10,
  padding: 10,
};

const miniInfoLabel = {
  fontSize: 10,
  fontWeight: 800,
  color: "#71717a",
  textTransform: "uppercase",
  letterSpacing: "1px",
  marginBottom: 6,
};

const miniInfoValue = {
  fontSize: 13,
  fontWeight: 600,
  color: "#0a0a0a",
  lineHeight: 1.5,
  wordBreak: "break-word",
};

const taskActions = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  alignItems: "center",
};

const timelineCancelNotice = {
  marginBottom: 16,
  padding: "10px 14px",
  background: "#fef2f2",
  border: "1px solid #fecaca",
  borderRadius: 12,
  fontSize: 13,
  fontWeight: 700,
  color: "#991b1b",
};

const timelineScroller = {
  width: "100%",
  overflowX: "auto",
  paddingBottom: 4,
};

const timelineRail = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
  alignItems: "start",
  columnGap: 0,
  rowGap: 0,
  width: "100%",
  minWidth: 640,
};

const timelineStep = {
  minWidth: 0,
  display: "flex",
  flexDirection: "column",
};

const timelineTopLine = {
  display: "flex",
  alignItems: "center",
  marginBottom: 12,
};
const timelineLine = {
  flex: 1,
  height: 4,
  borderRadius: 999,
  background: "#e4e4e7",
};

const timelineDot = {
  width: 28,
  height: 28,
  borderRadius: 999,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 12,
  fontWeight: 800,
  border: "1px solid #d4d4d8",
  background: "#ffffff",
  color: "#71717a",
  flexShrink: 0,
};

const timelineStepTitle = {
  fontSize: 12,
  fontWeight: 800,
  color: "#0a0a0a",
  marginBottom: 6,
  lineHeight: 1.35,
  textAlign: "center",
  padding: "0 8px",
};

const timelineStepNote = {
  fontSize: 11,
  color: "#71717a",
  lineHeight: 1.45,
  textAlign: "center",
  padding: "0 8px",
};

const mutedBadge = {
  fontSize: 12,
  fontWeight: 700,
  color: "#71717a",
  background: "#fafafa",
  border: "1px solid #e4e4e7",
  borderRadius: 999,
  padding: "6px 12px",
};

const pill = {
  display: "inline-flex",
  alignItems: "center",
  padding: "4px 10px",
  borderRadius: 999,
  fontSize: 11,
  fontWeight: 700,
  whiteSpace: "nowrap",
};

const inlineActions = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
};

const mutedInline = {
  fontSize: 12,
  color: "#71717a",
};

const previewLinkButton = {
  background: "none",
  border: "none",
  padding: 0,
  color: "#18181b",
  fontWeight: 800,
  fontSize: 12,
  cursor: "pointer",
  textDecoration: "underline",
};

const proofPreviewBox = {
  border: "1px solid #e4e4e7",
  borderRadius: 12,
  background: "#fafafa",
  padding: 14,
  minHeight: 320,
  maxHeight: "70vh",
  overflow: "auto",
};

const proofPreviewImage = {
  display: "block",
  maxWidth: "100%",
  width: "100%",
  height: "auto",
  borderRadius: 8,
};

const proofPreviewFrame = {
  width: "100%",
  height: "65vh",
  border: "none",
  borderRadius: 8,
  background: "#ffffff",
};

const proofPreviewFallback = {
  minHeight: 220,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  textAlign: "center",
  color: "#71717a",
  fontSize: 13,
  fontWeight: 600,
  padding: 20,
};

const btnSecondaryLink = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "9px 16px",
  background: "#f4f4f5",
  color: "#18181b",
  border: "1px solid #e4e4e7",
  borderRadius: 8,
  fontSize: 13,
  fontWeight: 700,
  textDecoration: "none",
  transition: "background 0.2s",
};

const linkButton = {
  background: "none",
  border: "none",
  color: "#18181b",
  fontWeight: 800,
  cursor: "pointer",
  padding: 0,
  fontSize: 13,
  textDecoration: "underline",
};

const overlay = {
  position: "fixed",
  inset: 0,
  background: "rgba(0, 0, 0, 0.6)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 1000,
  padding: 20,
};

const modalBox = {
  background: "#fff",
  borderRadius: 16,
  padding: 28,
  width: 480,
  maxWidth: "100%",
  border: "1px solid #e4e4e7",
  boxShadow: "0 25px 60px rgba(0, 0, 0, 0.15)",
};

const modalHeader = {
  marginBottom: 16,
};

const modalTitle = {
  margin: 0,
  fontSize: 20,
  fontWeight: 800,
  color: "#0a0a0a",
  letterSpacing: "-0.01em",
};

const modalSubtitle = {
  margin: "6px 0 0",
  fontSize: 13,
  color: "#52525b",
  lineHeight: 1.5,
};

const alertWarning = {
  background: "#fefce8",
  border: "1px solid #fde047",
  color: "#a16207",
  borderRadius: 12,
  padding: "10px 14px",
  fontSize: 12,
  fontWeight: 700,
  marginBottom: 12,
};

const formGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 14,
};

const modalActions = {
  display: "flex",
  gap: 12,
  justifyContent: "flex-end",
  marginTop: 24,
  flexWrap: "wrap",
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
  padding: "10px 12px",
  border: "1px solid #e4e4e7",
  borderRadius: 8,
  fontSize: 13,
  boxSizing: "border-box",
  background: "#fff",
  color: "#0a0a0a",
  outline: "none",
};

const center = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  height: 320,
  color: "#71717a",
  fontSize: 14,
  fontWeight: 600,
};

const btnBack = {
  padding: "6px 10px",
  background: "#ffffff",
  color: "#52525b",
  border: "1px solid #e4e4e7",
  borderRadius: 8,
  cursor: "pointer",
  fontSize: 12,
  fontWeight: 700,
  transition: "all 0.2s",
};

const btnGhost = {
  padding: "9px 16px",
  background: "#f4f4f5",
  color: "#18181b",
  border: "1px solid #e4e4e7",
  borderRadius: 8,
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 700,
  transition: "all 0.2s",
};

const btnPrimary = {
  padding: "9px 16px",
  background: "#18181b",
  color: "#ffffff",
  border: "1px solid #18181b",
  borderRadius: 8,
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 700,
  transition: "background 0.2s",
};

const btnView = {
  padding: "9px 14px",
  background: "#f4f4f5",
  color: "#18181b",
  border: "1px solid #e4e4e7",
  borderRadius: 8,
  cursor: "pointer",
  fontSize: 12,
  fontWeight: 700,
  transition: "background 0.2s",
};

const btnSecondary = {
  padding: "9px 14px",
  background: "#ffffff",
  color: "#18181b",
  border: "1px solid #d4d4d8",
  borderRadius: 8,
  cursor: "pointer",
  fontSize: 12,
  fontWeight: 700,
  transition: "background 0.2s",
};

const btnAccept = {
  padding: "9px 14px",
  background: "#18181b",
  color: "#ffffff",
  border: "1px solid #18181b",
  borderRadius: 8,
  cursor: "pointer",
  fontSize: 12,
  fontWeight: 700,
  transition: "background 0.2s",
};

const btnDecline = {
  padding: "9px 14px",
  background: "#fef2f2",
  color: "#991b1b",
  border: "1px solid #fecaca",
  borderRadius: 8,
  cursor: "pointer",
  fontSize: 12,
  fontWeight: 700,
  transition: "background 0.2s",
};