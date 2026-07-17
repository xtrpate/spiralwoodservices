const express = require("express");
const router = express.Router();

const {
  authenticate,
  requireCashierOrAdmin,
} = require("../middleware/auth");

const { logAction } = require("../middleware/auditLog");

const posOrderController = require("../controllers/staff/pos.orders");

const posAccess = [authenticate, requireCashierOrAdmin];

/* ══════════════════════════════════════════════════════════════
   CASHIER / POS ORDERS ROUTES
══════════════════════════════════════════════════════════════ */

router.get("/", posAccess, posOrderController.getOrders);
router.post(
  "/",
  posAccess,
  logAction("create_pos_sale", "orders"),
  posOrderController.createOrder,
);
router.get("/:id", posAccess, posOrderController.getOrderById);

module.exports = router;