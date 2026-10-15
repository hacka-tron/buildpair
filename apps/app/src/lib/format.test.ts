import { describe, expect, it } from "vitest";
import { ago, dueLabel, localToday, peopleLine, timeLabel } from "./format";

describe("format", () => {
  it("writes local dates as YYYY-MM-DD", () => {
    expect(localToday(new Date(2026, 0, 5, 23, 30))).toBe("2026-01-05");
  });

  it("labels due dates relative to today and flags late ones", () => {
    expect(dueLabel("2026-10-15", "2026-10-15")).toEqual({ text: "Today", late: false });
    expect(dueLabel("2026-10-16", "2026-10-15")).toEqual({ text: "Tomorrow", late: false });
    expect(dueLabel("2026-10-14", "2026-10-15")).toEqual({ text: "Yesterday", late: true });
    expect(dueLabel("2026-10-01", "2026-10-15").late).toBe(true);
    expect(dueLabel("2026-12-24", "2026-10-15").late).toBe(false);
  });

  it("adds the time when there is one", () => {
    expect(dueLabel("2026-10-16", "2026-10-15", "15:30")).toEqual({ text: "Tomorrow 3:30 PM", late: false });
    expect(timeLabel("00:05")).toBe("12:05 AM");
    expect(timeLabel("12:00")).toBe("12:00 PM");
    expect(timeLabel("09:00")).toBe("9:00 AM");
  });

  it("says how long ago something happened", () => {
    const now = Date.parse("2026-10-15T12:00:00Z");
    expect(ago("2026-10-15T11:59:30Z", now)).toBe("now");
    expect(ago("2026-10-15T11:55:00Z", now)).toBe("5 min ago");
    expect(ago("2026-10-15T09:00:00Z", now)).toBe("3 hr ago");
  });

  it("names the people in a space in plain words", () => {
    expect(peopleLine(["You"])).toBe("You");
    expect(peopleLine(["You", "Jordan"])).toBe("You and Jordan");
    expect(peopleLine(["You", "Jordan", "Kim"])).toBe("You, Jordan and 1 other");
    expect(peopleLine(["You", "Jordan", "Kim", "Theo", "Ana"])).toBe("You, Jordan and 3 others");
  });
});
