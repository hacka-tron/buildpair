import { applyEvents, emptySpace } from "@buildpair/domain";
import type { Item } from "@buildpair/protocol";
import { describe, expect, it } from "vitest";
import type { SpaceSummary } from "./api";
import { plusDays, upcoming } from "./upcoming";

const ID = (n: number) => `01JZ8Q2V9W3X4Y5Z6A7B8C9D${String(n).padStart(2, "0")}`;
const item = (n: number, p: Partial<Item>): Item => ({
  id: ID(n),
  kind: "todo",
  title: `t${n}`,
  ownerId: "me",
  parentId: null,
  visibility: "space",
  status: "open",
  dueOn: null,
  dueTime: null,
  timesPerWeek: null,
  doneOn: [],
  skippedOn: [],
  notes: "",
  repeat: null,
  createdAt: "2026-10-01T00:00:00.000Z",
  ...p,
});
const spaces: SpaceSummary[] = [{ id: "a", name: "Life", purpose: "", role: "owner" }];
const viewWith = (items: Item[]) => ({
  ...applyEvents(emptySpace(), []),
  name: "Life",
  items: Object.fromEntries(items.map((i) => [i.id, i])),
});

describe("upcoming", () => {
  it("adds days across month ends", () => {
    expect(plusDays("2026-10-30", 3)).toBe("2026-11-02");
    expect(plusDays("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("puts each of your dated things on its day, late ones first on the first day, habits apart", () => {
    const view = viewWith([
      item(1, { title: "Dentist", dueOn: "2026-10-18", dueTime: "15:00" }),
      item(2, { title: "Rent", dueOn: "2026-10-14" }),
      item(3, { title: "Pick up kids", dueOn: "2026-10-16", dueTime: "17:30" }),
      item(4, { title: "Far off", dueOn: "2026-11-30" }),
      item(5, { title: "Gym", kind: "habit", timesPerWeek: 4 }),
      item(6, { title: "Done one", dueOn: "2026-10-16", status: "done" }),
      item(7, { title: "Not mine", dueOn: "2026-10-16", ownerId: "sam" }),
    ]);
    const { days, habits } = upcoming(spaces, { a: view }, "me", "2026-10-16");
    expect(days).toHaveLength(7);
    expect(days[0]!.entries.map((e) => [e.item.title, e.late])).toEqual([
      ["Rent", true],
      ["Pick up kids", false],
    ]);
    expect(days[2]!.entries.map((e) => e.item.title)).toEqual(["Dentist"]);
    expect(habits.map((h) => h.item.title)).toEqual(["Gym"]);
    expect(days.flatMap((d) => d.entries).some((e) => e.item.title === "Far off")).toBe(false);
  });
});
