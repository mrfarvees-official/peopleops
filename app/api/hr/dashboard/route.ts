import { api, requestCtx, requireApiUser } from "@/server/http";
import { getInsights } from "@/server/hr";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = api(async () => {
  const user = await requireApiUser();
  return Response.json({ dashboard: await getInsights().dashboard(user, await requestCtx()) });
});
