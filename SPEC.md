# SPEC: Garden of Life (working title) v0.3

Status: v0.2 design is Dewa-approved, Matthew and Zoe sign-off still pending. v0.3 changes build scope only, not game design: the overnight run builds most units itself instead of deferring them to the CodeBuddy phase, and adds an art direction section with a Higgsfield budget.

Version history:
- v0.1: Zoe's PDF from the 29 Jul meeting (`meetings/29jul/age-well-garden-of-life-summary-2.pdf`). Quiz-to-earn, gacha seeds, step quests, water reminders, meal achievements.
- v0.2: applies the digest revisions. Adds memory-driven planting, one bounded NPC, photo quests. Cuts gacha, step quests, cognitive-decline claims, the Grow a Garden framing. Argument and sources: `meetings/29jul/digest-29jul-meeting.html`.
- v0.3 (this file): widens the overnight build to near-finished product per GOAL.md. U3, U5, U6, U7 move from the CodeBuddy phase into this build. U6 defaults to the tile-matching recommendation, logged for team veto. Art direction added.

## Pitch

A garden that grows from your memories. A senior tells the game one small thing about their life, and a plant grown from that story joins their garden. A gardener character remembers what they said and notices when they return. Photo quests bring real plants from the void deck and the park into the game. Harvesting a full set of crops unlocks a local dish they actually recognize.

The one-sentence AI story, for the deck and for tie-breaks: every plant in the garden is a memory the player told the game, and the gardener remembers.

## Player

Singapore seniors, 65 and up, holding a phone at arm's length. Secondary: the grandchild who sets it up and types the optional long answers. The senior UX floor in RULES.md applies to every screen with no exceptions.

## Core session loop (target: under 5 minutes)

1. The gardener greets you by name and references your last visit.
2. Tell a memory: pick a heritage object, answer two or three tap prompts about it.
3. A plant composed from your answers appears and is planted. Tap any plant later to replay its story.
4. Tend the garden: water by tap, watch growth stages, a wilted plant perks up.
5. Optional: a light tile puzzle earns coins. Coins buy seeds in a shop with visible prices.
6. Optional daily: a photo quest. Bring back one photo of a real plant outside; it becomes a seed.
7. When a harvested set completes a dish, a Meal Card unlocks.

## Units

Each unit: what it is, v0 scope, out of scope, done-when (observable on a phone), what it earns against the rubric, and its AI seam status. Point estimates are planning weights, not facts.

### U1: memory-to-plant

- What: the primary loop. Heritage object, tap prompts, procedurally composed plant.
- V0: 8 heritage objects (kopitiam cup, Setron TV, sewing machine, kampung house, Rediffusion set, provision shop, dragon playground, tingkat carrier). 3 prompts per object, 4 chips each, optional free text. Trait mapping from answer tags to species, palette, ornament. Lift the working composer from `games/memory-garden/`; adapt, do not rewrite.
- Out: photo-real art, more than 8 objects, voice input.
- Done when: two sessions with different answers produce two visibly different plants, and tapping a plant replays the story it grew from.
- Earns: Use of AI Tools, worldbuilding. Est. 10 to 12 of 40.
- AI seam: hybrid. Composer is real procedural generation now; the story retelling line upgrades to a live model call at the SWAP POINT during the CodeBuddy phase.

### U2: the gardener NPC

- What: one character, an auntie or uncle gardener, who greets, comments on planting, notices absence kindly, and calls back to stories told sessions ago.
- V0: event-keyed generated lines from the bank (schema below), player replies via 2 or 3 large tap chips, never free text. Session memory in localStorage: name, last visit, last plant, one memory hint.
- Out: free-text chat. This is deliberate: a randomized study (N=130) found LLM NPCs with open-ended input raised cognitive load significantly without improving the experience, and usability and trust dropped. Generated output, bounded input.
- Done when: the gardener visibly reacts to at least 4 distinct event types, and a second visit triggers a callback to the previous session.
- Earns: Use of AI Tools, intelligent NPC. Est. 10 to 12 of 40.
- AI seam: hybrid. Banks now; line generation upgrades to a live model behind the same event-key signature.

### U3: photo quest

- What: the outdoor nudge. Photograph a real plant outside, it becomes a seed, the gardener reacts to what you found.
- V0 (this build): `<input type="file" accept="image/*" capture="environment">`, vision identification behind the seam, canned classifier fallback plus a manual "what did you find" chip picker if permission is denied or the model is unavailable. Tonight the canned and manual paths are the real paths; the live vision call stays a SWAP POINT for the CodeBuddy phase.
- Out: GPS, AR, step counting of any kind (unbuildable in a browser, see CONTEXT.md).
- Done when: on a phone, taking a photo produces a seed and a gardener comment inside 15 seconds.
- Earns: Use of AI Tools est. 6 to 8; Impact (gets seniors outdoors, connects to Community in Bloom).
- AI seam: mocked then real. Stub the seam function now; live vision call in the CodeBuddy phase.

### U4: garden, tending, persistence

- What: the grid the player returns for.
- V0: garden grid in localStorage, 3 growth stages per species plus a gentle sway (Zoe's two-frame idea from 96:16 is enough), water by tap, wilt after neglect, full recovery on watering, replay story on tap.
- Out: land expansion, decorations, weather.
- Done when: a reload shows everything remembered; an unwatered plant wilts and recovers when watered; nothing in the flow shames the absence.
- Earns: Project Quality. Est. 8 to 10 of 30.
- AI seam: none. Deterministic.

### U5: economy and seed shop

- What: coins in, seeds out, zero randomness.
- V0: coins from puzzles and quests, seed shop with visible prices by tier, one free seed daily, rare seeds unlocked by streaks (3, 7, 14 days), streak forgiveness (a missed day pauses, never resets).
- Out: gacha or any randomized reward, in-app purchases, currency top-ups. Removing gacha is a hard decision, not a style choice: randomized-reward loops are exactly what regulators flag for cognitively vulnerable players, and China's own regulator rejects compulsion loops. We are pitching to Tencent.
- Done when: a player can earn and spend without ever encountering a chance mechanic.
- Earns: defends Impact and avoids the one attack that could sink the pitch.
- AI seam: none.

### U6: secondary puzzle (defaulted, team can veto)

- What: the optional coin earner for players who want more to do.
- Decision: the overnight run builds the recommendation, tile pair-matching lifted from the `games/mahjong-kakis/` matching core, garden-skinned. Matches what seniors actually play (puzzle, card, tile genres lead every preference survey) and reuses working code. Not quizzes: Zoe's exam objection stands and the genre research backs her. Logged as an autonomous default; Matthew and Zoe can veto and the puzzle swaps behind the same coin interface.
- Done when: a full round is playable by tap only, pays out coins, and needs no rules explanation to start.
- Earns: Project Quality, session length.

### U7: meal cards

- What: harvesting a full ingredient set auto-unlocks a dish card. The most original mechanic in v0.1; keep and localize.
- V0: 6 dishes drawn from what the player actually grew, local names first (bayam soup, chap chye, fruit rojak before any Omega Bowl), one-line benefit in plain food language.
- Out: cooking minigame, calorie tracking, any disease claim.
- Done when: completing a set unlocks a card naming the dish and its benefit, and the benefit line survives the no-medical-claims rule.
- Earns: Impact est. 6 to 8; the strongest slide in the deck.
- AI seam: hybrid. Card text generation can go live later; bank now.

### U8: shell, navigation, persistence plumbing

- What: routes, storage wrapper, tokens. Extends the existing `shared/` layer; conductor owns changes.
- Done when: the slice runs from `node server.js` on a phone viewport with no build step.
- AI seam: none.

### In this build as polish (Phase 3, cut first if time runs short)

- Shareable garden card: client-rendered canvas image of the garden, navigator.share where available, download fallback everywhere. Feeds the +5 social bonus without a server.
- PWA manifest and app icon so the game installs to the Home Screen and feels like an app. This is also the only road to real notifications on iOS later.
- Gentle procedural audio (Web Audio, the pack's game-audio skill): soft confirmation and growth sounds, every sound with a visual equivalent for hard-of-hearing players, one big mute toggle. Quiet by default, never startling.

### Out of this build entirely (slideware, not software)

- Leaderboard and public profiles: needs accounts and a backend that a 9-day web-link build does not have. The shareable garden card is the replacement. The verbal leaderboard agreement from the meeting needs this trade-off surfaced to the team.
- Real push notifications: iOS requires Home Screen install (CONTEXT.md). The watering reminder is an in-game beat shown in the demo video.
- Live LLM and vision calls at runtime: the product must run locally with no keys tonight. Every such beat sits behind its SWAP POINT.
- Brand partnerships (the super-greens idea): a deck mention only.

## Art direction (this build)

Style target, from Matthew's references in the meeting: vintage Singapore, paper texture, warm. Locked by generating 3 or 4 style candidates first, picking one, and holding every asset to it.

Division of labor, and the reasoning matters:

- Plants stay procedural SVG. Per-answer visible variation is the worldbuilding beat the rubric pays for; baked images would kill it. The composer's palettes get matched to the locked style.
- Higgsfield generates everything else: the gardener (one character, 5 or 6 expressions and poses, built with the server's character-sheet workflow so the face stays consistent), the 8 heritage object illustrations, 2 or 3 garden backgrounds, 6 meal card illustrations, roughly 10 UI props and icons, and the app icon. Use remove_background for cutouts instead of regenerating.

Budget protocol lives in RULES.md. Hard cap 300 credits. Planning split: roughly 15 percent style candidates, 65 percent bulk assets, 20 percent reserve for gaps. Images only, no video, no 3D, no upscales. Per-image costs are unknown until checked, so Phase 0 verifies balance and per-model costs and sizes the asset count to fit the cap with reserve intact.

Miora remains the mandated art story for the submission. Tonight's art locks direction and fills the build; the CodeBuddy phase regenerates or replaces through Miora using tonight's assets as style reference, and the deck documents both honestly.

## Content banks (the Fable session's main cargo)

All banks are JSON under `games/garden-of-life/content/`. Schemas are binding, counts are minimums, the RULES.md content standards apply, and a reviewer pass cuts the bottom third before anything ships.

### memory-prompts.json

8 objects. Per object: `id`, `label`, 3 prompts. Per prompt: `q` (10 words max), 4 `chips` (4 words max each), `free_text: true` on at most one prompt per object. Each chip carries `tags` consumed by the composer.

### gardener-lines.json

Event keys: `first_visit`, `return_visit`, `return_after_absence`, `planting`, `plant_comment`, `watering`, `wilt_notice`, `harvest`, `meal_unlock`, `photo_result`. Minimum 5 lines per key, 50 total. Lines 12 words max, template slots `{name}`, `{plant}`, `{memory_hint}`. Each line ships with 2 or 3 reply chips, 4 words max. `return_after_absence` and `wilt_notice` are warmth-critical: miss the tone there and the game is dead.

### plant-traits.json

Tag-to-trait mapping matching the existing composer's input format (see `games/memory-garden/`). Minimum 8 species, 3 growth stages each, palette and ornament layers driven by answer tags.

### meal-cards.json

6 dishes. Per dish: `name` (local name first), `crops` (set of species ids), `benefit` (one line, plain food language, zero medical claims).

## Rubric map (planning estimates, so the team can see where points live)

| Rubric line | Carried by |
|---|---|
| Use of AI Tools (40) | U1 worldbuilding, U2 NPC, U3 vision, plus the AI-creation deck section documenting CodeBuddy and Miora usage as it happens |
| Impact and Relevance (30) | Evidence framing per CONTEXT.md, Healthy 365 positioning, U3 outdoors, U7 nutrition, the UX floor itself |
| Project Quality (30) | U4 feel and persistence, U6, art consistency from Miora, completeness of the loop |
| +5 social | The shareable garden card plus the hashtag post |

## Deck hooks (capture as you build, not on Aug 8)

Screenshot every CodeBuddy prompt-to-result worth showing, every Miora style iteration, and the before-and-after of any AI-assisted fix. The AI creation description is written from this pile.

## Open items

| Item | Owner | Deadline |
|---|---|---|
| Game name (candidates to react to: keep "Memory Garden", "Kebun Kita", "Garden of Life") | Team | Before deck draft |
| U6 puzzle veto window (tile-matching built by default) | Team | Before CodeBuddy phase |
| Leaderboard trade-off sign-off (shareable card instead) | Team | Before CodeBuddy phase |
| Design sign-off (v0.2 changes, carried into v0.3) | Matthew, Zoe | Next meeting |
| Art style acceptance (candidates in BUILD-REPORT-2.md after the run) | Team | Before Miora pass |
