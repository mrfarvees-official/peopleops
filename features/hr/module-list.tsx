import Link from "next/link";
import { AccessDenied } from "@/features/pbac/access-denied";
import type { FieldDef } from "@/platform/domain/hr";
import { ActionButton } from "./action-button";
import {
  formatValue,
  isStatusField,
  tone,
  toneClass,
  type Options,
} from "./format";
import { isForbidden, openModule } from "./module-data";
import { TableTransfer } from "@/features/data/table-transfer";
import { Pager } from "./pager";

type Params = Record<string, string | undefined>;
type Row = Record<string, unknown> & {
  id: string;
  _can: {
    update: boolean;
    delete: boolean;
    restore: boolean;
    actions: string[];
  };
};

const field = "w-full rounded border bg-surface p-2 text-sm";
const label = "mb-1 block text-xs font-medium text-muted";

export function Badge({ f, value }: { f: FieldDef; value: unknown }) {
  const text =
    f.options?.find((o) => o.value === value)?.label ?? String(value ?? "—");
  return (
    <span
      className={`rounded border px-2 py-0.5 text-xs ${toneClass[tone(String(value))]}`}
    >
      {text}
    </span>
  );
}

/** A list screen for any module: filters, sticky-header table, workflow buttons, paging. */
export async function ModuleListPage({
  moduleKey,
  searchParams,
}: {
  moduleKey: string;
  searchParams: Promise<Params>;
}) {
  const { user, module, ctx, locale } = await openModule(moduleKey);
  const sp = await searchParams;

  let data;
  try {
    const [meta, options] = await Promise.all([
      module.meta(user, ctx),
      module.options(user, ctx),
    ]);
    const filters: Record<string, string> = {};
    for (const k of meta.filters) if (sp[k]) filters[k] = sp[k]!;
    const result = await module.list(
      user,
      {
        search: sp.search,
        filters,
        page: Number(sp.page) || 1,
        size: Number(sp.size) || undefined,
        deleted: sp.deleted === "true",
      },
      ctx,
    );
    data = { meta, options: options as Options, result, filters };
  } catch (e) {
    if (isForbidden(e))
      return <AccessDenied what={`view ${moduleKey.replace("-", " ")}`} />;
    throw e;
  }

  const { meta, options, result, filters } = data;
  const byKey = new Map(meta.fields.map((f) => [f.key, f]));
  const columns = meta.columns.map((k) => byKey.get(k)!).filter(Boolean);
  const rows = result.rows as Row[];

  const href = (page: number, size: number) => {
    const q = new URLSearchParams();
    if (sp.search) q.set("search", sp.search);
    for (const [k, v] of Object.entries(filters)) q.set(k, v);
    if (sp.deleted === "true") q.set("deleted", "true");
    q.set("size", String(size));
    q.set("page", String(page));
    return `/hr/${meta.key}?${q}`;
  };

  const filterFields = meta.filters
    .map((k) => byKey.get(k))
    .filter((f): f is FieldDef => !!f);
  const choices = (f: FieldDef) =>
    f.type === "bool"
      ? [
          { value: "true", label: "Yes" },
          { value: "false", label: "No" },
        ]
      : f.type === "select"
        ? (f.options ?? [])
        : (options[f.ref!] ?? []);
  const usableFilters = filterFields.filter(
    (f) => ["bool", "select", "ref"].includes(f.type) && choices(f).length > 0,
  );
  const hasFilter =
    !!sp.search || Object.keys(filters).length > 0 || sp.deleted === "true";
  const recordActions = meta.actions.filter((a) => a.scope === "record");

  return (
    <main className="flex h-full min-h-96 w-full flex-col p-6">
      <div className="mb-4 flex shrink-0 flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{meta.label}</h1>
          {sp.deleted === "true" && (
            <p className="text-sm text-warning">Showing deleted records</p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <TableTransfer
            user={user}
            table={meta.key}
            label={meta.label}
            ctx={ctx}
          />
          {meta.actions
            .filter(
              (a) =>
                a.scope === "collection" &&
                meta.can.collectionActions.includes(a.key),
            )
            .map((a) => (
              <ActionButton
                key={a.key}
                module={meta.key}
                action={a.key}
                label={a.label}
                tone={a.tone as "primary" | null}
              />
            ))}
          {meta.can.create && (
            <Link
              href={`/hr/${meta.key}/new`}
              className="rounded bg-accent px-4 py-2 text-sm text-accent-foreground"
            >
              New {meta.singular.toLowerCase()}
            </Link>
          )}
        </div>
      </div>

      {(meta.searchable.length > 0 || usableFilters.length > 0) && (
        <form
          method="get"
          className="mb-4 grid shrink-0 gap-3 rounded border bg-surface p-3 sm:grid-cols-2 lg:grid-cols-4"
        >
          {meta.searchable.length > 0 && (
            <div>
              <label className={label} htmlFor="search">
                Search
              </label>
              <input
                id="search"
                name="search"
                defaultValue={sp.search}
                className={field}
                placeholder="Type to search"
              />
            </div>
          )}
          {usableFilters.map((f) => (
            <div key={f.key}>
              <label className={label} htmlFor={f.key}>
                {f.label}
              </label>
              <select
                id={f.key}
                name={f.key}
                defaultValue={filters[f.key] ?? ""}
                className={field}
              >
                <option value="">All</option>
                {choices(f).map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          ))}
          {meta.soft && (
            <label className="flex items-center gap-2 self-end pb-2 text-sm">
              <input
                type="checkbox"
                name="deleted"
                value="true"
                defaultChecked={sp.deleted === "true"}
              />
              Show deleted
            </label>
          )}
          <input type="hidden" name="size" value={result.size} />
          <div className="flex items-end gap-2">
            <button
              type="submit"
              className="rounded bg-accent px-4 py-2 text-sm text-accent-foreground"
            >
              Apply
            </button>
            {hasFilter && (
              <Link
                href={`/hr/${meta.key}?size=${result.size}`}
                className="rounded border px-4 py-2 text-sm hover:bg-surface-2"
              >
                Reset
              </Link>
            )}
          </div>
        </form>
      )}

      {/* Only this box scrolls; the title, filters and pager stay put. */}
      <div className="min-h-0 flex-1 overflow-auto rounded border">
        <table className="w-full text-left text-sm">
          <thead className="sticky top-0 z-10 bg-surface text-muted shadow-[0_1px_0_var(--border)]">
            <tr>
              {columns.map((c) => (
                <th key={c.key} className="whitespace-nowrap p-3">
                  {c.label}
                </th>
              ))}
              <th className="p-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t">
                {columns.map((c, i) => (
                  <td key={c.key} className="whitespace-nowrap p-3">
                    {isStatusField(c) ? (
                      <Badge f={c} value={r[c.key]} />
                    ) : i === 0 ? (
                      <Link
                        href={`/hr/${meta.key}/${r.id}`}
                        className="font-medium hover:underline"
                      >
                        {formatValue(c, r[c.key], locale, options)}
                      </Link>
                    ) : (
                      formatValue(c, r[c.key], locale, options)
                    )}
                  </td>
                ))}
                <td className="p-3">
                  <div className="flex flex-wrap justify-end gap-2">
                    <Link
                      href={`/hr/${meta.key}/${r.id}`}
                      className="rounded border px-3 py-1 hover:bg-surface-2"
                    >
                      View
                    </Link>
                    {r._can.update && !meta.readOnly && (
                      <Link
                        href={`/hr/${meta.key}/${r.id}/edit`}
                        className="rounded border px-3 py-1 hover:bg-surface-2"
                      >
                        Edit
                      </Link>
                    )}
                    {recordActions
                      .filter((a) => r._can.actions.includes(a.key))
                      .map((a) => (
                        <ActionButton
                          key={a.key}
                          module={meta.key}
                          id={r.id}
                          action={a.key}
                          label={a.label}
                          note={a.note as "optional" | "required" | null}
                          tone={a.tone as "primary" | "danger" | null}
                        />
                      ))}
                    {r._can.delete && (
                      <ActionButton
                        module={meta.key}
                        id={r.id}
                        action="delete"
                        kind="delete"
                        label="Delete"
                        tone="danger"
                        confirm={`Delete this ${meta.singular.toLowerCase()}? You can restore it later.`}
                      />
                    )}
                    {r._can.restore && (
                      <ActionButton
                        module={meta.key}
                        id={r.id}
                        action="restore"
                        kind="restore"
                        label="Restore"
                      />
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={columns.length + 1}
                  className="p-6 text-center text-muted"
                >
                  {hasFilter
                    ? "Nothing matches your filters."
                    : `No ${meta.label.toLowerCase()} yet.`}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Pager
        total={result.total}
        page={result.page}
        size={result.size}
        shown={rows.length}
        href={href}
        noun={meta.label.toLowerCase()}
      />
    </main>
  );
}
