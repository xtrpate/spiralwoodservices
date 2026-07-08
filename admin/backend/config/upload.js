// config/upload.js – Multer file upload configuration
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { verifyFileSignature } = require('./../utils/verifyFileSignature');

const ALLOWED_IMAGES = ['.jpg', '.jpeg', '.jfif', '.png', '.webp'];
const ALLOWED_DOCS = ['.pdf', '.jpg', '.jpeg', '.jfif', '.png'];
const ALLOWED_BLUEPRINTS = ['.pdf', '.png', '.jpg', '.jpeg', '.jfif', '.svg'];

const MAX_MB = parseInt(process.env.MAX_FILE_SIZE_MB || '15', 10);

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function diskStorage(subFolder) {
  return multer.diskStorage({
    destination(req, file, cb) {
      const dest = path.join(process.env.UPLOAD_DIR || './uploads', subFolder);
      ensureDir(dest);
      cb(null, dest);
    },
    filename(req, file, cb) {
      const ext = path.extname(file.originalname).toLowerCase();
      const name = `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;
      cb(null, name);
    },
  });
}

function fileFilter(allowed, label = 'File') {
  return (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();

    if (allowed.includes(ext)) {
      cb(null, true);
      return;
    }

    const err = new Error(
      `${label} type not allowed. Allowed: ${allowed.join(', ')}`
    );
    err.status = 400;
    cb(err);
  };
}

// After multer saves the file, verify its actual content (magic bytes)
// matches the extension it claims to be — not just the extension/mimetype
// the client sent. Deletes and rejects the file if it's a mismatch.
function withSignatureCheck(multerMiddleware, label = 'File') {
  return (req, res, next) => {
    multerMiddleware(req, res, (err) => {
      if (err) return next(err);

      const files = [];
      if (req.file) files.push(req.file);
      if (req.files) {
        const list = Array.isArray(req.files)
          ? req.files
          : Object.values(req.files).flat();
        files.push(...list);
      }

      for (const file of files) {
        const ext = path.extname(file.originalname || '').toLowerCase();
        const isValid = verifyFileSignature(file.path, ext);
        if (!isValid) {
          fs.unlink(file.path, () => {});
          return res.status(400).json({
            message: `${label} content does not match its file extension. Upload rejected.`,
          });
        }
      }

      next();
    });
  };
}

// ── Specific uploaders ────────────────────────────────────────────────────────
exports.uploadProductImage = withSignatureCheck(
  multer({
    storage: diskStorage('products'),
    fileFilter: fileFilter(ALLOWED_IMAGES, 'Product image'),
    limits: { fileSize: MAX_MB * 1024 * 1024 },
  }).single('image'),
  'Product image',
);

const blueprintUpload = withSignatureCheck(
  multer({
    storage: diskStorage('blueprints'),
    fileFilter: fileFilter(ALLOWED_BLUEPRINTS, 'Blueprint file'),
    limits: { fileSize: MAX_MB * 1024 * 1024 },
  }).fields([
    { name: 'file', maxCount: 1 },
    { name: 'reference_file', maxCount: 1 },

    { name: 'front_reference', maxCount: 1 },
    { name: 'back_reference', maxCount: 1 },
    { name: 'left_reference', maxCount: 1 },
    { name: 'right_reference', maxCount: 1 },
    { name: 'top_reference', maxCount: 1 },
  ]),
  'Blueprint file',
);

exports.uploadBlueprintFile = (req, res, next) => {
  blueprintUpload(req, res, (err) => {
    if (err) return next(err);
    if (res.headersSent) return; // signature check already rejected + responded

    req.referenceFiles = {
      front:
        req.files?.front_reference?.[0] ||
        req.files?.reference_file?.[0] ||
        req.files?.file?.[0] ||
        null,
      back: req.files?.back_reference?.[0] || null,
      left: req.files?.left_reference?.[0] || null,
      right: req.files?.right_reference?.[0] || null,
      top: req.files?.top_reference?.[0] || null,
    };

    req.file =
      req.referenceFiles.front ||
      req.files?.reference_file?.[0] ||
      req.files?.file?.[0] ||
      null;

    next();
  });
};

exports.uploadPaymentProof = withSignatureCheck(
  multer({
    storage: diskStorage('payments'),
    fileFilter: fileFilter(ALLOWED_IMAGES, 'Payment proof'),
    limits: { fileSize: MAX_MB * 1024 * 1024 },
  }).single('proof'),
  'Payment proof',
);

exports.uploadWarrantyProof = withSignatureCheck(
  multer({
    storage: diskStorage('warranty'),
    fileFilter: fileFilter(ALLOWED_DOCS, 'Warranty proof'),
    limits: { fileSize: MAX_MB * 1024 * 1024 },
  }).single('proof'),
  'Warranty proof',
);

exports.uploadDeliveryReceipt = withSignatureCheck(
  multer({
    storage: diskStorage('deliveries'),
    fileFilter: fileFilter(ALLOWED_IMAGES, 'Delivery receipt'),
    limits: { fileSize: MAX_MB * 1024 * 1024 },
  }).single('receipt'),
  'Delivery receipt',
);

exports.uploadSiteLogo = withSignatureCheck(
  multer({
    storage: diskStorage('settings'),
    fileFilter: fileFilter(ALLOWED_IMAGES, 'Site logo'),
    limits: { fileSize: 2 * 1024 * 1024 },
  }).single('logo'),
  'Site logo',
);