import { applyEvents, emptySpace } from "@buildpair/domain";
import type { Message } from "@buildpair/protocol";
import { describe, expect, it, vi } from "vitest";

vi.mock("./storage", () => ({ kvStorage: { get: async () => null, set: async () => undefined } }));
const { connectReads, isUnread, latestFromOthers, markRead, mergeReads, startReading } = await import(
  "./unread"
);

const view = (authors: string[]) => ({
  ...applyEvents(emptySpace(), []),
  messages: authors.map(
    (authorId, i): Message => ({
      id: `01JZ8Q2V9W3X4Y5Z6A7B8C9D${String(i).padStart(2, "0")}`,
      seq: i + 1,
      authorId,
      kind: "text",
      body: "x",
      itemId: null,
      createdAt: "2026-10-16T09:00:00.000Z",
    }),
  ),
});

describe("unread", () => {
  it("lights up for someone else's newer message only", () => {
    const v = view(["sam", "me", "sam", "me"]);
    expect(latestFromOthers(v, "me", new Set())).toBe(3);
    expect(isUnread(2, v, "me", new Set())).toBe(true);
    expect(isUnread(3, v, "me", new Set())).toBe(false);
  });

  it("ignores blocked people and spaces this device never read", () => {
    const v = view(["sam", "pest"]);
    expect(isUnread(1, v, "me", new Set(["pest"]))).toBe(false);
    expect(isUnread(undefined, v, "me", new Set())).toBe(false);
  });

  it("shares what was read, keeps it while offline, and never shares a start-from-now position", async () => {
    const sent: unknown[] = [];
    let open = false;
    const send = (msg: unknown) => {
      if (!open) return false;
      sent.push(msg);
      return true;
    };
    mergeReads("me", {});
    // Before the server's positions arrive, a never-read space doesn't start counting.
    startReading("quiet", 7);
    connectReads("me", send);
    markRead("a", 3);
    expect(sent).toEqual([]);
    open = true;
    connectReads("me", send);
    expect(sent).toEqual([{ t: "read", reads: { a: 3 }, all: true }]);
    mergeReads("me", { a: 2, b: 6 }, true);
    startReading("quiet", 7);
    markRead("a", 4);
    expect(sent.at(-1)).toEqual({ t: "read", reads: { a: 4 } });
    expect(JSON.stringify(sent)).not.toContain("quiet");
    // The furthest position wins, from either side.
    mergeReads("me", { b: 9 });
    markRead("b", 8);
    expect(sent).toHaveLength(2);
  });
});
