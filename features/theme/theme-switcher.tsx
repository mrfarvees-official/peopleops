"use client";

import { useState } from "react";
import { FiDroplet, FiMoon, FiSun } from "react-icons/fi";
import { THEMES, THEME_COOKIE, type ThemeId } from "./themes";

const ICONS: Record<ThemeId, React.ComponentType<{ className?: string }>> = {
  dark: FiMoon,
  light: FiSun,
  ocean: FiDroplet,
};

// Outside the component: writes to document, which React's lint rules forbid in render scope.
function applyTheme(next: ThemeId) {
  document.documentElement.dataset.theme = next; // instant, no reload
  document.cookie = `${THEME_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
}

export function ThemeSwitcher({ initial }: { initial: ThemeId }) {
  const [theme, setTheme] = useState<ThemeId>(initial);

  function change(next: ThemeId) {
    setTheme(next);
    applyTheme(next);
  }

  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      className="inline-flex rounded border bg-surface p-0.5"
    >
      {THEMES.map((t) => {
        const Icon = ICONS[t.id];
        const active = theme === t.id;
        return (
          <button
            key={t.id}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={t.label}
            title={t.label}
            onClick={() => change(t.id)}
            className={`flex items-center gap-1.5 rounded px-3 py-1.5 text-sm ${
              active
                ? "bg-accent text-accent-foreground"
                : "text-muted hover:bg-surface-2"
            }`}
          >
            <Icon className="h-4 w-4" />
            <span>{t.label}</span>
          </button>
        );
      })}
    </div>
  );
}
