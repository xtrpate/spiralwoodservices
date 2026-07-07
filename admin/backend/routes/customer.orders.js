// routes/customer.orders.js
const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const fs = require("fs");

// Your existing auth middlewares
const { authenticate, requireCustomer } = require("../middleware/auth");
const orderController = require("../controllers/customer/customer.orders");

// 👉 ADDED: We must import the new cart controller so the routes can use it!
const cartController = require("../controllers/customer/customer.cart");

/* ── Multer — proof of payment upload ── */
const uploadDir = path.join(__dirname, "../uploads/proofs");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const name = `proof_${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`;
    cb(null, name);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|gif|pdf/;
    cb(null, allowed.test(file.mimetype));
  },
});

/* ══════════════════════════════════════════════════════════════
   CUSTOMER ORDERS ROUTES
══════════════════════════════════════════════════════════════ */

// NOTE: /settings and /verify-payment must come before /:id
router.get(
  "/settings",
  authenticate,
  requireCustomer,
  orderController.getSettings,
);

// Route to catch the PayMongo Redirect Success
router.post(
  "/verify-payment",
  authenticate,
  requireCustomer,
  orderController.verifyPayment,
);

router.post(
  "/",
  authenticate,
  requireCustomer,
  upload.single("proof"),
  orderController.createOrder,
);

router.get("/", authenticate, requireCustomer, orderController.getOrders);
router.get("/:id", authenticate, requireCustomer, orderController.getOrderById);
router.put(
  "/:id/confirm",
  authenticate,
  requireCustomer,
  orderController.confirmOrder,
);
router.put(
  "/:id/cancel",
  authenticate,
  requireCustomer,
  orderController.cancelOrder,
);

module.exports = router;
