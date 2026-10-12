import { getAccounts } from "@/server/accounts";
import { api, requestCtx, requireApiUser } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = api(async (req) => {
  const user = await requireApiUser();
  const includeRemoved = new URL(req.url).searchParams.get("removed") === "1";
  return Response.json({
    accounts: await getAccounts().list(user, { includeRemoved }, await requestCtx()),
  });
});

export const POST = api(
  async (req) => {
    const user = await requireApiUser();
    const account = await getAccounts().create(user, await req.json(), await requestCtx());
    return Response.json({ account }, { status: 201 });
  },
  { mutating: true },
);
