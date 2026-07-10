// src/services/api.js – Axios instance with JWT interceptor + detailed error handling
import axios from "axios";
import toast from "react-hot-toast";

const API_BASE_URL =
  process.env.REACT_APP_API_URL ||
  (window.location.hostname === "localhost"
    ? "http://localhost:5000/api"
<<<<<<< Updated upstream
    : "https://spiralwoodservices.onrender.com/api");
=======
    : "https://spiralwood-1.onrender.com/api");
>>>>>>> Stashed changes

export const buildAssetUrl = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return "";

  const cleaned = raw.replace(/\\/g, "/");

  if (
    cleaned.startsWith("http://") ||
    cleaned.startsWith("https://") ||
    cleaned.startsWith("data:") ||
    cleaned.startsWith("blob:")
  ) {
    return cleaned;
  }

  const serverBase = String(API_BASE_URL).replace(/\/api\/?$/i, "");
  const normalized = cleaned.startsWith("/") ? cleaned : `/${cleaned}`;

  return `${serverBase}${normalized}`;
};

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  withCredentials: true,
});

const isPublicGuestRequest = (url = "") => {
  const requestUrl = String(url || "");

  return (
    requestUrl.includes("/customer/products") ||
    requestUrl.includes("/customer/blueprints") ||
    requestUrl.includes("/customer/auth/login") ||
    requestUrl.includes("/customer/auth/register") ||
    requestUrl.includes("/customer/auth/verify-otp") ||
    requestUrl.includes("/customer/auth/resend-otp") ||
    requestUrl.includes("/customer/auth/forgot-password") ||
    requestUrl.includes("/customer/auth/reset-password")
  );
};

api.interceptors.request.use(
  (config) => {
    const requestUrl = config?.url || "";

    const token =
      localStorage.getItem("wisdom_token") ||
      localStorage.getItem("cust_token") ||
      localStorage.getItem("token") ||
      localStorage.getItem("pos_token") ||
      sessionStorage.getItem("wisdom_token") ||
      sessionStorage.getItem("cust_token") ||
      sessionStorage.getItem("token") ||
      sessionStorage.getItem("pos_token");

    if (token && !isPublicGuestRequest(requestUrl)) {
      config.headers = config.headers || {};
      config.headers.Authorization = `Bearer ${token}`;
    }

    return config;
  },
  (error) => Promise.reject(error),
);

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;
    const message = error.response?.data?.message;
    const requestUrl = error.config?.url || "";

    if (status === 401) {
      const isPublicRequest = isPublicGuestRequest(requestUrl);

      if (!isPublicRequest) {
        localStorage.removeItem("wisdom_token");
        localStorage.removeItem("wisdom_user");
        localStorage.removeItem("cust_token");
        localStorage.removeItem("cust_user");
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        localStorage.removeItem("pos_token");
        localStorage.removeItem("pos_user");

        sessionStorage.removeItem("wisdom_token");
        sessionStorage.removeItem("wisdom_user");
        sessionStorage.removeItem("cust_token");
        sessionStorage.removeItem("cust_user");
        sessionStorage.removeItem("token");
        sessionStorage.removeItem("user");
        sessionStorage.removeItem("pos_token");
        sessionStorage.removeItem("pos_user");

        if (window.location.pathname !== "/login") {
          window.location.href = "/login";
        }
      }

      return Promise.reject(error);
    }

    if (status === 403) {
      const errorCode = error.response?.data?.code;

      if (errorCode === "EMAIL_NOT_VERIFIED") {
        return Promise.reject(error);
      }

      toast.error(message || "Access denied. You do not have permission for this action.");
      return Promise.reject(error);
    }

    if (status === 404) {
      return Promise.reject(error);
    }

    if (status === 422) {
      const errors = error.response?.data?.errors;
      if (errors?.length) {
        toast.error(errors.map((e) => e.msg).join(" · "));
      } else {
        toast.error(message || "Validation error.");
      }
      return Promise.reject(error);
    }

    if (status === 500) {
      toast.error(
        message || "Server error. Check the backend console for details.",
      );
      return Promise.reject(error);
    }

    if (!error.response) {
      toast.error(
        "Cannot connect to server. Make sure the backend is running on port 5000.",
        { id: "network-error", duration: 6000 },
      );
      return Promise.reject(error);
    }

    if (message) {
      toast.error(message);
    }

    return Promise.reject(error);
  },
);

export default api;
