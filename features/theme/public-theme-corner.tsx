import { getCurrentTheme } from "./current-theme";
import { ThemeSwitcher } from "./theme-switcher";

/** Theme picker for pages without a Settings screen (home, sign-in). */
export async function PublicThemeCorner() {
  return (
    <div className="fixed bottom-3 right-3 z-50">
      <ThemeSwitcher initial={await getCurrentTheme()} />
    </div>
  );
}
