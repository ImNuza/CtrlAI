# Memory Garden build plan

Orchestrator: Fable. Coders: Opus subagents. This file is the contract they build against.

## Flow

Garden view (plot grid, big "Grow a new memory" button) > object picker (6 SVG cards, 8 by Milestone B) > three prompt steps answered by chips with a Next button (who, where, feeling) > grow ceremony (plant assembles in layers, generated line) > garden with new plant placed. Tapping a planted plot opens a story overlay: object, answers, stored caption, fresh replay line, big back button. Free text field for the grandchild arrives in Milestone B.

## Files

- `index.html` app shell, all views as sections toggled by main.js
- `css/garden.css` game styles over shared tokens
- `js/main.js` view state machine, wiring, storage, aiGenerate calls
- `js/data.js` OBJECTS (id, name, phrase, SVG card art, plus blurb copy kept as data only, not rendered: prose broke the two column picker at 360px), PROMPTS (3 questions, 5 chip options each)
- `js/composer.js` DOM-free deterministic plant builder, exports composePlant(memory)
- `content/garden-lines.json` bank per shared/content-banks.md, game id `memory-garden`
- `qa/loop.mjs` Playwright definition-of-done script, spawns its own server on 4191
- `qa/contact-sheet.mjs` node script, composes a matrix of plants, writes HTML sheet to tools/qa/output/

All asset URLs absolute (`/games/memory-garden/...`, `/shared/...`) because the route `/memory-garden` has no trailing slash.

## State (localStorage ns `memory-garden` via shared/storage.js)

`{ version: 1, plants: [ { id, createdAt, objectId, answers: {who, where, feeling}, freeText, seed, caption } ] }`
Caption text generated once at creation (seeded) and stored so the story never drifts. Replay narration is fresh each open.

## Composer trait table

Seed: hashString(objectId + who + where + feeling) into makeRng. Jitter (lean, leaf count within band, bloom spread) comes from the rng only.

- Species silhouette by object: kopitiam cup > kopi vine (curved climbing stem, round leaves). Sewing machine > thread orchid (arching spray, slender leaves). Rotary phone > bellflower (upright stem, hanging bells). Tingkat carrier > stacked bamboo (segmented stalks). Cassette player > ribbon fern (long wavy fronds). Five stones bag > pebble succulent (low rosette). Milestone B adds Setron TV > sunburst bloom and rattan chair > woven palm.
- Bloom by who: mother > 3 layered round blooms. Father > 1 large bold bloom. Grandmother > 5 small clustered blooms. Friends > 7 tiny scattered blooms. Siblings > 2 paired blooms.
- Palette by feeling: warm > amber and terracotta. Happy > pink and yellow. Wistful > violet and dusk blue. Calm > teal and soft green. Proud > deep red and gold.
- Ornament by where: kampung > small wooden house. First flat > window with laundry pole. Kopitiam > hanging kopi cup. Wet market > woven basket. Seaside > shell and wave curl.

composePlant returns `{ svg, signature, seed, traits }`; the SVG root carries data-species, data-palette, data-bloom, data-ornament, data-seed. Different objects must differ in silhouette at arm's length; same object with different answers must differ in palette, bloom and ornament, not jitter alone.

## Bank events

welcome_first, welcome_back {count}, ceremony_grow {object}, caption {object} {who} {where} {feeling}, replay_open. Starter 4 variations each in Milestone A, 5 to 8 in B, plus prompt phrasing events in B.

## Milestones

A, playable core: full loop with 6 objects, chips only, persistence, replay, starter banks, both QA scripts green, committed. Then stop for conductor review.
B, after go-ahead: 8 objects, full banks, free text field, ceremony polish, first-visit welcome, README, commit per sub-milestone.

## Coder tasks

1. A1, one Opus coder: build every Milestone A file, run qa/loop.mjs, contact sheet and tools/qa/inspect.mjs, paste results, commit.
2. A2 if needed: fixes from orchestrator review, commit.
3. B1: remaining objects, full banks, free text, welcome states. B2: ceremony feel and composer distinctness audit. B3: final QA sweep. README written by orchestrator.

## Fix round (post adversarial QA)

Stale tap guard on view switches (350ms, tap only, keyboard exempt). Primary button above the optional note on step 3. Replay opener moved under the title, stage tightened, visible More below cue, overscroll contained. Count grammar via pre built phrase ("one memory"). Poisoned save records dropped and DOM built safely. Reentrancy flag plus unique ids. Not yet button stays readable and tappable with a gentle nudge. Wider composer viewBox so ornaments never clip. Per load salt for line freshness. Bank lint enforces the every-slot-empty rule.

## Decisions logged

Single coder for A (loop too coupled to split well). Chip select plus Next button instead of auto-advance (kinder to shaky fingers, still about 10 taps per loop). 6 species in A for quality, 8 in B. Caption stored at creation, narration fresh on replay.
