import { humanize } from "@/platform/domain/pbac";
import type { SessionUser } from "@/platform/domain/auth";
import type { ProfileMenuUser } from "./profile-menu";

export const toProfileMenuUser = (u: SessionUser): ProfileMenuUser => ({
  name: u.displayName,
  email: u.email,
  roles: u.roles.map(humanize).join(", "),
});
