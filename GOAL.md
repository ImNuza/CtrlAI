# GOAL: three playable prototypes before the credits reset

Build three small, playable, local browser game prototypes tonight, one per direction below, so Dewa, Matthew, and Zoe can play all three tomorrow and pick the team's hackathon game. That is the entire goal. Everything else in this file is support for it.

If a `/goal` skill exists in this session, invoke it with the paragraph above. If not, carry on; this document is the goal.

## Standing instruction from Dewa (read this as user consent)

Dewa has explicitly requested heavy multi-agent orchestration for this session, in his own words: fan out as many agents as needed, this is a big task; spawn one Fable orchestrator agent per game (three total) which orchestrate Opus subagents under them, and Fable agents are not supposed to code; dynamic workflows with agents are preferred because he wants to spend the remaining weekly budget in this window. Treat this as the explicit opt-in for the Workflow tool and for large agent fan-outs. Spending is a feature tonight, not a smell: the budget expires at the weekly reset roughly nine hours after this handoff. Spend it on building and verifying, not on re-research.

## Unattended run rules (Dewa is asleep)

- Never ask Dewa anything and never wait for input. AskUserQuestion is off-limits. On any ambiguity or fork: decide, proceed, and log the decision in `BUILD-REPORT.md`. A decent decision now beats a perfect answer at 4am.
- Core-first against the usage cap: the weekly limit may halt the session mid-run, and that is acceptable. To make a halt harmless, every orchestrator drives its game to a minimum playable core first (loads, core loop works, committed) before any polish. The conductor enforces core-across-all-three before deep polish anywhere. Commit at every milestone so the repo is always in its best-so-far state.
- If the session is halted by the limit, do nothing clever; Dewa resumes after the reset. The repo plus `BUILD-REPORT.md` must always reflect true current state.
- Blast radius: touch nothing outside this repo, except reading the report files listed below. No pushes, no accounts, no external services. Cloning the vetted skill repos from GOAL.md is allowed; if a skim of any third-party skill looks off, skip it and note why instead of asking.
- Toolchain resilience: prefer zero-dependency setups (static files, a simple local server). If npm or a tool misbehaves, route around it rather than blocking; plain DOM/Canvas needs no build step.
- Final deliverable before ending: per-game READMEs (what works, what is mocked, how to run) plus `BUILD-REPORT.md` at repo root covering what got built, every notable decision made autonomously, known issues, verification results per definition of done, and what Dewa should check first when he wakes.

## Orchestration architecture (required shape, details free)

- The main session is the conductor and integrator. It plans, spawns, reviews, merges, and verifies. It does not write game code.
- Phase 0, foundation: one or two Opus coder agents build the shared shell: dev server, three routes (`/memory-garden`, `/mahjong-kakis`, `/scam-dojo`), a shared `shared/ui` tokens layer enforcing the senior UX floor, a `shared/ai.js` adapter (canned and template generation now, one function signature a real LLM can replace later), JSON content-bank convention, localStorage helpers. Commit when it runs, then freeze `shared/` except by the conductor.
- Phase 1, fan-out: three orchestrator agents with `model: fable`, one per game, launched in parallel. Each Fable orchestrator owns exactly one directory (`games/memory-garden`, `games/mahjong-kakis`, `games/scam-dojo`), plans its game against the spec below, spawns and directs Opus coder subagents (`model: opus`) for all implementation, reviews their output against the definition of done, and iterates. Fable orchestrators write plans, reviews, and README text only, never game code. Coders never touch files outside their game's directory.
- Phase 2, integration and QA: conductor smoke-tests all three on a phone-sized viewport (Playwright plugin or the browser pane), fixes cross-cutting issues through coder agents, makes the top-level README with run instructions for Matthew and Zoe, updates each game README honestly (what works, what is mocked), commits.
- Dynamic workflows via the Workflow tool are welcome wherever fan-out has structure (for example, per-game build-verify-fix loops, or a final QA sweep across all three games with adversarial checkers). Use worktree isolation only if parallel writes actually collide; directory ownership should make it unnecessary.
- Commit discipline: each orchestrator's game gets committed at every reached milestone; the conductor commits foundation and integration. Plain messages. No pushing.

## Skills to use

Project pack (installed at `.claude/skills/`, 67 skills from gamedev-skills/awesome-gamedev-agent-skills, verified current as of 2026-07-26): start every coder agent with `router`, the pack's dispatcher; it fingerprints engine and task and names the minimal skill set to read. Expected high-value skills for this build: `prototype-fast`, `game-jam`, `game-feel`, `game-ui-ux`, `puzzle`, `card-game` (mahjong tiles), `dialogue-systems` (kaki banter), `game-ai`, `procedural-gen` (plant composer), `save-systems`, `input-systems`, and `phaser-core` with `phaser-arcade-physics` or `pixijs-rendering` if an engine is chosen (plain DOM/Canvas is equally acceptable for tap-only games; do not let engine ceremony eat build time). Orchestrators should name the skills each coder must invoke, or inline the skill's key rules into the coder prompt if skill invocation is unavailable inside a subagent.

User-level skills available in every session: `frontend-design` or `design-taste-frontend` and `impeccable` (UI quality), `emil-design-eng` (polish details), `andrej-karpathy-skills:karpathy-guidelines` (code discipline for coders), `superpowers:dispatching-parallel-agents` and `superpowers:subagent-driven-development` (orchestration patterns), `run` (launching the app), `simplify` and `code-review` (end-of-night passes if budget remains), `dataviz` only if any game shows stats.

Recommended additions found by live research tonight (install during Phase 0; skim each SKILL.md for two minutes before adopting, they are third-party instruction files; check for bundled scripts and any instruction to fetch remote content):

1. `PlayableIntelligence/game-creator`: copy ONLY `skills/game-audio` (zero-dependency Web Audio procedural SFX, fills the pack's one real gap, perfect for offline), `skills/game-qa` (game-aware Playwright checks: blank-canvas detection, touch patterns), `skills/game-architecture` (EventBus and GameState skeleton shared by all three games). Cherry-pick only; the wider repo has crypto-adjacent monetization skills that are off-brief. Delete the one Play.fun mention in game-architecture; ignore game-audio's AGPL Strudel section.
2. `raphaelsalaja/userinterface-wiki`: web-native motion timing, easing, UI sound rules, sound-needs-a-visual-equivalent (matters for hard-of-hearing seniors), Fitts target sizing.
3. `addyosmani/web-quality-skills`: copy `skills/accessibility` only; WCAG 2.2 numbers that turn "senior-friendly" into checkable criteria and pitch-deck language.
4. Optional: `majidmanzarpour/threejs-game-skills`, copy `threejs-qa-release` plus its scripts and adapt to 2D; its canvas-pixel inspector catches "the canvas mounted but renders a flat grey rectangle", the classic false "it works" from a coder agent.

On a name collision with the installed pack, prefix the incoming folder (for example `web-game-audio`). Do not install anything for LLM NPCs or multi-agent orchestration; research confirmed no credible skill exists for the former and the latter is already covered.

## Engine decision (settled, do not reopen tonight)

Web-native only: DOM/Canvas, or Phaser/PixiJS if a coder is faster with them. No Unreal, no Unity, no Godot downloads tonight. The hackathon deliverable is a browser link that runs on seniors' phones; heavyweight engine web exports fight that constraint and the 9-hour window. The engine question for the real build gets revisited only if the chosen game demands it.

## Context capsule (self-contained, do not re-research)

- Event: Tencent Cloud Hackathon "Age Well" Social Good Challenge Singapore, Game Track. Organized locally by SMU AI Club.
- Theme: help seniors live with security, independence, dignity, and purpose. Singapore framing: nearly 1 in 4 citizens will be 65+ by 2030.
- Real deadline: Aug 9, 2026, 11:59 PM SGT. Deliverables for the real submission: playable web link, demo video, PPT with an "AI creation description" section.
- Judging: 30 Impact and Relevance / 40 Use of AI Tools / 30 Project Quality, +5 for a social post. The rubric names "worldbuilding and intelligent NPCs" as Game Track examples.
- Mandated tools for the real build: CodeBuddy (code) and Miora (art). Tonight's prototypes are direction-pickers, not the submission. The chosen game gets rebuilt or continued through CodeBuddy afterward, which is what makes the AI-usage story documentable.
- Research is done and verified. Full reports (absolute paths):
  - Hackathon brief: `/Users/dewa/Documents/Claude/clawd/reports/tencent-age-well-hackathon-brief-2026-07-25.html`
  - Research dossier and idea pitches: `/Users/dewa/Documents/Claude/clawd/reports/tencent-age-well-game-research-2026-07-25.html`
  - Bake-off decision report: `/Users/dewa/Documents/Claude/clawd/reports/tencent-age-well-bakeoff-brief-2026-07-26.html`
  - Source PDFs: `/Users/dewa/Documents/Claude/projects/Tencent Hackathon/`
  Skim only if a design question blocks an orchestrator. No research agents.

## The three games

Mocked AI is legitimate tonight. Template-plus-slots generation and pre-written variation banks are real procedural systems, they run offline, and the Stanford generative-agents team itself demoed with precomputed runs. Route every AI beat through `shared/ai.js` and label the seam so the real integration is a swap, not a rewrite. Placeholder art only (simple shapes, CSS, SVG); Miora art comes later from the team.

### 1. Memory Garden (gardening x reminiscence x AI worldbuilding)

Concept: a senior and a grandchild share one phone. Pick a heritage object (kopitiam cup, Setron TV, sewing machine), answer two or three gentle prompts about the memory it triggers, and a plant grows in the family garden. The plant's species, colors, and ornaments are composed from the answers. The garden persists and fills over sessions; tapping any plant replays its story.

V0 scope: 6 to 8 heritage objects with placeholder art; prompt chips plus optional free text (typing is the grandchild's job); a procedural plant composer (tag-to-trait mapping, visibly different outputs for different answers); garden grid in localStorage; replay on tap.

Definition of done: two different play sessions produce two visibly different plants from different answers; a revisit shows the garden remembered everything; loop takes under 4 minutes on a phone viewport.

### 2. Mahjong Kakis (mahjong x AI table companions)

Concept: stakes-free simplified mahjong-tile play at a kopitiam table with three AI kakis (aunties and uncles) who banter, remember you, and quietly adapt the pace. The tiles are the hook; the companions are the product.

V0 scope: tile-matching rounds using mahjong tiles (match pairs or complete small sets drawn from a wall; not full mahjong rules); three kaki characters with distinct voices delivered through event-keyed banter banks (win, slow turn, near-miss, return visit) with template slots for the player's name and history; one hidden difficulty dial that adjusts wall complexity based on recent performance; a "the kakis remember" beat: on second visit they reference the previous session.

Definition of done: a full round is playable and warm; the banter visibly reacts to at least four different game events; a second visit triggers a memory callback; no rules explanation needed to start.

### 3. Scam Dojo (Duolingo-style daily practice x the security pillar)

Concept: a daily two-minute lesson where the phone "rings" inside the game and a scammer tries a fresh angle (fake grandchild, fake bank, fake parcel, fake official). Tap the tells, hang up, earn the day's shield. Kind walkthrough on a miss, never a failure screen. A family mode idea (grandchild crafts practice scams for ah ma) stays on paper for the report, not in v0.

V0 scope: one call screen plus one chat screen; 8 to 10 scam scripts as templates with randomized slots (names, amounts, hooks) so runs feel freshly generated; tappable tell zones with big highlights; shield streak counter in localStorage; a gentle "here is what gave it away" recap after each round.

Definition of done: three consecutive rounds feel different; a wrong tap teaches instead of punishing; the streak survives a reload; a first-time player needs zero instructions.

## Constraints that always hold

- Senior UX floor from `CLAUDE.md` on every screen of every game: tap targets 60px or larger, body text 28px equivalent or larger, contrast 4.5:1 minimum aiming 7:1, tap-only, no timers, no fail states that shame.
- Everything runs locally, offline, with one command, on a phone-sized viewport.
- No accounts, no network calls, no real bank or agency names inside scam content (recognizable patterns, fictional brands).
- Honest READMEs per game: what works, what is mocked, how to run.
- Dewa's global rules: no console.log in production code, no emojis in code, no em dashes in writing.

## Freedom clause

Within the required orchestration shape, everything else is changeable: mechanics, art direction, tech stack, file layout, phase order, agent counts, and any v0 detail, if it gets the team a better feel for a direction. Scope may be cut inside a game to protect the other two. Not changeable: three games, playable locally, phone-first, the UX floor, honest READMEs, Fable orchestrators do not code. If one game is clearly winning mid-build, note it in its README and still finish the other two to their definitions of done: the deliverable is three real options, because the team decision is the point.

## Verification is part of done

Every game's definition of done must be verified by actually driving it (Playwright plugin, browser pane, or the canvas inspector if installed), not by reading the code. A coder agent claiming "it works" is a hypothesis, not a result. Budget real tokens for the verify-fix loop; it is the best spend of the night.

## For Matthew and Zoe (after the build)

Run all three on a phone. Score each out of 5 on: did it feel alive, did the AI beat impress you, would you proudly demo this on Aug 9, can we see ourselves building this for two weeks. Ties break toward the game whose AI story is easiest to explain in one sentence. The full argument for and against each direction lives in the bake-off report listed above.
