import "server-only";

import {
  createAuthorizer,
  type Authorizer,
} from "../platform/application/pbac";
import {
  createPbacAdmin,
  type PbacAdmin,
} from "../platform/application/pbac-admin";
import { PrismaPolicyAdminRepository } from "../platform/infrastructure/prisma-policy-admin-repository";
import { PrismaPolicyRepository } from "../platform/infrastructure/prisma-policy-repository";
import { createAuditWriter, logViews } from "./audit-writer";
import { getDb } from "./db";

const g = globalThis as unknown as {
  __pbac?: Authorizer;
  __pbacAdmin?: PbacAdmin;
};

export function getPbac(): Authorizer {
  return (g.__pbac ??= createAuthorizer({
    repo: new PrismaPolicyRepository(getDb()),
    audit: createAuditWriter(),
    logViews,
  }));
}

export function getPbacAdmin(): PbacAdmin {
  return (g.__pbacAdmin ??= createPbacAdmin({
    repo: new PrismaPolicyAdminRepository(getDb()),
    authz: getPbac(),
    audit: createAuditWriter(),
  }));
}
