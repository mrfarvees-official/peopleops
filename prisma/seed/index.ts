import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "../app/generated/prisma/client";
import { hashPassword } from "../../platform/infrastructure/scrypt-password-hasher";
import { ACTIONS, RESOURCES, ROLES } from "./data/catalogues";
import { USERS } from "./data/users";
import { seedDevelopers } from "./data/developers";
import { seedPolicies } from "./pbac";
import { seedHr } from "./hr";

const url = new URL(process.env.DATABASE_URL ?? "");
const adapter = new PrismaMariaDb({
  host: url.hostname,
  port: Number(url.port || 3306),
  user: decodeURIComponent(url.username),
  password: decodeURIComponent(url.password),
  database: url.pathname.slice(1),
  connectionLimit: 2,
});
const prisma = new PrismaClient({ adapter });

async function main() {
  for (const { code, name } of ROLES) {
    await prisma.role.upsert({
      where: { code },
      update: { name },
      create: { code, name },
    });
  }
  for (const code of ACTIONS) {
    await prisma.action.upsert({
      where: { code },
      update: {},
      create: { code },
    });
  }
  for (const code of RESOURCES) {
    await prisma.resource.upsert({
      where: { code },
      update: {},
      create: { code },
    });
  }

  await seedPolicies(prisma);

  await prisma.tenant.upsert({
    where: { code: "platform" },
    update: {},
    create: {
      code: "platform",
      name: "Platform",
      profile: { create: { legalName: "PeopleOps Platform" } },
    },
  });

  const password = process.env.SEED_DEFAULT_PASSWORD;
  if (!password || password.length < 8) {
    throw new Error(
      "Set SEED_DEFAULT_PASSWORD in .env (at least 8 characters)",
    );
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("Refusing to seed demo users in production");
  }

  const tenants = new Map<string, string>();
  for (const [code, name, legalName] of [
    ["platform", "Platform", "PeopleOps Platform"],
    ["demo", "Demo Company", "Demo Company (Pvt) Ltd"],
  ] as const) {
    const t = await prisma.tenant.upsert({
      where: { code },
      update: {},
      create: { code, name, profile: { create: { legalName } } },
    });
    tenants.set(code, t.id);
  }

  for (const u of USERS) {
    const tenantId = tenants.get(u.tenant)!;
    const email = `${u.role}@${u.tenant}.com`;

    // Skip existing users so re-running never resets a changed password.
    const existing = await prisma.user.findUnique({
      where: { tenantId_email: { tenantId, email } },
    });
    if (existing) continue;

    const role = await prisma.role.findUniqueOrThrow({
      where: { code: u.role },
    });
    const user = await prisma.user.create({
      data: {
        tenantId,
        email,
        displayName: `${u.first} ${u.last}`,
        passwordHash: await hashPassword(password),
        status: "active",
        profile: { create: { firstName: u.first, lastName: u.last } },
        roles: { create: { roleId: role.id } },
      },
    });
    await prisma.auditLog.create({
      data: {
        tenantId,
        action: "user.create",
        resourceType: "user",
        resourceId: user.id,
        after: { email, role: u.role },
        reason: "seed",
      },
    });
  }

  await seedDevelopers(prisma);

  // demo HR data (org units, employees, leave, attendance, candidates, payroll)
  await seedHr(prisma, tenants.get("demo")!);

  console.log("seed complete");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
