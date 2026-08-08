# Miora art brief: Garden of Life

Everything needed to run the Miora art pass cold: the constraints, the order to
work in, the full asset inventory taken from the shipped code, and the prompt
scaffold every asset shares.

Miora is the mandated art tool. Its output is scored evidence, not just
decoration, so the capture rules in the last section are part of the job.

---

## 1. What you are working with

**Credits.** 1,000 per person, automatic on signup. Three signups pool 3,000.
This is the whole art budget for the submission.

**Scoring.** 40 of 100 points ride on documented AI-tool usage. CodeBuddy for
code, Miora for art. The deck's AI-creation section is written from the pile of
screenshots you take while doing this, so the capture is not optional.

**The app.** `app/` is the shipping build. Portrait phone only, design target
390x844. Four tabs: Patches, Exercises, Shop, Profile. Patches is the garden
itself, a pannable field of soil patches with a gardener you walk around it.
Five exercise courses feed coins into a seed shop; seeds grow through five
states; harvested plants unlock meal cards.

**Today's art is all procedural.** Every plant, tile, portrait and icon is
hand-written SVG inside `app/game.js` and `app/index.html`. It is deliberate
placeholder work. Miora replaces it.

---

## 2. The one decision to make before generating anything

`SPEC.md` says plants stay procedural, because per-answer visible variation is
the worldbuilding beat the rubric pays for and baked images would kill it.

**That reasoning was written for the old memory-garden composer**, which had
four independent trait axes and about 1,000 plant combinations. The shipped
`app/` build is far simpler: `plantSVG()` is deterministic from `(seedId,
state)` alone, and there are exactly **7 seeds x 5 states = 35** possible plant
appearances. Nothing varies per answer.

So for `app/` as it stands, baking 35 plant images loses nothing. You get real
botanical illustration instead of geometric SVG for the cost of 35 assets.

Confirm this with Dewa before spending credits, because it reads as a
contradiction of the locked spec unless someone explains why it is not. If the
team would rather keep plants procedural, generate the plants tier as **style
reference only** (one seed, five states) and spend the saved credits on the
bulk tiers instead.

---

## 3. Steps

1. **Sign up all three team members.** Credits are per person and pool to 3,000.
   No generation until all three are in.
2. **Check the balance and the per-image cost.** `RULES.md` forbids generating
   before a plan sized against real numbers. Divide 3,000 by the real per-image
   cost to get your true asset ceiling, then check it against the 118 in the
   inventory below and cut from the bottom tier if it does not fit.
3. **Settle the plants question in section 2** with Dewa.
4. **Lock the style.** Generate 3 or 4 candidates of *the same subject* (use
   Pandan Herb in bloom). Pick one. Everything after this uses the section 5
   scaffold with the winner's language baked in. Do not skip this: a
   consistent set of adequate art beats a mixed set of good art, and "art
   consistency" is named in the Project Quality rubric line.
5. **Build the gardener character sheet first.** It is the only recurring
   character and the only asset where drift is obvious. Lock the face before
   generating any pose.
6. **Generate in tier order** (section 4). Tier 1 is the game, tier 4 is polish.
   Stop when credits hit the reserve line, not when the list ends.
7. **Cut out backgrounds** with remove-background on an existing asset rather
   than regenerating with a transparent prompt.
8. **Integrate as you go** (section 6), one tier at a time. Do not generate all
   118 and then discover the aspect ratio is wrong.
9. **Log every call** to the ledger in section 7 as it happens.

**One retry per asset on a clear failure, then move on.** A slightly off
illustration beats an empty budget.

---

## 4. Asset inventory

Counts are taken from the shipped code, not estimated. 118 total.

### Tier 1: the garden (42). Generate first, this is the game

**Plants: 7 seeds x 5 growth states = 35.** States are `seed`, `sprout`,
`grown`, `bloom`, `wilt`. Each seed has a locked bloom colour that the
illustration must land on.

| Seed | Name | Latin | Bloom colour | Notes |
|---|---|---|---|---|
| `pandan` | Pandan Herb | *Pandanus amaryllifolius* | `#73875D` | Free starter, every player sees this first |
| `sampaguita` | Sampaguita | *Jasminum sambac* | `#E07A5F` | White jasmine, coral-warm centre |
| `fern` | Memory Fern | *Nephrolepis exaltata* | `#859B6A` | No true flower, frond detail carries it |
| `kopi` | Coffee Shrub | *Coffea liberica* | `#7A6B5C` | Red cherries at bloom, ties to Kopitiam Corner |
| `hibiscus` | Hibiscus | *Hibiscus rosa-sinensis* | `#C82A36` | Rare. Singapore's loudest red |
| `orchid` | Wild Orchid | *Vanda Miss Joaquim* | `#7B5371` | Rare. National flower, papery plum |
| `passion` | Passionfruit Vine | *Passiflora edulis* | `#E78F37` | Rare. Fruit visible at bloom |

The `wilt` state is drooping and thirsty, never dead or blackened. Nothing in
this game shames the player.

**Soil patches (4):** bare tilled patch, planted patch (darker, worked),
untilled locked ground, and a "just cleared" variant.

**Field surface (3):** a tileable grass texture and two edge or corner pieces.
The field is pannable and larger than the screen, so this must tile without a
visible seam.

### Tier 2: characters (17)

**The gardener (8).** One character sheet, then poses: idle facing camera, walk
cycle left, walk cycle right, watering, planting, harvesting, pleased. Small on
screen, about 52px, so it must read at thumbnail size. Generate the sheet
first and hold the face across every pose.

**Kopitiam kakis (9).** Three characters, three expressions each: neutral,
pleased, teasing.

| Id | Name | Current placeholder |
|---|---|---|
| `lily` | Auntie Lily | `kakiLilyPortrait()` |
| `beng` | Uncle Beng | `kakiBengPortrait()` |
| `rose` | Auntie Rose | `kakiRosePortrait()` |

They sit at a mahjong table, banter, and remember the player's name. Warm,
specific, elderly Singaporean. Not caricatures.

### Tier 3: collectibles and courses (34)

**Meal cards (7).** Unlocked by harvesting the right combination. These are the
collection reward, so they should feel like the nicest art in the game.

| Meal | Made from |
|---|---|
| Garden Salad | pandan + sampaguita |
| Hearty Soup | pandan + fern |
| Herbal Tea | sampaguita + fern |
| Garden Stir-fry | pandan + sampaguita + fern |
| Pandan Cake | pandan + hibiscus |
| Harvest Feast | sampaguita + fern + hibiscus + orchid |
| Kopi and Toast | kopi + pandan |

**Course emblems (5):** Memory Meadow, Pattern Peaks, Logic Lake, Word Woods,
Kopitiam Corner.

**Mahjong tiles (11):** four dots (1-4), four bamboo (1-4), three winds. Face-up
tiles in a memory-match game, so each face must be distinguishable at a glance
by an older player.

**Achievement badges (11 of 22).** There are 22 achievements; generate the 11
the player is most likely to see and reuse a generic frame for the rest. Full
list is `ACHIEVEMENTS` in `app/game.js`.

### Tier 4: interface and polish (25). Cut this first if credits run short

**UI icons (about 20).** 31 SVG symbols exist in `app/index.html`. Most are
fine as line icons; the ones that would gain from illustration are `icon-seed`,
`icon-bloom`, `icon-water`, `icon-coin`, `icon-meal`, `icon-kopi`, `icon-gift`,
`icon-streak`, `icon-garden`, `icon-leaf`, `icon-flower`.

**App icons (4).** 192px, 512px, apple-touch, favicon-32. These already exist in
`app/icons/` and are the lowest priority to replace.

**Share card frame (1).** Background for the shareable garden snapshot.

---

## 5. The prompt scaffold

Paste the block below as the base for every asset, then replace `[SUBJECT]`.
The style half never changes. Consistency across the set matters more than any
single image.

These rules are lifted from `design-system/design-system.html`, which already
has a section written for exactly this purpose.

```
[SUBJECT]

STYLE: Classical botanical illustration, vintage Singapore herbarium
field-journal. Fine sepia or warm dark-brown ink outline, 1-2px, with
cross-hatching for volume. Soft watercolour washes, never flat fills.
Visible paper grain.

COLOUR: Maximum 45% saturation. Value range 56-100% brightness. Never pure
black, never pure white. All shadows warm: taupe #958579 or deep olive
#44573D. Never grey, never blue-black. Greens restricted to the olive-to-sage
band: no blue-greens, no yellow-greens.

LIGHTING: Soft diffuse overcast. No hard specular highlights. No cast black
shadows.

COMPOSITION: Subject isolated on an empty warm neutral background (#EEE9D9).
No clutter, no props, no text. Tight framing, macro-adjacent. Visible
texture: leaf veins, petal edges, paper tooth.

NEGATIVE: no neon, no high saturation, no blue-green, no pure black, no hard
sunlight, no drop shadows, no text, no watermark, no border, no frame,
no 3D render, no photorealism, no glossy plastic.
```

**Per-tier `[SUBJECT]` patterns:**

- Plants: `Pandan Herb (Pandanus amaryllifolius), [STATE]. Single specimen,
  portrait orientation. Dominant colour #73875D.` Where `[STATE]` is one of:
  *a seed just pressed into dark soil, nothing above ground yet* / *a first
  pale shoot, two small leaves* / *established and healthy, full foliage, no
  flower yet* / *in full bloom* / *drooping and thirsty, leaves soft and
  downturned, still alive and recoverable*.
- Gardener: `An elderly Singaporean gardener, [POSE]. Full body, small figure,
  simple silhouette that reads clearly at 52 pixels tall. Straw hat, simple
  working clothes.`
- Kakis: `[NAME], an elderly Singaporean [auntie/uncle] seated at a mahjong
  table, [EXPRESSION]. Head and shoulders portrait.`
- Meals: `[MEAL NAME], a Singaporean home dish made from [INGREDIENTS]. Plated
  simply, viewed from slightly above.`

**Two rules that are easy to miss:**

- **Warm accents concentrated, not spread.** Roughly one asset in three should
  carry a warm accent as its main subject. Do not sprinkle coral and orange
  evenly across everything.
- **Everything renders on the app's warm parchment.** `#EEE9D9` primary,
  `#F5EFEB` surfaces. Art that assumes a white background will look wrong.

---

## 6. Getting assets into the build

**Format.** PNG with alpha, square, generated at 1024 and downscaled. The app
is a phone PWA where first-load weight matters: a previous pass took the art
from 8.4MB to 722KB, so hold that line. Target under 40KB per plant sprite,
under 80KB per meal card.

**Where they go.** `app/icons/` exists; add `app/art/plants/`,
`app/art/meals/`, `app/art/characters/`.

**How they get used.** `REBUILD-NOTES.md` is explicit that hand-concatenated
SVG strings are the wrong destination for Miora art. Replace `plantSVG()` and
`plantSVGFruit()` with a lookup returning an `<img>` path:

```
app/art/plants/{seedId}-{state}.png
```

which is a direct swap for the current `(seedId, state)` signature and touches
no call site. Keep the existing `data-*` attributes: every QA hook asserts
through `data-tile`, `data-state` and `data-screen` rather than through classes
or visual text, specifically so an art drop does not break the tests.

**Do not delete the procedural SVG.** Keep it as the offline fallback and as
honest evidence of the before-and-after, which the deck wants.

---

## 7. Evidence capture

This is where 40 points get argued. Capture as you go; it cannot be
reconstructed afterwards.

- **Screenshot every style candidate**, including the rejected ones. The
  rejects are what make the "we locked a direction" story credible.
- **Screenshot the gardener character sheet** and one drift failure if you get
  one. Showing a problem you caught and fixed scores better than implying it
  went perfectly.
- **Keep one before-and-after pair** per tier: procedural SVG beside the Miora
  asset in the running app.
- **Keep a ledger line per call:** asset, model, credits, kept or discarded.
  Check the total against the account balance delta at the end. Put it in the
  build report.

Post at least one progress shot with `#CodeBuddy #WorkBuddy #Miora
#TencentCloudHackathon` for the +5 social bonus.

---

## 8. If it goes wrong

- **Credits run out.** Stop. Placeholders fill the gaps, the gap list goes in
  the build report, and the game still ships. Tier 4 is designed to be cut.
- **Style drifts between batches.** Regenerate the drifted asset with the
  winning candidate attached as a reference image rather than adjusting the
  prompt language.
- **Miora access never lands.** Everything above is still the asset spec. The
  procedural art already in `app/` is a complete, shipping fallback, and the
  deck says so honestly.
