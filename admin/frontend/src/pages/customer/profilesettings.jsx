import { useState, useRef, useEffect } from "react";
// 👉 FIX: Removed raw axios, imported your authenticated api
import api from "../../services/api";
import {
  User,
  Mail,
  Phone,
  Lock,
  Camera,
  Check,
  Pencil,
  Eye,
  EyeOff,
  ShieldCheck,
  MapPin,
} from "lucide-react";
import "./profile.css";
import useAuthStore from "../../store/authStore";
import LocationPicker from "../../components/LocationPicker";

/* ── Password strength helper ── */
const getStrength = (pw) => {
  if (!pw) return { score: 0, label: "" };
  let score = 0;
  if (pw.length >= 8) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  const labels = ["", "Weak", "Fair", "Good", "Strong"];
  return { score, label: labels[score] };
};

const StrengthBar = ({ password }) => {
  const { score, label } = getStrength(password);
  const colors = ["", "weak", "fair", "good", "strong"];
  return (
    <div className="password-strength">
      {[1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className={`strength-bar ${score >= i ? `filled-${colors[score]}` : ""}`}
        />
      ))}
      <span className="strength-label">{label}</span>
    </div>
  );
};

/* ── Alert ── */
const Alert = ({ type, msg }) =>
  msg ? (
    <div className={`alert alert-${type}`} style={{ marginBottom: 14 }}>
      {msg}
    </div>
  ) : null;

export default function ProfileSettings() {
  const { user, setUser } = useAuthStore();
  const fileRef = useRef(null);

  /* ─ State ─ */
  const backendUrl = "https://wisdom-ov31.onrender.com";

  const [avatarPreview, setAvatarPreview] = useState(
    user?.profile_photo
      ? `${backendUrl}/uploads/avatars/${user.profile_photo}`
      : null,
  );
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarMsg, setAvatarMsg] = useState({ type: "", text: "" });
  const [avatarLoading, setAvatarLoading] = useState(false);

  /* Basic info — Name (independent of address) */
  const [editName, setEditName] = useState(false);
  const [nameForm, setNameForm] = useState({ name: user?.name || "" });
  const [nameMsg, setNameMsg] = useState({ type: "", text: "" });
  const [nameLoading, setNameLoading] = useState(false);

  /* Default Delivery Address (independent of name) */
  const [editAddress, setEditAddress] = useState(false);
  const [addressForm, setAddressForm] = useState({
    address: user?.address || "",
    address_lat: user?.address_lat ?? null,
    address_lng: user?.address_lng ?? null,
  });
  const [addressMsg, setAddressMsg] = useState({ type: "", text: "" });
  const [addressLoading, setAddressLoading] = useState(false);

  /* Email change */
  const [editEmail, setEditEmail] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [emailOtp, setEmailOtp] = useState("");
  const [emailStep, setEmailStep] = useState(1);
  const [emailMsg, setEmailMsg] = useState({ type: "", text: "" });
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailCooldown, setEmailCooldown] = useState(0);

  /* Phone change (Simplified - No OTP) */
  const [editPhone, setEditPhone] = useState(false);
  const [newPhone, setNewPhone] = useState(user?.phone || "");
  const [phoneMsg, setPhoneMsg] = useState({ type: "", text: "" });
  const [phoneLoading, setPhoneLoading] = useState(false);
  const [showPhone, setShowPhone] = useState(false);

  /* Password change */
  const [editPass, setEditPass] = useState(false);
  const [passForm, setPassForm] = useState({
    current: "",
    newPass: "",
    confirm: "",
  });
  const [passOtp, setPassOtp] = useState("");
  const [passStep, setPassStep] = useState(1);
  const [passMsg, setPassMsg] = useState({ type: "", text: "" });
  const [passLoading, setPassLoading] = useState(false);
  const [showPass, setShowPass] = useState({
    current: false,
    newPass: false,
    confirm: false,
  });
  const [passCooldown, setPassCooldown] = useState(0);

  /* Cooldown timer */
  useEffect(() => {
    const timers = [];
    if (emailCooldown > 0)
      timers.push(setTimeout(() => setEmailCooldown((c) => c - 1), 1000));
    if (passCooldown > 0)
      timers.push(setTimeout(() => setPassCooldown((c) => c - 1), 1000));
    return () => timers.forEach(clearTimeout);
  }, [emailCooldown, passCooldown]);

  /* ════ AVATAR ════ */
  const handleAvatarChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setAvatarFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setAvatarPreview(ev.target.result);
    reader.readAsDataURL(file);
  };

  const saveAvatar = async () => {
    if (!avatarFile) return;
    setAvatarLoading(true);
    setAvatarMsg({ type: "", text: "" });

    try {
      const fd = new FormData();
      fd.append("avatar", avatarFile);

      // set it correctly with the required multi-part boundary!
      const res = await api.post("/customer/profile/avatar", fd);

      if (user) {
        setUser({ ...user, profile_photo: res.data.profile_photo });
      }

      setAvatarMsg({ type: "success", text: "Profile picture updated!" });
      setAvatarFile(null);
    } catch (err) {
      console.error("FRONTEND CRASH LOG:", err);

      setAvatarMsg({
        type: "error",
        text:
          err.response?.data?.message ||
          "Upload failed. Check browser console.",
      });
    } finally {
      setAvatarLoading(false);
    }
  };

  /* ════ NAME ════ */
  const saveName = async () => {
    const trimmedName = (nameForm.name || "").trim();
    if (!trimmedName) {
      setNameMsg({ type: "error", text: "Name is required." });
      return;
    }

    setNameLoading(true);
    setNameMsg({ type: "", text: "" });
    try {
      await api.put("/customer/profile/basic", {
        name: trimmedName,
        address: user?.address || "",
        address_lat: user?.address_lat ?? null,
        address_lng: user?.address_lng ?? null,
      });
      setUser((prev) => ({ ...prev, name: trimmedName }));
      setNameMsg({ type: "success", text: "Profile updated successfully!" });
      setEditName(false);
    } catch (err) {
      setNameMsg({
        type: "error",
        text: err.response?.data?.message || "Update failed.",
      });
    } finally {
      setNameLoading(false);
    }
  };

  /* ════ DEFAULT DELIVERY ADDRESS ════ */
  const saveDefaultAddress = async () => {
    const trimmedAddress = (addressForm.address || "").trim();
    const hasLat =
      addressForm.address_lat !== null &&
      addressForm.address_lat !== undefined &&
      addressForm.address_lat !== "";
    const hasLng =
      addressForm.address_lng !== null &&
      addressForm.address_lng !== undefined &&
      addressForm.address_lng !== "";

    if (!trimmedAddress) {
      setAddressMsg({ type: "error", text: "Address is required." });
      return;
    }
    if (hasLat !== hasLng) {
      setAddressMsg({
        type: "error",
        text: "Both latitude and longitude must be set together.",
      });
      return;
    }
    if (!hasLat || !hasLng) {
      setAddressMsg({
        type: "error",
        text: "Please set a map pin for your default delivery address.",
      });
      return;
    }
    const latNum = Number(addressForm.address_lat);
    const lngNum = Number(addressForm.address_lng);
    if (!Number.isFinite(latNum) || !Number.isFinite(lngNum)) {
      setAddressMsg({
        type: "error",
        text: "Invalid map pin. Please set the pin again.",
      });
      return;
    }
    if (latNum < -90 || latNum > 90 || lngNum < -180 || lngNum > 180) {
      setAddressMsg({
        type: "error",
        text: "Invalid map pin coordinates. Please set the pin again.",
      });
      return;
    }

    setAddressLoading(true);
    setAddressMsg({ type: "", text: "" });
    try {
      await api.put("/customer/profile/basic", {
        name: user?.name || "",
        address: trimmedAddress,
        address_lat: latNum,
        address_lng: lngNum,
      });
      setUser((prev) => ({
        ...prev,
        address: trimmedAddress,
        address_lat: latNum,
        address_lng: lngNum,
      }));
      setAddressMsg({
        type: "success",
        text: "Default delivery address saved!",
      });
      setEditAddress(false);
    } catch (err) {
      setAddressMsg({
        type: "error",
        text: err.response?.data?.message || "Update failed.",
      });
    } finally {
      setAddressLoading(false);
    }
  };

  /* ════ EMAIL CHANGE ════ */
  const sendEmailOtp = async () => {
    if (!newEmail.trim())
      return setEmailMsg({ type: "error", text: "Enter a new email address." });
    setEmailLoading(true);
    setEmailMsg({ type: "", text: "" });
    try {
      await api.post("/customer/profile/request-email-change", {
        new_email: newEmail,
      });
      setEmailStep(2);
      setEmailCooldown(60);
      setEmailMsg({ type: "success", text: `OTP sent to ${newEmail}` });
    } catch (err) {
      setEmailMsg({
        type: "error",
        text: err.response?.data?.message || "Failed to send OTP.",
      });
    } finally {
      setEmailLoading(false);
    }
  };

  const verifyEmailOtp = async () => {
    if (!emailOtp.trim())
      return setEmailMsg({ type: "error", text: "Enter the OTP." });
    setEmailLoading(true);
    try {
      await api.post("/customer/profile/verify-email-change", {
        otp: emailOtp,
      });
      setUser((prev) => ({ ...prev, email: newEmail }));
      setEmailMsg({ type: "success", text: "Email updated successfully!" });
      setEditEmail(false);
      setEmailStep(1);
      setNewEmail("");
      setEmailOtp("");
    } catch (err) {
      setEmailMsg({
        type: "error",
        text: err.response?.data?.message || "Invalid OTP.",
      });
    } finally {
      setEmailLoading(false);
    }
  };

  /* ════ PHONE CHANGE (Simplified) ════ */
  const savePhone = async () => {
    if (!newPhone.trim())
      return setPhoneMsg({ type: "error", text: "Enter a phone number." });

    if (newPhone.length !== 11) {
      return setPhoneMsg({ type: "error", text: "Phone number must be exactly 11 digits." });
    }
    if (!newPhone.startsWith("09")) {
      return setPhoneMsg({ type: "error", text: "Phone number must start with '09'." });
    }

    setPhoneLoading(true);
    setPhoneMsg({ type: "", text: "" });
    try {
      await api.put("/customer/profile/phone", { phone: newPhone });
      setUser((prev) => ({ ...prev, phone: newPhone }));
      setPhoneMsg({ type: "success", text: "Phone number updated!" });
      setEditPhone(false);
      setShowPhone(false); 
    } catch (err) {
      setPhoneMsg({
        type: "error",
        text: err.response?.data?.message || "Update failed.",
      });
    } finally {
      setPhoneLoading(false);
    }
  };

  /* ════ PASSWORD CHANGE ════ */
  const requestPassOtp = async () => {
    // STEP 1: Only check current password to trigger the email
    if (!passForm.current)
      return setPassMsg({
        type: "error",
        text: "Enter your current password to continue.",
      });

    setPassLoading(true);
    setPassMsg({ type: "", text: "" });
    try {
      await api.post("/customer/profile/request-password-change", {
        current_password: passForm.current,
      });
      setPassStep(2); // Move to OTP and New Password screen
      setPassCooldown(60);
      setPassMsg({
        type: "success",
        text: `Verification OTP sent to ${user?.email}`,
      });
    } catch (err) {
      setPassMsg({
        type: "error",
        text: err.response?.data?.message || "Failed to send OTP.",
      });
    } finally {
      setPassLoading(false);
    }
  };

  const verifyPassOtp = async () => {
    // STEP 2: Check everything else before sending to backend
    if (!passOtp.trim())
      return setPassMsg({
        type: "error",
        text: "Enter the OTP from your email.",
      });
    if (!passForm.newPass)
      return setPassMsg({ type: "error", text: "Enter a new password." });
    if (passForm.newPass !== passForm.confirm)
      return setPassMsg({ type: "error", text: "New passwords do not match." });
    if (getStrength(passForm.newPass).score < 2)
      return setPassMsg({ type: "error", text: "Password is too weak." });

    setPassLoading(true);
    try {
      await api.post("/customer/profile/verify-password-change", {
        otp: passOtp,
        new_password: passForm.newPass,
      });
      setPassMsg({ type: "success", text: "Password changed successfully!" });
      setEditPass(false);
      setPassStep(1);
      setPassForm({ current: "", newPass: "", confirm: "" });
      setPassOtp("");
    } catch (err) {
      setPassMsg({
        type: "error",
        text: err.response?.data?.message || "Invalid OTP or request failed.",
      });
    } finally {
      setPassLoading(false);
    }
  };

  /* ── helper ── */
  const cancelSection = (section) => {
    if (section === "email") {
      setEditEmail(false);
      setEmailStep(1);
      setNewEmail("");
      setEmailOtp("");
      setEmailMsg({ type: "", text: "" });
    }
    if (section === "phone") {
      setEditPhone(false);
      setNewPhone(user?.phone || "");
      setPhoneMsg({ type: "", text: "" });
    }
    if (section === "pass") {
      setEditPass(false);
      setPassStep(1);
      setPassForm({ current: "", newPass: "", confirm: "" });
      setPassOtp("");
      setPassMsg({ type: "", text: "" });
    }
  };

  const initials = user?.name?.charAt(0).toUpperCase() || "?";

  return (
    <div>
      <div className="page-hero">
        <h1>Profile Settings</h1>
        <p>Manage your account information and security</p>
      </div>

      <div className="profile-layout">
        <div className="profile-content">
          {/* ══ AVATAR ══ */}
          <div className="profile-section">
            <div className="profile-section-header">
              <h3>
                <Camera size={16} /> Profile Picture
              </h3>
            </div>
            <div className="profile-section-body">
              <Alert type={avatarMsg.type} msg={avatarMsg.text} />
              <div className="avatar-upload-area">
                <div className="avatar-preview">
                  {avatarPreview ? (
                    <img
                      src={avatarPreview}
                      alt="preview"
                      onError={() => setAvatarPreview(null)}
                    />
                  ) : (
                    initials
                  )}
                </div>
                <div className="avatar-upload-info">
                  <p>
                    Upload a photo to personalize your account. JPG or PNG, max
                    2MB.
                  </p>
                  <button
                    className="avatar-upload-btn"
                    onClick={() => fileRef.current?.click()}
                  >
                    <Camera size={14} /> Choose Photo
                  </button>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    style={{ display: "none" }}
                    onChange={handleAvatarChange}
                  />
                </div>
              </div>
              {avatarFile && (
                <div className="profile-form-actions" style={{ marginTop: 16 }}>
                  <button
                    className="btn btn-primary"
                    onClick={saveAvatar}
                    disabled={avatarLoading}
                  >
                    {avatarLoading ? "Uploading…" : "✓ Save Photo"}
                  </button>
                  <button
                    className="btn btn-secondary"
                    onClick={() => {
                      setAvatarFile(null);
                      setAvatarPreview(
                        user?.profile_photo
                          ? `${backendUrl}/uploads/avatars/${user.profile_photo}`
                          : null,
                      );
                    }}
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* ══ BASIC INFO (Name) ══ */}
          <div className="profile-section">
            <div className="profile-section-header">
              <h3>
                <User size={16} /> Basic Information
              </h3>
              {!editName && (
                <button
                  className="edit-toggle"
                  onClick={() => setEditName(true)}
                >
                  <Pencil size={13} /> Edit
                </button>
              )}
            </div>
            <div className="profile-section-body">
              <Alert type={nameMsg.type} msg={nameMsg.text} />
              {editName ? (
                <div className="profile-form">
                  <div className="form-row">
                    <div className="form-field">
                      <label>Full Name</label>
                      <input
                        type="text"
                        value={nameForm.name}
                        onChange={(e) =>
                          setNameForm({ name: e.target.value })
                        }
                        placeholder="Your full name"
                      />
                    </div>
                  </div>
                  <div className="profile-form-actions">
                    <button
                      className="btn btn-primary"
                      onClick={saveName}
                      disabled={nameLoading}
                    >
                      {nameLoading ? (
                        "Saving…"
                      ) : (
                        <>
                          <Check size={14} /> Save Changes
                        </>
                      )}
                    </button>
                    <button
                      className="btn btn-secondary"
                      onClick={() => {
                        setEditName(false);
                        setNameForm({ name: user?.name || "" });
                        setNameMsg({ type: "", text: "" });
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="field-display">
                  <div className="field-row">
                    <label>Full Name</label>
                    <span className="field-val">
                      {user?.name || (
                        <span className="field-empty">Not set</span>
                      )}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ══ DEFAULT DELIVERY ADDRESS ══ */}
          <div className="profile-section">
            <div className="profile-section-header">
              <h3>
                <MapPin size={16} /> Default Delivery Address
              </h3>
              {!editAddress && (
                <button
                  className="edit-toggle"
                  onClick={() => setEditAddress(true)}
                >
                  <Pencil size={13} /> Edit
                </button>
              )}
            </div>
            <div className="profile-section-body">
              <Alert type={addressMsg.type} msg={addressMsg.text} />
              {editAddress ? (
                <div className="profile-form">
                  <p
                    style={{
                      fontSize: "13px",
                      color: "#52525b",
                      marginBottom: "16px",
                    }}
                  >
                    This address and map pin will be used as your default
                    delivery address during checkout.
                  </p>
                  <div className="form-field full">
                    <LocationPicker
                      label="Address"
                      addressValue={addressForm.address}
                      onAddressChange={(text) =>
                        setAddressForm((p) => ({ ...p, address: text }))
                      }
                      value={
                        addressForm.address_lat != null &&
                        addressForm.address_lng != null
                          ? {
                              lat: Number(addressForm.address_lat),
                              lng: Number(addressForm.address_lng),
                            }
                          : null
                      }
                      onChange={(latlng) =>
                        setAddressForm((p) => ({
                          ...p,
                          address_lat: latlng?.lat ?? null,
                          address_lng: latlng?.lng ?? null,
                        }))
                      }
                    />
                  </div>
                  <div className="profile-form-actions">
                    <button
                      className="btn btn-primary"
                      onClick={saveDefaultAddress}
                      disabled={addressLoading}
                    >
                      {addressLoading ? (
                        "Saving…"
                      ) : (
                        <>
                          <Check size={14} /> Set as Default Delivery Address
                        </>
                      )}
                    </button>
                    <button
                      className="btn btn-secondary"
                      onClick={() => {
                        setEditAddress(false);
                        setAddressForm({
                          address: user?.address || "",
                          address_lat: user?.address_lat ?? null,
                          address_lng: user?.address_lng ?? null,
                        });
                        setAddressMsg({ type: "", text: "" });
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="field-display">
                  <div className="field-row">
                    <label>Address</label>
                    <span
                      className={user?.address ? "field-val" : "field-empty"}
                    >
                      {user?.address || "Not set"}
                    </span>
                  </div>
                  <div className="field-row">
                    <label>Default Pin</label>
                    <span
                      className={
                        user?.address_lat != null && user?.address_lng != null
                          ? "field-val"
                          : "field-empty"
                      }
                    >
                      {user?.address_lat != null && user?.address_lng != null
                        ? `📍 ${Number(user.address_lat).toFixed(5)}, ${Number(user.address_lng).toFixed(5)}`
                        : "Not set"}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ══ EMAIL ══ */}
          <div className="profile-section">
            <div className="profile-section-header">
              <h3>
                <Mail size={16} /> Email Address
              </h3>
              {!editEmail && (
                <button
                  className="edit-toggle"
                  onClick={() => setEditEmail(true)}
                >
                  <Pencil size={13} /> Change
                </button>
              )}
            </div>
            <div className="profile-section-body">
              <Alert type={emailMsg.type} msg={emailMsg.text} />
              {!editEmail ? (
                <div className="field-display">
                  <div className="field-row">
                    <label>Current Email</label>
                    <span className="field-val">{user?.email}</span>
                  </div>
                </div>
              ) : emailStep === 1 ? (
                <div className="profile-form">
                  <div className="form-field">
                    <label>Current Email</label>
                    <input type="email" value={user?.email} disabled />
                  </div>
                  <div className="form-field">
                    <label>New Email Address</label>
                    <input
                      type="email"
                      value={newEmail}
                      onChange={(e) => setNewEmail(e.target.value)}
                      placeholder="newemail@example.com"
                    />
                  </div>
                  <div className="profile-form-actions">
                    <button
                      className="btn btn-primary"
                      onClick={sendEmailOtp}
                      disabled={emailLoading}
                    >
                      {emailLoading ? "Sending…" : "Send Verification OTP"}
                    </button>
                    <button
                      className="btn btn-secondary"
                      onClick={() => cancelSection("email")}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="verify-step">
                  <h4>📧 Verify your new email</h4>
                  <p>
                    We sent a 6-digit OTP to <strong>{newEmail}</strong>. Enter
                    it below to confirm.
                  </p>
                  <div className="otp-input-row">
                    <input
                      type="text"
                      maxLength={6}
                      placeholder="000000"
                      value={emailOtp}
                      onChange={(e) =>
                        setEmailOtp(e.target.value.replace(/\D/g, ""))
                      }
                    />
                    <button
                      className="resend-btn"
                      onClick={() => {
                        setEmailCooldown(60);
                        sendEmailOtp();
                      }}
                      disabled={emailCooldown > 0}
                    >
                      {emailCooldown > 0
                        ? `Resend (${emailCooldown}s)`
                        : "Resend"}
                    </button>
                  </div>
                  <div
                    className="profile-form-actions"
                    style={{ marginTop: 14 }}
                  >
                    <button
                      className="btn btn-primary"
                      onClick={verifyEmailOtp}
                      disabled={emailLoading}
                    >
                      {emailLoading ? (
                        "Verifying…"
                      ) : (
                        <>
                          <ShieldCheck size={14} /> Verify & Save
                        </>
                      )}
                    </button>
                    <button
                      className="btn btn-secondary"
                      onClick={() => cancelSection("email")}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ══ PHONE ══ */}
          <div className="profile-section">
            <div className="profile-section-header">
              <h3>
                <Phone size={16} /> Phone Number
              </h3>
              {!editPhone && (
                <button
                  className="edit-toggle"
                  onClick={() => setEditPhone(true)}
                >
                  <Pencil size={13} /> Edit
                </button>
              )}
            </div>
            <div className="profile-section-body">
              <Alert type={phoneMsg.type} msg={phoneMsg.text} />
              {!editPhone ? (
                <div className="field-display">
                  <div className="field-row">
                    <label>Current Phone</label>
                    <span className={user?.phone ? "field-val" : "field-empty"}>
                      {user?.phone 
                        ? `*********${user.phone.slice(-2)}` 
                        : "Not set"}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="profile-form">
                  <div className="form-field">
                    <label>Phone Number</label>
                    <div style={{ position: "relative" }}>
                      <input
                        type="text"
                        value={
                          showPhone 
                            ? newPhone 
                            : (newPhone.length > 2 ? "•".repeat(newPhone.length - 2) + newPhone.slice(-2) : newPhone)
                        }
                        placeholder="09XXXXXXXXX"
                        style={{ 
                          width: "100%", 
                          paddingRight: 50,
                          letterSpacing: showPhone ? "normal" : "2px" 
                        }}
                        onChange={(e) => {
                          if (!showPhone) {
                            setShowPhone(true);
                            return; 
                          }

                          let val = e.target.value.replace(/\D/g, "");
                          if (val.length > 0 && val[0] !== "0") val = "0" + val;
                          if (val.length > 1 && val[1] !== "9") val = "09" + val.slice(2);
                          if (val.length > 11) val = val.slice(0, 11);
                          setNewPhone(val);
                        }}
                      />
                      
                      <button
                        type="button"
                        onClick={() => setShowPhone(!showPhone)}
                        style={{
                          position: "absolute",
                          right: 10,
                          top: "50%",
                          transform: "translateY(-50%)",
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          color: "#aaa",
                          display: "flex",
                          alignItems: "center"
                        }}
                      >
                        {showPhone ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>
                  
                  <div className="profile-form-actions">
                    <button className="btn btn-primary" onClick={savePhone} disabled={phoneLoading}>
                      {phoneLoading ? "Saving…" : "Save Changes"}
                    </button>
                    <button className="btn btn-secondary" onClick={() => cancelSection("phone")}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ══ PASSWORD ══ */}
          <div className="profile-section">
            <div className="profile-section-header">
              <h3>
                <Lock size={16} /> Change Password
              </h3>
              {!editPass && (
                <button
                  className="edit-toggle"
                  onClick={() => setEditPass(true)}
                >
                  <Pencil size={13} /> Change
                </button>
              )}
            </div>
            <div className="profile-section-body">
              <Alert type={passMsg.type} msg={passMsg.text} />
              {!editPass ? (
                <div className="field-display">
                  <div className="field-row">
                    <label>Password</label>
                    <span className="field-val">••••••••••</span>
                  </div>
                </div>
              ) : passStep === 1 ? (
                <div className="profile-form">
                  <p
                    style={{
                      fontSize: "13px",
                      color: "#52525b",
                      marginBottom: "16px",
                    }}
                  >
                    For your security, please enter your current password to
                    receive a verification code.
                  </p>
                  <div className="form-field">
                    <label>Current Password</label>
                    <div style={{ position: "relative" }}>
                      <input
                        type={showPass.current ? "text" : "password"}
                        placeholder="Enter current password"
                        value={passForm.current}
                        onChange={(e) =>
                          setPassForm((p) => ({
                            ...p,
                            current: e.target.value,
                          }))
                        }
                        style={{ width: "100%", paddingRight: 40 }}
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setShowPass((p) => ({ ...p, current: !p.current }))
                        }
                        style={{
                          position: "absolute",
                          right: 10,
                          top: "50%",
                          transform: "translateY(-50%)",
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          color: "#aaa",
                        }}
                      >
                        {showPass.current ? (
                          <EyeOff size={16} />
                        ) : (
                          <Eye size={16} />
                        )}
                      </button>
                    </div>
                  </div>
                  <div className="profile-form-actions">
                    <button
                      className="btn btn-primary"
                      onClick={requestPassOtp}
                      disabled={passLoading}
                    >
                      {passLoading ? "Sending…" : "Send Verification OTP"}
                    </button>
                    <button
                      className="btn btn-secondary"
                      onClick={() => cancelSection("pass")}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="verify-step">
                  <h4>📧 Verify & Create New Password</h4>
                  <p>
                    We sent a 6-digit OTP to <strong>{user?.email}</strong>.
                    Enter it below along with your new password.
                  </p>

                  <div
                    className="otp-input-row"
                    style={{ marginBottom: "20px" }}
                  >
                    <input
                      type="text"
                      maxLength={6}
                      placeholder="000000"
                      value={passOtp}
                      onChange={(e) =>
                        setPassOtp(e.target.value.replace(/\D/g, ""))
                      }
                    />
                    <button
                      className="resend-btn"
                      onClick={() => {
                        setPassCooldown(60);
                        requestPassOtp();
                      }}
                      disabled={passCooldown > 0}
                    >
                      {passCooldown > 0
                        ? `Resend (${passCooldown}s)`
                        : "Resend"}
                    </button>
                  </div>

                  <div className="profile-form">
                    {[
                      {
                        key: "newPass",
                        label: "New Password",
                        ph: "Enter new password",
                      },
                      {
                        key: "confirm",
                        label: "Confirm New Password",
                        ph: "Repeat new password",
                      },
                    ].map((f) => (
                      <div className="form-field" key={f.key}>
                        <label>{f.label}</label>
                        <div style={{ position: "relative" }}>
                          <input
                            type={showPass[f.key] ? "text" : "password"}
                            placeholder={f.ph}
                            value={passForm[f.key]}
                            onChange={(e) =>
                              setPassForm((p) => ({
                                ...p,
                                [f.key]: e.target.value,
                              }))
                            }
                            style={{ width: "100%", paddingRight: 40 }}
                          />
                          <button
                            type="button"
                            onClick={() =>
                              setShowPass((p) => ({ ...p, [f.key]: !p[f.key] }))
                            }
                            style={{
                              position: "absolute",
                              right: 10,
                              top: "50%",
                              transform: "translateY(-50%)",
                              background: "none",
                              border: "none",
                              cursor: "pointer",
                              color: "#aaa",
                            }}
                          >
                            {showPass[f.key] ? (
                              <EyeOff size={16} />
                            ) : (
                              <Eye size={16} />
                            )}
                          </button>
                        </div>
                        {f.key === "newPass" && passForm.newPass && (
                          <StrengthBar password={passForm.newPass} />
                        )}
                      </div>
                    ))}
                  </div>

                  <div
                    className="profile-form-actions"
                    style={{ marginTop: 14 }}
                  >
                    <button
                      className="btn btn-primary"
                      onClick={verifyPassOtp}
                      disabled={passLoading}
                    >
                      {passLoading ? (
                        "Saving…"
                      ) : (
                        <>
                          <ShieldCheck size={14} /> Save New Password
                        </>
                      )}
                    </button>
                    <button
                      className="btn btn-secondary"
                      onClick={() => cancelSection("pass")}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}