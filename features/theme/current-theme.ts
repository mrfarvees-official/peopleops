import "server-only";

import { cookies } from "next/headers";
import { DEFAULT_THEME, THEME_COOKIE, isThemeId, type ThemeId } from "./themes";

export async function getCurrentTheme(): Promise<ThemeId> {
  const saved = (await cookies()).get(THEME_COOKIE)?.value;
  return isThemeId(saved) ? saved : DEFAULT_THEME;
}
