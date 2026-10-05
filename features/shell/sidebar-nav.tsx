"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export interface NavSection {
  title: string;
  items: { label: string; href: string }[];
}

export function SidebarNav({ sections }: { sections: NavSection[] }) {
  const pathname = usePathname();
  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);

  return (
    <nav
      aria-label="Main menu"
      className="flex gap-4 overflow-x-auto p-3 md:flex-col md:gap-6 md:overflow-visible md:p-4"
    >
      {sections.map((s) => (
        <div key={s.title} className="flex items-center gap-2 md:block">
          <h2 className="hidden px-2 text-xs font-semibold uppercase tracking-wide text-muted md:block">
            {s.title}
          </h2>
          <ul className="flex gap-1 md:mt-2 md:flex-col">
            {s.items.map((i) => (
              <li key={i.href}>
                <Link
                  href={i.href}
                  aria-current={isActive(i.href) ? "page" : undefined}
                  className={`block whitespace-nowrap rounded px-3 py-2 text-sm hover:bg-surface-2 ${
                    isActive(i.href)
                      ? "bg-surface-2 font-medium text-foreground"
                      : "text-muted"
                  }`}
                >
                  {i.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}
