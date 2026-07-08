// middleware/errorHandler.js – Global error handler
const { validationResult } = require("express-validator");

/**
 * Run express-validator checks; if any fail, return 422 with errors array.
 */
function validate(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(422).json({ errors: errors.array() });
  }
  next();
}

/**
 * Global uncaught error handler – mount LAST in app.js
 */
function errorHandler(err, req, res, next) {
  // eslint-disable-line no-unused-vars
  console.error(`[${new Date().toISOString()}] ${err.stack || err.message}`);

  // Multer errors
  if (err.code === "LIMIT_FILE_SIZE") {
    return res.status(400).json({ message: "File too large." });
  }

  const status = err.status || 500;
  res.status(status).json({
    message: status === 500 ? "Internal server error." : err.message,
  });
}

module.exports = { validate, errorHandler };
