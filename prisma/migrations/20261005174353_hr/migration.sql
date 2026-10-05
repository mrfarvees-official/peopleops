-- CreateTable
CREATE TABLE `hr_org_unit` (
    `id` VARCHAR(36) NOT NULL,
    `tenantId` VARCHAR(36) NOT NULL,
    `code` VARCHAR(32) NOT NULL,
    `name` VARCHAR(128) NOT NULL,
    `parentId` VARCHAR(36) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    INDEX `hr_org_unit_tenantId_parentId_idx`(`tenantId`, `parentId`),
    UNIQUE INDEX `hr_org_unit_tenantId_code_key`(`tenantId`, `code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `hr_employee` (
    `id` VARCHAR(36) NOT NULL,
    `tenantId` VARCHAR(36) NOT NULL,
    `userId` VARCHAR(36) NULL,
    `employeeNo` VARCHAR(32) NOT NULL,
    `firstName` VARCHAR(128) NOT NULL,
    `lastName` VARCHAR(128) NOT NULL,
    `email` VARCHAR(255) NOT NULL,
    `phone` VARCHAR(32) NULL,
    `jobTitle` VARCHAR(128) NULL,
    `orgUnitId` VARCHAR(36) NULL,
    `managerId` VARCHAR(36) NULL,
    `managerUserId` VARCHAR(36) NULL,
    `employmentType` VARCHAR(16) NOT NULL DEFAULT 'full_time',
    `status` VARCHAR(16) NOT NULL DEFAULT 'active',
    `hireDate` DATE NOT NULL,
    `terminationDate` DATE NULL,
    `monthlySalary` DECIMAL(12, 2) NULL,
    `nationalId` VARCHAR(32) NULL,
    `address` VARCHAR(255) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    UNIQUE INDEX `hr_employee_userId_key`(`userId`),
    INDEX `hr_employee_tenantId_orgUnitId_idx`(`tenantId`, `orgUnitId`),
    INDEX `hr_employee_tenantId_managerId_idx`(`tenantId`, `managerId`),
    INDEX `hr_employee_tenantId_status_idx`(`tenantId`, `status`),
    UNIQUE INDEX `hr_employee_tenantId_employeeNo_key`(`tenantId`, `employeeNo`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `hr_leave_type` (
    `id` VARCHAR(36) NOT NULL,
    `tenantId` VARCHAR(36) NOT NULL,
    `code` VARCHAR(32) NOT NULL,
    `name` VARCHAR(128) NOT NULL,
    `daysPerYear` DECIMAL(5, 1) NOT NULL DEFAULT 0,
    `isPaid` BOOLEAN NOT NULL DEFAULT true,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    UNIQUE INDEX `hr_leave_type_tenantId_code_key`(`tenantId`, `code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `hr_leave_request` (
    `id` VARCHAR(36) NOT NULL,
    `tenantId` VARCHAR(36) NOT NULL,
    `employeeId` VARCHAR(36) NOT NULL,
    `ownerUserId` VARCHAR(36) NULL,
    `managerUserId` VARCHAR(36) NULL,
    `leaveTypeId` VARCHAR(36) NOT NULL,
    `startDate` DATE NOT NULL,
    `endDate` DATE NOT NULL,
    `days` DECIMAL(4, 1) NOT NULL,
    `reason` VARCHAR(255) NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'draft',
    `decidedBy` VARCHAR(36) NULL,
    `decidedAt` DATETIME(3) NULL,
    `decisionNote` VARCHAR(255) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    INDEX `hr_leave_request_tenantId_status_idx`(`tenantId`, `status`),
    INDEX `hr_leave_request_employeeId_startDate_idx`(`employeeId`, `startDate`),
    INDEX `hr_leave_request_managerUserId_status_idx`(`managerUserId`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `hr_attendance` (
    `id` VARCHAR(36) NOT NULL,
    `tenantId` VARCHAR(36) NOT NULL,
    `employeeId` VARCHAR(36) NOT NULL,
    `ownerUserId` VARCHAR(36) NULL,
    `managerUserId` VARCHAR(36) NULL,
    `date` DATE NOT NULL,
    `clockIn` DATETIME(3) NULL,
    `clockOut` DATETIME(3) NULL,
    `hours` DECIMAL(4, 2) NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'present',
    `note` VARCHAR(255) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    INDEX `hr_attendance_tenantId_date_idx`(`tenantId`, `date`),
    INDEX `hr_attendance_managerUserId_date_idx`(`managerUserId`, `date`),
    UNIQUE INDEX `hr_attendance_employeeId_date_key`(`employeeId`, `date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `hr_candidate` (
    `id` VARCHAR(36) NOT NULL,
    `tenantId` VARCHAR(36) NOT NULL,
    `firstName` VARCHAR(128) NOT NULL,
    `lastName` VARCHAR(128) NOT NULL,
    `email` VARCHAR(255) NOT NULL,
    `phone` VARCHAR(32) NULL,
    `position` VARCHAR(128) NOT NULL,
    `stage` VARCHAR(16) NOT NULL DEFAULT 'applied',
    `source` VARCHAR(64) NULL,
    `expectedSalary` DECIMAL(12, 2) NULL,
    `appliedAt` DATE NOT NULL,
    `notes` VARCHAR(500) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    INDEX `hr_candidate_tenantId_stage_idx`(`tenantId`, `stage`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `hr_payroll_run` (
    `id` VARCHAR(36) NOT NULL,
    `tenantId` VARCHAR(36) NOT NULL,
    `period` VARCHAR(7) NOT NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'draft',
    `employeeCount` INTEGER NOT NULL DEFAULT 0,
    `totalGross` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `totalDeductions` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `totalNet` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `createdBy` VARCHAR(36) NULL,
    `lockedAt` DATETIME(3) NULL,
    `publishedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    UNIQUE INDEX `hr_payroll_run_tenantId_period_key`(`tenantId`, `period`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `hr_payslip` (
    `id` VARCHAR(36) NOT NULL,
    `tenantId` VARCHAR(36) NOT NULL,
    `runId` VARCHAR(36) NOT NULL,
    `employeeId` VARCHAR(36) NOT NULL,
    `ownerUserId` VARCHAR(36) NULL,
    `managerUserId` VARCHAR(36) NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'draft',
    `gross` DECIMAL(12, 2) NOT NULL,
    `deductions` DECIMAL(12, 2) NOT NULL,
    `net` DECIMAL(12, 2) NOT NULL,
    `details` JSON NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `hr_payslip_ownerUserId_status_idx`(`ownerUserId`, `status`),
    UNIQUE INDEX `hr_payslip_runId_employeeId_key`(`runId`, `employeeId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `hr_org_unit` ADD CONSTRAINT `hr_org_unit_parentId_fkey` FOREIGN KEY (`parentId`) REFERENCES `hr_org_unit`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `hr_employee` ADD CONSTRAINT `hr_employee_orgUnitId_fkey` FOREIGN KEY (`orgUnitId`) REFERENCES `hr_org_unit`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `hr_employee` ADD CONSTRAINT `hr_employee_managerId_fkey` FOREIGN KEY (`managerId`) REFERENCES `hr_employee`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `hr_leave_request` ADD CONSTRAINT `hr_leave_request_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `hr_employee`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `hr_leave_request` ADD CONSTRAINT `hr_leave_request_leaveTypeId_fkey` FOREIGN KEY (`leaveTypeId`) REFERENCES `hr_leave_type`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `hr_attendance` ADD CONSTRAINT `hr_attendance_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `hr_employee`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `hr_payslip` ADD CONSTRAINT `hr_payslip_runId_fkey` FOREIGN KEY (`runId`) REFERENCES `hr_payroll_run`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `hr_payslip` ADD CONSTRAINT `hr_payslip_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `hr_employee`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
