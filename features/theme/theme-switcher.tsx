"use client";

import { useState } from "react";
import { THEMES, THEME_COOKIE, type ThemeId } from "./themes";

export function ThemeSwitcher({ initial }: { initial: ThemeId }) {
  const [theme, setTheme] = useState<ThemeId>(initial);

  function change(next: ThemeId) {
    setTheme(next);
    document.documentElement.dataset.theme = next; // instant, no reload
    document.cookie = `${THEME_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
  }

  return (
    <select
      aria-label="Theme"
      value={theme}
      onChange={(e) => change(e.target.value as ThemeId)}
      className="rounded border bg-surface px-2 py-1 text-sm text-foreground"
    >
      {THEMES.map((t) => (
        <option key={t.id} value={t.id}>
          {t.label}
        </option>
      ))}
    </select>
  );
}
