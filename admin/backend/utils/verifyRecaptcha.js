// utils/verifyRecaptcha.js
const RECAPTCHA_VERIFY_URL = "https://www.google.com/recaptcha/api/siteverify";

exports.verifyRecaptcha = async (token) => {
  if (!token) return false;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);

  try {
    const params = new URLSearchParams({
      secret: process.env.RECAPTCHA_SECRET_KEY,
      response: token,
    });

    const response = await fetch(RECAPTCHA_VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
      signal: controller.signal,
    });

    const data = await response.json();
    return data.success === true;
  } catch (err) {
    console.error(
      err.name === "AbortError"
        ? "reCAPTCHA verification timed out after 8s"
        : `reCAPTCHA verification error: ${err.message}`,
    );
    return false;
  } finally {
    clearTimeout(timeoutId);
  }
};