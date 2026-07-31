# GOAL: round two. Lock the garden into buildable form.

One session, three outputs, then stop:

1. The four content banks under `games/garden-of-life/content/`, written to the SPEC.md schemas, reviewed, and linted.
2. A reference vertical slice in `games/garden-of-life/`: memory to plant to gardener reaction, passing its done-check below.
3. `games/garden-of-life/HANDOFF.md`: the prompt library and build order for the CodeBuddy phase, written so any team member can start that phase without this session's context.

This session does NOT build the full game. The submission gets built with CodeBuddy because 40 of 100 points depend on documented AI-tool usage, and this repo feeds that build rather than replacing it. The slice is also the pitch: Matthew and Zoe react to a playable screen, not a document.

Read SPEC.md, RULES.md, and CONTEXT.md before planning anything. If a `/goal` skill is available, invoke it with the paragraph above.

## Standing instruction from Dewa (read this as user consent)

Dewa explicitly requests heavy multi-agent orchestration for this session: dynamic workflows, wide fan-outs where the work supports them, Fable orchestrators directing Opus coders, orchestrators never writing code. The orchestration contract is in RULES.md.

## Attended run rules

Dewa is at the keyboard. Ask him only at these forks:

- Anything that would contradict a settled decision in CONTEXT.md.
- The game-name shortlist, only if a name is needed before the team meets.
- Accepting or rejecting an art direction for the slice.

Everything else: decide, proceed, log the decision in `BUILD-REPORT-2.md`. Round one's report format worked; reuse it.

## Hard boundaries for this session

- No CodeBuddy, no Miora, no dependence on either. Access has not landed. The HANDOFF doc is how their phase starts later.
- Do not touch the three prototype directories except to lift code: the plant composer from `games/memory-garden/`, the matching core from `games/mahjong-kakis/` if U6 gets decided in time.
- `shared/` changes go through the conductor only.
- Blast radius per RULES.md: nothing outside this repo, no accounts, no pushes.

## Decomposition sketch (shape required, details free)

- Phase 0, conductor: scaffold `games/garden-of-life/` plus the four content schemas as empty typed files. Commit.
- Phase 1a, content fan-out, wide and cheap: parallel agents write banks per schema. Then a reviewer agent reads every bank aloud against RULES.md content standards and cuts the bottom third. Volume without the cut is worse than no volume.
- Phase 1b, slice build, in parallel with 1a: one Fable orchestrator owns the slice, directs Opus coders, lifts the composer rather than rewriting it.
- Phase 2, adversaries: rubric adversary scores the slice against CONTEXT.md weights; senior UX adversary drives every screen at 390x844 against the RULES.md floor. Findings feed a fix loop.
- Phase 3, handoff: HANDOFF.md, honest README, final commit.

## Definition of done for the slice (verify by driving the UI, never by reading code)

On a 390x844 viewport, from `node server.js`:

1. Fresh visit: pick a heritage object, answer three tap prompts, watch a visibly composed plant appear in the garden, and get a gardener comment that references the answer just given.
2. Reload: the garden persists, and the gardener greets the player as returning, referencing the previous plant.
3. Second run with different answers: a visibly different plant.
4. Every screen passes the senior UX floor.
5. No console.log in shipped code, honest README in place, all of it committed.

## Stop condition

Stop when the three outputs exist, the slice done-check passes as driven by the conductor, and BUILD-REPORT-2.md tells the truth about what is real and what is canned. Then give Dewa the summary and what to test by hand. Do not continue into full-game territory past the stop, whatever the remaining budget looks like.
