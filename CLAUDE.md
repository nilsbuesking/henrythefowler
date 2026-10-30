# Henry the Fowler: notes for working on this repo

- British English in all player-facing text. Saga tone, with German period terms in *italics* (*Hof*, *Ding*, *Buße*, *Burg*).
- Keep `src/core/` free of DOM code; the same core is meant to be reused for other settings (a Wilhelmine Germany game is planned).
- New content goes in `src/content/henry/*.json`. Run `npm test` after any change: it validates all references and runs a random-playthrough bot.
- Historical claims belong in `codex.json` with an honest `evidence` label (well attested, attested, debated, reconstructed, invented).
- Only one background (landholder) exists so far; the data model supports more.
- Open `?debug` in the browser to get the running app as `window.app`.
