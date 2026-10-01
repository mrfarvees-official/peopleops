import { loadConfig } from "./config";
import { createLogger } from "./logger";
import { createMetrics } from "./metrics";

function compose() {
  const config = loadConfig();
  const logger = createLogger(config);
  const metrics = createMetrics();
  logger.info({ env: config.NODE_ENV }, "container composed");
  return { config, logger, metrics };
}

// Singleton that survives hot reload in dev (avoids duplicate metric registration).
const g = globalThis as unknown as { __peopleops?: ReturnType<typeof compose> };
export const container = (g.__peopleops ??= compose());
