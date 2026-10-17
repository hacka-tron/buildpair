import type { Message } from "@buildpair/protocol";
import { describe, expect, it } from "vitest";
import { runs } from "./chat";

const line = (authorId: string, at: string, kind: Message["kind"] = "text"): Message => ({
  id: "01JZ8Q2V9W3X4Y5Z6A7B8C9D00",
  seq: 1,
  authorId,
  kind,
  body: "x",
  itemId: null,
  createdAt: at,
});

describe("chat runs", () => {
  it("groups one person's lines a few minutes apart", () => {
    expect(runs(line("dana", "2026-10-16T12:00:00Z"), line("dana", "2026-10-16T12:04:00Z"))).toBe(true);
  });

  it("starts a new run for another person, a long gap, or a non-text line", () => {
    expect(runs(line("dana", "2026-10-16T12:00:00Z"), line("sam", "2026-10-16T12:01:00Z"))).toBe(false);
    expect(runs(line("dana", "2026-10-16T12:00:00Z"), line("dana", "2026-10-16T12:06:00Z"))).toBe(false);
    expect(
      runs(line("dana", "2026-10-16T12:00:00Z"), line("dana", "2026-10-16T12:01:00Z", "completion")),
    ).toBe(false);
    expect(runs(undefined, line("dana", "2026-10-16T12:01:00Z"))).toBe(false);
  });
});
