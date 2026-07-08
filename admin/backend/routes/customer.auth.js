// routes/customer.auth.js
// routes/customer.auth.js
const express = require("express");
const router = express.Router();
const authController = require("../controllers/customer/customer.auth");

// 👉 THE FIX: Changed 'verifyToken' to 'authenticate' to match your middleware file
const { authenticate } = require("../middleware/auth");
const {
  registerLimiter,
  otpLimiter,
  otpRequestLimiter,
} = require("../middleware/authRateLimit");

/* ══════════════════════════════════════════════════════════════
   CUSTOMER AUTHENTICATION ROUTES
══════════════════════════════════════════════════════════════ */
router.post("/register", registerLimiter, authController.register);
router.post("/verify-otp", otpLimiter, authController.verifyOtp);
router.post("/resend-otp", otpRequestLimiter, authController.resendOtp);
router.post("/forgot-password", otpRequestLimiter, authController.forgotPassword);
router.post("/reset-password", otpLimiter, authController.resetPassword);
//router.post("/login", authController.login);

/* ══════════════════════════════════════════════════════════════
   CLOUD CART OMNICHANNEL ROUTES (Protected)
══════════════════════════════════════════════════════════════ */
// 👉 THE FIX: Changed 'verifyToken' to 'authenticate' here as well
router.get("/cart", authenticate, authController.getCloudCart);
router.post("/cart/sync", authenticate, authController.syncCloudCart);

module.exports = router;
