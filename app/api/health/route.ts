import { container } from "@/server/composition";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  container.metrics.httpRequests.labels("/api/health", "200").inc();
  container.logger.info({ route: "/api/health", status: 200 }, "health check");
  return Response.json({ status: "ok", service: "peopleops" });
}
