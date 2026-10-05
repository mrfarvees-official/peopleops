"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { FiLogOut, FiSettings, FiUser } from "react-icons/fi";
import { logoutAction } from "@/features/auth/actions";

export interface ProfileMenuUser {
  name: string;
  email: string;
  roles: string; // already readable, e.g. "Super admin"
}

/**
 * One menu for everything personal: profile, settings, log out.
 * `opens` says which way the panel unfolds ("up" in the sidebar, "down" in the header).
 */
export function ProfileMenu({
  user,
  opens,
  wide = false,
}: {
  user: ProfileMenuUser;
  opens: "up" | "down";
  wide?: boolean; // full-width trigger (sidebar) vs compact (header)
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const item =
    "flex w-full items-center gap-2 rounded px-3 py-2 text-left text-sm hover:bg-surface-2";

  return (
    <div ref={root} className={`relative ${wide ? "w-full" : ""}`}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-2 rounded border px-2 py-1.5 text-sm hover:bg-surface-2 ${
          wide ? "w-full" : ""
        }`}
      >
        <span
          aria-hidden
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold text-accent-foreground"
        >
          {user.name.charAt(0).toUpperCase()}
        </span>
        <span
          className={`min-w-0 text-left ${wide ? "flex-1" : "hidden sm:block"}`}
        >
          <span className="block truncate font-medium">{user.name}</span>
          {wide && (
            <span className="block truncate text-xs text-muted">
              {user.roles}
            </span>
          )}
        </span>
      </button>

      {open && (
        <div
          role="menu"
          className={`absolute z-50 w-60 rounded border bg-surface p-1 shadow-lg ${
            opens === "up" ? "bottom-full mb-2 left-0" : "top-full mt-2 right-0"
          }`}
        >
          <div className="border-b px-3 py-2">
            <p className="truncate text-sm font-medium">{user.name}</p>
            <p className="truncate text-xs text-muted">{user.email}</p>
            <p className="truncate text-xs text-muted">{user.roles}</p>
          </div>
          <Link
            role="menuitem"
            href="/profile"
            className={item}
            onClick={() => setOpen(false)}
          >
            <FiUser aria-hidden /> My profile
          </Link>
          <Link
            role="menuitem"
            href="/settings"
            className={item}
            onClick={() => setOpen(false)}
          >
            <FiSettings aria-hidden /> Settings
          </Link>
          <form action={logoutAction}>
            <button
              type="submit"
              role="menuitem"
              className={`${item} text-danger`}
            >
              <FiLogOut aria-hidden /> Log out
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
