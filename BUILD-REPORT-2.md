# BUILD REPORT 2: the overnight run

Session start: 2026-07-31, late night. Dewa asleep, unattended per GOAL.md.
This file is the truth about what happened: every autonomous decision, what is
real versus canned, verification evidence, and the full Higgsfield ledger.
Updated as the run progresses, newest sections appended per phase.

## Run status

- Phase 0 (scaffold, schemas, seam, recon): done, committed 1d4138b
- Phase 1a (content banks): done, committed 1229bf7. Three banks written by a
  5-writer 3-reviewer workflow, bottom third cut (23 of 88 gardener lines died,
  48 of 144 chips died, 3 of 9 dishes died), lint-clean including slot-degrade
  simulation against the real shared/ai.js tidy logic. The linter itself was
  adversarially verified against 44 mutated-bank cases before its pass was
  believed. plant-traits.json landed from the composer coder and passes too.
- Phase 1b (core slice U1 U2 U4 U8): M2 gate green. U8 shell and U1
  memory-to-plant complete end to end, U4 mechanics in (full day-cycle UI
  verification deferred to M4 as planned), U2 gardener is M3. Verified three
  ways: coder suites (36 + 57 + 54 + 24 + 29 checks, all green), the
  orchestrator's own fresh runs, and the conductor driving the loop by hand in
  a real browser at 390x844 (garden, picker with final art, three prompts,
  ceremony with composed story line, sprout planted with welcome ring). One
  defect found by the orchestrator's eyeball pass (panel occlusion under the
  sticky foot) and fixed in one iteration with a More-below cue. Composer
  determinism proven across cold processes; wilt contrast enforced in code.
  M3 and M4 followed and are gate-green: Auntie Bee live with six verified
  event reactions, expression art per event, honorific name capture with a
  no-penalty skip, and qa/days.mjs proving the full day cycle through the QA
  clock (growth per distinct watered day, wilt at two dry days, total
  recovery, absence classification, month-boundary arithmetic). One real
  defect caught by the day suite (screen-reader stammer on fresh plots),
  fixed as a shared constant. The puzzle engine (js/puzzle.js) is written and
  node-proven with 97 assertions, deliberately unwired until stretch two.
  Verified by my own fresh days.mjs run and a first-hand look at the live
  gardener greeting.
- Phase 1c (style lock): done, candidate B locked (see decision 11)
- Phase 2 (U5 U6 U7, bulk art): done. Art half committed early (batches one
  and two). Code half gate-green: coins with a fixed 6-coin puzzle payout,
  seed shop at 4/8/12 with a daily free common and the rare shelf opening at
  streak 3 (rungs 7 and 14 coded, one rare crop tonight, team tuning knob),
  streaks pausing never resetting, guided placement, crop lifecycle to
  harvest and basket, meal cards unlocking by consuming exact crop sets with
  the celebrate face, lossless v1-to-v2 save migration. Suites: economy 33,
  days 26, core 29, composer-check, all run by coders, the orchestrator, and
  the conductor independently. Zero app defects in the stretch-two wave.
  Notable engineering: the mahjong lift's 600ms miss timer was replaced by
  player-paced next-tap flipping so the game contains no timers at all;
  the shim-deletion was proven visually void with a zero-pixel diff.
- Phase 3 (U3, share card, PWA, audio): done, gate-green. Photo quest with the
  honest canned classifier ("I think it looks like a Bougainvillea. Am I
  right?"), both correction paths, fixed 3-coin plus chosen-seed reward into
  guided placement, one walk per day, and privacy hard-proven (nothing
  image-derived ever touches state or DOM; grep and runtime both). Share card:
  1080x1350 canvas photograph of the real garden, layout asserted for counts
  1 through 12, dated download with share-sheet where platforms offer it. PWA
  manifest valid with both icons; service worker deliberately skipped. Audio:
  four sine cues, context built only on the first unmuted gesture (proven
  causally), big persisted mute toggle. SPEC's 15-second photo done-when
  measures under 2 seconds. Suite stack now 118 checks across four suites,
  all green under coders, orchestrator, and conductor independently.
- Phase 4 (adversaries, done-check, handoff): not started

## Higgsfield ledger

Account at run start: 1384.16 credits, Ultra plan. Hard cap for this run: 300
credits (GOAL.md). Balance and per-model costs verified before any generation,
per the RULES.md paid-generation protocol.

Per-image costs, verified via get_cost preflight (zero-cost calls):

| Model | Config | Credits per image |
|---|---|---|
| recraft_v4_1 | standard, 1k, 3:4 | 1.25 |
| nano_banana_pro | 1k, 3:4 | 2.00 |
| nano_banana_pro | 2k, 3:4 | 2.00 |
| z_image | 3:4 | 0.15 |

Asset plan sized against real numbers (SPEC split: about 15 percent style, 65
percent bulk, 20 percent reserve):

| Batch | Count | Model | Est. credits |
|---|---|---|---|
| Style candidates | 4 | nano_banana_pro 2k | 8 |
| Gardener expressions | 6 | nano_banana_pro 2k, style ref | 12 |
| Heritage objects | 8 | nano_banana_pro 2k, style ref | 16 |
| Backgrounds | 2 | nano_banana_pro 2k, style ref | 4 |
| Meal cards | 6 | nano_banana_pro 2k, style ref | 12 |
| UI props and icons | 10 | recraft_v4_1 1k, palette-pinned | 12.5 |
| App icon | 1 | recraft_v4_1 1k | 1.25 |
| Retry allowance (1 per asset max) | ~33 | mixed | ~33 |
| remove_background cutouts | as needed | dedicated tool | unknown, logged per call |

Planned total roughly 100 to 130 credits against the 300 cap, reserve intact.
The cap is a ceiling, not a target; generation stops at 300 regardless.

Ledger of actual calls (appended live; total checked against balance delta at
run end):

| # | What | Model | Credits | Kept |
|---|---|---|---|---|
| - | get_cost preflights x4 | - | 0 | - |
| 1 | Style candidate A, storybook watercolor | nano_banana_pro 2k | 2 | yes, art/style/candidate-a.png |
| 2 | Style candidate B, 1970s SG poster halftone | nano_banana_pro 2k | 2 | yes, art/style/candidate-b.png |
| 3 | Style candidate C, soft gouache picture book | nano_banana_pro 2k | 2 | yes, art/style/candidate-c.png |
| 4 | Style candidate D, peranakan decorative flat | nano_banana_pro 2k | 2 | yes, art/style/candidate-d.png |

| 5 | Auntie Bee anchor portrait | nano_banana_pro 2k, ref B | 2 | kept |
| 6-13 | Heritage objects x8 (kopitiam-cup, setron-tv, sewing-machine, kampung-house, rediffusion-set, provision-shop, dragon-playground, tingkat) | nano_banana_pro 2k, ref B | 16 | kept |
| 14-15 | Backgrounds day + dusk | nano_banana_pro 2k 9:16, ref B | 4 | kept |
| 16-22 | UI props x6 (coin, seed-packet, watering-can, speaker, shop, sprout) + app icon | recraft_v4_1 vector 1k | 8.75 | kept |
| 23-26 | UI props x4 (basket, camera, trophy, share), retried after 429 | recraft_v4_1 vector 1k | 5 | kept |

| 27-32 | Auntie Bee expressions x6 (welcome, happy, thinking, watering, concerned, celebrate) | nano_banana_pro 2k, ref anchor | 12 | kept |
| 33 | rediffusion-set retry (v1 had photographic blur bleed in lower third) | nano_banana_pro 2k, ref B | 2 | kept |
| 34 | dragon-playground retry (v1 drew a living creature, not the playground structure) | nano_banana_pro 2k, ref B | 2 | kept |

| 35-40 | Meal illustrations x6 (sambal-kangkung, bayam-soup, chap-chye, nasi-lemak, mee-goreng, sambal-sweet-potato-leaves) | nano_banana_pro 2k, ref B | 12 | kept |

## Ledger close, checked against the account (RULES protocol)

Balance at run start 1384.16, at ledger close 1229.46: account delta 154.70.
Reconciliation against the transaction log:

- This run's actual spend: 85.50 credits. 29 nano_banana_pro images at 2.00
  exactly as preflighted (58.00), 11 recraft_v4_1 at 2.50 each (27.50). The
  recraft get_cost preflight quoted 1.25 but every actual charge was 2.50;
  the ledger lines above carry the preflight figure, this close carries the
  truth. 85.50 of the 300 cap, 28 percent.
- NOT this run: 69.20 credits of concurrent account activity between 01:55
  and 02:28 SGT: 14 nano_banana_pro images of a pixel-art cloud mascot
  ("[SUBJECT LOCK] A squat chunky pixel-art mascot: fluffy cloud-shaped
  royal-blue head..."), 4 Kling 3.0 Turbo videos at 10.00 each, and 3
  Bytedance video upscales at 0.40. Subject, style, and models are alien to
  this project; no seat of this run had video authorization (images only);
  the timestamps overlap this run but nothing in any seat brief or report
  touches Higgsfield. This looks like another session or automation on the
  same account. Dewa: check your other running sessions or scheduled tasks;
  the generations are in your Higgsfield history around those timestamps.

The arithmetic closes exactly: 85.50 + 69.20 = 154.70 = the account delta.

Running total: 71.75 of 300 at preflight prices, 85.50 actual. First 429
attempts were rejected before start and cost
nothing. Review outcomes so far: anchor, 7 of 8 objects, both backgrounds, all 10
prop SVGs and the icon SVG accepted on first take; tingkat kept with a minor soft
base fade (not a clear failure, no retry spent); recraft vector output turned out
to be real SVG files, so UI props ship as transparent SVGs (background rect
stripped mechanically) instead of PNGs needing remove_background, which saves
those credits entirely. Meal batch: all six kept on first take (minor edge
smudges on sambal-kangkung and mee-goreng, invisible at card size). Dragon
playground v2 kept with haze around the head; correct structure beat the crisp
but wrong v1, and its retry budget is spent. The planned asset catalog is now
fully generated: no further generation is planned; anything from here spends
reserve only. Full-resolution originals live in the Higgsfield account under
the job ids in this ledger; the repo carries game-sized downscales.

## Decision log

Every fork decided autonomously, with reasoning, for team review.

1. **Model choice for art.** nano_banana_pro (2 credits, image-to-image style
   referencing, strongest quality) for everything painterly; recraft_v4_1
   (1.25 credits, hard palette pinning, vector-ish) for UI props and the app
   icon; z_image only if volume experiments are ever needed. Soul models
   rejected: photoreal bias, wrong for a storybook game.
2. **Auntie Bee.** The gardener needed a fixed identity before content and art
   could run in parallel: one name, one face. Chosen: Auntie Bee, sixties,
   warm, plant-mad, never preachy. Pure working identity, trivially renamed by
   the team; all lines live in one bank file.
3. **Trait vocabulary fixed at Phase 0.** Chips carry axis tags
   (bloom/ornament/palette from closed sets, defined in content/SCHEMAS.md) so
   the content workflow and the composer coder could start simultaneously
   against one contract. Prompt axes fixed as who/where/feeling per object with
   free wording, which keeps the composer mapping deterministic and the retell
   line grammatical.
4. **Crops are separate from memory species.** SPEC U7 harvest sets cannot be
   grown from memory plants (nobody harvests a kopi vine into bayam soup), so
   the schema splits memory species (from stories) and 10 food crops (from the
   shop and photo quests). Meal cards reference crops only. This resolves a
   real v0.3 ambiguity; logged for team review.
5. **story_retell as an 11th gardener event key.** RULES requires every AI beat
   to route through shared/ai.js; the U1 retelling line is such a beat. Added
   to the bank schema beyond SPEC's 10 keys (counts are minimums, schema is
   mine to define).
6. **plant-traits.json produced by the U1 coder,** not the content workflow.
   Species design and visual parameters move together; a text agent writing
   SVG tuning data blind would produce garbage. The other three banks stay
   with the content workflow.
7. **aiClassifyPhoto seam added to shared/ai.js** (conductor-owned change):
   canned classifier over a closed 8-plant Singapore set, seeded, non-repeating,
   confidence 0.6 so the UI can honestly ask "am I right?" with a correction
   picker. SWAP POINT documented for the CodeBuddy vision call.
8. **meetings/ committed into the repo.** CONTEXT.md references
   meetings/29jul/* as the repo copies; leaving them untracked contradicts the
   capsule. 4.1 MB, one-time cost, .DS_Store excluded by .gitignore.
9. **Agents never run git.** The conductor owns every commit so the repo state
   stays coherent under parallel agents. Written into every brief.
10. **QA clock contract.** All date reads go through one overridable state
    function (localStorage `ctrlai:garden-of-life:qa-clock`) so Playwright QA
    can simulate day changes for streak verification, per GOAL done-check 4.
11. **Art style locked: candidate B, 1970s Singapore poster.** Four candidates
    generated (art/style/candidate-a.png through d), judged by a three-lens
    Fable panel. Votes: senior legibility B 9/10 (bold outlines and wide value
    jumps survive 80 to 160 px), product warmth B 9/10 (breeze blocks and
    golden light are the exact 1970s a 70 year old was young in; nostalgic AND
    alive, zero cuteness; also the most memorable in a deck), production
    repeatability D 9/10 over B 6/10 (halftone drift, moire on downscale, aged
    cast bleeding into cutouts). Locked B on the 2-of-3 vote and folded D's
    production hygiene into the master scaffold as mitigation: flat fills,
    crisp contours, halftone only in large background areas, plain cream
    backgrounds on cutout assets, no aged cast on subjects. Scaffold and
    character sheet notes in art/style/LOCKED.md. Candidate C rejected for
    infantilizing register (the panel's words: draws the player as a storybook
    grandma for grandchildren), A for elegiac fading and near-zero figure
    ground separation at small sizes. Team can re-judge with all four PNGs in
    the repo.

## What is real and what is canned (running list)

- Plant composition from answers: real procedural generation (lifted composer,
  extended). No model call.
- Gardener lines: real template banks through the aiGenerate seam;
  live-generation upgrade is a SWAP POINT body rewrite.
- Photo identification: canned classifier behind the aiClassifyPhoto seam,
  honest in the UI about guessing; live vision is the same seam's SWAP POINT.
- Economy, streaks, puzzle, meals: fully deterministic game logic, no AI
  claimed, no randomness in rewards.

## Verification evidence

Appended per milestone as QA runs land.
