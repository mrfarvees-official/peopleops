import { api, requestCtx, requireApiUser } from "@/server/http";
import { getBackups } from "@/server/data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// The stored backup file (gzip), for keeping a copy somewhere else.
export const GET = api(async (_req: Request, { params }: Ctx) => {
  const user = await requireApiUser();
  const { id } = await params;
  const file = await getBackups().download(user, id, await requestCtx());
  return new Response(Buffer.from(file.bytes), {
    headers: {
      "content-type": file.contentType,
      "content-disposition": `attachment; filename="${file.filename}"`,
      "cache-control": "no-store",
    },
  });
});
