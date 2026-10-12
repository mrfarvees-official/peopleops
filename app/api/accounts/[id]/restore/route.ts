import { getAccounts } from "@/server/accounts";
import { api, requestCtx, requireApiUser } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export const POST = api(
  async (_req: Request, { params }: Ctx) => {
    const user = await requireApiUser();
    const { id } = await params;
    const account = await getAccounts().restore(user, id, await requestCtx());
    return Response.json({ account });
  },
  { mutating: true },
);
