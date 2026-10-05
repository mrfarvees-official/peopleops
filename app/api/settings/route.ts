import { api, requestCtx, requireApiUser } from "@/server/http";
import { getSettingsAdmin } from "@/server/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Every known setting with its current value (or default).
export const GET = api(async () => {
  const user = await requireApiUser();
  return Response.json({
    settings: await getSettingsAdmin().list(user, await requestCtx()),
  });
});
