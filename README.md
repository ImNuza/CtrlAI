# CtrlAI

Team repo for the Tencent Cloud "Age Well" Social Good Challenge Singapore,
Game Track. Team: Dewa, Matthew, Zoe. Submission deadline 9 Aug 2026,
11:59 PM SGT.

The game is **Garden of Life**: a garden that grows from your memories.
Round one was a three-prototype bake-off; the team picked the gardening
direction on 29 Jul and the overnight run of 1 Aug built it to a playable
reference build.

## Run it

```
node server.js
```

Open `http://localhost:4173/garden-of-life` at a phone viewport (390x844).
No build step, no keys, no network calls.

## Where things live

- `games/garden-of-life/` the game. Its `README.md` says what is real and
  what is canned; `HANDOFF.md` is the cold-start guide for the CodeBuddy
  submission phase.
- `BUILD-REPORT-2.md` the overnight run's full record: decisions,
  verification evidence, spend ledger.
- `SPEC.md`, `RULES.md`, `CONTEXT.md`, `GOAL.md` the docs that governed the
  build, kept as the record of scope and constraints.
- `shared/` the seam layer every game runs on: `ai.js` (the SWAP POINT
  seams), `storage.js`, and the senior-UX design tokens.
- `archive/` the three round-one prototypes (Memory Garden, Mahjong Kakis,
  Scam Dojo), kept as lift-from material and still playable at
  `/archive/<name>`.

## Verify the game

From the repo root, each spawns its own server on a spare port:

```
node games/garden-of-life/qa/core.mjs
node games/garden-of-life/qa/days.mjs
node games/garden-of-life/qa/economy.mjs
node games/garden-of-life/qa/phase3.mjs
node games/garden-of-life/qa/composer-check.mjs
node games/garden-of-life/qa/lint-content.mjs
```

The archived prototypes keep their own QA under `archive/<name>/qa/`,
repointed to the archive routes.

## House rules

Senior UX floor on every screen: tap targets 64px or larger, text 28px or
larger, contrast 4.5:1 minimum, tap-only, no timers, no shame. No
`console.log` in production code. Commit at working milestones. Honest
READMEs everywhere.
