import { container } from "@/server/composition";
import { monitorAllowed } from "@/server/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!monitorAllowed()) return new Response("Not found", { status: 404 });
  const body = await container.metrics.registry.metrics();
  return new Response(body, {
    headers: { "Content-Type": container.metrics.registry.contentType },
  });
}
