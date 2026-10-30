// Deterministic random numbers (mulberry32). The generator state lives in the
// game state, so saved games and test runs are reproducible.

export interface Rng {
  next(): number; // [0, 1)
  int(min: number, max: number): number; // inclusive
  d20(): number;
  state: number;
}

export function createRng(seed: number): Rng {
  let s = seed >>> 0;
  const rng: Rng = {
    get state() {
      return s;
    },
    set state(v: number) {
      s = v >>> 0;
    },
    next() {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    int(min: number, max: number) {
      return min + Math.floor(rng.next() * (max - min + 1));
    },
    d20() {
      return rng.int(1, 20);
    },
  };
  return rng;
}
