import { api, requestCtx, requireApiUser } from "@/server/http";
import { getDataTransfer } from "@/server/data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ table: string }> };

// GET /api/data/tables/policies/export?format=json|csv&tenantId=...
export const GET = api(async (req: Request, { params }: Ctx) => {
  const user = await requireApiUser();
  const { table } = await params;
  const url = new URL(req.url);
  const format = url.searchParams.get("format") === "csv" ? "csv" : "json";
  const file = await getDataTransfer().export(
    user,
    table,
    { format, tenantId: url.searchParams.get("tenantId") ?? undefined },
    await requestCtx(),
  );
  return new Response(file.body, {
    headers: {
      "content-type": file.contentType,
      "content-disposition": `attachment; filename="${file.filename}"`,
      "x-row-count": String(file.rows),
      "cache-control": "no-store",
    },
  });
});
