# Stretch two review: U5 economy, U6 puzzle, U7 meals, gate record

Orchestrator's verification record at the stretch-two stop point. Companion to
stretch-plan.md; contracts there, evidence here.

## Verified by the orchestrator's own fresh runs

- qa/economy.mjs: ALL PASS, 33 checks, 15 screens. Migration from a v1 save
  with everything kept and the economy defaulted, deck-mirror fidelity,
  pay-exactly-6 twice with no variance, prices 4/8/12 on all ten cards, kind
  refusal taking nothing, free seed once a day proven three ways, a missed
  day pausing the streak without reset, the rare shelf opening at exactly
  streak 3, placement with cancel keeping the seed, crop growth to ripeness
  across simulated days, harvest with the happy face and a harvest-bank
  line, the set-completing harvest unlocking its dish with the celebrate
  face and meal_unlock line with that line's own reply chips, the cooked
  card surviving reload.
- qa/days.mjs ALL PASS 26, qa/core.mjs ALL PASS 29 (with the back-button tap
  scoped to the picker per conductor ruling), composer-check all green.
- Orchestrator eyeball walk, 25 checks ALL PASS with screenshots: coins
  pill, solved round paying 6 with garden agreement, shop with locks and the
  free-seed row, buy at 4 leaving 2, guided placement into a real plot, crop
  panel without story chips, harvest at stage 2 filling the basket, meals
  previews, and the v1 migration probe (plant, player, phrases, freeText
  intact; version 2 economy defaulted; old plant still renders).
- Screens reviewed by eye: puzzle board (one line of copy is the whole
  tutorial, no timer anywhere), seed shop, meals grid.

## Rulings and accepted designs on the record

- One rare crop exists tonight, so streak rungs 7 and 14 are correct code
  with no content behind them. Conductor ruling: stays as is; a team tuning
  knob, not a defect. Nobody touches plant-traits.json for it.
- Balance is intended-generous: two puzzle rounds cover the cheapest dish.
- The three new back buttons ship without data-back and the puzzle self
  binds per its published contract; restoring the attribute is optional
  cleanup later.
- Meal unlock beats harvest at the harvest moment, so the rarer line wins.
- Placement banner below the plots with a reveal scroll after heading focus;
  the water button goes quiet while harvest is showing; crops store cropId
  with objectId empty; spendCoins refuses malformed amounts.
- Shop derives the plant-it-now offer from seeds actually held and watches
  its own section visibility; meals cards degrade to warm colour and text
  when a dish PNG is missing.
- The puzzle shim is deleted with a pixel-level proof of zero visual change;
  garden.css owns tile styling through the class and data-state seam.

## Process note, logged honestly

One orchestrator routing error this stretch: the gardener expression-map
task first went to the composer seat, which correctly declined on ownership
grounds and returned a read-only diagnosis. The task was re-routed to the
gardener seat, which landed it with regression green. gardener.js kept
exactly one writer throughout.

## Known cosmetics carried forward

- fillSlots and tidy now have private copies in two QA suites with coupling
  comments; exporting them from shared/ai.js remains an optional cleanup.
- The plantless re-greet line and the node module-type warning stand as
  previously logged.
