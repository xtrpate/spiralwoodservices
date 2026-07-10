import { useState } from "react";
import { useNavigate } from "react-router-dom";
import ReCAPTCHA from "react-google-recaptcha";
import "./authpages.css";
import useAuthStore from "../../store/authStore";

export default function ForgotPasswordPage() {
  const { forgotPassword } = useAuthStore();
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [captchaToken, setCaptchaToken] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!captchaToken) {
      setError("Please complete the CAPTCHA verification.");
      return;
    }

    setLoading(true);

    try {
      await forgotPassword(email, captchaToken);
      navigate("/reset-password", {
        state: {
          email,
          message: "We sent a 6-digit password reset code to your email.",
        },
      });
    } catch (err) {
      setError(
        err.response?.data?.message ||
          "Could not process your request. Please try again.",
      );
    } finally {
      setLoading(false);
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
            <h2>Forgot Password</h2>
            <p>Enter your registered email to continue.</p>
          </div>

          <form className="auth-form" onSubmit={handleSubmit}>
            {error && <div className="alert alert-error">{error}</div>}

            <div className="field">
              <label>Email Address</label>
              <div className="field-input-wrap">
                <input
                  type="email"
                  className="no-icon"
                  placeholder=""
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoFocus
                />
              </div>
            </div>

            <div style={{ margin: "14px 0" }} className="recaptcha-wrap">
              <ReCAPTCHA
                sitekey={process.env.REACT_APP_RECAPTCHA_SITE_KEY}
                onChange={(token) => setCaptchaToken(token || "")}
                onExpired={() => setCaptchaToken("")}
              />
            </div>

            <button type="submit" className="btn-auth" disabled={loading || !captchaToken}>
              {loading ? (
                <>
                  <svg className="spinner-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                  </svg>
                  Sending code...
                </>
              ) : (
                "Send Reset Code"
              )}
            </button>
          </form>

          <div className="auth-switch">
            <button type="button" onClick={() => navigate("/login")}>
              Back to Login
            </button>
          </div>

          <div className="auth-switch">
            No account yet?{" "}
            <button type="button" onClick={() => navigate("/register")}>
              Create Account
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}