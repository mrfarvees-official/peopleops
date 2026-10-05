import { api, requestCtx, requireApiUser } from "@/server/http";
import { getBackups } from "@/server/data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export const GET = api(async (_req: Request, { params }: Ctx) => {
  const user = await requireApiUser();
  const { id } = await params;
  return Response.json({
    backup: await getBackups().get(user, id, await requestCtx()),
  });
});

export const DELETE = api(
  async (_req: Request, { params }: Ctx) => {
    const user = await requireApiUser();
    const { id } = await params;
    await getBackups().remove(user, id, await requestCtx());
    return new Response(null, { status: 204 });
  },
  { mutating: true },
);
