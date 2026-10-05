import { z } from "zod";
import { api, requestCtx, requireApiUser } from "@/server/http";
import { getSettingsAdmin } from "@/server/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ key: string }> };

const body = z.object({
  value: z.union([z.number(), z.string(), z.boolean()]),
});

export const GET = api(async (_req: Request, { params }: Ctx) => {
  const user = await requireApiUser();
  const { key } = await params;
  return Response.json({
    setting: await getSettingsAdmin().get(user, key, await requestCtx()),
  });
});

// Body: { "value": 1 }. Flags take 0 or 1 (true and false are accepted too).
export const PUT = api(
  async (req: Request, { params }: Ctx) => {
    const user = await requireApiUser();
    const { key } = await params;
    const { value } = body.parse(await req.json());
    return Response.json({
      setting: await getSettingsAdmin().set(user, key, value, await requestCtx()),
    });
  },
  { mutating: true },
);
