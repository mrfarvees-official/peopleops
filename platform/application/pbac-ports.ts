import type { Policy } from "../domain/pbac";

export interface PolicyRepository {
  /** Active global + tenant policies whose subjects could match this user. */
  findApplicable(q: {
    tenantId: string;
    userId: string;
    roles: string[];
  }): Promise<Policy[]>;
}

export interface PolicyView extends Policy {
  tenantId: string | null; // null = global/system
  name: string;
  description: string | null;
  isActive: boolean;
  isSystem: boolean;
  version: number;
}

export interface PolicyInput {
  code: string;
  name: string;
  description?: string;
  effect: Policy["effect"];
  isActive: boolean;
  subjects: Policy["subjects"];
  targets: Policy["targets"];
  conditions: Policy["conditions"];
}

/** Thrown by the repository when input names roles/actions/resources/users that don't exist. */
export class PolicyReferenceError extends Error {
  constructor(readonly missing: string[]) {
    super(`Unknown references: ${missing.join(", ")}`);
    this.name = "PolicyReferenceError";
  }
}

export class PolicyCodeTakenError extends Error {
  constructor() {
    super("Policy code already exists");
    this.name = "PolicyCodeTakenError";
  }
}

export interface PolicyCatalogueRaw {
  actions: { code: string; description: string | null }[];
  resources: { code: string; description: string | null }[];
  roles: { code: string; name: string; description: string | null }[];
  tenants: { id: string; name: string }[];
  users: { id: string; tenantName: string; email: string; displayName: string }[];
}

export interface PolicyAdminRepository {
  /** Global policies plus those of the given tenants, any active state. */
  list(tenantIds: string[]): Promise<PolicyView[]>;
  get(id: string): Promise<PolicyView | null>;
  /** tenantId null = global policy. */
  create(tenantId: string | null, input: PolicyInput): Promise<PolicyView>;
  /** Full replace of the policy and its subjects/targets/conditions; bumps version. */
  update(id: string, tenantId: string | null, input: PolicyInput): Promise<PolicyView>;
  remove(id: string): Promise<void>;
  catalogue(): Promise<PolicyCatalogueRaw>;
}
