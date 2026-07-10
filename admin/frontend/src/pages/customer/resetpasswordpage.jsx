import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Mail, Lock, KeyRound } from "lucide-react";
import "./authpages.css";
import useAuthStore from "../../store/authStore";

export default function ResetPasswordPage() {
  const { forgotPassword, resetPassword } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState(location.state?.email || "");
  const [otp, setOtp] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [showCPw, setShowCPw] = useState(false);
  const [info, setInfo] = useState(location.state?.message || "");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);

  useEffect(() => {
    if (location.state?.message) {
      setInfo(location.state.message);
    }
  }, [location.state]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setInfo("");

    if (otp.trim().length !== 6) {
      setError("Please enter the 6-digit reset code.");
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);

    try {
      await resetPassword(email, otp, password);
      navigate("/login", {
        state: {
          message: "Password reset successful. You can now sign in.",
        },
      });
    } catch (err) {
      setError(
        err.response?.data?.message ||
          "Could not reset your password. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (!email) {
      setError("Please enter your email first.");
      return;
    }

    setError("");
    setInfo("");
    setResending(true);

    try {
      await forgotPassword(email);
      setInfo("A new reset code has been sent to your email.");
    } catch (err) {
      setError(
        err.response?.data?.message || "Could not resend the reset code.",
      );
    } finally {
      setResending(false);
    }
  };

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
            <h2>Reset Password</h2>
            <p>Complete the fields below to update your password.</p>
          </div>

          <form className="auth-form" onSubmit={handleSubmit}>
            {error && <div className="alert alert-error">{error}</div>}
            {info && <div className="alert alert-success">{info}</div>}

            <div className="field">
              <label>Email Address</label>
              <div className="field-input-wrap">
                <Mail size={15} />
                <input
                  type="email"
                  placeholder=""
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="field">
              <label>Reset Code</label>
              <div className="field-input-wrap">
                <KeyRound size={15} />
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="6-digit code"
                  value={otp}
                  onChange={(e) =>
                    setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))
                  }
                  required
                />
              </div>
            </div>

            <div className="field">
              <label>New Password</label>
              <div className="field-input-wrap" style={{ position: "relative" }}>
                <Lock size={15} />
                <input
                  type={showPw ? "text" : "password"}
                  placeholder="Minimum 8 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  style={{ paddingRight: 76 }}
                />
                <button
                  type="button"
                  onClick={() => setShowPw((prev) => !prev)}
                  aria-label={showPw ? "Hide password" : "Show password"}
                  title={showPw ? "Hide password" : "Show password"}
                  style={{
                    position: "absolute",
                    right: 14,
                    top: "50%",
                    transform: "translateY(-50%)",
                    border: "none",
                    background: "transparent",
                    cursor: "pointer",
                    padding: 0,
                    color: "#8b8b8b",
                    fontSize: "14px",
                    fontWeight: 500,
                  }}
                >
                  {showPw ? "Hide" : "Show"}
                </button>
              </div>
            </div>

            <div className="field">
              <label>Confirm New Password</label>
              <div className="field-input-wrap" style={{ position: "relative" }}>
                <Lock size={15} />
                <input
                  type={showCPw ? "text" : "password"}
                  placeholder="Repeat your new password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  style={{ paddingRight: 76 }}
                />
                <button
                  type="button"
                  onClick={() => setShowCPw((prev) => !prev)}
                  aria-label={showCPw ? "Hide password" : "Show password"}
                  title={showCPw ? "Hide password" : "Show password"}
                  style={{
                    position: "absolute",
                    right: 14,
                    top: "50%",
                    transform: "translateY(-50%)",
                    border: "none",
                    background: "transparent",
                    cursor: "pointer",
                    padding: 0,
                    color: "#8b8b8b",
                    fontSize: "14px",
                    fontWeight: 500,
                  }}
                >
                  {showCPw ? "Hide" : "Show"}
                </button>
              </div>
            </div>

            <button type="submit" className="btn-auth" disabled={loading}>
              {loading ? (
                <>
                  <svg className="spinner-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                  </svg>
                  Resetting password...
                </>
              ) : (
                "Reset Password"
              )}
            </button>
          </form>

          <div
            className="auth-switch"
            style={{ display: "flex", gap: 14, flexWrap: "wrap" }}
          >
            <button onClick={handleResend} disabled={resending}>
              {resending ? "Sending again..." : "Send another code"}
            </button>
            <button onClick={() => navigate("/login")}>Back to Login</button>
          </div>
        </div>
      </div>
    </div>
  );
}