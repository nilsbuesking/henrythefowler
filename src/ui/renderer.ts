import type { Game } from "../core/game";
import { hash, SpriteCache, TILE } from "./sprites";

export const VIEW_W = 19;
export const VIEW_H = 13;

/** Draws the tile map around the player onto a small canvas scaled up by CSS. */
export class MapRenderer {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private sprites = new SpriteCache();

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    canvas.width = VIEW_W * TILE;
    canvas.height = VIEW_H * TILE;
    this.ctx = canvas.getContext("2d")!;
    this.ctx.imageSmoothingEnabled = false;
  }

  draw(game: Game, frame: number): void {
    const c = this.ctx;
    const map = game.map;
    const ox = game.state.x - Math.floor(VIEW_W / 2);
    const oy = game.state.y - Math.floor(VIEW_H / 2);

    for (let vy = 0; vy < VIEW_H; vy++) {
      for (let vx = 0; vx < VIEW_W; vx++) {
        const mx = ox + vx;
        const my = oy + vy;
        const ch = game.tileAt(map, mx, my);
        const def = game.content.tiles[ch];
        const seed = Math.floor(hash(mx, my) * 1000);
        c.drawImage(this.sprites.tile(def?.sprite ?? "grass", seed, frame), vx * TILE, vy * TILE);
      }
    }

    for (const npc of game.visibleNpcs()) {
      const p = game.state.npcPos[npc.id] ?? npc;
      const vx = p.x - ox;
      const vy = p.y - oy;
      if (vx < 0 || vy < 0 || vx >= VIEW_W || vy >= VIEW_H) continue;
      c.drawImage(this.sprites.figure(npc.sprite), vx * TILE, vy * TILE);
    }

    c.drawImage(this.sprites.figure("player"), (game.state.x - ox) * TILE, (game.state.y - oy) * TILE);

    // Gentle vignette for atmosphere.
    const g = c.createRadialGradient(
      this.canvas.width / 2,
      this.canvas.height / 2,
      this.canvas.height * 0.35,
      this.canvas.width / 2,
      this.canvas.height / 2,
      this.canvas.width * 0.62,
    );
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(1, "rgba(10,6,2,0.45)");
    c.fillStyle = g;
    c.fillRect(0, 0, this.canvas.width, this.canvas.height);
  }

  /** Converts a click on the canvas into a direction relative to the player. */
  directionFromClick(ev: MouseEvent): [number, number] | null {
    const r = this.canvas.getBoundingClientRect();
    const tx = Math.floor(((ev.clientX - r.left) / r.width) * VIEW_W);
    const ty = Math.floor(((ev.clientY - r.top) / r.height) * VIEW_H);
    const dx = tx - Math.floor(VIEW_W / 2);
    const dy = ty - Math.floor(VIEW_H / 2);
    if (dx === 0 && dy === 0) return null;
    return Math.abs(dx) >= Math.abs(dy) ? [Math.sign(dx), 0] : [0, Math.sign(dy)];
  }
}
