// utils/verifyFileSignature.js
// Reads the first bytes of a saved file and checks them against known
// file-format signatures ("magic numbers"), instead of trusting the
// client-supplied extension or Content-Type header.
const fs = require("fs");

const BINARY_SIGNATURES = {
  jpg: [[0xff, 0xd8, 0xff]],
  jpeg: [[0xff, 0xd8, 0xff]],
  jfif: [[0xff, 0xd8, 0xff]], // JFIF is a JPEG variant, same magic bytes
  png: [[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
  pdf: [[0x25, 0x50, 0x44, 0x46, 0x2d]], // %PDF-
};

function matchesBytes(buffer, signature) {
  return signature.every((byte, i) => buffer[i] === byte);
}

function readHead(filePath, length = 16) {
  const buffer = Buffer.alloc(length);
  const fd = fs.openSync(filePath, "r");
  fs.readSync(fd, buffer, 0, length, 0);
  fs.closeSync(fd);
  return buffer;
}

// Shared check: does this in-memory buffer's header match the expected
// signature for the given (already-lowercased, no-dot) extension? Both
// verifyFileSignature and verifyBufferSignature below call this, so the
// signature rules only live in one place.
function matchesSignatureForExt(buffer, cleanExt) {
  if (cleanExt === "webp") {
    return (
      buffer.toString("ascii", 0, 4) === "RIFF" &&
      buffer.toString("ascii", 8, 12) === "WEBP"
    );
  }

  if (cleanExt === "svg") {
    const text = buffer.toString("utf8").trim().toLowerCase();
    return text.startsWith("<?xml") || text.startsWith("<svg");
  }

  const rule = BINARY_SIGNATURES[cleanExt];
  if (!rule) return false;

  return rule.some((sig) => matchesBytes(buffer, sig));
}

// Returns true if the actual file content matches the given extension.
// Unchanged behavior — still reads the header from a saved file on disk.
exports.verifyFileSignature = (filePath, ext) => {
  const cleanExt = String(ext || "").replace(".", "").toLowerCase();
  const buffer = readHead(filePath);
  return matchesSignatureForExt(buffer, cleanExt);
};

// Same magic-byte check as verifyFileSignature, but works on an
// in-memory Buffer instead of a file path — for cases like base64 data
// URLs where nothing has been written to disk yet (and shouldn't be,
// until the content is confirmed to match what it claims to be).
exports.verifyBufferSignature = (buffer, ext) => {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) return false;
  const cleanExt = String(ext || "").replace(".", "").toLowerCase();
  return matchesSignatureForExt(buffer, cleanExt);
};