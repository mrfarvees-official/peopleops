import type { PrismaClient } from "../app/generated/prisma/client";
import { POLICIES } from "./data/pbac";

export async function seedPolicies(prisma: PrismaClient) {
  const [actions, resources, roles] = await Promise.all([
    prisma.action.findMany(),
    prisma.resource.findMany(),
    prisma.role.findMany(),
  ]);
  const actionId = new Map(actions.map((a) => [a.code, a.id]));
  const resourceId = new Map(resources.map((r) => [r.code, r.id]));
  const roleId = new Map(roles.map((r) => [r.code, r.id]));

  const need = (m: Map<string, string>, code: string, kind: string) => {
    const id = m.get(code);
    if (!id) throw new Error(`pbac seed: unknown ${kind} "${code}"`);
    return id;
  };

  for (const def of POLICIES) {
    const subjects =
      def.roles === "*"
        ? [{ type: "any" as const, roleId: null }]
        : def.roles.map((r) => ({
            type: "role" as const,
            roleId: need(roleId, r, "role"),
          }));

    const acts =
      def.actions === "*"
        ? [null]
        : def.actions.map((a) => need(actionId, a, "action"));
    const ress =
      def.resources === "*"
        ? [null]
        : def.resources.map((r) => need(resourceId, r, "resource"));
    const targets = acts.flatMap((a) =>
      ress.map((r) => ({ actionId: a, resourceId: r })),
    );

    await prisma.$transaction(async (tx) => {
      // global policies have tenantId = null, which a compound upsert can't target
      const existing = await tx.policy.findFirst({
        where: { tenantId: null, code: def.code },
      });
      const base = {
        name: def.name,
        effect: def.effect,
        isActive: true,
        isSystem: true,
      };
      const policy = existing
        ? await tx.policy.update({
            where: { id: existing.id },
            data: { ...base, version: { increment: 1 } },
          })
        : await tx.policy.create({ data: { ...base, code: def.code } });

      // children are fully owned by the definition, so replace them
      await tx.policySubject.deleteMany({ where: { policyId: policy.id } });
      await tx.policyTarget.deleteMany({ where: { policyId: policy.id } });
      await tx.policyCondition.deleteMany({ where: { policyId: policy.id } });

      await tx.policySubject.createMany({
        data: subjects.map((s) => ({ policyId: policy.id, ...s })),
      });
      await tx.policyTarget.createMany({
        data: targets.map((t) => ({ policyId: policy.id, ...t })),
      });
      if (def.conditions?.length) {
        await tx.policyCondition.createMany({
          data: def.conditions.map((c, position) => ({
            policyId: policy.id,
            attribute: c.attribute,
            operator: c.operator,
            value: c.value,
            ref: c.ref,
            position,
          })),
        });
      }
    });
  }

  // retire system policies that were removed from the definitions
  await prisma.policy.updateMany({
    where: {
      tenantId: null,
      isSystem: true,
      code: { notIn: POLICIES.map((p) => p.code) },
    },
    data: { isActive: false },
  });
}
