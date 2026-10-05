import { z } from "zod";
import { api, requestCtx, requireApiUser } from "@/server/http";
import { getBackups } from "@/server/data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = api(async () => {
  const user = await requireApiUser();
  return Response.json({
    backups: await getBackups().list(user, await requestCtx()),
  });
});

const body = z.object({
  scope: z.enum(["tenant", "platform"]).optional(),
  tenantId: z.string().max(36).optional(),
  note: z.string().max(255).optional(),
});

// Body (all optional): { "scope": "tenant" | "platform", "tenantId": "...", "note": "..." }
export const POST = api(
  async (req: Request) => {
    const user = await requireApiUser();
    const text = await req.text();
    const input = body.parse(text.trim() ? JSON.parse(text) : {});
    const backup = await getBackups().create(user, input, await requestCtx());
    return Response.json({ backup }, { status: 201 });
  },
  { mutating: true },
);
