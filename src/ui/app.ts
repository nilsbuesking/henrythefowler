import { Game } from "../core/game";
import { availableActions, getEnemy, playerAttack, playerArmour, playerDefence, type CombatAction } from "../core/combat";
import { checkOdds, maxHp, REP_LABEL, STAT_NAMES } from "../core/rules";
import { deserialize, serialize } from "../core/save";
import { REP_KEYS, RESOURCE_KEYS, STAT_KEYS, type Content, type GameState } from "../core/types";
import { MapRenderer } from "./renderer";

const TEXT_SCALES = [1, 1.15, 1.3, 1.45, 1.6, 1.8];
const TEXT_KEY = "henry.textScale";
const DEFAULT_TEXT_STEP = 1;

function loadTextStep(): number {
  try {
    const n = Number(localStorage.getItem(TEXT_KEY));
    return Number.isInteger(n) && n >= 0 && n < TEXT_SCALES.length && localStorage.getItem(TEXT_KEY) !== null
      ? n
      : DEFAULT_TEXT_STEP;
  } catch {
    return DEFAULT_TEXT_STEP;
  }
}

const SAVE_KEYS = { manual: "henry.save.manual", auto: "henry.save.auto" } as const;
type Slot = keyof typeof SAVE_KEYS;

interface SaveRecord {
  time: number;
  state: GameState;
}

const RESOURCE_LABEL: Record<string, string> = {
  grain: "Grain (measures)",
  livestock: "Livestock (head)",
  silver: "Silver (pennies)",
  retainers: "Men in your service",
};

const ACTION_LABEL: Record<CombatAction, string> = {
  strike: "Strike",
  guard: "Guard",
  withdraw: "Withdraw",
  parley: "Parley",
};

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]!);
}

/** Escapes text, turns *word* into italics and blank lines into paragraphs. */
function prose(s: string): string {
  return s
    .split(/\n\n+/)
    .map((p) => `<p>${esc(p).replace(/\*([^*]+)\*/g, "<em>$1</em>").replace(/\n/g, "<br>")}</p>`)
    .join("");
}

function readSave(content: Content, slot: Slot): SaveRecord | null {
  try {
    const raw = localStorage.getItem(SAVE_KEYS[slot]);
    if (!raw) return null;
    const rec = JSON.parse(raw) as { time: number; state: unknown };
    const state = deserialize(content, JSON.stringify(rec.state));
    return state ? { time: rec.time, state } : null;
  } catch {
    return null;
  }
}

function writeSave(slot: Slot, state: GameState): boolean {
  try {
    localStorage.setItem(SAVE_KEYS[slot], JSON.stringify({ time: Date.now(), state: JSON.parse(serialize(state)) }));
    return true;
  } catch {
    return false;
  }
}

function latestSave(content: Content): SaveRecord | null {
  const saves = [readSave(content, "manual"), readSave(content, "auto")].filter((s): s is SaveRecord => !!s);
  saves.sort((a, b) => b.time - a.time);
  return saves[0] ?? null;
}

type Modal = "title" | "create" | "codex" | "help" | null;

export class App {
  private content: Content;
  private game: Game | null = null;
  private renderer: MapRenderer;
  private frame = 0;
  private modal: Modal = "title";
  private lastMove = 0;
  private createName = "Thiadric";
  private createTrait = "";
  private textStep = loadTextStep();

  private el: {
    overlay: HTMLElement;
    panel: HTMLElement;
    log: HTMLElement;
    toast: HTMLElement;
  };

  constructor(content: Content, root: HTMLElement) {
    this.content = content;
    this.createTrait = content.backgrounds[0].traits[0].id;
    root.innerHTML = `
      <header class="masthead">
        <h1>Henry the Fowler</h1>
        <span class="sub">A saga of the Saxons, 919–936</span>
      </header>
      <main class="layout">
        <section class="viewport">
          <canvas class="map" aria-label="Map"></canvas>
          <div class="overlay"></div>
          <div class="dpad" aria-hidden="true">
            <button data-dir="0,-1">▲</button>
            <button data-dir="-1,0">◀</button>
            <button data-dir="1,0">▶</button>
            <button data-dir="0,1">▼</button>
          </div>
        </section>
        <aside class="panel"></aside>
        <section class="log" aria-live="polite"></section>
      </main>
      <div class="toast"></div>`;
    this.renderer = new MapRenderer(root.querySelector("canvas")!);
    this.el = {
      overlay: root.querySelector(".overlay")!,
      panel: root.querySelector(".panel")!,
      log: root.querySelector(".log")!,
      toast: root.querySelector(".toast")!,
    };

    this.applyTextSize();
    window.addEventListener("keydown", (e) => this.onKey(e));
    // Save when the page is closed, reloaded or hidden (switching tabs or apps
    // on a phone), so nothing since the last save is lost.
    window.addEventListener("pagehide", () => this.saveOnLeave());
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") this.saveOnLeave();
    });
    this.renderer.canvas.addEventListener("click", (e) => {
      const d = this.renderer.directionFromClick(e);
      if (d) this.step(d[0], d[1]);
    });
    root.querySelectorAll<HTMLButtonElement>(".dpad button").forEach((b) =>
      b.addEventListener("click", () => {
        const [dx, dy] = b.dataset.dir!.split(",").map(Number);
        this.step(dx, dy);
      }),
    );
    this.el.overlay.addEventListener("click", (e) => this.onOverlayClick(e));
    this.el.overlay.addEventListener("input", (e) => {
      const t = e.target as HTMLInputElement;
      if (t.name === "hero-name") this.createName = t.value;
    });
    this.el.panel.addEventListener("click", (e) => this.onPanelClick(e));

    setInterval(() => {
      this.frame++;
      this.drawMap();
    }, 450);
    this.render();
  }

  // ---------- flow ----------

  private startGame(state: GameState): void {
    this.game = new Game(this.content, state);
    this.game.onAutosave = (s) => writeSave("auto", s);
    this.modal = null;
    this.render();
  }

  private newGame(): void {
    const seed = (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
    const state = Game.newState(this.content, {
      name: this.createName,
      background: this.content.backgrounds[0].id,
      trait: this.createTrait,
      seed,
    });
    this.startGame(state);
    writeSave("auto", state);
  }

  private load(): void {
    const rec = latestSave(this.content);
    if (rec) {
      this.startGame(rec.state);
      this.toast("Saga loaded.");
    } else this.toast("No saved saga found.");
  }

  private save(): void {
    if (!this.game) return;
    this.toast(writeSave("manual", this.game.state) ? "Saga saved." : "Could not save in this browser.");
  }

  /** Quietly writes the autosave slot. A dead hero is not saved, so Load returns to before the death. */
  private saveOnLeave(): void {
    if (!this.game || this.game.state.mode.kind === "dead") return;
    writeSave("auto", this.game.state);
  }

  private toast(msg: string): void {
    this.el.toast.textContent = msg;
    this.el.toast.classList.add("show");
    window.setTimeout(() => this.el.toast.classList.remove("show"), 1800);
  }

  /** Changes text size by one step (-1 smaller, +1 larger) and remembers it in this browser. */
  private changeTextSize(delta: number): void {
    const next = Math.max(0, Math.min(TEXT_SCALES.length - 1, this.textStep + delta));
    if (next === this.textStep) return;
    this.textStep = next;
    this.applyTextSize();
    try {
      localStorage.setItem(TEXT_KEY, String(next));
    } catch {
      /* storage unavailable: the size still applies for this visit */
    }
    this.renderPanel();
    this.toast(`Text size ${next + 1} of ${TEXT_SCALES.length}`);
  }

  private applyTextSize(): void {
    document.documentElement.style.setProperty("--text-scale", String(TEXT_SCALES[this.textStep]));
  }

  private step(dx: number, dy: number): void {
    if (!this.game || this.modal || this.game.state.mode.kind !== "explore") return;
    const now = performance.now();
    if (now - this.lastMove < 90) return;
    this.lastMove = now;
    if (this.game.move(dx, dy)) this.render();
  }

  // ---------- input ----------

  private onKey(e: KeyboardEvent): void {
    if ((e.target as HTMLElement).tagName === "INPUT") {
      if (e.key === "Enter") this.newGame();
      return;
    }
    // Text size keys: only the main keyboard's + and −, never the number pad,
    // whose + and − sit right beside the arrow keys and are easy to hit by accident.
    if (!e.code.startsWith("Numpad") && !e.ctrlKey && !e.metaKey) {
      if (e.key === "+") {
        this.changeTextSize(1);
        e.preventDefault();
        return;
      }
      if (e.key === "-") {
        this.changeTextSize(-1);
        e.preventDefault();
        return;
      }
    }
    const k = e.key;
    if (this.modal === "codex" || this.modal === "help") {
      if (k === "Escape" || k === "Enter" || k === " " || k === "c" || k === "h" || k === "?") {
        this.modal = null;
        this.render();
        e.preventDefault();
      }
      return;
    }
    if (this.modal === "title") {
      if (k === "1") this.openModal("create");
      else if (k === "2") this.load();
      else return;
      e.preventDefault();
      return;
    }
    if (!this.game || this.modal) return;
    const m = this.game.state.mode;
    if (m.kind === "dead") {
      if (k === "1") this.load();
      else if (k === "2") {
        this.game = null;
        this.openModal("title");
      }
      return;
    }
    const dirs: Record<string, [number, number]> = {
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      w: [0, -1],
      s: [0, 1],
      a: [-1, 0],
      d: [1, 0],
    };
    if (m.kind === "explore") {
      const numpad: Record<string, [number, number]> = {
        Numpad8: [0, -1],
        Numpad2: [0, 1],
        Numpad4: [-1, 0],
        Numpad6: [1, 0],
      };
      const d = dirs[k] ?? numpad[e.code];
      if (d) {
        e.preventDefault();
        this.step(d[0], d[1]);
      } else if (k === "c") this.openModal("codex");
      else if (k === "h" || k === "?") this.openModal("help");
      return;
    }
    const n = Number(k);
    if (m.kind === "event" || m.kind === "result") {
      const choices = this.game.choices();
      if (n >= 1 && n <= choices.length) this.pick(choices[n - 1].index);
      else if ((k === "Enter" || k === " ") && choices.length === 1) this.pick(choices[0].index);
      else return;
      e.preventDefault();
    } else if (m.kind === "combat") {
      if (m.combat.over) {
        if (k === "Enter" || k === " " || k === "1") this.fight("strike");
      } else {
        const acts = availableActions(m.combat);
        if (n >= 1 && n <= acts.length) this.fight(acts[n - 1]);
      }
      e.preventDefault();
    }
  }

  private onOverlayClick(e: MouseEvent): void {
    const t = (e.target as HTMLElement).closest<HTMLElement>("[data-act]");
    if (!t) return;
    const act = t.dataset.act!;
    switch (act) {
      case "choose":
        this.pick(Number(t.dataset.index));
        break;
      case "fight":
        this.fight(t.dataset.action as CombatAction);
        break;
      case "new":
        this.modal = "create";
        this.render();
        break;
      case "trait":
        this.createTrait = t.dataset.id!;
        this.render();
        break;
      case "begin":
        this.newGame();
        break;
      case "load":
        this.load();
        break;
      case "title":
        this.game = null;
        this.modal = "title";
        this.render();
        break;
      case "close":
        this.modal = null;
        this.render();
        break;
    }
  }

  private onPanelClick(e: MouseEvent): void {
    const t = (e.target as HTMLElement).closest<HTMLElement>("[data-act]");
    if (!t) return;
    const act = t.dataset.act!;
    if (act === "text-") this.changeTextSize(-1);
    else if (act === "text+") this.changeTextSize(1);
    else if (act === "save") this.save();
    else if (act === "load") this.load();
    else if (act === "codex") this.openModal("codex");
    else if (act === "help") this.openModal("help");
    else if (act === "equip" && this.game) {
      const id = t.dataset.id!;
      this.game.state.equipped = { ...this.game.state.equipped };
      const item = this.content.items[id];
      if (item.kind === "weapon") this.game.state.equipped.weapon = id;
      if (item.kind === "shield") this.game.state.equipped.shield = id;
      if (item.kind === "armour") this.game.state.equipped.armour = id;
      this.render();
    }
  }

  private openModal(m: Modal): void {
    this.modal = m;
    this.render();
  }

  private pick(index: number): void {
    if (!this.game) return;
    this.game.choose(index);
    this.render();
  }

  private fight(action: CombatAction): void {
    if (!this.game) return;
    this.game.combat(action);
    this.render();
  }

  // ---------- rendering ----------

  private render(): void {
    this.drawMap();
    this.renderPanel();
    this.renderLog();
    this.renderOverlay();
  }

  private drawMap(): void {
    if (this.game) this.renderer.draw(this.game, this.frame);
  }

  private renderPanel(): void {
    const g = this.game;
    if (!g) {
      this.el.panel.innerHTML = `<div class="panel-empty muted">No saga begun.</div>${this.textSizeHtml()}`;
      return;
    }
    const s = g.state;
    const hpMax = maxHp(s);
    const pct = Math.round((s.hp / hpMax) * 100);
    const inv = Object.entries(s.inventory)
      .map(([id, n]) => {
        const it = this.content.items[id];
        if (!it) return "";
        const equipped = Object.values(s.equipped).includes(id);
        const canEquip = !equipped && (it.kind === "weapon" || it.kind === "shield" || it.kind === "armour");
        return `<li title="${esc(it.description)}">${esc(it.name)}${n > 1 ? ` ×${n}` : ""}${
          equipped ? ` <span class="tag">worn</span>` : ""
        }${canEquip ? ` <button class="link" data-act="equip" data-id="${id}">use</button>` : ""}</li>`;
      })
      .join("");
    const atk = playerAttack(s, this.content);
    const obligations = s.obligations.length
      ? s.obligations
          .map((o) => `<li>${esc(o.text)} <span class="due">by end of ${this.content.seasonNames[o.season]} ${o.year}</span></li>`)
          .join("")
      : `<li class="muted">None at present.</li>`;
    this.el.panel.innerHTML = `
      <div class="who">
        <div class="name">${esc(s.name)}</div>
        <div class="muted">${esc(this.content.backgrounds.find((b) => b.id === s.background)?.name ?? "")} · ${esc(
          this.content.backgrounds[0].traits.find((t) => t.id === s.trait)?.name ?? "",
        )}</div>
        <div class="when">${this.content.seasonNames[s.season]}, ${s.year}</div>
      </div>
      <div class="hp" title="Health">
        <div class="hp-bar"><span style="width:${pct}%"></span></div>
        <div class="hp-num">Health ${s.hp} / ${hpMax}</div>
      </div>
      <h3>Qualities</h3>
      <dl class="grid">${STAT_KEYS.map((k) => `<dt>${STAT_NAMES[k]}</dt><dd>${s.stats[k]}</dd>`).join("")}</dl>
      <h3>Household</h3>
      <dl class="grid wide">${RESOURCE_KEYS.map((k) => `<dt>${RESOURCE_LABEL[k]}</dt><dd>${s.resources[k]}</dd>`).join("")}</dl>
      <h3>Regard</h3>
      <dl class="grid wide">${REP_KEYS.map((k) => `<dt>${cap(REP_LABEL[k])}</dt><dd>${signed(s.rep[k])}</dd>`).join("")}</dl>
      <h3>Obligations</h3>
      <ul class="list">${obligations}</ul>
      <h3>Gear</h3>
      <ul class="list">${inv}</ul>
      <div class="muted small">Attack +${atk.bonus}, damage ${atk.damage[0]}–${atk.damage[1]} · Defence ${playerDefence(
        s,
        this.content,
      )} · Armour ${playerArmour(s, this.content)}</div>
      <div class="buttons">
        <button data-act="save">Save</button>
        <button data-act="load">Load</button>
        <button data-act="codex">Codex</button>
        <button data-act="help">Help</button>
      </div>
      ${this.textSizeHtml()}`;
  }

  private textSizeHtml(): string {
    return `<div class="textsize">
      <span>Text size</span>
      <button data-act="text-" aria-label="Smaller text" ${this.textStep === 0 ? "disabled" : ""}>A−</button>
      <button data-act="text+" aria-label="Larger text" ${
        this.textStep === TEXT_SCALES.length - 1 ? "disabled" : ""
      }>A+</button>
    </div>`;
  }

  private renderLog(): void {
    const g = this.game;
    if (!g) {
      this.el.log.innerHTML = "";
      return;
    }
    this.el.log.innerHTML = g.state.log
      .slice(-60)
      .map((l) => `<div class="${l.startsWith("—") ? "season" : ""}">${esc(l).replace(/\*([^*]+)\*/g, "<em>$1</em>")}</div>`)
      .join("");
    this.el.log.scrollTop = this.el.log.scrollHeight;
  }

  private renderOverlay(): void {
    const o = this.el.overlay;
    const html = this.overlayHtml();
    o.innerHTML = html;
    o.classList.toggle("open", !!html);
    o.classList.toggle("full", this.modal === "title" || this.modal === "create" || this.game?.state.mode.kind === "dead");
    const input = o.querySelector<HTMLInputElement>("input[name=hero-name]");
    if (input && document.activeElement !== input) {
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    }
  }

  private overlayHtml(): string {
    if (this.modal === "title") return this.titleHtml();
    if (this.modal === "create") return this.createHtml();
    if (this.modal === "codex") return this.codexHtml();
    if (this.modal === "help") return this.helpHtml();
    const g = this.game;
    if (!g) return "";
    const m = g.state.mode;
    if (m.kind === "event") {
      const ev = g.currentEvent()!;
      return this.dialogue(ev.title, g.text(ev.text));
    }
    if (m.kind === "result") return this.dialogue(m.title, m.text);
    if (m.kind === "combat") return this.combatHtml();
    if (m.kind === "dead") {
      return `<div class="box death">
        <h2>Here ends the saga of ${esc(g.state.name)}</h2>
        ${prose(m.text)}
        <p class="muted">${this.content.seasonNames[g.state.season]} of the year ${g.state.year}.</p>
        <div class="choices">
          <button class="choice" data-act="load"><span class="key">1</span>Return to your last save</button>
          <button class="choice" data-act="title"><span class="key">2</span>Begin a new saga</button>
        </div>
      </div>`;
    }
    return "";
  }

  private dialogue(title: string, text: string): string {
    const choices = this.game!.choices();
    return `<div class="box dialogue">
      <h2>${esc(title)}</h2>
      <div class="prose">${prose(text)}</div>
      <div class="choices">${choices
        .map(
          (c, i) => `<button class="choice" data-act="choose" data-index="${c.index}">
            <span class="key">${choices.length === 1 ? "↵" : i + 1}</span>
            <span class="label">${esc(c.text).replace(/\*([^*]+)\*/g, "<em>$1</em>")}</span>
            ${c.hint ? `<span class="hint">${esc(c.hint)}</span>` : ""}
          </button>`,
        )
        .join("")}</div>
    </div>`;
  }

  private combatHtml(): string {
    const g = this.game!;
    const m = g.state.mode;
    if (m.kind !== "combat") return "";
    const c = m.combat;
    const enemy = getEnemy(this.content, c.spec.enemy);
    const bar = (cur: number, max: number) =>
      `<div class="hp-bar"><span style="width:${Math.round((cur / max) * 100)}%"></span></div>`;
    const lines = c.lines.slice(-6).map((l) => `<div>${esc(l)}</div>`).join("");
    let actions: string;
    if (c.over) {
      actions = `<p class="verdict">${esc(c.over.text)}</p>
        <button class="choice" data-act="fight" data-action="strike"><span class="key">↵</span>Continue</button>`;
    } else {
      actions = availableActions(c)
        .map((a, i) => {
          let hint = "";
          if (a === "guard") hint = "harder to hit; your next blow lands easier";
          if (a === "strike") hint = "attack";
          if (a === "withdraw") hint = `Wits 12, about ${Math.round(checkOdds(g.state, { stat: "wits", dc: 12 }) * 100)}%`;
          if (a === "parley" && c.spec.parley)
            hint = `${STAT_NAMES[c.spec.parley.stat]} ${c.spec.parley.dc}, about ${Math.round(
              checkOdds(g.state, c.spec.parley) * 100,
            )}%`;
          return `<button class="choice" data-act="fight" data-action="${a}">
            <span class="key">${i + 1}</span><span class="label">${ACTION_LABEL[a]}</span><span class="hint">${hint}</span>
          </button>`;
        })
        .join("");
    }
    return `<div class="box combat">
      <h2>Fight · round ${c.round}</h2>
      <div class="sides">
        <div><div class="name">${esc(g.state.name)}</div>${bar(g.state.hp, maxHp(g.state))}<div class="small">${g.state.hp} / ${maxHp(
          g.state,
        )}</div></div>
        <div class="vs">against</div>
        <div><div class="name">${esc(enemy.name)}</div>${bar(c.enemyHp, enemy.hp)}<div class="small">${
          c.enemyHp > enemy.hp * 0.66 ? "unhurt" : c.enemyHp > enemy.hp * 0.33 ? "bloodied" : "badly hurt"
        }</div></div>
      </div>
      <div class="combat-log">${lines}</div>
      <div class="choices">${actions}</div>
    </div>`;
  }

  private titleHtml(): string {
    const save = latestSave(this.content);
    return `<div class="box title-card">
      <div class="rune">ᚺ</div>
      <h2>Henry the Fowler</h2>
      <p class="tagline">In the year 919 the Saxons raised their own duke to be king. This is not his saga. It is yours: a free man with a hall, a field and too many obligations.</p>
      <div class="choices">
        <button class="choice" data-act="new"><span class="key">1</span>Begin a new saga</button>
        ${
          save
            ? `<button class="choice" data-act="load"><span class="key">2</span>Continue the saga of ${esc(save.state.name)}
                 <span class="hint">${this.content.seasonNames[save.state.season]} ${save.state.year}</span></button>`
            : ""
        }
      </div>
      <p class="muted small">A first playable slice: the spring of 919. Move with the arrow keys or WASD; walk into people to talk. Press + or − to change the text size.</p>
    </div>`;
  }

  private createHtml(): string {
    const bg = this.content.backgrounds[0];
    return `<div class="box create">
      <h2>Who are you?</h2>
      <div class="prose">${prose(bg.description)}</div>
      <label class="field">Your name <input name="hero-name" maxlength="20" value="${esc(this.createName)}" autocomplete="off"></label>
      <div class="traits">${bg.traits
        .map(
          (t) => `<button class="trait ${t.id === this.createTrait ? "on" : ""}" data-act="trait" data-id="${t.id}">
            <strong>${esc(t.name)}</strong><span>${esc(t.description)}</span></button>`,
        )
        .join("")}</div>
      <div class="choices"><button class="choice primary" data-act="begin"><span class="key">↵</span>Begin</button></div>
    </div>`;
  }

  private codexHtml(): string {
    const g = this.game;
    const entries = (g?.state.codex ?? []).map((id) => this.content.codex[id]).filter(Boolean);
    return `<div class="box codex">
      <h2>Codex</h2>
      <p class="muted small">What the sources say, and how firmly. The game simplifies freely; these notes say where.</p>
      ${
        entries.length
          ? entries
              .map(
                (e) => `<article><h3>${esc(e.title).replace(/\*([^*]+)\*/g, "<em>$1</em>")} <span class="ev ev-${e.evidence.replace(
                  " ",
                  "-",
                )}">${esc(e.evidence)}</span></h3>${prose(e.text)}</article>`,
              )
              .join("")
          : `<p class="muted">Nothing recorded yet.</p>`
      }
      <div class="choices"><button class="choice" data-act="close"><span class="key">↵</span>Close</button></div>
    </div>`;
  }

  private helpHtml(): string {
    return `<div class="box help">
      <h2>How to play</h2>
      <dl class="keys">
        <dt>Arrow keys / WASD</dt><dd>Walk. Or click a spot on the map.</dd>
        <dt>Walk into someone</dt><dd>Talk to them.</dd>
        <dt>1–9, Enter</dt><dd>Choose in a conversation or a fight.</dd>
        <dt>C</dt><dd>Codex: historical notes you have unlocked.</dd>
        <dt>H or ?</dt><dd>This help.</dd>
        <dt>+ and −</dt><dd>Larger or smaller text (also the A+ and A− buttons in the side panel).</dd>
      </dl>
      <p>Checks roll a d20 and add one of your qualities; the odds are shown beside each choice. Wounds carry over between fights and heal slowly with the seasons. You can die.</p>
      <p>Sleep in your bed to end the season. The game saves itself each time a season turns and whenever you close or leave the page; you can also save by hand.</p>
      <div class="choices"><button class="choice" data-act="close"><span class="key">↵</span>Close</button></div>
    </div>`;
  }
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function signed(n: number): string {
  return n > 0 ? `+${n}` : String(n);
}
