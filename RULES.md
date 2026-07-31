# RULES: stable across sessions. Change only with Dewa.

## Who writes what (orchestration contract)

- The main session is the conductor and integrator. It plans, spawns, reviews, merges, verifies. It writes no game code.
- Fable orchestrator agents plan, direct, and review. They write plans, reviews, and README text only, never game code.
- Opus coder agents implement. Each coder owns exactly the directory it is assigned and touches nothing outside it.
- `shared/` is frozen. Only the conductor changes it, on request from an orchestrator.
- Dynamic workflows and wide fan-outs are standing policy whenever the current GOAL.md carries Dewa's consent block. Worktree isolation only if parallel writes actually collide; directory ownership should make it unnecessary.

## Senior UX floor (every screen, non-negotiable)

- Tap targets 60px or larger.
- Body text 28px equivalent or larger.
- Contrast 4.5:1 minimum, aim for 7:1.
- Tap-first: typing is never required to progress. Free text exists only as an optional extra framed as the grandchild's job.
- No timers. No fail states that shame the player.
- Phone-first: build and verify at a 390x844 viewport.

## House rules

- No `console.log` in production code. No emojis in code. No em dashes in any written output.
- Commit at every working milestone with a plain message. Push only when Dewa says so.
- Honest READMEs everywhere: what works, what is mocked, how to run.

## The AI seam

- Every AI beat routes through `shared/ai.js`. One function signature per beat, marked with a SWAP POINT comment, so the real model integration is a swap, not a rewrite.
- SPEC.md declares each beat real, canned, or hybrid. A coder never silently mocks a beat the spec marks real. If a real call is impossible in the current session, implement the canned path and log the gap in the build report.

## Content standards

- Banks follow the schemas in SPEC.md exactly, including counts.
- Read every line aloud. If it sounds like a form or a survey, cut it.
- No guilt or shame lines anywhere, including wilt notices.
- No medical or disease-prevention claims. "Rich in fibre" is fine. "Prevents dementia" is banned.
- No real brand, bank, or agency names.
- Singapore register, warm and natural. Light lah or ah is fine where it lands; never mock the way seniors speak.
- Volume never beats quality: a reviewer pass reads each bank and cuts the bottom third before it ships.

## Verification doctrine

- A coder agent claiming "it works" is a hypothesis, not a result. Every done-check is verified by driving the real UI at a phone viewport, not by reading code.
- Before any milestone is called done, two adversaries run:
  - Rubric adversary: scores the current build out of 100 against the weights in CONTEXT.md and lists where points are being left on the table. Output is that list, nothing else.
  - Senior UX adversary: drives every screen at 390x844 and fails anything below the floor above.
- Adversary findings feed the fix loop before polish continues.

## Paid generation (Higgsfield)

Applies only when the current GOAL.md grants a budget. Without that grant, this section grants nothing.

- The cap in GOAL.md is a hard ceiling, not a target. Reaching it stops all generation; placeholders fill remaining gaps and the gap list goes in the build report.
- Before the first generation: check the account balance, check per-model image costs, and write the full asset plan sized against real numbers with the reserve intact. No generation before the plan exists.
- Images only. No video, no 3D, no upscales. They cost multiples of an image and tonight needs none of them.
- Lock style first: 3 or 4 candidates, pick one, then every asset uses the same prompt scaffold. Use the character-sheet workflow for any recurring character. Prefer remove_background on an existing asset over regenerating it.
- No reroll churn. One retry per asset on a clear failure, then move on with the best take. A slightly off illustration beats an empty budget.
- Every call gets a ledger line in the build report: what, which model, credits, kept or discarded. The ledger total is checked against the account balance delta at the end.
- If the Higgsfield connection is absent or failing, degrade to procedural and CSS placeholders, log it, and never block the build on art.

## Blast radius

- Touch nothing outside this repo, except reading the report files listed in CONTEXT.md.
- No accounts, no external services, no network calls in the product, no pushes. One exception: the Higgsfield MCP, only under the paid-generation rules above and only when GOAL.md grants a budget.
