import { describe, expect, it } from "vitest";
import { parseQuickAdd } from "../src";

// Thursday, October 15 2026.
const TODAY = "2026-10-15";
const read = (text: string) => {
  const { understood: _, ...rest } = parseQuickAdd(text, TODAY);
  return rest;
};
const todo = (title: string, dueOn: string | null = null, dueTime: string | null = null) => ({
  title,
  kind: "todo",
  dueOn,
  dueTime,
  timesPerWeek: null,
});

describe("quick add: days and times", () => {
  it.each([
    ["dentist friday 3pm", todo("dentist", "2026-10-16", "15:00")],
    ["dentist on friday at 3:30 pm", todo("dentist", "2026-10-16", "15:30")],
    ["pay rent today", todo("pay rent", "2026-10-15")],
    ["call mom tonight", todo("call mom", "2026-10-15")],
    ["email Sam tomorrow", todo("email Sam", "2026-10-16")],
    ["email Sam tmrw 9am", todo("email Sam", "2026-10-16", "09:00")],
    ["groceries day after tomorrow", todo("groceries", "2026-10-17")],
    ["review thursday", todo("review", "2026-10-15")],
    ["next friday standup", todo("standup", "2026-10-23")],
    ["standup next monday", todo("standup", "2026-10-19")],
    ["haircut this weekend", todo("haircut", "2026-10-17")],
    ["renew passport in 2 weeks", todo("renew passport", "2026-10-29")],
    ["follow up in a day", todo("follow up", "2026-10-16")],
    ["taxes in 3 months", todo("taxes", "2027-01-15")],
    ["plan trip next week", todo("plan trip", "2026-10-19")],
    ["party oct 31", todo("party", "2026-10-31")],
    ["party October 31st 8pm", todo("party", "2026-10-31", "20:00")],
    ["dinner 20 nov", todo("dinner", "2026-11-20")],
    ["birthday 3rd of march", todo("birthday", "2027-03-03")],
    ["dentist on 10/20", todo("dentist", "2026-10-20")],
    ["Sun 2pm brunch", todo("brunch", "2026-10-18", "14:00")],
    ["pick up kids mon 3pm", todo("pick up kids", "2026-10-19", "15:00")],
    ["standup at 09:30", todo("standup", "2026-10-15", "09:30")],
    ["visa nov 3 2027", todo("visa", "2027-11-03")],
    ["visa 3 nov, 2027", todo("visa", "2027-11-03")],
    ["visa 2026-12-01", todo("visa", "2026-12-01")],
    ["standup at noon", todo("standup", "2026-10-15", "12:00")],
    ["lunch 12pm", todo("lunch", "2026-10-15", "12:00")],
    ["flight 12am", todo("flight", "2026-10-15", "00:00")],
    ["meet on tue", todo("meet", "2026-10-20")],
    ["call at 15:00 tomorrow", todo("call", "2026-10-16", "15:00")],
  ])("%s", (text, expected) => expect(read(text)).toEqual(expected));
});

describe("quick add: repeats make habits", () => {
  it.each([
    ["gym 4x a week", 4],
    ["gym 4 times a week", 4],
    ["gym 3x/week", 3],
    ["read three times per week", 3],
    ["stretch every day", 7],
    ["meditate daily", 7],
    ["standup every weekday", 5],
    ["long run weekends", 2],
    ["call grandma once a week", 1],
    ["swim twice a week", 2],
    ["review finances weekly", 1],
    ["vitamins 7 days a week", 7],
    ["yoga every monday", 1],
    ["climb every tue and thu", 2],
    ["piano every mon, wed and fri", 3],
  ])("%s", (text, times) => {
    const r = parseQuickAdd(text, TODAY);
    expect(r).toMatchObject({ kind: "habit", timesPerWeek: times, dueOn: null, dueTime: null });
    expect(r.title).not.toMatch(/week|every|daily|day/i);
  });
});

describe("quick add: deadlines make goals", () => {
  it.each([
    ["launch v1 by nov 21", "launch v1", "2026-11-21"],
    ["finish thesis by friday", "finish thesis", "2026-10-16"],
    ["ship pricing page before oct 30", "ship pricing page", "2026-10-30"],
    ["first 10 users due by dec 1", "first 10 users", "2026-12-01"],
    ["pay invoice by 10/30", "pay invoice", "2026-10-30"],
  ])("%s", (text, title, dueOn) =>
    expect(read(text)).toEqual({ title, kind: "goal", dueOn, dueTime: null, timesPerWeek: null }),
  );
});

describe("quick add: leaves unclear words alone", () => {
  it.each([
    "buy sun cream",
    "SAT prep",
    "march in the parade",
    "may the best idea win",
    "read chapter 2:1",
    "fix v1.5 login",
    "call 911",
    "order 3 pizzas",
    "watch Friday Night Lights",
    "file Feb 30 report",
    "read 3/4 of the book",
    "add 1/2 cup sugar",
    "check pr 4/5",
    "write weekly report",
    "daily standup notes",
    "update daily log",
    "plan weekend trip",
    "meeting at 7:30",
    "monday.com setup",
  ])("%s", (text) => {
    const r = parseQuickAdd(text, TODAY);
    if (text === "watch Friday Night Lights") {
      // A real weekday name is read; the person can undo it in the add bar.
      expect(r.dueOn).toBe("2026-10-16");
      return;
    }
    expect(r).toEqual({
      title: text,
      kind: "todo",
      dueOn: null,
      dueTime: null,
      timesPerWeek: null,
      understood: [],
    });
  });

  it("keeps a time in a goal's words, since a deadline is a day", () => {
    expect(read("launch v1 by nov 21 at 5pm")).toEqual({
      title: "launch v1 at 5pm",
      kind: "goal",
      dueOn: "2026-11-21",
      dueTime: null,
      timesPerWeek: null,
    });
  });

  it("keeps the words when the schedule is all there is", () => {
    expect(read("tomorrow")).toEqual(todo("tomorrow"));
  });

  it("drops a trailing cue word or stray punctuation from the title", () => {
    expect(read("pay bill due on 11/20").title).toBe("pay bill");
    expect(read("call friday.").title).toBe("call");
  });

  it("leaves very long text as typed, quickly", () => {
    const long = `a${" ".repeat(20000)}b`;
    const started = Date.now();
    expect(parseQuickAdd(long, TODAY).understood).toEqual([]);
    expect(parseQuickAdd(`x${" ".repeat(480)}today`, TODAY).dueOn).toBe(TODAY);
    expect(Date.now() - started).toBeLessThan(200);
  });

  it("rolls past dates into next year", () => {
    expect(read("anniversary jan 5").dueOn).toBe("2027-01-05");
  });

  it("says what it understood", () => {
    expect(parseQuickAdd("dentist friday 3pm", TODAY).understood).toEqual(["friday", "3pm"]);
  });
});
