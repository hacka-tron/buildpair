import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

describe("landing site", () => {
  it("serves the landing page with security headers", async () => {
    const res = await SELF.fetch("http://localhost/");
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("Set goals.");
    expect(res.headers.get("x-frame-options")).toBe("DENY");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("tells the browser where the API and the app live", async () => {
    const res = await SELF.fetch("http://localhost/config.js");
    expect(res.headers.get("content-type")).toContain("javascript");
    expect(await res.text()).toBe(
      'window.BUILDPAIR = {"apiUrl":"http://localhost:8787","appUrl":"http://localhost:8081","googleEnabled":false};',
    );
  });

  it("sends invite links and sign-in to the app", async () => {
    const join = await SELF.fetch("http://localhost/join/abc123", { redirect: "manual" });
    expect(join.status).toBe(302);
    expect(join.headers.get("location")).toBe("http://localhost:8081/join/abc123");
    const signIn = await SELF.fetch("http://localhost/sign-in", { redirect: "manual" });
    expect(signIn.headers.get("location")).toBe("http://localhost:8081/");
  });

  it("serves the privacy page", async () => {
    const res = await SELF.fetch("http://localhost/privacy");
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("Privacy, in plain words");
  });
});
