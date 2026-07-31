# Core slice plan: U8, U1, U2, U4 (M1 and M2 this session)

Written by the core slice orchestrator. Binding for every coder on this slice.
Read SPEC.md, RULES.md, and content/SCHEMAS.md before touching anything; this
plan implements them and never overrides them.

## Mission

A first-time player at 390x844 completes with zero instructions: greeting,
tell a memory (heritage object then three tap prompts), watch the plant appear
and get planted, water it, replay its story by tapping it, reload and find
everything remembered. Two runs with different answers produce visibly
different plants.

Milestones: M1 shell runs and persists. M2 the full U1 flow end to end with QA
green. The session stops after M2; M3 (gardener events) and M4 (tending,
growth, wilt, QA clock simulation) continue afterwards on this same plan.

## Hard rules (repeated because they are cheap to repeat and expensive to miss)

- No console.log anywhere in game js. No emojis in code. No em dashes in any
  output, including comments and UI copy.
- No Math.random in game logic. All variation goes through makeRng from
  shared/ai.js with explicit seeds.
- QA clock: every date read goes through state.js todayISO(). No Date.now()
  or new Date() anywhere outside that one function in state.js. UI timing
  guards (stale tap) use performance.now(), which is not a date.
- Senior UX floor: tap targets 64px or larger (use --tap-min), body text 28px
  or larger, contrast per shared/ui/tokens.css, tap-only progression, no
  timers, no fail states, no shame language ever, wilt included.
- ES modules, plain browser JS, no build step. Runs from node server.js at
  /garden-of-life. Import shared/ via relative paths (../../../shared/).
- State lives in localStorage namespace "garden-of-life" through
  shared/storage.js only. One namespace, one document.
- The three content banks (memory-prompts.json, gardener-lines.json,
  meal-cards.json) are written by a parallel workflow. Game code fetches them
  at runtime and NEVER crashes when they are missing: calm waiting state,
  aiGenerate falls back neutrally. No coder on this slice writes those three
  files. plant-traits.json IS ours (coder A).
- Art may not exist yet. Every art reference follows the SCHEMAS.md fallback
  contract: missing PNG never breaks layout or flow.
- Match the house idiom from games/memory-garden/: defensive input handling,
  stale tap guard, comments that explain constraints not narration, JSDoc on
  exports, replaceChildren rendering, focus moves on view change.

## File ownership (disjoint, no exceptions)

| Coder | Files |
|---|---|
| A (composer) | js/composer.js, content/plant-traits.json, qa/composer-check.mjs |
| B (shell, state, garden) | index.html, css/garden.css, js/state.js, js/main.js, js/garden-view.js |
| C (memory flow) | js/memory-flow.js |
| D (gardener, M3, not this wave) | js/gardener.js |
| E (QA) | qa/core.mjs, qa/fixtures/memory-prompts.fixture.json, qa/fixtures/gardener-lines.fixture.json |

All paths relative to games/garden-of-life/. Nobody touches shared/ or any
file outside games/garden-of-life/. Nobody commits.

## Sequencing

- Wave 1, parallel: A (composer, traits, determinism check) and B at M1 scope
  (shell, state, empty garden, navigation, persistence). B does not import
  composer.js in wave 1; garden-view renders empty plots only.
- Orchestrator M1 gate: drive the shell at 390x844, run composer-check.
- Wave 2, parallel: C (memory flow) and B continued (garden-view integrates
  composer: filled plots, plant panel, watering).
- Wave 3: E writes qa/core.mjs. Orchestrator runs it fresh, drives ad hoc
  checks, feeds the fix loop. M2 gate: qa/core.mjs green.

## State shape (binding, owned by state.js)

```json
{
  "version": 1,
  "player": {
    "name": "",
    "honorific": "",
    "visitCount": 0,
    "lastVisitDay": "",
    "prevVisitDay": "",
    "lastPlantId": "",
    "memoryHint": ""
  },
  "nextPlantId": 1,
  "plants": [
    {
      "id": "gol-1",
      "kind": "memory",
      "plantedDay": "2026-07-31",
      "objectId": "kopitiam-cup",
      "answers": { "who": "<chip-id>", "where": "<chip-id>", "feeling": "<chip-id>" },
      "phrases": { "object": "the kopitiam cup", "who": "with my mother", "where": "at the kopitiam downstairs", "feeling": "warm and cosy" },
      "tags": { "palette": "warm", "bloom": "one-big", "ornament": "kopitiam" },
      "freeText": "",
      "seed": 123456789,
      "wateredDays": []
    }
  ]
}
```

Notes that carry design weight:

- Phrases are captured at planting time so a saved story replays word for word
  even if the bank is edited or missing later.
- Tags are the resolved trait values (closed sets from SCHEMAS.md), extracted
  from chips at answer time. The composer never sees chip ids.
- stage and wilt are computed, never stored: stage = min(2, wateredDays.length),
  wilted = 2 or more whole days since the latest of plantedDay and the last
  watered day. Reload therefore always agrees with the calendar.
- Plant ids come from the persisted nextPlantId counter. No clock, no random,
  no collisions.
- kind reserves "crop" for the economy phase. This slice only writes "memory".

## Module interfaces (binding)

### js/state.js (coder B)

The only file that reads or writes the namespace, and the only file with a
date call.

- `initState()` load, validate (filter malformed plants like memory-garden's
  isPlant), migrate, return state. Called once by main.js.
- `getState()` the singleton.
- `saveNow()` persist through shared/storage.js saveState.
- `todayISO()` returns "YYYY-MM-DD". Honours the override at localStorage key
  `ctrlai:garden-of-life:qa-clock` (read directly with try catch; accept a
  plain ISO string or a JSON-quoted one; validate with /^\d{4}-\d{2}-\d{2}/).
  The single new Date() in the codebase lives here for the no-override path.
- `daysBetween(isoA, isoB)` whole calendar days, UTC parse, order-safe.
- `recordVisit()` classify BEFORE mutating: returns
  `{ kind: "first_visit" | "return_visit" | "return_after_absence", daysAway }`
  (absence means daysAway >= 2), then updates prevVisitDay, lastVisitDay,
  visitCount, persists. Called once per load by main.js; the result is kept in
  memory for the gardener (M3).
- `addPlant({objectId, answers, phrases, tags, freeText, seed})` assigns id and
  plantedDay, pushes, persists, returns the plant.
- `recordPlanting(plant)` sets player.lastPlantId and player.memoryHint
  (object phrase plus who phrase, readable mid-sentence), persists.
- `getPlants()`, `findPlant(id)`.
- `plantStage(plant)` 0, 1 or 2 as above.
- `isWilted(plant)` as above. Never true on the planting day.
- `waterPlant(id)` waters for todayISO(). Returns
  `{ alreadyToday, advanced, recovered, stage }`. Persists. Watering twice on
  one day is answered kindly by the UI, never scolded.
- `getPlayer()`, `setPlayerName(name, honorific)` (used by D in M3).

### js/composer.js (coder A)

Adapted from games/memory-garden/js/composer.js. Keep the deterministic seeded
architecture, the layer structure (pot, stem, leaves, blooms, ornament as
outer-transform inner-animatable groups), and the visual language. Selection
data moves to content/plant-traits.json; builder functions stay code.

- `loadTraits(data)` inject the parsed plant-traits.json. Module keeps a null
  default; every compose call before loadTraits, or with unusable data,
  returns a neutral built-in sprout svg rather than throwing. Nothing throws.
- `composePlant({ objectId, tags: {palette, bloom, ornament}, stage, wilted, seed })`
  -> `{ svg, signature, seed, traits }`.
  - objectId from the closed 8-object set resolves species via
    species_by_object. Unknown values fall back to defaults from the traits
    file. tags are closed-set trait values, not chip ids.
  - stage 0, 1 or 2 (default 2) consumes the per-stage data
    (scale, blooms on or off, ornament on or off, sprout form). Stage 0 with
    sprout true renders a young sprout form tinted by the palette.
  - wilted (default false) renders the wilt state: visible droop or
    desaturation, readable at plot size, never below the non-text contrast
    floor on --color-surface-sunk, no shame iconography of any kind.
  - seed optional; default is hashString of objectId|palette|bloom|ornament so
    the same memory regrows identically forever.
  - signature is species|palette|bloom|ornament, stage-independent identity.
  - svg root carries data-species, data-palette, data-bloom, data-ornament,
    data-stage, data-wilted, data-seed, and an aria-label naming species,
    palette and growth state. QA reads these.
  - The svg string must be byte-identical for identical input. Documented in
    one JSDoc block on the export.
- `composeCrop({ cropId, stage, wilted })` same return shape, 4 simpler
  archetype builders (leafy, fruiting, climbing, herb) parameterized per crop
  from the traits file. Built now, consumed by the economy phase.
- FOUR NEW species builders for kampung-house, rediffusion-set,
  provision-shop, dragon-playground, matching the existing builders' quality:
  distinct silhouette at plot size, stem plus leaves plus at least 8 bloom
  anchors plus lean, ornament anchor entry per species. Read at least three
  existing builders first. Lifted species for the returning objects
  (kopi-vine, thread-orchid, stacked-bamboo, sunburst-bloom) keep their look.

### content/plant-traits.json (coder A)

To the SCHEMAS.md schema exactly: species_by_object for all 8 objects, 8
memory species with 3 stages each, all 5 palettes (start from memory-garden's
hexes, they hold the contrast contract), all 5 blooms (one-big, pair, trio,
cluster, many), all 5 ornaments, all 10 crops with archetype and price_tier,
defaults block.

### qa/composer-check.mjs (coder A)

Standalone node script, no browser. Checks: identical input twice gives
byte-identical svg for every objectId at every stage and wilt state; all 8
species render with no NaN or undefined in the markup; distinct objects give
distinct signatures; all 10 crops render at 3 stages; traits file parses and
covers every closed-set id. Also writes qa/contact-sheet.html showing every
species at 3 stages plus wilt, and every crop, so a human can eyeball quality.
Exit nonzero on any failure.

### js/garden-view.js (coder B)

- `initGardenView({ views, storyFor })` binds listeners (delegated, stale-tap
  guarded).
- `renderGarden()` renders the plot grid from state: 12 plots, 3 columns,
  grid grows by full rows of 3 when plants exceed 11. Filled plots render
  composePlant at the plant's computed stage and wilt; empty plots render the
  soil mound and start the memory flow on tap. A just-planted plot gets the
  one-render welcome ring (lift memory-garden's plot-new pattern).
- Plant panel (overlay dialog, ids below): tapping a filled plot opens it with
  the plant large at current stage, the three phrase chips, the story line
  from storyFor(plant) (aria-live), the grandchild's line when present, a
  Water button and a Close button. Water calls state.waterPlant, re-renders
  the panel plant at the new stage, and answers in the note element: watered
  (it will grow), already watered today (kind, no scolding), recovered (it
  perked up because you came back). Focus is trapped like memory-garden's
  replay overlay; Escape and backdrop close.

### js/memory-flow.js (coder C)

- `initMemoryFlow({ prompts, views, onPlanted })`. prompts is the parsed
  memory-prompts.json or null when it has not landed.
- Object picker: renders the 8 objects from the bank. Art img src
  /games/garden-of-life/art/objects/<id>.png with onerror hiding the img; the
  card always carries the label and stays a warm colour block without art.
  With prompts null, the picker region shows one calm line (Auntie Bee is
  still setting up her table, come back in a moment) and a back button, and
  nothing crashes.
- Three prompts per object in bank order (axis who, where, feeling), 4 chips
  each, chip select pattern and the not-yet Next button lifted from
  memory-garden (aria-disabled true stays tappable and answers with a nudge).
  The free text field appears only on the prompt whose bank entry carries
  free_text true, framed as the grandchild helping, optional always.
- Tag extraction at answer time: first tag with the axis prefix
  (who takes bloom:, where takes ornament:, feeling takes palette:), value
  after the colon. Missing or malformed tags pass undefined and the composer
  defaults absorb it.
- Ceremony: composePlant at stage 2 full bloom on the ceremony stage with the
  layered grow animation classes, retell line from storyFor, done button
  plants it: addPlant (seed from the composer result), recordPlanting,
  onPlanted(plant), views.show garden.
- `storyFor(plant)` -> Promise resolving the story line: aiGenerate with game
  garden-of-life, event story_retell, context { object_phrase, who_phrase,
  where_phrase, feeling_phrase from plant.phrases, plant: species label from
  the composer traits, name: player name when set, seed: plant.seed }. The
  seed is the plant's, so a story reads identically every time it is told.
  Exported; garden-view imports it for the panel.
- Free text value is stored trimmed, max 120 chars, never parsed, cleared
  when switching objects.

### js/main.js (coder B)

Boot and glue, nothing else: fetch content (memory-prompts.json,
gardener-lines.json, plant-traits.json) with cache no-store inside try catch;
loadTraits; provisional registerBank of every gardener-lines event's text
array in file order under game garden-of-life (moves into gardener.js in M3
per the SCHEMAS consumption contract; logged); initState; recordVisit (result
kept for M3); initMemoryFlow; initGardenView; renderGarden; show garden.
Owns showView (hidden toggling plus heading focus, memory-garden pattern) and
the stale tap guard on performance.now(). Per-load line freshness salt, where
needed, seeds from hashString(String(performance.timeOrigin) + ':' +
String(performance.now())), never Date or Math.random.

### index.html and css/garden.css (coder B)

Full static skeleton in wave 1 so later waves never touch these files.
Sections and ids, binding:

- #view-garden: h1 #garden-heading (text: Garden of Life), gardener skeleton
  for M3 (#gardener with img slot #gardener-art, .card bubble #gardener-line,
  #gardener-replies row, #gardener-name-form hidden with #honorific-chips,
  #gardener-name-input, #gardener-name-save), #plots grid, #tell-memory
  primary button, back-to-hub link.
- #view-picker: #picker-heading, #picker-wait (calm line, hidden when bank
  present), #objects grid, back button data-back="garden".
- #view-prompt: #prompt-step, #prompt-heading, #prompt-chips, #prompt-next
  (aria-disabled pattern), #prompt-nudge, #freetext-field hidden with
  #freetext textarea, #prompt-back.
- #view-ceremony: #ceremony-heading, #ceremony-line (aria-live),
  #ceremony-stage, #ceremony-done. Ceremony copy must set the expectation
  that the garden plants it young and watering grows it (one warm line, UI
  copy, no bank dependency).
- #view-plant overlay (role dialog, aria-modal): #plant-title, #plant-stage,
  #plant-chips, #plant-story (aria-live), #plant-told hidden with
  #plant-freetext, #plant-water-note (aria-live), #plant-water button,
  #plant-close button.
- Head: tokens.css, base.css, garden.css, accent set to the garden pair.
  Title Garden of Life. Background: css gradient always painted, optional
  art/backgrounds/day.png layered above it so a missing file changes nothing.
- garden.css lifts memory-garden's plot, object card, chip, stage, ceremony
  animation, overlay and not-yet button patterns onto the same class names,
  and adds .is-wilted and per-stage presentation hooks plus the plant panel.
  Every size from tokens. [hidden] display none important.

### qa/core.mjs and fixtures (coder E)

Pattern from games/memory-garden/qa/loop.mjs: playwright chromium, 390x844,
self-spawned node server.js on PORT 4195 (env GOL_PORT override), own the
port or refuse to run, piped server logs, check list summary, exit nonzero on
any failure.

Static checks first, no browser needed:

- No "console.log(" and no "Math.random(" in any js file under
  games/garden-of-life/js.
- "Date.now(" and "new Date(" appear in js/state.js only, at most twice, and
  in no other js file.

Bank strategy: if content/memory-prompts.json or gardener-lines.json is
absent on disk, intercept its URL with the schema-valid fixture from
qa/fixtures/ so the flow still drives the real UI code path. When the real
banks exist, no interception: assertions must be content-agnostic (counts,
positions, data attributes, non-empty text, never exact wording). Fixtures
are test apparatus, never product content, and the game never loads them
outside this harness.

Browser checks, fresh storage context:

1. First session: garden renders, empty plots visible, #tell-memory tap
   reaches the picker.
2. Full flow: pick object one, answer three prompts by tapping chips (assert
   4 chips per prompt, next gated until a pick), ceremony shows a plant svg
   and a non-empty story line, done lands in the garden with 1 filled plot at
   data-stage 0.
3. Panel: tap the plot, story line non-empty, svg present, close returns
   focus to the plot.
4. Reload: plot persists with identical data-species, data-palette,
   data-bloom, data-ornament and data-seed.
5. Second plant, different object and different chips: two filled plots,
   data-species differ, signatures differ.
6. Water: panel water tap produces a note and the plant re-renders at
   data-stage 1; a second tap the same day answers kindly (note changes, no
   stage jump); reload keeps stage 1.
7. Calm degrade: one context forcing 404 on memory-prompts.json; tapping
   tell a memory shows the calm wait line, no page errors, garden still
   navigable.
8. Floor spot check on every screen visited: all .btn, .chip and .plot
   bounding boxes at least 64px in the smaller dimension; no horizontal
   overflow (document.scrollingElement.scrollWidth <= 390).
9. Zero console errors, zero page errors. Failed requests: 404s for
   content/*.json and art/**.png are the tolerated absence contract; any
   other failure fails the run.

## Design decisions made autonomously (for the build report)

1. Plot grid: 12 plots, 3 columns, grows by rows of 3. Fits 390 wide above
   the tap floor with no horizontal scroll.
2. One panel unifies replay and watering: tapping a plant opens its panel
   where the story replays and the Water button lives. One affordance, zero
   instructions, no modes.
3. Ceremony shows the full-grown plant (the emotional payoff and the visible
   variation the rubric pays for); the garden then plants it as a stage 0
   sprout and the ceremony copy says watering grows it. Growth toward the
   plant you were shown is the return hook.
4. Growth model: stage equals distinct watered days capped at 2, so first
   watering visibly grows the sprout immediately. Wilt is computed from the
   calendar, recovery is total on watering, planting day never wilts.
5. Plant ids from a persisted counter, not clock or random.
6. Stale tap guard and load salt moved to performance.now() and
   performance.timeOrigin so the QA clock rule (one date function) holds with
   zero exceptions outside state.js.
7. Bank registration sits provisionally in main.js boot until gardener.js
   exists in M3, which then owns it per the SCHEMAS consumption contract.
8. QA uses schema-valid fixtures via route interception only while the real
   banks have not landed, so M2 is verifiable tonight and stays green when
   content arrives.
9. Phrases stored on the plant at planting time so replay never depends on
   the bank's future.
10. UI shows the name Garden of Life; the working-title qualifier stays in
    docs only.

## Risks

- Content banks may land mid-build with surprising shapes: fixtures and
  content-agnostic assertions contain this; lint-content.mjs (parallel
  workflow) owns bank validity.
- Four new species builders are the largest craft risk: composer-check's
  contact sheet plus orchestrator eyeball review gate them.
- Coder B carries the widest brief; wave 1 scope is deliberately M1-thin and
  wave 2 continues the same seat to keep ownership clean.

## M3 and M4 (next session, same contract)

M3: coder D builds js/gardener.js against the ids already in the skeleton:
bank registration moves in, greeting on load from the recordVisit result,
event lines with reply chips via meta.template_index, name capture with
honorific chips plus optional free text, planting and watering and wilt
comments, session memory from state.player. M4: day simulation through the
QA clock override, growth and wilt and recovery driven end to end in
qa/core.mjs, floor audit, fix loop, full green.
