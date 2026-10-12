import type { UserStatus } from "../domain/auth";
import type { AccountView } from "../domain/accounts";

export interface NewAccount {
  email: string;
  displayName: string;
  passwordHash: string;
  status: UserStatus;
  roles: string[];
}

export interface AccountPatch {
  displayName?: string;
  status?: UserStatus;
  roles?: string[];
  passwordHash?: string;
}

/** Every method is scoped to one tenant; an id from another tenant is simply not found. */
export interface AccountRepository {
  list(tenantId: string, opts: { includeRemoved: boolean }): Promise<AccountView[]>;
  get(tenantId: string, id: string): Promise<AccountView | null>;
  /** Includes removed accounts, so a removed email is reported as such. */
  findByEmail(
    tenantId: string,
    email: string,
  ): Promise<{ id: string; removed: boolean } | null>;
  /** Roles the caller may assign, by code, that actually exist. */
  knownRoles(codes: string[]): Promise<string[]>;
  create(tenantId: string, a: NewAccount): Promise<AccountView>;
  /** Returns null when `expectedVersion` no longer matches. */
  update(
    tenantId: string,
    id: string,
    patch: AccountPatch,
    expectedVersion?: number,
  ): Promise<AccountView | null>;
  remove(tenantId: string, id: string): Promise<void>;
  restore(tenantId: string, id: string): Promise<AccountView>;
  revokeSessions(userId: string): Promise<void>;
  /** Active accounts holding `role`, not counting `exceptUserId`. */
  countActiveWithRole(
    tenantId: string,
    role: string,
    exceptUserId: string,
  ): Promise<number>;
}

export interface NewTenant {
  code: string;
  name: string;
  country: string;
  admin: {
    email: string;
    displayName: string;
    passwordHash: string;
    role: string;
  };
}

export interface SignupRepository {
  /** Creates the company, its profile and its first admin in one transaction. */
  createTenant(t: NewTenant): Promise<{ tenantId: string; userId: string }>;
  codeExists(code: string): Promise<boolean>;
  roleExists(code: string): Promise<boolean>;
}
