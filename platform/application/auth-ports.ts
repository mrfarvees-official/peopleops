import type { SessionUser, UserStatus } from "../domain/auth";

export interface AuthUserRecord extends SessionUser {
  passwordHash: string;
  status: UserStatus;
  tenantActive: boolean;
}

export interface StoredSession {
  id: string;
  expiresAt: Date;
  revokedAt: Date | null;
  lastSeenAt: Date;
  user: SessionUser & { status: UserStatus; tenantActive: boolean };
}

export interface AuthRepository {
  findUsersByEmail(email: string): Promise<AuthUserRecord[]>;
  createSession(s: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
    ip?: string;
    userAgent?: string;
  }): Promise<{ id: string }>;
  findSession(tokenHash: string): Promise<StoredSession | null>;
  touchSession(id: string, at: Date): Promise<void>;
  revokeSession(id: string): Promise<void>;
}

export interface PasswordHasher {
  hash(password: string): Promise<string>;
  verify(password: string, stored: string): Promise<boolean>;
}
