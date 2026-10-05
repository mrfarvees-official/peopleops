import { api, requestCtx, requireApiUser } from "@/server/http";
import { getHrModule } from "@/server/hr";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ module: string; id: string }> };

export const GET = api(async (_req: Request, { params }: Ctx) => {
  const user = await requireApiUser();
  const { module, id } = await params;
  return Response.json({ record: await getHrModule(module).get(user, id, await requestCtx()) });
});

// Send only the fields to change.
export const PUT = api(
  async (req: Request, { params }: Ctx) => {
    const user = await requireApiUser();
    const { module, id } = await params;
    const record = await getHrModule(module).update(user, id, await req.json(), await requestCtx());
    return Response.json({ record });
  },
  { mutating: true },
);

// Soft delete: the record moves to the trash and can be restored.
export const DELETE = api(
  async (_req: Request, { params }: Ctx) => {
    const user = await requireApiUser();
    const { module, id } = await params;
    await getHrModule(module).remove(user, id, await requestCtx());
    return new Response(null, { status: 204 });
  },
  { mutating: true },
);
