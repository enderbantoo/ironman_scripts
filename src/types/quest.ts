// ---------------------------------------------------------------------------
// Quest domain types — mirrors quest_example.json exactly
// ---------------------------------------------------------------------------

export type QuestType = "Global" | "Open" | "Solo";

export type ObjectiveType =
  | "KillMob"
  | "TargetMob"
  | "ObtainItem"
  | "EquipItem"
  | "ReachDestination"
  | "UseItem";

export interface LevelReq {
  MinLevel: number;
  MaxLevel: number;
}

export interface ObjectiveDefinition {
  ObjectiveId: string;
  Type: ObjectiveType;
  Description: string;
  /** How many times this objective must be completed */
  Required: number;
  PlayfieldIds: number[] | null;
  Targets: string[];
  MinLevel: number | null;
  MaxLevel: number | null;
  X?: number;
  Y?: number;
  Z?: number;
  Radius?: number;
  MinQl?: string | null;
  MaxQl?: string | null;
}

export interface CoinReward {
  IronCoin?: number;
  IronChip?: number;
}

export interface Reward {
  Coins?: CoinReward;
  Experience?: number;
  Items?: string[];
}

export interface Quest {
  QuestId: string;
  Title: string;
  Description: string;
  Type: QuestType;
  ProfReq: string;
  LevelReq: LevelReq;
  IsRepeatable: boolean;
  RepeatCooldown: string | null;
  TimeLimit: string | null;
  UnlockCode: number;
  PrerequisiteQuests: string[];
  NextQuestInChain: string | null;
  ObjectiveDefinitions: ObjectiveDefinition[];
  Reward: Reward;
}
