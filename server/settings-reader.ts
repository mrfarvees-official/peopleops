import "server-only";

import {
  createSettingsReader,
  type SettingsReader,
} from "../platform/application/settings";
import { PrismaSettingsRepository } from "../platform/infrastructure/prisma-settings-repository";
import { getDb } from "./db";

const g = globalThis as unknown as { __settingsReader?: SettingsReader };

/** Cached reads of platform settings. Safe to use from the audit writer. */
export function getSettingsReader(): SettingsReader {
  return (g.__settingsReader ??= createSettingsReader(
    new PrismaSettingsRepository(getDb()),
  ));
}
