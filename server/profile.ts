import "server-only";

import { cache } from "react";
import { getDb } from "./db";

export interface UserProfileInfo {
  firstName: string | null;
  lastName: string | null;
  preferredName: string | null;
  phone: string | null;
  jobTitle: string | null;
  locale: string | null;
  timezone: string | null;
  avatarUrl: string | null;
}

export const getUserProfile = cache(
  async (userId: string): Promise<UserProfileInfo | null> =>
    getDb().userProfile.findUnique({
      where: { userId },
      select: {
        firstName: true,
        lastName: true,
        preferredName: true,
        phone: true,
        jobTitle: true,
        locale: true,
        timezone: true,
        avatarUrl: true,
      },
    }),
);
