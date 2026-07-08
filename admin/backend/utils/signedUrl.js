// utils/signedUrl.js
// Generates and verifies short-lived, tamper-proof "signed" URLs for
// sensitive uploaded files (payment proofs, warranty photos, etc.)
// so they can't be viewed by guessing the filename alone.
const crypto = require("crypto");

const EXPIRY_MS = 15 * 60 * 1000; // 15 minutes

// Normalizes any path format ("uploads/x", "/uploads/x", "x") into the
// same canonical form Express uses internally when the static middleware
// is mounted at "/uploads" (i.e. the "uploads" segment gets stripped off).
function normalizePath(relativePath) {
  let p = String(relativePath || "").trim().replace(/\\/g, "/");
  p = p.replace(/^\/?uploads\//i, "/");
  if (!p.startsWith("/")) p = `/${p}`;
  return p;
}

function sign(filePath, expiresAt) {
  return crypto
    .createHmac("sha256", process.env.JWT_SECRET)
    .update(`${filePath}:${expiresAt}`)
    .digest("hex");
}

// Turns a stored path like "uploads/warranty/xxx.jpg" into a signed URL,
// e.g. "uploads/warranty/xxx.jpg?exp=1234567890&sig=abcd1234..."
exports.signUploadPath = (relativePath) => {
  if (!relativePath) return relativePath;
  const normalized = normalizePath(relativePath);
  const expiresAt = Date.now() + EXPIRY_MS;
  const token = sign(normalized, expiresAt);
  const separator = relativePath.includes("?") ? "&" : "?";
  return `${relativePath}${separator}exp=${expiresAt}&sig=${token}`;
};

exports.verifyUploadSignature = (relativePath, exp, sig) => {
  if (!exp || !sig) return false;
  if (Date.now() > Number(exp)) return false; // expired link

  const normalized = normalizePath(relativePath);
  const expected = sign(normalized, exp);
  const a = Buffer.from(expected);
  const b = Buffer.from(String(sig));
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
};