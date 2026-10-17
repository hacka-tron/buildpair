import type { Item, Repeat } from "@buildpair/protocol";

/** Monday of the week containing `day` (YYYY-MM-DD), as YYYY-MM-DD. */
export function weekStart(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  const offset = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - offset);
  return d.toISOString().slice(0, 10);
}

/** Check-offs in the week containing `today`, against the habit's weekly target. */
export function weekProgress(item: Item, today: string): { done: number; target: number } {
  const start = weekStart(today);
  const end = new Date(`${start}T00:00:00Z`);
  end.setUTCDate(end.getUTCDate() + 7);
  const endDay = end.toISOString().slice(0, 10);
  const done = item.doneOn.filter((d) => d >= start && d < endDay).length;
  return { done, target: item.timesPerWeek ?? 0 };
}

const addDays = (day: string, n: number) => {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/**
 * The first date a repeating to-do falls on strictly after `after`. A monthly one keeps its day of the
 * month (`anchor`), landing on the month's last day when it's shorter (Jan 31, Feb 28, Mar 31).
 */
export function nextRepeat(repeat: Repeat, after: string, anchor: string): string {
  if (repeat.kind === "days") {
    // Counted from the anchor, so the rhythm holds even when it's ticked late.
    const step = repeat.every;
    const gap = Math.round(
      (Date.parse(`${after}T00:00:00Z`) - Date.parse(`${anchor}T00:00:00Z`)) / 86_400_000,
    );
    return addDays(anchor, gap < 0 ? 0 : (Math.floor(gap / step) + 1) * step);
  }
  if (repeat.kind === "week") {
    for (let i = 1; i <= 7; i++) {
      const d = addDays(after, i);
      if (repeat.days.includes(new Date(`${d}T00:00:00Z`).getUTCDay())) return d;
    }
    return addDays(after, 7);
  }
  const day = Number(anchor.slice(8, 10));
  let y = Number(after.slice(0, 4));
  let m = Number(after.slice(5, 7)) - 1;
  for (;;) {
    const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    const d = `${y}-${String(m + 1).padStart(2, "0")}-${String(Math.min(day, last)).padStart(2, "0")}`;
    if (d > after) return d;
    m++;
    if (m === 12) {
      m = 0;
      y++;
    }
  }
}

/** The first date it falls on counting `from` itself (for a new repeating to-do). */
export function firstRepeat(repeat: Repeat, from: string): string {
  return repeat.kind === "week" ? nextRepeat(repeat, addDays(from, -1), from) : from;
}
