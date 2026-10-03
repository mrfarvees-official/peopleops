import client from "prom-client";

export function createMetrics() {
  const registry = new client.Registry();
  client.collectDefaultMetrics({ register: registry });

  const httpRequests = new client.Counter({
    name: "http_requests_total",
    help: "Total HTTP requests",
    labelNames: ["route", "status"],
    registers: [registry],
  });

  return { registry, httpRequests };
}

export type Metrics = ReturnType<typeof createMetrics>;
