import { useCallback, useEffect, useMemo, useState } from "react";
import api, { buildAssetUrl } from "../../services/api";
import useAuthStore from "../../store/authStore";

const normalize = (value) => String(value || "").toLowerCase();

const formatDateTime = (value) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

const formatStatus = (value) => {
  if (!value) return "—";
  return String(value)
    .replaceAll("_", " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
};

const getStatusMeta = (status) => {
  const normalized = normalize(status);
  switch (normalized) {
    case "scheduled":
      return { bg: "#ffffff", border: "#d4d4d8", text: "#52525b" };
    case "in_transit":
      return { bg: "#f4f4f5", border: "#e4e4e7", text: "#18181b" };
    case "delivered":
      return { bg: "#0a0a0a", border: "#0a0a0a", text: "#ffffff" };
    case "failed":
      return { bg: "#fef2f2", border: "#fecaca", text: "#991b1b" };
    default:
      return { bg: "#fafafa", border: "#e4e4e7", text: "#71717a" };
  }
};

export default function DeliveryManagement() {
  const { user } = useAuthStore();
  const isDeliveryRider =
    user?.role === "staff" && user?.staff_type === "delivery_rider";

  const [deliveries, setDeliveries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [savingId, setSavingId] = useState(null);
  const [receiptFiles, setReceiptFiles] = useState({});
  const [collectionForms, setCollectionForms] = useState({});

  const [search, setSearch] = useState("");

  const loadDeliveries = useCallback(async () => {
    setLoading(true);
    setError("");
    setSuccess("");

    try {
      const res = await api.get("/pos/deliveries");
      const list = Array.isArray(res.data) ? res.data : [];
      setDeliveries(list);
    } catch (err) {
      console.error("Delivery load error:", err?.response?.data || err);
      setError(
        err?.response?.data?.message ||
          `Failed to load deliveries.${
            err?.response?.status ? ` (HTTP ${err.response.status})` : ""
          }`,
      );
      setDeliveries([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDeliveries();
  }, [loadDeliveries]);

  const handleReceiptChange = (id, file) => {
    setReceiptFiles((prev) => ({
      ...prev,
      [id]: file || null,
    }));
  };

  const getCollectionForm = (delivery) => {
    const defaultAmount =
      Number(delivery.payment_balance || 0) > 0
        ? Number(delivery.payment_balance || 0).toFixed(2)
        : "";

    const saved = collectionForms[delivery.id] || {};

    return {
      amount: defaultAmount,
      payment_method: saved.payment_method || "cash",
      collection_notes: saved.collection_notes || "",
    };
  };

  const updateCollectionForm = (deliveryId, key, value) => {
    setCollectionForms((prev) => {
      const current = prev[deliveryId] || {
        amount: "",
        payment_method: "cash",
        collection_notes: "",
      };

      return {
        ...prev,
        [deliveryId]: {
          ...current,
          [key]: value,
        },
      };
    });
  };

  const validateReceiptFile = (file) => {
    if (!file) return null;

    const isImage = String(file.type || "").startsWith("image/");
    const isPdf = file.type === "application/pdf";

    if (!isImage && !isPdf) {
      return "Only image or PDF files are allowed for signed receipt upload.";
    }

    const maxFileSize = 5 * 1024 * 1024;
    if (file.size > maxFileSize) {
      return "Signed receipt file is too large. Maximum allowed size is 5 MB.";
    }

    return null;
  };

  const validateCollectionForm = (
    delivery,
    collectionForm,
    { requireAmount = false } = {},
  ) => {
    const paymentBalance = Number(delivery.payment_balance || 0);
    const rawAmount = String(collectionForm?.amount ?? "").trim();
    const amount = Number(rawAmount || 0);
    const paymentMethod = String(
      collectionForm?.payment_method || "cash",
    ).toLowerCase();

    if (paymentBalance <= 0.009) {
      return "";
    }

    if (paymentMethod !== "cash") {
      return "Cash is the only allowed payment method for rider collection.";
    }

    if (requireAmount && !rawAmount) {
      return "Please enter the amount collected by the rider before completing this delivery.";
    }

    if (rawAmount && (!Number.isFinite(amount) || amount <= 0)) {
      return "Collected amount must be greater than zero.";
    }

    if (rawAmount && amount > paymentBalance + 0.01) {
      return `Collected amount cannot exceed the remaining balance of ₱${paymentBalance.toLocaleString(
        "en-PH",
        { minimumFractionDigits: 2 },
      )}.`;
    }

    return "";
  };

  const saveDeliveryUpdate = async ({
    delivery,
    nextStatus,
    requireReceipt = false,
    allowReceiptOnly = false,
    successMessage,
  }) => {
    const selectedFile = receiptFiles[delivery.id] || null;
    const hasExistingReceipt = Boolean(delivery.signed_receipt);
    const currentStatus = normalize(delivery.status || "scheduled");
    const targetStatus = normalize(nextStatus || currentStatus);
    const collectionForm = getCollectionForm(delivery);

    const collectionError = validateCollectionForm(delivery, collectionForm, {
      requireAmount: targetStatus === "delivered",
    });

    if (collectionError) {
      setError(collectionError);
      setSuccess("");
      return;
    }

    const fileError = validateReceiptFile(selectedFile);
    if (fileError) {
      setError(fileError);
      setSuccess("");
      return;
    }

    if (requireReceipt && !hasExistingReceipt && !selectedFile) {
      setError("Please upload the proof of delivery first.");
      setSuccess("");
      return;
    }

    if (!allowReceiptOnly && targetStatus === currentStatus && !selectedFile) {
      setSuccess("No changes to save.");
      return;
    }

    setSavingId(delivery.id);
    setError("");
    setSuccess("");

    try {
      const fd = new FormData();
      fd.append("status", targetStatus);
      fd.append("notes", delivery.notes ?? "");

      if (targetStatus === "delivered") {
        fd.append("collected_amount", collectionForm.amount || "");
        fd.append("payment_method", collectionForm.payment_method || "cash");
        fd.append("collection_notes", collectionForm.collection_notes || "");
      }

      if (selectedFile) {
        fd.append("receipt", selectedFile);
      }

      await api.patch(`/pos/deliveries/${delivery.id}/status`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      setReceiptFiles((prev) => ({
        ...prev,
        [delivery.id]: null,
      }));

      if (targetStatus === "delivered") {
        setCollectionForms((prev) => ({
          ...prev,
          [delivery.id]: {
            amount: "",
            payment_method: "cash",
            collection_notes: "",
          },
        }));
      }

      setSuccess(
        successMessage ||
          (selectedFile
            ? "Delivery proof uploaded successfully."
            : "Delivery updated successfully."),
      );

      await loadDeliveries();
    } catch (err) {
      console.error("Delivery update error:", err?.response?.data || err);
      setError(
        err?.response?.data?.message ||
          `Failed to update delivery.${
            err?.response?.status ? ` (HTTP ${err.response.status})` : ""
          }`,
      );
    } finally {
      setSavingId(null);
    }
  };

  const filteredDeliveries = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return deliveries;

    return deliveries.filter((item) =>
      [
        String(item.order_number || ""),
        String(item.customer_name || ""),
        String(item.address || ""),
        String(item.status || ""),
        String(item.driver_name || ""),
      ].some((field) => field.toLowerCase().includes(keyword)),
    );
  }, [deliveries, search]);

  return (
    <div style={pageShell}>
      <div style={heroCard}>
        <div>
          <h2 style={pageTitle}>
            {isDeliveryRider ? "My Deliveries" : "Delivery Management"}
          </h2>
          <p style={pageSubtitle}>
            {isDeliveryRider
              ? "View assigned deliveries, update transit status, and upload proof of delivery."
              : "Monitor assigned deliveries and review delivery proof uploads."}
          </p>
        </div>
      </div>

      <div style={searchCard}>
        <input
          type="text"
          placeholder="Search by order, customer, address, driver, or status"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={searchInput}
        />
      </div>

      {error ? <div style={alertError}>{error}</div> : null}
      {success ? <div style={alertSuccess}>{success}</div> : null}

      {loading ? (
        <div style={emptyCard}>Loading deliveries...</div>
      ) : filteredDeliveries.length === 0 ? (
        <div style={emptyCard}>No deliveries found.</div>
      ) : (
        <div style={cardList}>
          {filteredDeliveries.map((delivery) => {
            const status = normalize(delivery.status || "scheduled");
            const statusMeta = getStatusMeta(status);
            const selectedFile = receiptFiles[delivery.id] || null;
            const hasReceipt = Boolean(delivery.signed_receipt);

            // 👉 NEW: Added isCompleted boolean
            const canStartTransit = status === "scheduled";
            const canCompleteDelivery = status === "in_transit";
            const isDelivered = status === "delivered";
            const isCompleted = status === "completed";
            const isFailed = status === "failed";

            // 👉 NEW: Summary should show for both Delivered AND Completed
            const showSummary = isDelivered || isCompleted;

            const paymentBalance = Number(delivery.payment_balance || 0);
            const collectionForm = getCollectionForm(delivery);

            const hasOutstandingBalance = paymentBalance > 0.009;
            const rawCollectedAmount = String(
              collectionForm.amount ?? "",
            ).trim();
            const parsedCollectedAmount = Number(rawCollectedAmount || 0);

            const hasCollectedAmountValue = rawCollectedAmount !== "";
            const collectedAmountInvalid =
              hasCollectedAmountValue &&
              (!Number.isFinite(parsedCollectedAmount) ||
                parsedCollectedAmount <= 0);

            const collectedAmountExceedsBalance =
              hasCollectedAmountValue &&
              parsedCollectedAmount > paymentBalance + 0.01;

            const completeDeliveryDisabled =
              savingId === delivery.id ||
              (!hasReceipt && !selectedFile) ||
              (canCompleteDelivery &&
                hasOutstandingBalance &&
                (!hasCollectedAmountValue ||
                  collectedAmountInvalid ||
                  collectedAmountExceedsBalance));

            const canUploadProof =
              !canCompleteDelivery ||
              !hasOutstandingBalance ||
              (hasCollectedAmountValue &&
                !collectedAmountInvalid &&
                !collectedAmountExceedsBalance);

            return (
              <div
                key={delivery.id}
                style={{
                  ...deliveryCard,
                  borderColor: statusMeta.border,
                  background: "#ffffff",
                }}
              >
                <div style={deliveryHeader}>
                  <div>
                    <div style={deliveryOrderNo}>
                      {delivery.order_number || "—"}
                    </div>
                    <div style={deliveryCustomer}>
                      {delivery.customer_name || "Walk-in Customer"}
                    </div>
                  </div>

                  <span
                    style={{
                      background: statusMeta.bg,
                      color: statusMeta.text,
                      border: `1px solid ${statusMeta.border}`,
                      padding: "4px 10px",
                      borderRadius: 999,
                      fontSize: 11,
                      fontWeight: 700,
                      alignSelf: "flex-start",
                      textTransform: "uppercase",
                      letterSpacing: "1px",
                    }}
                  >
                    {formatStatus(delivery.status)}
                  </span>
                </div>

                <div style={detailsGrid}>
                  <InfoCard
                    label="Address"
                    value={
                      <>
                        {delivery.address || "—"}
                        {Number.isFinite(Number(delivery.delivery_lat)) &&
                          Number.isFinite(Number(delivery.delivery_lng)) && (
                            <a
                              href={`https://www.google.com/maps/search/?api=1&query=${delivery.delivery_lat},${delivery.delivery_lng}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{
                                display: "block",
                                marginTop: 4,
                                fontSize: 11,
                                fontWeight: 700,
                                color: "#2563eb",
                              }}
                            >
                              Open in Google Maps ↗
                            </a>
                          )}
                      </>
                    }
                  />
                  <InfoCard
                    label="Scheduled"
                    value={formatDateTime(delivery.scheduled_date)}
                  />
                  <InfoCard
                    label="Driver"
                    value={delivery.driver_name || "Unassigned"}
                  />
                  <InfoCard
                    label="Proof Status"
                    value={hasReceipt ? "Uploaded" : "Awaiting upload"}
                    tone={hasReceipt ? "#18181b" : "#71717a"}
                  />
                  <InfoCard
                    label="Remaining Balance"
                    value={`₱ ${paymentBalance.toLocaleString("en-PH", {
                      minimumFractionDigits: 2,
                    })}`}
                    tone={paymentBalance > 0 ? "#dc2626" : "#18181b"}
                  />
                </div>

                {delivery.notes ? (
                  <div style={notesBox}>
                    <div style={notesLabel}>Notes</div>
                    <div style={notesText}>{delivery.notes}</div>
                  </div>
                ) : null}

                {canStartTransit && (
                  <div style={actionSection}>
                    <div style={sectionTitle}>Next Action</div>
                    <div style={helperText}>
                      Start the trip once the furniture is loaded and ready to
                      leave the shop.
                    </div>

                    <div style={buttonRow}>
                      <button
                        onClick={() =>
                          saveDeliveryUpdate({
                            delivery,
                            nextStatus: "in_transit",
                            successMessage:
                              "Delivery marked as in transit successfully.",
                          })
                        }
                        disabled={savingId === delivery.id}
                        style={btnPrimary}
                      >
                        {savingId === delivery.id
                          ? "Saving..."
                          : "Start Transit"}
                      </button>
                    </div>
                  </div>
                )}

                {canCompleteDelivery && (
                  <div style={actionSection}>
                    {hasOutstandingBalance && (
                      <div style={{ marginBottom: "16px" }}>
                        <div style={sectionTitle}>
                          Remaining Balance Collection
                        </div>
                        <div style={helperText}>
                          Record the amount collected from the customer during
                          delivery. Admin will verify this payment before the
                          order can be completed.
                        </div>

                        <div
                          style={{
                            marginTop: "12px",
                            display: "grid",
                            gridTemplateColumns:
                              "repeat(auto-fit, minmax(180px, 1fr))",
                            gap: "12px",
                          }}
                        >
                          <div>
                            <label style={infoLabel}>Collected Amount</label>
                            <input
                              type="number"
                              min="0"
                              max={paymentBalance.toFixed(2)}
                              step="0.01"
                              value={collectionForm.amount}
                              onChange={(e) =>
                                updateCollectionForm(
                                  delivery.id,
                                  "amount",
                                  e.target.value,
                                )
                              }
                              style={searchInput}
                              placeholder={`Max ${paymentBalance.toFixed(2)}`}
                            />
                            {(!hasCollectedAmountValue ||
                              collectedAmountInvalid ||
                              collectedAmountExceedsBalance) && (
                              <div
                                style={{
                                  marginTop: 6,
                                  fontSize: "12px",
                                  color: "#b91c1c",
                                  fontWeight: 600,
                                }}
                              >
                                {!hasCollectedAmountValue
                                  ? "Collected amount is required before completing delivery."
                                  : collectedAmountInvalid
                                    ? "Collected amount must be greater than zero."
                                    : `Collected amount cannot exceed ₱${paymentBalance.toLocaleString(
                                        "en-PH",
                                        { minimumFractionDigits: 2 },
                                      )}.`}
                              </div>
                            )}
                          </div>

                          <div>
                            <label style={infoLabel}>Payment Method</label>
                            <input
                              type="text"
                              value="Cash"
                              readOnly
                              style={{
                                ...searchInput,
                                background: "#fafafa",
                                color: "#18181b",
                                fontWeight: 700,
                                cursor: "not-allowed",
                              }}
                            />
                          </div>

                          <div style={{ gridColumn: "1 / -1" }}>
                            <label style={infoLabel}>Collection Note</label>
                            <textarea
                              rows={2}
                              value={collectionForm.collection_notes}
                              onChange={(e) =>
                                updateCollectionForm(
                                  delivery.id,
                                  "collection_notes",
                                  e.target.value,
                                )
                              }
                              style={{
                                ...searchInput,
                                minHeight: 88,
                                resize: "vertical",
                                fontFamily: "inherit",
                              }}
                              placeholder="Example: Full remaining balance collected during turnover."
                            />
                          </div>
                        </div>
                      </div>
                    )}

                    <div style={sectionTitle}>Proof of Delivery</div>
                    <div style={helperText}>
                      Upload the signed receipt or customer handoff photo first,
                      then complete the delivery.
                    </div>

                    <div style={proofPanel}>
                      <div style={proofStatusRow}>
                        <span style={proofStatusLabel}>
                          {hasReceipt
                            ? "Proof already uploaded. Choose another file to replace it."
                            : "No proof uploaded yet"}
                        </span>

                        {hasReceipt && delivery.signed_receipt ? (
                          <a
                            href={buildAssetUrl(delivery.signed_receipt)}
                            target="_blank"
                            rel="noreferrer"
                            style={viewLink}
                          >
                            View Current Proof
                          </a>
                        ) : null}
                      </div>

                      <input
                        type="file"
                        accept="image/*,.pdf"
                        disabled={savingId === delivery.id || !canUploadProof}
                        onChange={(e) =>
                          handleReceiptChange(
                            delivery.id,
                            e.target.files?.[0] || null,
                          )
                        }
                        style={{
                          ...fileInput,
                          opacity:
                            savingId === delivery.id || !canUploadProof
                              ? 0.6
                              : 1,
                          cursor:
                            savingId === delivery.id || !canUploadProof
                              ? "not-allowed"
                              : "pointer",
                        }}
                      />

                      {!canUploadProof && (
                        <div
                          style={{
                            marginTop: "8px",
                            fontSize: "12px",
                            color: "#b91c1c",
                            fontWeight: 600,
                          }}
                        >
                          Enter a valid collected amount first before uploading
                          proof of delivery.
                        </div>
                      )}

                      {selectedFile ? (
                        <div style={selectedFileText}>
                          {hasReceipt
                            ? "Selected replacement file: "
                            : "Selected file: "}
                          {selectedFile.name}
                        </div>
                      ) : null}
                    </div>

                    <div style={buttonRow}>
                      <button
                        onClick={() =>
                          saveDeliveryUpdate({
                            delivery,
                            nextStatus: "delivered",
                            requireReceipt: true,
                            successMessage:
                              "Delivery completed successfully with proof of delivery.",
                          })
                        }
                        disabled={completeDeliveryDisabled}
                        style={
                          completeDeliveryDisabled ? btnDisabled : btnPrimary
                        }
                      >
                        {savingId === delivery.id
                          ? "Saving..."
                          : "Complete Delivery"}
                      </button>
                    </div>
                  </div>
                )}

                {/* 👉 NEW: showSummary covers both Delivered and Completed statuses */}
                {showSummary && (
                  <div style={actionSection}>
                    <div style={sectionTitle}>Delivery Summary</div>
                    <div style={helperText}>
                      {isCompleted
                        ? "This order has been officially verified and completed by the admin."
                        : "This delivery has been dropped off. Waiting for admin verification."}
                    </div>

                    <div style={summaryRow}>
                      <div style={summaryItem}>
                        <span style={summaryLabel}>Delivered On</span>
                        <span style={summaryValue}>
                          {formatDateTime(delivery.delivered_date)}
                        </span>
                      </div>

                      <div style={summaryItem}>
                        <span style={summaryLabel}>Proof</span>
                        <span style={summaryValue}>
                          {hasReceipt ? "Uploaded" : "Not uploaded"}
                        </span>
                      </div>
                    </div>

                    <div style={{ marginTop: 12 }}>
                      {hasReceipt && delivery.signed_receipt ? (
                        <a
                          href={buildAssetUrl(delivery.signed_receipt)}
                          target="_blank"
                          rel="noreferrer"
                          style={viewLink}
                        >
                          View Uploaded Proof
                        </a>
                      ) : (
                        <div style={helperText}>
                          This older record has no uploaded proof yet.
                        </div>
                      )}

                      {/* 👉 NEW: The entire upload and Undo section is strictly hidden if Completed */}
                      {isDelivered && (
                        <>
                          <div style={{ ...proofPanel, marginTop: 12 }}>
                            <div style={proofStatusRow}>
                              <span style={proofStatusLabel}>
                                {hasReceipt
                                  ? "Need to replace the uploaded proof?"
                                  : "Upload proof for this delivered record"}
                              </span>
                            </div>

                            <input
                              type="file"
                              accept="image/*,.pdf"
                              disabled={savingId === delivery.id}
                              onChange={(e) =>
                                handleReceiptChange(
                                  delivery.id,
                                  e.target.files?.[0] || null,
                                )
                              }
                              style={{
                                ...fileInput,
                                opacity: savingId === delivery.id ? 0.6 : 1,
                                cursor:
                                  savingId === delivery.id
                                    ? "not-allowed"
                                    : "pointer",
                              }}
                            />

                            {selectedFile ? (
                              <div style={selectedFileText}>
                                Selected file: {selectedFile.name}
                              </div>
                            ) : null}

                            <div style={buttonRow}>
                              <button
                                onClick={() =>
                                  saveDeliveryUpdate({
                                    delivery,
                                    nextStatus: "delivered",
                                    allowReceiptOnly: true,
                                    successMessage: hasReceipt
                                      ? "Proof of delivery replaced successfully."
                                      : "Proof of delivery uploaded successfully.",
                                  })
                                }
                                disabled={
                                  savingId === delivery.id || !selectedFile
                                }
                                style={
                                  savingId === delivery.id || !selectedFile
                                    ? btnDisabled
                                    : btnSecondary
                                }
                              >
                                {savingId === delivery.id
                                  ? "Saving..."
                                  : hasReceipt
                                    ? "Replace Proof"
                                    : "Upload Proof"}
                              </button>
                            </div>
                          </div>

                          <div
                            style={{
                              marginTop: "24px",
                              paddingTop: "16px",
                              borderTop: "1px dashed #e4e4e7",
                            }}
                          >
                            <div style={sectionTitle}>Need Corrections?</div>
                            <div style={helperText}>
                              If you accidentally marked this as delivered, you
                              can undo it to correct the collection amount or
                              proof of delivery.
                            </div>
                            <div style={buttonRow}>
                              <button
                                onClick={() => {
                                  if (
                                    window.confirm(
                                      "Are you sure you want to undo this delivery? It will be moved back to 'In Transit'.",
                                    )
                                  ) {
                                    saveDeliveryUpdate({
                                      delivery,
                                      nextStatus: "in_transit",
                                      successMessage:
                                        "Delivery reverted to In Transit successfully.",
                                    });
                                  }
                                }}
                                disabled={savingId === delivery.id}
                                style={
                                  savingId === delivery.id
                                    ? btnDisabled
                                    : btnUndo
                                }
                              >
                                {savingId === delivery.id
                                  ? "Undoing..."
                                  : "Undo Delivery"}
                              </button>
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                )}

                {isFailed && (
                  <div style={actionSection}>
                    <div style={sectionTitle}>Delivery Failed</div>
                    <div style={helperText}>
                      This delivery was marked as failed. Contact the admin for
                      reassignment or rescheduling.
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function InfoCard({ label, value, tone }) {
  return (
    <div style={infoCard}>
      <div style={infoLabel}>{label}</div>
      <div style={{ ...infoValue, color: tone || "#18181b" }}>{value}</div>
    </div>
  );
}

const pageShell = {
  padding: "24px",
  display: "flex",
  flexDirection: "column",
  gap: "16px",
  fontFamily: "'Inter', sans-serif",
};

const heroCard = {
  background: "#ffffff",
  border: "1px solid #e4e4e7",
  borderRadius: "16px",
  padding: "18px 20px",
  boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
};

const pageTitle = {
  margin: 0,
  fontSize: "24px",
  fontWeight: 800,
  color: "#0a0a0a",
  letterSpacing: "-0.02em",
};

const pageSubtitle = {
  margin: "8px 0 0",
  color: "#52525b",
  fontSize: "13px",
  lineHeight: 1.6,
};

const searchCard = {
  background: "#ffffff",
  border: "1px solid #e4e4e7",
  borderRadius: "14px",
  padding: "14px",
  boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
};

const searchInput = {
  width: "100%",
  padding: "12px 14px",
  borderRadius: "8px",
  border: "1px solid #e4e4e7",
  outline: "none",
  fontSize: "13px",
  color: "#18181b",
  boxSizing: "border-box",
};

const alertError = {
  padding: "12px 14px",
  borderRadius: "12px",
  background: "#fef2f2",
  border: "1px solid #fecaca",
  color: "#991b1b",
  fontSize: "13px",
  fontWeight: 600,
};

const alertSuccess = {
  padding: "12px 14px",
  borderRadius: "12px",
  background: "#fafafa",
  border: "1px solid #e4e4e7",
  color: "#18181b",
  fontSize: "13px",
  fontWeight: 600,
};

const emptyCard = {
  background: "#ffffff",
  border: "1px solid #e4e4e7",
  borderRadius: "16px",
  padding: "40px",
  color: "#71717a",
  fontSize: "13px",
  fontWeight: 600,
  textAlign: "center",
};

const cardList = {
  display: "grid",
  gap: "16px",
};

const deliveryCard = {
  background: "#ffffff",
  border: "1px solid #e4e4e7",
  borderRadius: "16px",
  padding: "24px",
  boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
};

const deliveryHeader = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: "12px",
  marginBottom: "16px",
  flexWrap: "wrap",
};

const deliveryOrderNo = {
  fontSize: "18px",
  fontWeight: 800,
  color: "#0a0a0a",
  marginBottom: "4px",
  letterSpacing: "-0.01em",
};

const deliveryCustomer = {
  fontSize: "14px",
  color: "#52525b",
  fontWeight: 600,
};

const detailsGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: "12px",
};

const infoCard = {
  border: "1px solid #e4e4e7",
  borderRadius: "12px",
  padding: "14px",
  background: "#fafafa",
};

const infoLabel = {
  fontSize: "10px",
  fontWeight: 800,
  color: "#71717a",
  textTransform: "uppercase",
  letterSpacing: "1px",
  marginBottom: "6px",
};

const infoValue = {
  fontSize: "14px",
  fontWeight: 700,
  color: "#18181b",
  lineHeight: 1.5,
  wordBreak: "break-word",
};

const notesBox = {
  marginTop: "16px",
  padding: "16px",
  border: "1px solid #e4e4e7",
  borderRadius: "12px",
  background: "#fafafa",
};

const notesLabel = {
  fontSize: "10px",
  fontWeight: 800,
  color: "#71717a",
  textTransform: "uppercase",
  letterSpacing: "1px",
  marginBottom: "8px",
};

const notesText = {
  fontSize: "13px",
  color: "#18181b",
  lineHeight: 1.6,
};

const actionSection = {
  marginTop: "20px",
  paddingTop: "20px",
  borderTop: "1px solid #e4e4e7",
};

const sectionTitle = {
  fontSize: "15px",
  fontWeight: 800,
  color: "#0a0a0a",
  marginBottom: "6px",
  letterSpacing: "-0.01em",
};

const helperText = {
  fontSize: "13px",
  color: "#52525b",
  lineHeight: 1.6,
};

const proofPanel = {
  marginTop: "16px",
  padding: "16px",
  border: "1px dashed #d4d4d8",
  borderRadius: "12px",
  background: "#fafafa",
};

const proofStatusRow = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "12px",
  flexWrap: "wrap",
  marginBottom: "12px",
};

const proofStatusLabel = {
  fontSize: "13px",
  fontWeight: 700,
  color: "#18181b",
};

const fileInput = {
  fontSize: "13px",
  marginBottom: "8px",
  color: "#52525b",
};

const selectedFileText = {
  fontSize: "12px",
  color: "#71717a",
  fontWeight: 600,
};

const buttonRow = {
  display: "flex",
  gap: "10px",
  flexWrap: "wrap",
  marginTop: "16px",
};

const btnPrimary = {
  padding: "10px 20px",
  borderRadius: "8px",
  border: "1px solid #18181b",
  background: "#18181b",
  color: "#ffffff",
  cursor: "pointer",
  fontSize: "13px",
  fontWeight: 700,
  transition: "background 0.2s",
};

const btnSecondary = {
  padding: "10px 20px",
  borderRadius: "8px",
  border: "1px solid #e4e4e7",
  background: "#f4f4f5",
  color: "#18181b",
  cursor: "pointer",
  fontSize: "13px",
  fontWeight: 700,
  transition: "background 0.2s",
};

const btnUndo = {
  padding: "10px 20px",
  borderRadius: "8px",
  border: "1px solid #fecaca",
  background: "#fef2f2",
  color: "#991b1b",
  cursor: "pointer",
  fontSize: "13px",
  fontWeight: 700,
  transition: "background 0.2s",
};

const btnDisabled = {
  padding: "10px 20px",
  borderRadius: "8px",
  border: "none",
  background: "#e4e4e7",
  color: "#a1a1aa",
  cursor: "not-allowed",
  fontSize: "13px",
  fontWeight: 700,
};

const summaryRow = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: "12px",
  marginTop: "16px",
};

const summaryItem = {
  border: "1px solid #e4e4e7",
  borderRadius: "12px",
  padding: "16px",
  background: "#fafafa",
};

const summaryLabel = {
  display: "block",
  fontSize: "10px",
  fontWeight: 800,
  color: "#71717a",
  textTransform: "uppercase",
  letterSpacing: "1px",
  marginBottom: "6px",
};

const summaryValue = {
  display: "block",
  fontSize: "14px",
  fontWeight: 700,
  color: "#18181b",
};

const viewLink = {
  display: "inline-flex",
  alignItems: "center",
  padding: "8px 14px",
  borderRadius: "8px",
  background: "#f4f4f5",
  color: "#18181b",
  border: "1px solid #e4e4e7",
  textDecoration: "none",
  fontSize: "12px",
  fontWeight: 700,
  transition: "background 0.2s",
};