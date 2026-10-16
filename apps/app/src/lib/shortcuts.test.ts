import { describe, expect, it } from "vitest";
import { isTyping } from "./shortcuts";

describe("shortcuts", () => {
  it("treats fields as typing and everything else as fair game", () => {
    expect(isTyping({ tagName: "INPUT" } as unknown as EventTarget)).toBe(true);
    expect(isTyping({ tagName: "TEXTAREA" } as unknown as EventTarget)).toBe(true);
    expect(isTyping({ tagName: "DIV", isContentEditable: true } as unknown as EventTarget)).toBe(true);
    expect(isTyping({ tagName: "DIV", isContentEditable: false } as unknown as EventTarget)).toBe(false);
    expect(isTyping(null)).toBe(false);
  });
});
