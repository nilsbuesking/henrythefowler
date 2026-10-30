import { describe, expect, it } from "vitest";
import { henry } from "../src/content/henry";
import { Game } from "../src/core/game";
import { createRng } from "../src/core/rng";
import { availableActions } from "../src/core/combat";
import { maxHp } from "../src/core/rules";

// A bot that wanders the map, talks to people and picks random choices.
// It catches broken references, dead ends and invariant violations.

function play(seed: number, steps: number) {
  const traits = henry.backgrounds[0].traits;
  const g = new Game(
    henry,
    Game.newState(henry, { name: "Bot", background: "landholder", trait: traits[seed % traits.length].id, seed }),
  );
  const bot = createRng(seed * 7919);
  const seen = new Set<string>();
  let goal: [number, number, string] | undefined;
  for (let i = 0; i < steps; i++) {
    const m = g.state.mode;
    if (m.kind === "dead") break;
    if (m.kind === "explore") {
      if (!goal || bot.next() < 0.02) goal = pickGoal(g, bot);
      const step = goal ? nextStep(g, goal) : undefined;
      if (step) g.move(step[0], step[1]);
      else {
        goal = undefined;
        const [dx, dy] = DIRS[bot.int(0, 3)];
        g.move(dx, dy);
      }
      if (i > steps / 2 && bot.next() < 0.005) g.showEvent("rest");
    } else if (m.kind === "event" || m.kind === "result") {
      if (m.kind === "event") seen.add(m.eventId);
      const ch = g.choices();
      expect(ch.length).toBeGreaterThan(0);
      g.choose(ch[bot.int(0, ch.length - 1)].index);
    } else if (m.kind === "combat") {
      const acts = availableActions(m.combat);
      g.combat(acts[bot.int(0, acts.length - 1)]);
    }
    const s = g.state;
    expect(s.hp).toBeGreaterThanOrEqual(0);
    expect(s.hp).toBeLessThanOrEqual(maxHp(s));
    for (const v of Object.values(s.resources)) expect(v).toBeGreaterThanOrEqual(0);
    expect(g.isWalkable(g.map, s.x, s.y) || g.map.exits.some((e) => e.x === s.x && e.y === s.y)).toBe(true);
  }
  return { g, seen };
}

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;

/** A random place of interest on the current map: a person, a trigger or an exit. */
function pickGoal(g: Game, bot: ReturnType<typeof createRng>): [number, number, string] | undefined {
  const m = g.state.map;
  const goals: [number, number][] = [
    ...g.visibleNpcs().map((n) => [g.state.npcPos[n.id].x, g.state.npcPos[n.id].y] as [number, number]),
    ...henry.triggers.filter((t) => t.map === m).map((t) => [t.x, t.y] as [number, number]),
    ...g.map.exits.map((e) => [e.x, e.y] as [number, number]),
  ];
  if (!goals.length) return undefined;
  const [x, y] = goals[bot.int(0, goals.length - 1)];
  return [x, y, m];
}

/** First step of a shortest path towards the goal (the goal itself may be blocked by a person). */
function nextStep(g: Game, goal: [number, number, string]): [number, number] | undefined {
  if (goal[2] !== g.state.map) return undefined;
  const map = g.map;
  const key = (x: number, y: number) => y * 1000 + x;
  const start = key(g.state.x, g.state.y);
  const prev = new Map<number, number>([[start, -1]]);
  const queue: [number, number][] = [[g.state.x, g.state.y]];
  while (queue.length) {
    const [x, y] = queue.shift()!;
    if (x === goal[0] && y === goal[1]) {
      let k = key(x, y);
      while (prev.get(k) !== start && prev.get(k) !== -1) k = prev.get(k)!;
      if (k === start) return undefined;
      return [(k % 1000) - g.state.x, Math.floor(k / 1000) - g.state.y];
    }
    for (const [dx, dy] of DIRS) {
      const nx = x + dx;
      const ny = y + dy;
      const k = key(nx, ny);
      if (prev.has(k)) continue;
      const isGoal = nx === goal[0] && ny === goal[1];
      if (!isGoal && !g.isWalkable(map, nx, ny)) continue;
      if (ny < 0 || nx < 0 || ny >= map.rows.length || nx >= map.rows[0].length) continue;
      prev.set(k, key(x, y));
      queue.push([nx, ny]);
    }
  }
  return undefined;
}

describe("random playthroughs", () => {
  it("run without errors and reach most events", () => {
    const allSeen = new Set<string>();
    let deaths = 0;
    let summers = 0;
    for (let seed = 1; seed <= 80; seed++) {
      const { g, seen } = play(seed, 3000);
      seen.forEach((s) => allSeen.add(s));
      if (g.state.mode.kind === "dead") deaths++;
      if (g.state.flags.slice_complete) summers++;
    }
    const missing = Object.keys(henry.events).filter((id) => !allSeen.has(id));
    console.log(`deaths ${deaths}/80, reached summer ${summers}/80, unseen: ${missing.join(", ") || "none"}`);
    expect(summers).toBeGreaterThan(0);
    expect(missing.length).toBeLessThan(8);
  }, 180_000);
});
