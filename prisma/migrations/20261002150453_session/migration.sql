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

-- AddForeignKey
ALTER TABLE `platform_session` ADD CONSTRAINT `platform_session_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `platform_user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
