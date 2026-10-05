import Link from "next/link";

export const PAGE_SIZES = [25, 50, 100] as const;

/** Rows-per-page buttons and Previous / Next, for a list whose state lives in the URL. */
export function Pager({
  total,
  page,
  size,
  shown,
  href,
  noun = "records",
}: {
  total: number;
  page: number;
  size: number;
  shown: number;
  href: (page: number, size: number) => string;
  noun?: string;
}) {
  const pages = Math.max(1, Math.ceil(total / size));
  const first = (page - 1) * size;
  const pill = "rounded border px-3 py-1";
  return (
    <div className="mt-3 flex shrink-0 flex-wrap items-center justify-between gap-3 text-sm">
      <p className="text-muted">
        {total === 0
          ? `0 ${noun}`
          : `Showing ${first + 1}–${first + shown} of ${total}`}
      </p>
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1" aria-label="Rows per page">
          <span className="mr-1 text-muted">Rows</span>
          {PAGE_SIZES.map((n) => (
            <Link
              key={n}
              href={href(1, n)}
              aria-current={n === size ? "true" : undefined}
              className={`rounded border px-2 py-1 ${n === size ? "bg-accent text-accent-foreground" : "hover:bg-surface-2"}`}
            >
              {n}
            </Link>
          ))}
        </div>
        <div className="flex items-center gap-2">
          {page > 1 ? (
            <Link
              href={href(page - 1, size)}
              className={`${pill} hover:bg-surface-2`}
            >
              Previous
            </Link>
          ) : (
            <span className={`${pill} text-muted opacity-50`}>Previous</span>
          )}
          <span className="text-muted">
            Page {page} of {pages}
          </span>
          {page < pages ? (
            <Link
              href={href(page + 1, size)}
              className={`${pill} hover:bg-surface-2`}
            >
              Next
            </Link>
          ) : (
            <span className={`${pill} text-muted opacity-50`}>Next</span>
          )}
        </div>
      </div>
    </div>
  );
}
