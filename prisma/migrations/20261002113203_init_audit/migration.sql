-- CreateTable
CREATE TABLE `platform_audit_log` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `tenantId` VARCHAR(36) NULL,
    `actorId` VARCHAR(36) NULL,
    `action` VARCHAR(64) NOT NULL,
    `resourceType` VARCHAR(64) NOT NULL,
    `resourceId` VARCHAR(64) NULL,
    `outcome` ENUM('success', 'denied', 'failed') NOT NULL DEFAULT 'success',
    `before` JSON NULL,
    `after` JSON NULL,
    `reason` VARCHAR(255) NULL,
    `requestId` VARCHAR(64) NULL,
    `ip` VARCHAR(45) NULL,
    `occurredAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `platform_audit_log_tenantId_occurredAt_idx`(`tenantId`, `occurredAt`),
    INDEX `platform_audit_log_resourceType_resourceId_idx`(`resourceType`, `resourceId`),
    INDEX `platform_audit_log_actorId_occurredAt_idx`(`actorId`, `occurredAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
