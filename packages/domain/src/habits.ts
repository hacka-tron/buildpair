import type { Item } from "@buildpair/protocol";

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
