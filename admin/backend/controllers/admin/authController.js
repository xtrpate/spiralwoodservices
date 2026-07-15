// controllers/authController.js (Unified Gateway for Admin, Staff, and Customers)
// controllers/authController.js (Unified Gateway for Admin, Staff, and Customers)
// controllers/authController.js (Unified Gateway for Admin, Staff, and Customers)
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
// const nodemailer = require("nodemailer");
const pool = require("../../config/db"); 

require("dotenv").config();

// ══════════════════════════════════════════════════════════════
//   CUSTOMER OTP CONFIGURATION (For unverified logins)
// ══════════════════════════════════════════════════════════════
const OTP_EXPIRY_MINUTES = 15;

const generateOtp = () => Math.floor(100000 + Math.random() * 900000).toString();

/* ── Brevo REST API Setup ── */
const sendOtpEmail = async (email, otp, name) => {
  try {
    const payload = {
      sender: { 
        name: "Spiral Wood Services", 
        // CRITICAL: This must exactly match the verified email in your Brevo account
        email: process.env.MAIL_USER 
      },
      to: [{ email: email, name: name }],
      subject: "Your Spiral Wood Verification Code",
      htmlContent: `
        <div style="font-family:sans-serif; text-align:center; padding:20px;">
          <h2>Spiral Wood Services</h2>
          <p>Hi ${name},</p>
          <p>Your account is not verified yet. Please use the code below to verify your email:</p>
          <h1 style="color:#8B4513; letter-spacing:5px;">${otp}</h1>
          <p>This code expires in ${OTP_EXPIRY_MINUTES} minutes.</p>
        </div>
      `,
    };

    // Utilizing native fetch for zero-dependency API calls
    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "accept": "application/json",
        "api-key": process.env.BREVO_API_KEY,
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error("[Brevo API Error]", errorData);
      throw new Error(`BREVO_REJECTED: ${response.status}`);
    }

  } catch (err) {
    console.error("Failed to send verification email.", err.message);
    throw new Error("EMAIL_FAILED");
  }
};

// ══════════════════════════════════════════════════════════════
//   THE UNIFIED LOGIN (POST /api/auth/login)
// ══════════════════════════════════════════════════════════════
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required." });
    }

    // 🔓 TEMP — reCAPTCHA check disabled on login for faster local testing.
    // RESTORE BEFORE PRODUCTION / GOING LIVE: uncomment the block below.
    // const isHuman = await verifyRecaptcha(recaptcha_token);
    // if (!isHuman) {
    //   return res.status(400).json({ message: "Please complete the CAPTCHA verification." });
    // }

    const normalizedEmail = String(email).trim().toLowerCase();

    // 1. Query EVERYONE. No role restrictions!
    const [[user]] = await pool.query(
      `SELECT * FROM users WHERE email = ? LIMIT 1`,
      [normalizedEmail]
    );

    if (!user) return res.status(401).json({ message: "Invalid credentials." });

    const match = await bcrypt.compare(password, user.password || "");
    if (!match) return res.status(401).json({ message: "Invalid credentials." });

    // 2. ROLE-SPECIFIC CHECKS

    // A. Customer Recovery Flow
    if (user.role === "customer" && !user.is_verified) {
      const newOtp = generateOtp();
      const expiry = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

      await pool.query(
        "UPDATE users SET otp_code = ?, otp_expires = ? WHERE id = ?",
        [newOtp, expiry, user.id]
      );

      const firstName = user.name ? user.name.split(" ")[0] : "Customer";
      await sendOtpEmail(user.email, newOtp, firstName);

      return res.status(403).json({
        message: "Account not verified. A new verification code has been sent to your email.",
        code: "EMAIL_NOT_VERIFIED",
        email: user.email,
      });
    }

    // B. Staff Configuration Check
    if (user.role === "staff" && !user.staff_type) {
      return res.status(403).json({
        message: "Staff account type is not configured yet. Contact admin.",
      });
    }

    // C. Global Active Check (Handles banned/deactivated accounts)
    if (!user.is_active) {
      return res.status(403).json({ 
        message: "Your account has been deactivated. Please contact support.",
        code: "ACCOUNT_INACTIVE"
      });
    }

    // 3. SUCCESS: Issue Token & Update Last Login
    await pool.query("UPDATE users SET last_login = NOW() WHERE id = ?", [user.id]);

    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        role: user.role,
        name: user.name,
        staff_type: user.staff_type || null,
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || "8h" }
    );

    // Strip out all sensitive data before sending to frontend
    const { password: _, otp_code: __, reset_otp: ___, ...safeUser } = user;
    res.json({ token, user: safeUser });

  } catch (err) {
    console.error("[Unified Login Error]", err);
    res.status(500).json({ message: "Server error during login." });
  }
};

// ══════════════════════════════════════════════════════════════
//   EXISTING ADMIN PROFILE FUNCTIONS (Left exactly as they were)
// ══════════════════════════════════════════════════════════════

// ── GET /api/auth/me ──
exports.getMe = async (req, res) => {
  try {
    const [[user]] = await pool.query(
      `SELECT id, name, email, role, staff_type, phone, address, profile_photo, last_login 
       FROM users WHERE id = ?`,
      [req.user.id]
    );
    res.json(user);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ── PUT /api/auth/profile ──
exports.updateProfile = async (req, res) => {
  try {
    const { name, phone, address } = req.body;
    const photo = req.file ? `/uploads/profiles/${req.file.filename}` : undefined;

    const fields = { name, phone, address };
    if (photo) fields.profile_photo = photo;

    const sets = Object.keys(fields).map((k) => `${k} = ?`).join(", ");
    const vals = [...Object.values(fields), req.user.id];

    await pool.query(`UPDATE users SET ${sets} WHERE id = ?`, vals);
    res.json({ message: "Profile updated." });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ── PUT /api/auth/change-password ──
exports.changePassword = async (req, res) => {
  try {
    const { current_password, new_password } = req.body;

    const [[user]] = await pool.query("SELECT password FROM users WHERE id = ?", [req.user.id]);
    
    const match = await bcrypt.compare(current_password, user.password);
    if (!match) return res.status(400).json({ message: "Current password is incorrect." });

    const hashed = await bcrypt.hash(new_password, 12);
    await pool.query("UPDATE users SET password = ? WHERE id = ?", [hashed, req.user.id]);

    res.json({ message: "Password changed successfully." });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};