import { SELF } from "cloudflare:test";
import { newId } from "@buildpair/domain";
import { PROTOCOL_VERSION, type SpaceEvent } from "@buildpair/protocol";
import { describe, expect, it } from "vitest";
import { command, openSocket, signIn } from "./helpers";

type Batch = { after: number; upTo: number; events: SpaceEvent[] };

async function makeSpace(name = "Life") {
  const maya = await signIn(`maya-${newId()}@example.com`);
  const res = await maya.post("/spaces", { name, purpose: "Family, health and the house" });
  expect(res.status).toBe(201);
  const { id } = (await res.json()) as { id: string };
  return { maya, spaceId: id };
}

describe("API", () => {
  it("reports health without signing in", async () => {
    const res = await SELF.fetch("http://localhost:8787/health");
    expect(await res.json()).toEqual({ ok: true, environment: "test" });
  });

  it("requires a session for space routes", async () => {
    const res = await SELF.fetch("http://localhost:8787/spaces");
    expect(res.status).toBe(401);
  });

  it("creates a space and lists it for its owner", async () => {
    const { maya, spaceId } = await makeSpace();
    const { spaces } = (await (await maya.get("/spaces")).json()) as {
      spaces: { id: string; role: string }[];
    };
    expect(spaces).toEqual([expect.objectContaining({ id: spaceId, role: "owner" })]);
  });

  it("lets the owner rename and recolor a space, and the list follows", async () => {
    const { maya, spaceId } = await makeSpace();
    const res = await maya.post(`/spaces/${spaceId}/commands`, {
      commands: [command({ type: "space.edit", payload: { name: "Home", color: "teal" } })],
    });
    expect(((await res.json()) as { results: { ok: boolean }[] }).results[0]?.ok).toBe(true);
    const { spaces } = (await (await maya.get("/spaces")).json()) as {
      spaces: { id: string; name: string; color: string | null }[];
    };
    expect(spaces[0]).toMatchObject({ id: spaceId, name: "Home", color: "teal" });
  });

  it("won't let a supporter change a space's details", async () => {
    const { maya, spaceId } = await makeSpace();
    const jordan = await signIn(`jordan-${newId()}@example.com`);
    const { token } = (await (await maya.post(`/spaces/${spaceId}/invites`)).json()) as { token: string };
    await jordan.post(`/invites/${token}/accept`);
    const res = await jordan.post(`/spaces/${spaceId}/commands`, {
      commands: [command({ type: "space.edit", payload: { name: "Mine now" } })],
    });
    expect(((await res.json()) as { results: { ok: boolean }[] }).results[0]?.ok).toBe(false);
    const { spaces } = (await (await maya.get("/spaces")).json()) as { spaces: { name: string }[] };
    expect(spaces[0]?.name).toBe("Life");
  });

  it("requires a purpose for a new space", async () => {
    const maya = await signIn(`maya-${newId()}@example.com`);
    const res = await maya.post("/spaces", { name: "Life", purpose: "" });
    expect(res.status).toBe(400);
  });

  it("applies commands over HTTPS once, even when retried", async () => {
    const { maya, spaceId } = await makeSpace();
    const itemId = newId();
    const create = command({ type: "item.create", payload: { itemId, kind: "todo", title: "Pay rent" } });
    const first = (await (await maya.post(`/spaces/${spaceId}/commands`, { commands: [create] })).json()) as {
      results: { ok: boolean; seq: number }[];
    };
    const retry = (await (
      await maya.post(`/spaces/${spaceId}/commands`, { commands: [create] })
    ).json()) as typeof first;
    expect(retry.results[0]).toEqual(first.results[0]);
    const batch = (await (await maya.get(`/spaces/${spaceId}/events?after=0`)).json()) as Batch;
    expect(batch.events.filter((e) => e.type === "item.created")).toHaveLength(1);
  });

  it("lets an invited supporter join, but hides the owner's private items from them", async () => {
    const { maya, spaceId } = await makeSpace();
    const privateId = newId();
    await maya.post(`/spaces/${spaceId}/commands`, {
      commands: [
        command({
          type: "item.create",
          payload: { itemId: privateId, kind: "todo", title: "Renew passport", visibility: "owner" },
        }),
        command({ type: "item.create", payload: { itemId: newId(), kind: "todo", title: "Pick up kids" } }),
      ],
    });
    const { token } = (await (await maya.post(`/spaces/${spaceId}/invites`)).json()) as { token: string };
    const jordan = await signIn(`jordan-${newId()}@example.com`);
    expect((await jordan.get(`/spaces/${spaceId}/events?after=0`)).status).toBe(404);
    expect((await jordan.post(`/invites/${token}/accept`)).status).toBe(200);

    const seen = (await (await jordan.get(`/spaces/${spaceId}/events?after=0`)).json()) as Batch;
    const titles = seen.events.flatMap((e) => (e.type === "item.created" ? [e.payload.item.title] : []));
    expect(titles).toEqual(["Pick up kids"]);
    const ownerView = (await (await maya.get(`/spaces/${spaceId}/events?after=0`)).json()) as Batch;
    expect(seen.upTo).toBe(ownerView.upTo);
  });

  it("delivers a message live to another member's socket and acknowledges the sender", async () => {
    const { maya, spaceId } = await makeSpace();
    const { token } = (await (await maya.post(`/spaces/${spaceId}/invites`)).json()) as { token: string };
    const jordan = await signIn(`jordan-${newId()}@example.com`);
    await jordan.post(`/invites/${token}/accept`);

    const a = await openSocket(maya, spaceId);
    const b = await openSocket(jordan, spaceId);
    a.send({ t: "hello", v: PROTOCOL_VERSION, afterSeq: 0 });
    await a.waitFor((m) => m.t === "events");

    const send = command({ type: "message.send", payload: { messageId: newId(), body: "Flights booked!" } });
    a.send({ t: "cmd", cmd: send });
    const ack = await a.waitFor((m) => m.t === "ack");
    expect(ack).toMatchObject({ id: send.id });
    const delivered = await b.waitFor(
      (m) =>
        m.t === "events" &&
        m.events.some((e) => e.type === "message.posted" && e.payload.message.body === "Flights booked!"),
    );
    expect(delivered.t === "events" && delivered.upTo).toBe(ack.t === "ack" && ack.seq);
    a.ws.close();
    b.ws.close();
  });

  it("rejects a socket with a tampered ticket", async () => {
    const { maya, spaceId } = await makeSpace();
    const { ticket } = (await (await maya.post(`/spaces/${spaceId}/ticket`)).json()) as { ticket: string };
    const res = await SELF.fetch(`http://localhost:8787/spaces/${spaceId}/ws?ticket=${ticket}x`, {
      headers: { upgrade: "websocket" },
    });
    expect(res.status).toBe(401);
  });

  it("explains rejected commands over the socket", async () => {
    const { maya, spaceId } = await makeSpace();
    const a = await openSocket(maya, spaceId);
    const bad = command({ type: "item.complete", payload: { itemId: newId(), on: "2026-10-10" } });
    a.send({ t: "cmd", cmd: bad });
    expect(await a.waitFor((m) => m.t === "reject")).toMatchObject({
      id: bad.id,
      reason: "That item no longer exists.",
    });
    a.ws.close();
  });
});
