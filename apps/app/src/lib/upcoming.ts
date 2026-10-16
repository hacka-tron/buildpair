import type { SpaceState } from "@buildpair/domain";
import type { Item } from "@buildpair/protocol";
import type { SpaceSummary } from "./api";

export interface DayEntry {
  spaceId: string;
  spaceName: string;
  item: Item;
  /** Due before the first day shown, so it's carried onto it. */
  late: boolean;
}

export interface Day {
  date: string;
  entries: DayEntry[];
}

/** YYYY-MM-DD plus n days, in the calendar (no time zone games). */
export function plusDays(date: string, n: number): string {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}

/**
 * Your open, dated things for the next `count` days, by day: to-dos, goal steps and goals' deadlines.
 * Anything late lands on the first day. Only your own items; others' are theirs to plan.
 */
export function upcoming(
  spaces: readonly SpaceSummary[],
  views: Record<string, SpaceState | undefined>,
  userId: string,
  from: string,
  count = 7,
): { days: Day[]; habits: DayEntry[] } {
  const days: Day[] = Array.from({ length: count }, (_, i) => ({ date: plusDays(from, i), entries: [] }));
  const last = days.at(-1)!.date;
  const habits: DayEntry[] = [];
  for (const s of spaces) {
    const view = views[s.id];
    if (!view) continue;
    for (const item of Object.values(view.items)) {
      if (item.ownerId !== userId || item.status !== "open") continue;
      const base = { spaceId: s.id, spaceName: view.name || s.name, item };
      if (item.kind === "habit") {
        habits.push({ ...base, late: false });
        continue;
      }
      if (!item.dueOn || item.dueOn > last) continue;
      const late = item.dueOn < from;
      const day = days.find((d) => d.date === (late ? from : item.dueOn))!;
      day.entries.push({ ...base, late });
    }
  }
  for (const d of days)
    d.entries.sort(
      (a, b) =>
        Number(b.late) - Number(a.late) ||
        (a.item.dueTime ?? "99").localeCompare(b.item.dueTime ?? "99") ||
        a.item.title.localeCompare(b.item.title),
    );
  habits.sort((a, b) => a.item.title.localeCompare(b.item.title));
  return { days, habits };
}
