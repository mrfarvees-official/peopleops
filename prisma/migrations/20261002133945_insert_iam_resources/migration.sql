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
