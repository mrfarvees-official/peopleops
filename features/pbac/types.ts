import type { PolicyCatalogue } from "@/platform/application/pbac-admin";
import type { PolicyView } from "@/platform/application/pbac-ports";

export type { PolicyCatalogue, PolicyView };

export type Lookup = Record<string, string>;

/** value -> label maps, so lists and detail pages show names instead of codes. */
export function lookups(c: PolicyCatalogue) {
  const map = (o: { value: string; label: string }[]): Lookup =>
    Object.fromEntries(o.map((x) => [x.value, x.label]));
  return {
    actions: map(c.actions),
    resources: map(c.resources),
    roles: map(c.roles),
    tenants: map(c.tenants),
    users: map(c.users),
    attributes: map(c.attributes),
    operators: map(c.operators),
  };
}
export type Lookups = ReturnType<typeof lookups>;
