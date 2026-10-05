@AGENTS.md

## Branding and SEO

Signed-in screens are branded with the tenant (company), not PeopleOps. Visible UI shows the tenant name; PeopleOps must still appear everywhere it helps SEO and attribution:

- Tenant name replaces "PeopleOps" in the header and in page titles (`%s · <tenant name>`).
- Keep "PeopleOps" in `alt` / `aria-label` text for the tenant logo or badge, e.g. `"<tenant> logo, powered by PeopleOps"`.
- Keep "PeopleOps" in metadata: `applicationName`, `generator`, and the description (`"<tenant> workspace, powered by PeopleOps"`).
- The footer always shows tenant info plus "Powered by PeopleOps".
- Public pages (home, login) have no tenant, so they show "PeopleOps" directly.
- Any new screen, email, export or metadata must follow the same rule: tenant name for people, PeopleOps in alt text, metadata and "Powered by".
- Shell code lives in `features/shell/`; the tenant lookup is `server/tenant.ts`.

## Action pipeline: PBAC, then act, then log

Every action in every new feature follows the same three steps, in this order:

1. **PBAC first.** Authorize before touching any data: `assertCan(action, { type, id?, tenantId, ...attributes })` from `server/authorization.ts` (or `authz.assert` inside an application service). `tenantId` is required; the authorizer throws without it. Pass the attributes policies compare against (`ownerId`, `managerId`, `status`, ...). A denial throws `ForbiddenError` and is audited automatically. `system_developer` bypasses policies, and each enforced bypass is audited as `pbac.bypass`.
2. **Do the action.** Only run the read or write after the check passes. Scope queries to the caller's tenant, and for list screens check `viewAny` and filter rows in the query.
3. **Log it with the logger.** Use `container.logger` (pino, from `server/composition.ts`) to log the outcome with structured fields: `{ feature, action, resourceType, resourceId, actorId, tenantId, requestId, outcome }` plus a short message. Log success at `info`, a denial at `warn`, and a failure at `error` with the error. Never log secrets or personal data (passwords, salary, national ID, tokens); the logger redacts some keys, but do not rely on that. Writes also get an audit entry (`createAudit` in `platform/application/audit-api.ts`): the logger is for operations, the audit log is the record of who changed what.

Cover every action the feature offers, not only the main one. For each feature list them and apply the pipeline to all of them: list (`viewAny`), view, create, update, delete, restore, and any state change (submit, approve, reject, lock, publish, export). Page loads, server actions and API routes all count. Use the same action names as the PBAC catalogue (`platform_action`), and add new actions and resources there (seed) before using them.

Checklist for a new feature:
- Each action has a PBAC check as its first step.
- Each action logs its outcome (success, denied, failed).
- Each write has an audit entry.
- Menu items and buttons are hidden with `<Can>` or `can()`, but the server-side check is what protects the action.
- A test covers an allowed and a denied case per action.

## Settings

Platform behaviour that operators may change at runtime is a setting, not a code constant or an env var.

- Define it in `platform/domain/settings.ts` (key, type, default, label, description). Only values that differ from the default are stored (`platform_setting`).
- Read it in code paths that run often with `getSettingsReader()` (`server/settings-reader.ts`, cached for a few seconds). Change it only through the PBAC-guarded API: `GET /api/settings`, `GET` and `PUT /api/settings/:key` (resource `setting`, actions `viewAny`, `view`, `update`).
- Flags are `0` or `1`.
- `audit.log_views` (default `0`): when `0`, successful `view` and `viewAny` actions are not written to the audit log, because each would be a database write per page load. When `1` they are recorded (never for the audit log itself). Denied attempts and all changes are always recorded. Create audit writers with `createAuditWriter()` from `server/audit-writer.ts` so this applies everywhere.

## Import, export, backup and restore (any table)

These capabilities are table-driven and generic. Do not write per-feature import or export code.

- **Register every new table** in `platform/domain/table-catalogue.ts` in the same change that adds it (or add it to `EXCLUDED_TABLES` with a reason). `tests/platform/tables.test.ts` fails if a table in `prisma/schema/*.prisma` is in neither. One entry is all it takes: columns, types and foreign-key order are read from the database.
- Each entry sets: `resource` (the PBAC resource that guards it; add new resources to `prisma/seed/data/catalogues.ts`), `scope` (`tenant` column, `via` a parent table, or `global`), `hidden` columns (secrets: never in user exports or imports, but kept in backups), and the `export`, `import` and `backup` flags. A table with a hidden required column must set `import: false`.
- PBAC actions: `export`, `import` per table resource; `create`, `view`, `viewAny`, `export`, `delete`, `restore` on the `backup` resource. Platform-wide tables and platform-wide backups must be allowed for every tenant, so tenant-bound roles are stopped by the cross-tenant deny policy.
- API: `GET /api/data/tables`; `GET /api/data/tables/:table/export?format=json|csv&tenantId=`; `POST /api/data/tables/:table/import?mode=dry-run|apply&format=json|csv&tenantId=` (body is the file; dry-run is the default); `GET|POST /api/backups`; `GET|DELETE /api/backups/:id`; `GET /api/backups/:id/download`; `POST /api/backups/:id/restore?mode=dry-run|apply`.
- Imports and restores run in one database transaction. A dry run rolls it back, so the database itself checks types, unique keys and foreign keys. Any row error means nothing is written. Rows are checked to belong to the caller's tenant, and an existing row of another tenant is never overwritten.
- Restore puts back rows that are missing or changed; it does not delete rows created since the backup. An apply takes a safety backup (`pre_restore`) first.
- Backups are gzip JSON in `BACKUP_DIR` (default `.data/backups`, git-ignored) through the `BlobStore` port, with a SHA-256 checksum checked on every read. They include secret columns such as password hashes, so treat the files as sensitive.
- Limits (v1, synchronous): import 10 MB and 20,000 rows, export 200,000 rows per table; a backup is built in memory.

## HR modules (generic framework)

HR data screens are modules built once on a shared framework; do not write per-module CRUD, routes or pages.

- **A module is one config** in `platform/application/hr-modules.ts` (`ModuleConfig`): PBAC `resource`, `fields` (type, required, options, `ref` dropdown source, `sensitive`, `readOnly`, `display`), list `columns`, `searchable`, `filters`, workflow `actions`, `attrs(rec)` (the `ownerId`, `managerId` and `status` PBAC policies compare), and optional `prepare` / `after` hooks for cross-record rules. Register it in `MODULE_CONFIGS`, add a repo spec in `platform/infrastructure/prisma-hr.ts` (`hrRepos`), a menu entry in `features/shell/menu.ts`, and the table in the table catalogue.
- The framework (`platform/application/hr-module.ts`) gives every module list, view, create, update, soft delete, restore and workflow steps. Each one runs the pipeline: PBAC first (a person who could never create a record is refused before their input is read), then the work, then audit entry and structured log. Records are returned with `_can` flags (update, delete, restore, available steps) from a single policy load.
- API: `/api/hr/:module` (GET list, POST), `/api/hr/:module/meta`, `/api/hr/:module/:id` (GET, PUT, DELETE), `POST /api/hr/:module/:id/:step` (`restore` or a workflow step), `POST /api/hr/:module/actions/:step` (steps without a record, such as clock-in). Screens are `/hr/:module`, `/new`, `/:id`, `/:id/edit`, all generic.
- Records carry `ownerUserId` and `managerUserId` (copies of the employee's and manager's logins) so lists can be narrowed in SQL: people with unrestricted `view` see every row, everyone else only their own and their reports'. Changing an employee's manager or login re-syncs those copies (`syncOwnership`).
- Workflow modules keep their state in a `status` column; a step names the statuses it may start from (`from`) and the one it moves to (`to`).
- Sensitive fields (salary, national ID) are shown only to the record's owner and to people who may update it, and are masked in audit entries (add the field name to `SENSITIVE` in `platform/domain/audit.ts`).
- Dropdowns show names, never ids. A ref field named `fooId` shows the record's `fooName` display field, which the repo spec fills in.
- Payroll uses the `payroll.deduction_percent` setting. Demo data is seeded by `prisma/seed/hr.ts`; permissions are in `prisma/seed/data/pbac.ts` (everyone may use their own records; deny policies still stop self-approval).

### Import, export, backup and restore in the UI

- Every list screen shows **Export** (CSV or JSON) and **Import** buttons through `<TableTransfer table=... />` (`features/data/`). They appear only if PBAC allows `export` / `import` on the table's resource (`capabilities()` checks both with one policy load). A new list screen should render it with its table key from the table catalogue.
- Import is a two-step flow in the browser: choosing a file runs a dry run and shows how many rows would be added or updated, or the exact row errors; nothing is saved until the person confirms. Table imports write rows directly, so anything a module's hooks normally derive must be re-synced afterwards (see `afterTableImport` in `server/hr.ts`, used for employees).
- **Backup and restore** live in Settings (`features/backups/`): create (my company, or the whole platform for people allowed in every company), download, restore with a preview, delete. Buttons follow PBAC (`create`, `restore`, `delete`, `export` on `backup`).

### Demo data and the permission matrix

- `prisma/seed/hr.ts` (people and lists in `prisma/seed/data/hr.ts`) builds two years of realistic HR history for the demo company: 38 employees, 29 of them hired through candidate records (applied 5 to 10 weeks before they started), the applicants who were not hired, the current hiring pipeline, leave within each person's yearly allowance, 90 days of attendance, and 24 published monthly payroll runs plus a draft for the current month. It is deterministic (fixed random seed, dates relative to today). It only builds when the company has no HR data or only the earlier `E000`-style set; `SEED_RESET_HR=1 npm run db:seed` rebuilds on purpose (and deletes that company's HR records).
- `tests/platform/policy-matrix.test.ts` runs the seeded policies through the real evaluator and pins down what every role may and may not do on every HR resource. Change a policy in `prisma/seed/data/pbac.ts` and update that test in the same change; a new resource needs rows in it.
- Restricted lists (people who may see only their own and their reports' records) are checked against the policies first and then paged, so totals are exact.
