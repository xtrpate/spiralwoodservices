import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import ReCAPTCHA from "react-google-recaptcha";

import useAuthStore from "../store/authStore";
import "./customer/authpages.css";

const getDefaultRouteForUser = (user) => {
  if (!user) return "/login";
  if (user.role === "admin") return "/admin/dashboard";

  if (user.role === "staff") {
    if (user.staff_type === "delivery_rider") return "/staff/rider-dashboard";
    if (user.staff_type === "cashier") return "/staff/products";
    if (user.staff_type === "indoor") return "/staff/dashboard";
    return "/login";
  }

  return "/catalog";
};

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const login = useAuthStore((state) => state.login);

  const [form, setForm] = useState({
    email: "",
    password: "",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(
    localStorage.getItem("wisdom_remember_me") === "true",
  );
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [captchaToken, setCaptchaToken] = useState("");

  const setField = (key, value) => {
    if (errorMessage) setErrorMessage("");
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMessage("");

    if (!captchaToken) {
      setErrorMessage("Please complete the CAPTCHA verification.");
      return;
    }

    setLoading(true);

    const redirectTo = location.state?.from?.pathname
      ? `${location.state.from.pathname}${location.state.from.search || ""}`
      : location.state?.redirectTo || null;

    try {
      const user = await login(form.email, form.password, rememberMe, captchaToken);
      navigate(redirectTo || getDefaultRouteForUser(user), { replace: true });
    } catch (err) {
      const code = err?.response?.data?.code;
      const emailFromServer = err?.response?.data?.email;

      if (code === "EMAIL_NOT_VERIFIED") {
        navigate("/verify-otp", {
          state: { email: emailFromServer || form.email, fromLogin: true },
        });
        return; 
      }
      setErrorMessage(
        err?.message ||
          err?.response?.data?.message ||
          "Incorrect email or password.",
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
            <h2>SIGN IN</h2>
          </div>

          <form className="auth-form" onSubmit={handleSubmit}>
            <div className="field">
              <label>Username or email address *</label>
              <div className="field-input-wrap">
                <input
                  type="email"
                  className="no-icon"
                  placeholder=""
                  value={form.email}
                  onChange={(e) => setField("email", e.target.value)}
                  required
                  autoFocus
                  autoComplete="email"
                />
              </div>
            </div>

            <div className="field">
              <label>Password *</label>
              <div
                className="field-input-wrap"
                style={{ position: "relative" }}
              >
                <input
                  type={showPassword ? "text" : "password"}
                  className="no-icon"
                  placeholder=""
                  value={form.password}
                  onChange={(e) => setField("password", e.target.value)}
                  required
                  autoComplete="current-password"
                  style={{ paddingRight: "76px" }}
                />

                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  title={showPassword ? "Hide password" : "Show password"}
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
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                marginTop: -2,
                marginBottom: 2,
              }}
            >
              <input
                id="remember-me"
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                style={{ width: 16, height: 16, cursor: "pointer" }}
              />
              <label
                htmlFor="remember-me"
                style={{ fontSize: 14, color: "#111111", cursor: "pointer" }}
              >
                Remember me
              </label>
            </div>

            <div style={{ margin: "14px 0" }} className="recaptcha-wrap">
              <ReCAPTCHA
                sitekey={process.env.REACT_APP_RECAPTCHA_SITE_KEY}
                onChange={(token) => setCaptchaToken(token || "")}
                onExpired={() => setCaptchaToken("")}
              />
            </div>

            <button
              type="submit"
              className="btn-auth"
              disabled={loading || !captchaToken}
            >
              {loading ? (
                <>
                  <svg className="spinner-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                  </svg>
                  Logging in...
                </>
              ) : (
                "Log in"
              )}
            </button>

            {errorMessage ? (
              <div
                style={{
                  marginTop: 10,
                  color: "#b91c1c",
                  background: "#fef2f2",
                  border: "1px solid #fecaca",
                  padding: "10px 12px",
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                {errorMessage}
              </div>
            ) : null}
          </form>

          <div className="auth-switch">
            <button type="button" onClick={() => navigate("/forgot-password")}>
              Forgot your password?
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