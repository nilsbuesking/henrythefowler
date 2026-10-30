import type { Choice, Content, GameEvent, GameState, MapDef, NpcDef, Outcome } from "./types";
import { createRng, type Rng } from "./rng";
import { allHold, applyEffects, checkOdds, describeCheck, equip, fillText, maxHp, rollCheck, STAT_NAMES } from "./rules";
import { resolveRound, startCombat, type CombatAction } from "./combat";

export interface ChoiceView {
  index: number;
  text: string;
  /** e.g. "Wits 15, about 55%". */
  hint?: string;
}

export interface NewGameOptions {
  name: string;
  background: string;
  trait: string;
  seed: number;
}

const LOG_LIMIT = 200;

/**
 * The game state machine. It knows nothing about rendering: the UI calls
 * move(), choose() and combat() and redraws from `state` after each call.
 */
export class Game {
  readonly content: Content;
  state: GameState;
  private rng: Rng;
  /** Called after each season ends, for autosaving. */
  onAutosave?: (state: GameState) => void;

  constructor(content: Content, state: GameState) {
    this.content = content;
    this.state = state;
    this.rng = createRng(0);
    this.rng.state = state.rng;
  }

  static newState(content: Content, opts: NewGameOptions): GameState {
    const bg = content.backgrounds.find((b) => b.id === opts.background);
    if (!bg) throw new Error(`Unknown background: ${opts.background}`);
    const state: GameState = {
      version: 1,
      rng: opts.seed >>> 0,
      name: opts.name.trim() || "Thiadric",
      background: bg.id,
      trait: opts.trait,
      stats: { ...bg.stats },
      hp: 0,
      resources: { ...bg.resources },
      rep: { ...bg.rep },
      inventory: { ...bg.items },
      equipped: {},
      flags: {},
      year: bg.start.year,
      season: bg.start.season,
      map: bg.start.map,
      x: bg.start.x,
      y: bg.start.y,
      npcPos: {},
      obligations: [],
      codex: [],
      log: [],
      mode: { kind: "event", eventId: bg.startEvent },
    };
    const trait = bg.traits.find((t) => t.id === opts.trait);
    if (trait) applyEffects(state, content, trait.effects);
    for (const id of bg.equip) equip(state, content, id);
    state.hp = maxHp(state);
    for (const npc of content.npcs) state.npcPos[npc.id] = { x: npc.x, y: npc.y };
    state.log.push(`— ${content.seasonNames[state.season]} of the year ${state.year} —`);
    const first = content.events[bg.startEvent];
    if (first?.onShow) state.log.push(...applyEffects(state, content, first.onShow));
    return state;
  }

  // ---------- helpers ----------

  get map(): MapDef {
    const m = this.content.maps[this.state.map];
    if (!m) throw new Error(`Unknown map: ${this.state.map}`);
    return m;
  }

  log(...lines: string[]): void {
    for (const l of lines) if (l) this.state.log.push(l);
    if (this.state.log.length > LOG_LIMIT) this.state.log.splice(0, this.state.log.length - LOG_LIMIT);
  }

  private sync(): void {
    this.state.rng = this.rng.state;
  }

  tileAt(map: MapDef, x: number, y: number): string {
    if (y < 0 || y >= map.rows.length || x < 0 || x >= map.rows[y].length) return map.outside;
    return map.rows[y][x];
  }

  isWalkable(map: MapDef, x: number, y: number): boolean {
    const t = this.content.tiles[this.tileAt(map, x, y)];
    return !!t && t.walkable;
  }

  visibleNpcs(mapId = this.state.map): NpcDef[] {
    return this.content.npcs.filter((n) => n.map === mapId && allHold(this.state, n.showIf));
  }

  npcAt(x: number, y: number): NpcDef | undefined {
    return this.visibleNpcs().find((n) => {
      const p = this.state.npcPos[n.id] ?? n;
      return p.x === x && p.y === y;
    });
  }

  currentEvent(): GameEvent | undefined {
    const m = this.state.mode;
    return m.kind === "event" ? this.content.events[m.eventId] : undefined;
  }

  text(s: string): string {
    return fillText(this.state, this.content, s);
  }

  // ---------- exploration ----------

  /** Moves one tile. Bumping into a person talks to them. Returns true if anything happened. */
  move(dx: number, dy: number): boolean {
    if (this.state.mode.kind !== "explore") return false;
    const map = this.map;
    const nx = this.state.x + dx;
    const ny = this.state.y + dy;

    const npc = this.npcAt(nx, ny);
    if (npc) {
      const talk = npc.talk.find((t) => allHold(this.state, t.if));
      if (talk) this.showEvent(talk.event);
      this.sync();
      return true;
    }

    const exit = map.exits.find((e) => e.x === nx && e.y === ny);
    if (exit) {
      if (allHold(this.state, exit.if)) {
        this.state.map = exit.to;
        this.state.x = exit.tx;
        this.state.y = exit.ty;
        this.log(`You enter ${this.map.name}.`);
      } else if (exit.blockedEvent) {
        this.showEvent(exit.blockedEvent);
      }
      this.sync();
      return true;
    }

    if (!this.isWalkable(map, nx, ny)) return false;
    this.state.x = nx;
    this.state.y = ny;
    this.wanderNpcs();
    this.checkTriggers();
    this.sync();
    return true;
  }

  private wanderNpcs(): void {
    const map = this.map;
    for (const npc of this.visibleNpcs()) {
      if (!npc.wander) continue;
      if (this.rng.next() > 0.35) continue;
      const pos = this.state.npcPos[npc.id] ?? { x: npc.x, y: npc.y };
      const dirs = [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ];
      const [dx, dy] = dirs[this.rng.int(0, 3)];
      const nx = pos.x + dx;
      const ny = pos.y + dy;
      if (Math.abs(nx - npc.x) > npc.wander || Math.abs(ny - npc.y) > npc.wander) continue;
      if (!this.isWalkable(map, nx, ny)) continue;
      if (map.exits.some((e) => e.x === nx && e.y === ny)) continue;
      if (this.content.triggers.some((t) => t.map === map.id && t.x === nx && t.y === ny)) continue;
      if (nx === this.state.x && ny === this.state.y) continue;
      if (this.npcAt(nx, ny)) continue;
      this.state.npcPos[npc.id] = { x: nx, y: ny };
    }
  }

  private checkTriggers(): void {
    for (const t of this.content.triggers) {
      if (t.map !== this.state.map || t.x !== this.state.x || t.y !== this.state.y) continue;
      if (t.once && this.state.flags[`trigger_${t.id}`]) continue;
      if (!allHold(this.state, t.if)) continue;
      if (t.once) this.state.flags[`trigger_${t.id}`] = true;
      this.showEvent(t.event);
      return;
    }
  }

  // ---------- events ----------

  showEvent(id: string): void {
    const ev = this.content.events[id];
    if (!ev) throw new Error(`Unknown event: ${id}`);
    this.state.mode = { kind: "event", eventId: id };
    if (ev.onShow) this.log(...applyEffects(this.state, this.content, ev.onShow));
  }

  private offered(ev: GameEvent): Choice[] {
    return (ev.choices ?? []).filter((c) => allHold(this.state, c.if));
  }

  choices(): ChoiceView[] {
    const m = this.state.mode;
    if (m.kind === "result") return [{ index: 0, text: "Continue" }];
    if (m.kind !== "event") return [];
    const ev = this.content.events[m.eventId];
    const offered = this.offered(ev);
    if (offered.length === 0) return [{ index: 0, text: "Continue" }];
    return offered.map((c, index) => ({
      index,
      text: this.text(c.text),
      hint: c.check
        ? `${STAT_NAMES[c.check.stat]} ${c.check.dc}, about ${Math.round(checkOdds(this.state, c.check) * 100)}%`
        : undefined,
    }));
  }

  /** Picks a choice in an event, or continues past a result page. */
  choose(index: number): void {
    const m = this.state.mode;
    if (m.kind === "result") {
      this.continueResult();
    } else if (m.kind === "event") {
      const ev = this.content.events[m.eventId];
      const offered = this.offered(ev);
      if (offered.length === 0) {
        this.state.mode = { kind: "explore" };
      } else {
        const choice = offered[index];
        if (!choice) return;
        this.resolveChoice(ev, choice);
      }
    }
    this.sync();
  }

  private resolveChoice(ev: GameEvent, choice: Choice): void {
    let outcome: Outcome | undefined;
    const pre: string[] = [];
    if (choice.check) {
      const r = rollCheck(this.state, choice.check, this.rng);
      pre.push(describeCheck(r));
      outcome = r.success ? choice.success : choice.failure;
    } else {
      outcome = choice.result;
    }
    if (!outcome) {
      this.state.mode = { kind: "explore" };
      return;
    }
    this.applyOutcome(ev.title, outcome, pre);
  }

  private applyOutcome(title: string, outcome: Outcome, pre: string[] = []): void {
    const changes = applyEffects(this.state, this.content, outcome.effects);
    const text = this.text(outcome.text);
    this.log(...pre, text, ...changes);
    const lines = [...pre.map((p) => `[${p}]`), text];
    if (changes.length) lines.push(changes.join(" "));
    this.state.mode = {
      kind: "result",
      title,
      text: lines.join("\n\n"),
      next: outcome.next,
      combat: outcome.combat,
      endSeason: outcome.endSeason,
      death: outcome.death || this.state.hp <= 0,
    };
  }

  private continueResult(): void {
    const m = this.state.mode;
    if (m.kind !== "result") return;
    if (m.death) {
      this.die(m.text.split("\n\n").pop() ?? "You are dead.");
    } else if (m.combat) {
      this.state.mode = { kind: "combat", combat: startCombat(this.content, m.combat) };
    } else if (m.endSeason) {
      this.endSeason(m.next);
    } else if (m.next) {
      this.showEvent(m.next);
    } else {
      this.state.mode = { kind: "explore" };
    }
  }

  private die(text: string): void {
    this.state.mode = { kind: "dead", text: this.text(text) };
    this.log("Here ends the saga of {name}.".replace("{name}", this.state.name));
  }

  // ---------- combat ----------

  combat(action: CombatAction): void {
    const m = this.state.mode;
    if (m.kind !== "combat") return;
    const c = m.combat;
    if (c.over) {
      this.finishCombat();
    } else {
      resolveRound(this.state, this.content, c, action, this.rng);
    }
    this.sync();
  }

  private finishCombat(): void {
    const m = this.state.mode;
    if (m.kind !== "combat" || !m.combat.over) return;
    const { spec, over } = m.combat;
    this.log(over.text);
    const next =
      over.result === "win"
        ? spec.onWin
        : over.result === "lose"
          ? spec.onLose
          : over.result === "flee"
            ? spec.onFlee
            : over.result === "parley"
              ? spec.parley?.event
              : undefined;
    if (over.result === "death") this.die(over.text);
    else if (next) this.showEvent(next);
    else this.state.mode = { kind: "explore" };
  }

  // ---------- seasons ----------

  private endSeason(nextEvent?: string): void {
    const s = this.state;
    const rules = this.content.seasonRules;
    const report: string[] = [];
    const seasonName = this.content.seasonNames[s.season];

    const eaten = rules.grainBase + rules.grainPerRetainer * s.resources.retainers;
    if (s.resources.grain >= eaten) {
      s.resources.grain -= eaten;
      report.push(`Your household eats ${eaten} measures of grain over the ${seasonName.toLowerCase()}.`);
    } else {
      const short = eaten - s.resources.grain;
      s.resources.grain = 0;
      s.hp = Math.max(1, s.hp - short * 2);
      s.rep.village = Math.max(-10, s.rep.village - 1);
      report.push(`There is not enough grain. The household goes hungry, short by ${short} measures.`);
    }

    if (s.season === rules.harvestSeason) {
      const quality = typeof s.flags.sowing === "number" ? s.flags.sowing : 1;
      const harvest = 4 + quality * 4 + this.rng.int(0, 3);
      s.resources.grain += harvest;
      report.push(`The harvest brings in ${harvest} measures of grain.`);
    }

    s.season = (s.season + 1) % 4;
    if (s.season === 0) s.year++;

    const overdue = s.obligations.filter((o) => o.year < s.year || (o.year === s.year && o.season < s.season));
    for (const o of overdue) {
      s.rep.lord = Math.max(-10, s.rep.lord - 2);
      s.flags[`missed_${o.id}`] = true;
      report.push(`You failed in your obligation: ${o.text} Your lord will remember it.`);
    }
    s.obligations = s.obligations.filter((o) => !overdue.includes(o));

    const healed = Math.min(maxHp(s) - s.hp, 2 + Math.floor(s.stats.endurance / 2));
    if (healed > 0) {
      s.hp += healed;
      report.push("Rest mends some of your hurts.");
    }

    const newSeason = `${this.content.seasonNames[s.season]} of the year ${s.year}`;
    this.log(`— ${newSeason} —`, ...report);
    const seasonal = this.content.seasonEvents[`${s.year}-${s.season}`];
    this.state.mode = {
      kind: "result",
      title: newSeason,
      text: report.join("\n\n"),
      next: seasonal ?? nextEvent,
    };
    this.onAutosave?.(this.state);
  }
}
