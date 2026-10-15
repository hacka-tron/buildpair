import { describe, expect, it } from "vitest";
import { ClientMessage, Command, parseServerMessage } from "../src";

const id = "01JZ8Q2V9W3X4Y5Z6A7B8C9D0E";

describe("protocol", () => {
  it("fills command defaults so clients can send minimal payloads", () => {
    const c = Command.parse({
      id,
      type: "item.create",
      at: "2026-10-10T09:00:00.000Z",
      payload: { itemId: id, kind: "todo", title: "  Pay rent  " },
    });
    expect(c.payload).toMatchObject({ title: "Pay rent", visibility: "space", parentId: null, dueOn: null });
  });

  it("rejects unknown message types and malformed IDs", () => {
    expect(ClientMessage.safeParse({ t: "nope" }).success).toBe(false);
    expect(
      Command.safeParse({
        id: "not-a-ulid",
        type: "message.send",
        at: "2026-10-10T09:00:00.000Z",
        payload: {},
      }).success,
    ).toBe(false);
  });
});

describe("reading server messages", () => {
  it("skips one unknown event instead of dropping the batch", () => {
    const known = {
      seq: 2,
      type: "member.joined",
      actorId: "maya",
      commandId: null,
      at: "2026-10-15T09:00:00.000Z",
      payload: { member: { userId: "jordan", role: "supporter", name: "Jordan" } },
    };
    const future = { ...known, seq: 3, type: "space.archived", payload: {} };
    const msg = parseServerMessage({ t: "events", after: 1, upTo: 3, events: [known, future] });
    expect(msg).toMatchObject({ t: "events", after: 1, upTo: 3 });
    expect(msg?.t === "events" && msg.events.map((e) => e.seq)).toEqual([2]);
  });

  it("returns null for something that isn't a message", () => {
    expect(parseServerMessage({ t: "nope" })).toBeNull();
  });
});
