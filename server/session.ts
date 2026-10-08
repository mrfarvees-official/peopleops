import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuth } from "./auth";
import { container } from "./composition";
import { cache } from "react";

export const SESSION_COOKIE = "peopleops_session";

export async function setSessionCookie(token: string, expiresAt: Date) {
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: container.config.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export async function readSessionToken() {
  return (await cookies()).get(SESSION_COOKIE)?.value;
}

export async function clearSessionCookie() {
  (await cookies()).delete(SESSION_COOKIE);
}

export async function requestInfo() {
  const h = await headers();
  return {
    ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() || undefined,
    userAgent: h.get("user-agent") ?? undefined,
  };
}

// CSRF defence for cookie-authenticated POSTs (on top of sameSite=lax).
export function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true;
  const url = new URL(req.url);
  if (origin === url.origin) return true;
  // Behind a TLS-terminating proxy the app sees http, but the browser's Origin is https.
  const first = (v: string | null) => v?.split(",")[0]?.trim() || undefined;
  const proto = first(req.headers.get("x-forwarded-proto")) ?? url.protocol.replace(":", "");
  const host = first(req.headers.get("x-forwarded-host")) ?? req.headers.get("host") ?? url.host;
  return origin === `${proto}://${host}`;
}

export const getCurrentUser = cache(async () =>
  getAuth().getSession(await readSessionToken()),
);

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}
