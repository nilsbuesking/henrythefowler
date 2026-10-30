import type {
  BackgroundDef,
  CodexEntry,
  Content,
  EnemyDef,
  GameEvent,
  ItemDef,
  MapDef,
  NpcDef,
  TileDef,
  TriggerDef,
} from "../../core/types";
import backgrounds from "./background.json";
import codex from "./codex.json";
import enemies from "./enemies.json";
import events from "./events.json";
import items from "./items.json";
import maps from "./maps.json";
import npcs from "./npcs.json";
import tiles from "./tiles.json";
import triggers from "./triggers.json";

// The Henry the Fowler content pack. Another setting supplies its own pack
// with the same shape and reuses everything in src/core.

const eventList = events as unknown as GameEvent[];

export const henry: Content = {
  id: "henry",
  title: "Henry the Fowler",
  seasonNames: ["Spring", "Summer", "Autumn", "Winter"],
  backgrounds: backgrounds as unknown as BackgroundDef[],
  events: Object.fromEntries(eventList.map((e) => [e.id, e])),
  items: items as unknown as Record<string, ItemDef>,
  enemies: enemies as unknown as Record<string, EnemyDef>,
  tiles: tiles as Record<string, TileDef>,
  maps: maps as unknown as Record<string, MapDef>,
  npcs: npcs as unknown as NpcDef[],
  triggers: triggers as unknown as TriggerDef[],
  codex: codex as unknown as Record<string, CodexEntry>,
  seasonEvents: { "919-1": "summer_919" },
  seasonRules: { grainBase: 2, grainPerRetainer: 1, harvestSeason: 1 },
};
