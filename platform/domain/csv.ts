/** Minimal RFC 4180 CSV: quoted fields, doubled quotes, CRLF or LF line ends. */

const needsQuotes = /[",\r\n]/;

function cell(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s =
    typeof v === "object" ? JSON.stringify(v) : String(v);
  return needsQuotes.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function stringifyCsv(
  headers: string[],
  rows: Record<string, unknown>[],
): string {
  const lines = [headers.map(cell).join(",")];
  for (const r of rows) lines.push(headers.map((h) => cell(r[h])).join(","));
  return lines.join("\r\n") + "\r\n";
}

export class CsvSyntaxError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CsvSyntaxError";
  }
}

/** Returns the header row and the data rows as arrays of strings. */
export function parseCsv(text: string): { headers: string[]; rows: string[][] } {
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text; // BOM
  const records: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;

  const endField = () => {
    row.push(field);
    field = "";
  };
  const endRow = () => {
    endField();
    // skip completely blank lines
    if (!(row.length === 1 && row[0] === "")) records.push(row);
    row = [];
  };

  while (i < src.length) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
      } else {
        field += c;
      }
      i++;
      continue;
    }
    if (c === '"' && field === "") inQuotes = true;
    else if (c === ",") endField();
    else if (c === "\r") {
      if (src[i + 1] === "\n") i++;
      endRow();
    } else if (c === "\n") endRow();
    else field += c;
    i++;
  }
  if (inQuotes) throw new CsvSyntaxError("Unterminated quoted field");
  if (field !== "" || row.length > 0) endRow();

  if (records.length === 0) throw new CsvSyntaxError("The file is empty");
  const [headers, ...rows] = records;
  for (const [n, r] of rows.entries()) {
    if (r.length !== headers.length) {
      throw new CsvSyntaxError(
        `Row ${n + 2} has ${r.length} fields, expected ${headers.length}`,
      );
    }
  }
  return { headers, rows };
}
