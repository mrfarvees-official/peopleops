import { api, requestCtx, requireApiUser } from "@/server/http";
import { getHrModule } from "@/server/hr";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ module: string }> };

// Fields, columns, actions and the dropdown options the caller may use.
export const GET = api(async (_req: Request, { params }: Ctx) => {
  const user = await requireApiUser();
  const { module } = await params;
  const ctx = await requestCtx();
  const m = getHrModule(module);
  return Response.json({ meta: await m.meta(user, ctx), options: await m.options(user, ctx) });
});
