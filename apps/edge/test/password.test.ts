import { env } from "cloudflare:test";
import { newId } from "@buildpair/domain";
import { afterEach, describe, expect, it, vi } from "vitest";
import { app } from "../src/app";
import { createAuth, TEST_OTP } from "../src/auth";
import * as email from "../src/email";
import { testLogin } from "../src/env";
import { PASSWORD, signIn } from "./helpers";

const ORIGIN = "http://localhost:8081";

function post(path: string, body: unknown, overrides: Partial<typeof env> = {}) {
  const req = new Request(`http://localhost:8787${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: ORIGIN },
    body: JSON.stringify(body),
  });
  return app.fetch(req, { ...env, ...overrides });
}

const address = () => `maya-${newId()}@example.com`;

describe("password sign-in", () => {
  afterEach(() => vi.restoreAllMocks());

  it("sends one email at sign-up, and the code from it signs you in", async () => {
    const send = vi.spyOn(email, "sendEmail");
    const to = address();
    const made = await post("/api/auth/sign-up/email", { name: "Maya", email: to, password: PASSWORD });
    expect(made.status).toBe(200);
    expect(made.headers.getSetCookie()).toEqual([]);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]?.[1].to).toBe(to.toLowerCase());
    const verified = await post("/api/auth/email-otp/verify-email", {
      email: to,
      otp: TEST_OTP,
      password: PASSWORD,
    });
    expect(verified.status).toBe(200);
    expect(verified.headers.getSetCookie().length).toBeGreaterThan(0);
  });

  it("signs in with a password and sends no email", async () => {
    const to = address();
    await signIn(to);
    const send = vi.spyOn(email, "sendEmail");
    const ok = await post("/api/auth/sign-in/email", { email: to, password: PASSWORD });
    expect(ok.status).toBe(200);
    expect(ok.headers.getSetCookie().length).toBeGreaterThan(0);
    const wrong = await post("/api/auth/sign-in/email", { email: to, password: "not the password" });
    expect(wrong.status).toBe(401);
    expect(send).not.toHaveBeenCalled();
  });

  it("won't sign in before the email is confirmed, and doesn't email again on its own", async () => {
    const to = address();
    await post("/api/auth/sign-up/email", { name: "Maya", email: to, password: PASSWORD });
    const send = vi.spyOn(email, "sendEmail");
    const res = await post("/api/auth/sign-in/email", { email: to, password: PASSWORD });
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "EMAIL_NOT_VERIFIED" });
    expect(send).not.toHaveBeenCalled();
  });

  it("asks for at least 8 characters", async () => {
    const res = await post("/api/auth/sign-up/email", { name: "Maya", email: address(), password: "short" });
    expect(res.status).toBe(400);
  });

  it("no longer sends sign-in codes, and says to use a password", async () => {
    const to = address();
    await signIn(to);
    const send = vi.spyOn(email, "sendEmail");
    const res = await post("/api/auth/email-otp/send-verification-otp", { email: to, type: "sign-in" });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "USE_PASSWORD" });
    expect(send).not.toHaveBeenCalled();
  });

  it("won't email a confirmation code to an account that's already confirmed, so codes can't skip the password", async () => {
    const to = address();
    await signIn(to);
    const send = vi.spyOn(email, "sendEmail");
    await post("/api/auth/email-otp/send-verification-otp", { email: to, type: "email-verification" });
    // Nothing is sent, so the (random, in real use) code never reaches anyone.
    expect(send).not.toHaveBeenCalled();
  });

  it("sends a new confirmation code to an account that isn't confirmed yet", async () => {
    const to = address();
    await post("/api/auth/sign-up/email", { name: "Maya", email: to, password: PASSWORD });
    const send = vi.spyOn(email, "sendEmail");
    await post("/api/auth/email-otp/send-verification-otp", { email: to, type: "email-verification" });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("lets whoever confirms the email set the password, so an earlier sign-up by someone else can't keep a way in", async () => {
    const to = address();
    await post("/api/auth/sign-up/email", { name: "Not Maya", email: to, password: "someone else's" });
    // Maya signs up later (nothing happens, the email is taken), then asks for a code and confirms.
    await post("/api/auth/sign-up/email", { name: "Maya", email: to, password: PASSWORD });
    await post("/api/auth/email-otp/send-verification-otp", { email: to, type: "email-verification" });
    const confirmed = await post("/api/auth/email-otp/verify-email", {
      email: to,
      otp: TEST_OTP,
      password: PASSWORD,
    });
    expect(confirmed.status).toBe(200);
    expect((await post("/api/auth/sign-in/email", { email: to, password: "someone else's" })).status).toBe(
      401,
    );
    expect((await post("/api/auth/sign-in/email", { email: to, password: PASSWORD })).status).toBe(200);
  });

  it("won't confirm an email without a password", async () => {
    const to = address();
    await post("/api/auth/sign-up/email", { name: "Maya", email: to, password: PASSWORD });
    const res = await post("/api/auth/email-otp/verify-email", { email: to, otp: TEST_OTP });
    expect(res.status).toBe(400);
    expect(res.headers.getSetCookie()).toEqual([]);
    const short = await post("/api/auth/email-otp/verify-email", {
      email: to,
      otp: TEST_OTP,
      password: "short",
    });
    expect(short.status).toBe(400);
  });

  it("drops the unsent code when a confirmed account asks for one", async () => {
    const to = address();
    await signIn(to);
    await post("/api/auth/email-otp/send-verification-otp", { email: to, type: "email-verification" });
    const res = await post("/api/auth/email-otp/verify-email", {
      email: to,
      otp: TEST_OTP,
      password: PASSWORD,
    });
    expect(res.ok).toBe(false);
    expect(res.headers.getSetCookie()).toEqual([]);
  });

  it("won't make an account from a code", async () => {
    const res = await post("/api/auth/sign-in/email-otp", { email: address(), otp: TEST_OTP });
    expect(res.ok).toBe(false);
    expect(res.headers.getSetCookie()).toEqual([]);
  });

  it("resets a forgotten password with an emailed code", async () => {
    const to = address();
    await signIn(to);
    const send = vi.spyOn(email, "sendEmail");
    expect((await post("/api/auth/email-otp/request-password-reset", { email: to })).status).toBe(200);
    expect(send).toHaveBeenCalledTimes(1);
    const fresh = "a whole new password";
    const reset = await post("/api/auth/email-otp/reset-password", {
      email: to,
      otp: TEST_OTP,
      password: fresh,
    });
    expect(reset.status).toBe(200);
    expect((await post("/api/auth/sign-in/email", { email: to, password: PASSWORD })).status).toBe(401);
    expect((await post("/api/auth/sign-in/email", { email: to, password: fresh })).status).toBe(200);
  });
});

describe("shared test account", () => {
  afterEach(() => vi.restoreAllMocks());

  it("signs in by its bare name, every time", async () => {
    for (const name of ["bagel", "Bagel "]) {
      const res = await post("/api/auth/sign-in/email", { email: name, password: "bagel" });
      expect(res.status).toBe(200);
      expect(res.headers.getSetCookie().length).toBeGreaterThan(0);
    }
  });

  it("puts itself back if someone changes its password or takes its email first", async () => {
    await post("/api/auth/sign-in/email", { email: "bagel", password: "bagel" });
    const ctx = await createAuth(env).$context;
    const found = await ctx.internalAdapter.findUserByEmail("bagel@buildpair.app");
    await ctx.internalAdapter.updatePassword(found!.user.id, await ctx.password.hash("someone else's"));
    await ctx.internalAdapter.updateUser(found!.user.id, { emailVerified: false });
    const res = await post("/api/auth/sign-in/email", { email: "bagel", password: "bagel" });
    expect(res.status).toBe(200);
  });

  it("needs its password", async () => {
    const res = await post("/api/auth/sign-in/email", { email: "bagel", password: "wrong" });
    expect(res.status).toBe(401);
  });

  it("never sends it email", async () => {
    await post("/api/auth/sign-in/email", { email: "bagel", password: "bagel" });
    const send = vi.spyOn(email, "sendEmail");
    await post("/api/auth/email-otp/request-password-reset", { email: "bagel@buildpair.app" });
    expect(send).not.toHaveBeenCalled();
  });

  it("doesn't exist in production", () => {
    expect(testLogin({ ...env, ENVIRONMENT: "production", TEST_LOGIN: "bagel:bagel" })).toBeNull();
    expect(testLogin({ ...env, TEST_LOGIN: "bagel:bagel" })?.email).toBe("bagel@buildpair.app");
    expect(testLogin({ ...env, TEST_LOGIN: undefined })).toBeNull();
    expect(testLogin({ ...env, TEST_LOGIN: "bagel:" })).toBeNull();
  });
});
