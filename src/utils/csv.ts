/**
 * Parses a CSV string into an array of records.
 * Handles quoted fields, embedded commas, and embedded newlines (RFC 4180).
 *
 * @param input - Raw CSV string
 * @param delimiter - Field delimiter (default: ',')
 * @returns Array of objects keyed by the header row values
 */
export function parseCsv(
  input: string,
  delimiter = ","
): Record<string, string>[] {
  const rows = tokenize(input, delimiter);
  if (rows.length === 0) return [];

  const headers = rows[0];
  if (!headers || headers.length === 0) return [];

  const records: Record<string, string>[] = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    // Skip empty trailing rows
    if (!row || (row.length === 1 && row[0] === "")) continue;

    const record: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      record[headers[j] ?? ""] = row[j] ?? "";
    }
    records.push(record);
  }

  return records;
}

/**
 * Splits a CSV string into a 2D array of raw string values.
 * Handles double-quote escaping and multi-line quoted fields.
 */
function tokenize(input: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;

  // Normalize line endings
  const text = input.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  while (i < text.length) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        // Peek ahead — doubled quote is an escaped quote
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
        } else {
          inQuotes = false;
          i++;
        }
      } else {
        field += ch;
        i++;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
        i++;
      } else if (ch === delimiter) {
        row.push(field);
        field = "";
        i++;
      } else if (ch === "\n") {
        row.push(field);
        field = "";
        rows.push(row);
        row = [];
        i++;
      } else {
        field += ch;
        i++;
      }
    }
  }

  // Flush last field/row
  row.push(field);
  if (row.length > 0) rows.push(row);

  return rows;
}
