import type { ServerMessage } from "@buildpair/protocol";
import { beforeEach, describe, expect, it, vi } from "vitest";

const calls: { path: string; body?: unknown }[] = [];
let respond: (path: string, body?: unknown) => unknown = () => ({});

vi.mock("./config", () => ({ API_URL: "http://api.test" }));
vi.mock("./spaces", () => ({ markSpaceGone: vi.fn() }));
vi.mock("partysocket", () => ({ WebSocket: class {} }));
vi.mock("./api", () => {
  class ApiError extends Error {
    constructor(
      readonly status: number,
      readonly code: string,
      message: string,
    ) {
      super(message);
    }
  }
  return {
    ApiError,
    api: async (path: string, init?: { body?: unknown }) => {
      calls.push({ path, body: init?.body });
      await new Promise((r) => setTimeout(r, Math.random() * 5));
      const out = respond(path, init?.body);
      if (out instanceof Error) throw out;
      return out;
    },
  };
});

const { spaceTransport } = await import("./transport");
const { ApiError } = await import("./api");

const ID = (n: number) => `01JZ8Q2V9W3X4Y5Z6A7B8C9D${String(n).padStart(2, "0")}`;
const cmd = (n: number) => ({
  id: ID(n),
  at: "2026-10-16T09:00:00.000Z",
  type: "message.send" as const,
  payload: { messageId: ID(n + 50), body: `m${n}` },
});
const flush = () => new Promise((r) => setTimeout(r, 60));

function open() {
  const got: ServerMessage[] = [];
  const handlers = { onOpen: vi.fn(), onClose: vi.fn(), onMessage: (m: ServerMessage) => got.push(m) };
  const c = spaceTransport.connect("s1", handlers);
  return { c, got, handlers };
}

describe("syncing a space that isn't on screen", () => {
  beforeEach(() => {
    calls.length = 0;
  });

  it("opens at once and sends changes over HTTPS one at a time, in order", async () => {
    respond = (path, body) =>
      path.endsWith("/commands")
        ? {
            results: [
              { ok: true, seq: Number((body as { commands: { id: string }[] }).commands[0]!.id.slice(-2)) },
            ],
          }
        : {};
    const { c, got, handlers } = open();
    await flush();
    expect(handlers.onOpen).toHaveBeenCalledTimes(1);
    for (const n of [1, 2, 3, 4]) c.send({ t: "cmd", cmd: cmd(n) });
    await flush();
    expect(calls.map((x) => (x.body as { commands: { id: string }[] }).commands[0]!.id)).toEqual(
      [1, 2, 3, 4].map(ID),
    );
    expect(got.map((m) => m.t === "ack" && m.seq)).toEqual([1, 2, 3, 4]);
    c.close();
  });

  it("catches up in batches until the room says there's no more", async () => {
    respond = (path) => {
      const after = Number(new URL(`http://x${path}`).searchParams.get("after"));
      return { after, upTo: after + 500, more: after < 1000, events: [] };
    };
    const { c, got } = open();
    await flush();
    c.send({ t: "hello", v: 7, afterSeq: 0 });
    await flush();
    expect(got.map((m) => m.t === "events" && m.upTo)).toEqual([500, 1000, 1500]);
    c.close();
  });

  it("keeps a change the room is too busy for, and goes offline (then retries) when unreachable", async () => {
    respond = () => new ApiError(429, "too_many_requests", "Wait a minute.");
    const { c, got, handlers } = open();
    await flush();
    c.send({ t: "cmd", cmd: cmd(9) });
    await flush();
    expect(got).toEqual([{ t: "busy", id: ID(9), reason: "Wait a minute." }]);
    respond = () => new ApiError(0, "offline", "Couldn't reach Buildpair.");
    c.send({ t: "cmd", cmd: cmd(10) });
    await flush();
    expect(handlers.onClose).toHaveBeenCalledTimes(1);
    c.close();
  });
});
