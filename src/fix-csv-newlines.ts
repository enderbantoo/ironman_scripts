/**
 * fix-csv-newlines
 *
 * Fixes malformed CSV/TSV quest files where fields containing newlines are
 * split across multiple physical lines instead of being properly encoded.
 *
 * For each file this script:
 *  1. Normalizes CRLF → LF so \r doesn't leak into field values
 *  2. Groups continuation lines back into their logical row.
 *     Two continuation patterns are handled:
 *     a) Empty-column continuation: line starts with the separator (tab/comma),
 *        meaning only some columns have data. Merged field-by-field.
 *     b) Quoted-field continuation: line is the tail of an RFC 4180 quoted field.
 *        Merged as raw text so the tokenizer can re-parse the whole quoted block.
 *  3. Parses each logical row into field values (handles RFC 4180 quoting)
 *  4. Replaces literal newline characters in field values with the \n escape
 *  5. Re-serializes each row as a single line, re-quoting fields that contain
 *     the delimiter character
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const FILES = [
  "input_data/quests/cap3/solo_quests/cap3_solo_quests.csv",
  "input_data/quests/cap3/daily_quests/cap3_daily_quests.csv",
  "input_data/quests/cap3/armor_quests/cap3.csv",
  "input_data/quests/cap3/tower_quests/cap3_tower_quests.csv",
  "input_data/quests/cap3/progression_quests/cap3_progression_quest.csv",
  "input_data/quests/cap3/tradeskill_quests/cap3_ts_quests.csv",
];

// ---------------------------------------------------------------------------
// Row boundary detection
// ---------------------------------------------------------------------------

function isRowStart(line: string): boolean {
  return /^\d+[\t,]/.test(line) || /^Level[\t, ]/.test(line);
}

// ---------------------------------------------------------------------------
// Field tokenizer
// ---------------------------------------------------------------------------

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

  // Normalize Windows CRLF and bare CR to LF so \r never leaks into field values
  const normalized = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = normalized.split("\n");

  // Detect separator from the first non-empty line
  const firstLine = lines.find((l) => l.trim() !== "") ?? "";
  const sep = firstLine.includes("\t") ? "\t" : ",";

  // Step 1: group physical lines into logical rows
  const logicalRows: string[] = [];
  let continuationsMerged = 0;

  for (const line of lines) {
    if (line === "") continue;

    if (isRowStart(line) || logicalRows.length === 0) {
      logicalRows.push(line);
    } else if (line.startsWith(sep)) {
      // Empty-column continuation: only some columns carry data.
      // Merge field-by-field into the previous row, escaping newlines immediately
      // so subsequent iterations see clean literal \n (not actual newlines).
      const prevFields = tokenizeFields(logicalRows[logicalRows.length - 1]!, sep);
      const contFields = tokenizeFields(line, sep);
      for (let i = 0; i < contFields.length && i < prevFields.length; i++) {
        if (contFields[i] !== "") {
          prevFields[i] += "\n" + contFields[i];
        }
      }
      const cleaned = prevFields.map((f) => f.replace(/\n/g, "\\n"));
      logicalRows[logicalRows.length - 1] = cleaned
        .map((f) => serializeField(f, sep))
        .join(sep);
      continuationsMerged++;
    } else {
      // Quoted-field continuation: raw text merge so the tokenizer can handle
      // the full RFC 4180 quoted block in step 2.
      logicalRows[logicalRows.length - 1] += "\n" + line;
      continuationsMerged++;
    }
  }

  // Step 2: for rows that span multiple physical lines (quoted-field continuations),
  // tokenize and escape the embedded newlines.
  const processedRows = logicalRows.map((row) => {
    if (!row.includes("\n")) return row;

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
