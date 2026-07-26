# Mahjong Kakis

Tile matching at a kopitiam table with three AI kakis who banter, remember you, and quietly adapt the pace. One of three bake-off prototypes; the tiles are the hook, the companions are the product.

## How to run

From the repo root:

```
node server.js
```

Open http://localhost:4173/mahjong-kakis on a phone or a phone-sized viewport (390x844 is the design target, portrait only). Set PORT to change the port. No build step, no network, no dependencies.

## What works (all verified by driving the real UI)

- One-tap start: pick what the kakis should call you (chips or type your own), and the first 8-tile round deals immediately. The first greeting teaches the whole game in the kaki's own voice ("Two same tiles, tap both"), and different players get different greetings.
- Tap two matching tiles to clear the pair. A mismatch gets a warm line, never an error. Clear the table for a celebration with One more round, plus a Change name control if the kakis got your name wrong.
- Three kakis with distinct voices: Auntie Lily (warm, flowery), Uncle Beng (cheeky, kopi), Auntie Rose (gentle, knitting). 105 lines across 21 event keys, all reachable.
- Banter reacts to seven events: first_visit, round_start, match_found, near_miss, idle_nudge (tap counts, never a clock), round_win, return_visit. A line stays on screen until the next one lands or you tap it away; nothing erases itself on a timer, and the table never shifts under your finger.
- The kakis remember: come back after playing and a kaki greets you by name with a fact from your history, your rounds together or your best clear, varying by visit so repeat greetings do not repeat.
- Hidden difficulty dial: recent form nudges the next wall between 8 and 16 tiles and raises or lowers how confusable the tiles are. Never shown in the UI, steps at most once per finished round.
- Kindness valve: struggle for a while and one matching pair glows briefly. No text ever calls it help.
- Senior UX floor holds: every tap target 64px or larger, all text 28px or larger, tap-only, no timers, no shame states, reduced motion respected. If the banter file ever fails to load, the game still deals and plays with a neutral line.

## What is mocked, and where the seam is

Every kaki line is template-plus-slots generation from `content/kaki-banter.json`, routed through `aiGenerate()` in `shared/ai.js`. That function is the single swap point for a real LLM later; the banks then become the offline fallback. `meta.source` on every line already distinguishes bank, fallback, and (later) llm. Memory is real localStorage under the key `ctrlai:mahjong-kakis`, not mocked.

## QA

Playwright scripts under `qa/` drive the real UI (server on port 4182, or set MK_URL):

```
PORT=4182 node server.js &
node games/mahjong-kakis/qa/core.mjs       # full round, four banter events, storage
node games/mahjong-kakis/qa/memory.mjs     # bank lint, memory callbacks, long names, best-clear branches
node games/mahjong-kakis/qa/dial.mjs       # dial up, dial down, dial steady, never surfaced
node games/mahjong-kakis/qa/stability.mjs  # layout shift, greeting variety, doubled tokens, fetch failure, name safety
```

There is also a repo-wide inspector: `node tools/qa/inspect.mjs --url http://localhost:4182/mahjong-kakis --name mk`.

## Known limits, stated plainly

- Leaving mid-round (reload, Back to hub) resets the current table; the same wall re-deals with that round's progress cleared. Finished rounds, your name, and the kakis' memory always persist. In-round resume is a real-build item.
- Short phones (around 667px tall, like an SE) scroll the biggest walls; the fourth tile row peeks above the fold so it is clear there is more. Landscape is not supported.
- Two name labels (the bubble speaker and the player bar) render the amber accent on tinted surfaces at 6.91:1 and 6.98:1. Both are 28px bold, comfortably past the 4.5:1 floor and large-text AAA; body text pairs measure 7:1 or better.

## What to check first as a team

Play one round, close the tab, come back. The greeting is the pitch: it knows your name and brings up your history, and each visit a different kaki says it a different way. Then play well for two rounds and watch the wall quietly grow.
