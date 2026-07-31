# Stretch plan: M3 gardener, M4 day-cycle QA, then U5 U6 U7

Binding companion to core-slice-plan.md. Same hard rules, same state discipline
(state.js is the only namespace reader-writer, todayISO is the only clock),
same UX floor, same house idiom. Nobody commits. Content banks and art change
only through the conductor; qa/lint-content.mjs stays green.

Port registry: 4173 dev, 4191 memory-garden QA, 4195 core QA, 4196 days QA,
4193 economy QA, 4194 coder ad hoc, 4197 B-seat ad hoc, 4198 orchestrator,
4199 C/D/F/G ad hoc.

## File ownership this stretch

| Seat | Files |
|---|---|
| D | js/gardener.js |
| B | index.html, css/garden.css, js/state.js, js/main.js, js/garden-view.js |
| F | js/puzzle.js |
| G (stretch two) | js/shop.js, js/meals.js |
| E | qa/days.mjs (M4), qa/economy.mjs (stretch two) |

## M3: the gardener (D plus B wiring)

### js/gardener.js (D)

- `initGardener({ lines, views, visit })`. lines is parsed gardener-lines.json
  or null. Registers the bank per the SCHEMAS consumption contract (event text
  arrays in file order) and keeps the raw lines so replies resolve by
  meta.template_index. With lines null everything still works through
  aiGenerate's neutral fallback. visit is the recordVisit() classification
  main.js keeps from boot.
- `gardenerReact(event, context)` exported, async, never throws. Renders into
  the skeleton: line into #gardener-line (aria-live polite), expression image
  into #gardener-art (art/gardener/<expression>.png, onerror hides the img,
  bubble reads fine without it), reply chips into #gardener-replies from the
  matched line's replies (template_index from meta; index -1 or missing
  replies renders one warm continue chip). Reply taps are staleTap guarded and
  dismiss the replies row; they never open free text.
- Greeting on init by visit.kind: first_visit, return_visit, or
  return_after_absence. Context slots: name (composed honorific plus name,
  empty is a real answer), plant (species label of the last plant when one
  exists), memory_hint from state.getPlayer().
- Name capture on first_visit: the greeting's reply chips lead into
  #gardener-name-form: honorific chips (#honorific-chips: Auntie, Uncle,
  Ah Ma, Ah Gong), the optional text input framed as the grandchild's job, a
  save button, and a skip chip that closes the form warmly. setPlayerName
  stores it; the bubble re-greets using the name. Typing never required.
- Expression map, D documents it in a comment: welcome for greetings, happy
  for name saved and plant_comment, celebrate for planting, watering for
  watering, concerned for wilt_notice (concerned is care, never blame),
  thinking as the quiet default. anchor.png is the character sheet source and
  never shown.
- Reaction priority when moments collide, binding: boot always shows the
  visit greeting. wilt_notice fires at most once per load, only on a later
  return to the garden (after a panel close or ceremony) and only when no
  watering reaction claimed that same moment. Panel close priority:
  watering beats wilt_notice beats plant_comment.

### B wiring (B seat, own files only)

- main.js: remove registerGardenerLines (gardener.js owns registration now),
  call initGardener({ lines: content.gardenerLines, views, visit }) after
  initState and recordVisit. onPlanted glue adds
  gardenerReact('planting', { plant: species label }).
- garden-view.js: initGardenView gains onPanelClosed(plant, didWater); fire
  it when the plant panel closes. main.js glue: didWater true reacts
  'watering'; otherwise if any plant is wilted react 'wilt_notice' (once per
  load); otherwise optionally 'plant_comment' with the plant's label.
- css: whatever the bubble, expression image and name form still need; bubble
  region must not jump layout when the line changes (reserve height).

Done-when (SPEC): visible reactions to at least 4 distinct event types, and a
second visit triggers a callback to the previous session.

## M4: day-cycle QA (E seat, qa/days.mjs, port 4196, env GOL_DAYS_PORT)

Same harness discipline as core.mjs (own the port, piped server, check list,
nonzero exit). Simulate days by writing the qa-clock key and reloading.

1. Growth: fresh player, grow a plant through the UI, water today: stage 1.
   Clock +1 day, reload, water: stage 2. Same day double-water never advances.
2. Wilt and recovery: clock +3 days from last water, reload: plot carries
   is-wilted and data-wilted true, aria-label stays kind. Water: recovered,
   stage still 2, wilted false, note is glad not guilty.
3. Month boundary: run the wilt arithmetic across 2026-07-31 to 2026-08-02 so
   daysBetween proves itself on a real boundary.
4. Absence callback: seed lastVisitDay 2 or more days back with a memoryHint,
   reload, the greeting text must match one of the return_after_absence
   templates filled with the seeded context (load the bank from disk, fill
   slots, membership check). Also prove return_visit fires on a 1-day gap.
5. Gardener events visible: first_visit greeting on a fresh context
   (membership in first_visit templates), name capture (honorific tap plus
   save with typed name, and separately the skip path), planting reaction
   after a ceremony, watering reaction after a panel close with watering,
   wilt_notice per the priority rule. That is the SPEC done-when, proven.
6. Welcome ring: fresh plot wears plot-new once; after a panel open-close
   re-render it is gone.
7. Floor re-audit on every screen including the gardener bubble, replies and
   name form: 64px targets, 28px computed font floor, no sideways scroll.
8. Zero console and page errors; tolerated 404s only for content json, art
   and icons.

## Stretch two: U5 economy, U6 puzzle, U7 meals

Sequenced after the M3-M4 gate except js/puzzle.js, which is disjoint and
starts now. B-seat files change only in the stretch-two wave.

### Economy numbers (binding, zero randomness anywhere)

- Puzzle round pays exactly 6 coins. No variance, no bonus rolls.
- Seed prices by tier: common 4, uncommon 8, rare 12. Visible on every card.
  Guardrail satisfied by construction: one round (6) affords a common (4).
- One free common seed claimable per day (player picks the crop;
  freeSeed.lastClaimDay guards it).
- Streak: streak.days counts distinct visit days. A new day increments it; a
  gap never resets it (pause and resume, the forgiving reading, logged as a
  design decision). Uncommon tier needs no streak. Rare tier crops unlock in
  traits-file order at streak thresholds 3, 7, 14 (extras stay at 14), with
  the lock labelled kindly ("comes with your 7 day streak").
- Coins only. No second currency, no top-ups, no chance mechanics.

### State v2 (B seat)

Migration from v1 adds: coins 0, streak { days, lastCountedDay }, seeds map
by cropId, basket map by cropId, meals { unlocked: [] }, freeSeed
{ lastClaimDay }. New functions: addCoins, spendCoins (false when short,
never negative), recordPlayDay (streak rule above, called from recordVisit),
grantSeed, plantSeed(cropId) (adds plant kind crop, decrements seeds),
harvestCrop(plantId) (stage 2 only: basket increments, plot frees),
claimFreeSeed(cropId), mealUnlockCheck() (returns newly completable dishes
from meal-cards.json sets, consumes the exact crop set, appends to unlocked;
consuming the set is the logged design decision so each dish is an arc, and
the card itself is permanent).

### U6 js/puzzle.js (F, starts now)

- Lift the pair-matching core from games/mahjong-kakis (read tiles.js
  buildWall and TILE_SET and the game.js flow first; adapt the mechanism, not
  the skin). 8 pairs on a 4x4 grid sized for 390 (about 82px tiles, above the
  floor). Faces are garden motifs drawn as inline svg by F (leaf, bloom,
  chilli, watering can territory), token colours, readable at tile size.
- Tap-only and player-paced: a non-matching revealed pair flips back on the
  player's next tap, never on a timer. No countdown of any kind. A matched
  pair settles visibly. Round complete states the payout warmly and offers
  one more round or back to the garden; no rules text needed to start.
- Shuffle through makeRng only, seed hashString('puzzle:' + todayISO() +
  ':' + roundCounter). Randomness in layout is allowed, in rewards never.
- Contract: initPuzzle({ views, onRoundComplete }) rendering into the frozen
  ids: #puzzle-heading, #puzzle-coins, #puzzle-board, #puzzle-progress,
  #puzzle-line, #puzzle-again, #puzzle-back. The section html lands with the
  B seat in the stretch-two wave; the module queries ids lazily inside init
  so it loads clean before the section exists. onRoundComplete() carries no
  amount; the glue pays the fixed constant from state.
- F self-verifies the engine under node now (pure functions: deck build,
  reveal rules, match resolution, completion) and the DOM in the integration
  wave.

### U5 shop plus U7 meals (G, stretch-two wave)

- js/shop.js: initShop({ views }) into frozen ids #shop-heading, #shop-coins,
  #shop-free, #shop-grid, #shop-back. Seed cards render composeCrop stage 2
  art, name, price, tier lock state. Buying spends coins and grants the seed,
  then offers planting it now: that hands to garden-view's guided placement.
- js/meals.js: initMeals({ views }) into #meals-heading, #meals-grid,
  #meals-back. Unlocked cards show art/meals/<dish-id>.png with the fallback
  contract, name, benefit line. Locked cards are kind previews: dish name
  plus which crops it wants, so nothing is a dead end. celebrateMeals(dishes)
  exported for the glue to call after harvests unlock something; the gardener
  meal_unlock reaction is the glue's job, the card reveal is meals.js's.
- Guided seed placement (B seat, garden-view): after a purchase chooses
  plant now, the garden shows a banner naming the seed with a cancel button;
  the next empty-plot tap plants it and clears the mode; any view switch also
  clears it. No remembered modes, one guided moment.
- Garden additions (B seat): a coins pill and three quiet entry buttons
  (puzzle, shop, meals) under Tell a memory; crop plots water and harvest
  through the same panel pattern (harvest button appears at stage 2 with a
  glad line; harvesting frees the plot).
- main.js: fetch meal-cards.json alongside the other banks, wire initPuzzle,
  initShop, initMeals, the payout constant, mealUnlockCheck glue after
  harvests, gardenerReact meal_unlock.

### Stretch-two QA (E, qa/economy.mjs, port 4193)

Earn-spend loop through the real UI (round pays 6, buy common at 4, balance
2), guardrail asserted, two rounds pay identical coins (no variance), streak
simulation through the clock (3 and 7 unlock thresholds, gap pauses without
reset), free seed once per day, plant-grow-harvest a crop through staged
days, meal unlock end to end with the exact set consumed and the card
permanent, locked-card previews present, floor and zero-error policy as
always.

## Sequencing

1. Now, parallel: D (gardener.js), B seat (M3 wiring plus hooks), F
   (puzzle.js engine).
2. Orchestrator M3 gate: fresh core.mjs, gardener eyeball, fix loop.
3. E writes qa/days.mjs; orchestrator runs it; M4 gate; STOP, stretch one
   report, conductor commits.
4. Stretch two wave: B seat (state v2, sections, garden crops, wiring), G
   (shop, meals), F integration fixes if needed.
5. E writes qa/economy.mjs; orchestrator full gate (all suites fresh, eyeball,
   adversarial poke at the economy); STOP, stretch two report.
