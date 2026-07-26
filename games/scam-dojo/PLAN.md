# Scam Dojo build plan (v0 prototype)

Owner: Fable orchestrator (plans, reviews, verifies, writes only this file and README.md).
All code and content by Opus coder subagents. Directory owned: games/scam-dojo/ only.

## Architecture

Single page app served at /scam-dojo. The page URL has no trailing slash, so every asset
and fetch URL must be absolute: /games/scam-dojo/... Relative paths would resolve to the
repo root and 404.

Files:
- index.html: shell with four screens as section[data-screen="home"|"ring"|"call"|"recap"],
  inactive screens carry [hidden].
- app.css: game styles on top of shared tokens and base.
- js/app.js: boot, screen state machine, storage io.
- js/rounds.js: content loading, family rotation, slot rolling with makeRng, round assembly.
- js/ui.js: DOM builders per screen.
- content/scam-scripts.json: the ai.js bank. Event keys per script line (grandchild_1,
  grandchild_2, ...) plus affirm_catch, benign_(category), recap_(tell), shield_earned,
  walkthrough_intro. Every variant of a line event expresses the same tell.
- content/call-structure.json: not a bank. scripts[]: id, family, callerName, callerNumber
  (fictional patterns only), lines[] of {event, tell|null, benign category}, slot pools.
- qa/smoke.mjs (Milestone A), qa/dod.mjs (Milestone B): Playwright against the real UI.

Round build: pick a script whose family is not in state.recentFamilies (last 2), roll slot
values with makeRng(Date.now() ^ roundsPlayed), then aiGenerate per line at answer time so
taps reveal instantly. Bank picks vary per event with no immediate repeats via shared/ai.js.

State ns "scam-dojo": { streak, roundsPlayed, recentFamilies }. Streak equals shields
earned and increments once per completed round on either path.

Tell model, 8 types: urgency, secrecy, unusual_payment, no_callback, too_good,
detail_fishing, penalty_threat, official_transfer. Caught label per tell is static UI text;
the explanation routes through aiGenerate recap_(tell).

## UX decisions

- Home: shield mark, streak count, one filled primary button "Answer today's call", quiet
  hub link as btn-plain. The single obvious action is the instruction.
- Ring: full screen, fictional caller name and number, soft pulsing rings guarded behind
  prefers-reduced-motion, single Answer button in garden green (AAA both directions).
- Call: scammer bubbles appear one per tap of a big Listen control, never on a clock.
  Bubbles are real buttons, 64px or larger. Tell tap: warm highlight plus affirm line.
  Benign tap: gentle explanation, no penalty. After the last line: Hang up as the filled
  primary, Do what they say as plain secondary; hierarchy nudges the safe action.
- Recap: every tell listed, caught versus slipped past framed kindly, shield ceremony
  under 300ms, streak up by one on both paths. Comply path inserts a kind walkthrough
  first, then the same recap.

## Milestones

- A, playable core: 3 scripts (grandchild, bank, parcel families), full loop home to recap,
  smoke QA, inspector clean, commit. One Opus coder.
- B1: content to 9 scripts across 8 families plus remaining recap banks (JSON only).
- B2: comply walkthrough depth, ceremony feel, benign category coverage (js and css).
  B1 and B2 run parallel, disjoint files. B3 after: full DoD QA suite plus fixes.
  README.md written by the orchestrator from verified state. Commit at each step.

## Verification (orchestrator repeats independently, never takes a coder's word)

- PORT=4183 node server.js, then node tools/qa/inspect.mjs --url
  http://localhost:4183/scam-dojo --name sd-(milestone); read the PNG personally.
- QA scripts assert: three consecutive rounds with pairwise different families and
  different transcripts, benign tap gets a gentle response with no penalty, streak
  survives a reload, home shows exactly one filled primary action, content JSON contains
  no real institution names (word boundary grep, case sensitive for acronyms).

## Decisions log

1. Streak is shields per completed round, no daily gating: the definition of done demands
   three consecutive rounds tonight.
2. Hang up is the filled primary, comply the plain secondary: pedagogy over symmetry.
3. Answer button borrows the garden green accent: phone convention, ratios documented.
4. A quiet hub link is allowed on home; the zero-instruction check counts filled buttons.
5. No audio in v0: the visual pulse carries the ring. Cut for scope.
6. Script lines are per line bank events so multi line calls flow through aiGenerate with
   per line variants; tell metadata lives in call-structure.json, which is not a bank.
7. Line events carry 3 or more variants (below the bank guideline of 4 to 8) to keep the
   writing load sane tonight; affirm, benign, recap and shield events carry 4 or more.
