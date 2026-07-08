// utils/verifyRecaptcha.js
const RECAPTCHA_VERIFY_URL = "https://www.google.com/recaptcha/api/siteverify";

exports.verifyRecaptcha = async (token) => {
  if (!token) return false;

  try {
    const params = new URLSearchParams({
      secret: process.env.RECAPTCHA_SECRET_KEY,
      response: token,
    });

    const response = await fetch(RECAPTCHA_VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });

    const data = await response.json();
    return data.success === true;
  } catch (err) {
    console.error("reCAPTCHA verification error:", err.message);
    return false;
  }
};