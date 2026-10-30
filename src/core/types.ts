// Core data types. Nothing in src/core may touch the DOM, so the rules can be
// tested headlessly and reused by other settings (e.g. a Wilhelmine game).

export const STAT_KEYS = ["strength", "endurance", "craft", "wits", "standing", "piety"] as const;
export type StatKey = (typeof STAT_KEYS)[number];

export const RESOURCE_KEYS = ["grain", "livestock", "silver", "retainers"] as const;
export type ResourceKey = (typeof RESOURCE_KEYS)[number];

export const REP_KEYS = ["lord", "king", "church", "village"] as const;
export type RepKey = (typeof REP_KEYS)[number];

export type FlagValue = string | number | boolean;

/** A condition is satisfied when every field present on it holds. */
export interface Condition {
  flag?: string;
  /** Value the flag must equal; defaults to `true` when `flag` is given. */
  equals?: FlagValue;
  notFlag?: string;
  resource?: ResourceKey;
  stat?: StatKey;
  rep?: RepKey;
  gte?: number;
  lte?: number;
  hasItem?: string;
  season?: number;
  year?: number;
  /** Satisfied if any of the nested conditions holds. */
  any?: Condition[];
}

export type Effect =
  | { type: "resource"; key: ResourceKey; delta: number }
  | { type: "rep"; key: RepKey; delta: number }
  | { type: "stat"; key: StatKey; delta: number }
  | { type: "flag"; key: string; value?: FlagValue }
  | { type: "item"; id: string; delta: number }
  | { type: "equip"; id: string }
  | { type: "hp"; delta: number }
  | { type: "heal" }
  | { type: "log"; text: string }
  | { type: "teleport"; map: string; x: number; y: number }
  | { type: "obligation"; id: string; text: string; year: number; season: number }
  | { type: "fulfil"; id: string }
  | { type: "codex"; id: string };

export interface CombatSpec {
  enemy: string;
  /** Event shown after victory. */
  onWin?: string;
  /** Event shown after defeat. If absent and the enemy is lethal, defeat is death. */
  onLose?: string;
  /** Event shown after a successful withdrawal. Withdrawal is impossible if absent. */
  onFlee?: string;
  /** Optional talking-down during the fight. */
  parley?: { stat: StatKey; dc: number; event: string };
}

export interface Outcome {
  text: string;
  effects?: Effect[];
  /** Event to show next. */
  next?: string;
  combat?: CombatSpec;
  /** End the current season after this outcome. */
  endSeason?: boolean;
  /** The player character dies. */
  death?: boolean;
}

export interface Check {
  stat: StatKey;
  dc: number;
}

export interface Choice {
  text: string;
  /** Choice is only offered if all conditions hold. */
  if?: Condition[];
  check?: Check;
  /** Used when there is no check. */
  result?: Outcome;
  success?: Outcome;
  failure?: Outcome;
}

export interface GameEvent {
  id: string;
  title: string;
  text: string;
  /** Empty or absent: a single "Continue" that returns to the map. */
  choices?: Choice[];
  /** Effects applied as soon as the event is shown. */
  onShow?: Effect[];
}

export interface ItemDef {
  id: string;
  name: string;
  kind: "weapon" | "armour" | "shield" | "tool" | "misc";
  description: string;
  attack?: number;
  damage?: [number, number];
  defence?: number;
  armour?: number;
}

export interface EnemyDef {
  id: string;
  name: string;
  description: string;
  hp: number;
  skill: number;
  defence: number;
  damage: [number, number];
  armour: number;
  /** The enemy yields when its HP falls to or below this fraction of maximum. */
  morale: number;
  sprite: string;
}

export interface TileDef {
  name: string;
  walkable: boolean;
  sprite: string;
}

export interface MapExit {
  x: number;
  y: number;
  to: string;
  tx: number;
  ty: number;
  if?: Condition[];
  /** Event shown instead if the conditions fail. */
  blockedEvent?: string;
}

export interface MapDef {
  id: string;
  name: string;
  rows: string[];
  exits: MapExit[];
  /** Tile drawn beyond the edges of the map. */
  outside: string;
}

export interface NpcDef {
  id: string;
  name: string;
  map: string;
  x: number;
  y: number;
  sprite: string;
  /** Radius of random wandering around the home tile; 0 = stationary. */
  wander?: number;
  showIf?: Condition[];
  /** First entry whose conditions hold decides what talking to the NPC shows. */
  talk: { if?: Condition[]; event: string }[];
}

export interface TriggerDef {
  id: string;
  map: string;
  x: number;
  y: number;
  event: string;
  once?: boolean;
  if?: Condition[];
}

export interface TraitDef {
  id: string;
  name: string;
  description: string;
  effects: Effect[];
}

export interface BackgroundDef {
  id: string;
  name: string;
  description: string;
  stats: Record<StatKey, number>;
  resources: Record<ResourceKey, number>;
  rep: Record<RepKey, number>;
  items: Record<string, number>;
  equip: string[];
  start: { map: string; x: number; y: number; year: number; season: number };
  startEvent: string;
  traits: TraitDef[];
}

export interface CodexEntry {
  id: string;
  title: string;
  text: string;
  /** How well attested the matter is. */
  evidence: "well attested" | "attested" | "debated" | "reconstructed" | "invented";
}

export interface SeasonRules {
  /** Grain eaten per season by the household, plus per retainer. */
  grainBase: number;
  grainPerRetainer: number;
  /** Season index in which the harvest comes in. */
  harvestSeason: number;
}

export interface Content {
  id: string;
  title: string;
  seasonNames: string[];
  backgrounds: BackgroundDef[];
  events: Record<string, GameEvent>;
  items: Record<string, ItemDef>;
  enemies: Record<string, EnemyDef>;
  tiles: Record<string, TileDef>;
  maps: Record<string, MapDef>;
  npcs: NpcDef[];
  triggers: TriggerDef[];
  codex: Record<string, CodexEntry>;
  /** Event shown at the start of a given season, keyed "year-season". */
  seasonEvents: Record<string, string>;
  seasonRules: SeasonRules;
}

export interface Obligation {
  id: string;
  text: string;
  year: number;
  season: number;
}

export interface CombatState {
  spec: CombatSpec;
  enemyHp: number;
  round: number;
  riposte: boolean;
  lines: string[];
  /** Set when the fight is over; the player continues to `next`. */
  over?: { result: "win" | "lose" | "flee" | "parley" | "death"; text: string };
}

export type Mode =
  | { kind: "explore" }
  | { kind: "event"; eventId: string }
  | {
      kind: "result";
      title: string;
      text: string;
      next?: string;
      combat?: CombatSpec;
      endSeason?: boolean;
      death?: boolean;
    }
  | { kind: "combat"; combat: CombatState }
  | { kind: "dead"; text: string };

export interface GameState {
  version: 1;
  rng: number;
  name: string;
  background: string;
  trait: string;
  stats: Record<StatKey, number>;
  hp: number;
  resources: Record<ResourceKey, number>;
  rep: Record<RepKey, number>;
  inventory: Record<string, number>;
  equipped: { weapon?: string; armour?: string; shield?: string };
  flags: Record<string, FlagValue>;
  year: number;
  season: number;
  map: string;
  x: number;
  y: number;
  npcPos: Record<string, { x: number; y: number }>;
  obligations: Obligation[];
  codex: string[];
  log: string[];
  mode: Mode;
}
