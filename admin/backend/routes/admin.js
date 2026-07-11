// routes/admin.js – Centralized router for all Admin API routes
const express = require("express");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const { verifyFileSignature } = require("../utils/verifyFileSignature");
const router = express.Router();

const { authenticate, authorize } = require("../middleware/auth");
const { logAction } = require("../middleware/auditLog");
const upload = require("../config/upload");

// ── Controllers ────────────────────────────────────────────────────────────────
const auth = require("../controllers/admin/authController");
const dashboard = require("../controllers/admin/dashboardController");
const products = require("../controllers/admin/productController");
const inventory = require("../controllers/admin/inventoryController");
const blueprints = require("../controllers/admin/blueprintController");
const orders = require("../controllers/admin/orderController");
const sales = require("../controllers/admin/salesController");
const mgmt = require("../controllers/admin/managementController");
const website = require("../controllers/admin/websiteController");
const warrantyController = require("../controllers/admin/warrantyController");

// ── Auth guards ───────────────────────────────────────────────────────────────
const adminOnly = [authenticate, authorize("admin")];
const adminStaff = [authenticate, authorize("admin", "staff")];

// ── Warranty replacement upload config ────────────────────────────────────────
const replacementDir = path.join(__dirname, "../uploads/warranty-replacements");

if (!fs.existsSync(replacementDir)) {
  fs.mkdirSync(replacementDir, { recursive: true });
}

const replacementStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, replacementDir),
  filename: (req, file, cb) => {
    const safeOriginal = String(file.originalname || "file")
      .replace(/\s+/g, "_")
      .replace(/[^a-zA-Z0-9._-]/g, "");
    cb(null, `replacement_${Date.now()}_${safeOriginal}`);
  },
});

const allowedReplacementMimeTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
]);

const replacementUploadRaw = multer({
  storage: replacementStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (allowedReplacementMimeTypes.has(file.mimetype)) {
      return cb(null, true);
    }
    const err = new Error("Only JPG, PNG, WEBP, and PDF files are allowed.");
    err.status = 400;
    cb(err);
  },
});

const replacementUpload = (req, res, next) => {
  replacementUploadRaw.single("replacement_receipt")(req, res, (err) => {
    if (err) return next(err);
    if (req.file) {
      const ext = path.extname(req.file.originalname || "").toLowerCase();
      if (!verifyFileSignature(req.file.path, ext)) {
        fs.unlink(req.file.path, () => {});
        return res.status(400).json({
          message: "Replacement receipt content does not match its file extension.",
        });
      }
    }
    next();
  });
};



const customDiscussionDir = path.join(
  __dirname,
  "../uploads/custom-request-assets",
);

if (!fs.existsSync(customDiscussionDir)) {
  fs.mkdirSync(customDiscussionDir, { recursive: true });
}

const customDiscussionStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, customDiscussionDir),
  filename: (req, file, cb) => {
    const safeOriginal = String(file.originalname || "file")
      .replace(/\s+/g, "_")
      .replace(/[^a-zA-Z0-9._-]/g, "");
    cb(null, `discussion_${Date.now()}_${safeOriginal}`);
  },
});

const allowedDiscussionMimeTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
]);

const customDiscussionUploadRaw = multer({
  storage: customDiscussionStorage,
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (allowedDiscussionMimeTypes.has(file.mimetype)) {
      return cb(null, true);
    }
    const err = new Error("Only JPG, PNG, WEBP, and PDF files are allowed.");
    err.status = 400;
    cb(err);
  },
});



const customDiscussionUpload = (req, res, next) => {
  customDiscussionUploadRaw.array("attachments", 5)(req, res, (err) => {
    if (err) return next(err);
    for (const file of req.files || []) {
      const ext = path.extname(file.originalname || "").toLowerCase();
      if (!verifyFileSignature(file.path, ext)) {
        fs.unlink(file.path, () => {});
        return res.status(400).json({
          message: "One of the attachments does not match its file extension.",
        });
      }
    }
    next();
  });
};

// ══════════════════════════════════════════════════════════════════════════════
// AUTH
// ══════════════════════════════════════════════════════════════════════════════
const { loginLimiter } = require("../middleware/authRateLimit");
// ...
router.post("/auth/login", loginLimiter, auth.login);
router.get("/auth/me", authenticate, auth.getMe);
router.put("/auth/profile", authenticate, auth.updateProfile);
router.put("/auth/change-password", authenticate, auth.changePassword);

// ══════════════════════════════════════════════════════════════════════════════
// DASHBOARD
// ══════════════════════════════════════════════════════════════════════════════
router.get("/dashboard", adminStaff, dashboard.getDashboard);

// ══════════════════════════════════════════════════════════════════════════════
// PRODUCTS
// ══════════════════════════════════════════════════════════════════════════════
router.get("/products/report", adminStaff, products.getReport);
router.get("/products", adminStaff, products.getAll);
router.patch("/products/bulk-publish", adminOnly, products.bulkPublish);
router.get("/products/:id", adminStaff, products.getOne);
router.post(
  "/products",
  adminOnly,
  upload.uploadProductImage,
  logAction("create_product", "products"),
  products.create,
);
router.put(
  "/products/:id",
  adminOnly,
  upload.uploadProductImage,
  logAction("update_product", "products"),
  products.update,
);
router.delete(
  "/products/:id",
  adminOnly,
  logAction("delete_product", "products"),
  products.remove,
);
router.patch("/products/:id/publish", adminOnly, products.togglePublish);
router.patch("/products/:id/featured", adminOnly, products.toggleFeatured);
router.patch(
  "/products/blueprint/:blueprint_id/unpublish",
  adminOnly,
  products.unpublishByBlueprint,
);

// ══════════════════════════════════════════════════════════════════════════════
// INVENTORY – RAW MATERIALS
// ══════════════════════════════════════════════════════════════════════════════
router.get("/inventory/raw", adminStaff, inventory.getRawMaterials);
router.post(
  "/inventory/raw",
  adminOnly,
  logAction("create_raw_material", "raw_materials"),
  inventory.createRawMaterial,
);
router.put(
  "/inventory/raw/:id",
  adminOnly,
  logAction("update_raw_material", "raw_materials"),
  inventory.updateRawMaterial,
);
router.delete(
  "/inventory/raw/:id",
  adminOnly,
  logAction("delete_raw_material", "raw_materials"),
  inventory.deleteRawMaterial,
);

// SUPPLIERS
router.get("/suppliers", adminStaff, inventory.getSuppliers);
router.post(
  "/suppliers",
  adminOnly,
  logAction("create_supplier", "suppliers"),
  inventory.createSupplier,
);
router.put(
  "/suppliers/:id",
  adminOnly,
  logAction("update_supplier", "suppliers"),
  inventory.updateSupplier,
);
router.delete(
  "/suppliers/:id",
  adminOnly,
  logAction("delete_supplier", "suppliers"),
  inventory.deleteSupplier,
);

// STOCK MOVEMENTS
router.get("/inventory/movements", adminStaff, inventory.getStockMovements);
router.post(
  "/inventory/movements",
  adminStaff,
  logAction("create_stock_movement", "stock_movements"),
  inventory.createStockMovement,
);

// ══════════════════════════════════════════════════════════════════════════════
// BLUEPRINTS
// ══════════════════════════════════════════════════════════════════════════════
router.get("/blueprints", adminStaff, blueprints.getAll);
router.get("/blueprints/:id", adminStaff, blueprints.getOne);
router.post(
  "/blueprints",
  adminStaff,
  upload.uploadBlueprintFile,
  blueprints.create,
);
router.put(
  "/blueprints/:id",
  adminStaff,
  upload.uploadBlueprintFile,
  blueprints.update,
);
router.delete("/blueprints/:id", adminStaff, blueprints.archive);
router.patch("/blueprints/:id/restore", adminStaff, blueprints.restore);
router.delete(
  "/blueprints/:id/permanent",
  adminStaff,
  blueprints.permanentDelete,
);
router.get("/blueprints/:id/estimation", adminStaff, blueprints.getEstimation);
router.post(
  "/blueprints/:id/estimation",
  adminStaff,
  blueprints.saveEstimation,
);
router.patch(
  "/blueprints/:id/estimation/approve",
  adminStaff,
  blueprints.approveEstimation,
);

// ══════════════════════════════════════════════════════════════════════════════
// ORDERS
// ══════════════════════════════════════════════════════════════════════════════
router.get("/orders/cancellations", adminOnly, orders.getCancellations);

router.get(
  "/orders/:id/assignable-staff",
  adminStaff,
  orders.getAssignableStaff,
);
router.patch("/orders/:id/assign-staff", adminOnly, orders.assignStaff);
router.patch(
  "/orders/:id/tasks/:taskId/status",
  adminStaff,
  orders.updateTaskStatus,
);

router.get("/orders", adminStaff, orders.getAll);
router.get("/orders/:id", adminStaff, orders.getOne);
router.patch(
  "/orders/:id/status",
  adminOnly,
  logAction("update_order_status", "orders"),
  orders.updateStatus,
);
router.post("/orders/:id/accept", adminOnly, orders.accept);
router.post("/orders/:id/decline", adminOnly, orders.decline);

router.post(
  "/orders/:id/verify-payment",
  adminOnly,
  logAction("verify_payment", "payment_transactions"),
  orders.verifyPayment,
);

router.get("/orders/:id/discussion", adminStaff, orders.getOrderDiscussion);

router.post(
  "/orders/:id/discussion",
  adminStaff,
  customDiscussionUpload,
  orders.postOrderDiscussionMessage,
);

router.post(
  "/orders/:id/delivery-receipt",
  adminStaff,
  upload.uploadDeliveryReceipt,
  orders.uploadDeliveryReceipt,
);

router.post("/orders/:id/cancellation", adminOnly, orders.processCancellation);

// ══════════════════════════════════════════════════════════════════════════════
// CONTRACTS
// ══════════════════════════════════════════════════════════════════════════════
router.get("/contracts", adminOnly, mgmt.getContracts);
router.post("/contracts", adminOnly, mgmt.generateContract);

// ══════════════════════════════════════════════════════════════════════════════
// SALES REPORTS
// ══════════════════════════════════════════════════════════════════════════════
router.get("/sales/report", adminStaff, sales.getReport);
router.get("/sales/report/print", adminStaff, sales.getPrintData);

// ══════════════════════════════════════════════════════════════════════════════
// WARRANTY
// ══════════════════════════════════════════════════════════════════════════════
router.get("/warranty", adminOnly, warrantyController.getClaims);

router.patch(
  "/warranty/:id/decision",
  adminOnly,
  logAction("decide_warranty_claim", "warranties"),
  warrantyController.decideClaim,
);

router.patch(
  "/warranty/:id/fulfill",
  adminOnly,
  replacementUpload,
  logAction("fulfill_warranty_claim", "warranties"),
  warrantyController.fulfillClaim,
);
// ══════════════════════════════════════════════════════════════════════════════
// CUSTOMER ACCOUNT MANAGEMENT
// ══════════════════════════════════════════════════════════════════════════════
router.get("/customers", adminOnly, mgmt.getCustomers);
router.put(
  "/customers/:id/status",
  adminOnly,
  logAction("update_customer_status", "users"),
  mgmt.updateCustomerStatus,
);

// ══════════════════════════════════════════════════════════════════════════════
// USER & ROLE MANAGEMENT
// ══════════════════════════════════════════════════════════════════════════════
router.get("/users", adminOnly, mgmt.getUsers);
router.post(
  "/users",
  adminOnly,
  logAction("create_user", "users"),
  mgmt.createUser,
);
router.put(
  "/users/:id",
  adminOnly,
  logAction("update_user", "users"),
  mgmt.updateUser,
);
router.patch(
  "/users/:id/password",
  adminOnly,
  logAction("reset_user_password", "users"),
  mgmt.resetUserPassword,
);
router.delete(
  "/users/:id",
  adminOnly,
  logAction("delete_user", "users"),
  mgmt.deleteUser,
);

// ══════════════════════════════════════════════════════════════════════════════
// AUDIT LOGS (view-only, no direct DB access needed)
// ══════════════════════════════════════════════════════════════════════════════
router.get("/audit-logs", adminOnly, mgmt.getAuditLogs);

// ══════════════════════════════════════════════════════════════════════════════
// WEBSITE MAINTENANCE
// ══════════════════════════════════════════════════════════════════════════════
router.get("/website/settings", adminOnly, website.getSettings);
router.put(
  "/website/settings",
  adminOnly,
  upload.uploadSiteLogo,
  website.updateSettings,
);

router.get("/website/faqs", adminOnly, website.getFaqs);
router.post("/website/faqs", adminOnly, website.createFaq);
router.put("/website/faqs/:id", adminOnly, website.updateFaq);
router.delete("/website/faqs/:id", adminOnly, website.deleteFaq);

router.get("/website/pages", adminOnly, website.getPages);
router.get("/website/pages/:slug", adminOnly, website.getPage);
router.put("/website/pages/:slug", adminOnly, website.updatePage);

// ══════════════════════════════════════════════════════════════════════════════
// BACKUP
// ══════════════════════════════════════════════════════════════════════════════
router.get("/backup/logs", adminOnly, website.getBackupLogs);
router.post("/backup/trigger", adminOnly, website.triggerManualBackup);
router.get("/backup/download/:filename", adminOnly, website.downloadBackup);

router.post(
  "/orders/:id/custom-request/approve",
  adminOnly,
  orders.approveCustomRequest,
);

router.post(
  "/orders/:id/custom-request/request-revision",
  adminOnly,
  orders.requestCustomRequestRevision,
);

router.post(
  "/orders/:id/custom-request/reject",
  adminOnly,
  orders.rejectCustomRequest,
);

module.exports = router;