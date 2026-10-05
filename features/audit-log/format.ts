/** Fixed, timezone-independent timestamp: 2026-10-05 10:11:19 UTC */
export const formatWhen = (d: Date) =>
  `${d.toISOString().slice(0, 19).replace("T", " ")} UTC`;

export const outcomeClass = (o: string) =>
  o === "success"
    ? "text-success"
    : o === "denied"
      ? "text-warning"
      : "text-danger";

export const outcomeLabel = (o: string) =>
  o.charAt(0).toUpperCase() + o.slice(1);
export { humanize } from "@/platform/domain/pbac";
