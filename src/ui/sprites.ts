// Pixel art drawn in code: 16x16 tiles in a muted, earthy palette, in the spirit
// of Ultima IV and V. No image files, so no licensing questions.

export const TILE = 16;

const P = {
  black: "#14110e",
  grass1: "#3f6b2e",
  grass2: "#4d7d35",
  grass3: "#5e8f3e",
  grassDark: "#2f5224",
  leaf1: "#1f4a24",
  leaf2: "#2c6230",
  leaf3: "#3b7a3a",
  trunk: "#5a3b22",
  soil1: "#6b4a2b",
  soil2: "#58391f",
  soil3: "#7d5933",
  sprout: "#7aa34a",
  water1: "#2b4f7a",
  water2: "#3a6694",
  water3: "#7fa7c9",
  path1: "#9c8460",
  path2: "#8a7350",
  path3: "#b39b74",
  thatch1: "#b08a43",
  thatch2: "#94712f",
  thatch3: "#c9a35a",
  shingle1: "#6e6158",
  shingle2: "#594e46",
  wood1: "#7a5233",
  wood2: "#5e3d25",
  wood3: "#94683f",
  stone1: "#8a8a82",
  stone2: "#6c6c66",
  stone3: "#a9a9a0",
  fire1: "#e8a03a",
  fire2: "#f4d36b",
  fire3: "#c4502c",
  wool: "#c8b99a",
  red: "#8c2f27",
  blue: "#3b5577",
  white: "#e8e0cc",
  skin: "#d9a982",
  hair1: "#5a3a1e",
  hair2: "#c9a35a",
  hair3: "#8c8c84",
  flower1: "#e8d26b",
  flower2: "#d98ab5",
};

type Ctx = CanvasRenderingContext2D;

/** Small deterministic hash so each map position gets a stable variant. */
export function hash(x: number, y: number, n = 0): number {
  let h = (x * 374761393 + y * 668265263 + n * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function px(c: Ctx, x: number, y: number, color: string, w = 1, h = 1): void {
  c.fillStyle = color;
  c.fillRect(x, y, w, h);
}

function speckle(c: Ctx, seed: number, colors: string[], count: number): void {
  for (let i = 0; i < count; i++) {
    const x = Math.floor(hash(seed, i, 1) * TILE);
    const y = Math.floor(hash(seed, i, 2) * TILE);
    px(c, x, y, colors[i % colors.length]);
  }
}

function grassBase(c: Ctx, seed: number): void {
  px(c, 0, 0, P.grass2, TILE, TILE);
  speckle(c, seed, [P.grass1, P.grass3, P.grass1, P.grassDark], 34);
}

function tree(c: Ctx, cx: number, cy: number, r: number): void {
  px(c, cx - 1, cy + r - 1, P.trunk, 2, 4);
  c.fillStyle = P.leaf1;
  c.beginPath();
  c.arc(cx, cy, r, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = P.leaf2;
  c.beginPath();
  c.arc(cx - 1, cy - 1, r - 1.5, 0, Math.PI * 2);
  c.fill();
  px(c, cx - 2, cy - 3, P.leaf3, 2, 1);
  px(c, cx - 3, cy - 2, P.leaf3, 1, 1);
}

function planks(c: Ctx, horizontal: boolean): void {
  px(c, 0, 0, P.wood1, TILE, TILE);
  for (let i = 0; i < 4; i++) {
    if (horizontal) px(c, 0, i * 4 + 3, P.wood2, TILE, 1);
    else px(c, i * 4 + 3, 0, P.wood2, 1, TILE);
  }
  px(c, 2, 1, P.wood3);
  px(c, 9, 6, P.wood3);
  px(c, 5, 10, P.wood3);
  px(c, 12, 13, P.wood3);
}

function flames(c: Ctx, cx: number, cy: number, frame: number): void {
  const f = frame % 2;
  px(c, cx - 2, cy, P.fire3, 5, 2);
  px(c, cx - 1, cy - 2 - f, P.fire1, 3, 3 + f);
  px(c, cx, cy - 4 + f, P.fire2, 1, 3);
  px(c, cx - 2 + f, cy - 1, P.fire2, 1, 1);
}

/** Draws a terrain sprite for one tile. `seed` varies the details per position. */
export function drawTile(c: Ctx, sprite: string, seed: number, frame: number): void {
  switch (sprite) {
    case "grass":
      grassBase(c, seed);
      break;
    case "meadow":
      grassBase(c, seed);
      for (let i = 0; i < 5; i++) {
        px(
          c,
          Math.floor(hash(seed, i, 7) * 15),
          Math.floor(hash(seed, i, 8) * 15),
          i % 2 ? P.flower1 : P.flower2,
        );
      }
      break;
    case "field":
      px(c, 0, 0, P.soil1, TILE, TILE);
      for (let y = 1; y < TILE; y += 3) px(c, 0, y, P.soil2, TILE, 1);
      for (let i = 0; i < 10; i++) {
        const x = Math.floor(hash(seed, i, 3) * 16);
        const y = Math.floor(hash(seed, i, 4) * 5) * 3;
        px(c, x, y, i % 3 ? P.sprout : P.soil3);
      }
      break;
    case "forest":
      px(c, 0, 0, P.grassDark, TILE, TILE);
      speckle(c, seed, [P.grass1, P.leaf1], 12);
      if (hash(seed, 9) < 0.5) {
        tree(c, 5, 5, 4);
        tree(c, 11, 10, 4.5);
      } else {
        tree(c, 10, 5, 4);
        tree(c, 5, 11, 4.5);
      }
      break;
    case "water": {
      px(c, 0, 0, P.water1, TILE, TILE);
      const o = frame % 2 ? 2 : 0;
      for (let y = 2; y < TILE; y += 5) {
        const s = (Math.floor(hash(seed, y) * 8) + o) % TILE;
        px(c, s, y, P.water2, 5, 1);
        px(c, (s + 8) % TILE, y + 2, P.water2, 4, 1);
      }
      px(c, (seed * 3 + o) % 14, (seed * 7) % 14, P.water3, 2, 1);
      break;
    }
    case "path":
      px(c, 0, 0, P.path1, TILE, TILE);
      speckle(c, seed, [P.path2, P.path3, P.path2], 18);
      break;
    case "bridge":
      drawTile(c, "water", seed, frame);
      for (let x = 0; x < TILE; x += 3) {
        px(c, x, 2, P.wood1, 2, 12);
        px(c, x, 2, P.wood3, 1, 12);
      }
      px(c, 0, 1, P.wood2, TILE, 1);
      px(c, 0, 14, P.wood2, TILE, 1);
      break;
    case "thatch":
      // Courses of straw, each with a darker shadowed lower edge.
      px(c, 0, 0, P.thatch1, TILE, TILE);
      for (let y = 0; y < TILE; y += 4) {
        px(c, 0, y + 3, P.thatch2, TILE, 1);
        px(c, 0, y, P.thatch3, TILE, 1);
        for (let x = (y / 4 + seed) % 3; x < TILE; x += 3) px(c, x, y + 1, P.thatch2, 1, 2);
      }
      speckle(c, seed, ["#7a5c26"], 6);
      break;
    case "shingle":
      px(c, 0, 0, P.shingle1, TILE, TILE);
      for (let y = 0; y < TILE; y += 4) {
        px(c, 0, y + 3, P.shingle2, TILE, 1);
        for (let x = (y / 4) % 2 ? 2 : 0; x < TILE; x += 4) px(c, x, y, P.shingle2, 1, 3);
      }
      break;
    case "door":
      px(c, 0, 0, P.wood2, TILE, TILE);
      px(c, 3, 2, P.wood1, 10, 14);
      px(c, 7, 2, P.wood2, 1, 14);
      px(c, 10, 9, P.stone3, 1, 1);
      px(c, 2, 1, P.wood3, 12, 1);
      break;
    case "fence":
      grassBase(c, seed);
      px(c, 1, 3, P.trunk, 1, 11);
      px(c, 8, 3, P.trunk, 1, 11);
      px(c, 14, 3, P.trunk, 1, 11);
      for (let y = 5; y < 13; y += 3) {
        for (let x = 0; x < TILE; x++) px(c, x, y + ((x >> 1) % 2), (x >> 1) % 2 ? P.wood3 : P.wood1);
      }
      break;
    case "well":
      grassBase(c, seed);
      c.fillStyle = P.stone2;
      c.beginPath();
      c.arc(8, 8, 6.5, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = P.stone1;
      c.beginPath();
      c.arc(8, 8, 5.5, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = P.water1;
      c.beginPath();
      c.arc(8, 8, 3.5, 0, Math.PI * 2);
      c.fill();
      px(c, 2, 1, P.wood2, 12, 1);
      px(c, 2, 1, P.wood2, 1, 5);
      px(c, 13, 1, P.wood2, 1, 5);
      break;
    case "rocks":
      grassBase(c, seed);
      for (const [x, y, w, h] of [
        [2, 3, 6, 5],
        [8, 7, 7, 6],
        [3, 10, 5, 4],
      ]) {
        px(c, x, y, P.stone2, w, h);
        px(c, x, y, P.stone1, w - 1, h - 1);
        px(c, x + 1, y + 1, P.stone3, 2, 1);
      }
      break;
    case "cross":
      grassBase(c, seed);
      px(c, 7, 2, P.wood2, 2, 13);
      px(c, 3, 5, P.wood2, 10, 2);
      px(c, 7, 2, P.wood3, 1, 13);
      break;
    case "stone":
      grassBase(c, seed);
      px(c, 5, 3, P.stone2, 6, 12);
      px(c, 5, 3, P.stone1, 5, 11);
      px(c, 6, 4, P.stone3, 1, 6);
      break;
    case "fire":
      px(c, 0, 0, P.grassDark, TILE, TILE);
      speckle(c, seed, [P.grass1], 10);
      for (const [x, y] of [
        [4, 10],
        [11, 10],
        [5, 13],
        [10, 13],
        [7, 14],
      ]) px(c, x, y, P.stone1, 2, 2);
      flames(c, 8, 11, frame);
      break;
    case "floor":
      planks(c, true);
      break;
    case "wall":
      // Dark timber wall of vertical planks.
      px(c, 0, 0, P.wood2, TILE, TILE);
      for (let x = 0; x < TILE; x += 4) {
        px(c, x, 0, "#4a3020", 1, TILE);
        px(c, x + 1, 0, P.wood1, 1, TILE);
      }
      speckle(c, seed, ["#4a3020", P.wood1], 8);
      break;
    case "void":
      px(c, 0, 0, P.black, TILE, TILE);
      break;
    case "bed":
      planks(c, true);
      px(c, 1, 1, P.wood2, 14, 14);
      px(c, 2, 2, P.thatch3, 12, 12);
      px(c, 2, 7, P.red, 12, 7);
      px(c, 2, 7, P.fire3, 12, 1);
      px(c, 4, 3, P.white, 8, 3);
      break;
    case "table":
      planks(c, true);
      px(c, 1, 3, P.wood2, 14, 10);
      px(c, 1, 3, P.wood3, 14, 9);
      px(c, 4, 5, P.stone3, 3, 2);
      px(c, 10, 7, P.wool, 2, 3);
      break;
    case "hearth": {
      // A long open hearth: a bed of stones and embers that tiles seamlessly.
      px(c, 0, 0, "#3a302a", TILE, TILE);
      speckle(c, seed, [P.stone2, "#2a221d", P.stone2], 30);
      for (let i = 0; i < 9; i++) {
        px(c, Math.floor(hash(seed, i, 5) * 15), Math.floor(hash(seed, i, 6) * 15), i % 3 ? P.fire3 : P.fire1);
      }
      if (seed % 2 === 0) flames(c, 5 + (seed % 5), 11, frame + seed);
      break;
    }
    case "chest":
      planks(c, true);
      px(c, 2, 4, P.wood2, 12, 10);
      px(c, 3, 5, P.wood3, 10, 8);
      px(c, 2, 8, P.stone2, 12, 1);
      px(c, 7, 7, P.fire1, 2, 3);
      break;
    default:
      px(c, 0, 0, "#ff00ff", TILE, TILE);
  }
}

// ---------- figures ----------

// One base figure, recoloured per character. Letters map to roles:
// h hair/hood, s skin, t tunic, T tunic shade, l legs, b boots/belt, x extra, k outline.
const FIGURE = [
  "................",
  "......hhhh......",
  ".....hhhhhh.....",
  ".....hsssshh....",
  ".....ssssss.....",
  "......ssss......",
  "....tttttttt....",
  "...tttTttTttt...",
  "...st.tttt.ts...",
  "...st.bbbb.ts...",
  "...s.tttttt.s...",
  ".....tTttTt.....",
  ".....ll..ll.....",
  ".....ll..ll.....",
  ".....bb..bb.....",
  "................",
];

interface FigureColours {
  h: string;
  t: string;
  T: string;
  l?: string;
  b?: string;
  extra?: (c: Ctx) => void;
}

const FIGURES: Record<string, FigureColours> = {
  player: {
    h: P.hair2,
    t: P.blue,
    T: "#2c4260",
    extra: (c) => {
      // cloak edges and a seax at the belt
      px(c, 3, 6, P.wool, 1, 5);
      px(c, 12, 6, P.wool, 1, 5);
      px(c, 10, 9, P.stone3, 1, 3);
    },
  },
  retainer: { h: P.hair3, t: P.wood1, T: P.wood2, extra: (c) => px(c, 13, 3, P.trunk, 1, 12) },
  woman: {
    h: P.white,
    t: P.red,
    T: "#6e231d",
    l: P.red,
    b: P.wood2,
    extra: (c) => {
      px(c, 5, 12, P.red, 6, 3);
      px(c, 4, 2, P.white, 1, 5);
      px(c, 11, 2, P.white, 1, 5);
    },
  },
  woman2: {
    h: P.hair1,
    t: "#5d6b3a",
    T: "#47532b",
    l: "#5d6b3a",
    extra: (c) => {
      px(c, 5, 12, "#5d6b3a", 6, 3);
      px(c, 6, 10, P.wool, 4, 2);
    },
  },
  peasant: { h: P.hair1, t: P.wool, T: P.path2 },
  reeve: {
    h: P.hair1,
    t: "#4b3a5c",
    T: "#382a47",
    extra: (c) => {
      px(c, 13, 2, P.wood3, 1, 13);
      px(c, 12, 2, P.fire1, 3, 1);
    },
  },
  smith: {
    h: P.black,
    t: P.wood2,
    T: P.soil2,
    extra: (c) => {
      px(c, 5, 8, P.soil2, 6, 4);
      px(c, 13, 7, P.stone2, 2, 2);
      px(c, 13, 9, P.wood1, 1, 3);
    },
  },
  priest: {
    h: P.hair3,
    t: P.black,
    T: "#2a241e",
    l: P.black,
    extra: (c) => {
      px(c, 5, 12, P.black, 6, 3);
      px(c, 7, 7, P.white, 2, 1);
      px(c, 7, 6, P.white, 1, 3);
    },
  },
  outlaw: {
    h: "#3a3a2a",
    t: "#4a4a35",
    T: "#33331f",
    extra: (c) => {
      px(c, 13, 0, P.stone3, 1, 3);
      px(c, 13, 3, P.trunk, 1, 12);
    },
  },
};

export function drawFigure(c: Ctx, sprite: string): void {
  const f = FIGURES[sprite] ?? FIGURES.peasant;
  const map: Record<string, string> = {
    h: f.h,
    s: P.skin,
    t: f.t,
    T: f.T,
    l: f.l ?? P.wood2,
    b: f.b ?? P.black,
  };
  // soft shadow
  c.fillStyle = "rgba(0,0,0,0.25)";
  c.fillRect(4, 14, 8, 2);
  for (let y = 0; y < TILE; y++) {
    const row = FIGURE[y];
    for (let x = 0; x < TILE; x++) {
      const col = map[row[x]];
      if (col) px(c, x, y, col);
    }
  }
  f.extra?.(c);
}

/** Pre-renders tiles and figures into small canvases for fast drawing. */
export class SpriteCache {
  private cache = new Map<string, HTMLCanvasElement>();

  tile(sprite: string, seed: number, frame: number): HTMLCanvasElement {
    const animated = sprite === "water" || sprite === "fire" || sprite === "hearth" || sprite === "bridge";
    const variant = seed % 8;
    const key = `t:${sprite}:${variant}:${animated ? frame % 2 : 0}`;
    return this.get(key, (c) => drawTile(c, sprite, variant, animated ? frame : 0));
  }

  figure(sprite: string): HTMLCanvasElement {
    return this.get(`f:${sprite}`, (c) => drawFigure(c, sprite));
  }

  private get(key: string, draw: (c: Ctx) => void): HTMLCanvasElement {
    let cv = this.cache.get(key);
    if (!cv) {
      cv = document.createElement("canvas");
      cv.width = TILE;
      cv.height = TILE;
      const c = cv.getContext("2d")!;
      draw(c);
      this.cache.set(key, cv);
    }
    return cv;
  }
}
