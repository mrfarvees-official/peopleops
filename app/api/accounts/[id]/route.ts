import { getAccounts } from "@/server/accounts";
import { api, requestCtx, requireApiUser } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export const GET = api(async (_req: Request, { params }: Ctx) => {
  const user = await requireApiUser();
  const { id } = await params;
  return Response.json({ account: await getAccounts().get(user, id, await requestCtx()) });
});

export const PUT = api(
  async (req: Request, { params }: Ctx) => {
    const user = await requireApiUser();
    const { id } = await params;
    const account = await getAccounts().update(user, id, await req.json(), await requestCtx());
    return Response.json({ account });
  },
  { mutating: true },
);

export const DELETE = api(
  async (_req: Request, { params }: Ctx) => {
    const user = await requireApiUser();
    const { id } = await params;
    await getAccounts().remove(user, id, await requestCtx());
    return new Response(null, { status: 204 });
  },
  { mutating: true },
);
