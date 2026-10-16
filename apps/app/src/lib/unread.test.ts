import { applyEvents, emptySpace } from "@buildpair/domain";
import type { Message } from "@buildpair/protocol";
import { describe, expect, it, vi } from "vitest";

vi.mock("./storage", () => ({ kvStorage: { get: async () => null, set: async () => undefined } }));
const { isUnread, latestFromOthers } = await import("./unread");

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
});
