import { container } from "../../server/composition";

// Dev: open. Production: only when MONITOR_ENABLED=true.
// Later this becomes a PBAC check (super_admin / auditor), with every access audited.
export function monitorAllowed(): boolean {
  const { NODE_ENV, MONITOR_ENABLED } = container.config;
  return NODE_ENV !== "production" || MONITOR_ENABLED === "true";
}
