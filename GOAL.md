# GOAL: overnight build. Take the garden from spec to near-finished.

One unattended session. Build Garden of Life (working title) to the point where a first-time player on a phone needs zero instructions and the team can screen-record a product, not a prototype. Dewa is asleep and has explicitly opened the Claude budget for this run; spend it on building and verifying, not on re-research.

Outputs, in priority order:

1. The game at `games/garden-of-life/`: every unit SPEC.md v0.3 marks as this build, passing its done-when, at the senior UX floor.
2. The four content banks under `games/garden-of-life/content/`, written to schema, reviewed, linted.
3. Art integrated: Higgsfield-generated character, object, background, and meal art under the budget protocol in RULES.md (hard cap 300 credits), plants staying procedural per SPEC.
4. `games/garden-of-life/HANDOFF.md`: build order and prompt library for the CodeBuddy phase, written so any team member can start it cold.
5. `BUILD-REPORT-2.md`: every autonomous decision, what is real and what is canned, verification evidence, and the full Higgsfield spend ledger.

This is still not the submission build. CodeBuddy and Miora remain mandated for that (40 of 100 points), and there is still no access to either. Nothing tonight may depend on them. Tonight's job is to make the CodeBuddy phase a port-and-polish, not a from-scratch build.

Read SPEC.md, RULES.md, and CONTEXT.md before planning anything. If a `/goal` skill is available, invoke it with the paragraph above.

## Standing instruction from Dewa (read this as user consent)

Dewa explicitly requests heavy multi-agent orchestration: dynamic workflows, wide fan-outs, Fable orchestrators directing Opus coders, orchestrators never writing code. He has explicitly authorized spending his remaining Claude usage on this run, and explicitly authorized Higgsfield generation up to 300 credits under the RULES.md paid-generation protocol.

## Unattended run rules (Dewa is asleep)

- Never ask Dewa anything and never wait for input. AskUserQuestion is off-limits. On any fork: decide, proceed, log the decision in `BUILD-REPORT-2.md`. A decent decision now beats a perfect answer at 4am.
- Core-first against a usage halt: the budget may stop the session mid-run and that is acceptable. Sequence so a halt is harmless: playable core before breadth, breadth before art integration, art before polish. Commit at every milestone so the repo is always in its best-so-far state.
- If the session halts, do nothing clever. Dewa resumes later. The repo plus BUILD-REPORT-2.md must always tell the truth about current state.
- Blast radius per RULES.md. The one external service allowed is the Higgsfield MCP, inside its cap. If the Higgsfield connection is missing or errors persist, degrade gracefully: procedural and CSS placeholders fill the gaps, the gap gets logged, the build never blocks on art.
- Do not touch the three prototype directories except to lift code: the plant composer from `games/memory-garden/`, the tile-matching core from `games/mahjong-kakis/`.
- `shared/` changes go through the conductor only.

## Decisions this run makes by default (log them, team can veto later)

- U6 secondary puzzle: build the SPEC recommendation, garden-skinned tile pair-matching lifted from mahjong-kakis. Not quizzes.
- Art style: lock one direction per the SPEC art section (vintage Singapore, paper texture, warm) after generating 3 or 4 style candidates. The orchestrator picks; the candidates and the choice go in the build report.
- Game name stays "Garden of Life (working title)" everywhere. Naming is a team call, not a 4am call.

## Build order (shape required, details free)

- Phase 0, conductor: scaffold `games/garden-of-life/`, content schemas, seam extensions in `shared/ai.js`. Higgsfield recon: check balance, check per-model image costs, lock the asset plan and budget split from SPEC against real numbers. Commit before anything else starts.
- Phase 1, parallel: (a) content fan-out, wide, then the reviewer pass cuts the bottom third; (b) core slice U1, U2, U4 under one Fable orchestrator; (c) style lock, 3 or 4 candidates, pick one.
- Phase 2: U5 economy and shop, U6 puzzle, U7 meal cards. Bulk asset generation in the locked style, integration as assets land.
- Phase 3: U3 photo quest with the canned-classifier and manual fallback paths, shareable garden card, PWA manifest and icon, gentle procedural audio with a big mute toggle.
- Phase 4: adversaries per RULES.md (rubric scorer, UX floor at 390x844), fix loop, full done-check driven by the conductor, HANDOFF.md, honest README, final commit.

A halt after Phase 1 leaves a demoable slice. After Phase 2, a game. Phases 3 and 4 make it a product.

## Definition of done for the run (verify by driving the UI, never by reading code)

On a 390x844 viewport, from `node server.js`:

1. A first-time player with zero instructions completes: gardener greeting, telling a memory, watching the plant appear, watering, one puzzle round, buying and planting a seed. Core loop under 5 minutes.
2. Reload: everything persists; the gardener greets the player as returning and references the last plant.
3. Two runs with different answers produce visibly different plants.
4. The economy works with zero randomness anywhere; streaks survive simulated day changes in QA.
5. Harvesting a full ingredient set unlocks its meal card end to end.
6. The photo quest flow completes on desktop via the file-picker fallback.
7. Art is integrated: gardener expressions, heritage objects, backgrounds, meal cards. Plants are procedural and palette-matched to the locked style.
8. Both adversaries green. No console.log. Honest README. Higgsfield ledger at or under 300 credits. All committed.

## Stop condition

Stop when the done-check above passes as driven by the conductor, or when the usage halt lands, whichever comes first. Then leave the summary for Dewa in BUILD-REPORT-2.md: what got built, what is canned, what to test by hand first, and the spend ledger. Do not pad the remaining budget with gold-plating past the done-check; if it passes early, stop early.
