/**
 * csv-to-json
 *
 * Reads a CSV file (or stdin) and writes a JSON array to stdout or a file.
 *
 * Usage:
 *   tsx src/csv-to-json.ts [options] [input.csv]
 *
 * Options:
 *   --pretty           Pretty-print the JSON output (2-space indent)
 *   --output <file>    Write JSON to a file instead of stdout
 *   --delimiter <ch>   Field delimiter character (default: ',')
 */

import { readFileSync } from "node:fs";
import { writeFileSync } from "node:fs";
import { parseCsv } from "./utils/csv.js";

interface Options {
  pretty: boolean;
  delimiter: string;
  output: string | null;
  input: string | null;
}

function parseArgs(argv: string[]): Options {
  const args = argv.slice(2);
  const opts: Options = { pretty: false, delimiter: ",", output: null, input: null };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--pretty") {
      opts.pretty = true;
    } else if (arg === "--delimiter") {
      opts.delimiter = args[++i] ?? ",";
    } else if (arg === "--output") {
      opts.output = args[++i] ?? null;
    } else if (!arg.startsWith("--")) {
      opts.input = arg;
    }
  }

  return opts;
}

function readInput(filePath: string | null): string {
  if (filePath) {
    return readFileSync(filePath, "utf-8");
  }

  // Read from stdin
  return readFileSync("/dev/stdin", "utf-8");
}

function main() {
  const opts = parseArgs(process.argv);

  let raw: string;
  try {
    raw = readInput(opts.input);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`Error reading input: ${msg}\n`);
    process.exit(1);
  }

  const records = parseCsv(raw, opts.delimiter);
  const json = opts.pretty
    ? JSON.stringify(records, null, 2)
    : JSON.stringify(records);

  if (opts.output) {
    try {
      writeFileSync(opts.output, json + "\n", "utf-8");
      process.stderr.write(`Wrote ${records.length} records to ${opts.output}\n`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(`Error writing output: ${msg}\n`);
      process.exit(1);
    }
  } else {
    process.stdout.write(json + "\n");
  }
}

main();
