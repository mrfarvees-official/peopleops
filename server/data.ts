import "server-only";

import path from "node:path";
import { createBackupService, type BackupService } from "../platform/application/backup";
import { createDataTransfer, type DataTransfer } from "../platform/application/data-transfer";
import { TABLES } from "../platform/domain/table-catalogue";
import { FsBlobStore } from "../platform/infrastructure/fs-blob-store";
import { MysqlTableGateway } from "../platform/infrastructure/mysql-table-gateway";
import { PrismaBackupRepository } from "../platform/infrastructure/prisma-backup-repository";
import { createAuditWriter } from "./audit-writer";
import { container } from "./composition";
import { getDb } from "./db";
import { getPbac } from "./pbac";

const g = globalThis as unknown as {
  __dataGateway?: MysqlTableGateway;
  __dataTransfer?: DataTransfer;
  __backups?: BackupService;
};

const gateway = () => (g.__dataGateway ??= new MysqlTableGateway(getDb()));

/** Generic export and import for every table in the catalogue. */
export function getDataTransfer(): DataTransfer {
  return (g.__dataTransfer ??= createDataTransfer({
    gateway: gateway(),
    authz: getPbac(),
    audit: createAuditWriter(),
    log: container.logger,
    tables: TABLES,
  }));
}

/** Backup and restore of every backup-enabled table. */
export function getBackups(): BackupService {
  return (g.__backups ??= createBackupService({
    gateway: gateway(),
    transfer: getDataTransfer(),
    repo: new PrismaBackupRepository(getDb()),
    blobs: new FsBlobStore(path.resolve(container.config.BACKUP_DIR)),
    authz: getPbac(),
    audit: createAuditWriter(),
    log: container.logger,
  }));
}
