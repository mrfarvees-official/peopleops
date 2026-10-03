import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Geist, Geist_Mono } from "next/font/google";
import { ThemeSwitcher } from "@/features/theme/theme-switcher";
import {
  DEFAULT_THEME,
  THEME_COOKIE,
  isThemeId,
} from "@/features/theme/themes";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: { default: "PeopleOps", template: "%s · PeopleOps" },
  description: "HR and people operations platform",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const saved = (await cookies()).get(THEME_COOKIE)?.value;
  const theme = isThemeId(saved) ? saved : DEFAULT_THEME;

  return (
    <html
      lang="en"
      data-theme={theme}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-background text-foreground">
        {children}
        {/* Temporary spot: move into your header or user menu later */}
        <div className="fixed bottom-3 right-3 z-50">
          <ThemeSwitcher initial={theme} />
        </div>
      </body>
    </html>
  );
}
