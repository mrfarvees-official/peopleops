import type { PrismaClient } from "@/prisma/app/generated/prisma/client";
import { hashPassword } from "@/platform/infrastructure/scrypt-password-hasher";
import { DEVELOPERS } from "./users";
export async function seedDevelopers(prisma: PrismaClient) {
  const password = process.env.SEED_DEVELOPER_PASSWORD;
  if (!password || password.length < 8) {
    throw new Error(
      "Set SEED_DEVELOPER_PASSWORD in .env (at least 12 characters)",
    );
  }

  const role = await prisma.role.findUniqueOrThrow({
    where: { code: "system_developer" },
  });

  for (const d of DEVELOPERS) {
    const tenant = await prisma.tenant.findUniqueOrThrow({
      where: { code: d.tenant },
    });
    const email = d.email.trim().toLowerCase(); // login normalizes email the same way

    const existing = await prisma.user.findUnique({
      where: { tenantId_email: { tenantId: tenant.id, email } },
    });

    // Never reset the password of an existing account. Only make sure it is
    // usable and still holds the role.
    const user = existing
      ? await prisma.user.update({
          where: { id: existing.id },
          data: { status: "active", deletedAt: null },
        })
      : await prisma.user.create({
          data: {
            tenantId: tenant.id,
            email,
            displayName: [d.first, d.last].filter(Boolean).join(" "),
            passwordHash: await hashPassword(password),
            status: "active",
            profile: {
              create: { firstName: d.first, lastName: d.last || null },
            },
          },
        });

    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId: role.id } },
      update: {},
      create: { userId: user.id, roleId: role.id },
    });

    if (!existing) {
      await prisma.auditLog.create({
        data: {
          tenantId: tenant.id,
          action: "user.create",
          resourceType: "user",
          resourceId: user.id,
          after: { email, role: "system_developer" },
          reason: "seed",
        },
      });
    }
  }
}
