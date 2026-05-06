/**
 * Quest builder utilities.
 *
 * Provides:
 *  - ID generation
 *  - Objective line parser (bullet-point text → ObjectiveDefinition)
 *  - CSV row → Quest factory
 *  - Quest[] → JSON serializer
 *
 * All builder functions accept an optional DataMaps argument. When maps are
 * provided they are used to enrich generated objects (e.g. per-mob playfield
 * IDs). When omitted, sensible defaults apply.
 */

import type {
  Quest,
  ObjectiveDefinition,
  ObjectiveType,
  Reward,
  LevelReq,
} from "../types/quest.js";
import type { DataMaps } from "../types/data-maps.js";
import { parseCsv } from "./csv.js";

// ---------------------------------------------------------------------------
// CSV row shape — lives here because it's an import concern, not a domain type
// ---------------------------------------------------------------------------

export interface QuestCsvRow {
  /** Chapter / cap number */
  cap: number;
  /** Profession requirement, e.g. "All" */
  profReq: string;
  title: string;
  /** Raw bullet-point objectives string, one line per objective */
  objectivesRaw: string;
  /** Coin reward amount */
  ironCoins: number;
  /** Which coin type the reward uses */
  coinType: "IronCoin" | "IronChip";
  description: string;
  /** Raw playfield id string — may be comma-separated or "No loc" */
  playfieldRaw: string;
  zone: string;
  /** Explicit type override — takes precedence over Solo inference when set */
  questType?: Quest["Type"];
}


// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const DEFAULT_LEVEL_REQ: LevelReq = { MinLevel: 1, MaxLevel: 220 };

const CAP_LEVEL_RANGES: Record<number, LevelReq> = {
  1: { MinLevel: 1,   MaxLevel: 35  },
  2: { MinLevel: 36,  MaxLevel: 75  },
  3: { MinLevel: 76,  MaxLevel: 135 },
  4: { MinLevel: 136, MaxLevel: 175 },
  5: { MinLevel: 176, MaxLevel: 220 },
};

/**
 * Returns the LevelReq for a given cap and quest type.
 * Open and Solo quests use the cap's level range; all others use the full range.
 */
export function getLevelReq(cap: number, questType: string): LevelReq {
  if (questType === "Open" || questType === "Solo") {
    return CAP_LEVEL_RANGES[cap] ?? DEFAULT_LEVEL_REQ;
  }
  return DEFAULT_LEVEL_REQ;
}

// ---------------------------------------------------------------------------
// ID generation
// ---------------------------------------------------------------------------

/**
 * Builds a deterministic QuestId from the quest type and title.
 * e.g. ("Open", "Clearing the Mortiig Beach") → "open-clearing-the-mortiig-beach"
 */
export function buildQuestId(questType: string, cap: number, title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/\s+/g, "-")        // spaces → dashes
    .replace(/[^a-z0-9-]/g, "") // strip non-alphanumeric/dash
    .replace(/-+/g, "-")        // collapse consecutive dashes
    .replace(/^-|-$/g, "");     // trim leading/trailing dashes
  return `${cap}-${questType.toLowerCase()}-${slug}`;
}

/**
 * Generates a short random ID in the form `<prefix>-<4 random hex chars>`.
 * Used for objective IDs.
 */
export function generateId(prefix: string): string {
  const hex = Math.floor(Math.random() * 0x10000)
    .toString(16)
    .padStart(4, "0");
  return `${prefix}-${hex}`;
}

// ---------------------------------------------------------------------------
// Objective line parser
// ---------------------------------------------------------------------------

interface ParsedObjective {
  type: ObjectiveType;
  required: number;
  targets: string[];
  description: string;
  minLevel: number | null;
  maxLevel: number | null;
}

/** Matches "(lvl 150+)" annotations in target names */
const LVL_ANNOTATION_RE = /\s*\(lvl\s+(\d+)\+\)/i;

/**
 * Strips a "(lvl X+)" annotation from a target name and returns both the
 * clean name and the parsed minimum level.
 */
function extractTargetLevel(raw: string): { name: string; minLevel: number | null } {
  const m = raw.match(LVL_ANNOTATION_RE);
  if (!m) return { name: raw.trim(), minLevel: null };
  return {
    name: raw.replace(LVL_ANNOTATION_RE, "").trim(),
    minLevel: parseInt(m[1]!, 10),
  };
}

const SOLO_KILL_RE = /^solo\s+kill\s+(.+)/i;
const KILL_N_RE = /^kill\s+(\d+)\s+(.+)/i;
const KILL_RE = /^kill\s+(.+)/i;
const OBTAIN_N_RE = /^(?:get|obtain)\s+(\d+)\s+(.+)/i;
const OBTAIN_RE = /^(?:get|obtain)\s+(.+)/i;
const TRAVEL_RE = /^(?:travel|go\s+to|reach)\s+(.+)/i;
const USE_RE = /^use\s+(.+)/i;
const EQUIP_RE = /^equip\s+(.+)/i;
const TARGET_RE = /^target\s+(.+)/i;

/**
 * Parses a single bullet-point objective line into a typed structure.
 * Strips leading bullet characters (•, -, *) if present.
 * Extracts "(lvl X+)" annotations from target names into minLevel.
 *
 * "Solo Kill" in CSV means the quest type is Solo — the objective itself
 * is still KillMob.
 */
export function parseObjectiveLine(line: string): ParsedObjective {
  const trimmed = line.replace(/^[•\-*]\s*/, "").trim();

  let m: RegExpMatchArray | null;

  // "Solo Kill X" → KillMob (solo is a quest-level property, not objective type)
  if ((m = trimmed.match(SOLO_KILL_RE)) !== null) {
    const raw = (m[1] ?? "").trim();
    const { name, minLevel } = extractTargetLevel(raw);
    return { type: "KillMob", required: 1, targets: [name], description: raw, minLevel, maxLevel: null };
  }

  if ((m = trimmed.match(KILL_N_RE)) !== null) {
    const required = parseInt(m[1] ?? "1", 10);
    const raw = (m[2] ?? "").trim();
    const { name, minLevel } = extractTargetLevel(raw);
    return {
      type: "KillMob",
      required,
      targets: [name],
      description: `Kill ${required} ${raw}`,
      minLevel,
      maxLevel: null,
    };
  }

  if ((m = trimmed.match(KILL_RE)) !== null) {
    const raw = (m[1] ?? "").trim();
    const { name, minLevel } = extractTargetLevel(raw);
    return { type: "KillMob", required: 1, targets: [name], description: raw, minLevel, maxLevel: null };
  }

  if ((m = trimmed.match(OBTAIN_N_RE)) !== null) {
    const required = parseInt(m[1] ?? "1", 10);
    const item = (m[2] ?? "").replace(/\.+$/, "").trim();
    return { type: "ObtainItem", required, targets: [item], description: item, minLevel: null, maxLevel: null };
  }

  if ((m = trimmed.match(OBTAIN_RE)) !== null) {
    const item = (m[1] ?? "").replace(/\.+$/, "").trim();
    return { type: "ObtainItem", required: 1, targets: [item], description: item, minLevel: null, maxLevel: null };
  }

  if ((m = trimmed.match(EQUIP_RE)) !== null) {
    const item = (m[1] ?? "").trim();
    return { type: "EquipItem", required: 1, targets: [item], description: item, minLevel: null, maxLevel: null };
  }

  if ((m = trimmed.match(USE_RE)) !== null) {
    const item = (m[1] ?? "").trim();
    return { type: "UseItem", required: 1, targets: [item], description: item, minLevel: null, maxLevel: null };
  }

  if ((m = trimmed.match(TARGET_RE)) !== null) {
    const raw = (m[1] ?? "").trim();
    const { name, minLevel } = extractTargetLevel(raw);
    return { type: "TargetMob", required: 1, targets: [name], description: raw, minLevel, maxLevel: null };
  }

  if ((m = trimmed.match(TRAVEL_RE)) !== null) {
    const dest = (m[1] ?? "").trim();
    return { type: "ReachDestination", required: 1, targets: [], description: dest, minLevel: null, maxLevel: null };
  }

  // Unrecognized pattern — store raw text, caller can handle
  return { type: "KillMob", required: 1, targets: [trimmed], description: trimmed, minLevel: null, maxLevel: null };
}

// ---------------------------------------------------------------------------
// Objective level requirement parser
// ---------------------------------------------------------------------------

/**
 * Parses a "min-max" level requirement string (e.g. "150-300") into a typed
 * object, or returns null if the string is empty or malformed.
 */
export function parseObjectiveLevelReq(
  raw: string
): { min: number; max: number } | null {
  const m = raw.trim().match(/^(\d+)-(\d+)$/);
  if (!m) return null;
  return { min: parseInt(m[1]!, 10), max: parseInt(m[2]!, 10) };
}

// ---------------------------------------------------------------------------
// Playfield ID parser
// ---------------------------------------------------------------------------

/**
 * Parses a raw playfield string like "4540" or "4540, 4541, 4542" into
 * an array of numbers, or null if the string is empty / "No loc".
 */
export function parsePlayfieldIds(raw: string): number[] | null {
  const trimmed = raw.trim();
  if (!trimmed || trimmed.toLowerCase() === "no loc") return null;

  const ids = trimmed
    .split(",")
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => !isNaN(n));

  return ids.length > 0 ? ids : null;
}

// ---------------------------------------------------------------------------
// Objective builder
// ---------------------------------------------------------------------------

/**
 * Converts a raw multiline objectives string into ObjectiveDefinition[].
 *
 * PlayfieldIds per objective are resolved in priority order:
 *  1. maps.mobPlayfields lookup for the objective's target (most specific)
 *  2. questPlayfieldIds inherited from the parent quest (fallback)
 *  3. null (no location data)
 */
export function buildObjectives(
  raw: string,
  questPlayfieldIds: number[] | null,
  maps?: DataMaps
): ObjectiveDefinition[] {
  return raw
    .split(/\\n|\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .map((line) => {
      const parsed = parseObjectiveLine(line);

      // ObtainItem objectives never have location restrictions; targets map to item IDs
      if (parsed.type === "ObtainItem") {
        const itemName = parsed.targets[0];
        const itemIds = (itemName !== undefined ? maps?.itemIds?.[itemName] : undefined) ?? [];
        return {
          ObjectiveId: generateId("obtainitem"),
          Type: parsed.type,
          Description: parsed.description,
          Required: parsed.required,
          PlayfieldIds: null,
          Targets: itemIds.map(String),
          MinLevel: null,
          MaxLevel: null,
        } satisfies ObjectiveDefinition;
      }

      // Resolve playfield IDs for other types: mob map > quest-level fallback
      let playfieldIds: number[] | null = questPlayfieldIds;
      if (maps?.mobPlayfields && parsed.targets.length > 0) {
        const firstTarget = parsed.targets[0];
        const mobIds = firstTarget !== undefined ? maps.mobPlayfields[firstTarget] : undefined;
        if (mobIds !== undefined) {
          playfieldIds = mobIds;
        }
      }

      return {
        ObjectiveId: generateId(parsed.type.toLowerCase()),
        Type: parsed.type,
        Description: parsed.description,
        Required: parsed.required,
        PlayfieldIds: playfieldIds,
        Targets: parsed.targets,
        MinLevel: parsed.minLevel ?? null,
        MaxLevel: parsed.maxLevel ?? null,
      } satisfies ObjectiveDefinition;
    });
}

// ---------------------------------------------------------------------------
// CSV row → Quest
// ---------------------------------------------------------------------------

/**
 * Converts a QuestCsvRow into a fully-formed Quest object.
 *
 * @param row   - Parsed CSV row data
 * @param maps  - Optional lookup tables to enrich the output
 */
export function questFromCsvRow(row: QuestCsvRow, maps?: DataMaps): Quest {
  const playfieldIds = parsePlayfieldIds(row.playfieldRaw);

  // "All" in CSV → "None" in quest schema (no profession restriction)
  const profReq = row.profReq.toLowerCase() === "all" ? "None" : row.profReq;

  // Use stable ID from map if available, otherwise build from type + title
  // Infer Solo type when any objective line begins with "Solo Kill"
  const hasSoloKill = /(?:^|\\n|\n)[•\-*\s]*solo\s+kill\s/im.test(row.objectivesRaw);
  const questType: Quest["Type"] = row.questType ?? (hasSoloKill ? "Solo" : "Open");
  const questId = maps?.questIds?.[row.title] ?? buildQuestId(questType, row.cap, row.title);

  const reward: Reward = {};
  if (row.ironCoins > 0) {
    reward.Coins = { [row.coinType]: row.ironCoins };
  }

  return {
    QuestId: questId,
    Title: row.title,
    Description: row.description,
    Type: questType,
    ProfReq: profReq,
    LevelReq: getLevelReq(row.cap, questType),
    IsRepeatable: false,
    RepeatCooldown: null,
    TimeLimit: null,
    UnlockCode: row.cap,
    PrerequisiteQuests: [],
    NextQuestInChain: null,
    ObjectiveDefinitions: buildObjectives(row.objectivesRaw, playfieldIds, maps),
    Reward: reward,
  };
}

// ---------------------------------------------------------------------------
// CSV text → Quest[]
// ---------------------------------------------------------------------------

/**
 * Parses quest CSV or TSV text into Quest objects.
 *
 * All files must include a header row. Separator is auto-detected (tab vs comma).
 *
 * Column name mappings (first match wins):
 *   cap        — "Level Cap" | "Level"
 *   profReq    — "All/Prof"  (absent → "None"; files without it default to Global type)
 *   title      — "Quest Name"
 *   objectives — "Quest Description"
 *   ironCoins  — "Quest Reward / Iron Coin" | "Reward" | "Iron Chips"
 *   description— "Description"
 *   playfieldRaw — "LocationID"
 *   zone       — "Location"
 *   solo       — "Solo"
 *
 * @param csvText - Raw file contents
 * @param maps    - Optional lookup tables to enrich the output
 */
export function questsFromCsv(csvText: string, maps?: DataMaps): Quest[] {
  const firstLine = csvText.split("\n")[0] ?? "";
  const sep = firstLine.includes("\t") ? "\t" : ",";
  const records = parseCsv(csvText, sep);

  // Files with an "All/Prof" column contain Open/Solo quests; others are Global.
  const isGlobalFile = records.length === 0 || !("All/Prof" in (records[0] ?? {}));

  return records
    .filter((r) => (r["Quest Name"] ?? "").trim() !== "")
    .map((r): Quest => {
      const capRaw = r["Level Cap"] ?? r["Level"] ?? "0";
      const hasIronChips = "Iron Chips" in r;
      const rewardRaw = r["Quest Reward / Iron Coin"] ?? r["Reward"] ?? r["Iron Chips"] ?? "0";

      const csvRow: QuestCsvRow = {
        cap: parseInt(capRaw.trim(), 10) || 0,
        profReq: (r["All/Prof"] ?? "").trim() || "None",
        title: (r["Quest Name"] ?? "").trim(),
        objectivesRaw: (r["Quest Description"] ?? "").trim(),
        ironCoins: parseInt(rewardRaw.trim(), 10) || 0,
        coinType: hasIronChips ? "IronChip" : "IronCoin",
        description: (r["Description"] ?? "").trim(),
        playfieldRaw: (r["LocationID"] ?? "").trim(),
        zone: (r["Location"] ?? "").trim(),
        ...(isGlobalFile && { questType: "Global" }),
      };
      return questFromCsvRow(csvRow, maps);
    });
}

// ---------------------------------------------------------------------------
// Serialization
// ---------------------------------------------------------------------------

/**
 * Serializes a Quest array to a JSON string.
 */
export function questsToJson(quests: Quest[], pretty = false): string {
  return pretty ? JSON.stringify(quests, null, 2) : JSON.stringify(quests);
}
