import type { Policy } from "../domain/pbac";

export interface PolicyRepository {
  /** Active global + tenant policies whose subjects could match this user. */
  findApplicable(q: {
    tenantId: string;
    userId: string;
    roles: string[];
  }): Promise<Policy[]>;
}
