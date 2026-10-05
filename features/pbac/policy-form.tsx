"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  emptyCondition,
  emptyDraft,
  emptySubject,
  emptyTarget,
  toPayload,
  type ConditionDraft,
  type Draft,
} from "./policy-draft";
import type { PolicyCatalogue } from "./types";

type Option = { value: string; label: string };

const field = "w-full rounded border bg-surface p-2 text-sm";
const label = "mb-1 block text-xs font-medium text-muted";
const card = "space-y-3 rounded border bg-surface p-4";
const addBtn = "rounded border px-3 py-1 text-sm hover:bg-surface-2";
const removeBtn = "rounded border px-2 py-1 text-sm text-danger hover:bg-surface-2";

function Select({
  value,
  onChange,
  options,
  placeholder,
  required,
}: {
  value: string;
  onChange: (v: string) => void;
  options: Option[];
  placeholder?: string; // adds a first entry with value ""
  required?: boolean;
}) {
  return (
    <select
      className={field}
      value={value}
      required={required}
      onChange={(e) => onChange(e.target.value)}
    >
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

// Which attributes have a fixed set of meaningful values to pick from.
function valueOptions(attribute: string, c: PolicyCatalogue): Option[] | null {
  switch (attribute) {
    case "action":
      return c.actions;
    case "subject.tenantId":
    case "resource.tenantId":
      return c.tenants;
    case "subject.roles":
      return c.roles;
    case "subject.id":
    case "resource.ownerId":
    case "resource.managerId":
      return c.users;
    default:
      return null;
  }
}

function ConditionRow({
  c,
  catalogue,
  onChange,
  onRemove,
}: {
  c: ConditionDraft;
  catalogue: PolicyCatalogue;
  onChange: (next: ConditionDraft) => void;
  onRemove: () => void;
}) {
  const options = valueOptions(c.attribute, catalogue);
  const isList = c.operator === "in" || c.operator === "not_in";
  const exists = c.operator === "exists";
  const set = (patch: Partial<ConditionDraft>) => onChange({ ...c, ...patch });

  return (
    <div className="grid gap-2 rounded border p-3 md:grid-cols-[1.4fr_1fr_1fr_1.6fr_auto]">
      <div>
        <span className={label}>Attribute</span>
        <Select
          required
          value={c.attribute}
          placeholder="Choose attribute"
          options={catalogue.attributes}
          onChange={(attribute) => set({ attribute, list: [], text: "" })}
        />
      </div>
      <div>
        <span className={label}>Condition</span>
        <Select
          value={c.operator}
          options={catalogue.operators}
          onChange={(operator) => set({ operator, list: [], text: "" })}
        />
      </div>
      <div>
        <span className={label}>Compare with</span>
        <Select
          value={exists ? "value" : c.mode}
          options={[
            { value: "value", label: exists ? "Yes / No" : "A fixed value" },
            { value: "ref", label: "Another attribute" },
          ]}
          onChange={(mode) => set({ mode: mode as "value" | "ref" })}
        />
      </div>
      <div>
        <span className={label}>Value</span>
        {exists ? (
          <Select
            value={c.text || "true"}
            options={[
              { value: "true", label: "Yes, it is present" },
              { value: "false", label: "No, it is missing" },
            ]}
            onChange={(text) => set({ text })}
          />
        ) : c.mode === "ref" ? (
          <Select
            required
            value={c.ref}
            placeholder="Choose attribute"
            options={catalogue.attributes}
            onChange={(ref) => set({ ref })}
          />
        ) : options && isList ? (
          <select
            multiple
            required
            className={`${field} h-24`}
            value={c.list}
            onChange={(e) =>
              set({ list: [...e.target.selectedOptions].map((o) => o.value) })
            }
          >
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        ) : options ? (
          <Select
            required
            value={c.list[0] ?? ""}
            placeholder="Choose value"
            options={options}
            onChange={(v) => set({ list: v ? [v] : [] })}
          />
        ) : (
          <input
            required
            className={field}
            value={c.text}
            placeholder={isList ? "Comma-separated values" : "Value"}
            onChange={(e) => set({ text: e.target.value })}
          />
        )}
      </div>
      <div className="flex items-end">
        <button type="button" className={removeBtn} onClick={onRemove}>
          Remove
        </button>
      </div>
    </div>
  );
}

export function PolicyForm({
  mode,
  policyId,
  initial,
  catalogue,
}: {
  mode: "create" | "edit";
  policyId?: string;
  initial?: Draft;
  catalogue: PolicyCatalogue;
}) {
  const router = useRouter();
  const [d, setD] = useState<Draft>(initial ?? emptyDraft());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const patch = (p: Partial<Draft>) => setD((prev) => ({ ...prev, ...p }));
  const swap = <T,>(list: T[], i: number, next: T) =>
    list.map((x, j) => (j === i ? next : x));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        mode === "create" ? "/api/pbac/policies" : `/api/pbac/policies/${policyId}`,
        {
          method: mode === "create" ? "POST" : "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(
            toPayload(d, mode, (a) => valueOptions(a, catalogue) !== null),
          ),
        },
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        const missing = body.missing?.length
          ? ` (${body.missing.join(", ")})`
          : "";
        const issues = body.issues?.length
          ? `: ${body.issues
              .map((i: { path: (string | number)[]; message: string }) =>
                `${i.path.join(".")} ${i.message}`)
              .join("; ")}`
          : "";
        throw new Error(`${body.error ?? "Request failed"}${missing}${issues}`);
      }
      router.push(`/pbac/policies/${body.policy.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mx-auto w-full max-w-4xl space-y-6 p-6">
      <h1 className="text-2xl font-bold">
        {mode === "create" ? "New policy" : "Update policy"}
      </h1>

      <section className={card}>
        <h2 className="font-semibold">Policy</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <span className={label}>Name</span>
            <input
              required
              maxLength={128}
              className={field}
              value={d.name}
              onChange={(e) => patch({ name: e.target.value })}
            />
          </div>
          <div>
            <span className={label}>Identifier (lowercase, dashes)</span>
            <input
              required
              className={field}
              pattern="[a-z0-9][a-z0-9_\-]{1,63}"
              title="Lowercase letters, numbers, dashes or underscores"
              value={d.code}
              onChange={(e) => patch({ code: e.target.value })}
            />
          </div>
          <div className="md:col-span-2">
            <span className={label}>Description</span>
            <input
              maxLength={255}
              className={field}
              value={d.description}
              onChange={(e) => patch({ description: e.target.value })}
            />
          </div>
          <div>
            <span className={label}>Effect</span>
            <Select
              value={d.effect}
              options={[
                { value: "allow", label: "Allow" },
                { value: "deny", label: "Deny (always wins over allow)" },
              ]}
              onChange={(effect) => patch({ effect: effect as "allow" | "deny" })}
            />
          </div>
          {mode === "create" && (
            <div>
              <span className={label}>Applies to</span>
              <Select
                value={d.scope}
                options={[
                  { value: "global", label: "Global (every tenant)" },
                  ...catalogue.tenants.map((t) => ({
                    value: t.value,
                    label: `Tenant: ${t.label}`,
                  })),
                ]}
                placeholder="My own tenant"
                onChange={(scope) => patch({ scope })}
              />
            </div>
          )}
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={d.isActive}
              onChange={(e) => patch({ isActive: e.target.checked })}
            />
            Active
          </label>
        </div>
      </section>

      <section className={card}>
        <h2 className="font-semibold">Who (subjects)</h2>
        {d.subjects.map((s, i) => (
          <div key={i} className="grid gap-2 md:grid-cols-[1fr_2fr_auto]">
            <Select
              value={s.type}
              options={[
                { value: "any", label: "Everyone" },
                { value: "role", label: "A role" },
                { value: "user", label: "A specific user" },
              ]}
              onChange={(type) =>
                patch({
                  subjects: swap(d.subjects, i, {
                    type: type as "any" | "role" | "user",
                    role: "",
                    userId: "",
                  }),
                })
              }
            />
            {s.type === "role" ? (
              <Select
                required
                value={s.role}
                placeholder="Choose role"
                options={catalogue.roles}
                onChange={(role) => patch({ subjects: swap(d.subjects, i, { ...s, role }) })}
              />
            ) : s.type === "user" ? (
              <Select
                required
                value={s.userId}
                placeholder="Choose user"
                options={catalogue.users}
                onChange={(userId) =>
                  patch({ subjects: swap(d.subjects, i, { ...s, userId }) })
                }
              />
            ) : (
              <span className="self-center text-sm text-muted">Anyone signed in</span>
            )}
            <button
              type="button"
              className={removeBtn}
              disabled={d.subjects.length === 1}
              onClick={() => patch({ subjects: d.subjects.filter((_, j) => j !== i) })}
            >
              Remove
            </button>
          </div>
        ))}
        <button
          type="button"
          className={addBtn}
          onClick={() => patch({ subjects: [...d.subjects, emptySubject()] })}
        >
          Add subject
        </button>
      </section>

      <section className={card}>
        <h2 className="font-semibold">What (targets)</h2>
        {d.targets.map((t, i) => (
          <div key={i} className="grid gap-2 md:grid-cols-[1fr_1fr_auto]">
            <Select
              value={t.action}
              placeholder="Any action"
              options={catalogue.actions}
              onChange={(action) => patch({ targets: swap(d.targets, i, { ...t, action }) })}
            />
            <Select
              value={t.resource}
              placeholder="Any resource"
              options={catalogue.resources}
              onChange={(resource) =>
                patch({ targets: swap(d.targets, i, { ...t, resource }) })
              }
            />
            <button
              type="button"
              className={removeBtn}
              disabled={d.targets.length === 1}
              onClick={() => patch({ targets: d.targets.filter((_, j) => j !== i) })}
            >
              Remove
            </button>
          </div>
        ))}
        <button
          type="button"
          className={addBtn}
          onClick={() => patch({ targets: [...d.targets, emptyTarget()] })}
        >
          Add target
        </button>
      </section>

      <section className={card}>
        <h2 className="font-semibold">Only when (conditions)</h2>
        <p className="text-sm text-muted">
          All conditions must hold. Leave empty to apply every time.
        </p>
        {d.conditions.map((c, i) => (
          <ConditionRow
            key={i}
            c={c}
            catalogue={catalogue}
            onChange={(next) => patch({ conditions: swap(d.conditions, i, next) })}
            onRemove={() => patch({ conditions: d.conditions.filter((_, j) => j !== i) })}
          />
        ))}
        <button
          type="button"
          className={addBtn}
          onClick={() => patch({ conditions: [...d.conditions, emptyCondition()] })}
        >
          Add condition
        </button>
      </section>

      {error && (
        <p role="alert" className="rounded border border-danger p-3 text-sm text-danger">
          {error}
        </p>
      )}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={busy}
          className="rounded bg-accent px-4 py-2 text-accent-foreground disabled:opacity-60"
        >
          {busy ? "Saving…" : mode === "create" ? "Create policy" : "Save changes"}
        </button>
        <button
          type="button"
          className="rounded border px-4 py-2 hover:bg-surface-2"
          onClick={() => router.back()}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
