import { api, requestCtx, requireApiUser } from "@/server/http";
import { getPbacAdmin } from "@/server/pbac";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = api(async () => {
  const user = await requireApiUser();
  return Response.json({
    policies: await getPbacAdmin().list(user, await requestCtx()),
  });
});

export const POST = api(
  async (req) => {
    const user = await requireApiUser();
    const policy = await getPbacAdmin().create(
      user,
      await req.json(),
      await requestCtx(),
    );
    return Response.json({ policy }, { status: 201 });
  },
  { mutating: true },
);
