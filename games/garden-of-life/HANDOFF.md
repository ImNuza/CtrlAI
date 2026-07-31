# HANDOFF: Garden of Life, overnight build to CodeBuddy phase

For the teammate starting the submission build cold. Ten minutes here and you
know what exists, how to run it, what to port first, and what to paste into
CodeBuddy. The submission build is mandated to go through CodeBuddy and Miora
(40 of 100 rubric points ride on documented AI-tool usage); tonight's repo is
the source of truth that feeds it, not the thing we submit.

## Run it first

```
node server.js
```

from the repo root, then open http://localhost:4173/garden-of-life at a phone
viewport (390x844). No build step, no dependencies beyond dev-only playwright.
Everything below is verifiable in two minutes: tell a memory, water the plant,
tap it to hear its story, play the tile game, buy and plant a seed, harvest,
photograph a plant (any image file works on desktop), share the garden card,
reload and watch Auntie Bee greet you back.

## 1. What exists and where

### Module map (games/garden-of-life/js/, all ES modules, no framework)

- state.js. The only file that reads or writes storage (namespace
  ctrlai:garden-of-life through shared/storage.js) and the only file with a
  clock: todayISO() honours the QA override key below, and the single
  new Date() in the game lives inside it. Exports the whole state API:
  visits (recordVisit), plants (addPlant, waterPlant, plantStage, isWilted),
  economy (getCoins, addCoins, spendCoins, getStreak, grantSeed, plantSeed,
  harvestCrop, claimFreeSeed, mealUnlockCheck), photo and audio flags, name.
  Save is version 2; v1 saves migrate losslessly on load.
- composer.js. Deterministic SVG plant art, DOM free, imports only
  shared/ai.js (hashString, makeRng). loadTraits(data) injects
  content/plant-traits.json; composePlant({objectId, tags, stage, wilted,
  seed}) and composeCrop({cropId, stage, wilted}) return {svg, signature,
  seed, traits}. Same input, byte-identical svg, forever. All variation is
  seeded; svg roots carry data-species, data-stage, data-wilted and friends,
  which every QA suite reads.
- main.js. Boot and glue only: fetches the four content banks, initialises
  every module, owns the views handle {show, markShown, staleTap}, the
  reaction priorities (watering beats wilt_notice beats plant_comment;
  meal_unlock beats harvest), and the fixed numbers PUZZLE_PAYOUT 6 and
  PHOTO_COINS 3.
- garden-view.js. The 12-plot grid, the plant panel (story replay, water,
  harvest at stage 2), guided seed placement (enterPlacement), welcome ring
  (markFreshPlant), wilt presentation.
- memory-flow.js. U1: object picker, three chip prompts, optional grandchild
  free text, ceremony. storyFor(plantish) is the story line for both the
  ceremony and the panel, seeded by the plant so it retells identically.
- gardener.js. Auntie Bee. Registers gardener-lines.json event arrays in
  file order and resolves reply chips by meta.template_index, which makes
  file order load-bearing (see seams below). Expression map to
  art/gardener/*.png with a hiding fallback. Name capture with honorific
  chips; typing never required.
- puzzle.js. U6 pair matching, engine exported pure (roundSeed, buildDeck,
  createRound, applyTap) so QA can mirror any board. Player-paced flip-back,
  no timers anywhere. Fixed payout is paid by main.js, not here.
- shop.js and meals.js. U5 seed shop (prices by tier via priceForTier: 4, 8,
  12; rare rungs via rareUnlockStreak: 3, 7, 14; daily free seed) and U7
  meal cards (locked cards preview their crops; celebrateMeals reveals).
- photo-quest.js. U3. Native camera or file picker into aiClassifyPhoto
  (canned tonight), honest guess wording, manual picker sharing the same
  8-find vocabulary, reward handled by the glue. The photograph never leaves
  the device and never touches state; the privacy line stays on screen.
- share-card.js. 1080x1350 canvas that photographs the garden through the
  composer, navigator.share when the platform offers it, dated download
  everywhere else. audio.js: four procedural Web Audio cues, context created
  only on the first unmuted gesture, master gain 0.15, one persisted mute.

Ownership note: every file above had exactly one writer all night. Keep that
discipline in the CodeBuddy phase and merges stay trivial.

### Content banks (games/garden-of-life/content/)

memory-prompts.json, gardener-lines.json, meal-cards.json, plant-traits.json.
The schemas, closed vocabularies, counts and tone rules live in
content/SCHEMAS.md and are binding; qa/lint-content.mjs validates all four.
Auntie Bee's register: warm Singapore, light lah where it lands, never guilt,
never medical claims.

### Art (games/garden-of-life/art/)

Generated tonight on Higgsfield under the budget protocol, spend ledger in
BUILD-REPORT-2.md. Style is locked in art/style/LOCKED.md (candidate B, 1970s
Singapore poster, plus the production scaffold that keeps halftone and moire
out of small assets); the four candidates sit beside it. Tree: gardener/ (6
expressions plus anchor.png, the character sheet source), objects/ (8),
backgrounds/ (day, dusk), meals/ (6), ui/ (10 props), icons at
games/garden-of-life/icons/. Plants deliberately have no PNGs: they are
procedural per SPEC so answers visibly change the art. Every art path loads
behind the fallback contract in SCHEMAS.md; a missing PNG never breaks
layout, so you can swap art freely.

### QA (games/garden-of-life/qa/), the definition of done

```
node games/garden-of-life/qa/core.mjs        29 checks  port 4195  GOL_PORT
node games/garden-of-life/qa/days.mjs        26 checks  port 4196  GOL_DAYS_PORT
node games/garden-of-life/qa/economy.mjs     33 checks  port 4193  GOL_ECON_PORT
node games/garden-of-life/qa/phase3.mjs      30 checks  port 4192  GOL_P3_PORT
node games/garden-of-life/qa/composer-check.mjs   determinism, no port
node games/garden-of-life/qa/lint-content.mjs     bank schemas, no port
```

All green at handoff. Each browser suite spawns its own server, refuses to
run if its port is held, and exits nonzero on any failure. Dev server itself
is 4173; 4191 belongs to the memory-garden prototype suite; 4194 and 4197 to
4199 are scratch ports for ad hoc drives.

The QA clock trick: every date read goes through state.todayISO(), which
honours localStorage key ctrlai:garden-of-life:qa-clock (plain ISO date).
Suites simulate days by writing that key and reloading. One landmine: to
control the FIRST load of a fresh context, set the key via addInitScript
before the first navigation, otherwise the first visit is spent on the real
date and your greeting assertions test the wrong bank.

## 2. The AI seams for the CodeBuddy phase

Both live in shared/ai.js, both marked with SWAP POINT comments, both
designed so the swap is a body replacement, never a call-site change.

aiGenerate({game, event, context}) -> Promise<{text, meta}>. Today it fills
seeded templates from the registered banks; meta.source is "bank" or
"fallback". The swap: call the live model inside the body, keep the
signature, set meta.source "llm", and on any failure fall through to the
bank pick so the game never dies offline. What upgrading buys: lines that
weave the player's actual memory phrases into fresh sentences instead of
slot-filled templates, the single biggest Use of AI Tools point earner.

One subtlety that will bite if ignored: gardener.js resolves REPLY CHIPS by
meta.template_index against the bank arrays in file order. A free-generating
model has no template_index. Three workable strategies, pick one per event:
(a) go live only for events without reply chips first (story_retell, the
ceremony line) which is zero risk; (b) have the model choose or paraphrase a
bank line and return that line's index so replies keep working; (c) have the
model generate the replies too and stop consuming template_index for that
event. Do (a) first, it is an hour and it demos.

aiClassifyPhoto({game, photo, context}) -> Promise<{found: {id, label,
confidence}, meta}>. Canned tonight (meta.source "canned"), never inspects
bytes. The swap: send the photo to a vision model, map its answer INTO the
closed 8-find vocabulary from photoFindChoices() (the manual picker shares
it, so both paths must agree), set meta.source "vision", and keep the canned
pick as the catch fallback. The UI wording already says "I think", so a
wrong guess is already survivable product design.

On record, optional shared/ cleanup: exporting fillSlots and tidy from
shared/ai.js would retire the private copies in qa/days.mjs and
qa/economy.mjs. Conductor owns shared/; ask before touching.

## 3. Build order for the submission build

1. Day one, something runs: port the repo wholesale into the CodeBuddy
   workspace (server.js, shared/, games/garden-of-life/, keep paths intact),
   run the six QA commands above, confirm all green before changing a line.
   Capture the first CodeBuddy prompt-to-result screenshot here; the deck
   needs the evidence trail from the very start (SPEC deck hooks section).
2. Live aiGenerate behind the seam, strategy (a) above: story_retell and the
   ceremony first, then greetings via strategy (b) or (c). Re-run core and
   days after each event goes live; the suites' membership checks will need
   relaxing per event exactly when its meta.source stops being "bank" (assert
   non-empty, warm, and slot-bearing instead).
3. Live vision behind aiClassifyPhoto, canned as fallback. Re-run phase3.
4. Miora art pass, using tonight's assets as style references per SPEC:
   regenerate the gardener set from gardener/anchor.png so the face stays
   consistent, then objects, backgrounds, meals, ui props, icons. Drop each
   file over the old path; the fallback contract means a half-finished pass
   never breaks the game. Screenshot every Miora iteration for the deck.
5. Polish that was ruled out of tonight: service worker for offline, purpose
   maskable icons, a phone-over-HTTPS pass to see the real OS share sheet.
6. Deck assembly from the captured pile: CodeBuddy prompts and results,
   Miora iterations, the AI seams story (banks to live swap), the UX floor
   receipts (QA outputs), the economy-without-gacha argument from SPEC.

## 4. Prompt library, ready to paste into CodeBuddy

Each prompt is scoped to one task and names its files. Paste, adjust paths
if your workspace moved things, run the named QA after.

P1, boot the port: "This repo runs a no-build vanilla JS game. Start
server.js, open /garden-of-life at 390x844, then run the six QA commands in
games/garden-of-life/HANDOFF.md section 1 and show me the outputs. Change
nothing yet."

P2, live story line: "In shared/ai.js, replace ONLY the body of aiGenerate
with a call to [model]. Keep the exact signature and the promise shape
{text, meta}. On success set meta.source to 'llm'. On any error or timeout
fall through to the existing bank pick unchanged. Do not touch call sites.
Then run games/garden-of-life/qa/core.mjs and days.mjs and report which
membership checks now need the per-event relaxation described in HANDOFF.md
section 2."

P3, gardener replies under live lines: "gardener.js resolves reply chips by
meta.template_index (see the consumption contract in content/SCHEMAS.md).
For events first_visit, return_visit, return_after_absence, planting,
watering, wilt_notice: have aiGenerate return both a live text and the index
of the closest bank line so replies keep working, or generate 2 to 3 reply
chips of 4 words max in the same response. Keep the neutral fallback path.
Show me the wilt_notice output for a player named Auntie Bee Lian with a
thirsty kopi vine; it must read glad and guilt-free."

P4, live vision: "In shared/ai.js, replace ONLY the body of aiClassifyPhoto
with a [vision model] call. Map the answer into the ids from
photoFindChoices(); anything outside the set maps to the closest member or
falls back to the canned pick. Keep meta.source honest ('vision' or
'canned'). The photo must not be stored anywhere. Run
games/garden-of-life/qa/phase3.mjs."

P5, Miora background: "Using art/style/LOCKED.md as the style scaffold and
art/backgrounds/day.png as the reference, regenerate the garden background
at the same size. Flat fills, crisp contours, no halftone on small detail
per the scaffold. Save over art/backgrounds/day.png and reload
/garden-of-life; the page must look calmer, never broken."

P6, Miora gardener: "Regenerate the six gardener expressions (welcome,
happy, thinking, watering, concerned, celebrate) from the character sheet
art/gardener/anchor.png so the face stays consistent, style per
art/style/LOCKED.md. Same filenames. Then open the game, plant a memory,
water it, and confirm each moment shows the right face."

P7, Miora meals: "Regenerate the six meal card images in art/meals/ (ids
match content/meal-cards.json) per the locked style. Warm, appetising, local
dishes as a senior knows them. Same filenames; the meals view must show them
with no code change."

P8, offline: "Add a service worker for /garden-of-life that precaches the
shell, js, css, content json and art, network-first for content, cache-first
for art. Register it from index.html. The six QA suites must stay green and
the game must load with the network off after one visit."

P9, maskable icons: "Add purpose maskable variants of icon-192 and icon-512
with safe-zone padding and list them in manifest.webmanifest alongside the
existing entries. Verify installability in devtools."

P10, tuning pass: "Economy knobs live in exactly these places: PUZZLE_PAYOUT
and PHOTO_COINS in js/main.js, priceForTier and rareUnlockStreak in
js/shop.js, price_tier per crop in content/plant-traits.json (one rare crop
exists tonight; rungs 7 and 14 are coded but uncontented). Change [knob] to
[value], then run qa/economy.mjs and report every check that moved."

P11, bank growth: "Extend content/gardener-lines.json event [key] with N new
lines per the schema in content/SCHEMAS.md (12 words max, slots must survive
empty, 2 to 3 reply chips of 4 words max, warmth rules for wilt and absence
are strict). APPEND ONLY, order is load-bearing for reply lookup. Run
qa/lint-content.mjs then qa/days.mjs."

P12, full verification: "Run all six QA commands from HANDOFF.md section 1
fresh, then drive one manual pass at 390x844: first session to planted
memory under 5 minutes, reload greeting references the last plant, water,
puzzle round, buy and plant a seed, harvest, photo quest, share card
download. Report anything below the senior floor: 64px targets, 28px text,
no timers, no shame copy."

## 5. Known gaps and tuning knobs, honestly

Team-veto items still open (SPEC open items table): the game name (Garden of
Life is a working title), the U6 tile-matching default (built per SPEC
recommendation; swaps behind the same coin interface if vetoed), and the
leaderboard trade-off (share card ships instead; needs surfacing to the
team). Design sign-off on v0.2 changes and art style acceptance are also
still pending with Matthew and Zoe.

Technical gaps, all logged in plans/ review files: rare streak rungs 7 and
14 have correct code and no content behind them (one rare crop, calamansi);
the plantless re-greet can say "The pot was asking about you." (bank
cosmetic); the OS share-sheet branch is untestable on localhost and needs a
phone-over-HTTPS eyeball; icons lack purpose maskable; no service worker
tonight by ruling; the share-card caption calls a lone crop a memory
(cosmetic, js/share-card.js captionFor). Balance is intended-generous: two
puzzle rounds cover the cheapest dish; tighten via P10 if the team wants
more grind, but remember who the players are.

Live-call rule that outlasts tonight: the product must keep running with no
keys and no network. Every upgrade goes BEHIND a seam with the offline path
as fallback, or it does not ship.
