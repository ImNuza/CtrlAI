# Phase 3 plan: photo quest, share card, PWA, audio

Binding companion to core-slice-plan.md and stretch-plan.md. Same hard rules,
same state discipline, same UX floor, same fallback contract on every art
path. Nobody commits. Port for the new QA suite: 4192 (GOL_P3_PORT).

## File ownership

| Seat | Files |
|---|---|
| B | index.html, css/garden.css, js/state.js, js/main.js, js/garden-view.js, manifest.webmanifest |
| H (new) | js/photo-quest.js |
| G | js/share-card.js, js/audio.js |
| E | qa/phase3.mjs |

## U3 photo quest (H plus B wiring)

Reward, fixed by orchestrator ruling (zero randomness): a confirmed find
grants 3 coins plus ONE common-tier seed of the player's choice, picked from
chips and handed to the existing guided placement. One quest per day
(state photo.lastQuestDay, same guard pattern as the free seed).

Flow in #view-photo, ids frozen: #photo-heading; #photo-privacy (the line
"The photo stays on your phone." always visible); #photo-open, the one big
camera button, which activates the visually hidden #photo-input
(type file, accept image/*, capture environment; native camera on phone,
file picker on desktop, no permission dance); on a chosen file call
aiClassifyPhoto from shared/ai.js (canned, returns found {id, label,
confidence} and meta.source "canned"); #photo-guess region presents the
guess HONESTLY ("I think it looks like a Bougainvillea. Am I right?") with
two chips #photo-yes and #photo-other; the other path shows #photo-picker,
a grid of the 8 photoFindChoices() as big chips; either way the confirmed
find flows to #photo-reward: a warm line naming the find, the coin grant,
seed-choice chips (common crops), and #photo-done which hands to placement
and returns to the garden. #photo-back everywhere reachable. The gardener
reacts through photo_result with {plant} carrying the FIND label (glue in
main.js after the flow reports its result).

Privacy is hard: the photo never leaves the device and is never stored. No
data URL, no base64, nothing of the image in state; the input value is
cleared after the read and any object URL revoked. The UI never pretends
certainty: meta.source "canned" stays honest in the wording ("I think",
"Am I right?"), and the SWAP POINT comment marks where live vision lands.

Contract: initPhotoQuest({ views, onQuestDone }) where onQuestDone({ findId,
findLabel, seedCropId }) is the glue's hook (grants happen in the glue
through state, so the module stays presentation plus classification).
Exports also questAvailableToday() for the garden entry state.

Garden entry (B): #open-photo button with a kind done-today state (button
stays tappable, answers with a line, never disabled into silence).

Done-when (SPEC): photo to seed to gardener comment inside 15 seconds on a
phone; desktop file-picker path completes.

## Share card (G, js/share-card.js)

initShareCard({ views }) plus shareGarden() bound to #open-share in the
garden. Client-only canvas at 1080x1350: warm paper background, the game
name, up to 12 plots' plants drawn by rasterizing each composePlant svg at
its current stage (SVG to Image to canvas; deterministic input, no network),
Auntie Bee's welcome art layered IF it loads (fallback contract: absence
changes layout not correctness), a warm caption line. navigator.share with
the image file where canShare({ files }) says yes (needs HTTPS plus a
gesture; on localhost this is expected to be unavailable), otherwise an
automatic download through an anchor with a dated filename. #share-note
(aria-live) narrates which path happened, warmly. No servers, no accounts,
nothing leaves the device except through the OS share sheet the player
invoked.

## PWA (B)

manifest.webmanifest: name Garden of Life, short_name Garden, start_url
/garden-of-life, scope /garden-of-life, display standalone, background and
theme #fbf6ee, icons icons/icon-192.png and icon-512.png with sizes and
type. Linked from index.html head with theme-color already present. Service
worker: SKIPPED tonight by ruling; installability via manifest is the
point, and a half-tested cache worker is a demo risk, not a feature. Logged
as the deliberate gap for the CodeBuddy phase.

## Audio (G, js/audio.js)

Procedural Web Audio only, no files. initAudio({ muted }) plus
setMuted(muted), isMuted(), isStarted() (QA seam: true only after a context
exists), and play(name) for exactly four cues: water (a soft drop, low sine
with fast decay), match (a quiet tick), planting and meal_unlock (a warm
two-note chime). Rules: the AudioContext is created lazily on the FIRST
user-gesture-driven play call and never before; muted true means no context
is ever created and play is a no-op; master gain low (0.15 or under), soft
attack and release so nothing clicks or startles; every cue accompanies a
visual change that already exists, sound is never the only signal. The mute
toggle is #mute-toggle in the garden header (B places it): art/ui/mute.svg
with onerror text fallback, aria-pressed reflecting state, persisted in the
save as audio.muted (state.js field plus setter, B). Default muted FALSE but
quiet; reduced-motion users are unaffected (audio is orthogonal); the
toggle is one tap, 64px, labelled Sound on and Sound off.

Glue (B, main.js): play('water') on a successful water, play('match') on a
puzzle match settle, play('planting') on ceremony done, play('meal_unlock')
alongside the celebrate moment. Where the module boundary makes a direct
call awkward, the owning module's existing callback in main.js carries it;
no new cross-module imports.

## State additions (B)

v2 stays v2 (additive, no migration bump needed): photo { lastQuestDay },
audio { muted }. Defaults on load; lossless for existing saves.

## QA (E, qa/phase3.mjs, port 4192)

1. Photo flow desktop path: setInputFiles with a small fixture png created
   by the suite itself in /private/tmp (never in the repo); the guess line
   shows one of the 8 find labels with the honest wording; drive BOTH the
   yes path and the something-else path (manual picker chip); reward grants
   exactly 3 coins plus one chosen common seed (before and after deltas);
   placement hand-off reaches the garden with the banner; gardener line
   membership-checked against photo_result with the find label in the
   plant slot.
2. Privacy: after the whole flow, the serialized save contains no data URL
   and no base64 image fragment, and the input value is empty.
3. Daily guard: a second quest the same day is answered kindly and grants
   nothing; the next simulated day it works again.
4. Fifteen-second envelope: the scripted photo-to-gardener-comment path
   completes inside 15 seconds of wall clock (generous margin over taps).
5. Mute: #mute-toggle aria-pressed flips, persists across reload, and
   isStarted() stays false when muted from a fresh load even after watering
   (no context created); with sound on, isStarted() is false BEFORE any
   gesture (the no-autoplay assertion) and true only after a cue-triggering
   tap.
6. Share: on a garden with at least one plant, tapping #open-share on
   localhost takes the download path: assert the playwright download event
   fires, the file is a non-empty png, and #share-note narrates the
   download warmly.
7. Manifest: /games/garden-of-life/manifest.webmanifest answers 200 with
   valid JSON naming both icons; both icon urls answer 200; index.html
   carries the manifest link.
8. Floor and zero-error policy as every suite, tolerated 404s unchanged.

## Sequencing

1. Parallel now: B (state, sections, manifest, glue), H (photo-quest), G
   (share-card, audio).
2. E writes qa/phase3.mjs when the wave lands.
3. Orchestrator full gate: all five suites fresh, eyeball walk with
   screenshots (photo flow, share download, mute), Phase 3 report, STOP.
