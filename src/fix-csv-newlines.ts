/**
 * fix-csv-newlines
 *
 * Fixes malformed CSV/TSV quest files where fields containing newlines are
 * split across multiple physical lines instead of being properly encoded.
 *
 * For each file this script:
 *  1. Groups continuation lines back into their logical row
 *  2. Parses each logical row into field values (handles RFC 4180 quoting)
 *  3. Replaces literal newline characters in field values with the \n escape
 *  4. Re-serializes each row as a single line, re-quoting fields that contain
 *     the delimiter character
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const FILES = [
  "input_data/quests/solo_quests/cap2_solo_quests.csv",
  "input_data/quests/daily_quests/cap2_daily_quests.csv",
  "input_data/quests/shop_quests.csv/cap2_shop_quests.csv",
  "input_data/quests/armor_quests/cap2.csv",
  "input_data/quests/progression_quests/cap2_progression_quests.csv",
  "input_data/quests/tradeskill_quests/cap2_tradeskill_quests.csv",
];

// ---------------------------------------------------------------------------
// Row boundary detection
// ---------------------------------------------------------------------------

/**
 * Returns true if this line starts a new logical row.
 * Data rows start with a digit followed by the separator.
 * Header rows start with "Level" followed by a separator or space.
 */
function isRowStart(line: string): boolean {
  return /^\d+[\t,]/.test(line) || /^Level[\t, ]/.test(line);
}

// ---------------------------------------------------------------------------
// Field tokenizer
// ---------------------------------------------------------------------------

/**
 * Splits a (potentially multi-line) row string into field values.
 * Handles RFC 4180 quoting:
 *   - Fields wrapped in "..." have the outer quotes stripped
 *   - "" inside a quoted field is unescaped to a single "
 *   - Actual newlines inside quoted fields are preserved (will be escaped later)
 *
 * Works for both comma-separated and tab-separated input.
 */
function tokenizeFields(row: string, sep: string): string[] {
  const fields: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;

  while (i < row.length) {
    const ch = row[i];

    if (inQuotes) {
      if (ch === '"') {
        if (row[i + 1] === '"') {
          // Escaped quote "" → single "
          field += '"';
          i += 2;
        } else {
          // End of quoted field
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
      } else if (ch === sep) {
        fields.push(field);
        field = "";
        i++;
      } else {
        field += ch;
        i++;
      }
    }
  }

  fields.push(field);
  return fields;
}

// ---------------------------------------------------------------------------
// Field serializer
// ---------------------------------------------------------------------------

/**
 * Serializes a field value back to its CSV/TSV representation.
 * Wraps in quotes and escapes inner quotes if the value contains the separator
 * or a double-quote character.
 */
function serializeField(value: string, sep: string): string {
  if (value.includes(sep) || value.includes('"')) {
    return '"' + value.replace(/"/g, '""') + '"';
  }
  return value;
}

// ---------------------------------------------------------------------------
// Core fix logic
// ---------------------------------------------------------------------------

interface FixResult {
  file: string;
  continuationsMerged: number;
}

function fixFile(filePath: string): FixResult {
  const abs = resolve(filePath);
  const raw = readFileSync(abs, "utf-8");
  const lines = raw.split("\n");

  // Detect separator from the first non-empty line
  const firstLine = lines.find((l) => l.trim() !== "") ?? "";
  const sep = firstLine.includes("\t") ? "\t" : ",";

  // Step 1: group physical lines into logical rows
  const logicalRows: string[] = [];
  let continuationsMerged = 0;

  for (const line of lines) {
    if (line === "") continue; // skip empty lines (trailing newline etc.)

    if (isRowStart(line) || logicalRows.length === 0) {
      logicalRows.push(line);
    } else {
      // Continuation — append with an actual newline so the tokenizer sees it
      logicalRows[logicalRows.length - 1] += "\n" + line;
      continuationsMerged++;
    }
  }

  // Step 2: for rows that span multiple physical lines, fix the newlines
  const processedRows = logicalRows.map((row) => {
    if (!row.includes("\n")) return row; // nothing to fix

    const fields = tokenizeFields(row, sep);
    const cleaned = fields.map((f) => f.replace(/\n/g, "\\n"));
    return cleaned.map((f) => serializeField(f, sep)).join(sep);
  });

  const output = processedRows.join("\n") + "\n";
  writeFileSync(abs, output, "utf-8");

  return { file: filePath, continuationsMerged };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  for (const file of FILES) {
    try {
      const result = fixFile(file);
      if (result.continuationsMerged > 0) {
        process.stdout.write(
          `Fixed ${result.file}: merged ${result.continuationsMerged} continuation line(s)\n`
        );
      } else {
        process.stdout.write(`${result.file}: no changes needed\n`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(`Error processing ${file}: ${msg}\n`);
    }
  }
}

main();
