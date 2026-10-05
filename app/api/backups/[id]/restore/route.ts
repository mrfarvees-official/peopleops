import { api, requestCtx, requireApiUser } from "@/server/http";
import { getBackups } from "@/server/data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/backups/:id/restore?mode=dry-run|apply
// dry-run (default) reports what would change and writes nothing. apply takes a
// safety backup first, then writes every table in one transaction.
export const POST = api(
  async (req: Request, { params }: Ctx) => {
    const user = await requireApiUser();
    const { id } = await params;
    const mode =
      new URL(req.url).searchParams.get("mode") === "apply" ? "apply" : "dry-run";
    return Response.json({
      restore: await getBackups().restore(user, id, { mode }, await requestCtx()),
    });
  },
  { mutating: true },
);
