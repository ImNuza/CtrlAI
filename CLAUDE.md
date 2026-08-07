# CtrlAI

Repo for the Tencent Cloud "Age Well" Social Good Challenge Singapore, Game Track. Team: Dewa, Matthew, Zoe. Submission deadline: Aug 9, 2026, 11:59 PM SGT.

Round one (done) was a three-prototype bake-off; the prototypes now live under `archive/` as lift-from material. The team picked the gardening direction on 29 Jul.

**The shipping build is `app/`.** One classic script (`app/game.js`), one stylesheet, no ES modules and no build step. `app/` is also the deploy root on EdgeOne Pages, which is why `manifest.json` and `sw.js` live inside it. The older modular build that was at `games/garden-of-life/` is gone; it was superseded and is recoverable from git history on `main`.

`app/` deliberately imports nothing from `shared/`. It is a standalone static bundle, and `shared/` only exists now to keep the archived prototypes running. Do not add an import from `app/` into `shared/` without reading `PORT_MAHJONG_KAKIS.md` first.

Mahjong Kakis was ported out of `archive/mahjong-kakis/` into `app/` as the fifth exercise island, "Kopitiam Corner". The archived copy is intentionally left intact as the reference. `PORT_MAHJONG_KAKIS.md` is the record of what moved, what was remapped, and what is still a known limit.

Run it with `node server.js`, then open `http://localhost:4173/app/` at 390x844. The service worker caches hard, so tick "Bypass for network" in DevTools while working, or you will spend an hour debugging a build you already fixed.

## First actions for any new session

1. If a `/goal` skill is available, invoke it now with the goal from `GOAL.md`. If it is not available, treat `GOAL.md` itself as the standing goal and proceed.
2. Read `GOAL.md` fully before writing any code, then `SPEC.md` (the game), `RULES.md` (orchestration shape, UX floor, house rules), and `CONTEXT.md` (rubric, deadline, verified facts, settled decisions).

## Orchestration contract (Dewa's explicit request)

This repo runs on heavy multi-agent orchestration: the main session conducts and integrates but writes no game code; Fable orchestrator agents plan, direct, and review; Opus coder subagents under them do all implementation. Dynamic workflows and large fan-outs are explicitly wanted. The current session's scope is in `GOAL.md`; the stable contract is in `RULES.md`.

A 67-skill game-development pack is installed at `.claude/skills/`; its `router` skill is the entry point for every coder. `GOAL.md` lists the priority skills plus vetted third-party additions to install.

## Hard rules (from Dewa's global standards)

- No `console.log` in production code. No emojis in code. No em dashes in any written output.
- Senior UX floor on every screen, non-negotiable: tap targets 60px or larger, body text 28px equivalent or larger, contrast 4.5:1 minimum (aim 7:1), tap-only interactions, no timers, no fail states that shame the player.
- Phone-first: build and test at a mobile viewport.
- Commit after every working milestone with a plain message. Do not push anywhere.
- Working beats pretty, pretty beats complete.

## What this repo is not

Not the final submission build. That happens with CodeBuddy and Miora (mandated, 40 of 100 points ride on documented AI-tool usage) once access lands. This repo is the source of truth that feeds it: locked spec, content banks, the reference slice, and the handoff doc. The three round-one prototypes stay as lift-from material.
