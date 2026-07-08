// middleware/authRateLimit.js
const rateLimit = require("express-rate-limit");

const buildLimiter = (windowMs, max, message) =>
  rateLimit({
    windowMs,
    max,
    message: { message },
    standardHeaders: true,
    legacyHeaders: false,
  });

// Login: pinaka-mahigpit — direktang target ng brute-force
exports.loginLimiter = buildLimiter(
  15 * 60 * 1000, // 15 minutes
  10,
  "Too many login attempts. Please wait 15 minutes before trying again.",
);

// Register: iwas spam account creation
exports.registerLimiter = buildLimiter(
  60 * 60 * 1000, // 1 hour
  5,
  "Too many registration attempts. Please try again later.",
);

// OTP verification (register + reset): iwas brute-force ng 6-digit code
exports.otpLimiter = buildLimiter(
  15 * 60 * 1000, // 15 minutes
  10,
  "Too many verification attempts. Please wait before trying again.",
);

// Resend OTP / Forgot Password: iwas email spam
exports.otpRequestLimiter = buildLimiter(
  15 * 60 * 1000, // 15 minutes
  5,
  "Too many requests. Please wait before requesting another code.",
);