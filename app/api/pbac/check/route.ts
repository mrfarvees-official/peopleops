import { z } from "zod";
import { api, requestCtx, requireApiUser } from "@/server/http";
import { getPbac } from "@/server/pbac";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const body = z.object({
  action: z.string().min(1).max(64),
  resource: z
    .object({
      type: z.string().min(1).max(64),
      id: z.string().max(64).optional(),
      tenantId: z.string().max(36).optional(),
    })
    .catchall(z.unknown()),
  env: z.record(z.string(), z.unknown()).optional(),
});

// "May I do X to Y?" for the signed-in user. Reports the decision rather than
// answering 403. Omitting resource.tenantId means the user's own tenant.
export const POST = api(
  async (req) => {
    const user = await requireApiUser();
    const input = body.parse(await req.json());
    const decision = await getPbac().authorize(
      user,
      input.action,
      { ...input.resource, tenantId: input.resource.tenantId ?? user.tenantId },
      { ...(await requestCtx()), env: input.env },
    );
    return Response.json({ decision });
  },
  { mutating: true },
);
