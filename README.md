# CtrlAI

Three prototype directions for the Tencent Cloud "Age Well" Social Good Challenge, Game Track.
They exist so Dewa, Matthew and Zoe can actually play all three and pick one, rather than
argue about screenshots. This is not the submission. The chosen direction gets rebuilt with
CodeBuddy afterwards.

## Run it

```
node server.js
```

Then open <http://localhost:4173>.

No install step, no dependencies, no build. Node builtins only. Set `PORT` if 4173 is taken.

Play it on a phone, or put your browser in a phone sized viewport before judging anything.
Every screen is designed for a senior holding a phone at arm's length, so it looks oversized
on a laptop and correct on a handset.

## The three routes

| Route | Game | The one line pitch |
|---|---|---|
| `/memory-garden` | Memory Garden | Answer a few gentle questions about an old object, a plant grows from the memory, the garden remembers. |
| `/mahjong-kakis` | Mahjong Kakis | Tile matching at a kopitiam table with three AI kakis who banter and recall your last visit. |
| `/scam-dojo` | Scam Dojo | A two minute daily drill. The phone rings, a scammer tries a fresh angle, you tap the tells. |

## Shared foundation

- `shared/ui/tokens.css` and `shared/ui/base.css` carry the senior UX floor: 64px tap targets,
  28px minimum body text, 7:1 body contrast, tap only, no timers.
- `shared/ai.js` is the single AI seam. Generated lines come from template banks today and a
  real model later, behind an unchanged signature. See the SWAP POINT comment in that file.
- `shared/storage.js` wraps localStorage so games persist without touching it directly.
- `shared/content-banks.md` is the convention for writing game content.

## Checks

```
node tools/selftest-shared.mjs
```

Exercises the AI adapter and the storage helpers under plain node. Exits nonzero on failure.

## House rules

No `console.log` in shipped code, no emoji in code, no em dashes in writing. Commit at every
working milestone. Nothing gets pushed anywhere.
