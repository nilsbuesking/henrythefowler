import type { Check, Condition, Content, Effect, GameState, StatKey } from "./types";
import type { Rng } from "./rng";

export const STAT_NAMES: Record<StatKey, string> = {
  strength: "Strength",
  endurance: "Endurance",
  craft: "Craft",
  wits: "Wits",
  standing: "Standing",
  piety: "Piety",
};

export function maxHp(state: GameState): number {
  return 10 + state.stats.endurance * 2;
}

export interface CheckResult {
  stat: StatKey;
  roll: number;
  total: number;
  dc: number;
  success: boolean;
}

/** d20 + stat against a difficulty. A natural 20 always succeeds, a natural 1 always fails. */
export function rollCheck(state: GameState, check: Check, rng: Rng): CheckResult {
  const roll = rng.d20();
  const total = roll + state.stats[check.stat];
  const success = roll === 20 || (roll !== 1 && total >= check.dc);
  return { stat: check.stat, roll, total, dc: check.dc, success };
}

export function describeCheck(r: CheckResult): string {
  const note = r.roll === 20 ? " (a natural 20)" : r.roll === 1 ? " (a natural 1)" : "";
  return `${STAT_NAMES[r.stat]} check: rolled ${r.roll} + ${r.total - r.roll} = ${r.total} against ${r.dc}${note}: ${
    r.success ? "success" : "failure"
  }.`;
}

/** Rough odds of success, for showing difficulty to the player. */
export function checkOdds(state: GameState, check: Check): number {
  let wins = 0;
  for (let roll = 1; roll <= 20; roll++) {
    if (roll === 20 || (roll !== 1 && roll + state.stats[check.stat] >= check.dc)) wins++;
  }
  return wins / 20;
}

export function conditionHolds(state: GameState, c: Condition): boolean {
  if (c.any && !c.any.some((sub) => conditionHolds(state, sub))) return false;
  if (c.flag !== undefined) {
    const want = c.equals === undefined ? true : c.equals;
    if (state.flags[c.flag] !== want) return false;
  }
  if (c.notFlag !== undefined && state.flags[c.notFlag]) return false;
  if (c.hasItem !== undefined && !(state.inventory[c.hasItem] > 0)) return false;
  if (c.season !== undefined && state.season !== c.season) return false;
  if (c.year !== undefined && state.year !== c.year) return false;
  let value: number | undefined;
  if (c.resource) value = state.resources[c.resource];
  else if (c.stat) value = state.stats[c.stat];
  else if (c.rep) value = state.rep[c.rep];
  if (value !== undefined) {
    if (c.gte !== undefined && value < c.gte) return false;
    if (c.lte !== undefined && value > c.lte) return false;
  }
  return true;
}

export function allHold(state: GameState, conds: Condition[] | undefined): boolean {
  return !conds || conds.every((c) => conditionHolds(state, c));
}

export function fillText(state: GameState, content: Content, text: string): string {
  return text
    .replace(/\{name\}/g, state.name)
    .replace(/\{year\}/g, String(state.year))
    .replace(/\{season\}/g, content.seasonNames[state.season] ?? "");
}

/** Applies effects and returns log lines describing visible changes. */
export function applyEffects(state: GameState, content: Content, effects: Effect[] | undefined): string[] {
  const lines: string[] = [];
  if (!effects) return lines;
  const sign = (n: number) => (n > 0 ? `+${n}` : String(n));
  for (const e of effects) {
    switch (e.type) {
      case "resource":
        state.resources[e.key] = Math.max(0, state.resources[e.key] + e.delta);
        lines.push(`${capital(e.key)} ${sign(e.delta)}.`);
        break;
      case "rep":
        state.rep[e.key] = clamp(state.rep[e.key] + e.delta, -10, 10);
        lines.push(`Regard of ${REP_LABEL[e.key]} ${sign(e.delta)}.`);
        break;
      case "stat":
        state.stats[e.key] = clamp(state.stats[e.key] + e.delta, 1, 10);
        lines.push(`${STAT_NAMES[e.key]} ${sign(e.delta)}.`);
        break;
      case "flag":
        state.flags[e.key] = e.value === undefined ? true : e.value;
        break;
      case "item": {
        const item = content.items[e.id];
        const n = Math.max(0, (state.inventory[e.id] ?? 0) + e.delta);
        if (n === 0) {
          delete state.inventory[e.id];
          for (const slot of ["weapon", "armour", "shield"] as const) {
            if (state.equipped[slot] === e.id) delete state.equipped[slot];
          }
        } else state.inventory[e.id] = n;
        lines.push(`${e.delta > 0 ? "Gained" : "Lost"}: ${item?.name ?? e.id}.`);
        break;
      }
      case "equip":
        equip(state, content, e.id);
        break;
      case "hp":
        state.hp = clamp(state.hp + e.delta, 0, maxHp(state));
        lines.push(e.delta < 0 ? `You are hurt (${e.delta}).` : `You recover (${sign(e.delta)}).`);
        break;
      case "heal":
        state.hp = maxHp(state);
        break;
      case "log":
        lines.push(fillText(state, content, e.text));
        break;
      case "teleport":
        state.map = e.map;
        state.x = e.x;
        state.y = e.y;
        break;
      case "obligation":
        state.obligations = state.obligations.filter((o) => o.id !== e.id);
        state.obligations.push({ id: e.id, text: e.text, year: e.year, season: e.season });
        lines.push(`New obligation: ${e.text}`);
        break;
      case "fulfil":
        state.obligations = state.obligations.filter((o) => o.id !== e.id);
        state.flags[`fulfilled_${e.id}`] = true;
        break;
      case "codex":
        if (!state.codex.includes(e.id)) {
          state.codex.push(e.id);
          const entry = content.codex[e.id];
          lines.push(`Codex: ${entry?.title ?? e.id}.`);
        }
        break;
    }
  }
  return lines;
}

export function equip(state: GameState, content: Content, id: string): boolean {
  const item = content.items[id];
  if (!item || !(state.inventory[id] > 0)) return false;
  if (item.kind === "weapon") state.equipped.weapon = id;
  else if (item.kind === "armour") state.equipped.armour = id;
  else if (item.kind === "shield") state.equipped.shield = id;
  else return false;
  return true;
}

export const REP_LABEL: Record<string, string> = {
  lord: "your lord",
  king: "the king's circle",
  church: "the Church",
  village: "the village",
};

function capital(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}
