-- CreateTable
CREATE TABLE `platform_setting` (
    `key` VARCHAR(100) NOT NULL,
    `value` JSON NOT NULL,
    `updatedBy` VARCHAR(36) NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
