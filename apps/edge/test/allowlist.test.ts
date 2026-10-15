import { env } from "cloudflare:test";
import { newId } from "@buildpair/domain";
import { describe, expect, it } from "vitest";
import { app } from "../src/app";
import { TEST_OTP } from "../src/auth";
import { isEmailAllowed } from "../src/env";

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

  it("sends no code to an email that isn't on the list, and says why", async () => {
    const res = await post(
      "/api/auth/email-otp/send-verification-otp",
      { email: "stranger@example.com", type: "sign-in" },
      "maya@example.com",
    );
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "NOT_INVITED" });
  });

  it("sends a code to a listed email", async () => {
    const email = `maya-${newId()}@example.com`;
    const res = await post(
      "/api/auth/email-otp/send-verification-otp",
      { email: email.toUpperCase(), type: "sign-in" },
      email,
    );
    expect(res.status).toBe(200);
  });

  it("won't create an account for an unlisted email, even with a valid code", async () => {
    const email = `stranger-${newId()}@example.com`;
    // The code is issued while no list is set, then the list goes on before it is used.
    expect((await post("/api/auth/email-otp/send-verification-otp", { email, type: "sign-in" })).status).toBe(
      200,
    );
    const res = await post("/api/auth/sign-in/email-otp", { email, otp: TEST_OTP }, "maya@example.com");
    expect(res.ok).toBe(false);
    expect(res.headers.getSetCookie()).toEqual([]);
  });
});
