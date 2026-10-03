import { z } from "zod";

const schema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),
  MONITOR_ENABLED: z.enum(["true", "false"]).default("false"),
  DATABASE_URL: z.string().optional(),
  SESSION_TTL_HOURS: z.coerce.number().int().positive().default(24),
});

export type Config = z.infer<typeof schema>;

// Fails fast at startup if the environment is invalid.
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return schema.parse(env);
}
