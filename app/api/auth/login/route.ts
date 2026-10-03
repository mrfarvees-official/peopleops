import { ZodError } from "zod";
import { InvalidCredentialsError } from "@/platform/domain/auth";
import { getAuth } from "@/server/auth";
import { requestInfo, sameOrigin, setSessionCookie } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!sameOrigin(req)) return new Response("Forbidden", { status: 403 });
  try {
    const { token, expiresAt, user } = await getAuth().login(
      await req.json(),
      await requestInfo(),
    );
    await setSessionCookie(token, expiresAt);
    return Response.json({ user });
  } catch (e) {
    if (e instanceof InvalidCredentialsError) {
      return Response.json(
        { error: "Invalid sign-in details" },
        { status: 401 },
      );
    }
    if (e instanceof ZodError || e instanceof SyntaxError) {
      return Response.json({ error: "Invalid request" }, { status: 400 });
    }
    throw e;
  }
}
