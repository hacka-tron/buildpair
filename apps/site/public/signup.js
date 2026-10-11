// Account creation on the landing page: name and email, then the emailed code. The session cookie is
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
        INVALID_EMAIL: "That email doesn't look right. Check it and try again.",
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

  async function sendCode() {
    await call("/api/auth/email-otp/send-verification-otp", { email: emailEl.value.trim(), type: "sign-in" });
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
        setBusy(true);
        await sendCode();
        setBusy(false);
        go("code");
      } else {
        const otp = codeEl.value.replace(/\D/g, "");
        if (otp.length !== 6) return showError("Enter the 6-digit code from the email.");
        setBusy(true);
        await call("/api/auth/sign-in/email-otp", { email: emailEl.value.trim(), otp });
        const name = nameEl.value.trim();
        // A new account starts without a name; returning people keep theirs if they left the field as is.
        if (name) await call("/api/auth/update-user", { name }).catch(() => undefined);
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
      await sendCode();
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
