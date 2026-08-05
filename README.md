# CtrlAI

Team repo for the Tencent Cloud "Age Well" Social Good Challenge Singapore,
Game Track. Team: Dewa, Matthew, Zoe. Submission deadline 9 Aug 2026,
11:59 PM SGT.

The game is **Garden of Life**: cognitive exercises that grow a garden. Round
one was a three-prototype bake-off, the team picked the gardening direction on
29 Jul, and the build now in `app/` is the one going forward.

Five courses of exercises. Four of them are the original set (Tile Match,
Pattern, Odd One Out, Word Pairs). The fifth is **Kopitiam Corner**, which is
Mahjong Kakis ported in from the round-one prototype: face-up mahjong tiles,
three companions who banter and remember your name, and a difficulty dial
nothing in the UI ever mentions.

## Run it

```
node server.js
```

Open `http://localhost:4173/app/` at a phone viewport. **390x844 is the design
target, portrait only.** No build step, no keys, no network calls.

While developing, tick **Application → Service Workers → "Bypass for network"**
in DevTools. The worker caches aggressively and will happily serve you the last
build you loaded.

## Where things live

- `app/` **the shipping build.** One classic script, one stylesheet, no modules
  and no build step. This folder is also the deploy root on EdgeOne Pages, which
  is why `manifest.json` and `sw.js` sit inside it rather than at the repo root.
- `design-system/` the Muted Botanical system: `design-tokens.css` is the token
  source, `design-system.html` is the living reference with every colour ratio
  measured and written down.
- `DEPLOY.md` how to get it onto a phone, and the one genuine gotcha
  (service workers need HTTPS or localhost, so a LAN IP will not do).
- `PORT_MAHJONG_KAKIS.md` what the Kakis port actually did: every file that
  moved, every colour that was remapped, what was dropped and why, and the
  limits that are still real.
- `GAME_ANALYSIS.md`, `PLAN_3D_GARDEN.md`, `PLAN_RETENTION_SYSTEMS.md` the
  analysis and specs the current build was worked from.
- `SPEC.md`, `RULES.md`, `CONTEXT.md`, `GOAL.md`, `BUILD-REPORT*.md` the record
  of round one and two: scope, constraints, decisions, spend ledger.
- `shared/` the seam layer the archived prototypes run on: `ai.js` (the SWAP
  POINT seams), `storage.js`, and the round-one UI tokens. `app/` does not
  import any of it, on purpose. See `PORT_MAHJONG_KAKIS.md`.
- `archive/` the three round-one prototypes (Memory Garden, Mahjong Kakis, Scam
  Dojo), still playable at `/archive/<name>`. The Mahjong Kakis copy is the
  reference the port was read from, kept intact until the port is trusted.
- `tools/make_icons.py` regenerates `app/icons/` with Pillow.
- `meetings/` the 29 Jul meeting record that picked the direction.

## Where the AI seam is

`kakiGenerate()` in `app/game.js` is the one function a real model replaces. It
is already async and already returns `{ text, meta }`, so no call site changes
when Tencent Cloud gets wired in. `KAKI_BANTER` then becomes the offline
fallback, and `meta.source` stays how the demo tells a real answer from a banked
one. The block above the function spells out the contract.

## Verify it

There is no automated suite for `app/` yet. It was verified by driving the real
UI in a phone-sized viewport. `PORT_MAHJONG_KAKIS.md` lists exactly what was
checked and what was not.

The archived prototypes keep their own Playwright QA under `archive/<name>/qa/`,
pointed at the archive routes:

```
PORT=4182 node server.js &
node archive/mahjong-kakis/qa/core.mjs
node archive/mahjong-kakis/qa/memory.mjs
node archive/mahjong-kakis/qa/dial.mjs
node archive/mahjong-kakis/qa/stability.mjs
```

Those exercise the archived ES-module build, not `app/`. They are still useful
as a description of what the Kakis behaviour is meant to be.

## House rules

Senior UX floor on every screen: tap targets 64px or larger, contrast 4.5:1
minimum, tap-only, no timers, no shame states, reduced motion respected. No
`console.log` in production code. Commit at working milestones. Honest READMEs
everywhere, including about what is not done.
