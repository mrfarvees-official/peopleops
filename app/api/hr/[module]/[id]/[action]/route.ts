import { api, requestCtx, requireApiUser } from "@/server/http";
import { getHrModule } from "@/server/hr";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ module: string; id: string; action: string }> };

// POST /api/hr/leave-requests/:id/approve   body (optional): { "note": "..." }
// "restore" brings a deleted record back; every other name is a workflow step.
export const POST = api(
  async (req: Request, { params }: Ctx) => {
    const user = await requireApiUser();
    const { module, id, action } = await params;
    const m = getHrModule(module);
    const ctx = await requestCtx();
    if (action === "restore") return Response.json({ record: await m.restore(user, id, ctx) });
    const text = await req.text();
    const body = text.trim() ? JSON.parse(text) : {};
    return Response.json({
      record: await m.act(user, action, id, { note: typeof body.note === "string" ? body.note : undefined }, ctx),
    });
  },
  { mutating: true },
);
