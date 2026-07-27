# CtrlAI

Three prototype directions for the Tencent Cloud "Age Well" Social Good Challenge, Game Track.
They exist so Dewa, Matthew and Zoe can actually play all three and pick one, rather than
argue about screenshots. This is not the submission. The chosen direction gets rebuilt with
CodeBuddy afterwards.

Built overnight by a multi-agent pipeline: one conductor, three orchestrators, a stack of
coder agents, and an adversarial QA sweep that found and fixed real bugs before you woke up.
The full story, every autonomous decision, and the verification evidence live in
`BUILD-REPORT.md`.

## Run it

```
node server.js
```

Then open <http://localhost:4173>.

No install step, no dependencies, no build. Node builtins only. Set `PORT` if 4173 is taken.

Play it on a phone, or put your browser in a phone sized viewport (390x844) before judging
anything. Every screen is designed for a senior holding a phone at arm's length, so it looks
oversized on a laptop and correct on a handset.

## The three routes

| Route | Game | The one line pitch |
|---|---|---|
| `/memory-garden` | Memory Garden | Answer a few gentle questions about an old object, a plant grows from the memory, the garden remembers. |
| `/mahjong-kakis` | Mahjong Kakis | Tile matching at a kopitiam table with three AI kakis who banter and recall your last visit. |
| `/scam-dojo` | Scam Dojo | A two minute daily drill. The phone rings, a scammer tries a fresh angle, you tap the tells. |

Each game has its own honest README (what works, what is mocked, known issues, how to test):
`games/memory-garden/README.md`, `games/mahjong-kakis/README.md`, `games/scam-dojo/README.md`.

## For Matthew and Zoe: how to judge

Play all three on a phone, twice each. The second visit matters, two of the games remember you.
Score each out of 5 on:

1. Did it feel alive?
2. Did the AI beat impress you?
3. Would you proudly demo this on Aug 9?
4. Can we see ourselves building this for two weeks?

Ties break toward the game whose AI story is easiest to explain in one sentence. The full
argument for and against each direction is in the bake-off report Dewa has.

## What is real and what is mocked

The honest version: every "AI" line tonight is template plus randomized slots from per-game
content banks, routed through one function in `shared/ai.js`. That is deliberate. It runs
offline, it makes runs feel fresh, and the SWAP POINT comment in that file marks the single
function body a real model replaces later, same signature, no rewrite. Plant composition in
Memory Garden is real seeded procedural generation. Memory in all three games is real
localStorage. Art is placeholder CSS and SVG; Miora art comes later.

## Shared foundation

- `shared/ui/tokens.css` and `shared/ui/base.css` carry the senior UX floor: 64px tap targets,
  28px minimum body text, 4.5:1 contrast floor with 7:1 the working target (ink-on-paper text
  pairs all clear 7:1), tap only, no timers.
- `shared/ai.js` is the single AI seam described above.
- `shared/storage.js` wraps localStorage so games persist without touching it directly.
- `shared/content-banks.md` is the convention for writing game content.

## Checks

```
node tools/selftest-shared.mjs
```

Per game QA drives the real UI headless (needs `npm install` once for playwright, the only
dependency in the repo and only for QA). Memory Garden's suites start their own server; the
others name their port near the top of the file, so start `PORT=<that port> node server.js`
first (mahjong suites use 4182, scam dojo smoke 4185 and dod 4186):

Every port here is fixed, so two copies of a suite cannot run at once. `loop.mjs` now refuses
to start rather than quietly driving whoever already holds its port. Give the second copy a
port of its own with `MG_PORT=<free port> node games/memory-garden/qa/loop.mjs`.

```
node games/memory-garden/qa/loop.mjs
node games/memory-garden/qa/lint-bank.mjs
node games/mahjong-kakis/qa/core.mjs
node games/mahjong-kakis/qa/memory.mjs
node games/mahjong-kakis/qa/dial.mjs
node games/mahjong-kakis/qa/stability.mjs
node games/scam-dojo/qa/smoke.mjs
node games/scam-dojo/qa/dod.mjs
node tools/qa/inspect.mjs --url http://localhost:4173/memory-garden --name spot
```

All of it was green at handoff, run from scratch by the conductor, not taken from any
agent's word.

## House rules

No `console.log` in shipped code, no emoji in code, no em dashes in writing. Commit at every
working milestone. Pushes to main happen only on Dewa's say-so.
