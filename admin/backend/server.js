require("dotenv").config();

const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const path = require("path");

const adminRoutes = require("./routes/admin");
const customerCustomOrdersRoutes = require("./routes/customer.custom-orders");
const { errorHandler } = require("./middleware/errorHandler");
const { startCronJobs } = require("./services/cronService");
const pool = require("./config/db");

const app = express();
const PORT = process.env.PORT || 5000;

app.set("trust proxy", 1);

app.use(
  helmet({
    crossOriginResourcePolicy: false,
  }),
);

app.use(
  cors({
    origin: [
      process.env.FRONTEND_URL,
      process.env.ADMIN_URL,
      "http://localhost:3000",
      "http://localhost:3001",
      "http://localhost:3002",
    ].filter(Boolean),
    credentials: true,
  }),
);

app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ extended: true, limit: "20mb" }));

const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX, 10) || 200,
  message: { message: "Too many requests. Please try again later." },
});

app.use("/api", limiter);

const uploadDir = process.env.UPLOAD_DIR || path.join(__dirname, "uploads");

// NOTE: Backup files are no longer served via a public express.static route.
// They are downloaded through the authenticated, admin-only
// GET /api/backup/download/:filename route (see routes/admin.js +
// controllers/admin/websiteController.js::downloadBackup).
const { verifyUploadSignature } = require("./utils/signedUrl");

const SENSITIVE_UPLOAD_PREFIXES = [
  "/proofs/",
  "/warranty/",
  "/warranty-replacements/",
  "/deliveries/",
  "/custom-request-assets/",
];

function protectSensitiveUploads(req, res, next) {
  const isSensitive = SENSITIVE_UPLOAD_PREFIXES.some((prefix) =>
    req.path.startsWith(prefix),
  );

  if (!isSensitive) return next(); // product photos, site logo stay public

  const { exp, sig } = req.query;
  if (verifyUploadSignature(req.path, exp, sig)) {
    return next();
  }

  return res.status(403).json({
    message: "Access denied. This file requires a valid link.",
  });
}

app.use(
  "/uploads",
  protectSensitiveUploads,
  express.static(
    path.isAbsolute(uploadDir) ? uploadDir : path.join(__dirname, uploadDir),
    {
      setHeaders: (res, filePath) => {
        const ext = path.extname(filePath).toLowerCase();
        if (ext === ".jfif" || ext === ".jpg" || ext === ".jpeg") {
          res.setHeader("Content-Type", "image/jpeg");
        }
        res.setHeader("Content-Disposition", "inline");
      },
    },
  ),
);
app.use("/api/public", require("./routes/public"));

app.use("/api", adminRoutes);

app.use("/api/customer/auth", require("./routes/customer.auth"));
app.use("/api/customer/products", require("./routes/customer.products"));
app.use("/api/customer/orders", require("./routes/customer.orders"));
app.use("/api/customer/cart", require("./routes/customer.cart"));
app.use("/api/customer/profile", require("./routes/customer.profile"));
app.use("/api/customer/blueprints", require("./routes/customer.blueprints"));
app.use(
  "/api/customer/appointments",
  require("./routes/customer.appointments"),
);
app.use("/api/customer/warranty", require("./routes/customer.warranty"));
app.use("/api/customer/custom-orders", customerCustomOrdersRoutes);

app.use("/api/pos/reports", require("./routes/pos.reports"));
app.use("/api/pos/dashboard", require("./routes/pos.dashboard"));
app.use("/api/pos/products", require("./routes/pos.products"));
app.use("/api/pos/orders", require("./routes/pos.orders"));
app.use("/api/pos/blueprints", require("./routes/pos.blueprints"));
app.use("/api/pos/tasks", require("./routes/pos.tasks"));
app.use("/api/pos", require("./routes/pos.fulfillment"));
app.use("/api/pos", require("./routes/pos.schedule"));
app.use("/api/pos", require("./routes/pos.receipts"));
app.use("/api/tasks", require("./routes/pos.tasks"));

app.get("/health", async (req, res) => {
  try {
    await pool.query("SELECT 1 AS ok");
    res.json({
      status: "ok",
      db: "connected",
      system: "WISDOM Unified System",
      timestamp: new Date(),
    });
  } catch (err) {
    res.status(503).json({
      status: "error",
      db: "disconnected",
      message: err.message,
      timestamp: new Date(),
    });
  }
});

const cron = require("node-cron");
const {
  autoCancelExpiredOrders,
} = require("./controllers/customer/customer.orders");

cron.schedule("*/30 * * * * *", () => {
  console.log(
    "Running scheduled task: Checking for expired PayMongo orders...",
  );
  autoCancelExpiredOrders();
});

app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`\n🚀  WISDOM Unified API running on http://localhost:${PORT}`);
  console.log(`    Environment: ${process.env.NODE_ENV || "development"}\n`);
  startCronJobs();
});

module.exports = app;
