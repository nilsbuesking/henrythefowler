import type { Content, GameState } from "./types";

export function serialize(state: GameState): string {
  return JSON.stringify(state);
}

/** Parses a saved game, rejecting saves from other content packs or versions. */
export function deserialize(content: Content, json: string): GameState | null {
  try {
    const s = JSON.parse(json) as Partial<GameState>;
    if (s.version !== 1 || typeof s.name !== "string" || !s.map || !content.maps[s.map]) return null;
    if (!s.mode || !s.stats || !s.resources) return null;
    return s as GameState;
  } catch {
    return null;
  }
}
