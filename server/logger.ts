import pino, { type Logger } from "pino";
import type { Config } from "./config";

// No `transport` option: it starts worker threads, which break under Next.js bundling.
export function createLogger(config: Config): Logger {
  return pino({
    level: config.LOG_LEVEL,
    base: { service: "peopleops" },
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: [
      "req.headers.authorization",
      "*.password",
      "*.salary",
      "*.nationalId",
    ],
  });
}