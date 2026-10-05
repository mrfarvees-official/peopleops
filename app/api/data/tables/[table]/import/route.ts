import { api, requestCtx, requireApiUser } from "@/server/http";
import { getDataTransfer } from "@/server/data";
import { afterTableImport } from "@/server/hr";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ table: string }> };

// POST /api/data/tables/policies/import?mode=dry-run|apply&format=json|csv&tenantId=...
// The request body is the file itself (JSON or CSV text). dry-run is the default:
// it reports what would happen and keeps nothing. apply writes everything or nothing.
export const POST = api(
  async (req: Request, { params }: Ctx) => {
    const user = await requireApiUser();
    const { table } = await params;
    const url = new URL(req.url);
    const type = req.headers.get("content-type") ?? "";
    const format =
      url.searchParams.get("format") === "csv" || type.includes("text/csv")
        ? "csv"
        : "json";
    const report = await getDataTransfer().import(
      user,
      table,
      {
        body: await req.text(),
        format,
        mode: url.searchParams.get("mode") === "apply" ? "apply" : "dry-run",
        tenantId: url.searchParams.get("tenantId") ?? undefined,
      },
      await requestCtx(),
    );
    await afterTableImport(table, url.searchParams.get("tenantId") || user.tenantId, report.applied);
    return Response.json({ report });
  },
  { mutating: true },
);
