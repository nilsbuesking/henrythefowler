import type { CombatSpec, CombatState, Content, EnemyDef, GameState } from "./types";
import type { Rng } from "./rng";
import { describeCheck, maxHp, rollCheck } from "./rules";

// Deliberately light combat: each round both sides choose an action at the same
// time. Wounds carry over after the fight. Most enemies yield before they die.

export type CombatAction = "strike" | "guard" | "withdraw" | "parley";

export function startCombat(content: Content, spec: CombatSpec): CombatState {
  const enemy = getEnemy(content, spec.enemy);
  return {
    spec,
    enemyHp: enemy.hp,
    round: 1,
    riposte: false,
    lines: [enemy.description],
  };
}

export function getEnemy(content: Content, id: string): EnemyDef {
  const e = content.enemies[id];
  if (!e) throw new Error(`Unknown enemy: ${id}`);
  return e;
}

export function availableActions(c: CombatState): CombatAction[] {
  const acts: CombatAction[] = ["strike", "guard"];
  if (c.spec.onFlee) acts.push("withdraw");
  if (c.spec.parley) acts.push("parley");
  return acts;
}

export function playerAttack(state: GameState, content: Content): { bonus: number; damage: [number, number] } {
  const w = state.equipped.weapon ? content.items[state.equipped.weapon] : undefined;
  return { bonus: state.stats.strength + (w?.attack ?? 0), damage: w?.damage ?? [1, 2] };
}

export function playerDefence(state: GameState, content: Content): number {
  const s = state.equipped.shield ? content.items[state.equipped.shield] : undefined;
  return 8 + Math.floor(state.stats.wits / 2) + (s?.defence ?? 0);
}

export function playerArmour(state: GameState, content: Content): number {
  const a = state.equipped.armour ? content.items[state.equipped.armour] : undefined;
  return a?.armour ?? 0;
}

/** Resolves one round. Mutates the game state (HP) and the combat state. */
export function resolveRound(
  state: GameState,
  content: Content,
  c: CombatState,
  action: CombatAction,
  rng: Rng,
): void {
  if (c.over) return;
  const enemy = getEnemy(content, c.spec.enemy);
  const lines: string[] = [];
  const enemyAction: "strike" | "guard" = rng.next() < 0.7 ? "strike" : "guard";
  let enemyFreeStrike = false;

  if (action === "withdraw") {
    const r = rollCheck(state, { stat: "wits", dc: 12 }, rng);
    lines.push(describeCheck(r));
    if (r.success) {
      c.over = { result: "flee", text: "You break away and are gone before they can follow." };
      c.lines.push(...lines);
      return;
    }
    lines.push("You try to break away, but your foe is on you.");
    enemyFreeStrike = true;
  } else if (action === "parley" && c.spec.parley) {
    const r = rollCheck(state, { stat: c.spec.parley.stat, dc: c.spec.parley.dc }, rng);
    lines.push(describeCheck(r));
    if (r.success) {
      c.over = { result: "parley", text: "Your words land. The fight goes out of your foe." };
      c.lines.push(...lines);
      return;
    }
    lines.push("Your words fall on deaf ears, and you have lowered your guard.");
    enemyFreeStrike = true;
  } else if (action === "strike") {
    const atk = playerAttack(state, content);
    const bonus = atk.bonus + (c.riposte ? 2 : 0);
    const roll = rng.d20();
    const target = 10 + enemy.defence + (enemyAction === "guard" ? 4 : 0);
    const hit = roll === 20 || (roll !== 1 && roll + bonus >= target);
    if (hit) {
      const dmg = Math.max(1, rng.int(atk.damage[0], atk.damage[1]) + (roll === 20 ? 2 : 0) - enemy.armour);
      c.enemyHp = Math.max(0, c.enemyHp - dmg);
      lines.push(`You strike home for ${dmg}${enemyAction === "guard" ? ", through their guard" : ""}.`);
    } else {
      lines.push(enemyAction === "guard" ? "Your blow is caught and turned." : "Your blow goes wide.");
    }
  } else {
    lines.push("You set your feet and guard.");
  }
  c.riposte = action === "guard";

  if (c.enemyHp <= 0) {
    c.over = { result: "win", text: `${enemy.name} falls and does not rise.` };
  } else if (c.enemyHp <= Math.floor(enemy.hp * enemy.morale)) {
    c.over = { result: "win", text: `${enemy.name} throws down the weapon and yields.` };
  }

  if (!c.over && (enemyAction === "strike" || enemyFreeStrike)) {
    const roll = rng.d20();
    const def = playerDefence(state, content) + (action === "guard" ? 4 : 0);
    const bonus = enemy.skill + (enemyFreeStrike ? 2 : 0);
    const hit = roll === 20 || (roll !== 1 && roll + bonus >= def);
    if (hit) {
      const dmg = Math.max(1, rng.int(enemy.damage[0], enemy.damage[1]) - playerArmour(state, content));
      state.hp = Math.max(0, state.hp - dmg);
      lines.push(`${enemy.name} strikes you for ${dmg}.`);
    } else {
      lines.push(`${enemy.name} attacks, but you turn it aside.`);
    }
  } else if (!c.over) {
    lines.push(`${enemy.name} holds back, watching you.`);
  }

  if (!c.over && state.hp <= 0) {
    if (c.spec.onLose) {
      state.hp = 1;
      c.over = { result: "lose", text: "You go down in the mud. The world turns grey." };
    } else {
      c.over = { result: "death", text: "The blow is a mortal one. Your sight darkens." };
    }
  }
  c.round++;
  c.lines.push(...lines);
  if (c.lines.length > 40) c.lines.splice(0, c.lines.length - 40);
}

export function hpFraction(state: GameState): number {
  return state.hp / maxHp(state);
}
