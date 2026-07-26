# AI creation story, raw material

The submission PPT needs an "AI creation description" section, and Use of AI Tools is 40 of 100
points, the single biggest slice of the rubric. This file is the honest raw material for that
section, written the night the prototypes were built. Shape it, trim it, but keep it true.

## What is honestly true about this repo

The three prototypes were built overnight by a multi-agent pipeline, with humans asleep:

- One conductor session planned phases, enforced gates, and verified everything independently.
- Three orchestrator agents (one per game) planned their game, directed coder agents, reviewed
  output against a written definition of done, and wrote the READMEs. They were forbidden from
  writing code, and did not.
- Coder agents wrote every line of game code. Around twenty coder runs across the night.
- A nine-agent adversarial QA sweep then attacked the finished games (double-tap attacks, markup
  injection, senior UX floor measurement of every screen state, content audits) and found 20
  serious issues after the games already met their definitions of done. All were fixed and
  regression-tested the same night. Separately, an eight-agent review pass wrote rebuild notes.
- Verification was never "the agent said it works". Every claim was proven by driving the real
  UI headless at a phone viewport, scripted taps and assertions, screenshots read by a second
  pair of eyes, and suites rerun from scratch by the conductor. About 250 automated checks are
  green at handoff and rerunnable by anyone.

The full evidence trail is BUILD-REPORT.md plus the git log, which is its own demo: forty-odd
commits, each one a verified milestone.

## The AI inside the games, said plainly

Tonight the "AI" beats are template banks with randomized slots, routed through one function in
shared/ai.js with a documented swap point. That is a deliberate architecture decision, not a
shortcut to hide: it runs offline, it makes every run feel fresh, and it means wiring in a real
model later changes one function body and zero call sites. Memory in all three games is real
localStorage. Plant generation in Memory Garden is real seeded procedural composition.

For the submission build, the plan is that swap: a real model behind aiGenerate for the chosen
game (kaki table talk, garden captions, scam script generation), with the banks kept as the
offline fallback. The seam already exists and is labeled.

## Framing for the PPT (suggested, verify against the final rules)

1. AI as builder: the prototype bake-off itself was AI-orchestrated end to end, humans set the
   goal and slept. Judges reward process; this one is documented to the commit.
2. AI as material: the chosen game's companion characters or content generation move from
   template banks to a live model through the prepared seam, so the demo can show both modes
   (offline banks as the resilient fallback, live model when connected).
3. AI as QA: adversarial agent sweeps found real accessibility and safety bugs a human tester
   would have needed hours to hit. This is unusual and demoable.

One caution to check before writing the deck: the hackathon mandates CodeBuddy for the build
and Miora for art. The real build must happen there, and the deck's AI-usage section should
lead with CodeBuddy and Miora usage on the chosen game. Tonight's work is the exploration
phase; disclose it as that, with this repo as evidence, unless the rules read otherwise.

## Numbers worth quoting (all checkable in this repo)

- 3 playable prototypes in one night, phone-first, offline, zero runtime dependencies.
- 20 agents did the building and reviewing; 9 more attacked the result; 8 wrote rebuild notes.
- 20 serious findings after definition of done, all fixed and break-tested the same night.
- About 250 automated checks green at handoff, senior UX floor enforced by measurement
  (64px targets, 28px text, contrast computed with the WCAG formula, not eyeballed).
