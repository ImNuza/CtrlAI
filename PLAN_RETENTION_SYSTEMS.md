---
title: "Garden of Life — Retention Systems: Achievements, Daily Tasks, Leaderboard"
project: "Age Well: Garden of Life"
team: CtrlAI
date: 2026-08-04
deadline: 2026-08-09
status: spec — not yet implemented
companions: [GAME_ANALYSIS.md, PLAN_3D_GARDEN.md]
codebase_at_spec:
  app/game.js: 2065 lines
  app/styles.css: 2100 lines
  schema_version: 3
systems_specced:
  - achievements ("Garden Almanac")
  - daily_tasks ("Today in the Garden")
  - leaderboard ("Garden Circle" — 3 tiers, see §4)
  - eight additional systems ranked in §5
target_schema: 4
---

# Retention Systems Specification

## 0. Where the code stands

Verified in the current tree — several things from earlier docs have already landed:

| Feature | Status | Location |
|---|---|---|
| `SCHEMA_VERSION` | **3** | `game.js:11` |
| Shelf tiers | in progress — `shelves: 1` in state | `game.js:29` |
| Level difficulty wired | done — `initTileMatch(level)` etc. now take `level` | `game.js:1529,1630,1807,1922` |
| Island gating | done — "Complete 5 levels in X to unlock" | `game.js:916` |
| Streak freezes | done | `game.js:27` |
| Content repetition guard | done — `recentlyServed` | `game.js:28` |
| Plant detail sheet | done | `game.js:613` |
| Harvest loop | **not yet** | — |

**Hook points these systems attach to:**

| Function | Line | What fires there |
|---|---|---|
| `completeExercise()` | `1405` | exercise finished, coins awarded, level marked |
| `waterPlant()` | `681` | a plant watered |
| `buySeed()` / `plantSeed()` | `1167` / `1182` | purchase, plant added |
| `updateStreak()` | `158` | daily rollover |
| `checkMealUnlocks()` | `216` | collection progress |
| `markLevelComplete()` | `847` | level progression |
| `init()` | `2025` | session boot |
| `showNotif()` | `231` | all player-facing announcements |

---

## 1. The honest read on your three picks

Achievements and daily tasks are strong fits and I'd build both. **The leaderboard needs a design change before it's safe for this audience**, and it has an architectural blocker your notes recorded — both are solvable, and §4 solves them.

Two facts worth putting on the table first:

**The blocker is gone.** `.workbuddy-ai/memory/2026-08-03.md:23` records *"No leaderboard (cut — needs backend)"* against *"No backend — all state in browser storage"*. That was correct at the time. But you're deploying to **EdgeOne Pages, which now ships Edge Functions plus Edge KV storage** — a serverless backend on the platform you're already using, with no server to run. The technical reason the leaderboard was cut no longer holds. Update that note.

**The design concern is real, but it's about *which* leaderboard.** Research on older adults finds that low perceived personal status relative to others is more strongly associated with aging anxiety than age-related changes themselves. A global ranked ladder that places a 74-year-old at #4,891 is a status signal, and it directly contradicts the "no shame/blame messaging" line in your own senior UX floor. But the same literature is clear that *social* play is a primary motivator for this group — competitive modes with seniors produce measurably more shared laughter than cooperative ones, and socialising is the central reason older people give for joining group activities.

The resolution is not "no leaderboard". It's that **the social unit should be small and known, not global and anonymous**, and the metric should be contribution rather than rank. §4 specs three tiers so you can pick your risk level; I recommend shipping Tiers 1 and 2 and treating Tier 3 as opt-in.

---

## 2. System 1 — Achievements ("The Garden Almanac")

### 2.1 Design principles

The research finding that should drive this: **a small number of harder, meaningful achievements outperforms a wall of trivial icons.** Achievement systems fail when they measure everything instead of recognising what matters. Harder achievements that fewer users reach correlate with substantially better retention among those who reach them. Multi-tier badges beat separate badges for tiny increments — less clutter, clearer aspiration.

So: **24 achievements, not 80.** Tiered where the metric is countable. Every one maps to something the player already wants.

Framing: an **Almanac** — a pressed-flower field journal, not a trophy case. Each entry is a botanical plate that fills in when earned. This fits the 1970s Singapore botanical art direction and avoids the arcade-score register entirely.

### 2.2 The catalogue

Tiers are **Seedling → Sprout → Bloom**. Rewards are coins plus, at Bloom tier, a decoration for the 3D shelf (ties into `PLAN_3D_GARDEN.md` G3).

#### Cultivation

| ID | Name | Condition | Tiers | Reward |
|---|---|---|---|---|
| `cult_water` | Faithful Hands | plants watered | 10 / 50 / 200 | 5 / 15 / 40 + watering-can ornament |
| `cult_bloom` | First Light | plants reached bloom | 1 / 10 / 30 | 8 / 20 / 50 + brass plant marker |
| `cult_full` | Full Shelf | every slot occupied at once | — | 30 + shelf lantern |
| `cult_revive` | Second Chance | wilted plants brought back | 1 / 10 / 25 | 5 / 15 / 35 |
| `cult_variety` | Botanist | distinct species grown | 3 / 5 / 6 | 10 / 25 / 60 + specimen case |

#### Mind

| ID | Name | Condition | Tiers | Reward |
|---|---|---|---|---|
| `mind_total` | Sharp as Ever | exercises completed | 10 / 50 / 150 | 10 / 30 / 75 |
| `mind_island` | Meadow Walker | islands fully completed | 1 / 2 / 4 | 20 / 40 / 100 + island pennant |
| `mind_perfect` | Clear Morning | exercise with no wrong answers | 1 / 10 / 30 | 10 / 25 / 60 |
| `mind_allfour` | Well-Rounded | all four exercise types in one day | — | 25 |
| `mind_return` | Practice Makes | replay a completed level | 1 / 10 / — | 5 / 15 |

#### Devotion

| ID | Name | Condition | Tiers | Reward |
|---|---|---|---|---|
| `dev_streak` | Every Morning | streak length | 3 / 7 / 30 | 15 / 35 / 120 + sunrise backdrop |
| `dev_return` | Welcome Back | returned after 3+ days away | — | 20 *(see §5.3)* |
| `dev_days` | Seasons Passing | distinct days played | 7 / 30 / 100 | 15 / 50 / 150 |
| `dev_month` | A Year in Flower | played in 3 distinct months | — | 80 + almanac cover plate |

#### Collection

| ID | Name | Condition | Tiers | Reward |
|---|---|---|---|---|
| `col_meal` | Kitchen Garden | meal cards unlocked | 2 / 4 / 6 | 15 / 35 / 80 |
| `col_seed` | Seed Keeper | seed varieties owned | 3 / 5 / 6 | 10 / 25 / 50 |
| `col_rare` | Rare Bloom | rare seeds grown to bloom | 1 / 3 / — | 25 / 60 |
| `col_decor` | Homemaker | decorations placed | 1 / 5 / 12 | 10 / 25 / 60 |

#### Quiet discoveries *(unlisted until earned — shown as "???")*

| ID | Name | Condition | Reward |
|---|---|---|---|
| `qui_dawn` | Dawn Gardener | played before 7am | 15 |
| `qui_dusk` | Evening Rounds | played after 9pm | 15 |
| `qui_photo` | Portrait of a Garden | shared a garden photo | 20 |
| `qui_patient` | No Hurry | 5-minute session without leaving a screen | 20 |
| `qui_circle` | Good Neighbour | joined a Garden Circle | 25 |

**Total: 24 achievements, 51 earnable tiers.**

### 2.3 Data model

```js
// data/achievements.js
export const ACHIEVEMENTS = [
  {
    id: 'cult_water',
    category: 'cultivation',
    name: 'Faithful Hands',
    desc: 'Water your plants regularly.',
    metric: 'plantsWatered',        // key into state.stats
    tiers: [
      { at: 10,  coins: 5,  label: 'Seedling' },
      { at: 50,  coins: 15, label: 'Sprout'   },
      { at: 200, coins: 40, label: 'Bloom', decor: 'watering_can' },
    ],
    hidden: false,
  },
  // …
];
```

### 2.4 Evaluation — counters, not scans

**Do not re-scan game state on every render.** Maintain a `state.stats` counter object, increment it at the hook points in §0, and evaluate only the achievements whose `metric` changed.

```js
// sim/achievements.js
export function bumpStat(key, by = 1) {
  state.stats[key] = (state.stats[key] || 0) + by;
  evaluateMetric(key);
  saveState();
}

function evaluateMetric(key) {
  for (const a of ACHIEVEMENTS) {
    if (a.metric !== key) continue;
    const earnedIdx = state.achievements[a.id] ?? -1;
    const value = state.stats[key] || 0;
    for (let t = earnedIdx + 1; t < a.tiers.length; t++) {
      if (value >= a.tiers[t].at) {
        state.achievements[a.id] = t;
        awardTier(a, t);
      } else break;
    }
  }
}
```

`state.achievements[id]` stores the **highest tier index earned** (`-1` / absent = none). That's one small integer per achievement rather than an array of booleans — cheap to store and trivially forward-compatible when you add tiers.

### 2.5 Award presentation

Do **not** fire a toast per tier. Queue awards and present at a natural break — after `completeExercise()` renders its completion card, or on next `init()`.

The Almanac plate animates: the botanical illustration fades from ghosted outline to full colour over 700ms, a pressed-flower stamp settles on top, coins fly to the counter via the existing `animateCoinFly()` (`game.js:728`). Paired with `playSuccess()`.

Never show progress bars for hidden achievements — that defeats them.

### 2.6 Screen

New tab, or a section within Profile. Given the bottom nav is already four items and adding a fifth would shrink tap targets below the 64px floor, **put the Almanac inside Profile** as a full-width entry card that opens a dedicated view.

Layout: category sections, each a grid of plates. Earned plates in full colour with the date earned. Unearned plates ghosted at 25% with the condition text and a `n / target` progress line. Hidden ones show a "?" plate with no text.

---

## 3. System 2 — Daily Tasks ("Today in the Garden")

### 3.1 Design principles

Daily quests raise engagement meaningfully — games with rotating dailies see large DAU lifts, and rotation specifically is what prevents the monotony that same-every-day systems produce. Mix trivial, core, and stretch objectives.

But your senior UX floor says **"No timers anywhere"** and **"No shame/blame messaging."** A conventional daily-quest system violates both in spirit: it creates expiry pressure and punishes non-completion. So three hard rules:

1. **No countdown timer is ever displayed.** Tasks refresh at local midnight. That's it.
2. **Uncompleted tasks carry no penalty and no negative copy.** They simply become a new set.
3. **Partial credit persists.** Progress on an incomplete task carries into the next day's equivalent — a player who does 1 of 2 exercises doesn't restart at zero.

### 3.2 Task pool

Three tasks per day: **one gentle** (near-guaranteed), **one core**, **one stretch**. Drawn from separate pools so the shape is consistent day to day.

#### Gentle pool — completable in under a minute

| ID | Text | Target | Coins |
|---|---|---|---|
| `g_water1` | Water one plant | 1 | 3 |
| `g_visit` | Visit your garden | 1 | 3 |
| `g_look` | Look at a plant's details | 1 | 3 |
| `g_shop` | Browse the seed shop | 1 | 3 |
| `g_almanac` | Open your Almanac | 1 | 3 |

#### Core pool — the intended daily session

| ID | Text | Target | Coins |
|---|---|---|---|
| `c_ex1` | Complete one brain exercise | 1 | 6 |
| `c_waterall` | Water every plant | all | 6 |
| `c_level` | Finish a level on the path | 1 | 6 |
| `c_type` | Try a Word Pairs exercise | 1 | 6 |
| `c_tiles` | Try a Tile Match exercise | 1 | 6 |
| `c_revive` | Bring a thirsty plant back | 1 | 8 |

#### Stretch pool — optional, never required

| ID | Text | Target | Coins |
|---|---|---|---|
| `s_ex3` | Complete three exercises | 3 | 15 |
| `s_perfect` | Finish an exercise with no mistakes | 1 | 15 |
| `s_twotypes` | Try two different exercise types | 2 | 12 |
| `s_bloom` | Bring a plant to bloom | 1 | 18 |
| `s_plant` | Plant a new seed | 1 | 12 |

### 3.3 Deterministic daily selection

Selection must be **stable across reloads on the same day** — a player who refreshes must not get a different set. Seed a PRNG from the date string:

```js
// sim/dailytasks.js
function dayHash(dateStr) {
  let h = 2166136261;
  for (let i = 0; i < dateStr.length; i++) {
    h ^= dateStr.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function rollDailyTasks(dateStr) {
  const h = dayHash(dateStr);
  return [
    GENTLE[h % GENTLE.length],
    CORE[(h >> 8) % CORE.length],
    STRETCH[(h >> 16) % STRETCH.length],
  ];
}
```

Exclude tasks that are impossible today — `c_revive` needs a wilted plant, `s_bloom` needs a plant one day from blooming, `c_waterall` needs at least one plant. Filter the pool **before** indexing, and fall back to the gentle pool if a filtered pool empties.

### 3.4 Weekly layer — "Garden Week"

A soft weekly goal on top: **complete 10 daily tasks within a calendar week → a rare seed or a decoration.** Escalating weekly challenge chains are where the meaningful retention lift sits, and 10-of-21 is deliberately forgiving — a player can miss three full days and still finish.

Progress shown as a 10-dot tracker, reusing the existing `.round-dot` styling. Resets Monday local. **No copy anywhere frames a reset as a loss.**

### 3.5 UI

A card at the top of the Garden screen, above the shelf:

```
┌─────────────────────────────────────┐
│  Today in the Garden                │
│                                     │
│  ✓  Water one plant           +3 ●  │
│  ○  Complete one brain exercise +6 ●│
│  ○  Complete three exercises  1/3   │
│                                     │
│  Garden Week  ● ● ● ● ○ ○ ○ ○ ○ ○   │
└─────────────────────────────────────┘
```

Completed rows get a check, strike-through, and a soft green wash. Tapping an incomplete row navigates to the relevant screen — this is the card's real job: it's a **launcher**, not a checklist.

When all three are done the card collapses to a single line: *"All done for today. Lovely work."* It does not disappear — disappearing UI is disorienting for this audience.

---

## 4. System 3 — Leaderboard ("Garden Circle")

Three tiers, increasing in both social risk and engineering cost. **Ship Tier 1 and Tier 2; make Tier 3 opt-in.**

### 4.0 Identity — no accounts, no passwords

All three tiers use an **anonymous device-generated ID** plus a player-chosen **garden name** (not a real name):

```js
state.identity = {
  playerId: crypto.randomUUID(),   // generated once, stored locally
  gardenName: null,                // e.g. "Mei's Balcony" — prompted, skippable
};
```

No email, no password, no account creation, no personal data. This is both the right privacy posture for an elderly audience and dramatically less to build. If a player clears their browser they lose their circle membership — accept this and surface the circle code so it can be re-entered.

> ⚠️ Never prompt for real name, age, address, or contact details. The garden name is a nickname and should be labelled as one.

### 4.1 Tier 1 — Community Garden *(cooperative, zero ranking)* ← ship this

A single global aggregate, updated live. **No ranking exists**, so there is no status signal and nothing to feel bad about.

```
┌─────────────────────────────────────┐
│  The Community Garden               │
│                                     │
│  This week, gardeners everywhere:   │
│                                     │
│    12,480  plants watered           │
│     3,205  exercises completed      │
│       891  flowers bloomed          │
│                                     │
│  ████████████████░░░░  16,000 goal  │
│  Reach the goal → everyone gets a   │
│  Sampaguita seed on Sunday.         │
└─────────────────────────────────────┘
```

Purely additive, purely cooperative, and it makes a solo game feel populated. The weekly community goal gives a reason to return that has nothing to do with beating anyone.

**Backend:** one counter endpoint. Client posts deltas, server increments KV, client reads totals. Cheap, and it degrades to a hidden card if the network fails.

### 4.2 Tier 2 — Garden Circle *(private group, contribution not rank)* ← ship this

A private group of up to 8, joined by a **6-character code** shared with family or a community group. This is the design that actually fits the audience: social connection through a *known* group is the documented motivator, not anonymous global status.

```
┌─────────────────────────────────────┐
│  Bukit Timah Circle        Code: 7F2K9M │
│                                     │
│  🌿 Mei's Balcony      5 plants · 12 ex │
│  🌸 Ah Kong's Corner   8 plants · 9 ex  │
│  🌱 Siti's Window      3 plants · 21 ex │
│  🌺 You                6 plants · 15 ex │
│                                     │
│  Together this week: 57 exercises   │
│                                     │
│  [ Send encouragement ]             │
└─────────────────────────────────────┘
```

Design rules that make this safe:

- **No rank numbers and no sort by score.** Sort by join date or alphabetically — never by performance.
- **No "you are last" state can exist**, because there is no ordering.
- **Everyone's row shows the same fields**, so the frame is participation, not comparison.
- **"Send encouragement"** — a one-tap, no-typing reaction (a sun, a watering can, a flower) delivered to another member. Bounded tap-chip interaction, consistent with the NPC design finding in your research notes that free text raises cognitive load.
- **A member who hasn't played in days shows no negative state** — just their last garden, unchanged. Never "inactive", never a red marker.

This is the highest-value social feature in this document for this audience, and it's the one I'd protect if time runs short.

### 4.3 Tier 3 — Gentle League *(opt-in ranked)*

If you want a genuine ladder, these guardrails are what make it defensible:

- **Opt-in.** Off by default, with plain-language copy explaining what it does.
- **Cohorts of 20**, assigned on join. Everyone sees the full cohort, so no player is ever off-screen or "below the fold".
- **Promotion only, never demotion.** You can move up a tier; you can never be pushed down. This is the single most important rule.
- **Weekly reset, no rank history.** A bad week leaves no permanent record.
- **Show position as a band, not a number** — "Top half", "Growing well", "Getting started" — never "#17 of 20".
- **Metric is effort, not skill**: exercises completed and plants tended. Never accuracy, never speed. A cognitively declining player must never be ranked *by their decline*.

> ⚠️ If you ship Tier 3, it needs a real usability test with at least two people in the target age band before the deadline. This is the one feature in this document that can actively harm the user experience if it lands wrong.

### 4.4 Backend — EdgeOne Pages

Your notes cut the leaderboard for lack of a backend. **EdgeOne Pages Functions provide a serverless execution environment on edge nodes with ES6 and Web Service Worker APIs, plus Edge KV for global key-value read/write** — which is exactly and only what these three tiers need.

```
functions/
  api/
    community.js     # GET totals, POST delta      → KV: community:{isoWeek}
    circle.js        # POST create/join/sync       → KV: circle:{code}
    league.js        # GET cohort, POST progress   → KV: league:{cohortId}:{isoWeek}
```

Sketch:

```js
// functions/api/community.js
export async function onRequest({ request, env }) {
  const week = isoWeek(new Date());
  const key = `community:${week}`;
  if (request.method === 'GET') {
    return Response.json(await env.KV.get(key, 'json') ?? EMPTY);
  }
  const delta = await request.json();
  const cur = await env.KV.get(key, 'json') ?? EMPTY;
  for (const k of ['watered','exercises','blooms']) {
    cur[k] = (cur[k] || 0) + Math.max(0, Math.min(delta[k] || 0, 50));  // clamp
  }
  await env.KV.put(key, JSON.stringify(cur));
  return Response.json(cur);
}
```

**Non-negotiables:**

- **Clamp every delta server-side.** The client is untrusted; localStorage is trivially editable. Clamping caps the blast radius of a tampered client to something meaningless.
- **Batch sync.** Post once on session end and once on `visibilitychange`, not per action.
- **Offline-first.** Queue deltas locally and flush when online. Every leaderboard surface must render a graceful empty state — the game must remain fully playable with the network down, since it's a PWA for people who may be on patchy connections.
- **Rate-limit by `playerId`** at the edge.

---

## 5. Other systems worth adding

You asked what else. Ranked by value for *this* audience — the top three are, in my view, worth more than Tier 3 of the leaderboard.

### 5.1 Care Circle gifting `high value · 0.5 day` *(needs Tier 2)*

Let a circle member **send a seed or a streak-freeze** to another. Asymmetric generosity, not competition. For an audience where the real product benefit is connection with family, this converts the game into a reason for a grandchild to check in. Cap at one gift per person per day so it stays meaningful.

### 5.2 The Weekly Garden Letter `high value · 0.5 day`

Every Monday, a short illustrated recap: *"Last week you visited 5 days, completed 12 exercises, and your Hibiscus bloomed for the first time."* Delivered as an in-app letter card, keepable in the Almanac.

This leans directly on the reminiscence-therapy evidence in your research notes (Cochrane review, 22 studies) — it's a memory artefact, not a stats dump. It's also the single best re-engagement surface you can build without push notifications.

### 5.3 The Comeback Path `high value · 0.25 day`

Almost every game misses this, and for this audience it is critical — a lapse is far more likely to mean illness or travel than boredom.

On return after 3+ days:

- **No punishment. No wilted-everything catastrophe.** Cap wilt damage regardless of absence length.
- A warm return card: *"Welcome back. Your garden waited for you."*
- The `dev_return` achievement fires.
- Streak restores to its **pre-absence value**, not to 1, on the first exercise completed back. Frame it as the garden remembering them.
- Daily tasks that day are all drawn from the **gentle** pool.

### 5.4 Mastery tracks `medium value · 0.5 day`

Per-exercise-type horizontal progression: Tile Match I → V, earned by cumulative completions, each unlocking a cosmetic tile-back. Gives long-term players a reason to keep playing types they've "finished" and pairs with the adaptive difficulty in `GAME_ANALYSIS.md` `GD-06`.

### 5.5 Garden visitors `medium value · 0.5 day` *(pairs with 3D)*

Birds, butterflies, and a neighbourhood cat appear on the shelf when garden health is high, and can be "collected" into the Almanac once seen. Ambient, requires no action, and rewards the state of the garden rather than the player's activity — a fundamentally different and gentler motivator. Strong synergy with `PLAN_3D_GARDEN.md` G8.

### 5.6 Seasonal chapters `medium value · deferred`

Six-week themed chapters — Monsoon, Dry Season, Mid-Autumn — each with a themed seed, backdrop, and three chapter-specific Almanac plates. The standard content cadence for long-term retention. Post-hackathon.

### 5.7 Milestone gift moments `low value · 0.25 day`

At 25/50/100 exercises, a wrapped gift appears on the shelf and is opened with a tap. **Fixed contents, not randomised** — your notes correctly cut gacha for regulatory reasons, and a deterministic gift keeps the ceremony without the mechanic.

### 5.8 The photo journal `low value · deferred` *(needs 3D photo mode)*

Saved garden photos with dates, browsable as a book. Combines `PLAN_3D_GARDEN.md` G4 with the reminiscence framing. The most emotionally valuable feature in this list and the one most clearly out of scope this week.

---

## 6. Consolidated state schema — v4

```js
const SCHEMA_VERSION = 4;

const DEFAULT_STATE = {
  // … all existing v3 fields unchanged …

  identity: {
    playerId: null,          // crypto.randomUUID(), lazily created
    gardenName: null,
  },

  stats: {                   // monotonic counters — never decrease
    plantsWatered: 0, plantsBloomed: 0, plantsRevived: 0,
    exercisesCompleted: 0, perfectExercises: 0, levelsReplayed: 0,
    islandsCompleted: 0, distinctDaysPlayed: 0, monthsPlayed: [],
    decorPlaced: 0, photosShared: 0,
  },

  achievements: {},          // { achId: highestTierIndexEarned }
  achievementQueue: [],      // pending awards not yet presented

  daily: {
    date: null,              // todayStr() the set was rolled for
    tasks: [],               // [{ id, progress, target, done, claimed }]
    weekStart: null,         // Monday of current Garden Week
    weekCompleted: 0,        // daily tasks completed this week
    weekClaimed: false,
  },

  social: {
    enabled: false,          // master opt-in for anything networked
    circleCode: null,
    leagueOptIn: false,
    pendingDeltas: { watered: 0, exercises: 0, blooms: 0 },
    lastSync: null,
  },

  absence: {
    lastStreakBeforeGap: 0,  // for §5.3 restoration
  },
};
```

**Migration v3 → v4** extends the existing `migrateState()` (`game.js:48`). All new fields are additive with safe defaults, so migration is a merge — no data loss, no destructive transform.

**Backfill on migrate** so existing players aren't robbed of achievements they've already earned:

```js
base.stats.exercisesCompleted = old.totalExercises || 0;
base.stats.plantsBloomed = (old.plants || []).filter(p => p.state === 'bloom').length;
base.stats.islandsCompleted = countCompletedIslands(old.levelProgress);
// then run a full evaluateAll() once, presenting awards silently (no toast storm)
```

---

## 7. Integration points

| Hook | Line | Add |
|---|---|---|
| `waterPlant()` | `681` | `bumpStat('plantsWatered')`; `if (wasWilt) bumpStat('plantsRevived')`; `progressTask('g_water1','c_waterall','c_revive')` |
| `completeExercise()` | `1405` | `bumpStat('exercisesCompleted')`; `if (noMistakes) bumpStat('perfectExercises')`; `progressTask('c_ex1','s_ex3','s_perfect', …)`; drain `achievementQueue` into the completion card |
| `updatePlantStates()` | — | on `→ bloom` transition: `bumpStat('plantsBloomed')`, `progressTask('s_bloom')` |
| `plantSeed()` | `1182` | `progressTask('s_plant')`; recompute `col_seed` |
| `checkMealUnlocks()` | `216` | recompute `col_meal` |
| `markLevelComplete()` | `847` | `progressTask('c_level')`; recompute `mind_island` |
| `updateStreak()` | `158` | `bumpStat('distinctDaysPlayed')`; push month to `monthsPlayed`; roll daily tasks if `state.daily.date !== todayStr()`; detect gap → §5.3 |
| `init()` | `2025` | ensure `identity.playerId`; roll dailies; drain achievement queue; flush `pendingDeltas` |
| `showScreen()` | `327` | `progressTask('g_visit','g_shop','g_almanac')` |
| `document.visibilitychange` | new | flush `pendingDeltas` to the community endpoint |

`progressTask()` is a no-op for task IDs not in today's set, so hooks can be sprinkled without conditionals.

---

## 8. Anti-patterns — do not ship these

Every one of these is standard practice in mainstream F2P and **wrong for this audience**:

| Anti-pattern | Why it's wrong here |
|---|---|
| Countdown timer on daily tasks | Violates the "no timers anywhere" floor; creates anxiety |
| "You lost your streak!" | Shame messaging; the person may have been unwell |
| Global rank number | Status signal; correlates with aging anxiety |
| Red badges / urgency dots | Reads as an alarm, not an invitation |
| Ranking by accuracy or speed | Ranks the user by their cognitive decline |
| Achievements for spending | No IAP in this product; don't build the affordance |
| Randomised loot | Gacha — cut for regulatory reasons; keep it cut |
| Auto-disappearing UI | Disorienting; keep completed cards visible in a collapsed state |
| "Inactive" markers on other players | Publicly marks a person as absent, possibly ill |

---

## 9. Rollout against the deadline

**5 days left.** Ordered so you can stop at any point with something shippable.

### Phase A — Foundation `~3 hours`

Schema v4 + migration + backfill. `state.stats` counters wired into all §7 hooks. No UI. Nothing visible, everything measured — and once counters run, everything below is fast.

### Phase B — Achievements `~5 hours`

`data/achievements.js`, `sim/achievements.js`, the Almanac view inside Profile, award presentation on the completion card. **Highest value-per-hour in this document** — fully offline, zero backend, zero social risk.

### Phase C — Daily tasks `~4 hours`

Pools, deterministic roll, `progressTask()`, the Garden card, Garden Week tracker.

### Phase D — Community Garden (Tier 1) `~3 hours`

One EdgeOne function, one KV key, offline queue, the aggregate card. First networked feature — build the offline fallback *first*, not last.

### Phase E — Garden Circle (Tier 2) `~6 hours`

Create/join by code, member list, encouragement reactions. **The highest-value social feature; protect this over Tier 3.**

### Phase F — if time remains

Comeback Path (§5.3, ~2h — I'd pull this forward ahead of E if the demo will show a returning user) → Weekly Letter (§5.2) → Gentle League (Tier 3, only with the usability test in §4.3).

**Realistic assessment:** A through C are comfortable. D is achievable. **E is tight and depends on EdgeOne KV being provisioned and tested early** — if that's not stood up by end of day 6, cut to Tier 1 only and spend the time on §5.3 instead.

---

## 10. Open questions

1. **Is EdgeOne KV actually provisioned on your project yet?** This gates D and E entirely. Verify on day 1, not day 4 — it's the only external dependency in this plan.
2. **Fifth nav tab, or Almanac inside Profile?** I've specced it inside Profile to protect the 64px tap-target floor. If you want a fifth tab, the nav needs a redesign first.
3. **Does the Garden Circle need moderation?** Encouragement is a fixed set of three reactions with no free text, so the surface is minimal — but garden *names* are user-supplied and displayed to others. Minimum: a profanity filter and a length cap.
4. **Is Tier 3 in scope at all?** My recommendation is no for this deadline — it's the only item here that needs user testing to be safe, and testing time is what you don't have.
5. **Does the demo script show a returning user?** If yes, §5.3 Comeback Path moves ahead of Phase E — it's a two-hour build that makes the "gentle, never punishing" thesis legible to judges in a single screen.

---

## 11. Sources

- [Badge Gamification: Why Most Achievement Badges Fail — Yu-kai Chou](https://yukaichou.com/gamification-study/badge-gamification-guide/)
- [Designing Achievements for Optimal User Engagement — Trophy](https://trophy.so/blog/designing-achievements-for-optimal-user-engagement)
- [How Achievement Mechanics Boost Player Motivation — AC&A](https://adriancrook.com/how-achievement-mechanics-boost-player-motivation/)
- [Daily Quests — Gaming Glossary](https://www.larksuite.com/en_us/topics/gaming-glossary/daily-quests)
- [Strategies to Increase Mobile Gaming App Retention — Segwise](https://segwise.ai/blog/boost-mobile-game-retention-strategies)
- [Introduction to quest design — Roblox Creator Hub](https://create.roblox.com/docs/production/game-design/introduction-to-quest-design)
- [Effects of Game Mode in Multiplayer Video Games on Intergenerational Social Interaction — PMC](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC8892273/)
- [Older Adults' Individual Trajectories in Social Status and Aging Anxiety — PMC](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC9766671/)
- [A Bowling Exergame to Improve Functional Capacity in Older Adults — PMC](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC7880815/)
- [Edge Functions: Serverless Code Execution on EdgeOne — Tencent](https://edgeone.ai/document/162227908259442688)
- [Node Functions — EdgeOne Pages](https://pages.edgeone.ai/document/node-functions)
