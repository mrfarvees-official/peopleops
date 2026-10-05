import "server-only";

import {
  createSettingsAdmin,
  type SettingsAdmin,
} from "../platform/application/settings";
import { createAuditWriter } from "./audit-writer";
import { PrismaSettingsRepository } from "../platform/infrastructure/prisma-settings-repository";
import { container } from "./composition";
import { getDb } from "./db";
import { getPbac } from "./pbac";
import { getSettingsReader } from "./settings-reader";

const g = globalThis as unknown as { __settingsAdmin?: SettingsAdmin };

export function getSettingsAdmin(): SettingsAdmin {
  return (g.__settingsAdmin ??= createSettingsAdmin({
    repo: new PrismaSettingsRepository(getDb()),
    reader: getSettingsReader(),
    authz: getPbac(),
    audit: createAuditWriter(),
    log: container.logger,
  }));
}
