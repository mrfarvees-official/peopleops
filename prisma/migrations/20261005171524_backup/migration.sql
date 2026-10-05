-- CreateTable
CREATE TABLE `platform_backup` (
    `id` VARCHAR(36) NOT NULL,
    `kind` VARCHAR(16) NOT NULL,
    `scope` VARCHAR(16) NOT NULL,
    `tenantId` VARCHAR(36) NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'completed',
    `storageKey` VARCHAR(128) NOT NULL,
    `sizeBytes` INTEGER NOT NULL,
    `checksum` CHAR(64) NOT NULL,
    `tables` JSON NOT NULL,
    `note` VARCHAR(255) NULL,
    `createdBy` VARCHAR(36) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `platform_backup_tenantId_createdAt_idx`(`tenantId`, `createdAt`),
    INDEX `platform_backup_scope_createdAt_idx`(`scope`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
