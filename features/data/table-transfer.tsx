import { getDataTransfer } from "@/server/data";
import type { SessionUser } from "@/platform/domain/auth";
import { TransferBar } from "./transfer-bar";

/** Export and import buttons for a table, shown only for what the user is allowed. */
export async function TableTransfer({
  user,
  table,
  label,
  ctx,
}: {
  user: SessionUser;
  table: string;
  label: string;
  ctx?: { ip?: string; requestId?: string };
}) {
  const { canExport, canImport } = await getDataTransfer().capabilities(
    user,
    table,
    ctx,
  );
  return (
    <TransferBar
      table={table}
      label={label}
      canExport={canExport}
      canImport={canImport}
    />
  );
}
