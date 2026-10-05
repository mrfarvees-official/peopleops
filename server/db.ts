import { PrismaMariaDb } from "@prisma/adapter-mariadb";
// ADJUST: must match your generator output (relative to this file)
import { PrismaClient } from "../prisma/app/generated/prisma/client";
import { container } from "./composition";

function create(): PrismaClient {
  const raw = container.config.DATABASE_URL;
  if (!raw) throw new Error("DATABASE_URL is not set");
  const u = new URL(raw);
  const adapter = new PrismaMariaDb({
    host: u.hostname,
    port: Number(u.port || 3306),
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: u.pathname.slice(1),
    connectionLimit: 5,
    // MySQL 8 caching_sha2_password over non-TLS local connections (dev docker).
    allowPublicKeyRetrieval: true,
  });
  return new PrismaClient({ adapter });
}

// Lazy, so `next build` works without a database. Survives hot reload in dev.
const g = globalThis as unknown as { __db?: PrismaClient };
export function getDb(): PrismaClient {
  return (g.__db ??= create());
}