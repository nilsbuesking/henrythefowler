# Henry the Fowler

An Ultima-style, top-down role-playing game set in the Saxony of Henry the Fowler (919–936). You play a free Saxon landholder: hold your household together, keep faith with your lord and neighbours, and live through the reign. Combat exists but is light; most trouble can be settled by law, oath or compensation.

**Status:** first playable slice, the spring of 919: one village, your hall, seven people to talk to, a neighbour's feud, an outlaw in the wood, a tribute to pay, and the news from Fritzlar.

## Playing

- **Arrow keys / WASD** to walk, or click the map. Walk into people to talk.
- **1–9 / Enter** to choose in conversations and fights.
- **C** opens the codex (historical notes, each marked by how well attested it is). **H** for help.
- Sleep in your bed to end the season. The game autosaves at each season's turn and whenever you close or leave the page; you can also save by hand. Saves live in your browser.
- You can die.

## Running it locally

Requires Node.js 20 or later.

```bash
npm install
npm run dev      # play at http://localhost:5173
npm test         # rules, content checks and a random-playthrough bot
npm run build    # production build in dist/
```

Pushes to `main` run the tests and deploy to GitHub Pages (enable Pages with source "GitHub Actions" in the repository settings).

## How it is built

TypeScript, Vite and a plain HTML canvas; no game framework. Three layers:

| Layer | Folder | Notes |
|---|---|---|
| Core rules | `src/core/` | Game state, d20 checks, events and effects, combat, seasons, save/load. No DOM, so it is tested headlessly and can be reused by another setting. |
| Content | `src/content/henry/` | Plain JSON: maps (text rows), tiles, people, triggers, events, items, enemies, codex. Most new material is added here, without touching code. |
| Presentation | `src/ui/` | Pixel art drawn in code (`sprites.ts`), the map view, panel, log and dialogue boxes. |

### Adding content

- **An event**: add an object to `events.json` with `id`, `title`, `text` and `choices`. A choice can carry conditions (`if`), a stat check (`check` with `success`/`failure`), or a plain `result`. Outcomes apply `effects` and can lead on (`next`), start a fight (`combat`), end the season (`endSeason`) or kill the player (`death`).
- **A person**: add to `npcs.json`; their `talk` list picks the first event whose conditions hold.
- **A map**: add rows of tile characters to `maps.json`; the legend is in `tiles.json`.
- **A new background** (retainer, cleric, merchant): add to `background.json` with its own stats, starting place and opening event.

`npm test` checks that every reference resolves, so broken links between events show up immediately.

## Historical basis

Mainly Widukind of Corvey and Liudprand of Cremona for events; Timothy Reuter and Karl Leyser for society; Gerd Althoff for rule by personal bonds. Details of daily life are partly reconstructed, and the game says so in its codex. The village, its people and Count Hathumar are invented.
