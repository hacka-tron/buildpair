import { describe, expect, it } from "vitest";
import { ClientMessage, Command } from "../src";

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
