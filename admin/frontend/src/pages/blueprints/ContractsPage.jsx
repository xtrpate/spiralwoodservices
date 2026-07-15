import React, { useEffect, useState, useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import api from "../../services/api";
import toast from "react-hot-toast";
import jsPDF from "jspdf";

const DEFAULT_TERMS = `1. SCOPE OF WORK
The contractor agrees to fabricate and deliver the custom woodwork as described in the approved blueprint and cost estimation attached to this contract.

2. PAYMENT TERMS
A down payment of 30% of the total contract price is required before fabrication begins. The remaining balance is due upon delivery and acceptance of the finished product.

3. DELIVERY & INSTALLATION
The estimated completion and delivery date will be agreed upon after the down payment is received. Delays caused by customer changes or force majeure will extend the timeline accordingly.

4. CHANGES & REVISIONS
Any changes to the approved design after fabrication has begun may incur additional charges and timeline adjustments, subject to mutual agreement.

5. OWNERSHIP
Ownership of the finished product transfers to the customer upon full payment of the contract price.

6. GOVERNING LAW
This contract shall be governed by the laws of the Republic of the Philippines.`;

const DEFAULT_WARRANTY = `This product is covered by a one (1) year warranty from the date of delivery against defects in materials and workmanship under normal use conditions.

Warranty does not cover damage caused by misuse, neglect, unauthorized modifications, or external causes such as accidents or natural disasters.

To file a warranty claim, contact Spiral Wood Services with proof of purchase and documentation of the defect.`;

const formatCurrencyUI = (value) =>
  `₱ ${Number(value || 0).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const formatCurrencyPdf = (value) =>
  `₱ ${Number(value || 0).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const normalize = (value) =>
  String(value || "")
    .trim()
    .toLowerCase();

const formatDate = (value) => {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-PH");
};

const formatDatePdf = (value) => {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-PH", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
};

const formatPersonName = (value) =>
  String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());

const titleCase = (value) =>
  String(value || "")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase()) || "—";

function parseNumberedSections(text = "") {
  const normalizedText = String(text || "")
    .replace(/\r/g, "")
    .trim();
  if (!normalizedText) return [];

  const regex =
    /(^|\n)(\d+)\.\s*([A-Z][A-Z0-9 &/(),.-]+)\n([\s\S]*?)(?=\n\d+\.\s*[A-Z][A-Z0-9 &/(),.-]+\n|$)/g;

  const sections = [];
  let match;

  while ((match = regex.exec(normalizedText)) !== null) {
    sections.push({
      number: match[2],
      title: match[3].trim(),
      body: match[4].trim(),
    });
  }

  if (sections.length) return sections;

  return [
    {
      number: "1",
      title: "TERMS AND CONDITIONS",
      body: normalizedText,
    },
  ];
}

function splitParagraphs(text = "") {
  return String(text || "")
    .replace(/\r/g, "")
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function buildWrappedParagraphs(doc, text = "", maxWidth = 170) {
  const paragraphs = splitParagraphs(text);
  if (!paragraphs.length) return [];

  return paragraphs.map((paragraph) => {
    const wrappedLines = [];

    paragraph.split("\n").forEach((rawLine) => {
      const line = rawLine.trim();

      if (!line) {
        wrappedLines.push("");
        return;
      }

      wrappedLines.push(...doc.splitTextToSize(line, maxWidth));
    });

    return wrappedLines;
  });
}

function estimateTextBlockHeight(
  doc,
  text,
  maxWidth,
  lineHeight = 4,
  paragraphGap = 1.6,
) {
  const paragraphs = buildWrappedParagraphs(doc, text, maxWidth);
  if (!paragraphs.length) return lineHeight;

  let height = 0;

  paragraphs.forEach((lines, index) => {
    height += Math.max(lines.length, 1) * lineHeight;
    if (index < paragraphs.length - 1) height += paragraphGap;
  });

  return height;
}

function isPositiveIntegerString(value) {
  const text = String(value ?? "").trim();
  if (!/^[1-9][0-9]*$/.test(text)) return false;
  const parsed = Number(text);
  return Number.isSafeInteger(parsed) && parsed > 0;
}

export default function ContractsPage() {
  const navigate = useNavigate();
  const location = useLocation();

  const [contracts, setContracts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [saving, setSaving] = useState(false);

  const [selectedOrderInfo, setSelectedOrderInfo] = useState(null);
  const [loadingOrderInfo, setLoadingOrderInfo] = useState(false);
  const [orderInfoError, setOrderInfoError] = useState("");

  const [estimationResponse, setEstimationResponse] = useState(null);
  const [loadingEstimation, setLoadingEstimation] = useState(false);
  const [estimationError, setEstimationError] = useState("");

  const [form, setForm] = useState({
    order_id: "",
    blueprint_id: "",
    terms: DEFAULT_TERMS,
    warranty_terms: DEFAULT_WARRANTY,
  });

  const resetForm = () => {
    setForm({
      order_id: "",
      blueprint_id: "",
      terms: DEFAULT_TERMS,
      warranty_terms: DEFAULT_WARRANTY,
    });
    setSelectedOrderInfo(null);
    setOrderInfoError("");
    setEstimationResponse(null);
    setEstimationError("");
  };

  const load = async () => {
    setLoading(true);
    try {
      const [contractsRes, ordersRes] = await Promise.all([
        api.get("/contracts"),
        api.get("/orders", { params: { status: "confirmed", limit: 100 } }),
      ]);

      setContracts(Array.isArray(contractsRes.data) ? contractsRes.data : []);
      setOrders(
        Array.isArray(ordersRes.data?.orders) ? ordersRes.data.orders : [],
      );
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to load contracts.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    const draft = location.state?.contractDraft;
    if (!draft) return;

    setForm((prev) => ({
      ...prev,
      order_id: draft.order_id ? String(draft.order_id) : prev.order_id,
      blueprint_id: draft.blueprint_id
        ? String(draft.blueprint_id)
        : prev.blueprint_id,
    }));

    setModal(true);
  }, [location.state]);

  useEffect(() => {
    if (!modal || !form.order_id) {
      setSelectedOrderInfo(null);
      setOrderInfoError("");
      return;
    }

    let cancelled = false;

    const fetchOrderInfo = async () => {
      setLoadingOrderInfo(true);
      setOrderInfoError("");

      try {
        const { data } = await api.get(`/orders/${form.order_id}`);
        if (!cancelled) {
          setSelectedOrderInfo(data || null);
        }
      } catch (err) {
        if (!cancelled) {
          setSelectedOrderInfo(null);
          setOrderInfoError(
            err?.response?.data?.message ||
              "Failed to load selected order details.",
          );
        }
      } finally {
        if (!cancelled) {
          setLoadingOrderInfo(false);
        }
      }
    };

    fetchOrderInfo();

    return () => {
      cancelled = true;
    };
  }, [modal, form.order_id]);

  const manualBlueprintId = String(form.blueprint_id || "").trim();

  // Canonical blueprint id comes ONLY from the loaded order — never from
  // manual/navigation-supplied input, and never from an existing
  // contract's own blueprint_id (an eligible order must not already have
  // a contract in the first place, so that fallback made no sense as a
  // source of truth for a NEW contract).
  const canonicalBlueprintId = selectedOrderInfo?.blueprint_id
    ? String(selectedOrderInfo.blueprint_id)
    : "";

  // Strict validation of the canonical id itself — even though it comes
  // from the order (not user input), it's validated with the same
  // strict rule before ever being used for a lookup or a submit, so a
  // malformed/unexpected value from the order record can never silently
  // pass through as "0", a decimal, scientific notation, etc.
  const canonicalBlueprintValid = isPositiveIntegerString(canonicalBlueprintId);

  const manualBlueprintInvalid =
    manualBlueprintId && !isPositiveIntegerString(manualBlueprintId);

  // The manual/navigation-draft value is only ever a consistency check —
  // it never overrides the canonical id, and never controls lookup or
  // submit. This also naturally covers the navigation-draft mismatch
  // case: location.state.contractDraft.blueprint_id lands in
  // form.blueprint_id the same way a manually-typed value would.
  const manualBlueprintMismatch =
    Boolean(manualBlueprintId) &&
    !manualBlueprintInvalid &&
    Boolean(canonicalBlueprintId) &&
    manualBlueprintId !== canonicalBlueprintId;

  useEffect(() => {
    if (
      !modal ||
      !form.order_id ||
      !canonicalBlueprintId ||
      !canonicalBlueprintValid
    ) {
      setEstimationResponse(null);
      setEstimationError("");
      return;
    }

    let cancelled = false;

    const fetchEstimation = async () => {
      setLoadingEstimation(true);
      setEstimationResponse(null);
      setEstimationError("");

      try {
        const { data } = await api.get(
          `/blueprints/${canonicalBlueprintId}/estimation`,
        );

        if (cancelled) return;

        // Block immediately on any integrity/recovery-draft/unpersisted
        // signal — never treat an unpersisted recovery draft, a stale
        // record, or a multiple-owner conflict as a normal saved,
        // approved estimation just because `status` happens to say
        // "approved".
        if (
          data?.integrity_warning ||
          data?.is_recovery_draft ||
          data?.persisted === false ||
          data?.id == null
        ) {
          setEstimationResponse(null);
          setEstimationError(
            data?.message ||
              "No saved, approved estimation was found for the linked blueprint.",
          );
          return;
        }

        setEstimationResponse(data);
      } catch (err) {
        if (!cancelled) {
          setEstimationResponse(null);
          setEstimationError(
            err?.response?.data?.message ||
              "Failed to check blueprint estimation status.",
          );
        }
      } finally {
        if (!cancelled) {
          setLoadingEstimation(false);
        }
      }
    };

    fetchEstimation();

    return () => {
      cancelled = true;
    };
  }, [modal, form.order_id, canonicalBlueprintId, canonicalBlueprintValid]);

  const setF = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleOrderChange = (value) => {
    setForm((prev) => ({
      ...prev,
      order_id: value,
      blueprint_id: "",
    }));
    setSelectedOrderInfo(null);
    setOrderInfoError("");
    setEstimationResponse(null);
    setEstimationError("");
  };

  const printContract = (c) => {
    try {
      const doc = new jsPDF({ unit: "mm", format: "a4" });

      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();

      const margin = 14;
      const contentWidth = pageWidth - margin * 2;
      const bottomLimit = pageHeight - 18;

      let y = 16;
      const customerDisplayName = formatPersonName(c.customer_name);
      const authorizedPersonDisplayName = formatPersonName(
        c.issued_by_name || "Admin",
      );

      const drawFrame = () => {
        doc.setDrawColor(45, 45, 45);
        doc.setLineWidth(0.6);
        doc.rect(4, 4, pageWidth - 8, pageHeight - 8);

        doc.setDrawColor(150, 150, 150);
        doc.setLineWidth(0.2);
        doc.rect(8, 8, pageWidth - 16, pageHeight - 16);
      };

      const drawPageHeader = () => {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(15);
        doc.text("PROJECT CONTRACT AGREEMENT", pageWidth / 2, y, {
          align: "center",
        });
        y += 7;

        doc.setFont("helvetica", "normal");
        doc.setFontSize(8.5);
        const introText = `This Contract Agreement is entered into by and between Spiral Wood Services and ${
          customerDisplayName || "the Customer"
        } under the terms and conditions stated below.`;
        const introLines = doc.splitTextToSize(introText, contentWidth - 26);
        doc.text(introLines, pageWidth / 2, y, { align: "center" });
        y += introLines.length * 3.9 + 6;
      };

      const addPage = () => {
        doc.addPage();
        drawFrame();
        y = 14;
      };

      const ensureSpace = (needed = 10) => {
        if (y + needed > bottomLimit) addPage();
      };

      const drawParagraphBlock = (
        text,
        x,
        maxWidth,
        lineHeight = 3.85,
        paragraphGap = 1.5,
        fontSize = 8.5,
      ) => {
        const paragraphs = buildWrappedParagraphs(doc, text, maxWidth);

        if (!paragraphs.length) {
          y += lineHeight;
          return;
        }

        paragraphs.forEach((lines, index) => {
          const needed =
            Math.max(lines.length, 1) * lineHeight +
            (index < paragraphs.length - 1 ? paragraphGap : 0);

          ensureSpace(needed + 1);

          doc.setFont("helvetica", "normal");
          doc.setFontSize(fontSize);

          if (lines.length) doc.text(lines, x, y);

          y += Math.max(lines.length, 1) * lineHeight;

          if (index < paragraphs.length - 1) y += paragraphGap;
        });
      };

      const drawSection = (number, title, body) => {
        const estimatedBodyHeight = estimateTextBlockHeight(
          doc,
          body,
          contentWidth,
          3.85,
          1.5,
        );

        ensureSpace(5 + estimatedBodyHeight + 2);

        doc.setFont("helvetica", "bold");
        doc.setFontSize(9.6);
        doc.text(`${number}. ${title}`, margin, y);
        y += 5;

        drawParagraphBlock(body, margin, contentWidth, 3.85, 1.5, 8.5);
        y += 2.4;
      };

      const drawMiniSection = (
        title,
        rows,
        x,
        width,
        defaultLabelWidth = 28,
      ) => {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9.3);
        doc.text(title, x, y);

        let rowY = y + 5;

        rows.forEach((row) => {
          const label = `${row.label}:`;
          const labelWidth = row.labelWidth ?? defaultLabelWidth;

          doc.setFont("helvetica", "bold");
          doc.setFontSize(8.2);
          doc.text(label, x, rowY);

          if (row.line) {
            const lineStartX = x + labelWidth;
            const lineEndX = x + width - 2;

            doc.setDrawColor(90, 90, 90);
            doc.setLineWidth(0.25);
            doc.line(lineStartX, rowY, lineEndX, rowY);

            rowY += 4.6;
            return;
          }

          const value = row.value || "—";

          doc.setFont("helvetica", "normal");
          doc.setFontSize(8.2);
          const wrapped = doc.splitTextToSize(
            String(value),
            width - labelWidth,
          );
          doc.text(wrapped, x + labelWidth, rowY);

          rowY += Math.max(wrapped.length, 1) * 3.55 + 1;
        });

        return rowY;
      };

      const contractTermsText =
        String(c.materials_used || "").trim() || DEFAULT_TERMS;

      const terms = parseNumberedSections(contractTermsText);
      const warrantyText = c.warranty_terms || DEFAULT_WARRANTY;

      drawFrame();
      drawPageHeader();

      const leftX = margin;
      const rightX = 107;
      const colWidth = 82;

      const partiesRows = [
        {
          label: "Company Name",
          value: "Spiral Wood Services",
          labelWidth: 30,
        },
        {
          label: "Authorized Person / Project In-Charge",
          value: authorizedPersonDisplayName || "Admin",
          labelWidth: 63,
        },
        {
          label: "Customer Name",
          value: customerDisplayName || "____________________",
          labelWidth: 30,
        },
      ];

      const projectRows = [
        {
          label: "Contract No",
          value: `CNT-${String(c.id).padStart(5, "0")}`,
          labelWidth: 27,
        },
        {
          label: "Order No",
          value: `#${String(c.order_id).padStart(5, "0")}`,
          labelWidth: 27,
        },
        {
          label: "Blueprint Ref",
          value: c.blueprint_id
            ? `BP-${String(c.blueprint_id).padStart(5, "0")}`
            : "N/A",
          labelWidth: 27,
        },
        {
          label: "Date Issued",
          value: formatDatePdf(c.created_at),
          labelWidth: 27,
        },
        {
          label: "Total Amount",
          value: formatCurrencyPdf(c.total_amount || 0),
          labelWidth: 27,
        },
      ];

      ensureSpace(30);
      const leftEndY = drawMiniSection(
        "1. PARTIES INVOLVED",
        partiesRows,
        leftX,
        colWidth,
        30,
      );
      const rightEndY = drawMiniSection(
        "2. PROJECT DETAILS",
        projectRows,
        rightX,
        colWidth,
        27,
      );
      y = Math.max(leftEndY, rightEndY) + 4;

      terms.forEach((section, index) => {
        drawSection(index + 3, section.title, section.body);
      });

      drawSection(terms.length + 3, "WARRANTY", warrantyText);

      const signatureBlockHeight = 31;
      const authorizationHeight = 9;

      if (y + authorizationHeight + signatureBlockHeight > bottomLimit) {
        addPage();
      }

      drawSection(
        terms.length + 4,
        "AUTHORIZATION",
        "By signing below, both parties confirm their agreement to the terms stated in this contract.",
      );

      ensureSpace(signatureBlockHeight);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.text("SIGNATURES", pageWidth / 2, y, { align: "center" });
      y += 8;

      const sigLeftX = margin;
      const sigRightX = 110;
      const lineStartOffsetName = 13;
      const lineStartOffsetSig = 18;
      const lineStartOffsetDate = 11;
      const lineLength = 48;

      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.6);
      doc.text("Authorized Person / Project In-Charge", sigLeftX, y);
      doc.text("Customer", sigRightX, y);
      y += 8;

      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.setDrawColor(70, 70, 70);
      doc.setLineWidth(0.25);

      doc.text("Name:", sigLeftX, y);
      doc.text(
        authorizedPersonDisplayName || "Admin",
        sigLeftX + lineStartOffsetName,
        y - 0.8,
      );
      doc.line(sigLeftX + lineStartOffsetName, y, sigLeftX + lineLength, y);

      doc.text("Name:", sigRightX, y);
      doc.line(sigRightX + lineStartOffsetName, y, sigRightX + lineLength, y);
      y += 9;

      doc.text("Signature:", sigLeftX, y);
      doc.line(sigLeftX + lineStartOffsetSig, y, sigLeftX + lineLength, y);

      doc.text("Signature:", sigRightX, y);
      doc.line(sigRightX + lineStartOffsetSig, y, sigRightX + lineLength, y);
      y += 9;

      doc.text("Date:", sigLeftX, y);
      doc.line(sigLeftX + lineStartOffsetDate, y, sigLeftX + lineLength, y);

      doc.text("Date:", sigRightX, y);
      doc.line(sigRightX + lineStartOffsetDate, y, sigRightX + lineLength, y);

      doc.save(`contract_CNT-${String(c.id).padStart(5, "0")}.pdf`);
      toast.success("Contract PDF downloaded.");
    } catch (err) {
      toast.error("Failed to generate contract PDF.");
    }
  };

  const contractsThisMonth = contracts.filter((c) => {
    const d = new Date(c.created_at);
    const now = new Date();
    return (
      d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
    );
  }).length;

  const contractedOrderIds = new Set(
    contracts.map((c) => String(c.order_id || "")),
  );

  const availableOrders = orders.filter(
    (o) =>
      normalize(o.order_type) === "blueprint" &&
      normalize(o.status) === "confirmed" &&
      !contractedOrderIds.has(String(o.id)),
  );

  const duplicateOrderIds = useMemo(() => {
    const counts = new Map();

    contracts.forEach((contract) => {
      const key = String(contract.order_id || "");
      if (!key) return;
      counts.set(key, (counts.get(key) || 0) + 1);
    });

    return [...counts.entries()]
      .filter(([, count]) => count > 1)
      .map(([orderId]) => orderId);
  }, [contracts]);

  const paymentRows = Array.isArray(selectedOrderInfo?.payments)
    ? selectedOrderInfo.payments
    : [];

  // orderController.getOne may append a synthetic legacy row
  // (id: `initial_${order.id}`) when no real payment_transactions row
  // exists, derived from order.payment_status rather than an actual
  // verified transaction. That row — and selectedOrderInfo's own
  // payment_verified_total, which is computed from the same
  // synthetic-row-inclusive array on the backend — must never
  // contribute to contract eligibility. Only rows with a real,
  // persisted, strictly-numeric database id are counted here.
  const persistedPaymentRows = paymentRows.filter((payment) =>
    isPositiveIntegerString(payment?.id),
  );

  const verifiedPayments = persistedPaymentRows.filter(
    (payment) => normalize(payment?.status) === "verified",
  );

  const verifiedPaymentTotal = verifiedPayments.reduce(
    (sum, payment) => sum + Number(payment?.amount || 0),
    0,
  );

  const hasVerifiedPayment = verifiedPayments.length > 0;

  // Estimation eligibility — derived entirely from the full stored
  // response, never from a bare extracted status string. An unpersisted
  // recovery draft, a stale/blocked record, or a missing id can never
  // read as "approved" here, regardless of what estimationResponse.status
  // itself says.
  const estimationIntegrityBlocked =
    Boolean(estimationResponse?.integrity_warning) ||
    Boolean(estimationResponse?.is_recovery_draft) ||
    estimationResponse?.persisted === false ||
    estimationResponse?.id == null;

  const estimationGrandTotal = Number(estimationResponse?.grand_total);

  const estimationEligible =
    Boolean(estimationResponse) &&
    !estimationIntegrityBlocked &&
    normalize(estimationResponse?.status) === "approved" &&
    Number.isFinite(estimationGrandTotal) &&
    estimationGrandTotal > 0;

  const approvedEstimationTotal = estimationEligible ? estimationGrandTotal : 0;

  const orderTotalAmount = Number(selectedOrderInfo?.total_amount || 0);

  // Required down payment is always 30% of the APPROVED ESTIMATION total,
  // never derived from an unverified/corrupted order total alone. Rounded
  // to two decimals exactly like the backend's
  // Number((estimationGrandTotal * 0.3).toFixed(2)) so the two never
  // disagree at a cent boundary.
  const requiredDownPayment = Number(
    (approvedEstimationTotal * 0.3).toFixed(2),
  );

  const totalsMatch =
    approvedEstimationTotal > 0 &&
    orderTotalAmount > 0 &&
    Math.abs(orderTotalAmount - approvedEstimationTotal) <= 0.01;

  // Verified payment_transactions rows only — orders.payment_status and
  // payment_status_display are display-only and never authorize contract
  // generation (an order could read "paid" from a stale/corrupted total
  // while having zero actual verified transactions behind it).
  const paymentReady =
    estimationEligible &&
    verifiedPaymentTotal >= Math.max(0, requiredDownPayment - 0.01);

  const currentOrderStatus = normalize(
    selectedOrderInfo?.status || selectedOrderInfo?.raw_status,
  );

  const orderTypeValid =
    Boolean(selectedOrderInfo) &&
    normalize(selectedOrderInfo?.order_type) === "blueprint";

  const orderStatusConfirmed = currentOrderStatus === "confirmed";

  // Explicit block list (rather than "not confirmed") purely so the UI
  // can name the exact status a blocked order is sitting in — every one
  // of these, plus any unknown/empty value, resolves to the same
  // !orderStatusConfirmed condition underneath.
  const EXPLICITLY_BLOCKED_ORDER_STATUSES = [
    "pending",
    "contract_released",
    "production",
    "shipping",
    "delivered",
    "completed",
    "cancelled",
  ];
  const orderStatusBlocked =
    EXPLICITLY_BLOCKED_ORDER_STATUSES.includes(currentOrderStatus) ||
    !orderStatusConfirmed;

  const hasExistingContract = Boolean(selectedOrderInfo?.contract);

  const lifecycleIntegrityWarning = Boolean(
    selectedOrderInfo?.lifecycle_integrity_warning,
  );
  const lifecycleIntegrityReason =
    selectedOrderInfo?.lifecycle_integrity_reason || "";
  const conflictingOrderIds = Array.isArray(
    selectedOrderInfo?.conflicting_order_ids,
  )
    ? selectedOrderInfo.conflicting_order_ids
    : null;

  const hasCustomerId = Boolean(selectedOrderInfo?.customer_id);

  const contractTermsReady = Boolean(String(form.terms || "").trim());
  const warrantyTermsReady = Boolean(String(form.warranty_terms || "").trim());

  const validationItems = [
    {
      label: "Order selected",
      ok: Boolean(form.order_id) && isPositiveIntegerString(form.order_id),
      value: form.order_id
        ? `#${String(form.order_id).padStart(5, "0")}`
        : "Required",
    },
    {
      label: "Order type",
      ok: orderTypeValid,
      value: selectedOrderInfo
        ? titleCase(selectedOrderInfo.order_type)
        : loadingOrderInfo
          ? "Checking..."
          : "Not loaded",
    },
    {
      label: "Order status (must be confirmed)",
      ok: Boolean(selectedOrderInfo) && orderStatusConfirmed,
      value: loadingOrderInfo
        ? "Checking..."
        : selectedOrderInfo
          ? titleCase(selectedOrderInfo.status || selectedOrderInfo.raw_status)
          : orderInfoError || "Not loaded",
    },
    {
      label: "Customer on order",
      ok: hasCustomerId,
      value: hasCustomerId
        ? formatPersonName(selectedOrderInfo?.customer_name) || "Linked"
        : "Missing customer on order",
    },
    {
      label: "Existing contract",
      ok: !hasExistingContract,
      value: hasExistingContract
        ? "A contract already exists for this order"
        : "None",
    },
    {
      label: "Lifecycle integrity",
      ok: Boolean(selectedOrderInfo) && !lifecycleIntegrityWarning,
      value: !selectedOrderInfo
        ? "Not loaded"
        : lifecycleIntegrityWarning
          ? titleCase(lifecycleIntegrityReason) ||
            "Lifecycle integrity conflict — manual review required"
          : "OK",
    },
    {
      label: "Canonical blueprint",
      ok:
        Boolean(canonicalBlueprintId) &&
        canonicalBlueprintValid &&
        !manualBlueprintMismatch,
      value: manualBlueprintMismatch
        ? "Entered blueprint ID does not match this order's linked blueprint"
        : manualBlueprintInvalid
          ? "Invalid manual blueprint ID"
          : canonicalBlueprintId && !canonicalBlueprintValid
            ? "Invalid canonical blueprint ID on order"
            : canonicalBlueprintId
              ? `BP-${String(canonicalBlueprintId).padStart(5, "0")}`
              : "Missing linked blueprint",
    },
    {
      label: "Saved estimation",
      ok: estimationEligible,
      value: !canonicalBlueprintId
        ? "Waiting for canonical blueprint"
        : loadingEstimation
          ? "Checking..."
          : estimationEligible
            ? "Approved and saved"
            : estimationError || "Not available",
    },
    {
      label: "Approved estimation total",
      ok: approvedEstimationTotal > 0,
      value:
        approvedEstimationTotal > 0
          ? formatCurrencyUI(approvedEstimationTotal)
          : "Not available",
    },
    {
      label: "Order / estimation total match",
      ok: totalsMatch,
      value: totalsMatch
        ? `${formatCurrencyUI(orderTotalAmount)} matches estimation`
        : "Order total does not match the approved estimation total",
    },
    {
      label: "Verified payment (30% required)",
      ok: paymentReady,
      value: !estimationEligible
        ? "Waiting for approved estimation"
        : hasVerifiedPayment
          ? `Verified ${formatCurrencyUI(verifiedPaymentTotal)} / Required ${formatCurrencyUI(requiredDownPayment)}`
          : `At least 30% verified down payment required (Required ${formatCurrencyUI(requiredDownPayment)})`,
    },
    {
      label: "Contract terms",
      ok: contractTermsReady,
      value: contractTermsReady ? "Ready" : "Contract terms are required",
    },
    {
      label: "Warranty terms",
      ok: warrantyTermsReady,
      value: warrantyTermsReady ? "Ready" : "Warranty terms are required",
    },
  ];

  const canSubmit =
    Boolean(form.order_id) &&
    isPositiveIntegerString(form.order_id) &&
    !saving &&
    !loadingOrderInfo &&
    !loadingEstimation &&
    !orderInfoError &&
    Boolean(selectedOrderInfo) &&
    orderTypeValid &&
    orderStatusConfirmed &&
    hasCustomerId &&
    !hasExistingContract &&
    !lifecycleIntegrityWarning &&
    Boolean(canonicalBlueprintId) &&
    canonicalBlueprintValid &&
    !manualBlueprintInvalid &&
    !manualBlueprintMismatch &&
    estimationEligible &&
    orderTotalAmount > 0 &&
    totalsMatch &&
    paymentReady &&
    contractTermsReady &&
    warrantyTermsReady;

  const handleGenerate = async (e) => {
    e.preventDefault();

    if (!form.order_id || !isPositiveIntegerString(form.order_id)) {
      toast.error("Please select a valid order.");
      return;
    }

    const selectedOrder = availableOrders.find(
      (o) => String(o.id) === String(form.order_id),
    );

    if (!selectedOrder) {
      toast.error("Selected order is no longer available.");
      return;
    }

    if (loadingOrderInfo) {
      toast.error("Please wait while the selected order details are loading.");
      return;
    }

    if (orderInfoError || !selectedOrderInfo) {
      toast.error(orderInfoError || "Failed to validate the selected order.");
      return;
    }

    if (!orderTypeValid) {
      toast.error("Contracts can only be generated for blueprint orders.");
      return;
    }

    if (!orderStatusConfirmed) {
      toast.error(
        `Order must be exactly "confirmed" to generate a contract (current status: "${currentOrderStatus || "unknown"}").`,
      );
      return;
    }

    if (!hasCustomerId) {
      toast.error(
        "This order has no linked customer account; a contract requires a registered customer.",
      );
      return;
    }

    if (hasExistingContract) {
      toast.error("A contract already exists for this order.");
      return;
    }

    if (lifecycleIntegrityWarning) {
      toast.error(
        titleCase(lifecycleIntegrityReason) ||
          "This order has a lifecycle integrity conflict and requires manual review before a contract can be generated.",
      );
      return;
    }

    if (manualBlueprintInvalid) {
      toast.error("Blueprint ID must be a valid positive number.");
      return;
    }

    if (manualBlueprintMismatch) {
      toast.error(
        "The entered blueprint ID does not match this order's linked blueprint.",
      );
      return;
    }

    if (!canonicalBlueprintId) {
      toast.error(
        "A linked blueprint is required before generating a contract.",
      );
      return;
    }

    if (!canonicalBlueprintValid) {
      toast.error(
        "This order's linked blueprint ID is invalid. Please contact support.",
      );
      return;
    }

    if (loadingEstimation) {
      toast.error(
        "Please wait while the blueprint estimation is being checked.",
      );
      return;
    }

    if (!estimationEligible) {
      toast.error(
        estimationError ||
          "Only a saved, approved estimation can proceed to contract generation.",
      );
      return;
    }

    if (!(orderTotalAmount > 0)) {
      toast.error("Order total must be finalized before generating a contract.");
      return;
    }

    if (!totalsMatch) {
      toast.error(
        "Order total does not match the approved estimation total.",
      );
      return;
    }

    if (!paymentReady) {
      toast.error(
        "At least 30% verified down payment is required before generating a contract.",
      );
      return;
    }

    if (!contractTermsReady) {
      toast.error("Contract terms are required.");
      return;
    }

    if (!warrantyTermsReady) {
      toast.error("Warranty terms are required.");
      return;
    }

    if (!canSubmit) {
      // Defensive final backstop — every specific condition above should
      // already have caught the reason.
      toast.error("This contract cannot be generated right now.");
      return;
    }

    setSaving(true);
    try {
      // Canonical payload only — order_id and the canonical blueprint id
      // (never the manual/navigation-supplied value, and never any
      // server-owned field like customer_id, customer_name, total,
      // down_payment, or authorized_by; the backend derives all of those
      // itself from the locked, canonical order).
      const payload = {
        order_id: Number(form.order_id),
        blueprint_id: Number(canonicalBlueprintId),
        terms: String(form.terms || "").trim(),
        warranty_terms: String(form.warranty_terms || "").trim(),
      };

      const { data } = await api.post("/contracts", payload);

      toast.success(data?.message || "Contract generated.");
      setModal(false);
      resetForm();
      load();
    } catch (err) {
      // Preserve the modal and the user's entered terms on failure — do
      // not reset the form or imply a contract was generated.
      toast.error(
        err?.response?.data?.message || "Failed to generate contract.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: 20,
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div>
          <h1 style={pageTitle}>Contracts</h1>
          <p style={{ fontSize: 13, color: "#52525b", margin: "4px 0 0" }}>
            Generate and manage sales contracts for custom blueprint orders.
          </p>
        </div>

        <button onClick={() => setModal(true)} style={btnPrimary}>
          Generate Contract
        </button>
      </div>

      <div
        style={{
          display: "flex",
          gap: 12,
          marginBottom: 24,
          flexWrap: "wrap",
        }}
      >
        <SummaryCard
          label="Total Contracts"
          value={contracts.length}
          color="#18181b"
          icon="📝"
        />
        <SummaryCard
          label="This Month"
          value={contractsThisMonth}
          color="#18181b"
          icon="📅"
        />
      </div>

      {duplicateOrderIds.length > 0 && (
        <div style={warningBanner}>
          Historical duplicate contract rows were detected for order(s):{" "}
          {duplicateOrderIds
            .map((id) => `#${String(id).padStart(5, "0")}`)
            .join(", ")}
          . Existing records are still shown, but new duplicate generation is
          blocked by backend validation.
        </div>
      )}

      <div style={card}>
        <table
          style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}
        >
          <thead>
            <tr
              style={{
                background: "#fafafa",
                borderBottom: "1px solid #e4e4e7",
              }}
            >
              {[
                "Contract #",
                "Order #",
                "Customer",
                "Amount",
                "Blueprint",
                "Issued By",
                "Date Issued",
                "Actions",
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
                  Loading contracts...
                </td>
              </tr>
            ) : contracts.length === 0 ? (
              <tr>
                <td colSpan={8} style={centerCell}>
                  No contracts generated yet.
                </td>
              </tr>
            ) : (
              contracts.map((c) => (
                <tr key={c.id} style={{ borderBottom: "1px solid #f4f4f5" }}>
                  <td style={{ ...td, fontWeight: 800, color: "#0a0a0a" }}>
                    CNT-{String(c.id).padStart(5, "0")}
                  </td>

                  <td style={td}>
                    <button
                      onClick={() => navigate(`/admin/orders/${c.order_id}`)}
                      style={linkBtn}
                    >
                      #{String(c.order_id).padStart(5, "0")}
                    </button>
                  </td>

                  <td style={td}>
                    <div style={{ fontWeight: 600, color: "#18181b" }}>
                      {formatPersonName(c.customer_name) || "—"}
                    </div>
                    <div
                      style={{ fontSize: 11, color: "#71717a", marginTop: 2 }}
                    >
                      {c.customer_email || ""}
                    </div>
                  </td>

                  <td style={{ ...td, fontWeight: 700, color: "#0a0a0a" }}>
                    {c.total_amount ? formatCurrencyUI(c.total_amount) : "—"}
                  </td>

                  <td style={td}>
                    {c.blueprint_id ? (
                      <button
                        onClick={() =>
                          navigate(`/admin/blueprints/${c.blueprint_id}/design`)
                        }
                        style={linkBtn}
                      >
                        BP-{String(c.blueprint_id).padStart(5, "0")}
                      </button>
                    ) : (
                      <span style={{ color: "#a1a1aa" }}>—</span>
                    )}
                  </td>

                  <td style={td}>{c.issued_by_name || "Admin"}</td>

                  <td
                    style={{
                      ...td,
                      fontSize: 12,
                      color: "#71717a",
                      fontWeight: 500,
                    }}
                  >
                    {formatDate(c.created_at)}
                  </td>

                  <td style={td}>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <button onClick={() => printContract(c)} style={btnPrint}>
                        Print
                      </button>
                      <button
                        onClick={() => navigate(`/admin/orders/${c.order_id}`)}
                        style={btnView}
                      >
                        View Order
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {modal && (
        <div style={overlay}>
          <div style={{ ...modalBox, width: 700 }}>
            <h3
              style={{
                margin: "0 0 6px",
                color: "#0a0a0a",
                fontSize: 20,
                fontWeight: 800,
                letterSpacing: "-0.01em",
              }}
            >
              Generate Sales Contract
            </h3>
            <p style={{ fontSize: 13, color: "#71717a", margin: "0 0 24px" }}>
              Select a confirmed blueprint order, verify the linked blueprint
              reference and approved estimation, then customize the contract
              terms before generating.
            </p>

            <form onSubmit={handleGenerate}>
              <div style={{ marginBottom: 16 }}>
                <label style={labelSm}>Order * (Confirmed orders only)</label>
                <select
                  required
                  value={form.order_id}
                  onChange={(e) => handleOrderChange(e.target.value)}
                  style={inputFull}
                >
                  <option value="">— Select Order —</option>
                  {availableOrders.map((o) => (
                    <option key={o.id} value={o.id}>
                      #{String(o.id).padStart(5, "0")} —{" "}
                      {formatPersonName(o.customer_name) || "—"} —{" "}
                      {formatCurrencyUI(o.total_amount || 0)}
                    </option>
                  ))}
                </select>

                {availableOrders.length === 0 && (
                  <p
                    style={{
                      fontSize: 11,
                      color: "#dc2626",
                      marginTop: 6,
                      fontWeight: 600,
                    }}
                  >
                    No selectable confirmed orders available. Orders with
                    existing contracts are excluded, and final contract
                    eligibility is still checked against blueprint reference,
                    payment, estimation approval, and order status.
                  </p>
                )}
              </div>

              <div style={{ marginBottom: 20 }}>
                <label style={labelSm}>Linked blueprint (from order)</label>
                <input
                  type="text"
                  value={
                    canonicalBlueprintId
                      ? `BP-${String(canonicalBlueprintId).padStart(5, "0")}`
                      : selectedOrderInfo
                        ? "No blueprint linked to this order"
                        : "Select an order to load its linked blueprint"
                  }
                  readOnly
                  style={{ ...inputFull, background: "#f4f4f5", color: "#52525b" }}
                />
                <p
                  style={{
                    fontSize: 11,
                    color: "#71717a",
                    marginTop: 6,
                    fontWeight: 500,
                  }}
                >
                  The blueprint used for this contract always comes from the
                  selected order — it is never chosen manually.
                </p>

                <label style={{ ...labelSm, marginTop: 14, display: "block" }}>
                  Blueprint ID reference check (optional)
                </label>
                <input
                  type="number"
                  value={form.blueprint_id}
                  onChange={(e) => setF("blueprint_id", e.target.value)}
                  style={inputFull}
                  placeholder="Optional — only checked against the order's linked blueprint above"
                />
                <p
                  style={{
                    fontSize: 11,
                    color: manualBlueprintMismatch ? "#dc2626" : "#71717a",
                    marginTop: 6,
                    fontWeight: manualBlueprintMismatch ? 700 : 500,
                  }}
                >
                  {manualBlueprintMismatch
                    ? "This does not match the order's linked blueprint above — contract generation is blocked until this is cleared or corrected."
                    : "This value is only used to verify it matches the order's linked blueprint (e.g. when opened from another page). It never replaces or controls which blueprint is used."}
                </p>
              </div>

              {form.order_id && (
                <div style={eligibilityCard}>
                  <div style={eligibilityTitle}>Contract Eligibility Check</div>

                  {loadingOrderInfo ? (
                    <div style={infoText}>
                      Loading selected order details...
                    </div>
                  ) : orderInfoError ? (
                    <div style={errorText}>{orderInfoError}</div>
                  ) : (
                    <>
                      <div style={eligibilityGrid}>
                        <EligibilityItem
                          label="Customer"
                          ok={hasCustomerId}
                          value={
                            formatPersonName(
                              selectedOrderInfo?.customer_name,
                            ) || (hasCustomerId ? "Linked" : "Missing customer on order")
                          }
                        />
                        <EligibilityItem
                          label="Order Amount"
                          ok={orderTotalAmount > 0}
                          value={formatCurrencyUI(orderTotalAmount)}
                        />
                        <EligibilityItem
                          label="Order Type"
                          ok={orderTypeValid}
                          value={titleCase(selectedOrderInfo?.order_type)}
                        />
                        <EligibilityItem
                          label="Order Status (must be confirmed)"
                          ok={orderStatusConfirmed}
                          value={titleCase(
                            selectedOrderInfo?.status ||
                              selectedOrderInfo?.raw_status,
                          )}
                        />
                        <EligibilityItem
                          label="Existing Contract"
                          ok={!hasExistingContract}
                          value={
                            hasExistingContract
                              ? "A contract already exists for this order"
                              : "None"
                          }
                        />
                        <EligibilityItem
                          label="Lifecycle Integrity"
                          ok={!lifecycleIntegrityWarning}
                          value={
                            lifecycleIntegrityWarning
                              ? titleCase(lifecycleIntegrityReason) ||
                                "Conflict — manual review required"
                              : "OK"
                          }
                        />
                        <EligibilityItem
                          label="Canonical Blueprint"
                          ok={
                            Boolean(canonicalBlueprintId) &&
                            canonicalBlueprintValid &&
                            !manualBlueprintInvalid &&
                            !manualBlueprintMismatch
                          }
                          value={
                            manualBlueprintMismatch
                              ? "Entered ID does not match order's blueprint"
                              : manualBlueprintInvalid
                                ? "Invalid manual blueprint ID"
                                : canonicalBlueprintId && !canonicalBlueprintValid
                                  ? "Invalid canonical blueprint ID on order"
                                  : canonicalBlueprintId
                                    ? `BP-${String(canonicalBlueprintId).padStart(5, "0")}`
                                    : "Missing linked blueprint"
                          }
                        />
                        <EligibilityItem
                          label="Saved Estimation"
                          ok={estimationEligible}
                          value={
                            !canonicalBlueprintId
                              ? "Waiting for canonical blueprint"
                              : loadingEstimation
                                ? "Checking..."
                                : estimationEligible
                                  ? "Approved and saved"
                                  : estimationError || "Not available"
                          }
                        />
                        <EligibilityItem
                          label="Approved Estimation Total"
                          ok={approvedEstimationTotal > 0}
                          value={
                            approvedEstimationTotal > 0
                              ? formatCurrencyUI(approvedEstimationTotal)
                              : "Not available"
                          }
                        />
                        <EligibilityItem
                          label="Order / Estimation Total Match"
                          ok={totalsMatch}
                          value={
                            totalsMatch
                              ? "Matches"
                              : "Order total does not match the approved estimation total"
                          }
                        />
                        <EligibilityItem
                          label="Verified Payment (30% required)"
                          ok={paymentReady}
                          value={
                            !estimationEligible
                              ? "Waiting for approved estimation"
                              : hasVerifiedPayment
                                ? `Verified ${formatCurrencyUI(verifiedPaymentTotal)} / Required ${formatCurrencyUI(requiredDownPayment)}`
                                : `At least 30% verified down payment required (Required ${formatCurrencyUI(requiredDownPayment)})`
                          }
                        />
                      </div>

                      {hasExistingContract && (
                        <div style={{ ...errorBox, marginTop: 16 }}>
                          A contract is already linked to this order.
                        </div>
                      )}

                      {lifecycleIntegrityWarning && (
                        <div style={{ ...errorBox, marginTop: 16 }}>
                          This order's blueprint lifecycle has an integrity
                          conflict
                          {lifecycleIntegrityReason
                            ? ` (${titleCase(lifecycleIntegrityReason)})`
                            : ""}
                          . Manual review is required before a contract can be
                          generated.
                          {conflictingOrderIds && conflictingOrderIds.length ? (
                            <>
                              {" "}
                              Conflicting order IDs:{" "}
                              {conflictingOrderIds.join(", ")}.
                            </>
                          ) : null}
                        </div>
                      )}

                      {!lifecycleIntegrityWarning && orderStatusBlocked && (
                        <div style={{ ...errorBox, marginTop: 16 }}>
                          This order is no longer eligible because it is
                          already {titleCase(currentOrderStatus) || "in an unknown status"}.
                        </div>
                      )}

                      {manualBlueprintMismatch && (
                        <div style={{ ...errorBox, marginTop: 16 }}>
                          The entered blueprint ID does not match this
                          order&apos;s linked blueprint. Contract generation is
                          blocked until this is cleared or corrected.
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              <div style={{ marginBottom: 16 }}>
                <label style={labelSm}>Contract Terms & Conditions</label>
                <textarea
                  value={form.terms}
                  onChange={(e) => setF("terms", e.target.value)}
                  rows={8}
                  style={{
                    ...inputFull,
                    resize: "vertical",
                    fontSize: 13,
                    lineHeight: 1.6,
                    minHeight: 180,
                    fontFamily: "inherit",
                  }}
                />
              </div>

              <div style={{ marginBottom: 24 }}>
                <label style={labelSm}>Warranty Terms</label>
                <textarea
                  value={form.warranty_terms}
                  onChange={(e) => setF("warranty_terms", e.target.value)}
                  rows={5}
                  style={{
                    ...inputFull,
                    resize: "vertical",
                    fontSize: 13,
                    lineHeight: 1.6,
                    minHeight: 120,
                    fontFamily: "inherit",
                  }}
                />
              </div>

              <div style={validationSummaryBox}>
                <div style={validationSummaryTitle}>Pre-submit Validation</div>
                <div style={validationList}>
                  {validationItems.map((item) => (
                    <div key={item.label} style={validationRow}>
                      <span
                        style={{
                          ...validationDot,
                          background: item.ok ? "#16a34a" : "#dc2626",
                        }}
                      />
                      <div style={{ minWidth: 0 }}>
                        <div style={validationLabel}>{item.label}</div>
                        <div
                          style={{
                            ...validationValue,
                            color: item.ok ? "#166534" : "#991b1b",
                          }}
                        >
                          {item.value}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div
                style={{
                  display: "flex",
                  gap: 10,
                  justifyContent: "flex-end",
                  flexWrap: "wrap",
                  marginTop: 28,
                }}
              >
                <button
                  type="button"
                  onClick={() => {
                    setModal(false);
                    resetForm();
                  }}
                  style={btnGhost}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={!canSubmit}
                  style={{
                    ...btnPrimary,
                    opacity: canSubmit ? 1 : 0.6,
                    cursor: canSubmit ? "pointer" : "not-allowed",
                  }}
                >
                  {saving ? "Generating..." : "Generate Contract"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryCard({ label, value, color, icon }) {
  return (
    <div
      style={{
        background: "#fff",
        borderRadius: 16,
        padding: "16px 20px",
        border: "1px solid #e4e4e7",
        borderLeft: `4px solid ${color}`,
        boxShadow: "0 1px 2px rgba(0,0,0,.02)",
        minWidth: 160,
        flex: 1,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div>
          <p
            style={{
              fontSize: 10,
              color: "#71717a",
              margin: 0,
              textTransform: "uppercase",
              letterSpacing: "1px",
              fontWeight: 800,
            }}
          >
            {label}
          </p>
          <p
            style={{
              fontSize: 26,
              fontWeight: 800,
              color: "#0a0a0a",
              margin: "6px 0 0",
              letterSpacing: "-0.02em",
            }}
          >
            {value}
          </p>
        </div>
        <span style={{ fontSize: 24 }}>{icon}</span>
      </div>
    </div>
  );
}

function EligibilityItem({ label, value, ok }) {
  return (
    <div style={eligibilityItem}>
      <div style={eligibilityItemLabel}>{label}</div>
      <div
        style={{
          ...eligibilityItemValue,
          color: ok ? "#166534" : "#991b1b",
        }}
      >
        {value}
      </div>
    </div>
  );
}

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

const th = {
  textAlign: "left",
  padding: "14px 16px",
  fontSize: 10,
  fontWeight: 800,
  color: "#71717a",
  textTransform: "uppercase",
  letterSpacing: "1px",
};

const td = {
  padding: "14px 16px",
  color: "#18181b",
  verticalAlign: "middle",
};

const centerCell = {
  textAlign: "center",
  padding: 40,
  color: "#71717a",
  fontWeight: 600,
  fontSize: 13,
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
  padding: "10px 14px",
  border: "1px solid #e4e4e7",
  borderRadius: 8,
  fontSize: 13,
  color: "#18181b",
  boxSizing: "border-box",
  outline: "none",
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
  maxHeight: "90vh",
  overflowY: "auto",
  border: "1px solid #e4e4e7",
  boxShadow: "0 25px 60px rgba(0, 0, 0, 0.15)",
};

const btnPrimary = {
  padding: "10px 20px",
  background: "#18181b",
  color: "#fff",
  border: "none",
  borderRadius: 8,
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 700,
  transition: "background 0.2s",
};

const btnGhost = {
  padding: "10px 16px",
  background: "#f4f4f5",
  color: "#18181b",
  border: "1px solid #e4e4e7",
  borderRadius: 8,
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 700,
  transition: "all 0.2s",
};

const btnPrint = {
  padding: "6px 14px",
  background: "#f4f4f5",
  color: "#18181b",
  border: "1px solid #e4e4e7",
  borderRadius: 8,
  cursor: "pointer",
  fontSize: 12,
  fontWeight: 700,
  transition: "background 0.2s",
};

const btnView = {
  padding: "6px 14px",
  background: "#18181b",
  color: "#ffffff",
  border: "1px solid #18181b",
  borderRadius: 8,
  cursor: "pointer",
  fontSize: 12,
  fontWeight: 700,
  transition: "background 0.2s",
};

const linkBtn = {
  background: "none",
  border: "none",
  color: "#0a0a0a",
  fontWeight: 800,
  cursor: "pointer",
  fontSize: 13,
  textDecoration: "underline",
};

const warningBanner = {
  marginBottom: 20,
  padding: "14px 16px",
  borderRadius: 12,
  background: "#fefce8",
  border: "1px solid #fde047",
  color: "#a16207",
  fontSize: 13,
  lineHeight: 1.6,
  fontWeight: 500,
};

const eligibilityCard = {
  marginBottom: 24,
  padding: 16,
  borderRadius: 12,
  background: "#fafafa",
  border: "1px solid #e4e4e7",
};

const eligibilityTitle = {
  fontSize: 12,
  fontWeight: 800,
  color: "#0a0a0a",
  marginBottom: 16,
  textTransform: "uppercase",
  letterSpacing: "1px",
};

const eligibilityGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 12,
};

const eligibilityItem = {
  background: "#ffffff",
  border: "1px solid #e4e4e7",
  borderRadius: 8,
  padding: "12px 14px",
};

const eligibilityItemLabel = {
  fontSize: 10,
  fontWeight: 800,
  color: "#71717a",
  marginBottom: 6,
  textTransform: "uppercase",
  letterSpacing: "1px",
};

const eligibilityItemValue = {
  fontSize: 13,
  fontWeight: 700,
  lineHeight: 1.5,
  wordBreak: "break-word",
};

const infoText = {
  fontSize: 13,
  color: "#52525b",
  fontWeight: 500,
};

const errorText = {
  fontSize: 13,
  color: "#dc2626",
  lineHeight: 1.5,
  fontWeight: 600,
};

const errorBox = {
  padding: "12px 14px",
  borderRadius: 8,
  background: "#fef2f2",
  border: "1px solid #fecaca",
  color: "#991b1b",
  fontSize: 12,
  fontWeight: 700,
};

const validationSummaryBox = {
  marginBottom: 24,
  padding: 18,
  borderRadius: 12,
  background: "#fafafa",
  border: "1px solid #e4e4e7",
};

const validationSummaryTitle = {
  fontSize: 11,
  fontWeight: 800,
  color: "#0a0a0a",
  marginBottom: 16,
  textTransform: "uppercase",
  letterSpacing: "1px",
};

const validationList = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 12,
};

const validationRow = {
  display: "flex",
  alignItems: "flex-start",
  gap: 12,
  background: "#ffffff",
  border: "1px solid #e4e4e7",
  borderRadius: 8,
  padding: "12px 14px",
};

const validationDot = {
  width: 10,
  height: 10,
  borderRadius: 999,
  flexShrink: 0,
  marginTop: 4,
};

const validationLabel = {
  fontSize: 10,
  fontWeight: 800,
  color: "#71717a",
  marginBottom: 4,
  textTransform: "uppercase",
  letterSpacing: "1px",
};

const validationValue = {
  fontSize: 12,
  fontWeight: 700,
  lineHeight: 1.5,
  wordBreak: "break-word",
};
