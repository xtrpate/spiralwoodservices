import { useEffect, useState } from "react";
import { useNavigate, Link, useLocation } from "react-router-dom";
import useAuthStore from "../../store/authStore";

import { Mail, Lock, Eye, EyeOff } from "lucide-react";
import "./authpages.css";

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuthStore();

  const [form, setForm] = useState({ email: "", password: "" });
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [loading, setLoading] = useState(false);

  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  useEffect(() => {
    if (location.state?.message) {
      setInfo(location.state.message);
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setInfo("");
    setLoading(true);

    try {
      const user = await login(form.email, form.password);

      if (user.role === "admin") {
        navigate("/admin/dashboard", { replace: true });
      } else if (user.role === "staff") {
        navigate("/staff/dashboard", { replace: true });
      } else {
        navigate("/catalog", { replace: true });
      }
    } catch (err) {
      const code = err.response?.data?.code;
      const message = err.response?.data?.message;
      const emailFromServer = err.response?.data?.email;

      if (code === "EMAIL_NOT_VERIFIED") {
        navigate("/verify-otp", {
          state: { email: emailFromServer || form.email },
          fromLogin: true
        });
        return;
      }

      if (code === "ACCOUNT_INACTIVE") {
        setError("Your account has been deactivated. Please contact support.");
        return;
      }

      setError(message || "Login failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-root">
      <div className="auth-split">
        <div className="auth-brand-panel">
          <div className="brand-logo">W</div>
          <h1>
            Welcome to
            <br />
            <span>Spiral Wood</span>
          </h1>
          <p>
            Your one-stop destination for premium custom cabinetry and wood
            furniture. Order products, track your builds, and manage everything
            from one place.
          </p>

          <div className="brand-features">
            {[
              { icon: "🪵", text: "Browse & order custom wood furniture" },
              { icon: "📐", text: "Choose from our blueprint gallery" },
              {
                icon: "📦",
                text: "Track your order from production to delivery",
              },
              { icon: "🛡️", text: "1-year warranty on all completed orders" },
            ].map((f) => (
              <div className="brand-feature" key={f.text}>
                <div className="brand-feature-icon">{f.icon}</div>
                <span>{f.text}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="auth-card-panel">
          <div className="auth-card-header">
            <div className="mobile-logo">W</div>
            <h2>Sign In</h2>
            <p>Welcome back! Enter your credentials to continue.</p>
          </div>

          <div className="auth-tabs">
            <button className="auth-tab active">Sign In</button>
            <button className="auth-tab" onClick={() => navigate("/register")}>
              Create Account
            </button>
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
                  placeholder="you@example.com"
                  value={form.email}
                  onChange={(e) => set("email", e.target.value)}
                  required
                  autoFocus
                />
              </div>
            </div>

            <div className="field">
              <label>Password</label>
              <div className="field-input-wrap">
                <Lock size={15} />
                <input
                  type={showPw ? "text" : "password"}
                  placeholder="••••••••"
                  value={form.password}
                  onChange={(e) => set("password", e.target.value)}
                  required
                  style={{ paddingRight: 40 }}
                />
                <button
                  type="button"
                  className="pw-toggle"
                  onClick={() => setShowPw(!showPw)}
                >
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <div style={{ textAlign: "right", marginTop: -8 }}>
              <Link
                to="/forgot-password"
                style={{
                  fontSize: 13,
                  color: "var(--wood-dark)",
                  fontWeight: 600,
                  textDecoration: "none",
                  fontFamily: "'DM Sans', sans-serif",
                }}
              >
                Forgot password?
              </Link>
            </div>

            <button type="submit" className="btn-auth" disabled={loading}>
              {loading ? "Signing in…" : "Sign In"}
            </button>
          </form>

          <div className="auth-switch" style={{ marginTop: 20 }}>
            Don't have an account?{" "}
            <button onClick={() => navigate("/register")}>Create one</button>
          </div>

          <p
            style={{
              textAlign: "center",
              fontFamily: "'DM Sans', sans-serif",
              fontSize: 12,
              color: "#bbb",
              marginTop: 24,
              lineHeight: 1.6,
            }}
          >
            By signing in, you agree to our Terms of Service
            <br />
            and Privacy Policy.
          </p>
        </div>
      </div>
    </div>
  );
}
