# CtrlAI

Prototype bake-off repo for the Tencent Cloud "Age Well" Social Good Challenge Singapore, Game Track. Team: Dewa, Matthew, Zoe. Submission deadline for the real game: Aug 9, 2026, 11:59 PM SGT.

## First actions for any new session

1. If a `/goal` skill is available, invoke it now with the goal from `GOAL.md`. If it is not available, treat `GOAL.md` itself as the standing goal and proceed.
2. Read `GOAL.md` fully before writing any code. It carries the mission, the three game specs, the constraints, and the freedom you have.

## Orchestration contract (Dewa's explicit request)

This repo runs on heavy multi-agent orchestration: the main session conducts and integrates but writes no game code; three Fable orchestrator agents (one per game) plan, direct, and review; Opus coder subagents under them do all implementation. Dynamic workflows and large fan-outs are explicitly wanted. Full architecture in `GOAL.md`.

A 67-skill game-development pack is installed at `.claude/skills/`; its `router` skill is the entry point for every coder. `GOAL.md` lists the priority skills plus vetted third-party additions to install.

## Hard rules (from Dewa's global standards)

- No `console.log` in production code. No emojis in code. No em dashes in any written output.
- Senior UX floor on every screen, non-negotiable: tap targets 60px or larger, body text 28px equivalent or larger, contrast 4.5:1 minimum (aim 7:1), tap-only interactions, no timers, no fail states that shame the player.
- Phone-first: build and test at a mobile viewport.
- Commit after every working milestone with a plain message. Do not push anywhere.
- Working beats pretty, pretty beats complete.

## What this repo is not

Not the final submission. The real build happens with CodeBuddy (mandated by the hackathon) after the team picks a direction. These prototypes exist so the team can feel three directions and choose one.
