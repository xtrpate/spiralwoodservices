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

function extractEstimationStatus(data) {
  const candidates = [
    data?.status,
    data?.estimation_status,
    data?.latest?.status,
    data?.latest_estimation?.status,
    data?.estimation?.status,
    data?.data?.status,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return normalize(candidate);
    }
  }

  if (Array.isArray(data)) {
    for (const row of data) {
      if (typeof row?.status === "string" && row.status.trim()) {
        return normalize(row.status);
      }
    }
  }

  if (Array.isArray(data?.rows)) {
    for (const row of data.rows) {
      if (typeof row?.status === "string" && row.status.trim()) {
        return normalize(row.status);
      }
    }
  }

  return "";
}

function isPositiveIntegerString(value) {
  return /^\d+$/.test(String(value || "").trim()) && Number(value) > 0;
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

  const [estimationStatus, setEstimationStatus] = useState("");
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
    setEstimationStatus("");
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

  const resolvedBlueprintId = useMemo(() => {
    if (manualBlueprintId) return manualBlueprintId;

    const fromOrder =
      selectedOrderInfo?.blueprint_id ||
      selectedOrderInfo?.contract?.blueprint_id ||
      "";

    return fromOrder ? String(fromOrder) : "";
  }, [manualBlueprintId, selectedOrderInfo]);

  useEffect(() => {
    if (!modal || !form.order_id || !resolvedBlueprintId) {
      setEstimationStatus("");
      setEstimationError("");
      return;
    }

    let cancelled = false;

    const fetchEstimation = async () => {
      setLoadingEstimation(true);
      setEstimationStatus("");
      setEstimationError("");

      try {
        const { data } = await api.get(
          `/blueprints/${resolvedBlueprintId}/estimation`,
        );
        const nextStatus = extractEstimationStatus(data);

        if (!cancelled) {
          if (nextStatus) {
            setEstimationStatus(nextStatus);
          } else {
            setEstimationError(
              "No saved estimation was found for the linked blueprint.",
            );
          }
        }
      } catch (err) {
        if (!cancelled) {
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
  }, [modal, form.order_id, resolvedBlueprintId]);

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
    setEstimationStatus("");
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
    (o) => !contractedOrderIds.has(String(o.id)),
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

  const verifiedPayments = paymentRows.filter(
    (payment) => normalize(payment?.status) === "verified",
  );

  const verifiedPaymentTotal = verifiedPayments.reduce(
    (sum, payment) => sum + Number(payment?.amount || 0),
    0,
  );

  const orderTotalAmount = Number(selectedOrderInfo?.total_amount || 0);
  const minimumDownPayment = orderTotalAmount * 0.3;

  const hasVerifiedPayment = verifiedPayments.length > 0;

  const paymentReady =
    normalize(
      selectedOrderInfo?.payment_status_display ||
        selectedOrderInfo?.payment_status,
    ) === "paid" ||
    verifiedPaymentTotal >= Math.max(0, minimumDownPayment - 0.01);

  const currentOrderStatus = normalize(
    selectedOrderInfo?.status || selectedOrderInfo?.raw_status,
  );

  const blockedOrderStatus = [
    "cancelled",
    "completed",
    "shipping",
    "delivered",
  ].includes(currentOrderStatus);

  const hasExistingContract = Boolean(selectedOrderInfo?.contract);

  const manualBlueprintInvalid =
    manualBlueprintId && !isPositiveIntegerString(manualBlueprintId);

  const validationItems = [
    {
      label: "Order selected",
      ok: Boolean(form.order_id),
      value: form.order_id
        ? `#${String(form.order_id).padStart(5, "0")}`
        : "Required",
    },
    {
      label: "Order status",
      ok: Boolean(selectedOrderInfo) && !blockedOrderStatus,
      value: loadingOrderInfo
        ? "Checking..."
        : selectedOrderInfo
          ? titleCase(selectedOrderInfo.status || selectedOrderInfo.raw_status)
          : orderInfoError || "Not loaded",
    },
    {
      label: "Blueprint reference",
      ok: Boolean(resolvedBlueprintId) && !manualBlueprintInvalid,
      value: manualBlueprintInvalid
        ? "Invalid manual blueprint ID"
        : resolvedBlueprintId
          ? `BP-${String(resolvedBlueprintId).padStart(5, "0")}`
          : "Missing linked blueprint",
    },
    {
      label: "Payment requirement",
      ok: Boolean(selectedOrderInfo) && paymentReady,
      value: loadingOrderInfo
        ? "Checking..."
        : selectedOrderInfo
          ? normalize(
              selectedOrderInfo.payment_status_display ||
                selectedOrderInfo.payment_status,
            ) === "paid"
            ? "Order marked as paid"
            : hasVerifiedPayment
              ? `Verified ₱ ${verifiedPaymentTotal.toLocaleString("en-PH", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })} / Required ₱ ${minimumDownPayment.toLocaleString("en-PH", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}`
              : `At least 30% verified down payment required`
          : "Not checked",
    },
    {
      label: "Estimation approval",
      ok: Boolean(resolvedBlueprintId) && estimationStatus === "approved",
      value: !resolvedBlueprintId
        ? "Waiting for blueprint reference"
        : loadingEstimation
          ? "Checking..."
          : estimationStatus
            ? titleCase(estimationStatus)
            : estimationError || "Not checked",
    },
    {
      label: "Contract terms",
      ok: Boolean(String(form.terms || "").trim()),
      value: String(form.terms || "").trim()
        ? "Ready"
        : "Contract terms are required",
    },
    {
      label: "Warranty terms",
      ok: Boolean(String(form.warranty_terms || "").trim()),
      value: String(form.warranty_terms || "").trim()
        ? "Ready"
        : "Warranty terms are required",
    },
  ];

  const canSubmit =
    Boolean(form.order_id) &&
    !saving &&
    !loadingOrderInfo &&
    !loadingEstimation &&
    !orderInfoError &&
    !manualBlueprintInvalid &&
    Boolean(selectedOrderInfo) &&
    !blockedOrderStatus &&
    !hasExistingContract &&
    Boolean(resolvedBlueprintId) &&
    paymentReady &&
    estimationStatus === "approved" &&
    Boolean(String(form.terms || "").trim()) &&
    Boolean(String(form.warranty_terms || "").trim());

  const handleGenerate = async (e) => {
    e.preventDefault();

    if (!form.order_id) {
      toast.error("Please select an order.");
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

    if (hasExistingContract) {
      toast.error("A contract already exists for this order.");
      return;
    }

    if (blockedOrderStatus) {
      toast.error(
        "Contract can only be generated for active blueprint orders.",
      );
      return;
    }

    if (manualBlueprintInvalid) {
      toast.error("Blueprint ID must be a valid positive number.");
      return;
    }

    if (!resolvedBlueprintId) {
      toast.error(
        "A linked blueprint is required before generating a contract.",
      );
      return;
    }

    if (!String(form.terms || "").trim()) {
      toast.error("Contract terms are required.");
      return;
    }

    if (!String(form.warranty_terms || "").trim()) {
      toast.error("Warranty terms are required.");
      return;
    }

    if (!paymentReady) {
      toast.error(
        "At least 30% verified down payment or full paid status is required before generating a contract.",
      );
      return;
    }

    if (loadingEstimation) {
      toast.error(
        "Please wait while the blueprint estimation is being checked.",
      );
      return;
    }

    if (estimationStatus !== "approved") {
      toast.error(
        estimationError ||
          "Only approved estimations can proceed to contract generation.",
      );
      return;
    }

    setSaving(true);
    try {
      const payload = {
        order_id: Number(form.order_id),
        blueprint_id: manualBlueprintId ? Number(manualBlueprintId) : null,
        terms: String(form.terms || "").trim(),
        warranty_terms: String(form.warranty_terms || "").trim(),
      };

      const { data } = await api.post("/contracts", payload);

      toast.success(data?.message || "Contract generated.");
      setModal(false);
      resetForm();
      load();
    } catch (err) {
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
                <label style={labelSm}>Blueprint ID</label>
                <input
                  type="number"
                  value={form.blueprint_id}
                  onChange={(e) => setF("blueprint_id", e.target.value)}
                  style={inputFull}
                  placeholder="Leave blank only if the selected order already has a linked blueprint"
                />
                <p
                  style={{
                    fontSize: 11,
                    color: "#71717a",
                    marginTop: 6,
                    fontWeight: 500,
                  }}
                >
                  Manual override only. If the selected order already has a
                  blueprint attached, it will be used automatically.
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
                          ok={Boolean(selectedOrderInfo?.customer_name)}
                          value={
                            formatPersonName(
                              selectedOrderInfo?.customer_name,
                            ) || "—"
                          }
                        />
                        <EligibilityItem
                          label="Order Amount"
                          ok
                          value={formatCurrencyUI(
                            selectedOrderInfo?.total_amount || 0,
                          )}
                        />
                        <EligibilityItem
                          label="Order Status"
                          ok={!blockedOrderStatus}
                          value={titleCase(
                            selectedOrderInfo?.status ||
                              selectedOrderInfo?.raw_status,
                          )}
                        />
                        <EligibilityItem
                          label="Blueprint Ref"
                          ok={
                            Boolean(resolvedBlueprintId) &&
                            !manualBlueprintInvalid
                          }
                          value={
                            manualBlueprintInvalid
                              ? "Invalid manual blueprint ID"
                              : resolvedBlueprintId
                                ? `BP-${String(resolvedBlueprintId).padStart(5, "0")}`
                                : "Missing linked blueprint"
                          }
                        />
                        <EligibilityItem
                          label="Payment"
                          ok={paymentReady}
                          value={
                            normalize(
                              selectedOrderInfo?.payment_status_display ||
                                selectedOrderInfo?.payment_status,
                            ) === "paid"
                              ? "Order marked as paid"
                              : hasVerifiedPayment
                                ? `Verified ₱ ${verifiedPaymentTotal.toLocaleString(
                                    "en-PH",
                                    {
                                      minimumFractionDigits: 2,
                                      maximumFractionDigits: 2,
                                    },
                                  )} / Required ₱ ${minimumDownPayment.toLocaleString(
                                    "en-PH",
                                    {
                                      minimumFractionDigits: 2,
                                      maximumFractionDigits: 2,
                                    },
                                  )}`
                                : "At least 30% verified down payment required"
                          }
                        />
                        <EligibilityItem
                          label="Estimation"
                          ok={
                            Boolean(resolvedBlueprintId) &&
                            estimationStatus === "approved"
                          }
                          value={
                            !resolvedBlueprintId
                              ? "Waiting for blueprint reference"
                              : loadingEstimation
                                ? "Checking..."
                                : estimationStatus
                                  ? titleCase(estimationStatus)
                                  : estimationError || "Not checked"
                          }
                        />
                      </div>

                      {hasExistingContract && (
                        <div style={{ ...errorBox, marginTop: 16 }}>
                          A contract is already linked to this order.
                        </div>
                      )}

                      {blockedOrderStatus && (
                        <div style={{ ...errorBox, marginTop: 16 }}>
                          This order is no longer eligible because it is already{" "}
                          {titleCase(currentOrderStatus)}.
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
