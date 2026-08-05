---
title: "Garden of Life — 3D Shelf Garden: Architecture & Implementation Plan"
project: "Age Well: Garden of Life"
team: CtrlAI
date: 2026-08-03
deadline: 2026-08-09
status: plan — not yet implemented
supersedes: null
companion: GAME_ANALYSIS.md
codebase_at_planning:
  app/game.js: 1821 lines (classic script, no modules)
  app/styles.css: 1706 lines
  app/index.html: 364 lines
  build_step: none
  framework: none (vanilla DOM + inline SVG)
recommended_engine: three.js
recommended_tier: "Tier 1 — Three.js shelf, procedural geometry, 2D fallback retained"
---

# 3D Shelf Garden — Architecture & Implementation Plan

## 0. Where the codebase actually stands

The code has moved since `GAME_ANALYSIS.md` was written. Verified in the current tree:

| Was | Now |
|---|---|
| No schema version | `SCHEMA_VERSION = 2` + `migrateState()` — `game.js:11,48` |
| Biased `sort()` shuffle | Fisher–Yates `shuffle()` — `game.js:65` |
| UTC day boundary | Local-time `todayStr()` — `game.js:76` |
| Plots unreachable by keyboard | `<button>` + `tabindex` + Enter/Space — `game.js:403,414` |
| `aria-selected` never cleared | Cleared in the nav loop — `game.js:335` |
| Hard-cut screen changes | `enter-/exit-` transitions — `game.js:351` |
| `.path-connector` dead CSS | `drawPathConnectors()` — `game.js:816` |
| Coin counter snapped | `animateCoinFly()` — `game.js:484` |
| Streak reset on 1 miss | `streakFreezes` in state — `game.js:27` |
| Content repeated verbatim | `recentlyServed` tracking — `game.js:28` |
| No FTUE | `garden-hint-card` — `game.js:384` |
| Nav live during play | Nav hidden on `play` — `game.js:345` |

`game.js` grew 1483 → 1821 lines. **This plan is written against the current code.**

What has *not* changed, and what matters for 3D:

- **No module system.** `index.html:362` loads `<script src="game.js">` as a classic script. One 1821-line global scope.
- **No build step.** No `package.json`, no bundler, no `node_modules`.
- **No render loop.** Everything is event-driven. There is no `requestAnimationFrame` anywhere.
- **No state subscription.** Renderers read the global `state` at call time. Mutation and redraw are manually paired at every call site.
- **Full teardown rendering.** `renderGarden()` does `grid.innerHTML = ''` and rebuilds all 12 plots on every water action — `game.js:377`.
- **The garden is `plantSVG()`.** A 2D SVG string generated per plant — `game.js:115`. This is precisely the seam 3D replaces.

---

## 1. Scoping decision — read this before committing

You have **6 days** to a hard deadline, a three-person team, and no 3D code in the project today. I am not going to pretend a full 3D migration is a free action. Three honest tiers:

### Tier 0 — CSS 3D shelf (~4 hours, near-zero risk)

Keep every SVG plant. Add `transform-style: preserve-3d` and `perspective` to the garden container, lay the 12 plots onto three shelf planes with `rotateX`/`translateZ`, and add a wooden shelf drawn in CSS. Plants stay flat billboards but sit in real perspective with real shadows.

- **Gets you:** genuine depth, a shelf silhouette, parallax on scroll, zero new dependencies, zero risk to the senior UX floor.
- **Does not get you:** orbit, real lighting, plant volume, photo mode.

### Tier 1 — Three.js shelf, procedural geometry (~2 days) ← **recommended**

Real WebGL. A wooden shelf unit, 12 pots, procedurally generated plants built from primitives coloured with your existing botanical palette. Constrained camera. Raycast tap-to-water. The 2D SVG garden is retained as a runtime fallback.

- **Gets you:** everything in the gamification section below, photo mode, real growth silhouettes.
- **Costs you:** a module migration, a render loop, a device-capability fallback path, and roughly 170 kB gzipped.

### Tier 2 — Three.js + authored GLB assets (~4–5 days)

Tier 1 plus a Blender → glTF → `gltf-transform` pipeline with authored plant and prop models.

- **Verdict for this deadline:** do not attempt. The asset pipeline is where 3D schedules die, and you have no artist bandwidth confirmed. Tier 1's procedural plants can be swapped for GLBs later behind the same interface — Section 6 keeps that door open.

**Recommendation: build Tier 1, but land the architecture refactor (Section 3) first as an independent, shippable step.** The refactor is valuable even if 3D gets cut — and if you run out of time on day 8, you can fall back to Tier 0 on top of the refactored code in an afternoon.

> One thing worth naming: performance is genuinely **not** the risk here. A 12-pot shelf is roughly 30 objects and ~25k triangles, comfortably inside the mobile budget (Section 7). The risks are schedule, and the senior-accessibility regression covered in Section 8.

---

## 2. Why a shelf is the right 3D form for this game

The shelf concept is a good instinct, and it happens to fit the existing data model exactly:

- **`GARDEN_SLOTS = 12` maps to 3 tiers × 4 pots.** No data migration needed for the base case. `state.plants` stays an index-positional array; the index becomes `(tier, position)` via `tier = floor(i/4)`, `pos = i % 4`.
- **A shelf is bounded.** Unlike an open garden, a shelf has a natural frame — which means a **fixed camera** works, and fixed cameras are what make 3D safe for an elderly audience. No navigation, no getting lost, no disorientation.
- **A shelf reads as a domestic object**, not a game level. That matches the horticultural-therapy framing in your design notes far better than a landscape would.
- **Vertical tiers are legible progression.** Unlocking tier 2, then tier 3, is instantly readable — much more so than "plot 13 appeared somewhere".
- **It photographs well.** A shelf is a composed still life. That directly upgrades your existing share card from a row of flat SVGs to a real rendered image.

The reference points worth studying are the cozy-diorama cluster — *Mysarium* (terrarium composition, per-plant hue/scale control, level-ups granting containers and decorations) and *MakeRoom* (diorama building from a large object catalogue, resize and recolour). Both derive their retention from **player expression inside a bounded frame**, not from difficulty. That is exactly the right model here.

---

## 3. Target architecture

The current architecture cannot host 3D as-is, for one specific reason: **there is no way for a renderer to learn that state changed.** Every render is manually triggered next to the mutation. A 3D scene needs to react continuously and independently.

The fix is the standard game-architecture separation — simulation entirely separate from rendering, with rendering agnostic to how it presents. This is worth doing regardless of whether 3D ships.

### 3.1 Module layout

Migrate from one classic script to ESM. `<script type="module">` is deferred by default, so the existing end-of-body top-level listeners keep working.

```
app/
  index.html
  main.js                  # entry: boot, wire, start loop
  core/
    store.js               # state + pub/sub + persistence + migrations
    events.js              # named event bus (decoupled from store)
    time.js                # todayStr, daysBetween, isNewDay
    audio.js               # playTone + named sfx
    loop.js                # rAF loop, visibility-gated, fixed-step accumulator
  data/
    seeds.js               # SEEDS
    meals.js               # MEALS
    islands.js             # ISLANDS + EXERCISE_META
    decor.js               # NEW: pots, ornaments, shelf skins
  sim/
    garden.js              # plant state machine, watering, harvest
    economy.js             # coins, purchases, rewards
    progression.js         # streaks, levels, island unlocks
  ui/
    screens.js             # showScreen + transitions
    garden2d.js            # existing SVG garden (fallback renderer)
    shop.js  profile.js  exercises.js  notify.js
    exercises/  tiles.js  pattern.js  oddone.js  words.js
  three/
    scene.js               # renderer, camera, lights, resize, context-loss
    shelf.js               # shelf geometry + tier unlock
    plants.js              # procedural plant builder (stage → Object3D)
    pots.js                # InstancedMesh pots + material variants
    interaction.js         # raycasting, tap targets, hover
    effects.js             # water particles, bloom burst, ambient motes
    photo.js               # photo mode + canvas capture for share card
  vendor/
    three.module.js        # vendored, NOT a CDN link
```

**Vendor Three.js locally, do not use a CDN.** Three reasons: EdgeOne Pages should serve everything from one origin; a CDN breaks the offline service worker you still need to add (`BUG-09`); and a strict CSP will block it. Download `three.module.js` into `vendor/` and reference it through an import map in `index.html`:

```html
<script type="importmap">
{ "imports": { "three": "./vendor/three.module.js" } }
</script>
<script type="module" src="main.js"></script>
```

This gives you modules **with no build step** — which is the right trade for a 6-day hackathon.

### 3.2 The store — the single most important change

Replace the bare global `let state` with a minimal observable store. Roughly 40 lines, no dependency:

```js
// core/store.js
const listeners = new Set();
let state = loadState();

export function getState() { return state; }

export function update(mutator, meta = {}) {
  mutator(state);
  saveState();
  for (const fn of listeners) fn(state, meta);
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
```

Every existing `saveState(); renderGarden();` pair collapses into one `update(...)` call. The DOM UI subscribes. The 3D scene subscribes. Neither knows the other exists.

`meta` carries the *reason* for the change (`{ type: 'water', index: 3 }`), which is what lets the 3D layer play the right animation rather than diffing blindly.

### 3.3 The event bus

The store answers "what is true". The bus answers "what just happened" — the transient things that have no state representation:

```js
emit('plant:watered', { index, wasWilt });
emit('plant:bloomed', { index, seedId });
emit('level:completed', { islandId, levelIdx, coins });
emit('coins:earned', { amount, fromEl });
```

The 3D effects layer, the audio layer, and the notification layer all subscribe independently. This is what stops `waterPlant()` from growing into a function that knows about particles, sounds, toasts, and meshes simultaneously.

### 3.4 The render loop

There is no loop today. Add one, and **gate it hard** — this matters more than usual because the target audience is disproportionately on older, cheaper phones:

```js
// core/loop.js
let running = false, raf = null;

export function start(tick) {
  if (running) return;
  running = true;
  let last = performance.now();
  const frame = (now) => {
    if (!running) return;
    tick(Math.min((now - last) / 1000, 0.1));   // clamp after backgrounding
    last = now;
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
}

export function stop() { running = false; cancelAnimationFrame(raf); }
```

Gate on three conditions — run **only** when all hold:

1. `currentScreenName === 'garden'`
2. `document.visibilityState === 'visible'`
3. The canvas intersects the viewport (`IntersectionObserver`)

Additionally: after 10 seconds with no input and no active animation, drop to **on-demand rendering** — render a frame only when something changes. A static shelf does not need 60 fps. This single decision is worth more battery than every other optimisation combined.

### 3.5 Fixing the teardown problem

`renderGarden()`'s `innerHTML = ''` is already flagged as `EFF-03`, and it is a hard blocker for the plant-growth animation (`ANIM-04`). In the new architecture it dissolves naturally: the 3D scene builds each pot's `Object3D` **once**, then mutates transforms per frame. Meshes are keyed by `plant.id` (which already exists — `game.js` sets `id: Date.now()`), so a state change reconciles rather than rebuilds.

> ⚠️ `id: Date.now()` collides if two plants are created in the same millisecond — reachable via the exercise reward + free seed path. Switch to a monotonic counter in state before keying meshes off it.

---

## 4. The 3D shelf — design spec

### 4.1 Composition

```
        ╔═══════════════════════════╗
        ║  ▣    ▣    ▣    ▣         ║  tier 3  (slots 8–11)   locked at start
        ╠═══════════════════════════╣
        ║  ▣    ▣    ▣    ▣         ║  tier 2  (slots 4–7)    locked at start
        ╠═══════════════════════════╣
        ║  ▣    ▣    ▣    ▣         ║  tier 1  (slots 0–3)    unlocked
        ╚═══════════════════════════╝
              ╱               ╲
         (soft contact shadow on ground plane)
```

- **Camera:** perspective, ~35° FOV, fixed 3/4 view, slight downward tilt. **Not** orthographic — you want a little depth cue, but a narrow FOV so it never feels fish-eyed.
- **Camera freedom:** horizontal orbit **clamped to ±22°**, spring-returning to centre on release. No zoom, no pan, no vertical orbit. The camera must never end up somewhere the player cannot recognise.
- **Lighting:** one warm key light (upper-left, matching your `--accent-orange`), one cool fill, one soft ambient. Bake a static contact-shadow texture on the ground plane rather than enabling real-time shadow maps — shadow maps are the single most expensive thing you could switch on here, and a painted blob shadow looks better at this art direction anyway.
- **Background:** transparent canvas over the existing `--bg-primary`. Do **not** render a skybox. The shelf should feel like an object sitting in your paper-textured UI, not a window into another world.

### 4.2 Plants — procedural, staged

Keep the five existing stages (`seed`, `sprout`, `grown`, `bloom`, `wilt`) and the existing `SEEDS` table verbatim. `bloomColor` already exists on every seed and drives the 3D bloom material with no data change.

```js
// three/plants.js
export function buildPlant(seed, stage) → THREE.Group
```

Composition per stage, all from primitives:

| Stage | Geometry |
|---|---|
| `seed` | soil mound (sphere, scaled flat) + seed capsule |
| `sprout` | thin stem cylinder + 2 leaf planes, ~40% height |
| `grown` | stem + 4–6 leaves, full height, slight random lean per plant |
| `bloom` | grown + bloom geometry tinted `seed.bloomColor` |
| `wilt` | grown geometry, leaves rotated down 35°, material desaturated |

Leaves as **double-sided planes with an alpha-cut leaf texture** are far cheaper and better-looking than modelled leaf meshes. One 512×512 atlas covers every leaf shape you need.

Per-plant deterministic variation — seed a small PRNG from `plant.id` so each plant leans, rotates, and scales slightly differently but **identically across sessions**. This is what makes twelve pots read as a collection rather than a clone army.

### 4.3 Pots

`InstancedMesh` — 12 pots, one draw call. Per-instance colour via `setColorAt()`. This is also the hook for the pot-customisation sink in Section 5.

### 4.4 Interaction

- Tap a pot → raycast → water that plant. Same `waterPlant(index)` simulation call as today.
- **Enlarge the raycast target.** Add an invisible box collider around each pot, sized generously. Your senior UX floor specifies ≥64px tap targets, and that constraint applies to 3D hit areas exactly as it does to DOM buttons — arguably more, since there is no visible button edge to aim at.
- Tap feedback: the pot dips 3px and springs back, paired with the existing `playWater()`. Never rely on the 3D alone to confirm a tap.
- **Keep a DOM overlay of 12 invisible focusable buttons** positioned over the pots. This is how the 3D scene stays keyboard- and screen-reader-accessible — see Section 8.

---

## 5. Gamified 3D factors

Ranked by value-per-day-of-work. The first four are where the actual game is.

### G1 — Shelf tiers as progression `high value · 0.5 day`

Tier 1 unlocked; tiers 2 and 3 bought with coins (or unlocked by streak milestones). Replaces the flat 12-slot cap. This is `GD-03` from the analysis, made *visible* — a new shelf plank physically appearing is a far stronger reward than a plot count changing.

### G2 — Pot customisation `high value · 0.5 day`

Sell pot colours and shapes (terracotta, glazed blue, celadon, woven basket). Per-instance colour makes this nearly free to render. This is the **permanent coin sink** the economy currently lacks (`GD-01`), and it is pure player expression with zero difficulty implications — which is exactly the right kind of content for this audience.

### G3 — Decoration slots `high value · 1 day`

Non-plant objects on the shelf: a watering can, a lantern, a paper fan, a photo frame, a sleeping cat. Two or three slots per tier. This is the single biggest driver in the cozy-diorama genre — *Mysarium* and *MakeRoom* both run their entire economy on it. Ties directly into the unused meal cards (`GD-02`): unlock a meal → earn its dish as a shelf ornament.

### G4 — Photo mode `high value · 0.5 day`

Orbit freely (temporarily unclamped), then capture. `renderer.domElement.toBlob()` produces a real image for the existing share card, replacing the current row of flat SVGs. Given that the leaderboard was cut and the share card *is* the social layer, this materially strengthens the weakest pillar in the design.

### G5 — Real-time-of-day lighting `medium value · 0.25 day`

Interpolate key-light colour and intensity from the device clock. Morning is warm and low, midday neutral, evening golden, night lamp-lit. Costs almost nothing and makes the shelf feel *alive between sessions* — the player who opens it at 7pm sees a different object than the one who opened it at 9am.

### G6 — Growth visible as silhouette `medium value · included in 4.2`

In 2D, a bloomed plant is a slightly different SVG. In 3D it is **taller, wider, and casts a bigger shadow**. Growth becomes readable at a glance across the whole shelf. This is the emotional payoff the current build does not deliver.

### G7 — Tap-to-inspect `medium value · 0.5 day`

Tap and hold a plant → it lifts from the shelf, rotates slowly, and a card slides up with its name, age in days, and the meal it contributes to. Turns the plant from an icon into a specimen. Pairs naturally with the reminiscence-therapy framing in your research notes.

### G8 — Ambient life `low value · 0.25 day`

A butterfly on a slow bezier, dust motes in the key light, an occasional falling leaf. Cheap, and it is the difference between a diorama and a screenshot. Must respect `prefers-reduced-motion`.

### G9 — Seasonal shelf skins `low value · deferred`

Backdrop and shelf-wood variants tied to real dates. A good post-hackathon retention lever; not a launch feature.

### G10 — Physical harvest gesture `medium value · deferred`

The harvest loop from `GD-01`, expressed as a drag-up gesture on a bloomed plant. Satisfying, but gestures are risky for this audience — ship harvest as a button first, and only add the gesture if user testing supports it.

---

## 6. Tools

### Engine: **Three.js**

| | Three.js | Babylon.js | PlayCanvas |
|---|---|---|---|
| Bundle (gzipped) | **~168 kB** | ~1.4 MB | small runtime |
| Mobile perf | good | good | best-in-class |
| Editor workflow | none | none | **yes** |
| Ecosystem / examples | **largest** | large | moderate |
| Fit here | ✅ | ❌ oversized | ❌ editor workflow you don't need |

**Choose Three.js.** Babylon's ~1.4 MB is disqualifying for a PWA that still needs to work offline on a slow connection. PlayCanvas has the better mobile engine and the maturest WebGPU path, but its value is the editor-driven workflow — you have a code-driven, no-build project and 6 days, so that advantage is unrealisable.

**Do not add React Three Fiber.** There is no React in this project. Adding React solely to get R3F would be the single largest scope increase available to you.

**Render path:** WebGL2. WebGPU is now broadly available, but Three's WebGPU support is partial and the win is on compute-heavy scenes — which this is not. Stay on WebGL2.

### Asset pipeline — only if you go Tier 2

Not needed for Tier 1 (procedural geometry). If you later author models:

```bash
npm i -g @gltf-transform/cli

# inspect first — never optimise blind
gltf-transform inspect shelf.glb

# geometry compression: typically 70–80% smaller
gltf-transform draco shelf.glb shelf.draco.glb

# texture compression: smaller download AND smaller GPU memory
gltf-transform uastc shelf.draco.glb shelf.final.glb --level 4
```

Draco compresses geometry and is part of the glTF 2.0 spec as `KHR_draco_mesh_compression`. KTX2/Basis Universal is the one that matters more on mobile, because it transcodes to the GPU's *native* compressed format — cutting GPU memory, not just download size.

**Keep total initial load under 3 MB.** Past that, every megabyte adds seconds on 4G, and users leave before the scene appears.

### Textures

One 512×512 leaf/petal alpha atlas, one 256×256 wood-grain tile, one baked shadow blob. Total well under 1 MB. Always `generateMipmaps` — without them, distant surfaces shimmer and the GPU reads more data than it needs.

---

## 7. Performance budget

Mobile targets, against which this scene is comfortable:

| Metric | Mobile budget | This scene (est.) | Headroom |
|---|---|---|---|
| Draw calls | < 50 | **~8–12** | ✅ large |
| Triangles | < 100k on-screen | **~25k** | ✅ large |
| Texture memory | < 50 MB | **~4 MB** | ✅ large |
| GPU memory total | < 150 MB | **~20 MB** | ✅ large |
| Target frame rate | 30 fps mid-range | 60 achievable | ✅ |
| Initial load | < 3 MB | **~400 kB** | ✅ |

Draw calls are the metric that actually kills mobile — desktop GPUs handle 500+, mobile struggles above 100, and the cost is state-change overhead rather than rendering. `InstancedMesh` for the 12 pots collapses those to one call, and merging the shelf planks into a single geometry collapses those too.

**Explicitly do not enable:** real-time shadow maps, post-processing, antialiasing beyond `antialias: true`, or any render target. None earn their cost at this art direction.

**Do:** cap `renderer.setPixelRatio(Math.min(devicePixelRatio, 2))`. On a 3× phone screen, uncapped DPR triples fragment cost for no perceptible gain.

---

## 8. Accessibility — the real risk

This is where a 3D migration can quietly undo the project's stated senior UX floor. Treat every item here as a launch blocker, not a nice-to-have.

### A1 — The 2D garden must survive as a real fallback

Keep `garden2d.js` (today's `renderGarden` + `plantSVG`) fully functional and reachable. Render it when **any** of these hold:

- WebGL2 unavailable, or context creation fails
- `prefers-reduced-motion: reduce`
- The user has chosen 2D in settings
- Device memory or a first-frame timing probe indicates a low-end device

Both renderers subscribe to the same store, so this is a swap, not a fork.

### A2 — WebGL context loss must be handled

Backgrounded tabs on low-memory Android phones lose the GL context routinely. Listen for `webglcontextlost`, `preventDefault()`, and **fall back to the 2D garden** rather than showing a dead black canvas. An unrecoverable blank rectangle is a far worse outcome for this audience than a plain SVG grid.

### A3 — The DOM overlay is mandatory

A `<canvas>` is a single opaque node to a screen reader. Keep 12 visually-hidden but focusable `<button>` elements absolutely positioned over the pot screen coordinates, carrying the same `aria-label`s the current plots use (`game.js:405`). Update their positions when the camera settles. Keyboard and switch users drive the game through these; the canvas is decoration.

### A4 — Tap targets stay ≥64px

Applies to raycast colliders, not just DOM. See 4.3.

### A5 — Motion restraint

No idle camera drift, no auto-orbit, no bobbing. The camera moves only on direct input and springs back. `prefers-reduced-motion` disables orbit entirely and pins the camera.

### A6 — Contrast survives lighting

Your palette was pixel-measured for contrast in flat 2D. Three-dimensional lighting multiplies colour by light intensity, which **will** push shaded plants below the 4.5:1 floor. Keep ambient intensity high (≥0.6) and key intensity modest so the darkest shaded surface still passes. Re-measure after lighting is in — do not assume the tokens carry over.

---

## 9. Migration steps

Each step is independently shippable. Stop at any point and you still have a working game.

### Step 1 — Architecture refactor `~4 hours · no visual change`

Do this even if 3D is cut.

1. Add `<script type="importmap">` and switch to `<script type="module" src="main.js">`.
2. Split `game.js` into the `core/`, `data/`, `sim/`, `ui/` modules from 3.1. Mechanical — move code, add `export`/`import`, change nothing else.
3. Introduce `store.js`; replace every `saveState(); renderX();` pair with `update(...)`.
4. Introduce `events.js`; move notification, audio, and particle triggers onto it.
5. Replace `id: Date.now()` with a monotonic counter (see 3.5 warning).
6. **Verify:** game behaves identically. This step has no user-visible output.

### Step 2 — Three.js boot `~3 hours`

7. Vendor `three.module.js` into `vendor/`.
8. `three/scene.js`: renderer (`alpha: true`, capped DPR), camera, lights, resize handler, context-loss handler.
9. `core/loop.js` with the three gating conditions from 3.4.
10. Render an empty shelf-less ground plane. **Verify:** canvas appears over the garden background, no jank, loop stops when you navigate away.

### Step 3 — Shelf and pots `~4 hours`

11. `three/shelf.js` — 3 tiers, merged plank geometry, tier 2/3 hidden.
12. `three/pots.js` — `InstancedMesh`, 12 instances positioned to `(tier, pos)`.
13. Subscribe to the store; show/hide pots to match `state.plants.length`.
14. **Verify:** draw calls ≤ 12 in Spector.js or the Three inspector.

### Step 4 — Plants `~5 hours`

15. `three/plants.js` — `buildPlant(seed, stage)` per 4.2, leaf atlas, per-plant PRNG variation.
16. Reconcile meshes against `state.plants` keyed by `plant.id`.
17. Animate stage transitions — this is `ANIM-04`, finally unblocked.
18. **Verify:** all five stages render; wilt reads clearly as distinct from grown.

### Step 5 — Interaction `~3 hours`

19. `three/interaction.js` — raycast, oversized colliders, tap dip.
20. DOM overlay buttons (A3), position-synced.
21. Clamped orbit with spring return.
22. **Verify:** keyboard-only play works end to end; VoiceOver announces each pot.

### Step 6 — Effects and fallback `~3 hours`

23. `three/effects.js` — water particles at the tapped pot, bloom burst.
24. Wire the full fallback matrix from A1.
25. **Verify:** force `prefers-reduced-motion` and a WebGL-disabled browser; both land on the 2D garden cleanly.

### Step 7 — Gamification `~1.5 days`

26. G1 shelf tiers → G2 pot customisation → G4 photo mode → G3 decorations, in that order. Each is independently shippable; stop when time runs out.

**Estimated total to end of Step 6: ~2.5 days.** Step 7 is the part to trim under pressure.

---

## 10. Risks

| Risk | Severity | Mitigation |
|---|---|---|
| Refactor destabilises a working build 6 days out | **high** | Step 1 is behaviour-preserving and independently verifiable. Do it first, on a branch, and confirm parity before touching 3D. |
| 3D regresses the senior accessibility floor | **high** | Section 8 items are launch blockers. The 2D fallback is never deleted. |
| Procedural plants look worse than the current SVGs | medium | Your SVG plants are genuinely good. Prototype **one** plant in Three before committing to Step 4 — if it doesn't beat the SVG, fall back to Tier 0 CSS 3D. |
| Scope creep in Section 5 | medium | G1–G4 only. G5–G10 are explicitly post-hackathon. |
| WebGL fails on a judge's device during demo | medium | A2 context-loss handling plus A1 fallback. Test on the oldest phone you can find, not just your own. |
| `id: Date.now()` collision corrupts mesh reconciliation | low | Fixed in Step 1.5. |

**The one-line version:** do Step 1 regardless — it is good architecture and it de-risks everything downstream. Then prototype a single plant. Let that prototype decide between Tier 1 and Tier 0.

---

## 11. Open questions for the team

1. **Does the 3D shelf replace the garden screen, or become a fifth screen?** Recommendation: replace, with the 2D as fallback. Two parallel gardens will diverge.
2. **Do tiers 2 and 3 cost coins or streak days?** Coins gives the economy its sink; streak reinforces the daily habit. Recommendation: tier 2 for coins, tier 3 for a 7-day streak.
3. **Is `GARDEN_SLOTS` still 12 after tiers land?** If tiers gate slots, new players start with **4**, not 12. That is a better FTUE, but it changes the meal-unlock pacing in `checkMealUnlocks()` — re-check the ingredient requirements.
4. **Who owns the leaf atlas?** Matthew is the aesthetic lead; this is ~1 hour in any image editor, but it must be someone's task.

---

## 12. Sources

- [100 Three.js Tips That Actually Improve Performance](https://www.utsubo.com/blog/threejs-best-practices-100-tips)
- [Draw Calls: The Silent Killer — Three.js Roadmap](https://threejsroadmap.com/blog/draw-calls-the-silent-killer)
- [Three.js Performance Checklist: 24 Essential Steps](https://marceloretana.com/checklist/threejs-performance-checklist)
- [Three.js Alternatives Compared: Babylon.js vs PlayCanvas](https://www.utsubo.com/blog/threejs-vs-babylonjs-vs-playcanvas-comparison)
- [Web game engines in 2026: PlayCanvas vs Three.js vs Babylon.js vs Unity WebGL](https://app.cinevva.com/blog/2026-06-09-web-game-engines-2026-comparison)
- [glTF Asset Pipeline: Blender to Browser GLB Optimisation](https://www.intelligentgraphicandcode.com/development/threejs-interfaces/asset-pipeline)
- [Compress GLB File Size with Draco](https://www.automapki.com/news/the-power-of-draco-compression-in-gltf-and-glb-file-formats.html)
- [Game Loop · Sequencing Patterns · Game Programming Patterns](https://gameprogrammingpatterns.com/game-loop.html)
- [Devlog #2: game engine architecture — Dom Williams](https://domwillia.ms/devlog2/)
- [Mysarium: Cozy Lo-fi Terrarium — Steam](https://store.steampowered.com/app/4156770/Mysarium/)
- [MakeRoom — cozy diorama sandbox](https://www.gamespress.com/-BUILD-AND-DECORATE-COZY-DIORAMAS-IN-MAKEROOM-LAUNCHING-ON-AUGUST-7-)
