import { describe, expect, it, vi } from "vitest";

vi.mock("../lib/api", () => ({ getProfile: vi.fn(), setCompliment: vi.fn() }));
vi.mock("./kit", () => ({ Tag: () => null }));
vi.mock("react-native", () => ({ Pressable: () => null, Text: () => null, View: () => null }));
const { statsLine } = await import("./profile-summary");

describe("profile stats line", () => {
  it("leaves out zeros and says something kind when there's nothing yet", () => {
    expect(statsLine({ supporting: 4, supportedBy: 6, goalsFinished: 12 })).toBe(
      "Supporting 4 spaces · supported by 6 · 12 goals finished",
    );
    expect(statsLine({ supporting: 0, supportedBy: 1, goalsFinished: 1 })).toBe(
      "Supported by 1 · 1 goal finished",
    );
    expect(statsLine({ supporting: 0, supportedBy: 0, goalsFinished: 0 })).toBe("Just getting started");
  });
});
