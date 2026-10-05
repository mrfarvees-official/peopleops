import { api, requestCtx, requireApiUser } from "@/server/http";
import { getHrModule } from "@/server/hr";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ module: string }> };

// GET /api/hr/employees?search=&page=1&size=25&deleted=true&status=active
// Any query key that the module lists as a filter narrows the result.
export const GET = api(async (req: Request, { params }: Ctx) => {
  const user = await requireApiUser();
  const { module } = await params;
  const url = new URL(req.url);
  const filters: Record<string, string> = {};
  for (const [k, v] of url.searchParams) {
    if (!["search", "page", "size", "deleted"].includes(k) && v) filters[k] = v;
  }
  const result = await getHrModule(module).list(
    user,
    {
      search: url.searchParams.get("search") ?? undefined,
      page: Number(url.searchParams.get("page")) || 1,
      size: Number(url.searchParams.get("size")) || undefined,
      deleted: url.searchParams.get("deleted") === "true",
      filters,
    },
    await requestCtx(),
  );
  return Response.json(result);
});

export const POST = api(
  async (req: Request, { params }: Ctx) => {
    const user = await requireApiUser();
    const { module } = await params;
    const record = await getHrModule(module).create(user, await req.json(), await requestCtx());
    return Response.json({ record }, { status: 201 });
  },
  { mutating: true },
);
