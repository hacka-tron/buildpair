import { env, runInDurableObject, SELF } from "cloudflare:test";
import { newId } from "@buildpair/domain";
import type { InboxClientMessage, InboxMessage } from "@buildpair/protocol";
import { describe, expect, it } from "vitest";
import { USER_HEADER } from "../src/space-room";
import type { UserHub } from "../src/user-hub";
import { type Client, PASSWORD, signIn } from "./helpers";

/** One device's inbox socket. */
async function openInbox(client: Client) {
  const { ticket } = (await (await client.post("/me/ticket")).json()) as { ticket: string };
  const res = await SELF.fetch(`http://localhost:8787/me/ws?ticket=${ticket}`, {
    headers: { upgrade: "websocket" },
  });
  const ws = res.webSocket;
  if (!ws) throw new Error(`no websocket: ${res.status}`);
  ws.accept();
  const received: InboxMessage[] = [];
  ws.addEventListener("message", (e) => received.push(JSON.parse(e.data as string)));
  const waitFor = async (pred: (m: InboxMessage) => boolean) => {
    const deadline = Date.now() + 2000;
    for (;;) {
      const hit = received.find(pred);
      if (hit) return hit;
      if (Date.now() > deadline) throw new Error(`timed out; got ${JSON.stringify(received)}`);
      await new Promise((r) => setTimeout(r, 20));
    }
  };
  const send = (msg: InboxClientMessage | string) =>
    ws.send(typeof msg === "string" ? msg : JSON.stringify(msg));
  /** Say hello and get every saved position back. */
  const hello = async (reads: Record<string, number> = {}) => {
    received.length = 0;
    send({ t: "read", reads, all: true });
    const m = await waitFor((x) => x.t === "reads" && x.all === true);
    return m.t === "reads" ? m.reads : {};
  };
  return { ws, received, waitFor, send, hello };
}

describe("read positions across devices", () => {
  it("tells the person's other devices how far they read, and only moves forward", async () => {
    const maya = await signIn(`maya-${newId()}@example.com`);
    const phone = await openInbox(maya);
    const laptop = await openInbox(maya);
    expect(await phone.hello()).toEqual({});
    await laptop.hello();

    phone.send({ t: "read", reads: { "space-a": 5 } });
    const heard = await laptop.waitFor((m) => m.t === "reads" && !m.all);
    expect(heard).toEqual({ t: "reads", reads: { "space-a": 5 } });

    // Going back doesn't count, and isn't passed on.
    phone.send({ t: "read", reads: { "space-a": 3 } });
    expect(await laptop.hello({ "space-b": 2 })).toEqual({ "space-a": 5, "space-b": 2 });
    expect(phone.received.some((m) => m.t === "reads" && m.reads["space-a"] === 3)).toBe(false);
    phone.ws.close();
    laptop.ws.close();
  });

  it("keeps each person's positions to themselves", async () => {
    const maya = await signIn(`maya-${newId()}@example.com`);
    const sam = await signIn(`sam-${newId()}@example.com`);
    const mine = await openInbox(maya);
    const theirs = await openInbox(sam);
    await theirs.hello();
    await mine.hello({ "space-a": 9 });
    expect(await theirs.hello()).toEqual({});
    expect(theirs.received.some((m) => m.t === "reads" && "space-a" in m.reads)).toBe(false);
    mine.ws.close();
    theirs.ws.close();
  });

  it("ignores messages it can't read", async () => {
    const maya = await signIn(`maya-${newId()}@example.com`);
    const inbox = await openInbox(maya);
    inbox.send("not json");
    inbox.send(JSON.stringify({ t: "read", reads: { "space-a": -1 } }));
    inbox.send(JSON.stringify({ t: "read", reads: { ["x".repeat(65)]: 1 } }));
    const tooMany = Object.fromEntries(Array.from({ length: 201 }, (_, i) => [`s${i}`, 1]));
    inbox.send(JSON.stringify({ t: "read", reads: tooMany }));
    expect(await inbox.hello()).toEqual({});
    inbox.ws.close();
  });

  it("forgets them when the account is deleted", async () => {
    const maya = await signIn(`maya-${newId()}@example.com`);
    const { id } = (await (await maya.get("/me")).json()) as { id: string };
    const inbox = await openInbox(maya);
    await inbox.hello({ "space-a": 4 });
    expect((await maya.post("/api/auth/delete-user", { password: PASSWORD })).status).toBe(200);
    const hub = env.USER_HUB.get(env.USER_HUB.idFromName(id));
    const rows = await runInDurableObject(
      hub,
      async (_hub, state) => state.storage.sql.exec("SELECT * FROM reads").toArray().length,
    );
    expect(rows).toBe(0);
    // A device still holding a ticket can't reconnect and save more.
    await runInDurableObject(hub, async (h: UserHub) => {
      const res = await h.fetch(
        new Request("http://x/me/ws", { headers: { upgrade: "websocket", [USER_HEADER]: id } }),
      );
      expect(res.status).toBe(410);
    });
  });
});
