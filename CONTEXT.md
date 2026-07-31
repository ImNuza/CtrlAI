# CONTEXT: verified capsule. Do not re-research any of this.

Everything here was verified against the hackathon documents and the 29 Jul meeting digest. If a design question is not answered here, check the digest before spawning any research agent.

## Event

- AI CAN DO IT, Tencent Cloud Hackathon, "Age Well" Social Good Challenge Singapore, Game Track. Local organizer: SMU AI Club.
- Team CtrlAI: Dewa, Matthew, Zoe.
- Theme: seniors living with security, independence, dignity, and purpose. Singapore hits super-aged status in 2026; nearly 1 in 4 citizens will be 65+ by 2030.

## Dates

- Submission deadline: Aug 9, 2026, 11:59 PM SGT. This is the only date all sources agree on.
- Finalists announced Aug 10 or 12 (sources conflict). Demo Day (offline, Singapore) Aug 18 to 23. Grand Final in Shenzhen, September.

## Deliverables (Game Track, exactly three)

1. Game web link. An online demo playable from a URL in a browser. EdgeOne is the suggested host. A code repository is not a deliverable.
2. Demo video. Must showcase core gameplay and the AI.
3. Project introduction deck (PPT): project overview, "AI creation description", team info. The AI creation section is where the 40 AI points get argued. Treat it as a first-class deliverable.

File naming, mandatory: `[Project Name]-[Deliverable Name]-[Team Name]`.

The submission form did not exist as of 29 Jul. Watch Discord.

## Scoring (identical across all three source documents)

| Dimension | Points | What judges look for |
|---|---|---|
| Use of AI Tools | 40 | Effectiveness and depth of AI usage. Game Track examples named in the rubric: worldbuilding and intelligent NPCs |
| Impact and Relevance | 30 | Fit to Age Well, how the underlying issue is tackled, scope of influence |
| Project Quality | 30 | Completeness, interactivity, creativity, technical execution, appeal |
| Social media bonus | +5 | Post on Rednote, YouTube, or X with #CodeBuddy #WorkBuddy #Miora #TencentCloudHackathon |

## Mandated tools and credits

- CodeBuddy for code, Miora for art. The handbook says "highly recommends", the deck says "Development Tool Requirements". With 40 points on AI usage, treat both as mandatory for the submission build.
- Credits are per person: 2,000 CodeBuddy/WorkBuddy each (distribution was pending as of 29 Jul, forms resubmitted), 1,000 Miora each (automatic on signup). Three signups pool 6,000 + 3,000.
- The team has no CodeBuddy or Miora access yet. No work in this repo may depend on either until Dewa says access has landed.
- Separate from the hackathon tools: Dewa's Higgsfield account is reachable through an MCP server in his sessions. It is not part of the mandated tool story. When a GOAL.md grants a budget, it covers interim art and style lock only, under the RULES.md paid-generation protocol; Miora stays the submission art story and can regenerate from tonight's references.

## Decisions already made (settled in the 29 Jul meeting, do not reopen)

- One game, not three.
- Gardening frame, agreed by all three.
- 2D, not 3D.
- Mobile-first. The deliverable is a browser link, so this means a mobile web app, not React Native.
- Plants wilt when neglected; they never die.
- Start building without waiting for credits.

## Revisions proposed in the 29 Jul digest (Dewa-approved, pending Matthew and Zoe sign-off)

Additions: memory-driven planting replaces quiz-to-earn as the primary loop; one gardener NPC with generated lines and bounded tap-chip replies; photo quest replaces step quests.
Cuts: gacha seed pulls (shop + streaks instead), step counting (impossible from a browser), cognitive-decline claims (indefensible), the "inspired by Grow a Garden" framing (scores our own creativity down).

Full argument with sources: `meetings/29jul/digest-29jul-meeting.html`.

## Platform facts (hard constraints, verified, not opinions)

- A browser cannot read the hardware step counter. Native pedometers run on a coprocessor a web page cannot reach. DeviceMotionEvent needs a user-gesture permission on iOS and stops when the tab backgrounds. Step quests are unbuildable for a web-link deliverable.
- iOS web push only works after the user adds the site to their Home Screen via Safari. A judge clicking our link gets no notifications. Reminders must live in-game.
- The camera works fine from a browser: `<input type="file" accept="image/*" capture="environment">` opens the native camera on mobile with no permission dance, and degrades to a file picker on desktop. This is the robust path for photo quests.
- localStorage persistence is fine for the demo; every judge gets their own garden. navigator.share needs HTTPS plus a user gesture; provide a download fallback for the share image.

## Evidence framing (for the deck and all copy)

- Claim: designed around horticultural therapy and reminiscence practice. Both have systematic-review support for older adults; benefits are real but small. Claim them honestly at that strength.
- Never claim the game prevents cognitive decline or dementia. The evidence does not support it and Lumosity paid the FTC 2 million dollars for that exact claim shape.
- Positioning against Healthy 365 (HPB's app already does steps-for-points and quizzes-for-rewards for 50+): we do not compete on steps and points. Healthy 365 tracks a senior. This game remembers one. Memory, story, and a character who knows you.
- Singapore hook: NParks Community in Bloom has 2,000+ gardening groups, 48,000+ gardeners, 2,500+ allotment plots, with seniors central. The digital garden maps onto something real seniors already do.

## Pointers (skim only if a design question blocks you)

- Meeting digest, canonical: `/Users/dewa/Documents/Claude/clawd/reports/ctrlai-29jul-meeting-digest-2026-07-31.html` (repo copy: `meetings/29jul/digest-29jul-meeting.html`)
- Zoe's v0.1 PDF: `meetings/29jul/age-well-garden-of-life-summary-2.pdf`
- Hackathon brief: `/Users/dewa/Documents/Claude/clawd/reports/tencent-age-well-hackathon-brief-2026-07-25.html`
- Bake-off decision report: `/Users/dewa/Documents/Claude/clawd/reports/tencent-age-well-bakeoff-brief-2026-07-26.html`
- Research dossier: `/Users/dewa/Documents/Claude/clawd/reports/tencent-age-well-game-research-2026-07-25.html`
- Raw transcript `meetings/29jul/meeting.json` is 4 MB of code-switched ASR. Do not load it into context; the digest already carries everything it says.

## Watch items (blocked on others, do not gate work on these)

- Credits not yet distributed. Forms resubmitted 29 Jul; chase via the Telegram contact.
- Submission form and process not announced.
- Finalists date conflict (Aug 10 vs 12) unresolved.
