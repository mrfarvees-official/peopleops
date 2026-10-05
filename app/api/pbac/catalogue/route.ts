import { api, requestCtx, requireApiUser } from "@/server/http";
import { getPbacAdmin } from "@/server/pbac";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = api(async () => {
  const user = await requireApiUser();
  return Response.json(await getPbacAdmin().catalogue(user, await requestCtx()));
});
