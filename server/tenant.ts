import "server-only";

import { cache } from "react";
import { getDb } from "./db";

export interface TenantInfo {
  id: string;
  name: string;
  legalName: string | null;
  logoUrl: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  website: string | null;
  location: string | null; // "City, Region, XX"
  timezone: string; // IANA name, e.g. Asia/Colombo
  currency: string; // ISO 4217, e.g. LKR
}

/** The tenant (company) a signed-in user belongs to, for branding and the footer. */
export const getTenantInfo = cache(
  async (tenantId: string): Promise<TenantInfo> => {
    const t = await getDb().tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: { id: true, name: true, profile: true },
    });
    const p = t.profile;
    const location = p
      ? [p.city, p.region, p.country].filter(Boolean).join(", ")
      : "";
    return {
      id: t.id,
      name: t.name,
      legalName: p?.legalName ?? null,
      logoUrl: p?.logoUrl ?? null,
      contactEmail: p?.contactEmail ?? null,
      contactPhone: p?.contactPhone ?? null,
      website: p?.website ?? null,
      location: location || null,
      timezone: p?.timezone ?? "Asia/Colombo",
      currency: p?.currency ?? "LKR",
    };
  },
);
