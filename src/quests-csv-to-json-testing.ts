/**
 * quests-csv-to-json-testing
 *
 * Identical to quests-csv-to-json but produces testing variants:
 *  - QuestId and filename get a "-testing" suffix
 *  - LevelReq is overridden to 1–220 (no level gate)
 *
 * Usage:
 *   tsx src/quests-csv-to-json-testing.ts [options] [input.csv]
 *
 * Options:
 *   --pretty               Pretty-print the JSON output
 *   --output <file>        Write all quests as a JSON array to a single file
 *   --output-dir <dir>     Write one JSON file per quest (named <questId>.json)
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { questsFromCsv } from "./utils/quest-builder.js";
import type { Quest } from "./types/quest.js";
import type { DataMaps } from "./types/data-maps.js";

const ITEM_IDS_PATH = "input_data/maps/item_ids.json";

const TESTING_LEVEL_REQ = { MinLevel: 1, MaxLevel: 220 };

interface Options {
  pretty: boolean;
  output: string | null;
  outputDir: string | null;
  input: string | null;
}

function parseArgs(argv: string[]): Options {
  const args = argv.slice(2);
  const opts: Options = { pretty: false, output: null, outputDir: null, input: null };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--pretty") {
      opts.pretty = true;
    } else if (arg === "--output") {
      opts.output = args[++i] ?? null;
    } else if (arg === "--output-dir") {
      opts.outputDir = args[++i] ?? null;
    } else if (!arg.startsWith("--")) {
      opts.input = arg;
    }
  }

  return opts;
}

function toTestingVariant(quest: Quest): Quest {
  return {
    ...quest,
    QuestId: `${quest.QuestId}-testing`,
    LevelReq: TESTING_LEVEL_REQ,
  };
}

function serialize(value: Quest | Quest[], pretty: boolean): string {
  return pretty ? JSON.stringify(value, null, 2) : JSON.stringify(value);
}

function main() {
  const opts = parseArgs(process.argv);

  let raw: string;
  try {
    raw = opts.input
      ? readFileSync(opts.input, "utf-8")
      : readFileSync("/dev/stdin", "utf-8");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`Error reading input: ${msg}\n`);
    process.exit(1);
  }

  let itemIds: Record<string, number[]> = {};
  try {
    itemIds = JSON.parse(readFileSync(ITEM_IDS_PATH, "utf-8"));
  } catch {
    // map file missing or unreadable — start empty
  }

  const maps: DataMaps = { itemIds };
  const quests = questsFromCsv(raw, maps).map(toTestingVariant);

  // Register any ObtainItem names not yet in the map
  let mapDirty = false;
  for (const quest of quests) {
    for (const obj of quest.ObjectiveDefinitions) {
      if (obj.Type === "ObtainItem" && !(obj.Description in itemIds)) {
        itemIds[obj.Description] = [];
        mapDirty = true;
      }
    }
  }
  if (mapDirty) {
    writeFileSync(ITEM_IDS_PATH, JSON.stringify(itemIds, null, 2) + "\n", "utf-8");
    process.stderr.write(`Updated ${ITEM_IDS_PATH} with new item entries\n`);
  }

  if (opts.outputDir) {
    try {
      mkdirSync(opts.outputDir, { recursive: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(`Error creating output directory: ${msg}\n`);
      process.exit(1);
    }

    for (const quest of quests) {
      const filePath = join(opts.outputDir, `${quest.QuestId}.json`);
      writeFileSync(filePath, serialize(quest, opts.pretty) + "\n", "utf-8");
    }

    process.stderr.write(`Wrote ${quests.length} testing quest files to ${opts.outputDir}/\n`);
  } else if (opts.output) {
    writeFileSync(opts.output, serialize(quests, opts.pretty) + "\n", "utf-8");
    process.stderr.write(`Wrote ${quests.length} testing quests to ${opts.output}\n`);
  } else {
    process.stdout.write(serialize(quests, opts.pretty) + "\n");
  }
}

main();
