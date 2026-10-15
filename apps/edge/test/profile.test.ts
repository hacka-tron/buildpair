import { SELF } from "cloudflare:test";
import { newId } from "@buildpair/domain";
import { describe, expect, it } from "vitest";
import { signIn } from "./helpers";

describe("profile", () => {
  it("saves what you're building and your time zone", async () => {
    const maya = await signIn(`maya-${newId()}@example.com`);
    const res = await maya.post("/api/auth/update-user", {
      name: "Maya Chen",
      building: "Ledgerly, invoicing for freelancers",
      timeZone: "America/Chicago",
    });
    expect(res.status).toBe(200);
    const session = (await (await maya.get("/api/auth/get-session")).json()) as {
      user: { name: string; building: string; timeZone: string };
    };
    expect(session.user).toMatchObject({
      name: "Maya Chen",
      building: "Ledgerly, invoicing for freelancers",
      timeZone: "America/Chicago",
    });
  });

  it.each<[Record<string, unknown>, string]>([
    [{ name: "x".repeat(81) }, "name"],
    [{ building: "x".repeat(141) }, "building"],
    [{ building: 42 }, "building"],
    [{ timeZone: "Mars/Olympus" }, "time zone"],
    [{ timeZone: "x".repeat(100) }, "time zone"],
    [{ timeZone: "+05:30" }, "time zone"],
    [{ timeZone: "utc" }, "time zone"],
    [{ name: { a: 1 } }, "name"],
    [{ image: "x".repeat(501) }, "image"],
  ])("refuses %j (%s)", async (body) => {
    const maya = await signIn(`maya-${newId()}@example.com`);
    const res = await maya.post("/api/auth/update-user", body);
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "INVALID_PROFILE" });
  });

  it("refuses a form-encoded sign-up, so the size checks can't be skipped", async () => {
    const res = await SELF.fetch("http://localhost:8787/api/auth/sign-up/email", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", origin: "http://localhost:8081" },
      body: new URLSearchParams({
        name: "x".repeat(900),
        email: `form-${newId()}@example.com`,
        password: "correct horse battery",
        timeZone: "Mars/X",
      }).toString(),
    });
    expect(res.status).toBe(415);
  });

  it("accepts UTC", async () => {
    const maya = await signIn(`maya-${newId()}@example.com`);
    expect((await maya.post("/api/auth/update-user", { timeZone: "UTC" })).status).toBe(200);
  });

  it("lets you clear what you're building", async () => {
    const maya = await signIn(`maya-${newId()}@example.com`);
    await maya.post("/api/auth/update-user", { building: "Something" });
    expect((await maya.post("/api/auth/update-user", { building: null })).status).toBe(200);
  });
});
