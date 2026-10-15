// Account creation on the landing page: name, email and password, then the emailed code that confirms the address. The session cookie is
// shared across buildpair.app subdomains, so after verifying we send people straight into the app.
(() => {
  const config = window.BUILDPAIR || {
    apiUrl: "http://localhost:8787",
    appUrl: "http://localhost:8081",
    googleEnabled: false,
  };
  const form = document.getElementById("signup-form");
  if (!form) return;
  const steps = {
    details: form.querySelector('[data-step="details"]'),
    code: form.querySelector('[data-step="code"]'),
  };
  const errorEl = form.querySelector(".form-error");
  const nameEl = document.getElementById("name");
  const emailEl = document.getElementById("email");
  const passwordEl = document.getElementById("password");
  const codeEl = document.getElementById("code");
  let step = "details";
  let resendAt = 0;
  let busy = false;

  for (const a of document.querySelectorAll("[data-app-link]")) a.href = config.appUrl;
  if (config.googleEnabled) for (const el of document.querySelectorAll("[data-google]")) el.hidden = false;
  for (const a of document.querySelectorAll("[data-focus-signup]")) {
    a.addEventListener("click", () =>
      setTimeout(() => (step === "details" ? nameEl : codeEl).focus({ preventScroll: true }), 350),
    );
  }

  const showError = (msg) => {
    errorEl.textContent = msg || "";
  };

  async function call(path, body) {
    let res;
    try {
      res = await fetch(`${config.apiUrl}${path}`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch {
      throw new Error("We couldn't reach Buildpair. Check your connection and try again.");
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (res.status === 429) throw new Error("Too many tries. Wait a minute, then try again.");
      const plain = {
        INVALID_OTP: "That code isn't right. Check the email, or ask for a new code.",
        OTP_EXPIRED: "That code has expired. Ask for a new one below.",
        TOO_MANY_ATTEMPTS: "Too many wrong codes. Ask for a new one below.",
        NOT_INVITED:
          "This is a test version of Buildpair, open to invited people only. Ask the person who invited you to add your email.",
        INVALID_EMAIL: "That email doesn't look right. Check it and try again.",
        PASSWORD_TOO_SHORT: "Use at least 8 characters for your password.",
      }[data.code];
      throw new Error(plain || "Something went wrong on our side. Try again in a moment.");
    }
    return data;
  }

  function setBusy(value) {
    busy = value;
    const button = steps[step].querySelector('button[type="submit"]');
    button.disabled = value;
    button.textContent = value ? "One moment…" : button.dataset.label;
  }

  function go(next) {
    step = next;
    steps.details.hidden = next !== "details";
    steps.code.hidden = next !== "code";
    showError("");
    (next === "code" ? codeEl : emailEl).focus();
  }

  function codeSent() {
    resendAt = Date.now() + 30_000;
    form.querySelector("[data-email]").textContent = emailEl.value.trim();
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (busy) return;
    showError("");
    try {
      if (step === "details") {
        if (!nameEl.value.trim()) return showError("Add your name so your people know it's you.");
        if (!/^\S+@\S+\.\S+$/.test(emailEl.value.trim()))
          return showError("That email doesn't look right. Check it and try again.");
        if (passwordEl.value.length < 8) return showError("Use at least 8 characters for your password.");
        setBusy(true);
        // Making the account emails the code. If the email already has an account, nothing is sent.
        await call("/api/auth/sign-up/email", {
          name: nameEl.value.trim(),
          email: emailEl.value.trim(),
          password: passwordEl.value,
        });
        codeSent();
        setBusy(false);
        go("code");
      } else {
        const otp = codeEl.value.replace(/\D/g, "");
        if (otp.length !== 6) return showError("Enter the 6-digit code from the email.");
        setBusy(true);
        // Confirming the email also signs you in.
        await call("/api/auth/email-otp/verify-email", { email: emailEl.value.trim(), otp });
        window.location.assign(config.appUrl);
      }
    } catch (err) {
      setBusy(false);
      showError(err.message);
    }
  });

  document.getElementById("resend").addEventListener("click", async () => {
    const wait = Math.ceil((resendAt - Date.now()) / 1000);
    if (wait > 0) return showError(`You can ask for a new code in ${wait} seconds.`);
    try {
      await call("/api/auth/email-otp/send-verification-otp", {
        email: emailEl.value.trim(),
        type: "email-verification",
      });
      codeSent();
      showError("");
      codeEl.value = "";
      codeEl.focus();
    } catch (err) {
      showError(err.message);
    }
  });
  document.getElementById("back").addEventListener("click", () => go("details"));
  codeEl.addEventListener("input", () => {
    if (codeEl.value.replace(/\D/g, "").length === 6) form.requestSubmit();
  });

  document.getElementById("google")?.addEventListener("click", async () => {
    try {
      const data = await call("/api/auth/sign-in/social", { provider: "google", callbackURL: config.appUrl });
      if (data.url) window.location.assign(data.url);
    } catch (err) {
      showError(err.message);
    }
  });
})();
