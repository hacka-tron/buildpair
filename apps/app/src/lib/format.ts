import type { Repeat } from "@buildpair/protocol";
/** Today's local date as YYYY-MM-DD, the format items and completions use. */
export function localToday(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

/** "Saturday, October 10" */
export function longDate(now = new Date()): string {
  return now.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
}

/** "now", "5 min ago", "3 hr ago", "Thu", "Oct 3" */
export function ago(iso: string, now = Date.now()): string {
  const then = new Date(iso);
  const s = Math.max(0, (now - then.getTime()) / 1000);
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} hr ago`;
  if (s < 6 * 86400) return then.toLocaleDateString(undefined, { weekday: "short" });
  return then.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** "15:30" as "3:30 PM". */
export function timeLabel(time: string): string {
  const [h = 0, m = 0] = time.split(":").map(Number);
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

/** A due date relative to today: "Today", "Tomorrow", "Yesterday", "Fri", "Oct 20", with the time if set. */
export function dueLabel(
  dueOn: string,
  today = localToday(),
  dueTime: string | null = null,
): { text: string; late: boolean } {
  const day = dayLabel(dueOn, today);
  return dueTime ? { ...day, text: `${day.text} ${timeLabel(dueTime)}` } : day;
}

/** Days from `from` to `to`, both YYYY-MM-DD. */
export function daysBetween(from: string, to: string): number {
  const day = (d: string) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) / 86400000;
  return day(to) - day(from);
}

function dayLabel(dueOn: string, today: string): { text: string; late: boolean } {
  const day = (d: string) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) / 86400000;
  const diff = day(dueOn) - day(today);
  const late = diff < 0;
  if (diff === 0) return { text: "Today", late };
  if (diff === 1) return { text: "Tomorrow", late };
  if (diff === -1) return { text: "Yesterday", late };
  const date = new Date(`${dueOn}T12:00:00`);
  if (diff > 1 && diff < 7) return { text: date.toLocaleDateString(undefined, { weekday: "short" }), late };
  return { text: date.toLocaleDateString(undefined, { month: "short", day: "numeric" }), late };
}

/** "You", "You and Jordan", "You, Jordan and 3 friends" */
export function peopleLine(names: string[]): string {
  const [first, ...rest] = names;
  if (!first) return "";
  if (rest.length === 0) return first;
  if (rest.length === 1) return `${first} and ${rest[0]}`;
  return `${first}, ${rest[0]} and ${rest.length - 1} ${rest.length - 1 === 1 ? "other" : "others"}`;
}

const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** "Every Mon", "Every Mon, Thu", "Weekdays", "Weekends", "Every month", "Every 3 days". */
export function repeatLabel(repeat: Repeat): string {
  if (repeat.kind === "month") return "Every month";
  if (repeat.kind === "days") return repeat.every === 1 ? "Every day" : `Every ${repeat.every} days`;
  const days = [...repeat.days].sort();
  const key = days.join(",");
  if (key === "1,2,3,4,5") return "Weekdays";
  if (key === "0,6") return "Weekends";
  if (days.length === 7) return "Every day";
  // Monday first, the way the week reads.
  return `Every ${[...days]
    .sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7))
    .map((d) => DAY_SHORT[d])
    .join(", ")}`;
}
