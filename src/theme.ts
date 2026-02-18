// ── Theme System ──
// Defines color palettes for Dark, Light, and Colorblind (deuteranopia-safe) themes.

export interface ThemeColors {
  bg: string;
  s1: string;
  s2: string;
  s3: string;
  b1: string;
  b2: string;
  t1: string;
  t2: string;
  t3: string;
  accent: string;
  accentDim: string;
  ok: string;
  okDim: string;
  warn: string;
  warnDim: string;
  err: string;
  errDim: string;
  cyan: string;
  purple: string;
  pink: string;
  orange: string;
}

export type ThemeId = "dark" | "light" | "colorblind";

export const DARK: ThemeColors = {
  bg: "#06080c",
  s1: "#0c1018",
  s2: "#121a26",
  s3: "#1a2438",
  b1: "#1c2840",
  b2: "#2a4060",
  t1: "#e8f0fa",
  t2: "#9ab0cc",
  t3: "#546880",
  accent: "#3b9eff",
  accentDim: "#122a48",
  ok: "#2ecc71",
  okDim: "#0a2816",
  warn: "#f0a030",
  warnDim: "#2a1c06",
  err: "#e74c3c",
  errDim: "#2a0c0c",
  cyan: "#22d3ee",
  purple: "#a78bfa",
  pink: "#f472b6",
  orange: "#fb923c",
};

export const LIGHT: ThemeColors = {
  bg: "#f5f5f7",
  s1: "#ffffff",
  s2: "#f0f0f2",
  s3: "#e4e4e8",
  b1: "#d0d0d8",
  b2: "#b0b0bc",
  t1: "#1a1a2e",
  t2: "#4a4a5e",
  t3: "#8888a0",
  accent: "#2563eb",
  accentDim: "#dbeafe",
  ok: "#16a34a",
  okDim: "#dcfce7",
  warn: "#d97706",
  warnDim: "#fef3c7",
  err: "#dc2626",
  errDim: "#fee2e2",
  cyan: "#0891b2",
  purple: "#7c3aed",
  pink: "#db2777",
  orange: "#ea580c",
};

export const COLORBLIND: ThemeColors = {
  bg: "#06080c",
  s1: "#0c1018",
  s2: "#121a26",
  s3: "#1a2438",
  b1: "#1c2840",
  b2: "#2a4060",
  t1: "#e8f0fa",
  t2: "#9ab0cc",
  t3: "#546880",
  accent: "#3b9eff",
  accentDim: "#122a48",
  ok: "#56b4e9",       // Blue instead of green (deuteranopia-safe)
  okDim: "#0c1e2e",
  warn: "#e69f00",     // Orange-yellow (safe)
  warnDim: "#2a1c06",
  err: "#cc79a7",      // Pink instead of red (deuteranopia-safe)
  errDim: "#2a0c1e",
  cyan: "#009e73",     // Teal (safe)
  purple: "#a78bfa",
  pink: "#cc79a7",
  orange: "#e69f00",
};

export const THEMES: Record<ThemeId, ThemeColors> = {
  dark: DARK,
  light: LIGHT,
  colorblind: COLORBLIND,
};
