/** Buildpair design tokens (Margin Notes direction). Light theme first; dark comes with the design system work. */
export const colors = {
  bg: "#FFFFFF",
  surface: "#F7F8FB",
  sidebar: "#F7F8FB",
  ink: "#151A26",
  sub: "#5D6474",
  faint: "#8A90A0",
  line: "#E6E8EF",
  blue: "#3557D6",
  royal: "#4169E1",
  tint: "#EEF2FE",
  noteInk: "#1D2C66",
  danger: "#B3261E",
  online: "#2F9E5B",
} as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { chip: 8, control: 10, card: 12, sheet: 16 } as const;
export const type = { title: 28, section: 17, body: 15, secondary: 13, caption: 11 } as const;

/** Width at which the app switches to the desktop layout (sidebar, side panels). */
export const WIDE = 900;

const SPACE_COLORS = ["#3557D6", "#2F8F5B", "#C0392B", "#7A4FB5", "#C47F0C", "#1F7A8C", "#5D6474"];
const PERSON_COLORS = [
  "#C47F0C",
  "#2F7A6B",
  "#8E5A2B",
  "#B04A7E",
  "#3557D6",
  "#7A4FB5",
  "#C0392B",
  "#4A7FA8",
];

const hash = (s: string) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);

/** A space's automatic color, stable for its ID. */
export const spaceColor = (id: string) => SPACE_COLORS[hash(id) % SPACE_COLORS.length]!;
/** A person's avatar color, stable for their ID. */
export const personColor = (id: string) => PERSON_COLORS[hash(id) % PERSON_COLORS.length]!;
