# Memory Garden

A senior and a grandchild share one phone. Pick a heritage object, answer three gentle questions by tapping chips, and a plant grows in the family garden. The plant is composed from the answers: the object sets its silhouette, the person sets the blooms, the feeling sets the colours, the place hangs a small ornament beside it. The garden persists on the device and fills over sessions. Tap any plant to hear its story again.

## How to run

From the repo root:

```
node server.js
```

Then open http://localhost:4173/memory-garden on a phone, or in a phone sized viewport. No build step, no network, no accounts.

## What works, for real

- The full loop: garden, object picker, three chip questions, grow ceremony, back to the garden with the new plant placed. About 9 taps, no typing required.
- 8 Singapore heritage objects, each mapped to its own plant silhouette. Same object with different answers gives visibly different blooms, palette and ornament. Same answers always regrow the identical plant (seeded, deterministic).
- The garden lives in localStorage and survives reloads and return visits. Corrupt saves fall back safely to an empty garden.
- Replay on tap: object, the chosen answers, the caption written when the plant was grown, plus a fresh narration line each visit.
- An optional free text line on the last question, labelled for the grandchild to type. It shows up quoted in that plant's story.
- Senior UX floor throughout: every tap target 64px or larger, all text 28px or larger, AAA contrast on text, tap only, no timers, no fail states. Reduced motion collapses every animation to instant.

## What is mocked, and where the seam is

All generated text (welcome lines, question phrasings, ceremony lines, captions, replay narrations) comes from template banks in `content/garden-lines.json`, routed through `shared/ai.js` via `aiGenerate`. That function is the single swap point for a real LLM later; `meta.source` labels each line `bank` today and `llm` on the day it is wired in. Nothing else in the game changes for that swap. The variation you see (lines that rephrase themselves between plays, no immediate repeats, slots filled from your answers) is real procedural generation, just not a neural one.

Art is placeholder SVG built in code. Real art comes from the team's Miora pass if this direction wins.

## Definition of done, verified

- Two different play sessions produce two visibly different plants: verified by script (plants differ in all four trait fields, SVG output substantially different) and by eye on the contact sheet.
- A revisit shows the garden remembered everything: verified by reload and by a seeded fresh browser context.
- Loop under 4 minutes on a phone viewport: a full loop is 9 taps with no required typing.

Run the checks yourself from the repo root:

```
node games/memory-garden/qa/loop.mjs
node games/memory-garden/qa/contact-sheet.mjs
```

The first drives the real UI headless and prints 59 assertions. The second writes a visual matrix of composed plants to `tools/qa/output/mg-contact-sheet.html` for judging distinctness by eye.

## Known issues, honestly

- The woven palm (rattan chair) is the weakest silhouette of the eight. It reads as a woven fan and is clearly distinct, just less plant-like than the rest.
- The warm yellow in the happy palette sits at 3.0:1 against the card surface. It is a decorative bloom centre, never text and never information on its own, so it clears the graphics floor but not the text bar.
- Long captions in the replay panel can push the grandchild's quoted line below the fold. The close button stays pinned and the panel scrolls, so nothing is lost.
- The garden recomposes every plant SVG on each render. Harmless at prototype scale.
