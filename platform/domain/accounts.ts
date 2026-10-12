import type { UserStatus } from "./auth";

/**
 * Roles a company admin may give to their own people. super_admin and
 * system_developer are platform roles and are never assignable here.
 */
export const PLATFORM_ROLES = ["super_admin", "system_developer"] as const;
export const isAssignableRole = (code: string) =>
  !(PLATFORM_ROLES as readonly string[]).includes(code);

/** The role the person who signs a company up receives. */
export const OWNER_ROLE = "hr_admin";

export const ACCOUNT_STATUSES: UserStatus[] = ["active", "suspended"];

export interface AccountView {
  id: string;
  tenantId: string;
  email: string;
  displayName: string;
  status: UserStatus;
  roles: string[];
  version: number;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

/** A company code: lowercase letters, digits and dashes, derived from its name. */
export function slugify(name: string): string {
  const s = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24)
    .replace(/-+$/g, "");
  return s || "company";
}

export class AccountNotFoundError extends Error {
  constructor() {
    super("Account not found");
    this.name = "AccountNotFoundError";
  }
}

export class EmailTakenError extends Error {
  constructor(removed = false) {
    super(
      removed
        ? "An account with this email was removed. Restore it instead."
        : "An account with this email already exists",
    );
    this.name = "EmailTakenError";
  }
}

/** The change would break a rule (remove yourself, leave a company without an admin). */
export class AccountRuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AccountRuleError";
  }
}

/** The record changed since the form was loaded. */
export class AccountConflictError extends Error {
  constructor() {
    super("This account was changed by someone else. Reload and try again.");
    this.name = "ConflictError";
  }
}
