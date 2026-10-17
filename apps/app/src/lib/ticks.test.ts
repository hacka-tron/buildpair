import type { Item } from "@buildpair/protocol";
import type { Change } from "@buildpair/sync";
import { afterEach, describe, expect, it, vi } from "vitest";

const { deleteLater, isTicked, toggle, flushDeletes, SETTLE_MS, UNDO_MS } = await import("./ticks");

const item = (over: Partial<Item> = {}): Item => ({
  id: "01JZ8Q2V9W3X4Y5Z6A7B8C9D00",
  kind: "todo",
  title: "Call the bank",
  ownerId: "me",
  parentId: null,
  visibility: "space",
  status: "open",
  dueOn: null,
  dueTime: null,
  timesPerWeek: null,
  doneOn: [],
  skippedOn: [],
  createdAt: "2026-10-16T09:00:00.000Z",
  ...over,
});

afterEach(() => vi.useRealTimers());

describe("ticks", () => {
  it("ticks an open item and takes the tick back from a finished one", () => {
    const sent: Change[] = [];
    const apply = (c: Change) => {
      sent.push(c);
      return null;
    };
    toggle(item(), "2026-10-16", apply);
    toggle(item({ status: "done", doneOn: ["2026-10-16"] }), "2026-10-16", apply);
    toggle(item({ status: "wont" }), "2026-10-16", apply);
    expect(sent.map((c) => c.type)).toEqual(["item.complete", "item.reopen", "item.reopen"]);
  });

  it("counts a habit as ticked only for the day it was ticked", () => {
    const habit = item({ kind: "habit", timesPerWeek: 3, doneOn: ["2026-10-15"] });
    expect(isTicked(habit, "2026-10-16")).toBe(false);
    expect(isTicked(habit, "2026-10-15")).toBe(true);
  });

  it("sends a delete only after the Undo notice, and not at all after Undo", () => {
    vi.useFakeTimers();
    const send = vi.fn();
    deleteLater(["a"], "Deleted", send);
    vi.advanceTimersByTime(UNDO_MS - 1);
    expect(send).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(send).toHaveBeenCalledTimes(1);
    // Closing the page sends what's waiting at once.
    const later = vi.fn();
    deleteLater(["b"], "Deleted", later);
    flushDeletes();
    expect(later).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(UNDO_MS + SETTLE_MS);
    expect(later).toHaveBeenCalledTimes(1);
  });
});
