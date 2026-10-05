import type { PrismaClient } from "../../prisma/app/generated/prisma/client";
import type {
  SettingsRepository,
  StoredSetting,
} from "../application/settings";

export class PrismaSettingsRepository implements SettingsRepository {
  constructor(private readonly db: PrismaClient) {}

  async all(): Promise<StoredSetting[]> {
    return this.db.setting.findMany();
  }

  async upsert(key: string, value: number | string, actorId: string) {
    return this.db.setting.upsert({
      where: { key },
      create: { key, value, updatedBy: actorId },
      update: { value, updatedBy: actorId, version: { increment: 1 } },
    });
  }
}
