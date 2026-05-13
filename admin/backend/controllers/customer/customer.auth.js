// controllers/customer/customer.auth.js
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");
const db = require("../../config/db"); // Uses the unified db config
require("dotenv").config();

const OTP_EXPIRY_MINUTES = 15;
const RESET_OTP_EXPIRY_MINUTES = 15;

const generateOtp = () =>
  Math.floor(100000 + Math.random() * 900000).toString();

/* ── SMTP transporter ── */
const transporter = nodemailer.createTransport({
  host: process.env.MAIL_HOST || "smtp.gmail.com",
  port: Number(process.env.MAIL_PORT || 587),
  secure: Number(process.env.MAIL_PORT || 587) === 465,
  auth: {
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASS,
  },
});

/* ── Registration OTP email ── */
const sendOtpEmail = async (email, otp, name) => {
  try {
    await transporter.sendMail({
      from:
        process.env.MAIL_FROM ||
        `"Spiral Wood Services" <${process.env.MAIL_USER}>`,
      to: email,
      subject: "Your Spiral Wood Verification Code",
      html: `
        <!DOCTYPE html>
        <html>
          <body style="margin:0;padding:0;background:#f4f6f9;font-family:'Segoe UI',sans-serif;">
            <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 0;">
              <tr>
                <td align="center">
                  <table width="480" cellpadding="0" cellspacing="0"
                    style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
                    <tr>
                      <td style="background:linear-gradient(135deg,#1a1a2e,#16213e);padding:32px;text-align:center;">
                        <div style="width:56px;height:56px;background:linear-gradient(135deg,#8B4513,#D2691E);
                                    border-radius:14px;display:inline-flex;align-items:center;justify-content:center;
                                    font-size:26px;font-weight:900;color:white;font-family:Georgia,serif;
                                    line-height:56px;">W</div>
                        <h1 style="color:#ffffff;font-size:20px;font-weight:800;margin:12px 0 4px;
                                   letter-spacing:2px;">SPIRAL WOOD SERVICES</h1>
                        <p style="color:rgba(255,255,255,0.5);font-size:13px;margin:0;">
                          Email Verification
                        </p>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding:36px 40px;">
                        <p style="font-size:16px;color:#1a1a2e;margin:0 0 8px;">
                          Hi <strong>${name}</strong>,
                        </p>
                        <p style="font-size:14px;color:#666;line-height:1.7;margin:0 0 28px;">
                          Thank you for registering with Spiral Wood Services.
                          Use the verification code below to verify your email address.
                        </p>
                        <div style="background:#fff3e0;border:2px dashed #D2691E;border-radius:12px;
                                    padding:24px;text-align:center;margin-bottom:28px;">
                          <p style="font-size:12px;color:#8B4513;font-weight:700;
                                    letter-spacing:2px;margin:0 0 10px;text-transform:uppercase;">
                            Your Verification Code
                          </p>
                          <div style="font-size:42px;font-weight:900;color:#8B4513;
                                      letter-spacing:12px;font-family:'Courier New',monospace;">
                            ${otp}
                          </div>
                          <p style="font-size:12px;color:#aaa;margin:10px 0 0;">
                            Expires in <strong>${OTP_EXPIRY_MINUTES} minutes</strong>
                          </p>
                        </div>
                        <p style="font-size:13px;color:#888;line-height:1.7;margin:0;">
                          Enter this code on the verification page to finish creating your account.
                          If you did not create an account, please ignore this email.
                        </p>
                      </td>
                    </tr>
                    <tr>
                      <td style="background:#f7f8fa;padding:20px 40px;text-align:center;
                                 border-top:1px solid #eee;">
                        <p style="font-size:12px;color:#aaa;margin:0;line-height:1.6;">
                          © ${new Date().getFullYear()} Spiral Wood Services. All rights reserved.<br/>
                          This is an automated email — please do not reply.
                        </p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </body>
        </html>
      `,
    });
  } catch (err) {
    console.error("CRITICAL: Failed to send verification email.", err.message);
    throw new Error("EMAIL_FAILED");
  }
};

/* ── Password reset OTP email ── */
const sendResetOtpEmail = async (email, otp, name) => {
  try {
    await transporter.sendMail({
      from:
        process.env.MAIL_FROM ||
        `"Spiral Wood Services" <${process.env.MAIL_USER}>`,
      to: email,
      subject: "Your Spiral Wood Password Reset Code",
      html: `
        <!DOCTYPE html>
        <html>
          <body style="margin:0;padding:0;background:#f4f6f9;font-family:'Segoe UI',sans-serif;">
            <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 0;">
              <tr>
                <td align="center">
                  <table width="480" cellpadding="0" cellspacing="0"
                    style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
                    <tr>
                      <td style="background:linear-gradient(135deg,#1a1a2e,#16213e);padding:32px;text-align:center;">
                        <div style="width:56px;height:56px;background:linear-gradient(135deg,#8B4513,#D2691E);
                                    border-radius:14px;display:inline-flex;align-items:center;justify-content:center;
                                    font-size:26px;font-weight:900;color:white;font-family:Georgia,serif;
                                    line-height:56px;">W</div>
                        <h1 style="color:#ffffff;font-size:20px;font-weight:800;margin:12px 0 4px;
                                   letter-spacing:2px;">SPIRAL WOOD SERVICES</h1>
                        <p style="color:rgba(255,255,255,0.5);font-size:13px;margin:0;">
                          Password Reset
                        </p>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding:36px 40px;">
                        <p style="font-size:16px;color:#1a1a2e;margin:0 0 8px;">
                          Hi <strong>${name}</strong>,
                        </p>
                        <p style="font-size:14px;color:#666;line-height:1.7;margin:0 0 28px;">
                          We received a request to reset your password.
                          Use the code below to continue.
                        </p>
                        <div style="background:#fff3e0;border:2px dashed #D2691E;border-radius:12px;
                                    padding:24px;text-align:center;margin-bottom:28px;">
                          <p style="font-size:12px;color:#8B4513;font-weight:700;
                                    letter-spacing:2px;margin:0 0 10px;text-transform:uppercase;">
                            Password Reset Code
                          </p>
                          <div style="font-size:42px;font-weight:900;color:#8B4513;
                                      letter-spacing:12px;font-family:'Courier New',monospace;">
                            ${otp}
                          </div>
                          <p style="font-size:12px;color:#aaa;margin:10px 0 0;">
                            Expires in <strong>${RESET_OTP_EXPIRY_MINUTES} minutes</strong>
                          </p>
                        </div>
                        <p style="font-size:13px;color:#888;line-height:1.7;margin:0;">
                          Enter this code on the password reset page and create a new password.
                          If you did not request a reset, please ignore this email.
                        </p>
                      </td>
                    </tr>
                    <tr>
                      <td style="background:#f7f8fa;padding:20px 40px;text-align:center;
                                 border-top:1px solid #eee;">
                        <p style="font-size:12px;color:#aaa;margin:0;line-height:1.6;">
                          © ${new Date().getFullYear()} Spiral Wood Services. All rights reserved.<br/>
                          This is an automated email — please do not reply.
                        </p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </body>
        </html>
      `,
    });
  } catch (err) {
    console.error(
      "CRITICAL: Failed to send password reset email.",
      err.message,
    );
    throw new Error("RESET_EMAIL_FAILED");
  }
};

/* ══════════════════════════════════════════════════════════════
   EXPORTS
══════════════════════════════════════════════════════════════ */

exports.register = async (req, res) => {
  // MAGIC DEBUG LINE: This prints everything React sends us!
  console.log("=== INCOMING REGISTRATION DATA ===");
  console.log(req.body);

  const { first_name, last_name, email, phone, address, password } = req.body;

  if (!first_name || !last_name || !email || !phone || !address || !password) {
    console.log("Validation Failed: Missing a field.");
    return res.status(400).json({ message: "All fields are required." });
  }

  if (password.length < 8) {
    return res
      .status(400)
      .json({ message: "Password must be at least 8 characters." });
  }

  try {
    const normalizedEmail = String(email).trim().toLowerCase();
    const fullName = `${String(first_name).trim()} ${String(last_name).trim()}`;

    const [existing] = await db.query(
      "SELECT id FROM users WHERE email = ? LIMIT 1",
      [normalizedEmail],
    );

    if (existing.length > 0) {
      return res
        .status(409)
        .json({ message: "An account with this email already exists." });
    }

    const hashed = await bcrypt.hash(password, 12);
    const otp = generateOtp();
    const expiry = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

    const [result] = await db.query(
      `
      INSERT INTO users
        (
          name,
          email,
          password,
          phone,
          address,
          role,
          is_verified,
          otp_code,
          otp_expires,
          approval_status,
          is_active
        )
      VALUES
        (?, ?, ?, ?, ?, 'customer', FALSE, ?, ?, 'approved', TRUE)
      `,
      [fullName, normalizedEmail, hashed, phone, address, otp, expiry],
    );

    try {
      // 1. Try to send the email
      await sendOtpEmail(normalizedEmail, otp, String(first_name).trim());

      // 2. If email succeeds, tell frontend to show the OTP tab!
      return res.status(201).json({
        message:
          "Registration successful. Please check your email for the 6-digit verification code.",
        user_id: result.insertId,
      });
    } catch (emailError) {
      // 3. IF EMAIL FAILS: Delete the stuck user from the database!
      console.log("Email failed! Rolling back user creation...");
      await db.query("DELETE FROM users WHERE id = ?", [result.insertId]);

      return res.status(500).json({
        message: "We couldn't send the verification email. Please try again.",
      });
    }
    // -----------------------
  } catch (err) {
    console.error("[register]", err);
    return res.status(500).json({
      message: "Server error",
      error: err.message,
    });
  }
};

exports.verifyOtp = async (req, res) => {
  const { email, otp } = req.body;

  if (!email || !otp) {
    return res.status(400).json({ message: "Email and OTP are required." });
  }

  try {
    const normalizedEmail = String(email).trim().toLowerCase();
    const normalizedOtp = String(otp).trim();

    const [rows] = await db.query(
      `
      SELECT id, otp_code, otp_expires, is_verified
      FROM users
      WHERE email = ? AND role = 'customer'
      LIMIT 1
      `,
      [normalizedEmail],
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: "Account not found." });
    }

    const user = rows[0];

    if (user.is_verified) {
      return res.status(400).json({ message: "Email is already verified." });
    }

    const savedOtp = String(user.otp_code ?? "").trim();

    if (savedOtp !== normalizedOtp) {
      return res.status(400).json({
        message: "Invalid verification code.",
      });
    }

    if (!user.otp_expires || new Date() > new Date(user.otp_expires)) {
      return res.status(400).json({
        message: "Verification code has expired. Please request a new one.",
        code: "OTP_EXPIRED",
      });
    }

    await db.query(
      `
      UPDATE users
      SET
        is_verified = TRUE,
        otp_code = NULL,
        otp_expires = NULL,
        approval_status = 'approved',
        is_active = TRUE
      WHERE id = ?
      `,
      [user.id],
    );

    return res.json({
      message: "Email verified successfully. You can now log in.",
    });
  } catch (err) {
    console.error("[verify-otp]", err);
    return res.status(500).json({
      message: "Server error",
      error: err.message,
    });
  }
};

exports.resendOtp = async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ message: "Email is required." });
  }

  try {
    const normalizedEmail = String(email).trim().toLowerCase();

    const [rows] = await db.query(
      `
      SELECT id, name, is_verified
      FROM users
      WHERE email = ? AND role = 'customer'
      LIMIT 1
      `,
      [normalizedEmail],
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: "Account not found." });
    }

    if (rows[0].is_verified) {
      return res.status(400).json({ message: "Email is already verified." });
    }

    const otp = generateOtp();
    const expiry = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

    await db.query(
      `
      UPDATE users
      SET otp_code = ?, otp_expires = ?
      WHERE id = ?
      `,
      [otp, expiry, rows[0].id],
    );

    const firstName = rows[0].name.split(" ")[0];
    await sendOtpEmail(normalizedEmail, otp, firstName);

    return res.json({
      message: "A new verification code has been sent to your email.",
    });
  } catch (err) {
    console.error("[resend-otp]", err);
    return res.status(500).json({
      message: "Server error",
      error: err.message,
    });
  }
};

exports.forgotPassword = async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ message: "Email is required." });
  }

  try {
    const normalizedEmail = String(email).trim().toLowerCase();

    const [rows] = await db.query(
      `
      SELECT id, name, is_verified, is_active
      FROM users
      WHERE email = ? AND role = 'customer'
      LIMIT 1
      `,
      [normalizedEmail],
    );

    if (rows.length === 0) {
      return res.status(404).json({
        message: "No account found with that email address.",
      });
    }

    const user = rows[0];

    if (!user.is_verified) {
      return res.status(403).json({
        message: "This email is not yet verified. Please verify your account first.",
      });
    }

    if (!user.is_active) {
      return res.status(403).json({
        message: "This account is inactive. Please contact support.",
      });
    }

    const resetOtp = generateOtp();
    const resetExpiry = new Date(
      Date.now() + RESET_OTP_EXPIRY_MINUTES * 60 * 1000,
    );

    await db.query(
      `
      UPDATE users
      SET reset_otp = ?, reset_otp_expires = ?
      WHERE id = ?
      `,
      [resetOtp, resetExpiry, user.id],
    );

    const firstName = user.name ? user.name.split(" ")[0] : "Customer";
    await sendResetOtpEmail(normalizedEmail, resetOtp, firstName);

    return res.json({
      message: "We sent a 6-digit password reset code to your email.",
    });
  } catch (err) {
    console.error("[forgot-password]", err);

    if (err.message === "RESET_EMAIL_FAILED") {
      return res.status(500).json({
        message: "We couldn't send the reset code email. Please try again.",
      });
    }

    return res.status(500).json({
      message: "Server error",
      error: err.message,
    });
  }
};

exports.resetPassword = async (req, res) => {
  const { email, otp, new_password } = req.body;

  if (!email || !otp || !new_password) {
    return res.status(400).json({
      message: "Email, reset code, and new password are required.",
    });
  }

  if (String(new_password).length < 8) {
    return res.status(400).json({
      message: "New password must be at least 8 characters.",
    });
  }

  try {
    const normalizedEmail = String(email).trim().toLowerCase();
    const normalizedOtp = String(otp).trim();

    const [rows] = await db.query(
      `
      SELECT id, reset_otp, reset_otp_expires, is_verified, is_active
      FROM users
      WHERE email = ? AND role = 'customer'
      LIMIT 1
      `,
      [normalizedEmail],
    );

    if (rows.length === 0) {
      return res.status(400).json({
        message: "Invalid or expired reset code.",
      });
    }

    const user = rows[0];

    if (!user.is_verified) {
      return res.status(403).json({
        message: "Please verify your email before resetting your password.",
      });
    }

    if (!user.is_active) {
      return res.status(403).json({
        message: "Your account has been deactivated. Please contact support.",
      });
    }

    const savedResetOtp = String(user.reset_otp ?? "").trim();

    if (!savedResetOtp || savedResetOtp !== normalizedOtp) {
      return res.status(400).json({
        message: "Invalid or expired reset code.",
      });
    }

    if (
      !user.reset_otp_expires ||
      new Date() > new Date(user.reset_otp_expires)
    ) {
      return res.status(400).json({
        message: "Reset code has expired. Please request a new one.",
        code: "RESET_OTP_EXPIRED",
      });
    }

    const hashedPassword = await bcrypt.hash(new_password, 12);

    await db.query(
      `
      UPDATE users
      SET
        password = ?,
        reset_otp = NULL,
        reset_otp_expires = NULL
      WHERE id = ?
      `,
      [hashedPassword, user.id],
    );

    return res.json({
      message: "Password reset successful. You can now log in.",
    });
  } catch (err) {
    console.error("[reset-password]", err);
    return res.status(500).json({
      message: "Server error",
      error: err.message,
    });
  }
};

exports.login = async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res
      .status(400)
      .json({ message: "Email and password are required." });
  }

  try {
    const normalizedEmail = String(email).trim().toLowerCase();

    const [rows] = await db.query(
      `
      SELECT
        id,
        name,
        email,
        password,
        role,
        phone,
        address,
        profile_photo,
        is_verified,
        is_active
      FROM users
      WHERE email = ? 
      LIMIT 1
      `,
      [normalizedEmail],
    );

    if (rows.length === 0) {
      return res.status(401).json({ message: "Invalid email or password." });
    }

    const user = rows[0];

    const match = await bcrypt.compare(password, user.password || "");
    if (!match) {
      return res.status(401).json({ message: "Invalid email or password." });
    }

    if (user.role === "customer" && !user.is_verified) {
      return res.status(403).json({
        message: "Please verify your email before logging in.",
        code: "EMAIL_NOT_VERIFIED",
        email: user.email,
      });
    }

    if (!user.is_active) {
      return res.status(403).json({
        message: "Your account has been deactivated. Please contact support.",
        code: "ACCOUNT_INACTIVE",
      });
    }

    const token = jwt.sign(
      {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || "24h" },
    );

    await db.query("UPDATE users SET last_login = NOW() WHERE id = ?", [
      user.id,
    ]);

    return res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        phone: user.phone,
        address: user.address,
        profile_photo: user.profile_photo,
      },
    });
  } catch (err) {
    console.error("[login]", err);
    return res.status(500).json({
      message: "Server error",
      error: err.message,
    });
  }
};

/* ══════════════════════════════════════════════════════════════
   CLOUD CART SYNC (OMNICHANNEL RECONCILIATION)
══════════════════════════════════════════════════════════════ */

exports.getCloudCart = async (req, res) => {
  // req.user comes from your JWT authentication middleware
  if (!req.user || !req.user.id) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  try {
    const [rows] = await db.query(
      "SELECT cart_data FROM customer_carts WHERE customer_id = ?",
      [req.user.id],
    );

    if (rows.length > 0) {
      return res.json({ cart: rows[0].cart_data });
    }
    return res.json({ cart: [] });
  } catch (err) {
    console.error("[getCloudCart]", err);
    return res
      .status(500)
      .json({ message: "Server error", error: err.message });
  }
};

exports.syncCloudCart = async (req, res) => {
  if (!req.user || !req.user.id) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const { cart } = req.body;

  try {
    // Convert the cart array into a JSON string to store in the database
    const cartJson = JSON.stringify(cart || []);

    // Industry Standard: "Upsert" (Insert if new, Update if exists)
    await db.query(
      `
      INSERT INTO customer_carts (customer_id, cart_data) 
      VALUES (?, ?) 
      ON DUPLICATE KEY UPDATE cart_data = VALUES(cart_data)
      `,
      [req.user.id, cartJson],
    );

    return res.json({ success: true, message: "Cart synced to cloud." });
  } catch (err) {
    console.error("[syncCloudCart]", err);
    return res
      .status(500)
      .json({ message: "Server error", error: err.message });
  }
};
