import "server-only";

import { createInsights, type Insights } from "../platform/application/hr-insights";
import { createModule, type HrModule } from "../platform/application/hr-module";
import { MODULE_CONFIGS } from "../platform/application/hr-modules";
import { ModuleNotFoundError } from "../platform/domain/hr";
import { PrismaHrLookups, hrExtras, hrRepos } from "../platform/infrastructure/prisma-hr";
import { PrismaInsightsRepo } from "../platform/infrastructure/prisma-insights";
import { createAuditWriter } from "./audit-writer";
import { container } from "./composition";
import { getDb } from "./db";
import { getPbac } from "./pbac";
import { getSettingsReader } from "./settings-reader";

const g = globalThis as unknown as { __hr?: Record<string, HrModule> };

function build(): Record<string, HrModule> {
  const db = getDb();
  const extras = hrExtras(db);
  const repos = hrRepos(db);
  const deps = {
    repos,
    settings: getSettingsReader(),
    now: () => new Date(),
    syncOwnership: extras.syncOwnership,
    extras,
  };
  const shared = {
    lookups: new PrismaHrLookups(db),
    authz: getPbac(),
    audit: createAuditWriter(),
    log: container.logger,
    deps,
  };
  return Object.fromEntries(
    MODULE_CONFIGS.map((c) => [c.key, createModule(c, { ...shared, repo: repos[c.key] })]),
  );
}

/** All HR modules: org units, employees, leave, attendance, candidates, payroll. */
export function getHrModules(): Record<string, HrModule> {
  return (g.__hr ??= build());
}

export function getHrModule(key: string): HrModule {
  const m = getHrModules()[key];
  if (!m) throw new ModuleNotFoundError(`Unknown module: ${key}`);
  return m;
}

const gi = globalThis as unknown as { __hrInsights?: Insights };

/** Reports and the dashboard. */
export function getInsights(): Insights {
  return (gi.__hrInsights ??= createInsights({
    repo: new PrismaInsightsRepo(getDb()),
    authz: getPbac(),
    log: container.logger,
  }));
}

/**
 * Table imports write rows directly, skipping a module's own hooks. Employees
 * carry the logins that permission checks compare (their manager's login, and
 * the copies on their leave, attendance and payslips), so those are re-synced
 * after an applied employee import.
 */
export async function afterTableImport(table: string, tenantId: string, applied: boolean) {
  if (!applied || table !== "employees") return;
  const db = getDb();
  const { syncOwnership } = hrExtras(db);
  const rows = await db.employee.findMany({ where: { tenantId }, select: { id: true } });
  for (const e of rows) await syncOwnership(e.id);
}
