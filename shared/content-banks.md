# Content bank convention

Every generated line in every CtrlAI game comes out of a content bank, routed through
`shared/ai.js`. This is mocked AI on purpose. Template plus slots is a real procedural
system, it runs offline with no key and no network, and it keeps the seam in one place so
swapping in a real model later is an edit to one function body, not a rewrite of three games.

## Where banks live

One JSON file per game, under its own directory:

```
games/memory-garden/content/plants.json
games/mahjong-kakis/content/kaki-banter.json
games/scam-dojo/content/scam-scripts.json
```

Name the file after what it holds. A game may have several. Nothing outside a game's
directory reads its content.

## Shape

A flat object. Keys are event names, values are arrays of template strings.

```json
{
  "round_win": [
    "Wah {name}, steady lah. That set was clean.",
    "{name} again? Aiyoh, I cannot keep up with you today.",
    "Good one, {name}. Uncle here needs more kopi."
  ],
  "slow_turn": [
    "No rush, {name}. The tiles are not going anywhere.",
    "Take your time. We are all here for the company anyway."
  ]
}
```

Event keys are lowercase with underscores. Keep them descriptive of the moment, not the
text, so a new writer can add lines without reading the code: `round_win`, `near_miss`,
`return_visit`, `first_plant`, `tell_missed`.

## Slots

`{slot}` placeholders are filled from the `context` object passed to `aiGenerate`. Slot
names are letters, digits and underscores only.

```js
import { registerBank, aiGenerate } from '../../shared/ai.js';
import bank from './content/kaki-banter.json' with { type: 'json' };

registerBank('mahjong-kakis', bank);

const line = await aiGenerate({
  game: 'mahjong-kakis',
  event: 'round_win',
  context: { name: 'Ah Ma', streak: 3 }
});
// line.text -> "Wah Ah Ma, steady lah. That set was clean."
// line.meta -> { source: 'bank', game: 'mahjong-kakis', event: 'round_win', template_index: 0, missing_slots: [] }
```

A slot with no matching context value is removed and the surrounding spacing is repaired,
so a missing name gives "Wah, steady lah" rather than a visible `{name}`. The slot name is
listed in `meta.missing_slots` so it is still catchable while building.

Pass `context.seed` when a line must be reproducible, for example replaying a saved plant's
story. Leave it off and the pick advances on its own.

## Writing the lines

- Four to eight variations per event. Under four and the repetition shows inside one
  session. Over eight and nobody finishes writing them tonight.
- Vary sentence length across the variations, not just the words. Repetition reads as
  robotic through rhythm before it reads as robotic through vocabulary.
- Every line must make sense with every slot empty. Read it once that way before saving.
- No emoji. No em dashes. Singlish is welcome where a character would actually use it.
- Scam Dojo only: no real bank, agency or company names. Fictional brands, recognisable
  patterns.

## The seam

`aiGenerate` never throws. An unknown game or event returns a neutral line with
`meta.source === "fallback"`, so a missing bank shows up as a bland moment rather than a
dead screen. `meta.source` is also what the demo uses to show which lines were generated,
and it becomes `"llm"` on the day a real model is wired in behind the same signature.
