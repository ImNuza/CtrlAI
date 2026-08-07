---
title: "Mahjong Kakis → Kopitiam Corner: the port"
project: "Age Well: Garden of Life"
team: CtrlAI
date: 2026-08-05
source: archive/mahjong-kakis/ (round-one prototype, ES modules)
target: app/ (round-two build, one classic script)
status: ported and driven live at 390x844 and 375x667
---

# Mahjong Kakis → Kopitiam Corner

Mahjong Kakis was a standalone page: four ES modules, a fetched JSON bank, its
own stylesheet, its own tokens, its own name screen and its own win card. It is
now the fifth island of Garden of Life, living inside the existing exercise play
screen.

This document is the record of what that cost. It is deliberately specific about
what was dropped and what is still not right, because the archived build is
still in the repo and somebody will diff them.

---

## 1. The shape of the move

| Was | Is now | Why |
|---|---|---|
| `archive/mahjong-kakis/game.js` (694 lines, ES module) | a section of `app/game.js` | `app/game.js` is a classic script loaded with `<script src>`. No module graph exists to hang an import on. |
| `archive/mahjong-kakis/tiles.js` | `buildKakiWall()` + face generators in the same section | Same reason. The identity objects lost their `svg()` closure and carry a plain string; the closure never did anything. |
| `archive/mahjong-kakis/kakis.js` | portraits + the banter functions in the same section | `createBanter()` was a factory returning a closure over one bubble. There is exactly one table, so it is now script-level state (`kakiBanterState`), matching how `playState` already works in this file. |
| `content/kaki-banter.json`, fetched | `KAKI_BANTER`, an inline const | **This is the load-bearing one.** See §2. |
| `shared/ai.js` `aiGenerate()` | `kakiGenerate()` in `app/game.js` | Same signature, same `{ text, meta }` shape, same SWAP POINT comment. `hashString` and `makeRng` came with it. |
| `shared/storage.js` | the existing `state` / `saveState()` | One save file, one schema, one migration path. |
| `style.css` (735 lines) | a section of `app/styles.css` (~330 lines) | Remapped onto the botanical palette. See §3. |
| its own `<section data-screen>` markup | rendered into `#play-area` / `#play-footer` | It is an exercise now, so it uses the exercise chrome. |

### What was dropped, and why

- **The standalone win card** (`.mk-win`, the scrim, `--mk-win-top`, `syncWinTop()`,
  the drifting `.mk-cheer` shapes). `completeExercise()` already is the win card:
  it awards the level's coins, marks the level complete, hands out a seed, fires
  the celebration and offers the next level. Keeping a second one would have
  meant two celebrations for one round.
- **`Back to hub` and the game-name header.** The play screen has its own back
  button and title.
- **The `body[data-wall="big"]` hook.** Moved to `.kaki-table[data-wall]`, because
  `body` is now shared with four other exercises and a garden.
- **The bank fetch and its failure path.** Nothing to fail. The neutral-line
  fallback in `kakiGenerate()` is kept anyway: it still fires for an unknown
  event key or a garbage request, both of which are verified.

### What was gained

The archived build reset the current wall on reload and could push the player
bar off the bottom of a small phone. Here the bar lives in `.play-footer`, which
is outside the scroller, so it cannot be pushed anywhere.

Renaming is also better. The archive reached the rename control from the win card
and re-dealt afterwards, because there was no round in flight to protect. Tapping
your own name now reopens the chooser mid-round and returns you to **the same
wall with the same progress**. The name panel and the table are siblings that
both stay in the DOM, so nothing is rebuilt.

---

## 2. Why the bank is inlined and not fetched

`app/sw.js` precaches a fixed `SHELL` list. A fetched `content/kaki-banter.json`
would have needed a new entry there, a new file in the deploy root, and a
first-load network round trip before any kaki could speak, and if that round
trip failed on a cold offline start, the first thing a new player would meet is
the neutral fallback line instead of a greeting that teaches the game.

Inlining costs about 200 lines in `game.js` and buys: no new shell entry, no
`CACHE_VERSION` coupling to a content file, and a table that greets you properly
on a first offline load. It also matches how every other content bank in this
file already works (`SEEDS`, `MEALS`, `ACHIEVEMENTS`, `ODD_SETS`, `WORD_PAIR_SETS`
are all inline consts).

The trade: editing banter means editing `game.js`, and the swap to a real model
means `KAKI_BANTER` becomes the fallback rather than being deleted. The SWAP
POINT comment says so.

---

## 3. Every colour that was remapped

The archived build ran on the CtrlAI round-one tokens: a warm-white page, a
kopitiam amber, and a per-game accent. None of those exist in the Muted Botanical
palette, and two of the tile suits were literally borrowed from the other two
prototypes' accent colours.

### Tokens

| Archived | Now | Note |
|---|---|---|
| `--color-bg` `#fbf6ee` | `--bg-primary` `#EEE9D9` | |
| `--color-surface` `#fffcf7` | `--bg-surface` `#F5EFEB` | |
| `--color-surface-sunk` `#f3ebde` | `--bg-inset` `#E3DBCA` | |
| `--color-text` `#241c14` | `--text-primary` `#2B2118` | |
| `--color-text-muted` `#5a4a3a` | `--text-muted` / `--text-secondary` | |
| `--color-border` `#9c8a6c` | `--border-mid` / `--border-strong` | |
| `--accent-kopitiam` `#7a3f06` | `--kopi-accent` `#7A4800` | `#7A4800` was already in `app/styles.css` as the Pattern Peaks icon colour, so this reuses an existing value rather than inventing one. |
| `--accent-kopitiam-tint` `#f7e9d4` | `--kopi-tint` `#EAE2D0` | Same value as `--bg-deep`. |

### Tile suits

| Archived | Now | Contrast on a tile face (`#F5EFEB`) |
|---|---|---|
| dots: `--accent-dojo` `#14548c` (Scam Dojo blue) | `--kaki-dots` `#7B5371` (accent plum) | 5.53:1 |
| bamboo: `--accent-garden` `#1b5e38` (Memory Garden green) | `--kaki-bamboo` `#44573D` (foliage shadow) | 6.85:1 |
| winds: `--color-danger` `#9b2226` | `--kaki-wind` `#AE382B` (brick red) | 5.39:1 |

Non-text graphics, so the floor is 3:1. All three clear it comfortably.

`--kopi-accent` is used as text (the bubble speaker name, the player name) and
measures **6.66:1 on `--bg-surface`** and **5.91:1 on `--kopi-tint`**. Both are AA
for all text and AAA for the large sizes they are actually used at.

### The three portraits

Decorative, `aria-hidden`, never text, so no ratio applies. But they were pink,
purple and slate, which is not this palette.

| Archived | Now |
|---|---|
| `--mk-lily-shirt` `#d98aa3` | `--kaki-lily-shirt` `#E07A5F` (accent coral) |
| `--mk-lily-flower` `#c2506e` | `--kaki-lily-flower` `#C82A36` (accent crimson) |
| `--mk-flower-heart` `#e8b34a` | `--kaki-flower-heart` `#E78F37` (accent orange) |
| `--mk-beng-cap` `#2f4858` | `--kaki-beng-cap` `#31482E` (foliage deep) |
| `--mk-beng-cup` `#efe0c9` | `--kaki-beng-cup` `#EAE2D0` (bg deep) |
| `--mk-rose-shirt` `#8579ad` | `--kaki-rose-shirt` `#7B5371` (accent plum) |
| `--mk-hair-dark` `#33261c` | `--kaki-hair-dark` `#2B2118` (text primary) |
| `--mk-hair-grey` `#9b968f` | `--kaki-hair-grey` `#B1B8A1` (foliage highlight) |
| `--mk-skin` `#e7bd94` | `--kaki-skin` `#E0BC94` |

**`--kaki-skin` is the one new value in the whole port.** A botanical palette has
no skin tone and a foliage green would not do. It sits in the same warm family as
`--color-earth`. Everything else above is an existing palette value.

They read as coherent with the garden now. They do not read as identical to the
round-one portraits. That was the trade and it is worth a second opinion.

---

## 4. The dial versus the level ladder

The two systems collided. Mahjong Kakis moved the wall between 8 and 16 tiles off
your recent miss rate; Garden of Life islands hardcode a size per level.

**Resolution: the level sets a base, the dial moves it one pair either side.**

- Each of the 8 Kopitiam levels carries a base `pairs` (4, 4, 5, 5, 6, 6, 7, 8).
- `nextKakiDial()` holds a `pairShift` in `[-1, +1]` and a `lookalike` share in
  `[0.25, 1]`, both moved by the miss rate over the last 3 finished rounds.
- Miss rate below 0.2 is "flowing": shift up, lookalikes crowd in. Above 0.45 is
  "working": shift down, lookalikes thin out. Between the two, nothing moves,
  the band is deliberately wide so the dial does not twitch every round.
- It steps at most once per **finished** round. Reopening the island mid-profile
  does not walk it, which is what `dialAt` is for.

Nothing in the UI names any of this. The level labels describe a time of day at a
kopitiam, not a difficulty.

### One bug this shook out

`kakiProfile()` originally re-ran `adoptKakis()` on every call and returned a
**fresh object** each time. `dealKakiRound()` holds a profile reference while
`nextKakiDial()` asks for the profile again, so the newly computed dial was
written to an orphaned object and `state.kakis` kept the old one. The wall was
still built from the correct local, so it *looked* fine: the shift read as +1
every single round because it was always recomputed from a stored 0.

It is now normalised once per page load behind a `kakiProfileReady` flag and
returns the same object forever after. Anything that holds a profile across a
nested call depends on that.

---

## 5. A regression the schema bump exposed

`migrateState()` carried this line from v3:

```js
base.shelves = Math.max(1, Math.ceil((base.plants.length || 1) / 3));
```

It recomputes shelf count from how many plants are currently standing. That was
harmless while v3 was the only migration anyone ran. Bumping the schema to **v5**
for `state.kakis` sends *every existing v4 save* down this path, so a player who
had bought shelf 2 for 60 coins and happened to have two plants standing would
have silently lost a shelf and three pots.

Fixed: a stored count is kept, and the plant-count floor is only a backstop for
saves from before shelves existed. Verified with a synthetic v4 save carrying
3 shelves and 2 plants (keeps 3), a v3 save with 7 plants and no shelf key
(computes 3), and a save with `shelves: 'lots'` (falls back to the floor).

This was not caused by the Kakis port, but it was uncovered by it and would have
shipped.

---

## 6. What the island plugs into

The island is not a bolt-on. It uses the same economy as the other four:

- `kakis` in `EXERCISE_META`, so the level path draws it like any other type.
- A `kopi` seed (Coffee Shrub, *Coffea liberica*, 18 coins) with
  `exerciseType: 'kakis'`, so first-clearing a level awards and plants it exactly
  as the other four types award theirs.
- A `kopitoast` meal card (Kopi and Toast: kopi + pandan).
- `c_kakis` in the core daily-task pool.
- `mind_kakis` ("Kopitiam Regular") in the Mind almanac category, tiers at 3, 10
  and 25 cleared tables, off a new `stats.kakiRounds`.
- `playState.mistakes` is set from the round's miss count, so a clean table
  counts toward `perfectExercises` and the `s_perfect` task like everything else.

`icon-kopi` was added to the SVG symbol defs in both `app/index.html` and
`design-system/design-system.html`.

### Where it sits in the course list, and why

**Last, and `alwaysOpen: true`.**

The four original islands form a chain: island *n* unlocks on five levels of
island *n-1*, and `getIslandUnlockState()` reads `ISLANDS[idx - 1]`. Inserting
Kopitiam Corner anywhere in the middle would have rewired that chain. Pattern
Peaks would suddenly have gated on Kopitiam progress instead of Memory Meadow.
Appending leaves the friend's progression byte-for-byte intact.

`alwaysOpen` then means it is never gated behind anything: the kakis' table is
somewhere you sit down, not a course you ladder into. It is card 5 of 5 but it is
the only unlocked one besides Memory Meadow, which makes it stand out rather than
hide.

---

## 7. What was verified, and how

Driven live in a browser at **390x844** and **375x667**, against `node server.js`.
Not a unit suite: the real DOM, real clicks, real `localStorage`.

Confirmed working:

- Course list: Kopitiam Corner unlocked from a standing start, Pattern Peaks /
  Logic Lake / Word Woods still locked with their original unlock copy intact.
- Level path renders with the coral header, kopi icon, "MAHJONG KAKIS" type tags
  and coral dashed connectors.
- Name chooser: four chips plus free text. **An empty or whitespace-only box
  stores nothing and starts nothing**. The caret just goes back to the input.
- Deal: every identity appears exactly twice, dot row matches the pair count,
  `aria-label` on every tile names its face.
- Mismatch: both tiles wiggle, a warm line lands, both return to idle after the
  hold, `playState.mistakes` tracks.
- Nudge at 6 taps since the last match. Second nudge running breathes **a real
  pair** (verified the two glowing indices share a tile id).
- Win: `round_win` line lands and is readable for 1.5s before the completion card
  replaces the table. Coins, seed award, level completion, `kakiRounds`,
  `perfectExercises` and `c_kakis` all fire.
- Dial: verified in both directions and at both clamps, including a hostile save
  with `pairShift: 99, lookalike: 42` (clamps to 1 and 1).
- Return visit: skips the chooser, increments visits, a **different** kaki greets
  you by name with a history phrase. 5 distinct lines across 6 visits.
- Rename mid-round keeps the wall, the progress and every stat.
- Resilience: unknown event key, missing history slot and a `null` request all
  return a sentence with no `{placeholder}` and no throw.
- All 40 levels across all 5 islands launch and render with zero window errors.
- v4 → v5 migration keeps coins, streak, plants, seeds, meals, level progress,
  achievements and stats; `kakis` starts null and adopts cleanly.
- Reduced motion: the app's global `animation-duration: 0ms !important` rule
  covers every kakis animation, and the glow has a steady 5px edge fallback.
  Verified the rules exist in the CSSOM.

---

## 8. Known limits, stated plainly

**The PWA layer is unverified.** Service workers need HTTPS or localhost. Install
prompt, Add to Home Screen, and an airplane-mode reload all need a real phone
against a deployed preview. `CACHE_VERSION` is bumped to `gol-v2`; the shell list
is unchanged because the port added no files to `app/`.

**Short phones cap at three rows.** Eight pairs is four rows, which fits an
844px phone but not a 667px one, because this play screen spends roughly 190px on the
header and player bar that the standalone prototype never had. Below 700px tall,
`kakiMaxPairs()` caps the wall at 6 pairs and the chrome trims (portraits to
3rem, bubble to two resting lines, dots stand down under 24rem). Measured on a
375x667 viewport: tiles rest at 68x74, the second row peeks 29px past the fold so
it is obvious there is more, and reaching the last row is one 152px flick. An SE
player therefore never sees the largest wall, so the dial's top end is invisible
there. That is a real reduction in what the dial can express on a small phone.

**Leaving mid-round discards the wall.** Same as the archived build. Back out and
the same level re-deals from scratch. Finished rounds, your name, best clear and
the dial always persist. In-round resume is a real-build item.

**The portraits are a judgement call.** Remapped onto botanical accents, verified
coherent, not verified as *liked*. Somebody with taste should look at them.

**`mind_allfour` still counts four types, not five.** Kakis is the fifth exercise
type, but the "Well-Rounded" achievement fires on the fourth distinct type played
in a day. Left alone on purpose: changing it to five moves the goalposts for
anyone already partway there. Its name is now very slightly a lie.

**No automated suite for `app/`.** The archived Playwright scripts under
`archive/mahjong-kakis/qa/` exercise the *archived* ES-module build, not the port.
They remain a good description of intended behaviour but they do not test what
ships. Everything in §7 was driven by hand.

**`archive/mahjong-kakis/` is still in the repo** and still runs at
`/archive/mahjong-kakis` off `shared/ai.js`. It shares no state with `app/`
(different `localStorage` keys). It is the reference this port was read from;
delete it once the port is trusted.
