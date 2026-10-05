import type { TenantInfo } from "@/server/tenant";

export function AppFooter({ tenant }: { tenant: TenantInfo }) {
  const details = [
    tenant.legalName && tenant.legalName !== tenant.name
      ? tenant.legalName
      : null,
    tenant.location,
    tenant.contactEmail,
    tenant.contactPhone,
  ].filter(Boolean);

  return (
    <footer className="border-t px-6 py-4 text-sm text-muted">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <address className="not-italic">
          <span className="font-medium text-foreground">{tenant.name}</span>
          {details.length > 0 && <span> · {details.join(" · ")}</span>}
          {tenant.website && (
            <>
              {" · "}
              <a
                href={tenant.website}
                className="hover:underline"
                rel="noopener noreferrer"
                target="_blank"
              >
                {tenant.website.replace(/^https?:\/\//, "")}
              </a>
            </>
          )}
        </address>
        <p>
          Powered by <span className="font-semibold">PeopleOps</span>
        </p>
      </div>
    </footer>
  );
}
