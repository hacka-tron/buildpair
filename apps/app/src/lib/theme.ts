/** Buildpair design tokens (Margin Notes direction). Light theme first; dark comes with the design system work. */
export const colors = {
  bg: "#FFFFFF",
  surface: "#F7F8FB",
  ink: "#151A26",
  sub: "#5D6474",
  faint: "#8A90A0",
  line: "#E6E8EF",
  blue: "#3557D6",
  royal: "#4169E1",
  tint: "#EEF2FE",
  noteInk: "#1D2C66",
  danger: "#B3261E",
} as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { chip: 8, control: 10, card: 12, sheet: 16 } as const;
export const type = { title: 24, section: 17, body: 15, secondary: 13, caption: 11 } as const;
