import { api, requestCtx, requireApiUser } from "@/server/http";
import { getDataTransfer } from "@/server/data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Tables the caller may export or import, with their columns.
export const GET = api(async () => {
  const user = await requireApiUser();
  return Response.json({
    tables: await getDataTransfer().list(user, await requestCtx()),
  });
});
