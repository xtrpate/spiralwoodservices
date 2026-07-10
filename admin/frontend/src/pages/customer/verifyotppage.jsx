/**
 * pages/VerifyOtpPage.jsx
 * Standalone page at /verify-otp
 * Used when: user tries to login but email_not_verified
 */
import { useState, useRef, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import "./authpages.css";
import useAuthStore from "../../store/authStore";

export default function VerifyOtpPage() {
  const { verifyOtp, resendOtp } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const isFromLogin = location.state?.fromLogin;

  /* email passed via navigate state or fallback to empty */
  const [email] = useState(location.state?.email || "");
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const otpRefs = useRef([]);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

  const handleOtpChange = (index, val) => {
    if (!/^\d*$/.test(val)) return;
    const next = [...otp];
    next[index] = val.slice(-1);
    setOtp(next);
    if (val && index < 5) otpRefs.current[index + 1]?.focus();
  };

  const handleOtpKeyDown = (index, e) => {
    if (e.key === "Backspace" && !otp[index] && index > 0)
      otpRefs.current[index - 1]?.focus();
    if (e.key === "ArrowLeft" && index > 0) otpRefs.current[index - 1]?.focus();
    if (e.key === "ArrowRight" && index < 5)
      otpRefs.current[index + 1]?.focus();
  };

  const handleOtpPaste = (e) => {
    const text = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!text) return;
    const next = text.split("").concat(Array(6).fill("")).slice(0, 6);
    setOtp(next);
    otpRefs.current[Math.min(text.length, 5)]?.focus();
    e.preventDefault();
  };

  const handleVerify = async () => {
    const code = otp.join("");
    if (code.length < 6) return setError("Please enter all 6 digits.");
    setError("");
    setLoading(true);
    try {
      await verifyOtp(email, code);
      setSuccess("Email verified successfully. You can now sign in.");
      setTimeout(() => navigate("/login"), 1500);
    } catch (err) {
      setError(err.response?.data?.message || "Invalid or expired code.");
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (resendCooldown > 0 || !email) return;
    try {
      await resendOtp(email);
      setResendCooldown(60);
      setOtp(["", "", "", "", "", ""]);
      otpRefs.current[0]?.focus();
    } catch (err) {
      setError(err.response?.data?.message || "Could not resend code.");
    }
  };

  return (
    <div className="auth-root">
      <div className="auth-split">
        <div className="auth-brand-panel">
          <div className="brand-logo">W</div>
          <h1>
            Verify Your
            <br />
            <span>Email</span>
          </h1>
          <p>
            We sent a 6-digit verification code to your email address. Enter it
            below to confirm your identity.
          </p>
        </div>

        <div className="auth-card-panel" style={{ justifyContent: "center" }}>
          <div className="otp-header">
            <div className="otp-icon">📧</div>
            <h2>{isFromLogin ? "Verify to Continue" : "Check Your Email"}</h2>
            <p>
              We sent a 6-digit code to
              <br />
              <strong>{email || "your email address"}</strong>
            </p>
          </div>

          {error && (
            <div className="alert alert-error" style={{ marginBottom: 16 }}>
              {error}
            </div>
          )}
          {success && (
            <div className="alert alert-success" style={{ marginBottom: 16 }}>
              {success}
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
            onClick={handleVerify}
            disabled={loading || otp.join("").length < 6}
          >
            {loading ? (
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

          <div className="otp-resend" style={{ marginTop: 20 }}>
            {resendCooldown > 0 ? (
              <span>
                Resend code in <strong>{resendCooldown}s</strong>
              </span>
            ) : (
              <>
                Didn't receive it?{" "}
                <button onClick={handleResend} disabled={!email}>
                  Resend Code
                </button>
              </>
            )}
          </div>

          <div className="auth-switch" style={{ marginTop: 16 }}>
            <button onClick={() => navigate("/login")}>← Back to Login</button>
          </div>
        </div>
      </div>
    </div>
  );
}
