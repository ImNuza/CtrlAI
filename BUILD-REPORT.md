# BUILD-REPORT

Live status document for the unattended overnight build of three game prototypes. Newest decisions are appended per phase. If the session was halted by the usage limit, this file plus git log is the true state.

## Status

COMPLETE, about 03:50. All three games playable, at or past their definitions of done, adversarially QA'd, fix rounds closed, everything committed. Final verification battery run from scratch by the conductor immediately before this status: all nine QA suites exit 0 (shared selftest, memory garden loop and lint-bank, mahjong core, memory, dial, and stability, scam dojo smoke and dod), all four routes inspect clean at a phone viewport with zero errors and zero senior-floor warnings, no stray servers, no console.log, no em dashes in shipped files, working tree clean.

## Mission recap

Three playable local browser prototypes so Dewa, Matthew, and Zoe can pick a direction: Memory Garden, Mahjong Kakis, Scam Dojo. Conductor orchestrates, three Fable orchestrators direct Opus coders, core-first across all three, verification by driving the games.

## How to run

node server.js then open http://localhost:4173 in a phone-sized viewport. Each game also at /memory-garden, /mahjong-kakis, /scam-dojo.

## Decision log

1. No /goal skill exists in this session. GOAL.md used directly as the standing goal, per its own fallback clause.
2. Baseline commit made first (instructions, skill pack) so all later work sits on a clean base.
3. Phase 0 foundation coder (Opus) spawned with a full written spec: node dev server on 4173, shared/ui tokens enforcing the senior UX floor, shared/ai.js template-bank adapter with a documented LLM swap point, shared/storage.js, placeholder pages for the three routes.
4. Third-party skill installs, per GOAL.md with two deviations found during the safety skim:
   - PlayableIntelligence/game-creator SKIPPED entirely. The three folders GOAL.md wanted (skills/game-audio, game-qa, game-architecture) no longer exist in that repo; it restructured into agent files wired to Play.fun monetization, which GOAL.md itself flags as off-brief. Its good ideas (blank-canvas pixel check, state-based verification) were folded into our own QA tool instead.
   - raphaelsalaja/userinterface-wiki INSTALLED at .claude/skills/userinterface-wiki (MIT, 152 rules; includes the Web Audio SFX rules that cover the audio gap game-audio was meant to fill).
   - addyosmani/web-quality-skills: accessibility skill INSTALLED at .claude/skills/accessibility (MIT, WCAG 2.2).
   - majidmanzarpour/threejs-game-skills: NOT installed as a skill (too three.js-specific). Its MIT canvas inspector script was read fully, vetted (local-only, no remote fetch), and adapted into tools/qa/inspect.mjs.
5. QA harness: playwright and pngjs installed as devDependencies at repo root (node_modules gitignored). Games themselves stay zero-dependency; package.json exists only for QA tooling. Chromium headless shell v1234 downloaded to the playwright cache. tools/qa/inspect.mjs loads any page at 390x844 with touch, captures console and page errors and failed requests, audits tap target and text sizes against the senior floor, screenshots, and pixel-checks canvases for blankness.
6. Port plan to avoid collisions: 4173 is the conductor's server for browser-pane checks; orchestrators verify against their own instances on 4181 (memory-garden), 4182 (mahjong-kakis), 4183 (scam-dojo) via PORT env.
7. Obsidian vault build-log entry deliberately skipped tonight: GOAL.md blast-radius rule (touch nothing outside this repo) overrides the standing vault-capture instruction. Dewa can ask for a backfilled entry after waking.
8. Foundation (commit a7e3c45) built by an Opus coder and verified twice: the coder measured computed styles in a real browser, then the conductor independently ran the inspector on all four routes (zero errors, zero warnings, body 28px, all tap targets compliant) and eyeballed the hub screenshot. Foundation coder also hardened the server (traversal and dotfile blocking) and re-tuned the amber accent and border tokens to clear WCAG math, documented inline.
9. package.json left without a type field on purpose. server.js is CommonJS; adding type module for the ESM shared modules could break the server. Cost: a harmless MODULE_TYPELESS_PACKAGE_JSON stderr warning when running shared modules under node. All agents are told to ignore it.
10. Phase 1 launched about 00:20: three Fable orchestrators in parallel (Memory Garden, Mahjong Kakis, Scam Dojo), each owning one game directory, spawning Opus coders for all code, verifying headless on ports 4181 to 4183, committing only their own directory. Each stops after a committed playable core and waits for the conductor's go-ahead, which is how core-across-all-three is enforced before polish anywhere.

## Per-game status

- memory-garden: MILESTONE B COMPLETE and conductor-verified. Full definition of done: 59 loop assertions pass under an independent conductor rerun (8 species visibly distinct, two sessions give plants differing in 4 of 4 traits, revisit and corrupt-save recovery proven, 9-tap loop, zero typing required), inspector clean. README fact-checked by an independent coder and committed. Commits 3bb08da, 45a1b05, 86ad880, 84c6399, f160ad4, 78edbb2, 2f0317c.
- mahjong-kakis: MILESTONE B COMPLETE and conductor-verified. Full definition of done exceeded: six banter events live (four required), memory callback with stored name and history fact proven via seeded storage, hidden dial verified at four performance profiles, 93 banter lines with per-kaki voice through the AI seam. core, memory, and dial QA suites all pass under independent conductor reruns, inspector clean. README committed. Commits 92b686d, 84f1fae, 64fdfc9, 34404ee, 254f41a.
- scam-dojo: MILESTONE B COMPLETE and conductor-verified. Full definition of done: 9 of 9 DoD suite sections pass under an independent conductor rerun (9 scripts across 8 families, 294 templates through the AI seam, 14-round variety, streak survives reload, comply path teaches kindly, zero errors). README committed by the orchestrator (f94a98b). Commits be90cca, 38bcf60, 91b4782, d869f5a, f94a98b.

## Verification results (final matrix)

Every definition of done item was verified by driving the real UI headless at 390x844 with touch, by scripts asserting outcomes, plus screenshots read by actual eyes (orchestrators and conductor separately). Conductor reran every suite from scratch at the end.

Memory Garden: two sessions with different answers produce plants differing in 4 of 4 traits and substantially different SVGs, PASS. Revisit renders everything from storage, corrupt saves recover, PASS. Full loop is 9 taps, zero required typing, well under the 4 minute budget, PASS. 84 loop checks plus 57 bank lint checks green.

Mahjong Kakis: full round playable warm from name chip to celebration, PASS. Banter reacts to six distinct events, four required, PASS. Seeded second visit skips the name screen and greets with the stored name plus a history fact, with real variety across visits, PASS. Zero-instruction start, one obvious action, PASS. Hidden dial deals 8 to 16 tiles by stored performance, invisible in UI, PASS. core, memory, dial, stability suites green.

Scam Dojo: three consecutive rounds rotate scam families with pairwise different transcripts, PASS across multiple independent runs drawing different families. Wrong taps teach gently with zero penalty, comply path teaches kindly and still awards the shield, PASS. Streak survives reload (proven at 3 and at 14), PASS. Home has exactly one filled primary action, PASS. 13 of 13 dod sections plus 16 smoke checks green, content clean of real institution names.

Cross-cutting: senior floor audited on every reachable screen state by the adversarial sweep and re-verified after fixes (no sub-60px targets, no sub-28px text, no horizontal scroll, reduced motion safe). Hub and all three routes serve clean from one command.

## Known issues (honest, also in each game README)

- Memory Garden: picker blurbs stay hidden at phone widths (every layout variant tried broke 360px, decision recorded in code); woven palm is the least plant-like silhouette; long captions scroll within the replay panel.
- Mahjong Kakis: reloading mid-round resets the round (session stats survive; in-round resume needs a state-shape decision that was wrong to rush at 4am); banter variety ceilings noted in README.
- Scam Dojo: streak counts completed rounds, not calendar days; three variants per call line can show patterns over very long sessions.
- Repo-wide: fresh-clone QA needs one npm install for playwright (QA only, games have zero dependencies). The package.json stderr warning under node is cosmetic, see decision 9.

## What Dewa should check first

1. node server.js, open localhost:4173 on a phone viewport, play all three games twice each (second visits trigger the memory beats). This is the point of the whole night.
2. Read the three game READMEs for what is mocked and known issues; they were fact-checked against the code.
3. Skim the Decision log above, especially: game-creator skill install skipped (upstream repo restructured, off-brief monetization), the amend incident (fully recovered, rule issued), and the adversarial QA sweep section (20 serious findings found and fixed after definitions of done were already met).
4. The scoring rubric for Matthew and Zoe is in the top-level README.
5. Obsidian build-log entry was intentionally not written (blast-radius rule); say the word after waking and it gets backfilled from this report.

## Phase 1 gate log

All three cores landed within about 40 minutes of each other and each was independently re-verified by the conductor (their QA scripts rerun from scratch, inspector rerun, screenshots viewed). Gate released to all three orchestrators at about 00:57 for Milestone B toward full definitions of done, target two hours, commit per sub-milestone.

Incident, resolved: a Memory Garden coder ran git commit --amend over a conductor build-report commit. The orchestrator caught it, restored the commit byte for byte, recommitted its work cleanly, and the conductor verified history sanity (every game commit touches only its own directory, f58fe84 intact). Standing rule issued to all agents: never amend.

## Adversarial QA sweep (phase 2)

Nine independent Opus checkers ran in a workflow, three lenses per game: fresh-player drive (including markup injection into text inputs and double-tap attacks), senior floor deep audit of every reachable screen state, and content plus honesty audit. Result: 0 blockers, 20 serious, 21 minor, 18 nit findings, all with concrete evidence.

The serious findings cluster into cross-game classes: stale-tap-through on view transitions (a second tap lands on the control that replaces the one just pressed: Memory Garden could skip the object picker or the whole grow ceremony, Scam Dojo could drop a double-tapper into the comply path), primary actions or feedback below the fold (Memory Garden question 3, Scam Dojo coaching notes and walkthrough steps, Mahjong Kakis progress bar at 16 tiles), template grammar at edges (welcome lines ungrammatical at one plant, name chips doubling what kakis already say, recap explaining a different payment method than its line), a silent brick when a content fetch fails, and a mid-aim 42px layout shift when a banter bubble auto-dismisses.

Fix rounds dispatched to all three orchestrators at about 02:30 with per-game findings digests, triage rules (serious must fix, minor fix or document, nit judgment), the shared transition-guard guidance, and orders to extend their QA suites against regressions, rerun everything green, update READMEs, and report dispositions.

## Fix round results

- mahjong-kakis: COMPLETE and conductor-verified (core, memory, dial, and the new stability suite all exit 0 under an independent rerun; inspector clean). All 6 serious findings fixed, including deleting the banter auto-dismiss timer at the root (no more mid-aim layout shift, and better aligned with the no-timers rule), first-visit greeting now teaches and varies, 16-tile walls fit every tested width, name chips no longer double kaki speech, return-visit variety unfrozen with a seeded pick. A bonus win-card clipping defect was found and fixed by the coder. Eight regression classes added. README rewritten against post-fix reality. Commits b725be3, 852e2e2, 2b51ffc. Two shared/ comment-accuracy requests queued for the conductor.
- memory-garden: COMPLETE and conductor-verified (qa/loop.mjs 84 checks and qa/lint-bank.mjs 57 checks pass under independent reruns; inspector clean). All 7 serious fixed including a shared 350ms stale-tap guard, step 3 primary action back above the fold, replay overflow and scroll cue fixes, and grammatical one-plant welcomes. Also fixed from minors: a stored XSS path via plant ids (validation plus DOM-built rendering), grow reentrancy, note carryover between objects, ornament clipping on 31 of 40 combos. One nit honestly rejected with the decision recorded in code (picker blurbs at 360px). Commits c33096b, 94505f3, c16fa4a, e72a167. Note for the record: one conductor rerun showed 2 false failures caused by the conductor's own orphaned server processes; after cleanup the suite passes fully, the game was never at fault.
- scam-dojo: COMPLETE and conductor-verified (qa/dod.mjs now 13 sections, 13 of 13 pass under an independent rerun; smoke 16 checks; inspector clean). All 20 findings fixed, none merely documented: input guards with the choice pair reordered so Hang up owns the vacated pixels, coaching notes and walkthrough steps scroll into view, fetch failure gets a kind retry state, recap mechanism now always matches its line, the qa em dash resolved with the typography scan widened to all tracked files. Every new QA section proved able to fail via break-and-restore runs. Commits 2211309, 17b843e, 056088e.

## Morning burn phase (Dewa awake, spending remaining budget before the 08:00 reset)

Dewa asked to spend the remaining weekly budget. Eleven more Opus agents plus one follow-up ran between 07:08 and 07:45:

- Content depth, all gated by green suites before committing: Mahjong Kakis banter 105 to 138 lines with the seeded-index constraint solved so memory QA still passes (831afa6); Scam Dojo 309 to 477 templates, uniform 5 per line event and 6 per support pool (87a0d77), with README and QA floors synced so the new depth is locked by the gate (cb30b9a); Memory Garden captions and welcomes 32 to 53 lines, lint proven on all 68 templates (13b0483).
- REBUILD-NOTES.md (d6eba8e): an eight-agent read-only review, two lenses per target, distilled into keep versus redo lists plus 58 ranked findings for the CodeBuddy rebuild. Nothing was applied to code.
- AI-STORY.md (e5269be): honest raw material for the deck's AI creation description section.
- TEAM-BRIEF.html (45edbd2): self-contained HTML brief for Matthew and Zoe, also archived at ~/Documents/Claude/clawd/reports/ctrlai-team-brief-2026-07-27.html.
- Freeze battery at 07:45: all nine suites exit 0, all four routes inspect clean, working tree clean.

New known issue, documented not patched (deliberate freeze discipline): the dev server can die silently under playwright context teardown because server.js registers no error handlers and MG's QA spawns it with stdio ignored. QA-only flakiness, moving failure point, content proven innocent by an A-B run. A task chip with the repro and suggested fix was filed; also the likely cause of the two false failures noted earlier in the fix round log.
