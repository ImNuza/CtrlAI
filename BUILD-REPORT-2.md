# BUILD REPORT 2: the overnight run

Session start: 2026-07-31, late night. Dewa asleep, unattended per GOAL.md.
This file is the truth about what happened: every autonomous decision, what is
real versus canned, verification evidence, and the full Higgsfield ledger.
Updated as the run progresses, newest sections appended per phase.

## Run status

- Phase 0 (scaffold, schemas, seam, recon): in progress
- Phase 1a (content banks): not started
- Phase 1b (core slice U1 U2 U4 U8): not started
- Phase 1c (style lock): done, candidate B locked (see decision 11)
- Phase 2 (U5 U6 U7, bulk art): not started
- Phase 3 (U3, share card, PWA, audio): not started
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

Running total: 8 of 300.

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
