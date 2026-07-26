# Mahjong Kakis

Tile matching at a kopitiam table with three AI kakis who banter, remember you, and quietly adapt the pace. One of three bake-off prototypes; the tiles are the hook, the companions are the product.

## How to run

From the repo root:

```
node server.js
```

Open http://localhost:4173/mahjong-kakis on a phone or a phone-sized viewport (390x844 is the design target). Set PORT to change the port. No build step, no network, no dependencies.

## What works (all verified by driving the real UI)

- One-tap start: pick what the kakis should call you (chips or type your own), and the first 8-tile round deals immediately. No instructions screen; Lily's opening line teaches the whole game.
- Tap two matching tiles to clear the pair. A mismatch gets a warm line, never an error. Clear the table for a celebration with One more round.
- Three kakis with distinct voices: Auntie Lily (warm, flowery), Uncle Beng (cheeky, kopi), Auntie Rose (gentle, knitting). 93 lines across 18 event keys.
- Banter reacts to six events: round_start, match_found, near_miss, idle_nudge (tap counts, never a clock), round_win, return_visit.
- The kakis remember: come back after playing and a kaki greets you by name and brings up your last sessions (rounds played, your best clear). Different visits get different greeters.
- Hidden difficulty dial: recent form nudges the next wall between 8 and 16 tiles and raises or lowers how confusable the tiles are. Never shown in the UI, steps at most once per finished round.
- Kindness valve: struggle for a while and one matching pair glows briefly. No text ever calls it help.
- Senior UX floor holds: every tap target 64px or larger, all text 28px or larger, AAA contrast pairs from the shared tokens, tap-only, no timers, no shame states, reduced motion respected.

## What is mocked, and where the seam is

Every kaki line is template-plus-slots generation from `content/kaki-banter.json`, routed through `aiGenerate()` in `shared/ai.js`. That function is the single swap point for a real LLM later; the banks then become the offline fallback. `meta.source` on every line already distinguishes bank, fallback, and (later) llm. Memory is real localStorage under the key `ctrlai:mahjong-kakis`, not mocked.

## QA

Playwright scripts under `qa/` drive the real UI (server on port 4182, or set MK_URL):

```
PORT=4182 node server.js &
node games/mahjong-kakis/qa/core.mjs      # full round, four banter events, storage
node games/mahjong-kakis/qa/memory.mjs    # bank lint, return-visit memory, long names, greeter variety
node games/mahjong-kakis/qa/dial.mjs      # dial up, dial down, dial steady, never surfaced
```

There is also a repo-wide inspector: `node tools/qa/inspect.mjs --url http://localhost:4182/mahjong-kakis --name mk`.

## Known niggles

- On a 360px screen at 16 tiles, the bottom bar shortens the player name to make room for the progress dots. The banter always says the name in full.
- At 390px and wider, a 14 or 16 tile wall can scroll vertically a little because tiles grow with the screen. Never horizontally.
- Speech bubbles auto-dismiss after about 4 seconds (tap also dismisses). That is a convenience, not a game timer; nothing depends on it.

## What to check first as a team

Play one round, close the tab, come back. The greeting is the pitch: it knows your name, it remembers your best round, and each kaki says it differently. Then play well for two rounds and watch the wall quietly grow.
