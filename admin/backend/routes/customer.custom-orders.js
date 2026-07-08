const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { verifyFileSignature } = require("../utils/verifyFileSignature");

const { authenticate, requireCustomer } = require("../middleware/auth");
const customOrderController = require("../controllers/customer/customer.customorders");

/* ──────────────────────────────────────────────────────────
   Upload dirs
────────────────────────────────────────────────────────── */
const proofsDir = path.join(__dirname, "../uploads/proofs");
const customAssetsDir = path.join(__dirname, "../uploads/custom-request-assets");

if (!fs.existsSync(proofsDir)) fs.mkdirSync(proofsDir, { recursive: true });
if (!fs.existsSync(customAssetsDir)) fs.mkdirSync(customAssetsDir, { recursive: true });

const ALLOWED_ASSET_EXT = [".jpg", ".jpeg", ".jfif", ".png", ".webp", ".pdf"];

function fileFilter(req, file, cb) {
  const ext = path.extname(file.originalname || "").toLowerCase();
  if (ALLOWED_ASSET_EXT.includes(ext)) {
    cb(null, true);
    return;
  }
  const err = new Error("Only JPG, PNG, JFIF, WEBP, and PDF files are allowed.");
  err.status = 400;
  cb(err);
}

/* ──────────────────────────────────────────────────────────
   Down payment proof upload
────────────────────────────────────────────────────────── */
const proofStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, proofsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const name = `proof_${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`;
    cb(null, name);
  },
});

const proofUploadRaw = multer({
  storage: proofStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter,
});

const proofUpload = (req, res, next) => {
  proofUploadRaw.single("proof")(req, res, (err) => {
    if (err) return next(err);
    if (req.file) {
      const ext = path.extname(req.file.originalname || "").toLowerCase();
      if (!verifyFileSignature(req.file.path, ext)) {
        fs.unlink(req.file.path, () => {});
        return res.status(400).json({
          message: "Proof content does not match its file extension. Upload rejected.",
        });
      }
    }
    next();
  });
};

/* ──────────────────────────────────────────────────────────
   Chat attachment upload
────────────────────────────────────────────────────────── */
const assetStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, customAssetsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || "");
    const safeOriginal = String(file.originalname || "file")
      .replace(/\s+/g, "_")
      .replace(/[^a-zA-Z0-9._-]/g, "");
    cb(
      null,
      `custom_asset_${Date.now()}_${Math.random().toString(36).slice(2)}_${safeOriginal || "file"}${ext && !safeOriginal.endsWith(ext) ? "" : ""}`,
    );
  },
});

const assetUploadRaw = multer({
  storage: assetStorage,
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter,
});

const assetUpload = (req, res, next) => {
  assetUploadRaw.array("attachments", 5)(req, res, (err) => {
    if (err) return next(err);
    for (const file of req.files || []) {
      const ext = path.extname(file.originalname || "").toLowerCase();
      if (!verifyFileSignature(file.path, ext)) {
        fs.unlink(file.path, () => {});
        return res.status(400).json({
          message: "One of the attachments does not match its file extension. Upload rejected.",
        });
      }
    }
    next();
  });
};

/* ══════════════════════════════════════════════════════════════
   CUSTOMER CUSTOM ORDERS ROUTES
══════════════════════════════════════════════════════════════ */

router.post(
  "/",
  authenticate,
  requireCustomer,
  customOrderController.createCustomOrder,
);

router.get(
  "/",
  authenticate,
  requireCustomer,
  customOrderController.getCustomOrders,
);

router.get(
  "/:id",
  authenticate,
  requireCustomer,
  customOrderController.getCustomOrderById,
);

router.post(
  "/:id/estimate/accept",
  authenticate,
  requireCustomer,
  customOrderController.acceptEstimation,
);

router.post(
  "/:id/estimate/request-revision",
  authenticate,
  requireCustomer,
  customOrderController.requestEstimationRevision,
);

router.post(
  "/:id/estimate/reject",
  authenticate,
  requireCustomer,
  customOrderController.rejectEstimation,
);

router.post(
  "/:id/down-payment",
  authenticate,
  requireCustomer,
  proofUpload,
  customOrderController.submitDownPayment,
);

router.post(
  "/:id/messages",
  authenticate,
  requireCustomer,
  assetUpload,
  customOrderController.postCustomOrderMessage,
);

module.exports = router;