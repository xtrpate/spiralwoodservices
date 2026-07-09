// utils/validators.js – small, reusable input validation helpers.
// These are pure functions only (no res/DB access) so they can be reused
// across other modules later (inventory, suppliers, etc.) without changes.

// A blank value (undefined/null/"") is treated as "valid" here — callers
// that require the field must check that separately. This keeps existing
// optional-field-defaults-to-0 behavior unchanged.
function isValidNonNegativeNumber(value) {
  if (value === undefined || value === null || value === "") return true;
  const num = Number(value);
  return !isNaN(num) && isFinite(num) && num >= 0;
}

function isValidNonNegativeInteger(value) {
  if (value === undefined || value === null || value === "") return true;
  const num = Number(value);
  return !isNaN(num) && isFinite(num) && Number.isInteger(num) && num >= 0;
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

// Rejects values that are purely numeric (with or without a minus sign or
// decimal point), e.g. "-1", "123", "0", "45.5". Allows normal unit labels
// like "pcs", "kg", "meter", "board ft".
function isValidUnitLabel(value) {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (trimmed.length === 0) return false;
  const purelyNumeric = /^-?\d+(\.\d+)?$/;
  return !purelyNumeric.test(trimmed);
}

// Loose phone number check: digits, spaces, dashes, parentheses, and an
// optional leading +. Covers PH mobile (09171234567) and landline formats.
function isValidPhoneNumber(value) {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (trimmed.length === 0) return false;
  const phonePattern = /^\+?[\d\s()-]{7,20}$/;
  return phonePattern.test(trimmed);
}

// Basic email format check.
function isValidEmail(value) {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (trimmed.length === 0) return false;
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailPattern.test(trimmed);
}

module.exports = {
  isValidNonNegativeNumber,
  isValidNonNegativeInteger,
  isNonEmptyString,
  isValidUnitLabel,
  isValidPhoneNumber,
  isValidEmail,
};