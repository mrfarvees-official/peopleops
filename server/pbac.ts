import {
  createAuthorizer,
  type Authorizer,
} from "../platform/application/pbac";
import { PrismaAuditWriter } from "../platform/infrastructure/prisma-audit-writer";
import { PrismaPolicyRepository } from "../platform/infrastructure/prisma-policy-repository";
import { getDb } from "./db";

const g = globalThis as unknown as { __pbac?: Authorizer };

export function getPbac(): Authorizer {
  return (g.__pbac ??= createAuthorizer({
    repo: new PrismaPolicyRepository(getDb()),
    audit: new PrismaAuditWriter(getDb()),
  }));
}
