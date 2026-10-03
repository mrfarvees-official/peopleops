/*
  Warnings:

  - You are about to drop the `platform_action` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `platform_audit_log` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `platform_resource` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `platform_role` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `platform_session` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `platform_tenant` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `platform_tenant_profile` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `platform_user` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `platform_user_profile` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `platform_user_role` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE `platform_session` DROP FOREIGN KEY `platform_session_userId_fkey`;

-- DropForeignKey
ALTER TABLE `platform_tenant_profile` DROP FOREIGN KEY `platform_tenant_profile_tenantId_fkey`;

-- DropForeignKey
ALTER TABLE `platform_user` DROP FOREIGN KEY `platform_user_tenantId_fkey`;

-- DropForeignKey
ALTER TABLE `platform_user_profile` DROP FOREIGN KEY `platform_user_profile_userId_fkey`;

-- DropForeignKey
ALTER TABLE `platform_user_role` DROP FOREIGN KEY `platform_user_role_roleId_fkey`;

-- DropForeignKey
ALTER TABLE `platform_user_role` DROP FOREIGN KEY `platform_user_role_userId_fkey`;

-- DropTable
DROP TABLE `platform_action`;

-- DropTable
DROP TABLE `platform_audit_log`;

-- DropTable
DROP TABLE `platform_resource`;

-- DropTable
DROP TABLE `platform_role`;

-- DropTable
DROP TABLE `platform_session`;

-- DropTable
DROP TABLE `platform_tenant`;

-- DropTable
DROP TABLE `platform_tenant_profile`;

-- DropTable
DROP TABLE `platform_user`;

-- DropTable
DROP TABLE `platform_user_profile`;

-- DropTable
DROP TABLE `platform_user_role`;
