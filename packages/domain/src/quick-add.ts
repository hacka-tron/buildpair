/**
 * Reads plain words typed into quick add ("dentist friday 3pm", "gym 4x a week", "launch v1 by nov 21")
 * and pulls out the schedule. The schedule decides the kind: a repeat makes a habit, "by <day>" makes a
 * goal with that deadline, anything else is a to-do. Only clear phrases are taken; anything unsure stays
 * in the title, so nothing is invented.
 */
export interface QuickAdd {
  title: string;
  kind: "todo" | "habit" | "goal";
  dueOn: string | null;
  dueTime: string | null;
  timesPerWeek: number | null;
  /** The phrases that were read as the schedule, as typed, for showing what was understood. */
  understood: string[];
}

const DAYS: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};
const SHORT_DAYS: Record<string, number> = {
  sun: 0,
  mon: 1,
  tue: 2,
  tues: 2,
  wed: 3,
  thu: 4,
  thur: 4,
  thurs: 4,
  fri: 5,
  sat: 6,
};
const MONTHS: Record<string, number> = {
  jan: 0,
  january: 0,
  feb: 1,
  february: 1,
  mar: 2,
  march: 2,
  apr: 3,
  april: 3,
  may: 4,
  jun: 5,
  june: 5,
  jul: 6,
  july: 6,
  aug: 7,
  august: 7,
  sep: 8,
  sept: 8,
  september: 8,
  oct: 9,
  october: 9,
  nov: 10,
  november: 10,
  dec: 11,
  december: 11,
};
const COUNTS: Record<string, number> = {
  once: 1,
  twice: 2,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
};

const DAY_NAME = Object.keys(DAYS).join("|");
const SHORT_NAME = Object.keys(SHORT_DAYS).join("|");
const MONTH_NAME = Object.keys(MONTHS).join("|");
const NUM_WORD = "one|two|three|four|five|six|seven";

// Dates are plain YYYY-MM-DD in the person's own calendar; the arithmetic runs in UTC so it never
// shifts across time zones or daylight saving.
const toDate = (day: string) => new Date(`${day}T00:00:00Z`);
const fmt = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (day: string, n: number) => {
  const d = toDate(day);
  d.setUTCDate(d.getUTCDate() + n);
  return fmt(d);
};
const weekday = (day: string) => toDate(day).getUTCDay();

/** The next given weekday, counting today. */
function nextWeekday(today: string, target: number): string {
  return addDays(today, (target - weekday(today) + 7) % 7);
}

/** A month and day, this year or next if it has already passed. Null for days that don't exist. */
function monthDay(today: string, month: number, day: number): string | null {
  const year = Number(today.slice(0, 4));
  for (const y of [year, year + 1]) {
    const d = new Date(Date.UTC(y, month, day));
    if (d.getUTCMonth() !== month) return null; // Feb 30 and the like
    const s = fmt(d);
    if (s >= today) return s;
  }
  return null;
}

function time(hourText: string, minuteText: string | undefined, meridiem: string | undefined): string | null {
  let hour = Number(hourText);
  const minute = minuteText ? Number(minuteText) : 0;
  if (minute > 59) return null;
  if (meridiem) {
    if (hour < 1 || hour > 12) return null;
    const pm = meridiem.toLowerCase().startsWith("p");
    if (hour === 12) hour = pm ? 12 : 0;
    else if (pm) hour += 12;
  } else if (hour > 23) return null;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

type Rule = { re: RegExp; read: (m: RegExpExecArray, today: string) => Partial<QuickAdd> | null };

const B = "(?<![\\w-])"; // start of a word
const E = "(?![\\w-])"; // end of a word

const REPEATS: Rule[] = [
  { re: new RegExp(`${B}(?:every ?day|daily|each day)${E}`, "i"), read: () => ({ timesPerWeek: 7 }) },
  {
    re: new RegExp(`${B}(?:every weekday|on weekdays|weekdays)${E}`, "i"),
    read: () => ({ timesPerWeek: 5 }),
  },
  {
    re: new RegExp(`${B}(?:every weekend|on weekends|weekends)${E}`, "i"),
    read: () => ({ timesPerWeek: 2 }),
  },
  {
    re: new RegExp(`${B}([1-7]|${NUM_WORD}) ?(?:x|times)(?: (?:a|per|each|every)|/) ?week${E}`, "i"),
    read: (m) => ({ timesPerWeek: Number(m[1]) || COUNTS[m[1]!.toLowerCase()]! }),
  },
  {
    re: new RegExp(`${B}(once|twice) (?:a|per|each|every) week${E}`, "i"),
    read: (m) => ({ timesPerWeek: COUNTS[m[1]!.toLowerCase()]! }),
  },
  { re: new RegExp(`${B}(?:weekly|every week)${E}`, "i"), read: () => ({ timesPerWeek: 1 }) },
  {
    // "every monday", "every mon and thu", "every tue, thu and sat"
    re: new RegExp(
      `${B}every ((?:${DAY_NAME}|${SHORT_NAME})(?:(?:, ?| and | ?& ?)(?:${DAY_NAME}|${SHORT_NAME}))*)${E}`,
      "i",
    ),
    read: (m) => {
      const names = m[1]!.toLowerCase().split(/, ?| and | ?& ?/);
      return { timesPerWeek: new Set(names.map((n) => DAYS[n] ?? SHORT_DAYS[n])).size };
    },
  },
];

const DATES: Rule[] = [
  { re: new RegExp(`${B}(?:today|tonight)${E}`, "i"), read: (_, t) => ({ dueOn: t }) },
  { re: new RegExp(`${B}(?:day after tomorrow)${E}`, "i"), read: (_, t) => ({ dueOn: addDays(t, 2) }) },
  { re: new RegExp(`${B}(?:tomorrow|tmrw|tmr)${E}`, "i"), read: (_, t) => ({ dueOn: addDays(t, 1) }) },
  {
    re: new RegExp(`${B}in (a|an|one|two|three|four|five|six|seven|\\d{1,3}) (day|week|month)s?${E}`, "i"),
    read: (m, t) => {
      const raw = m[1]!.toLowerCase();
      const n = raw === "a" || raw === "an" ? 1 : Number(raw) || COUNTS[raw]!;
      const unit = m[2]!.toLowerCase();
      if (unit === "day") return { dueOn: addDays(t, n) };
      if (unit === "week") return { dueOn: addDays(t, 7 * n) };
      const d = toDate(t);
      const day = d.getUTCDate();
      d.setUTCDate(1);
      d.setUTCMonth(d.getUTCMonth() + n);
      const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
      d.setUTCDate(Math.min(day, last));
      return { dueOn: fmt(d) };
    },
  },
  {
    re: new RegExp(`${B}next week${E}`, "i"),
    read: (_, t) => ({ dueOn: addDays(nextWeekday(t, 1), weekday(t) === 1 ? 7 : 0) }),
  },
  { re: new RegExp(`${B}(?:this )?weekend${E}`, "i"), read: (_, t) => ({ dueOn: nextWeekday(t, 6) }) },
  {
    // ISO: 2026-10-20
    re: new RegExp(`${B}(\\d{4})-(\\d{2})-(\\d{2})${E}`),
    read: (m) => {
      const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
      return d.getUTCDate() === Number(m[3]) ? { dueOn: fmt(d) } : null;
    },
  },
  {
    // "oct 20", "october 20th"
    re: new RegExp(`${B}(${MONTH_NAME})\\.? (\\d{1,2})(?:st|nd|rd|th)?${E}`, "i"),
    read: (m, t) => {
      const d = monthDay(t, MONTHS[m[1]!.toLowerCase()]!, Number(m[2]));
      return d ? { dueOn: d } : null;
    },
  },
  {
    // "20 oct", "20th of october"
    re: new RegExp(`${B}(\\d{1,2})(?:st|nd|rd|th)?(?: of)? (${MONTH_NAME})${E}`, "i"),
    read: (m, t) => {
      const d = monthDay(t, MONTHS[m[2]!.toLowerCase()]!, Number(m[1]));
      return d ? { dueOn: d } : null;
    },
  },
  {
    // "10/20" (month first)
    re: new RegExp(`${B}(\\d{1,2})/(\\d{1,2})${E}`),
    read: (m, t) => {
      const month = Number(m[1]) - 1;
      if (month < 0 || month > 11) return null;
      const d = monthDay(t, month, Number(m[2]));
      return d ? { dueOn: d } : null;
    },
  },
  {
    // "friday", "on fri", "this friday", "next friday". Short names only after a cue word, so
    // "sun cream" or "SAT prep" stay as typed.
    re: new RegExp(
      `${B}(?:(next|this|on) )?(${DAY_NAME})${E}|${B}(next|this|on|by|due) (${SHORT_NAME})\\.?${E}`,
      "i",
    ),
    read: (m, t) => {
      const cue = (m[1] ?? m[3])?.toLowerCase();
      const name = (m[2] ?? m[4])!.toLowerCase();
      const target = DAYS[name] ?? SHORT_DAYS[name]!;
      let d = nextWeekday(t, target);
      // "next friday" is the one in the coming week, not this week's.
      if (cue === "next" && d < nextWeekday(t, 1) && weekday(t) !== 1) d = addDays(d, 7);
      if (cue === "next" && weekday(t) === 1) d = addDays(d, 7);
      return { dueOn: d };
    },
  },
];

const TIMES: Rule[] = [
  { re: new RegExp(`${B}(?:at )?noon${E}`, "i"), read: () => ({ dueTime: "12:00" }) },
  { re: new RegExp(`${B}(?:at )?midnight${E}`, "i"), read: () => ({ dueTime: "00:00" }) },
  {
    // "3pm", "3:30 pm", "at 9am"
    re: new RegExp(`${B}(?:at )?(\\d{1,2})(?::(\\d{2}))? ?([ap]\\.?m\\.?)(?![\\w])`, "i"),
    read: (m) => {
      const t = time(m[1]!, m[2], m[3]);
      return t ? { dueTime: t } : null;
    },
  },
  {
    // "at 15:00", "at 9:30" (24-hour, needs "at" and minutes so "v1.5" or "2:1" stay)
    re: new RegExp(`${B}at (\\d{1,2}):(\\d{2})${E}`, "i"),
    read: (m) => {
      const t = time(m[1]!, m[2], undefined);
      return t ? { dueTime: t } : null;
    },
  },
];

const DEADLINE = new RegExp(`${B}(?:by|before|due by) $`, "i");

export function parseQuickAdd(text: string, today: string): QuickAdd {
  let rest = ` ${text} `;
  const understood: string[] = [];
  const result: QuickAdd = {
    title: "",
    kind: "todo",
    dueOn: null,
    dueTime: null,
    timesPerWeek: null,
    understood,
  };

  /** Take the first rule that reads cleanly. `trim` can shorten the text before the match. */
  const take = (rules: Rule[], trim?: (before: string) => string) => {
    for (const rule of rules) {
      const m = rule.re.exec(rest);
      if (!m) continue;
      const read = rule.read(m, today);
      if (!read) continue;
      const before = rest.slice(0, m.index);
      Object.assign(result, read);
      understood.push(m[0].trim());
      rest = `${trim ? trim(before) : before} ${rest.slice(m.index + m[0].length)}`;
      return true;
    }
    return false;
  };

  if (take(REPEATS)) {
    result.kind = "habit";
  } else {
    take(DATES, (before) => {
      // "by friday" sets a deadline, which makes a goal.
      const cue = DEADLINE.exec(before);
      if (!cue) return before;
      result.kind = "goal";
      return before.slice(0, cue.index);
    });
    if (take(TIMES) && !result.dueOn) result.dueOn = today;
    // A goal's deadline is a day; a time on it would mean nothing.
    if (result.kind === "goal") result.dueTime = null;
  }

  result.title = rest
    .replace(/\s+/g, " ")
    .replace(/\s+(?:on|at|by|due|for|every|this|next|,)$/i, "")
    .trim();
  // If everything was read as the schedule, keep the words as the title instead of leaving it empty.
  if (!result.title)
    return {
      title: text.trim(),
      kind: "todo",
      dueOn: null,
      dueTime: null,
      timesPerWeek: null,
      understood: [],
    };
  return result;
}

/** A time typed on its own ("3pm", "9:30 am", "15:00", "noon") as HH:MM, or null if it isn't clear. */
export function parseTime(text: string): string | null {
  const t = text.trim();
  if (/^\d{1,2}:\d{2}$/.test(t)) {
    const [h, m] = t.split(":");
    return time(h!, m, undefined);
  }
  for (const rule of TIMES) {
    const m = rule.re.exec(` ${t} `);
    if (m && m[0].trim().length === t.length) return rule.read(m, "")?.dueTime ?? null;
  }
  return null;
}
