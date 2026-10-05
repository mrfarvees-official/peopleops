export type UserStatus = "invited" | "active" | "suspended";

export interface SessionUser {
  id: string;
  tenantId: string;
  email: string;
  displayName: string;
  roles: string[];
}

export class InvalidCredentialsError extends Error {
  constructor() {
    super("Invalid credentials");
    this.name = "InvalidCredentialsError";
  }
}

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

export function canAuthenticate(u: {
  status: UserStatus;
  tenantActive: boolean;
}): boolean {
  return u.status === "active" && u.tenantActive;
}