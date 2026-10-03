export const THEMES = [
  { id: "dark", label: "Dark" },
  { id: "light", label: "Light" },
  { id: "ocean", label: "Ocean" },
] as const;

export type ThemeId = (typeof THEMES)[number]["id"];

export const DEFAULT_THEME: ThemeId = "dark"; // change this to set the default
export const THEME_COOKIE = "peopleops_theme";

export const isThemeId = (v: string | undefined): v is ThemeId =>
  THEMES.some((t) => t.id === v);
