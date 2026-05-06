// ---------------------------------------------------------------------------
// Data map types — supplemental lookup tables that can be provided alongside
// CSV data to enrich the generated Quest objects.
//
// All maps are optional. Add new map types here as needed; each one requires
// only a new field in DataMaps and a corresponding lookup in quest-builder.ts.
// ---------------------------------------------------------------------------

/** Mob/NPC name → the playfield IDs where that mob appears */
export type MobPlayfieldMap = Record<string, number[]>;

/** Zone name (e.g. "Ely", "Foreman") → canonical playfield ID list */
export type ZonePlayfieldMap = Record<string, number[]>;

/**
 * Quest title → stable QuestId string.
 * Provide this to prevent ID churn when re-running the conversion script —
 * known quests will reuse their existing IDs instead of generating new ones.
 */
export type QuestIdMap = Record<string, string>;

/**
 * Item name → list of in-game item IDs.
 * Used to populate the Targets field on ObtainItem objectives.
 * ObtainItem objectives never carry PlayfieldId restrictions.
 */
export type ItemIdMap = Record<string, number[]>;

export interface DataMaps {
  mobPlayfields?: MobPlayfieldMap;
  zonePlayfields?: ZonePlayfieldMap;
  questIds?: QuestIdMap;
  itemIds?: ItemIdMap;
}
