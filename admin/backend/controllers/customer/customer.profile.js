// controllers/customer/customer.profile.js
const db = require("../../config/db"); // Uses the unified db config
const bcrypt = require("bcryptjs");
const path = require("path");
const fs = require("fs");
const nodemailer = require("nodemailer");
const twilio = require("twilio");

/* ── Nodemailer ── */
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: { user: process.env.MAIL_USER, pass: process.env.MAIL_PASS },
});

/* ── Twilio ── */
const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN,
);

/* ── OTP generator ── */
const genOtp = () => Math.floor(100000 + Math.random() * 900000).toString();

/* ── Directory for deleting old avatars ── */
const avatarDir = path.join(__dirname, "../../uploads/avatars");

/* ────────────────────────────────────────
   POST /avatar
──────────────────────────────────────── */
exports.uploadAvatar = async (req, res) => {
  if (!req.file) return res.status(400).json({ message: "No file uploaded." });
  try {
    /* Delete old avatar */
    // ── FIXED: Switched to .query ──
    const [rows] = await db.query(
      "SELECT profile_photo FROM users WHERE id=?",
      [req.user.id],
    );
    if (rows[0]?.profile_photo) {
      const old = path.join(avatarDir, rows[0].profile_photo);
      if (fs.existsSync(old)) fs.unlinkSync(old);
    }

    // ── FIXED: Switched to .query ──
    const [updateResult] = await db.query("UPDATE users SET profile_photo=? WHERE id=?", [
      req.file.filename,
      req.user.id,
    ]);

    if (updateResult?.affectedRows === 1) {
      req.auditRecord = {
        id: req.user.id,
        old: { avatar_configured: Boolean(rows[0]?.profile_photo) },
        new: {
          avatar_changed: true,
          avatar_configured: true,
          changed_fields: ["profile_photo"],
        },
      };
    }

    res.json({ profile_photo: req.file.filename });
  } catch (err) {
    console.error("[profile/avatar]", err);
    res.status(500).json({ message: "Upload failed." });
  }
};

/* ────────────────────────────────────────
   PUT /basic  — name + address
──────────────────────────────────────── */
exports.updateBasic = async (req, res) => {
  const { name, address, address_lat, address_lng } = req.body;
  if (!name?.trim())
    return res.status(400).json({ message: "Name is required." });

  // address_lat/address_lng are treated as an optional PAIR that the
  // customer either:
  //   - omits entirely from the request → leave the existing saved pin
  //     untouched (e.g. a plain name/address edit shouldn't wipe it out)
  //   - sends both as null/"" → explicitly clear the saved pin
  //   - sends both as valid numbers → update the saved pin
  //   - sends only one of the two → rejected, since a half-updated pin
  //     is a broken/inconsistent state
  const latKeyPresent = address_lat !== undefined;
  const lngKeyPresent = address_lng !== undefined;

  if (latKeyPresent !== lngKeyPresent) {
    return res.status(400).json({
      message: "Both latitude and longitude must be provided together.",
    });
  }

  const touchesPin = latKeyPresent && lngKeyPresent;
  let cleanLat = null;
  let cleanLng = null;

  if (touchesPin) {
    const isEmptyPinValue = (v) => v === null || v === "";
    const bothEmpty = isEmptyPinValue(address_lat) && isEmptyPinValue(address_lng);
    const bothFilled = !isEmptyPinValue(address_lat) && !isEmptyPinValue(address_lng);

    if (!bothEmpty && !bothFilled) {
      return res.status(400).json({
        message: "Both latitude and longitude must be provided together.",
      });
    }

    if (bothFilled) {
      const latNum = Number(address_lat);
      const lngNum = Number(address_lng);

      if (
        !Number.isFinite(latNum) ||
        !Number.isFinite(lngNum) ||
        latNum < -90 ||
        latNum > 90 ||
        lngNum < -180 ||
        lngNum > 180
      ) {
        return res.status(400).json({
          message:
            "Invalid map location. Latitude must be between -90 and 90, and longitude between -180 and 180.",
        });
      }

      cleanLat = latNum;
      cleanLng = lngNum;
    }
    // else bothEmpty — cleanLat/cleanLng stay null, which clears the pin
  }

  try {
    const [[existingUser]] = await db.query(
      "SELECT name, address, address_lat, address_lng FROM users WHERE id = ?",
      [req.user.id],
    );

    const normalizeCoord = (value) => {
      if (value === null || value === undefined || value === "") return null;
      const num = Number(value);
      return Number.isFinite(num) ? num : null;
    };

    const existingLat = existingUser
      ? normalizeCoord(existingUser.address_lat)
      : null;
    const existingLng = existingUser
      ? normalizeCoord(existingUser.address_lng)
      : null;

    let updateResult;

    if (touchesPin) {
      // Request explicitly included lat/lng (either clearing or setting
      // a pin) — update all four columns.
      [updateResult] = await db.query(
        "UPDATE users SET name=?, address=?, address_lat=?, address_lng=? WHERE id=?",
        [name.trim(), address?.trim() || "", cleanLat, cleanLng, req.user.id],
      );
    } else {
      // Request didn't mention lat/lng at all — only touch name/address,
      // leaving any previously saved pin exactly as it was.
      [updateResult] = await db.query("UPDATE users SET name=?, address=? WHERE id=?", [
        name.trim(),
        address?.trim() || "",
        req.user.id,
      ]);
    }

    if (existingUser && updateResult?.affectedRows === 1) {
      const trimmedName = name.trim();
      const trimmedAddress = address?.trim() || "";

      const previousCoordinatesConfigured =
        existingLat !== null && existingLng !== null;

      const nextCoordinatesConfigured = touchesPin
        ? cleanLat !== null && cleanLng !== null
        : previousCoordinatesConfigured;

      const changedFields = [
        ...(trimmedName !== (existingUser.name || "") ? ["name"] : []),
        ...(trimmedAddress !== (existingUser.address || "")
          ? ["address"]
          : []),
        ...(touchesPin &&
        (cleanLat !== existingLat || cleanLng !== existingLng)
          ? ["coordinates"]
          : []),
      ];

      if (changedFields.length) {
        req.auditRecord = {
          id: req.user.id,
          old: {
            address_configured: Boolean(existingUser.address?.trim()),
            coordinates_configured: previousCoordinatesConfigured,
          },
          new: {
            name_changed: changedFields.includes("name"),
            address_configured: Boolean(trimmedAddress),
            coordinates_configured: nextCoordinatesConfigured,
            changed_fields: changedFields,
          },
        };
      }
    }

    res.json({ message: "Profile updated." });
  } catch (err) {
    console.error("[profile/basic]", err);
    res.status(500).json({ message: "Update failed." });
  }
};

/* ────────────────────────────────────────
   POST /request-email-change
──────────────────────────────────────── */
exports.requestEmailChange = async (req, res) => {
  const { new_email } = req.body;
  if (!new_email?.trim())
    return res.status(400).json({ message: "New email is required." });

  const normalizedCurrentEmail = String(req.user.email || "")
    .trim()
    .toLowerCase();
  const normalizedRequestedEmail = String(new_email || "")
    .trim()
    .toLowerCase();

  if (normalizedRequestedEmail === normalizedCurrentEmail) {
    return res.status(400).json({
      message: "New email must be different from your current email.",
    });
  }

  /* Check if email already taken */
  // ── FIXED: Switched to .query ──
  const [exists] = await db.query(
    "SELECT id FROM users WHERE email=? AND id!=?",
    [new_email, req.user.id],
  );
  if (exists.length)
    return res.status(409).json({ message: "Email already in use." });

  const otp = genOtp();
  const expires = new Date(Date.now() + 15 * 60 * 1000);

  try {
    /* Store pending change */
    // ── FIXED: Switched to .query ──
    await db.query(
      `UPDATE users
       SET otp_code=?, otp_expires=?, pending_email=?
       WHERE id=?`,
      [otp, expires, new_email, req.user.id],
    );

    await transporter.sendMail({
      from: `"Spiral Wood Services" <${process.env.MAIL_USER}>`,
      to: new_email,
      subject: "Verify your new email — Spiral Wood",
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
          <h2 style="color:#8B4513">Verify New Email</h2>
          <p>Use this OTP to confirm your new email address. It expires in 15 minutes.</p>
          <div style="font-size:36px;font-weight:900;letter-spacing:10px;
                      color:#8B4513;background:#fff3e0;padding:20px;
                      border-radius:10px;text-align:center;margin:20px 0">
            ${otp}
          </div>
          <p style="color:#888;font-size:13px">If you didn't request this, ignore this email.</p>
        </div>
      `,
    });

    res.json({ message: "OTP sent to new email." });
  } catch (err) {
    console.error("[profile/request-email-change]", err);
    res.status(500).json({ message: "Failed to send OTP." });
  }
};

/* ────────────────────────────────────────
   POST /verify-email-change
──────────────────────────────────────── */
exports.verifyEmailChange = async (req, res) => {
  const { otp } = req.body;
  try {
    // ── FIXED: Switched to .query ──
    const [rows] = await db.query(
      "SELECT email, otp_code, otp_expires, pending_email FROM users WHERE id=?",
      [req.user.id],
    );
    const u = rows[0];
    if (!u || u.otp_code !== otp)
      return res.status(400).json({ message: "Invalid OTP." });
    if (new Date(u.otp_expires) < new Date())
      return res.status(400).json({ message: "OTP has expired." });

    const emailChanged = u.pending_email !== u.email;

    // ── FIXED: Switched to .query ──
    const [updateResult] = await db.query(
      `UPDATE users
       SET email=?, pending_email=NULL, otp_code=NULL, otp_expires=NULL
       WHERE id=?`,
      [u.pending_email, req.user.id],
    );

    if (emailChanged && updateResult?.affectedRows === 1) {
      req.auditRecord = {
        id: req.user.id,
        old: { email_configured: true },
        new: {
          email_changed: true,
          email_configured: true,
          changed_fields: ["email"],
        },
      };
    }

    res.json({ message: "Email updated successfully." });
  } catch (err) {
    console.error("[profile/verify-email-change]", err);
    res.status(500).json({ message: "Verification failed." });
  }
};

/* ────────────────────────────────────────
   PUT /phone  — Instant phone update
──────────────────────────────────────── */
exports.updatePhone = async (req, res) => {
  const { phone } = req.body;

  if (!phone || !phone.trim()) {
    return res.status(400).json({ message: "Phone number is required." });
  }

  try {
    const [[existingUser]] = await db.query(
      "SELECT phone FROM users WHERE id = ?",
      [req.user.id],
    );

    const trimmedPhone = phone.trim();
    const existingPhone = String(existingUser?.phone || "").trim();
    const phoneChanged = trimmedPhone !== existingPhone;

    const [updateResult] = await db.query("UPDATE users SET phone=? WHERE id=?", [
      trimmedPhone,
      req.user.id,
    ]);

    if (existingUser && phoneChanged && updateResult?.affectedRows === 1) {
      req.auditRecord = {
        id: req.user.id,
        old: { phone_configured: Boolean(existingPhone) },
        new: {
          phone_changed: true,
          phone_configured: Boolean(trimmedPhone),
          changed_fields: ["phone"],
        },
      };
    }

    res.json({ message: "Phone number updated successfully." });
  } catch (err) {
    console.error("[profile/phone]", err);
    res.status(500).json({ message: "Failed to update phone number." });
  }
};

/* ────────────────────────────────────────
   POST /request-password-change
──────────────────────────────────────── */
exports.requestPasswordChange = async (req, res) => {
  const { current_password } = req.body;
  try {
    // ── FIXED: Switched to .query ──
    const [rows] = await db.query(
      "SELECT password, email FROM users WHERE id=?",
      [req.user.id],
    );
    const u = rows[0];
    const match = await bcrypt.compare(current_password, u.password);
    if (!match)
      return res
        .status(400)
        .json({ message: "Current password is incorrect." });

    const otp = genOtp();
    const expires = new Date(Date.now() + 15 * 60 * 1000);
    // ── FIXED: Switched to .query ──
    await db.query("UPDATE users SET otp_code=?, otp_expires=? WHERE id=?", [
      otp,
      expires,
      req.user.id,
    ]);

    await transporter.sendMail({
      from: `"Spiral Wood Services" <${process.env.MAIL_USER}>`,
      to: u.email,
      subject: "Confirm password change — Spiral Wood",
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
          <h2 style="color:#8B4513">Confirm Password Change</h2>
          <p>Use this OTP to confirm your password change. Valid for 15 minutes.</p>
          <div style="font-size:36px;font-weight:900;letter-spacing:10px;
                      color:#8B4513;background:#fff3e0;padding:20px;
                      border-radius:10px;text-align:center;margin:20px 0">
            ${otp}
          </div>
          <p style="color:#c62828;font-size:13px">
            ⚠ If you didn't request this, secure your account immediately.
          </p>
        </div>
      `,
    });

    res.json({ message: "OTP sent to your email." });
  } catch (err) {
    console.error("[profile/request-password-change]", err);
    res.status(500).json({ message: "Failed." });
  }
};

/* ────────────────────────────────────────
   POST /verify-password-change
──────────────────────────────────────── */
exports.verifyPasswordChange = async (req, res) => {
  const { otp, new_password } = req.body;
  try {
    // ── FIXED: Switched to .query ──
    const [rows] = await db.query(
      "SELECT password, otp_code, otp_expires FROM users WHERE id=?",
      [req.user.id],
    );
    const u = rows[0];
    if (!u || u.otp_code !== otp)
      return res.status(400).json({ message: "Invalid OTP." });
    if (new Date(u.otp_expires) < new Date())
      return res.status(400).json({ message: "OTP has expired." });

    const sameAsCurrent = await bcrypt.compare(new_password, u.password);
    if (sameAsCurrent) {
      return res.status(400).json({
        message: "New password must be different from your current password.",
      });
    }

    const hashed = await bcrypt.hash(new_password, 12);
    // ── FIXED: Switched to .query ──
    const [updateResult] = await db.query(
      "UPDATE users SET password=?, otp_code=NULL, otp_expires=NULL WHERE id=?",
      [hashed, req.user.id],
    );

    if (updateResult?.affectedRows === 1) {
      req.auditRecord = {
        id: req.user.id,
        old: { password_configured: true },
        new: {
          password_credential_updated: true,
          password_configured: true,
          changed_fields: ["password"],
        },
      };
    }

    res.json({ message: "Password changed successfully." });
  } catch (err) {
    console.error("[profile/verify-password-change]", err);
    res.status(500).json({ message: "Failed." });
  }
};
