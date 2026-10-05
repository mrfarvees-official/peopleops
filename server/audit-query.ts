import "server-only";

import {
  createAuditQuery,
  type AuditQuery,
} from "../platform/application/audit-query";
import { PrismaAuditQueryRepository } from "../platform/infrastructure/prisma-audit-query-repository";
import { container } from "./composition";
import { getDb } from "./db";
import { getPbac } from "./pbac";

const g = globalThis as unknown as { __auditQuery?: AuditQuery };

export function getAuditQuery(): AuditQuery {
  return (g.__auditQuery ??= createAuditQuery({
    repo: new PrismaAuditQueryRepository(getDb()),
    authz: getPbac(),
    log: container.logger,
  }));
}
