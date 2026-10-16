import { SELF } from "cloudflare:test";
import { newId } from "@buildpair/domain";
import { PROTOCOL_VERSION } from "@buildpair/protocol";
import { describe, expect, it } from "vitest";
import { addressKey } from "../src/app";
import { command, openSocket, signIn } from "./helpers";

describe("rate limits", () => {
  it("slows down sign-in attempts from one address", async () => {
    const ip = `203.0.113.${Math.floor(Math.random() * 250) + 1}`;
    const attempt = () =>
      SELF.fetch("http://localhost:8787/api/auth/sign-in/email", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://localhost:8081",
          "cf-connecting-ip": ip,
        },
        body: JSON.stringify({ email: `nobody-${newId()}@example.com`, password: "wrong password here" }),
      });
    const statuses: number[] = [];
    for (let i = 0; i < 25; i++) statuses.push((await attempt()).status);
    expect(statuses.slice(0, 20)).not.toContain(429);
    const last = await attempt();
    expect(last.status).toBe(429);
    expect(await last.json()).toMatchObject({ error: expect.stringContaining("Wait a minute") });
  });

  it("slows down one person's changes, over HTTPS and the socket, without touching anyone else", async () => {
    const maya = await signIn(`maya-${newId()}@example.com`);
    const jordan = await signIn(`jordan-${newId()}@example.com`);
    const { id: spaceId } = (await (
      await maya.post("/spaces", { name: "Life", purpose: "Family" })
    ).json()) as {
      id: string;
    };
    const send = () =>
      maya.post(`/spaces/${spaceId}/commands`, {
        commands: [command({ type: "message.send", payload: { messageId: newId(), body: "hi" } })],
      });
    let limited = false;
    for (let i = 0; i < 130 && !limited; i++) limited = (await send()).status === 429;
    expect(limited).toBe(true);

    const socket = await openSocket(maya, spaceId);
    socket.send({ t: "hello", v: PROTOCOL_VERSION, afterSeq: 0 });
    const cmd = command({ type: "message.send", payload: { messageId: newId(), body: "again" } });
    socket.send({ t: "cmd", cmd });
    const answer = await socket.waitFor(
      (m) => (m.t === "reject" || m.t === "ack" || m.t === "busy") && m.id === cmd.id,
    );
    // Over the limit the change is kept for later, not refused.
    expect(answer).toMatchObject({ t: "busy", reason: expect.stringContaining("Wait a minute") });
    // A change that already landed can still be resent (a reconnect does that) and is acknowledged.
    const earlier = (await (await maya.get(`/spaces/${spaceId}/events?after=0`)).json()) as {
      events: { commandId: string | null; type: string }[];
    };
    const landed = earlier.events.find((e) => e.type === "message.posted")!.commandId!;
    socket.send({
      t: "cmd",
      cmd: { ...command({ type: "message.send", payload: { messageId: newId(), body: "x" } }), id: landed },
    });
    await socket.waitFor((m) => m.t === "ack" && m.id === landed);
    socket.ws.close();
    expect((await jordan.post("/spaces", { name: "Mine", purpose: "Mine" })).status).toBe(201);
  });

  it("counts IPv6 callers by their /64", () => {
    expect(addressKey("203.0.113.9")).toBe("203.0.113.9");
    expect(addressKey("2001:db8:1234:5678:aaaa:bbbb:cccc:dddd")).toBe("2001:db8:1234:5678::/64");
    expect(addressKey("2001:0DB8:1234:5678::1")).toBe("2001:db8:1234:5678::/64");
    expect(addressKey("2001:db8::1")).toBe("2001:db8:0:0::/64");
    expect(addressKey("::1")).toBe("0:0:0:0::/64");
  });
});
