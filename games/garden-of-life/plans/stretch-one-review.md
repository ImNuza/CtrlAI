# Stretch one review: M3 gardener plus M4 day-cycle QA, gate record

Orchestrator's verification record at the stretch-one stop point. Companion to
stretch-plan.md.

## Verified by the orchestrator's own fresh runs

- qa/days.mjs: ALL PASS, 26 checks, 20 screens and 10 bubble states measured.
  Growth staging across simulated days, same-day no-advance, wilt at two dry
  days with a kind label, total recovery keeping stage, the July to August
  month boundary on screen and in daysBetween both directions, absence
  classification (3-day gap from return_after_absence, 1-day gap from
  return_visit, both membership-checked with filled slots), honorific plus
  typed-name save re-greeted by name, skip storing nothing, wilt-notice
  priority proven by suppression (a watering line provably not a wilt line
  while another plant stayed thirsty), welcome ring once, floor re-audit
  including the bubble at 28px and name controls at 64px, zero errors.
- qa/core.mjs: ALL PASS, 29 checks (regression).
- qa/composer-check.mjs: all checks passed (regression).
- Orchestrator M3 eyeball drive: 13 checks green with screenshots (greeting,
  name flow honorific-only, planting, watering, wilt beats, no guilt
  language), plus visual review of the live bubble with expression art.

## Fix loop this stretch

One real defect, found by qa/days.mjs, fixed on the owning seat, re-verified
green everywhere: the freshly planted plot's aria-label said "just planted"
twice. The phrase is now a single shared constant, so the label cannot
stammer again.

## Accepted deviations and their reasons

- initGardener gained a plant option (last-plant species label) so a return
  greeting can name your plant.
- Three written strings live outside the bank by design (continue chip, skip
  chip, skip line); QA membership checks exclude exactly those.
- The re-greet after a name save reuses the return_visit bank event rather
  than inventing an off-schema event.
- The puzzle engine replaced the mahjong lift's 600ms miss timer with a
  player-paced next-tap flip, so the slice contains no timers at all.
- qa/days.mjs carries private copies of fillSlots and tidy from shared/ai.js
  (not exported there), with a coupling comment at the copy.

## Known cosmetics, logged not fixed

- After a first-time name save with no plants, the return_visit re-greet can
  land on a template whose plant slot is empty and read "The pot was asking
  about you." Bank content is the conductor's domain.
- js/puzzle.js is complete and node-proven (97 engine assertions) but
  deliberately unwired: no html section, no imports. Its self-injected
  baseline stylesheet is a shim to delete when the real css lands in stretch
  two.
