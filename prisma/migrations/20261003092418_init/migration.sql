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

-- CreateTable
CREATE TABLE `platform_tenant` (
    `id` VARCHAR(36) NOT NULL,
    `code` VARCHAR(32) NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `platform_tenant_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `platform_user` (
    `id` VARCHAR(36) NOT NULL,
    `tenantId` VARCHAR(36) NOT NULL,
    `email` VARCHAR(255) NOT NULL,
    `passwordHash` VARCHAR(255) NOT NULL,
    `displayName` VARCHAR(255) NOT NULL,
    `status` ENUM('invited', 'active', 'suspended') NOT NULL DEFAULT 'invited',
    `version` INTEGER NOT NULL DEFAULT 1,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    INDEX `platform_user_tenantId_status_idx`(`tenantId`, `status`),
    UNIQUE INDEX `platform_user_tenantId_email_key`(`tenantId`, `email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `platform_role` (
    `id` VARCHAR(36) NOT NULL,
    `code` VARCHAR(64) NOT NULL,
    `name` VARCHAR(128) NOT NULL,
    `description` VARCHAR(255) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `platform_role_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `platform_user_role` (
    `userId` VARCHAR(36) NOT NULL,
    `roleId` VARCHAR(36) NOT NULL,
    `assignedBy` VARCHAR(36) NULL,
    `assignedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `platform_user_role_roleId_idx`(`roleId`),
    PRIMARY KEY (`userId`, `roleId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `platform_action` (
    `id` VARCHAR(36) NOT NULL,
    `code` VARCHAR(64) NOT NULL,
    `description` VARCHAR(255) NULL,

    UNIQUE INDEX `platform_action_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `platform_resource` (
    `id` VARCHAR(36) NOT NULL,
    `code` VARCHAR(64) NOT NULL,
    `description` VARCHAR(255) NULL,

    UNIQUE INDEX `platform_resource_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `platform_tenant_profile` (
    `tenantId` VARCHAR(36) NOT NULL,
    `legalName` VARCHAR(255) NULL,
    `registrationNo` VARCHAR(64) NULL,
    `taxNo` VARCHAR(64) NULL,
    `country` CHAR(2) NOT NULL DEFAULT 'LK',
    `timezone` VARCHAR(64) NOT NULL DEFAULT 'Asia/Colombo',
    `currency` CHAR(3) NOT NULL DEFAULT 'LKR',
    `locale` VARCHAR(16) NOT NULL DEFAULT 'en',
    `dateFormat` VARCHAR(16) NOT NULL DEFAULT 'YYYY-MM-DD',
    `fiscalYearStartMonth` TINYINT NOT NULL DEFAULT 1,
    `contactEmail` VARCHAR(255) NULL,
    `contactPhone` VARCHAR(32) NULL,
    `website` VARCHAR(255) NULL,
    `addressLine1` VARCHAR(255) NULL,
    `addressLine2` VARCHAR(255) NULL,
    `city` VARCHAR(128) NULL,
    `region` VARCHAR(128) NULL,
    `postalCode` VARCHAR(16) NULL,
    `logoUrl` VARCHAR(512) NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`tenantId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `platform_user_profile` (
    `userId` VARCHAR(36) NOT NULL,
    `firstName` VARCHAR(128) NULL,
    `lastName` VARCHAR(128) NULL,
    `preferredName` VARCHAR(128) NULL,
    `phone` VARCHAR(32) NULL,
    `avatarUrl` VARCHAR(512) NULL,
    `jobTitle` VARCHAR(128) NULL,
    `locale` VARCHAR(16) NULL,
    `timezone` VARCHAR(64) NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`userId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `platform_session` (
    `id` VARCHAR(36) NOT NULL,
    `userId` VARCHAR(36) NOT NULL,
    `tokenHash` VARCHAR(64) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `lastSeenAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `expiresAt` DATETIME(3) NOT NULL,
    `revokedAt` DATETIME(3) NULL,
    `ip` VARCHAR(45) NULL,
    `userAgent` VARCHAR(255) NULL,

    UNIQUE INDEX `platform_session_tokenHash_key`(`tokenHash`),
    INDEX `platform_session_userId_revokedAt_idx`(`userId`, `revokedAt`),
    INDEX `platform_session_expiresAt_idx`(`expiresAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `platform_policy` (
    `id` VARCHAR(36) NOT NULL,
    `tenantId` VARCHAR(36) NULL,
    `code` VARCHAR(64) NOT NULL,
    `name` VARCHAR(128) NOT NULL,
    `description` VARCHAR(255) NULL,
    `effect` ENUM('allow', 'deny') NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `isSystem` BOOLEAN NOT NULL DEFAULT false,
    `version` INTEGER NOT NULL DEFAULT 1,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `platform_policy_tenantId_isActive_idx`(`tenantId`, `isActive`),
    UNIQUE INDEX `platform_policy_tenantId_code_key`(`tenantId`, `code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `platform_policy_subject` (
    `id` VARCHAR(36) NOT NULL,
    `policyId` VARCHAR(36) NOT NULL,
    `type` ENUM('any', 'role', 'user') NOT NULL,
    `roleId` VARCHAR(36) NULL,
    `userId` VARCHAR(36) NULL,

    INDEX `platform_policy_subject_policyId_idx`(`policyId`),
    INDEX `platform_policy_subject_roleId_idx`(`roleId`),
    INDEX `platform_policy_subject_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `platform_policy_target` (
    `id` VARCHAR(36) NOT NULL,
    `policyId` VARCHAR(36) NOT NULL,
    `actionId` VARCHAR(36) NULL,
    `resourceId` VARCHAR(36) NULL,

    INDEX `platform_policy_target_policyId_idx`(`policyId`),
    INDEX `platform_policy_target_actionId_resourceId_idx`(`actionId`, `resourceId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `platform_policy_condition` (
    `id` VARCHAR(36) NOT NULL,
    `policyId` VARCHAR(36) NOT NULL,
    `attribute` VARCHAR(128) NOT NULL,
    `operator` ENUM('eq', 'neq', 'in', 'not_in', 'gt', 'gte', 'lt', 'lte', 'contains', 'exists') NOT NULL,
    `value` JSON NULL,
    `ref` VARCHAR(128) NULL,
    `position` INTEGER NOT NULL DEFAULT 0,

    INDEX `platform_policy_condition_policyId_idx`(`policyId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `platform_user` ADD CONSTRAINT `platform_user_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `platform_tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `platform_user_role` ADD CONSTRAINT `platform_user_role_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `platform_user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `platform_user_role` ADD CONSTRAINT `platform_user_role_roleId_fkey` FOREIGN KEY (`roleId`) REFERENCES `platform_role`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `platform_tenant_profile` ADD CONSTRAINT `platform_tenant_profile_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `platform_tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `platform_user_profile` ADD CONSTRAINT `platform_user_profile_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `platform_user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `platform_session` ADD CONSTRAINT `platform_session_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `platform_user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `platform_policy` ADD CONSTRAINT `platform_policy_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `platform_tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `platform_policy_subject` ADD CONSTRAINT `platform_policy_subject_policyId_fkey` FOREIGN KEY (`policyId`) REFERENCES `platform_policy`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `platform_policy_subject` ADD CONSTRAINT `platform_policy_subject_roleId_fkey` FOREIGN KEY (`roleId`) REFERENCES `platform_role`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `platform_policy_subject` ADD CONSTRAINT `platform_policy_subject_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `platform_user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `platform_policy_target` ADD CONSTRAINT `platform_policy_target_policyId_fkey` FOREIGN KEY (`policyId`) REFERENCES `platform_policy`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `platform_policy_target` ADD CONSTRAINT `platform_policy_target_actionId_fkey` FOREIGN KEY (`actionId`) REFERENCES `platform_action`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `platform_policy_target` ADD CONSTRAINT `platform_policy_target_resourceId_fkey` FOREIGN KEY (`resourceId`) REFERENCES `platform_resource`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `platform_policy_condition` ADD CONSTRAINT `platform_policy_condition_policyId_fkey` FOREIGN KEY (`policyId`) REFERENCES `platform_policy`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
