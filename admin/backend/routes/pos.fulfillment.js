const express = require("express");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const { verifyFileSignature } = require("../utils/verifyFileSignature");
const router = express.Router();

const {
  authenticate,
  authorize,
  requireDeliveryRiderOrAdmin,
} = require("../middleware/auth");

const posFulfillmentController = require("../controllers/staff/pos.fulfillment");

const adminOnly = [authenticate, authorize("admin")];
const deliveryAccess = [authenticate, requireDeliveryRiderOrAdmin];

const receiptUploadDir = path.join(
  __dirname,
  "..",
  "uploads",
  "delivery-receipts",
);

fs.mkdirSync(receiptUploadDir, { recursive: true });

const receiptStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, receiptUploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase() || ".bin";
    cb(null, `delivery-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
  },
});

const ALLOWED_RECEIPT_EXT = [".jpg", ".jpeg", ".jfif", ".png", ".webp", ".pdf"];

const receiptUpload = multer({
  storage: receiptStorage,
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase();
    if (ALLOWED_RECEIPT_EXT.includes(ext)) {
      cb(null, true);
      return;
    }
    cb(
      new Error(
        "Only image or PDF files are allowed for signed receipt upload.",
      ),
    );
  },
});

const handleReceiptUpload = (req, res, next) => {
  receiptUpload.single("receipt")(req, res, (err) => {
    if (err) {
      return res.status(400).json({
        message: err.message || "Invalid receipt upload.",
      });
    }

    if (req.file) {
      const ext = path.extname(req.file.originalname || "").toLowerCase();
      if (!verifyFileSignature(req.file.path, ext)) {
        fs.unlink(req.file.path, () => {});
        return res.status(400).json({
          message: "Receipt content does not match its file extension. Upload rejected.",
        });
      }
    }

    next();
  });
};

/* ══════════════════════════════════════════════════════════════
   DELIVERIES ONLY
══════════════════════════════════════════════════════════════ */

router.get(
  "/deliveries/dashboard",
  deliveryAccess,
  posFulfillmentController.getRiderDashboard,
);
router.get(
  "/deliveries/history",
  deliveryAccess,
  posFulfillmentController.getRiderHistory,
);

router.get(
  "/deliverable-orders",
  adminOnly,
  posFulfillmentController.getDeliverableOrders,
);

router.get(
  "/deliveries",
  deliveryAccess,
  posFulfillmentController.getDeliveries,
);

router.post("/deliveries", adminOnly, posFulfillmentController.createDelivery);

router.patch(
  "/deliveries/:id/status",
  deliveryAccess,
  handleReceiptUpload,
  posFulfillmentController.updateDeliveryStatus,
);

module.exports = router;
