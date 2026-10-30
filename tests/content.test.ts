import { describe, expect, it } from "vitest";
import { henry } from "../src/content/henry";
import type { Condition, Content, Effect, Outcome } from "../src/core/types";

// Static checks on the content pack: every reference must resolve.

function outcomesOf(content: Content): Outcome[] {
  const out: Outcome[] = [];
  for (const ev of Object.values(content.events)) {
    for (const c of ev.choices ?? []) {
      for (const o of [c.result, c.success, c.failure]) if (o) out.push(o);
    }
  }
  return out;
}

function effectsOf(content: Content): Effect[] {
  const effs: Effect[] = [];
  for (const ev of Object.values(content.events)) effs.push(...(ev.onShow ?? []));
  for (const o of outcomesOf(content)) effs.push(...(o.effects ?? []));
  for (const bg of content.backgrounds) for (const t of bg.traits) effs.push(...t.effects);
  return effs;
}

function conditionsOf(content: Content): Condition[] {
  const conds: Condition[] = [];
  for (const ev of Object.values(content.events)) for (const c of ev.choices ?? []) conds.push(...(c.if ?? []));
  for (const n of content.npcs) {
    conds.push(...(n.showIf ?? []));
    for (const t of n.talk) conds.push(...(t.if ?? []));
  }
  for (const t of content.triggers) conds.push(...(t.if ?? []));
  return conds;
}

describe("henry content pack", () => {
  const c = henry;

  it("has rectangular maps using only known tiles", () => {
    for (const m of Object.values(c.maps)) {
      const w = m.rows[0].length;
      m.rows.forEach((r, i) => {
        expect(r.length, `${m.id} row ${i}`).toBe(w);
        for (const ch of r) expect(c.tiles[ch], `${m.id} tile '${ch}'`).toBeDefined();
      });
      expect(c.tiles[m.outside]).toBeDefined();
    }
  });

  it("places people, triggers and exits sensibly", () => {
    const walk = (map: string, x: number, y: number) => c.tiles[c.maps[map].rows[y][x]].walkable;
    for (const n of c.npcs) {
      expect(c.maps[n.map], n.id).toBeDefined();
      expect(walk(n.map, n.x, n.y), `${n.id} stands on walkable ground`).toBe(true);
      for (const t of n.talk) expect(c.events[t.event], `${n.id} -> ${t.event}`).toBeDefined();
    }
    for (const t of c.triggers) {
      expect(walk(t.map, t.x, t.y), `trigger ${t.id}`).toBe(true);
      expect(c.events[t.event], `trigger ${t.id}`).toBeDefined();
    }
    for (const m of Object.values(c.maps)) {
      for (const e of m.exits) {
        expect(c.maps[e.to], `exit to ${e.to}`).toBeDefined();
        expect(walk(e.to, e.tx, e.ty), `exit lands on walkable ground in ${e.to}`).toBe(true);
        if (e.blockedEvent) expect(c.events[e.blockedEvent]).toBeDefined();
      }
    }
    for (const bg of c.backgrounds) {
      expect(walk(bg.start.map, bg.start.x, bg.start.y)).toBe(true);
      expect(c.events[bg.startEvent]).toBeDefined();
    }
  });

  it("resolves every event, item, enemy and codex reference", () => {
    for (const o of outcomesOf(c)) {
      if (o.next) expect(c.events[o.next], `next ${o.next}`).toBeDefined();
      if (o.combat) {
        expect(c.enemies[o.combat.enemy], o.combat.enemy).toBeDefined();
        for (const id of [o.combat.onWin, o.combat.onLose, o.combat.onFlee, o.combat.parley?.event]) {
          if (id) expect(c.events[id], id).toBeDefined();
        }
      }
    }
    for (const e of effectsOf(c)) {
      if (e.type === "item" || e.type === "equip") expect(c.items[e.id], e.id).toBeDefined();
      if (e.type === "codex") expect(c.codex[e.id], e.id).toBeDefined();
      if (e.type === "teleport") expect(c.maps[e.map], e.map).toBeDefined();
    }
    for (const cond of conditionsOf(c)) {
      if (cond.hasItem) expect(c.items[cond.hasItem], cond.hasItem).toBeDefined();
    }
    for (const id of Object.values(c.seasonEvents)) expect(c.events[id], id).toBeDefined();
  });

  it("gives every checked choice both outcomes", () => {
    for (const ev of Object.values(c.events)) {
      for (const ch of ev.choices ?? []) {
        if (ch.check) {
          expect(ch.success, `${ev.id}: ${ch.text}`).toBeDefined();
          expect(ch.failure, `${ev.id}: ${ch.text}`).toBeDefined();
        } else {
          expect(ch.success ?? ch.failure, `${ev.id}: ${ch.text}`).toBeUndefined();
        }
      }
    }
  });
});
