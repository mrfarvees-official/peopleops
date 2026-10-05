import { api, requestCtx, requireApiUser } from "@/server/http";
import { getInsights } from "@/server/hr";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Headcount, leave, attendance, recruitment and payroll figures. A section is
// null when the caller may not see that data.
export const GET = api(async () => {
  const user = await requireApiUser();
  return Response.json({ report: await getInsights().reports(user, await requestCtx()) });
});
