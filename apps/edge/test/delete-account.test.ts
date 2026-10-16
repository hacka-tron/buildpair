import { env, SELF } from "cloudflare:test";
import { newId } from "@buildpair/domain";
import { PROTOCOL_VERSION, type SpaceEvent } from "@buildpair/protocol";
import { describe, expect, it } from "vitest";
import { type Client, command, join, openSocket, PASSWORD, signIn } from "./helpers";

type Batch = { after: number; upTo: number; events: SpaceEvent[] };

async function spaceOf(owner: Client, name: string) {
  const { id } = (await (await owner.post("/spaces", { name, purpose: "Testing" })).json()) as { id: string };
  return id;
}

const run = (who: Client, spaceId: string, ...cmds: ReturnType<typeof command>[]) =>
  who.post(`/spaces/${spaceId}/commands`, { commands: cmds });

describe("deleting your account", () => {
  it("needs your password", async () => {
    const maya = await signIn(`maya-${newId()}@example.com`);
    for (const body of [{}, { password: "" }, { password: PASSWORD, token: "x" }]) {
      const res = await maya.post("/api/auth/delete-user", body);
      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({ code: "PASSWORD_REQUIRED" });
    }
    const wrong = await maya.post("/api/auth/delete-user", { password: "not my password" });
    expect(wrong.status).toBe(400);
    expect((await maya.get("/me")).status).toBe(200);
  });

  it("removes the account, the spaces it owns, and everything it made in other spaces", async () => {
    const mayaEmail = `maya-${newId()}@example.com`;
    const maya = await signIn(mayaEmail);
    const jordan = await signIn(`jordan-${newId()}@example.com`);
    const mine = await spaceOf(maya, "Maya's");
    const theirs = await spaceOf(jordan, "Jordan's");
    await join(maya, jordan, mine);
    await join(jordan, maya, theirs);

    // Maya leaves a trail in Jordan's space: an item, a message, a reaction, and an invite link.
    const mayaNote = newId();
    const jordanNote = newId();
    await run(
      maya,
      theirs,
      command({ type: "item.create", payload: { itemId: newId(), kind: "todo", title: "Maya secret plan" } }),
      command({ type: "message.send", payload: { messageId: mayaNote, body: "Maya private words" } }),
    );
    await run(
      jordan,
      theirs,
      command({ type: "message.send", payload: { messageId: jordanNote, body: "Jordan stays" } }),
      command({ type: "reaction.toggle", payload: { messageId: mayaNote, emoji: "🎉" } }),
    );
    await run(
      maya,
      theirs,
      command({ type: "reaction.toggle", payload: { messageId: jordanNote, emoji: "👍" } }),
    );
    const { token } = (await (await maya.post(`/spaces/${theirs}/invites`)).json()) as { token: string };

    const inTheirs = await openSocket(jordan, theirs);
    inTheirs.send({ t: "hello", v: PROTOCOL_VERSION, afterSeq: 0 });
    await inTheirs.waitFor((m) => m.t === "events");
    const mayasOtherDevice = await openSocket(maya, theirs);
    const mayaCut = new Promise<number>((r) =>
      mayasOtherDevice.ws.addEventListener("close", (e) => r(e.code)),
    );
    const inMine = await openSocket(jordan, mine);
    const closed = new Promise<number>((r) => inMine.ws.addEventListener("close", (e) => r(e.code)));

    const { id: mayaId } = (await (await maya.get("/me")).json()) as { id: string };
    const res = await maya.post("/api/auth/delete-user", { password: PASSWORD });
    expect(res.status).toBe(200);

    // Her other device's connection is closed, so it hears nothing more.
    expect(await mayaCut).toBe(4003);

    // Maya is signed out and can't sign back in.
    expect((await maya.get("/me")).status).toBe(401);
    const again = await SELF.fetch("http://localhost:8787/api/auth/sign-in/email", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://localhost:8081" },
      body: JSON.stringify({ email: mayaEmail, password: PASSWORD }),
    });
    expect(again.ok).toBe(false);

    // Her space is gone for Jordan too, and his open connection to it is closed.
    expect(await closed).toBe(4004);
    const { spaces } = (await (await jordan.get("/spaces")).json()) as { spaces: { id: string }[] };
    expect(spaces.map((s) => s.id)).toEqual([theirs]);
    expect((await jordan.post(`/spaces/${mine}/ticket`)).status).toBe(404);
    expect((await jordan.get(`/spaces/${mine}/events?after=0`)).status).toBe(404);

    // Jordan's open device hears she left.
    const left = await inTheirs.waitFor(
      (m) => m.t === "events" && m.events.some((e) => e.type === "member.erased"),
    );
    expect(left).toBeTruthy();

    // A new device sees nothing of hers in Jordan's space, only Jordan's own things.
    const batch = (await (await jordan.get(`/spaces/${theirs}/events?after=0`)).json()) as Batch;
    const text = JSON.stringify(batch);
    expect(text).not.toContain("Maya secret plan");
    expect(text).not.toContain("Maya private words");
    expect(text).toContain("Jordan stays");
    const fromMaya = batch.events.filter((e) => e.actorId !== batch.events[0]!.actorId);
    expect(fromMaya.map((e) => e.type)).toEqual(["member.erased"]);

    // Running the erase again (a retried delete) changes nothing.
    await env.SPACE_ROOM.get(env.SPACE_ROOM.idFromName(theirs)).eraseMember(mayaId);
    const replay = (await (await jordan.get(`/spaces/${theirs}/events?after=0`)).json()) as Batch;
    expect(replay.events.filter((e) => e.type === "member.erased")).toHaveLength(1);

    // Her invite link no longer works.
    const sam = await signIn(`sam-${newId()}@example.com`);
    expect((await sam.post(`/invites/${token}/accept`)).status).toBe(410);

    // Jordan's space still works.
    const ok = (await (
      await run(
        jordan,
        theirs,
        command({ type: "message.send", payload: { messageId: newId(), body: "still here" } }),
      )
    ).json()) as { results: { ok: boolean }[] };
    expect(ok.results[0]?.ok).toBe(true);
  });

  it("takes their reactions out of copies made when someone shared an item again", async () => {
    const maya = await signIn(`maya-${newId()}@example.com`);
    const jordan = await signIn(`jordan-${newId()}@example.com`);
    const theirs = await spaceOf(jordan, "Jordan's");
    await join(jordan, maya, theirs);
    const itemId = newId();
    await run(
      jordan,
      theirs,
      command({ type: "item.create", payload: { itemId, kind: "todo", title: "Ship it" } }),
      command({ type: "item.complete", payload: { itemId, on: "2026-10-16" } }),
    );
    const before = (await (await jordan.get(`/spaces/${theirs}/events?after=0`)).json()) as Batch;
    const line = before.events.find((e) => e.type === "message.posted");
    if (line?.type !== "message.posted") throw new Error("no completion line");
    await run(
      maya,
      theirs,
      command({ type: "reaction.toggle", payload: { messageId: line.payload.message.id, emoji: "🎉" } }),
    );
    await run(
      jordan,
      theirs,
      command({ type: "item.visibility", payload: { itemId, visibility: "owner" } }),
      command({ type: "item.visibility", payload: { itemId, visibility: "space" } }),
    );
    const { id: mayaId } = (await (await maya.get("/me")).json()) as { id: string };
    const shared = await (await jordan.get(`/spaces/${theirs}/events?after=0`)).text();
    expect(shared).toContain(mayaId);

    expect((await maya.post("/api/auth/delete-user", { password: PASSWORD })).status).toBe(200);
    const batch = (await (await jordan.get(`/spaces/${theirs}/events?after=0`)).json()) as Batch;
    const withoutErased = batch.events.filter((e) => e.type !== "member.erased");
    expect(JSON.stringify(withoutErased)).not.toContain(mayaId);
    expect(JSON.stringify(batch)).toContain("Ship it");
  });
});
