import Link from "next/link";
import { notFound } from "next/navigation";
import { AccessDenied } from "@/features/pbac/access-denied";
import type { FieldDef } from "@/platform/domain/hr";
import { ActionButton } from "./action-button";
import { formatValue, isStatusField, type Options } from "./format";
import { isForbidden, isMissing, openModule, RELATED } from "./module-data";
import { Badge } from "./module-list";
import { ModuleForm } from "./module-form";

type Rec = Record<string, unknown> & {
  id: string;
  _can: {
    update: boolean;
    delete: boolean;
    restore: boolean;
    actions: string[];
  };
};

/** Ref fields show the record's own display name (orgUnitId -> orgUnitName), never the id. */
const nameKey = (f: FieldDef) => f.key.replace(/Id$/, "Name");

async function load(moduleKey: string, id: string) {
  const { user, module, ctx, locale } = await openModule(moduleKey);
  try {
    const [meta, options, record] = await Promise.all([
      module.meta(user, ctx),
      module.options(user, ctx),
      module.get(user, id, ctx),
    ]);
    return { meta, options: options as Options, record: record as Rec, locale };
  } catch (e) {
    if (isMissing(e)) notFound();
    if (isForbidden(e)) return null;
    throw e;
  }
}

export async function ModuleDetailPage({
  moduleKey,
  id,
}: {
  moduleKey: string;
  id: string;
}) {
  const data = await load(moduleKey, id);
  if (!data) return <AccessDenied what="view this record" />;
  const { meta, options, record, locale } = data;

  const shown = meta.fields.filter((f) => !f.display && f.key in record);
  const title = (record.fullName ??
    record.name ??
    record.employeeName ??
    record.period ??
    record.code ??
    meta.singular) as string;
  const related = RELATED[meta.key]?.(record) ?? [];
  const deleted = Boolean(record.deletedAt);

  return (
    <main className="mx-auto w-full max-w-3xl space-y-4 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            href={`/hr/${meta.key}`}
            className="text-sm text-muted hover:underline"
          >
            ← {meta.label}
          </Link>
          <h1 className="text-2xl font-bold">{title}</h1>
          {deleted && (
            <p className="text-sm text-warning">This record is deleted.</p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {related.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="rounded border px-3 py-1 text-sm hover:bg-surface-2"
            >
              {l.label}
            </Link>
          ))}
          {meta.actions
            .filter(
              (a) =>
                a.scope === "record" && record._can.actions.includes(a.key),
            )
            .map((a) => (
              <ActionButton
                key={a.key}
                module={meta.key}
                id={record.id}
                action={a.key}
                label={a.label}
                note={a.note as "optional" | "required" | null}
                tone={a.tone as "primary" | "danger" | null}
              />
            ))}
          {record._can.update && !meta.readOnly && (
            <Link
              href={`/hr/${meta.key}/${record.id}/edit`}
              className="rounded border px-3 py-1 text-sm hover:bg-surface-2"
            >
              Edit
            </Link>
          )}
          {record._can.delete && (
            <ActionButton
              module={meta.key}
              id={record.id}
              action="delete"
              kind="delete"
              label="Delete"
              tone="danger"
              confirm={`Delete this ${meta.singular.toLowerCase()}? You can restore it later.`}
              redirectTo={`/hr/${meta.key}`}
            />
          )}
          {record._can.restore && (
            <ActionButton
              module={meta.key}
              id={record.id}
              action="restore"
              kind="restore"
              label="Restore"
            />
          )}
        </div>
      </div>

      <dl className="divide-y rounded border bg-surface text-sm">
        {shown.map((f) => (
          <div key={f.key} className="grid grid-cols-3 gap-3 p-3">
            <dt className="text-muted">{f.label}</dt>
            <dd className="col-span-2 break-words">
              {isStatusField(f) ? (
                <Badge f={f} value={record[f.key]} />
              ) : f.type === "ref" ? (
                String(record[nameKey(f)] ?? "—")
              ) : (
                formatValue(f, record[f.key], locale, options)
              )}
            </dd>
          </div>
        ))}
        <div className="grid grid-cols-3 gap-3 p-3">
          <dt className="text-muted">Last updated</dt>
          <dd className="col-span-2">
            {formatValue(
              { key: "u", label: "", type: "datetime" },
              record.updatedAt,
              locale,
            )}
          </dd>
        </div>
      </dl>
    </main>
  );
}

export async function ModuleEditPage({
  moduleKey,
  id,
}: {
  moduleKey: string;
  id: string;
}) {
  const data = await load(moduleKey, id);
  if (!data) return <AccessDenied what="edit this record" />;
  const { meta, options, record } = data;
  if (meta.readOnly || !record._can.update)
    return <AccessDenied what="edit this record" />;
  return (
    <ModuleForm
      module={meta.key}
      singular={meta.singular}
      fields={meta.fields.filter((f) => !f.readOnly && !f.display)}
      options={options}
      mode="edit"
      recordId={record.id}
      record={record}
    />
  );
}

export async function ModuleNewPage({ moduleKey }: { moduleKey: string }) {
  const { user, module, ctx } = await openModule(moduleKey);
  const [meta, options] = await Promise.all([
    module.meta(user, ctx),
    module.options(user, ctx),
  ]);
  if (meta.readOnly || !meta.can.create)
    return <AccessDenied what={`create ${meta.label.toLowerCase()}`} />;
  return (
    <ModuleForm
      module={meta.key}
      singular={meta.singular}
      fields={meta.fields.filter((f) => !f.readOnly && !f.display)}
      options={options as Options}
      mode="create"
    />
  );
}
