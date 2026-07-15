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

const getLoginKey = (req) => {
  const ip = req.ip || req.socket?.remoteAddress || "unknown-ip";
  const email = String(req.body?.email || "")
    .trim()
    .toLowerCase();

  return `${ip}:${email || "missing-email"}`;
};

// Login: count attempts per IP + account and reset after a successful login.
const loginLimiterCore = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: {
    message: "Too many login attempts. Please wait 15 minutes before trying again.",
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: getLoginKey,
});

exports.loginLimiter = (req, res, next) => {
  const key = getLoginKey(req);

  res.once("finish", () => {
    if (res.statusCode >= 200 && res.statusCode < 300) {
      Promise.resolve(loginLimiterCore.resetKey(key)).catch((err) => {
        console.error(
          "[loginLimiter reset failed]",
          err?.message || "Unable to reset login attempts.",
        );
      });
    }
  });

  return loginLimiterCore(req, res, next);
};

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