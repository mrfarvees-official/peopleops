import { api, requestCtx, requireApiUser } from "@/server/http";
import { getHrModule } from "@/server/hr";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ module: string; action: string }> };

// Steps that are not about an existing record, e.g. POST /api/hr/attendance/actions/clock-in
export const POST = api(
  async (req: Request, { params }: Ctx) => {
    const user = await requireApiUser();
    const { module, action } = await params;
    const text = await req.text();
    const body = text.trim() ? JSON.parse(text) : {};
    return Response.json({
      record: await getHrModule(module).act(
        user,
        action,
        null,
        { note: typeof body.note === "string" ? body.note : undefined },
        await requestCtx(),
      ),
    });
  },
  { mutating: true },
);
