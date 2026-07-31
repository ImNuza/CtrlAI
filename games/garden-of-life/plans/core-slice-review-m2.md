# Core slice review: M1 and M2 gate record

Orchestrator's verification record for the U8 plus U1 slice, with U4 state
mechanics built and smoke-tested. Written at the M2 stop point. Companion to
core-slice-plan.md; the plan holds the contracts, this holds the evidence.

## What was verified, by the orchestrator's own runs

- games/garden-of-life/qa/composer-check.mjs: all 28 checks pass, run twice
  fresh. Determinism byte-identical across stages and wilt states, 8 distinct
  species, wilt contrast enforced at 3:1 or better, no shame marks.
- games/garden-of-life/qa/core.mjs: ALL PASS, 29 checks, run fresh twice
  (before and after the panel fix). Covers the statics (no console.log, no
  Math.random, date reads confined to state.js), the full first-session flow,
  panel replay, reload identity, two-plants-differ, story determinism,
  watering to stage 1, calm degrade with the prompts bank blocked, the 64px
  floor across 14 screens, no sideways scroll, zero console and page errors.
- Eyeball drive with screenshots at 390x844: picker with final art, prompt
  chips, ceremony full bloom with retell line and expectation copy, garden
  steady state with two visibly different plants at their stages, panel
  before and after watering.
- Worst case panel, driven through the real UI with seeded state and the QA
  clock override (stage 2 plant, seed 19 longest story line at 106 chars,
  grandchild line present): story fully readable, More below cue visible
  exactly while content overflows, gone at the bottom. The override also
  smoke-proves the M4 day-simulation path: two simulated watered days gave
  stage 2.
- Composer quality: contact sheet reviewed by eye. attap-fern, wire-lily,
  shelf-jade, dragon-tail read as their objects and stay distinct at plot
  size; wilt is droop and mute, never grey death or alarm.
- memory-flow.js reviewed by targeted read after its coder's report was
  delayed: storyFor contract met (memoized per load, seeded by the plant, so
  a story is told the same way every time), double-grow guard, free text
  capped and never parsed, ids regex-gated before entering img srcs.

## Fix loop

One defect found by the eyeball pass, one iteration, closed: panel content
slipped under the sticky button band once the plant grew tall, with no cue.
Fix on the B seat: panel plant at 120px (plot and ceremony keep the big
drawing) plus memory-garden's More below cue wired to open, story write,
water, and scroll. Re-verified by the coder's suites and by the
orchestrator's worst-case drive above.

## Open notes carried forward

- Gardener (U2) is M3: the skeleton ids, session memory, visit
  classification, and bank registration seam are ready and waiting.
- Full wilt and recovery through the UI across simulated days is M4 QA
  scope; mechanics are implemented and unit-smoke-tested.
- Some story_retell bank lines read clunky with certain phrase combinations
  (bank content, content workflow's domain, lint-clean): flagged, not a
  slice defect.
- qa/contact-sheet.html is a generated QA artifact; regenerate any time with
  composer-check.
