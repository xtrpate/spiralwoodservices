const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { authenticate, requireCustomer } = require("../middleware/auth");
const warrantyController = require("../controllers/customer/customer.warranty");
const { verifyFileSignature } = require("../utils/verifyFileSignature");

/* ── Multer storage ── */
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, "../uploads/warranty");
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const name = `warranty_${Date.now()}_${Math.random()
      .toString(36)
      .slice(2)}${ext}`;
    cb(null, name);
  },
});

const ALLOWED_WARRANTY_EXT = [".jpg", ".jpeg", ".jfif", ".png", ".webp", ".pdf"];

const rawUpload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase();
    if (ALLOWED_WARRANTY_EXT.includes(ext)) {
      cb(null, true);
      return;
    }
    const err = new Error("Only images (JPEG/PNG/WEBP/JFIF) and PDF allowed.");
    err.status = 400;
    cb(err);
  },
});

const upload = (req, res, next) => {
  rawUpload.fields([
    { name: "photo", maxCount: 1 },
    { name: "proof", maxCount: 1 },
  ])(req, res, (err) => {
    if (err) return next(err);

    const files = req.files ? Object.values(req.files).flat() : [];
    for (const file of files) {
      const ext = path.extname(file.originalname || "").toLowerCase();
      if (!verifyFileSignature(file.path, ext)) {
        fs.unlink(file.path, () => {});
        return res.status(400).json({
          message: "One of your uploaded files does not match its file extension. Upload rejected.",
        });
      }
    }
    next();
  });
};

/* ══════════════════════════════════════════════════════════════
   CUSTOMER WARRANTY ROUTES
══════════════════════════════════════════════════════════════ */

router.get(
  "/orders",
  authenticate,
  requireCustomer,
  warrantyController.getEligibleOrders,
);

router.get("/", authenticate, requireCustomer, warrantyController.getClaims);

router.post(
  "/",
  authenticate,
  requireCustomer,
  upload,
  warrantyController.submitClaim,
);

module.exports = router;