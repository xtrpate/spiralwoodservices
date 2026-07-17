// routes/customer.profile.js
const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { authenticate, requireCustomer } = require("../middleware/auth");
const { logAction } = require("../middleware/auditLog");
const profileController = require("../controllers/customer/customer.profile");
const { verifyFileSignature } = require("../utils/verifyFileSignature");

/* ── Multer — avatar upload ── */
const avatarDir = path.join(__dirname, "../uploads/avatars");
if (!fs.existsSync(avatarDir)) fs.mkdirSync(avatarDir, { recursive: true });

const avatarStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, avatarDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `avatar_${req.user.id}_${Date.now()}${ext}`);
  },
});

const ALLOWED_AVATAR_EXT = [".jpg", ".jpeg", ".jfif", ".png", ".gif", ".webp"];

const uploadAvatar = multer({
  storage: avatarStorage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 👉 BUMPED TO 10MB so you never hit this issue again!
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase();
    if (ALLOWED_AVATAR_EXT.includes(ext)) {
      cb(null, true);
      return;
    }
    cb(new Error("Only JPG, PNG, GIF, JFIF, and WEBP images are allowed."));
  },
});

// 👉 NEW: This wrapper forces the server to tell us EXACTLY what went wrong
const handleAvatarUpload = (req, res, next) => {
  uploadAvatar.single("avatar")(req, res, (err) => {
    if (err) {
      console.error("[Multer Error]:", err.message);
      // This sends the exact reason directly to your frontend red banner!
      return res
        .status(400)
        .json({ message: err.message || "Image upload failed." });
    }

    if (req.file) {
      const ext = path.extname(req.file.originalname || "").toLowerCase();
      if (!verifyFileSignature(req.file.path, ext)) {
        fs.unlink(req.file.path, () => {});
        return res.status(400).json({
          message: "Avatar content does not match its file extension. Upload rejected.",
        });
      }
    }

    next();
  });
};

/* ══════════════════════════════════════════════════════════════
   CUSTOMER PROFILE ROUTES
══════════════════════════════════════════════════════════════ */

router.post(
  "/avatar",
  authenticate,
  requireCustomer,
  handleAvatarUpload, // 👉 Replace uploadAvatar.single("avatar") with our new wrapper!
  profileController.uploadAvatar,
);
router.put(
  "/basic",
  authenticate,
  requireCustomer,
  logAction("update_customer_profile", "users"),
  profileController.updateBasic,
);
router.post(
  "/request-email-change",
  authenticate,
  requireCustomer,
  profileController.requestEmailChange,
);
router.post(
  "/verify-email-change",
  authenticate,
  requireCustomer,
  logAction("update_customer_email", "users"),
  profileController.verifyEmailChange,
);

router.put(
  "/phone",
  authenticate,
  requireCustomer,
  logAction("update_customer_phone", "users"),
  profileController.updatePhone,
);

router.post(
  "/request-password-change",
  authenticate,
  requireCustomer,
  profileController.requestPasswordChange,
);
router.post(
  "/verify-password-change",
  authenticate,
  requireCustomer,
  profileController.verifyPasswordChange,
);

module.exports = router;
