import { describe, expect, it } from "vitest";
import { henry } from "../src/content/henry";
import { Game } from "../src/core/game";
import { createRng } from "../src/core/rng";
import { conditionHolds, rollCheck } from "../src/core/rules";
import { deserialize, serialize } from "../src/core/save";

function newGame(seed = 1, trait = "strong") {
  return new Game(henry, Game.newState(henry, { name: "Thiadric", background: "landholder", trait, seed }));
}

describe("rng", () => {
  it("is deterministic and in range", () => {
    const a = createRng(42);
    const b = createRng(42);
    for (let i = 0; i < 1000; i++) {
      const x = a.d20();
      expect(x).toBe(b.d20());
      expect(x).toBeGreaterThanOrEqual(1);
      expect(x).toBeLessThanOrEqual(20);
    }
  });
});

describe("rules", () => {
  it("applies the trait and starting equipment", () => {
    const g = newGame();
    expect(g.state.stats.strength).toBe(7);
    expect(g.state.equipped.weapon).toBe("seax");
    expect(g.state.hp).toBe(20);
  });

  it("evaluates conditions", () => {
    const g = newGame();
    g.state.flags.x = 2;
    expect(conditionHolds(g.state, { flag: "x", equals: 2 })).toBe(true);
    expect(conditionHolds(g.state, { flag: "x" })).toBe(false);
    expect(conditionHolds(g.state, { resource: "grain", gte: 10 })).toBe(true);
    expect(conditionHolds(g.state, { any: [{ flag: "nope" }, { hasItem: "seax" }] })).toBe(true);
  });

  it("checks succeed roughly as often as the odds say", () => {
    const g = newGame();
    const rng = createRng(7);
    let wins = 0;
    for (let i = 0; i < 4000; i++) if (rollCheck(g.state, { stat: "wits", dc: 15 }, rng).success) wins++;
    // Wits 5 against 15 needs a 10 or better: 55%.
    expect(wins / 4000).toBeGreaterThan(0.5);
    expect(wins / 4000).toBeLessThan(0.6);
  });
});

describe("game flow", () => {
  it("starts with the intro and returns to the map", () => {
    const g = newGame();
    expect(g.state.mode.kind).toBe("event");
    g.choose(0);
    expect(g.state.mode.kind).toBe("explore");
    expect(g.state.codex).toContain("conrad");
  });

  it("blocks walls and passes through doors", () => {
    const g = newGame();
    g.choose(0);
    g.state.x = 1;
    g.state.y = 2;
    expect(g.move(-1, 0)).toBe(false);
    g.state.x = 6;
    g.state.y = 6;
    g.move(0, 1);
    expect(g.state.map).toBe("village");
    expect([g.state.x, g.state.y]).toEqual([8, 8]);
  });

  it("ends a season, eats grain and autosaves", () => {
    const g = newGame();
    let saved = 0;
    g.onAutosave = () => saved++;
    g.choose(0);
    g.state.flags.sown = true;
    g.state.flags.sowing = 2;
    g.showEvent("rest");
    g.choose(0);
    g.choose(0); // continue past the result page
    expect(g.state.season).toBe(1);
    expect(g.state.resources.grain).toBe(10 - 4);
    expect(saved).toBe(1);
    // The missed spring tribute is now overdue.
    expect(g.state.flags.missed_tribute_spring_919).toBeUndefined(); // reeve never met
    g.choose(0); // season report -> summer event
    expect(g.state.mode.kind === "event" && g.state.mode.eventId).toBe("summer_919");
  });

  it("punishes an overdue obligation", () => {
    const g = newGame();
    g.choose(0);
    g.showEvent("eilward_first");
    g.choose(0);
    expect(g.state.obligations).toHaveLength(1);
    g.state.flags.sown = true;
    g.showEvent("rest");
    g.choose(0);
    g.choose(0);
    expect(g.state.flags.missed_tribute_spring_919).toBe(true);
    expect(g.state.rep.lord).toBe(-2);
  });

  it("round-trips a save", () => {
    const g = newGame(3);
    g.choose(0);
    g.move(1, 0);
    const copy = deserialize(henry, serialize(g.state));
    expect(copy).toEqual(g.state);
    expect(deserialize(henry, "{}")).toBeNull();
    expect(deserialize(henry, "not json")).toBeNull();
  });

  it("can kill the player in a lethal fight", () => {
    let died = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const g = newGame(seed, "shrewd");
      g.choose(0);
      g.state.hp = 3;
      g.showEvent("outlaw_camp");
      g.choose(0); // fight
      g.choose(0); // continue into combat
      for (let i = 0; i < 60 && g.state.mode.kind === "combat"; i++) g.combat("strike");
      if (g.state.mode.kind === "dead") died++;
    }
    expect(died).toBeGreaterThan(0);
  });

  it("does not kill the player in a brawl", () => {
    for (let seed = 1; seed <= 100; seed++) {
      const g = newGame(seed, "shrewd");
      g.choose(0);
      g.state.hp = 2;
      g.state.flags.pigs_known = true;
      g.showEvent("reginbern_dispute");
      g.choose(3);
      g.choose(0);
      for (let i = 0; i < 60 && g.state.mode.kind === "combat"; i++) g.combat("strike");
      expect(g.state.mode.kind).not.toBe("dead");
    }
  });
});
