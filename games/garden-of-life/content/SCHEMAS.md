# Garden of Life content schemas. Binding for every agent.

These schemas implement SPEC.md v0.3. Counts are minimums unless marked exact.
RULES.md content standards apply to every line: read it aloud, no guilt, no
medical claims, no brands, Singapore register, warm.

Who produces what:

- `memory-prompts.json`, `gardener-lines.json`, `meal-cards.json`: content workflow.
- `plant-traits.json`: the U1 coder under the core orchestrator, because species
  design and visual parameters move together.
- `qa/lint-content.mjs` validates all four against this file.

## Fixed vocabularies (closed sets, use exactly these ids)

Heritage objects (8, exact, SPEC v0.3):
`kopitiam-cup`, `setron-tv`, `sewing-machine`, `kampung-house`,
`rediffusion-set`, `provision-shop`, `dragon-playground`, `tingkat`.

Trait axes consumed by the composer:

- palette: `warm`, `happy`, `wistful`, `calm`, `proud`
- bloom: `one-big`, `pair`, `trio`, `cluster`, `many`
- ornament: `kampung`, `first-flat`, `kopitiam`, `market`, `seaside`

Crops (10, closed set; shop, photo quest, and meal cards all draw from this):
`bayam`, `kangkung`, `chye-sim`, `chilli`, `tomato`, `calamansi`, `pandan`,
`ginger`, `long-bean`, `sweet-potato-leaf`.

Canned photo finds (8, closed set, must match `photoFindChoices()` in
`shared/ai.js`): `bougainvillea`, `hibiscus`, `frangipani`, `money-plant`,
`orchid`, `fern`, `heliconia`, `rain-tree`.

The gardener is one fixed character: Auntie Bee, sixties, warm, plant-mad,
never preachy. Every line is hers.

## memory-prompts.json

```json
{
  "version": 1,
  "objects": [
    {
      "id": "kopitiam-cup",
      "label": "Kopitiam cup",
      "phrase": "the kopitiam cup",
      "blurb": "Thick white cup, kopi o kosong, morning talk.",
      "prompts": [
        {
          "axis": "who",
          "q": "Who sat with you there?",
          "free_text": false,
          "chips": [
            { "id": "mother", "label": "My mother", "phrase": "with my mother", "tags": ["bloom:one-big"] }
          ]
        }
      ]
    }
  ]
}
```

Rules, all binding:

- 8 objects, exact ids above. `label` 3 words max, `blurb` 10 words max.
- Exactly 3 prompts per object, in axis order `who`, `where`, `feeling`.
  Question wording is free per object (that is the craft), the axis is not.
- `q` 10 words max, ends with a question mark, never reads like a survey.
- Exactly 4 chips per prompt. Chip `label` 4 words max.
- Chip tags: every `who` chip carries exactly one `bloom:*` tag, every `where`
  chip exactly one `ornament:*` tag, every `feeling` chip exactly one
  `palette:*` tag, values from the closed sets. Extra tags are allowed after
  the required one but the composer only reads the first per axis.
- Within one prompt the 4 chips must not all map to the same trait value,
  otherwise answers stop mattering. At least 3 distinct trait values per prompt.
- Chip `phrase` must read inside a sentence after the object phrase:
  who reads like "with my mother", where locates ("by the big drain"),
  feeling is a feeling phrase ("warm and cosy"). Lowercase start, no period.
- `free_text: true` on at most one prompt per object. It marks that prompt as
  also offering an optional typed line, framed as the grandchild helping. The
  4 chips still exist and still carry tags; the typed line is stored for replay
  only and never parsed.
- Across the 8 objects, prompts must not repeat wording. "Who is in this
  memory" eight times is a survey, which the standards ban.

## gardener-lines.json

```json
{
  "version": 1,
  "events": {
    "first_visit": [
      {
        "text": "New face! I am Auntie Bee. What do I call you?",
        "replies": ["I will tell you", "Just call me friend"]
      }
    ]
  }
}
```

Event keys, all 11 required: `first_visit`, `return_visit`,
`return_after_absence`, `planting`, `plant_comment`, `watering`, `wilt_notice`,
`harvest`, `meal_unlock`, `photo_result`, `story_retell`.

Rules, all binding:

- Minimum 5 lines per key after review, 50 total minimum across the first 10
  keys (story_retell is extra, minimum 5).
- `text` 12 words max. Slots allowed: `{name}`, `{plant}`, `{memory_hint}`.
  story_retell additionally allows `{object_phrase}`, `{who_phrase}`,
  `{where_phrase}`, `{feeling_phrase}` and should use them; it is the line the
  plant tells when its story replays.
- Lines must survive an empty slot: shared/ai.js drops missing slots and
  tidies, so "Good to see you, {name}!" degrades to "Good to see you,!" - wrong.
  Write so the sentence still works without the slot or keep the slot mid
  sentence with its own words around it. The linter checks trailing
  ", {name}!" shapes and flags them.
- 2 or 3 `replies` per line, each 4 words max, tappable answers a senior would
  actually say. Replies never ask the player to type.
- `return_after_absence` and `wilt_notice` are warmth-critical: gladness and
  reassurance only. The plant perked up because you came back, never "you
  neglected me". Any line that could read as guilt gets cut.
- `photo_result` lines react to a found plant; `{plant}` carries the find label.
- Register: Auntie Bee. Light lah/ah where it lands naturally, never forced,
  never mocking. No exclamation mark pileups.
- Consumption contract for coders: gardener.js registers each event's `text`
  array with `registerBank('garden-of-life', ...)` in file order, then uses
  `meta.template_index` from `aiGenerate` to look up that line's `replies`.
  File order is therefore load-bearing; the linter checks nothing reorders it.

## plant-traits.json

Produced by the U1 coder. Visual data for the composer, no prose.

```json
{
  "version": 1,
  "species_by_object": { "kopitiam-cup": "kopi-vine" },
  "species": {
    "kopi-vine": {
      "label": "kopi vine",
      "stages": [
        { "scale": 0.45, "blooms": false, "ornament": false, "sprout": true },
        { "scale": 0.75, "blooms": false, "ornament": true, "sprout": false },
        { "scale": 1.0, "blooms": true, "ornament": true, "sprout": false }
      ]
    }
  },
  "palettes": { "warm": { "label": "amber", "bloom1": "#a6600b", "bloom2": "#9c3f1c", "leaf": "#4a6b2f", "leafDark": "#33501f", "accent": "#7a3f06" } },
  "blooms": { "one-big": { "motif": "petals", "count": 1, "placement": "single", "size": 11 } },
  "ornaments": { "kampung": { "draw": "kampung" } },
  "crops": {
    "bayam": {
      "label": "Bayam",
      "archetype": "leafy",
      "palette": "calm",
      "price_tier": "common",
      "stages": [ { "scale": 0.45 }, { "scale": 0.75 }, { "scale": 1.0 } ]
    }
  },
  "defaults": { "palette": "warm", "bloom": "one-big", "ornament": "kampung" }
}
```

Rules: all 8 objects mapped, 8 memory species with 3 stages each, all 5
palettes, all 5 blooms, all 5 ornaments, all 10 crops with `archetype` in
`leafy | fruiting | climbing | herb` and `price_tier` in
`common | uncommon | rare`. Palette hexes must keep bloom-vs-leaf and
plant-vs-background contrast readable at plot size; the existing memory-garden
palettes are the starting point and stay unless the style lock forces a retune.

## meal-cards.json

```json
{
  "version": 1,
  "dishes": [
    {
      "id": "sambal-kangkung",
      "name": "Sambal Kangkung",
      "crops": ["kangkung", "chilli"],
      "benefit": "Iron-rich greens with a proper kick.",
      "line": "The kind you order extra rice for."
    }
  ]
}
```

Rules: 6 dishes after review. `name` is the local name seniors actually say
(bayam soup, chap chye, fruit rojak territory, no Omega Bowls). `crops` is 2 or
3 ids from the closed crop set, every crop appearing in at least one dish across
the bank so nothing a player grows is a dead end, and no two dishes with the
identical crop set. `benefit` one line, plain food language, zero medical or
disease claims ("rich in fibre" fine, "prevents" or "protects against" banned).
`line` is one warm sentence of recognition, 12 words max, optional but wanted.

## Asset paths (code must not break while these are missing)

```
art/style/candidate-a.png .. candidate-d.png, LOCKED.md
art/gardener/welcome.png happy.png thinking.png watering.png concerned.png celebrate.png
art/objects/<object-id>.png            8, ids from the closed set
art/backgrounds/day.png dusk.png
art/meals/<dish-id>.png                6, ids from meal-cards.json
art/ui/coin.png seed-packet.png watering-can.png basket.png camera.png trophy.png share.png mute.png shop.png sprout.png
icons/icon-192.png icon-512.png
```

Integration contract: every art file loads through an `<img>` or CSS with a
working fallback (procedural SVG, colour block, or nothing) wired to `onerror`
or naturally absent layout. A missing PNG may never break layout or flow. Art
lands asynchronously during Phase 2 and 3.

## QA clock (binding for U5 streaks and QA)

All date reads in game code go through one state function that honours an
override set by QA (localStorage key `ctrlai:garden-of-life:qa-clock`, ISO date
string). Playwright QA simulates day changes by writing that key and reloading.
No other code path may call `Date.now()` or `new Date()` directly.
