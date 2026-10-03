import { getAuth } from "@/server/auth";
import {
  clearSessionCookie,
  readSessionToken,
  requestInfo,
  sameOrigin,
} from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!sameOrigin(req)) return new Response("Forbidden", { status: 403 });
  await getAuth().logout(await readSessionToken(), await requestInfo());
  await clearSessionCookie();
  return Response.json({ ok: true });
}
