# Mahjong Kakis, build plan

Owner: Fable orchestrator (this file and README.md only). All code by Opus coders.

## Architecture

Files, all under games/mahjong-kakis/:

- index.html   game shell: portrait row, one fixed bubble slot, table, player bar
- style.css    kopitiam table, tiles, portraits, bubble, name screen, celebration
- tiles.js     tile catalog (dots 1-4, bamboo 1-4, winds), SVG faces, wall builder (seeded rng, tileCount + lookalike density in)
- kakis.js     three kakis (Auntie Lily encouraging, Uncle Beng cheeky, Auntie Rose gentle wisdom), portrait SVGs, banter scheduler (event affinity + rotation, one bubble at a time, auto dismiss about 4s, tap to dismiss)
- game.js      state machine: name screen, round, celebration; match logic; tap counting for nudges; difficulty dial; storage
- content/kaki-banter.json   flat bank, keys are event__kaki (round_start__lily etc), fetched then registerBank('mahjong-kakis', bank)
- qa/core.mjs, qa/memory.mjs   playwright scripts driving the real UI

State in storage ns "mahjong-kakis": { name, visits, roundsPlayed, totalMatches, bestClear, recent: [{matches, misses}] up to 3, dial: {tileCount, lookalike} }.

Banter events: round_start, match_found, near_miss, round_win (Milestone A), idle_nudge (taps since last match >= 6, never a clock), return_visit (Milestone B). Slots: {name} in A, {rounds} and {best} history slots in B.

Dial (B): avg miss rate of recent rounds; under 0.2 raises tileCount by 2 (cap 16) and lookalike by 0.25; over 0.45 lowers by 2 (floor 8). First ever round: 8 tiles, low lookalike. Never shown in UI.

Layout decision: one fixed bubble slot between portraits and table, pointer to the speaker. Bubbles never overlap tiles. Name chips start the game in a single tap (Ah Ma, Ah Gong, Auntie, Uncle, or type own name); returning players skip straight to the table.

QA hooks: every tile button carries data-tile (identity) and data-state; bubble carries data-event and data-kaki; celebration card has data-screen="win". Scripts assert via these, seed storage with addInitScript for the memory test.

## Milestones

A (core, one Opus coder, then verify + commit, then stop):
1. Shell + tiles + matching + celebration + name flow + storage of name and rounds.
2. Banter through shared/ai.js for round_start, match_found, near_miss, round_win, 3-4 lines per kaki per event, per-kaki voice.
3. qa/core.mjs: full round by tapping real pairs, distinct banter for 4 events captured, one-obvious-action check.
4. Orchestrator verification: inspector run, screenshot read, QA script run. Commit.

B (after conductor go-ahead):
1. Banks to 5-8 lines per key, idle_nudge, return_visit memory callback with {rounds}/{best}. qa/memory.mjs seeded-storage test. Commit.
2. Hidden dial wired to stored recent performance. Commit.
3. Table feel polish (clear animation, celebration warmth), README.md, final inspector + QA sweep. Commit.

Cut order if squeezed: polish first, then dial range (keep 8/12/16 steps), never the memory beat.

## Status (final)

All milestones reached, nothing cut. A core 92b686d, B1 memory beat 84f1fae, B2 hidden dial 64fdfc9, B3 polish 34404ee, README and this status in the final commit. Full verification evidence in BUILD-REPORT.md territory: three QA scripts green, inspector clean, screenshots reviewed by the orchestrator at 360/390/430.

## Fix round (adversarial QA)

All 6 SERIOUS fixed and verified: no-timer bubble with latched slot (zero layout drift measured), tile cap and compact height (16 tiles fit 360 to 430 at 844, row peek at 667), first_visit teaching event, seeded return-visit variety (4/3/4 templates per kaki over 12 visits), 11 doubled-name lines and 6 best-slot templates rewritten, player bar never ellipsises chip names. Commits b725be3, 852e2e2. Deferred: in-round resume (documented in README), tokens.css annotation (shared/ change request). New regression suite qa/stability.mjs, 8 classes.
