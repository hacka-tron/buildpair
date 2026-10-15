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

  it.each([
    [{ name: "x".repeat(81) }, "name"],
    [{ building: "x".repeat(141) }, "building"],
    [{ building: 42 }, "building"],
    [{ timeZone: "Mars/Olympus" }, "time zone"],
    [{ timeZone: "x".repeat(100) }, "time zone"],
  ])("refuses %j", async (body) => {
    const maya = await signIn(`maya-${newId()}@example.com`);
    const res = await maya.post("/api/auth/update-user", body);
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "INVALID_PROFILE" });
  });

  it("lets you clear what you're building", async () => {
    const maya = await signIn(`maya-${newId()}@example.com`);
    await maya.post("/api/auth/update-user", { building: "Something" });
    expect((await maya.post("/api/auth/update-user", { building: null })).status).toBe(200);
  });
});
