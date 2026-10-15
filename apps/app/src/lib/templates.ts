/** Starters for common goals, offered in quick add when the box is empty. */
export interface Template {
  label: string;
  /** What gets created: a goal with steps and a deadline, or a habit. */
  kind: "goal" | "habit";
  title: string;
  /** Goals: weeks from today to the deadline. */
  weeks?: number;
  steps?: string[];
  /** Habits: times a week. */
  timesPerWeek?: number;
}

export const TEMPLATES: Template[] = [
  {
    label: "Launch v1",
    kind: "goal",
    title: "Launch v1",
    weeks: 6,
    steps: [
      "Landing page live",
      "Core feature working",
      "Invite 10 beta users",
      "Fix the top 3 bugs",
      "Write the launch post",
    ],
  },
  {
    label: "First 10 users",
    kind: "goal",
    title: "Get the first 10 users",
    weeks: 4,
    steps: [
      "List 30 people who have the problem",
      "Reach out to 10 people",
      "Book 5 calls",
      "Onboard the first user",
      "Get to 10 users",
    ],
  },
  {
    label: "Raise a round",
    kind: "goal",
    title: "Raise a round",
    weeks: 12,
    steps: [
      "Write the one-pager",
      "Build the investor list",
      "Practice the pitch with 3 friends",
      "Take the first 10 meetings",
      "Close the lead investor",
    ],
  },
  { label: "Train 4x a week", kind: "habit", title: "Train", timesPerWeek: 4 },
];
