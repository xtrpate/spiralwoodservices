import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import ReCAPTCHA from "react-google-recaptcha";

import "./authpages.css";
import useAuthStore from "../../store/authStore";

const calcStrength = (pw) => {
  let score = 0;
  if (pw.length >= 8) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  const labels = ["", "Weak", "Fair", "Good", "Strong"];
  const colors = ["", "#e53935", "#fb8c00", "#fdd835", "#43a047"];
  return { score, label: labels[score] || "", color: colors[score] || "" };
};

export default function RegisterPage() {
  const { register, verifyOtp, resendOtp } = useAuthStore();
  const navigate = useNavigate();

  const [step, setStep] = useState("form");
  const [showPw, setShowPw] = useState(false);
  const [showCPw, setShowCPw] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [registeredEmail, setRegisteredEmail] = useState("");
  const [captchaToken, setCaptchaToken] = useState("");

  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [otpError, setOtpError] = useState("");
  const [otpLoading, setOtpLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const otpRefs = useRef([]);

  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    address: "",
    password: "",
    confirm_password: "",
    agreed: false,
  });

  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));
  const strength = calcStrength(form.password);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

  const handleRegister = async (e) => {
    e.preventDefault();
    setError("");

    const nameRegex = /^[a-zA-Z\s\-]+$/;

    if (!nameRegex.test(form.first_name) || !nameRegex.test(form.last_name)){
      return setError("Names must contain only letters")
    }

    if (form.password !== form.confirm_password) {
      return setError("Passwords do not match.");
    }

    if (form.password.length < 8) {
      return setError("Password must be at least 8 characters.");
    }

    if (!form.agreed) {
      return setError("Please agree to the Terms of Service and Privacy Policy to continue.");
    }

    if (!captchaToken) {
      return setError("Please complete the CAPTCHA verification.");
    }

    setLoading(true);
    try {
      await register({
        first_name: form.first_name,
        last_name: form.last_name,
        email: form.email,
        phone: form.phone,
        address: form.address,
        password: form.password,
        recaptcha_token: captchaToken,
      });

      setRegisteredEmail(form.email);
      setResendCooldown(60);
      setStep("otp");
    } catch (err) {
      setError(
        err.response?.data?.message || "Registration failed. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleOtpChange = (index, val) => {
    if (!/^\d*$/.test(val)) return;
    const next = [...otp];
    next[index] = val.slice(-1);
    setOtp(next);
    if (val && index < 5) otpRefs.current[index + 1]?.focus();
  };

  const handleOtpKeyDown = (index, e) => {
    if (e.key === "Backspace" && !otp[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
    if (e.key === "ArrowLeft" && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
    if (e.key === "ArrowRight" && index < 5) {
      otpRefs.current[index + 1]?.focus();
    }
  };

  const handleOtpPaste = (e) => {
    const text = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!text) return;
    const next = text.split("").concat(Array(6).fill("")).slice(0, 6);
    setOtp(next);
    otpRefs.current[Math.min(text.length, 5)]?.focus();
    e.preventDefault();
  };

  const handleVerifyOtp = async () => {
    const code = otp.join("");
    if (code.length < 6) {
      return setOtpError("Please enter all 6 digits.");
    }

    setOtpError("");
    setOtpLoading(true);

    try {
      await verifyOtp(registeredEmail, code);
      setStep("success");
    } catch (err) {
      setOtpError(
        err.response?.data?.message ||
          "Invalid or expired OTP. Please try again.",
      );
    } finally {
      setOtpLoading(false);
    }
  };

  const handleResend = async () => {
    if (resendCooldown > 0) return;

    try {
      await resendOtp(registeredEmail);
      setResendCooldown(60);
      setOtp(["", "", "", "", "", ""]);
      otpRefs.current[0]?.focus();
    } catch (err) {
      setOtpError(
        err.response?.data?.message || "Could not resend OTP right now.",
      );
    }
  };

  if (step === "success") {
    return (
      <div className="auth-root">
        <div className="auth-split">
          <div className="auth-card-panel">
            <button
              type="button"
              className="auth-close"
              onClick={() => navigate("/")}
              aria-label="Close"
            >
              ×
            </button>

            <div className="auth-card-header">
              <h2>Account Ready</h2>
              <p>Your email has been verified successfully.</p>
            </div>

            <div className="auth-switch" style={{ marginTop: 0 }}>
              <strong>{registeredEmail}</strong>
            </div>

            <div className="pending-steps">
              <h4>What happens next?</h4>

              {[
                "Sign in using your email and password.",
                "Browse the product catalog and request appointments.",
                "Track your orders and account activity online.",
              ].map((s, i) => (
                <div className="pending-step" key={i}>
                  <div className="pending-step-num">{i + 1}</div>
                  <span>{s}</span>
                </div>
              ))}
            </div>

            <button
              className="btn-auth"
              style={{ marginTop: 8 }}
              onClick={() => navigate("/login")}
            >
              Go to Login
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (step === "otp") {
    return (
      <div className="auth-root">
        <div className="auth-split">
          <div className="auth-card-panel">
            <button
              type="button"
              className="auth-close"
              onClick={() => navigate("/")}
              aria-label="Close"
            >
              ×
            </button>

            <div className="step-indicator">
              <div className="step-dot done" />
              <div className="step-dot active" />
              <div className="step-dot" />
            </div>

            <div className="auth-card-header">
              <h2>Verify Email</h2>
              <p>
                Enter the 6-digit code sent to
                <br />
                <strong>{registeredEmail}</strong>
              </p>
            </div>

            {otpError && (
              <div className="alert alert-error" style={{ marginBottom: 16 }}>
                {otpError}
              </div>
            )}

            <div className="otp-inputs" onPaste={handleOtpPaste}>
              {otp.map((digit, i) => (
                <input
                  key={i}
                  ref={(el) => (otpRefs.current[i] = el)}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  onChange={(e) => handleOtpChange(i, e.target.value)}
                  onKeyDown={(e) => handleOtpKeyDown(i, e)}
                  autoFocus={i === 0}
                />
              ))}
            </div>

            <button
              className="btn-auth"
              onClick={handleVerifyOtp}
              disabled={otpLoading || otp.join("").length < 6}
            >
              {otpLoading ? (
                <>
                  <svg className="spinner-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                  </svg>
                  Verifying...
                </>
              ) : (
                "Verify Email"
              )}
            </button>

            <div className="otp-resend">
              {resendCooldown > 0 ? (
                <span>
                  Resend code in <strong>{resendCooldown}s</strong>
                </span>
              ) : (
                <>
                  Didn't receive it?{" "}
                  <button type="button" onClick={handleResend}>
                    Resend Code
                  </button>
                </>
              )}
            </div>

            <div className="auth-switch">
              <button
                type="button"
                onClick={() => {
                  setStep("form");
                  setOtp(["", "", "", "", "", ""]);
                  setOtpError("");
                }}
              >
                Back to Registration
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-root">
      <div className="auth-split">
        <div className="auth-card-panel">
          <button
            type="button"
            className="auth-close"
            onClick={() => navigate("/")}
            aria-label="Close"
          >
            ×
          </button>

          <div className="auth-card-header">
            <h2>Create Account</h2>
            <p>Fill in your details to get started.</p>
          </div>

          <div className="step-indicator">
            <div className="step-dot active" />
            <div className="step-dot" />
            <div className="step-dot" />
          </div>

          <div className="auth-tabs">
            <button
              className="auth-tab"
              type="button"
              onClick={() => navigate("/login")}
            >
              Sign In
            </button>
            <button className="auth-tab active" type="button">
              Create Account
            </button>
          </div>

          <form className="auth-form" onSubmit={handleRegister}>
            {error && <div className="alert alert-error">{error}</div>}

            <div className="form-row">
              <div className="field">
                <label>First Name *</label>
                <div className="field-input-wrap">
                  <input
                    type="text"
                    className="no-icon"
                    value={form.first_name}
                    onChange={(e) => set("first_name", e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="field">
                <label>Last Name *</label>
                <div className="field-input-wrap">
                  <input
                    type="text"
                    className="no-icon"
                    value={form.last_name}
                    onChange={(e) => set("last_name", e.target.value)}
                    required
                  />
                </div>
              </div>
            </div>

            <div className="field">
              <label>Email Address *</label>
              <div className="field-input-wrap">
                <input
                  type="email"
                  className="no-icon"
                  value={form.email}
                  onChange={(e) => set("email", e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="field">
              <label>Phone Number *</label>
              <div className="field-input-wrap">
                <input
                  type="tel"
                  className="no-icon"
                  value={form.phone}
                  onChange={(e) => set("phone", e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="field">
              <label>Home Address *</label>
              <div className="field-input-wrap">
                <input
                  type="text"
                  className="no-icon"
                  value={form.address}
                  onChange={(e) => set("address", e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="field">
              <label>Password *</label>
              <div className="field-input-wrap">
                <input
                  type={showPw ? "text" : "password"}
                  className="no-icon"
                  value={form.password}
                  onChange={(e) => set("password", e.target.value)}
                  required
                  style={{ paddingRight: 70 }}
                />
                <button
                  type="button"
                  className="pw-toggle"
                  onClick={() => setShowPw((prev) => !prev)}
                >
                  {showPw ? "Hide" : "Show"}
                </button>
              </div>

              {form.password && (
                <div className="pw-strength">
                  <div className="pw-strength-bar">
                    <div
                      className="pw-strength-fill"
                      style={{
                        width: `${(strength.score / 4) * 100}%`,
                        background: strength.color,
                      }}
                    />
                  </div>
                  <span
                    className="pw-strength-label"
                    style={{ color: strength.color }}
                  >
                    {strength.label}
                  </span>
                </div>
              )}
            </div>

            <div className="field">
              <label>Confirm Password *</label>
              <div className="field-input-wrap">
                <input
                  type={showCPw ? "text" : "password"}
                  className="no-icon"
                  value={form.confirm_password}
                  onChange={(e) => set("confirm_password", e.target.value)}
                  required
                  style={{ paddingRight: 70 }}
                />
                <button
                  type="button"
                  className="pw-toggle"
                  onClick={() => setShowCPw((prev) => !prev)}
                >
                  {showCPw ? "Hide" : "Show"}
                </button>
              </div>

              {form.confirm_password && (
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color:
                      form.password === form.confirm_password
                        ? "var(--auth-success)"
                        : "var(--auth-error)",
                    marginTop: 4,
                  }}
                >
                  {form.password === form.confirm_password
                    ? "Passwords match"
                    : "Passwords do not match"}
                </div>
              )}
            </div>

            <div className="terms-check">
              <input
                type="checkbox"
                id="terms"
                checked={form.agreed}
                onChange={(e) => set("agreed", e.target.checked)}
              />
              <label htmlFor="terms">
                I agree to the{" "}
                <a href="/terms" target="_blank" rel="noreferrer">
                  Terms of Service
                </a>{" "}
                and{" "}
                <a href="/privacy" target="_blank" rel="noreferrer">
                  Privacy Policy
                </a>
                . I understand I need to verify my email before I can log in.
              </label>
            </div>

            <div style={{ margin: "14px 0" }}>
              <ReCAPTCHA
                sitekey={process.env.REACT_APP_RECAPTCHA_SITE_KEY}
                onChange={(token) => setCaptchaToken(token || "")}
                onExpired={() => setCaptchaToken("")}
              />
            </div>

            <button
              type="submit"
              className={`btn-auth ${!form.agreed || !captchaToken || loading ? "btn-auth-disabled" : ""}`}
              disabled={loading || !form.agreed || !captchaToken}
              title={!form.agreed ? "Please agree to the Terms of Service and Privacy Policy first." : ""}
            >
              {loading ? (
                <>
                  <svg className="spinner-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                  </svg>
                  Creating account...
                </>
              ) : (
                "Create Account"
              )}
            </button>
          </form>

          <div className="auth-switch">
            Already have an account?{" "}
            <button type="button" onClick={() => navigate("/login")}>
              Sign in
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}