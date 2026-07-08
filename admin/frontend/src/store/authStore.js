import { create } from "zustand";
import api from "../services/api";

const AUTH_KEYS = ["wisdom_token", "wisdom_user", "token", "user"];
const POS_KEYS = ["pos_token", "pos_user"];
const REMEMBER_KEY = "wisdom_remember_me";

const parseJson = (value) => {
  try {
    return JSON.parse(value || "null");
  } catch {
    return null;
  }
};

const extractAuthErrorMessage = (err, fallback = "Incorrect email or password.") =>
  err?.response?.data?.message ||
  err?.response?.data?.error ||
  err?.message ||
  fallback;

const getStoredUser = () =>
  parseJson(localStorage.getItem("wisdom_user")) ||
  parseJson(sessionStorage.getItem("wisdom_user")) ||
  parseJson(localStorage.getItem("user")) ||
  parseJson(sessionStorage.getItem("user"));

const getStoredToken = () =>
  localStorage.getItem("wisdom_token") ||
  sessionStorage.getItem("wisdom_token") ||
  localStorage.getItem("token") ||
  sessionStorage.getItem("token") ||
  null;

const hasLocalAuth = () =>
  !!(
    localStorage.getItem("wisdom_token") || localStorage.getItem("token")
  );

const getActiveStorage = () => (hasLocalAuth() ? localStorage : sessionStorage);

const syncAuthHeader = (token) => {
  if (token) {
    api.defaults.headers.common.Authorization = `Bearer ${token}`;
  } else {
    delete api.defaults.headers.common.Authorization;
  }
};

const removeKeys = (storage, keys) => {
  keys.forEach((key) => storage.removeItem(key));
};

const persistSession = (token, user, rememberMe = false) => {
  const targetStorage = rememberMe ? localStorage : sessionStorage;
  const otherStorage = rememberMe ? sessionStorage : localStorage;

  removeKeys(targetStorage, AUTH_KEYS);
  removeKeys(otherStorage, AUTH_KEYS);

  removeKeys(localStorage, POS_KEYS);
  removeKeys(sessionStorage, POS_KEYS);

  targetStorage.setItem("wisdom_token", token);
  targetStorage.setItem("wisdom_user", JSON.stringify(user));

  // legacy/shared keys para sa ibang pages na umaasa pa dito
  targetStorage.setItem("token", token);
  targetStorage.setItem("user", JSON.stringify(user));

  localStorage.setItem(REMEMBER_KEY, rememberMe ? "true" : "false");

  syncAuthHeader(token);
};

const persistUserOnly = (user) => {
  const storage = getActiveStorage();

  storage.setItem("wisdom_user", JSON.stringify(user));
  storage.setItem("user", JSON.stringify(user));
};

const clearSession = () => {
  removeKeys(localStorage, [...AUTH_KEYS, ...POS_KEYS]);
  removeKeys(sessionStorage, [...AUTH_KEYS, ...POS_KEYS]);

  // IMPORTANT:
  // Huwag buburahin ang cust_cart para hindi mawala ang cart after logout/login
  sessionStorage.removeItem("cust_custom_cart");
  sessionStorage.removeItem("cust_selected_keys");
  sessionStorage.removeItem("cust_selected_custom_checkout");
  sessionStorage.removeItem("pos_cart");

  syncAuthHeader(null);
};

const savedUser = getStoredUser();
const savedToken = getStoredToken();

syncAuthHeader(savedToken);

const useAuthStore = create((set, get) => ({
  user: savedUser,
  token: savedToken,

  setUser: (updater) => {
    const currentUser = get().user;
    const nextUser =
      typeof updater === "function" ? updater(currentUser) : updater;

    persistUserOnly(nextUser);
    set({ user: nextUser });
  },

 login: async (email, password, rememberMe = false, recaptchaToken = "") => {
    const cleanEmail = String(email || "").trim();

    try {
      // 1. ONE single request to a unified endpoint
      // (Check your api.js baseURL, it usually adds /api automatically)
      const { data } = await api.post("/auth/login", {
        email: cleanEmail,
        password,
        recaptcha_token: recaptchaToken,
      });

      // 2. Persist and Set State
      persistSession(data.token, data.user, rememberMe);
      set({
        user: data.user,
        token: data.token,
      });

      // 3. Return the user (which includes their role!)
      return data.user;

    } catch (err) {
      // 4. Clean, unified error handling
      const finalError = new Error(
        extractAuthErrorMessage(err, "Incorrect email or password.")
      );

      // Attach response so LoginPage.jsx can read "EMAIL_NOT_VERIFIED"
      if (err.response) {
        finalError.response = err.response;
      }

      throw finalError;
    }
  },

  register: async (userData) => {
    const { data } = await api.post("/customer/auth/register", userData);
    return data;
  },

  verifyOtp: async (email, otp) => {
    const { data } = await api.post("/customer/auth/verify-otp", {
      email,
      otp,
    });
    return data;
  },

  resendOtp: async (email) => {
    const { data } = await api.post("/customer/auth/resend-otp", { email });
    return data;
  },

  forgotPassword: async (email, recaptchaToken = "") => {
    const { data } = await api.post("/customer/auth/forgot-password", {
      email: String(email || "").trim(),
      recaptcha_token: recaptchaToken,
    });
    return data;
  },

  resetPassword: async (email, otp, newPassword) => {
    const { data } = await api.post("/customer/auth/reset-password", {
      email: String(email || "").trim(),
      otp: String(otp || "").trim(),
      new_password: newPassword,
    });
    return data;
  },

  logout: () => {
    clearSession();
    set({
      user: null,
      token: null,
    });
  },

  refreshMe: async () => {
    const token = get().token || getStoredToken();
    const storedUser = getStoredUser();

    if (!token) {
      clearSession();
      set({ user: null, token: null });
      return null;
    }

    syncAuthHeader(token);

    try {
      if (storedUser?.role === "admin" || storedUser?.role === "staff") {
        const { data } = await api.get("/auth/me");

        const mergedUser =
          storedUser?.role === "staff"
            ? {
                ...storedUser,
                ...data,
                staff_type: data?.staff_type || storedUser?.staff_type || null,
              }
            : data;

        persistUserOnly(mergedUser);
        set({ user: mergedUser, token });
        return mergedUser;
      }

      if (storedUser?.role === "customer") {
        persistUserOnly(storedUser);
        set({ user: storedUser, token });
        return storedUser;
      }

      clearSession();
      set({ user: null, token: null });
      return null;
    } catch {
      clearSession();
      set({ user: null, token: null });
      return null;
    }
  },
}));

export default useAuthStore;