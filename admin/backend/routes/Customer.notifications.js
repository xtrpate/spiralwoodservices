const express = require("express");
const router = express.Router();
const { authenticate, requireCustomer } = require("../middleware/auth");
const notificationsController = require("../controllers/customer/customer.notifications");

router.get(
  "/",
  authenticate,
  requireCustomer,
  notificationsController.getNotifications,
);
router.patch(
  "/read-all",
  authenticate,
  requireCustomer,
  notificationsController.markAllNotificationsRead,
);
router.patch(
  "/:id/read",
  authenticate,
  requireCustomer,
  notificationsController.markNotificationRead,
);

module.exports = router;