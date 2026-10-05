import type { AuthzResource } from "@/platform/domain/pbac";
import { can } from "@/server/authorization";

type CanProps = {
  action: string;
  resource: AuthzResource;
  children: React.ReactNode;
};

export async function Can({ action, resource, children }: CanProps) {
  if (!(await can(action, resource))) return null;
  return <>{children}</>;
}
