import { env } from "cloudflare:test";
import { newId } from "@buildpair/domain";
import { afterEach, describe, expect, it, vi } from "vitest";
import { app } from "../src/app";
import { TEST_OTP } from "../src/auth";
import * as email from "../src/email";
import { isEmailAllowed } from "../src/env";
import { PASSWORD, signIn } from "./helpers";

const ORIGIN = "http://localhost:8081";

/** Call the app with ALLOWED_EMAILS set, as staging and previews run. */
function post(path: string, body: unknown, allowed?: string) {
  const req = new Request(`http://localhost:8787${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: ORIGIN },
    body: JSON.stringify(body),
  });
  return app.fetch(req, { ...env, ALLOWED_EMAILS: allowed });
}

describe("email allowlist", () => {
  afterEach(() => vi.restoreAllMocks());

  it("lets anyone in when no list is set", () => {
    expect(isEmailAllowed({ ...env, ALLOWED_EMAILS: undefined }, "anyone@example.com")).toBe(true);
    expect(isEmailAllowed({ ...env, ALLOWED_EMAILS: " " }, "anyone@example.com")).toBe(true);
  });

  it("matches listed emails regardless of case and spacing", () => {
    const listed = { ...env, ALLOWED_EMAILS: "maya@example.com, Sam@Example.com" };
    expect(isEmailAllowed(listed, " MAYA@example.com ")).toBe(true);
    expect(isEmailAllowed(listed, "sam@example.com")).toBe(true);
    expect(isEmailAllowed(listed, "stranger@example.com")).toBe(false);
  });

  it("tells an unlisted email why no code is coming, even with an odd body", async () => {
    expect(
      (await post("/api/auth/email-otp/send-verification-otp", null, "maya@example.com")).status,
    ).not.toBe(500);
  });

  it("sends no code to an email that isn't on the list, and says why", async () => {
    const res = await post(
      "/api/auth/email-otp/send-verification-otp",
      { email: "stranger@example.com", type: "email-verification" },
      "maya@example.com",
    );
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "NOT_INVITED" });
  });

  it("won't make an account for an email that isn't on the list, or email it", async () => {
    const send = vi.spyOn(email, "sendEmail");
    const address = `stranger-${newId()}@example.com`;
    const res = await post(
      "/api/auth/sign-up/email",
      { name: "Stranger", email: address, password: PASSWORD },
      "maya@example.com",
    );
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "NOT_INVITED" });
    expect(send).not.toHaveBeenCalled();
  });

  it("won't sign in an existing account that isn't on the list", async () => {
    const address = `early-${newId()}@example.com`;
    await signIn(address); // made before the list existed
    const res = await post(
      "/api/auth/sign-in/email",
      { email: address, password: PASSWORD },
      "maya@example.com",
    );
    expect(res.ok).toBe(false);
    expect(res.headers.getSetCookie()).toEqual([]);
  });

  it("sends no code of any kind to an unlisted email", async () => {
    const address = `early-${newId()}@example.com`;
    await signIn(address);
    const send = vi.spyOn(email, "sendEmail");
    await post("/api/auth/email-otp/request-password-reset", { email: address }, "maya@example.com");
    expect(send).not.toHaveBeenCalled();
  });

  it("still lets a listed email make an account and sign in", async () => {
    const address = `maya-${newId()}@example.com`;
    const made = await post(
      "/api/auth/sign-up/email",
      { name: "Maya", email: address, password: PASSWORD },
      address,
    );
    expect(made.status).toBe(200);
    const verified = await post(
      "/api/auth/email-otp/verify-email",
      { email: address, otp: TEST_OTP, password: PASSWORD },
      address,
    );
    expect(verified.status).toBe(200);
    const res = await post("/api/auth/sign-in/email", { email: address, password: PASSWORD }, address);
    expect(res.status).toBe(200);
    expect(res.headers.getSetCookie().length).toBeGreaterThan(0);
  });
});
