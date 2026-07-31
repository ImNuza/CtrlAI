# Garden of Life (working title)

A garden that grows from your memories. Tell Auntie Bee one small thing about
your life, answer three taps' worth of questions, and a plant composed from
your answers joins your garden. She remembers you when you come back.

Built overnight on 1 Aug 2026 by a multi-agent Claude run (conductor,
orchestrators, coder seats) for the Tencent "Age Well" hackathon, Game Track.
This is the reference build the CodeBuddy submission phase ports from, not the
submission itself. `HANDOFF.md` is the cold-start guide for that phase.

## Run it

```
node server.js
```

from the repo root, then open `http://localhost:4173/garden-of-life` at a
phone viewport (390x844). No build step, no keys, no network calls.

## What works, for real

- Memory to plant: 8 heritage objects, 3 tap prompts each, a deterministic
  procedural plant (species, palette, blooms, ornament all driven by your
  answers), planted as a sprout that grows one stage per watered day.
- Auntie Bee: greets you by visit type (first, returning, back after days
  away), reacts to planting, watering, thirsty plants, harvests, meal
  unlocks and photo finds, remembers your name and your last plant. All
  lines come from a reviewed 65-line bank through the aiGenerate seam.
- Tending: water by tap, plants wilt kindly after two dry days (words on
  screen, never blame), recover fully, never die.
- Economy: puzzle rounds pay a fixed 6 coins, seeds cost 4/8/12 by tier,
  one free common seed daily, the rare shelf opens on a 3-day streak,
  missed days pause streaks and never reset them. Zero randomness anywhere.
- Tile puzzle: 8 pairs, garden motifs, no timer; a missed pair waits for
  your next tap.
- Meal cards: harvest a dish's full crop set and the card unlocks with its
  illustration. Six local dishes, benefit lines in plain food language.
- Photo quest: one camera walk a day; the photo becomes a seed plus 3 coins
  and Auntie Bee reacts. On desktop the camera input degrades to a file
  picker. The photo never leaves the device and is never stored.
- Share card: a 1080x1350 image of your actual garden, drawn on canvas,
  downloaded (or the system share sheet where the platform offers one).
- PWA manifest with icons; gentle procedural audio with a big persisted
  mute toggle, silent until the first tap.

## What is canned, honestly

- The gardener's lines are template banks, not a live model. The seam
  (`shared/ai.js` aiGenerate, SWAP POINT documented) is where the CodeBuddy
  phase wires a real LLM; banks stay as the offline fallback.
- The photo "identification" is a canned classifier: it names a plausible
  Singapore plant without reading the photo, the UI honestly asks "Am I
  right?", and the picker path lets the player correct it. Live vision goes
  behind the same seam (`aiClassifyPhoto`).
- Everything else is real game logic. Nothing else pretends.

## Verification

Five Playwright suites plus a content linter, all driving the real UI at
390x844 (`node games/garden-of-life/qa/<suite>`): `core.mjs` (29 checks),
`days.mjs` (26, simulated-day cycles via the QA clock), `economy.mjs` (33),
`phase3.mjs` (30), `composer-check.mjs` (determinism and wilt contrast), and
`lint-content.mjs`. Two independent adversary passes (rubric and senior UX
floor) ran on the finished build; the UX pass measured 54 screen-states and
found zero hard-floor violations, and its five warnings were fixed and
re-verified by an independent delta pass. Full history: `BUILD-REPORT-2.md`
at the repo root.

## Senior UX floor

Every screen: tap targets 64px or larger, text 28px or larger, contrast
4.5:1 minimum on measured worst-case composites, tap-only progression,
no timers, no shame. The floor is enforced by `shared/ui/tokens.css` and
proven by the suites, not promised.

## Known gaps (also in HANDOFF.md)

- Streak rungs at 7 and 14 days exist in code with only one rare crop
  behind the 3-day rung. Team tuning knob.
- The OS share-sheet branch needs a real phone over HTTPS to exercise.
- `--color-border` sits below the 3:1 non-text floor on the warmed garden
  ground (pre-existing); it lives in shared tokens, so changing it is a
  team decision.
- Game name is still the working title; the team owns naming.
