# Cognitive design and senior usability review

Two questions: is the app as simple as it can be for an older player, and are
the exercises actually built on anything real. Both answered against published
evidence rather than intuition, with the current build measured at 390x844.

Sources are listed at the end. The honesty constraint in `CONTEXT.md` section
"Evidence framing" governs every claim here: **nothing in this document
supports saying the game prevents dementia or cognitive decline.**

---

## Part 1: What the evidence actually says

### The three trained domains

The largest trial in this area is **ACTIVE** (Advanced Cognitive Training for
Independent and Vital Elderly): 2,802 adults, mean age 73.6, randomised to
train one of three domains, followed for 10 years and now for 20 through
Medicare claims.

| Domain | What was trained | Outcome |
|---|---|---|
| Memory | Verbal episodic recall strategies | Gains on memory measures |
| Reasoning | Serial pattern rule induction | Gains on reasoning measures |
| **Speed of processing** | Useful Field of View: identify and locate briefly shown targets | Gains, plus the only arm linked to lower dementia incidence |

Two findings matter for us:

1. **Training improves the thing you train, and mostly only that.** All three
   arms produced gains on their own measures and only limited transfer to
   everyday function. Near transfer is real; far transfer is weak. Anyone
   promising general "brain fitness" is ahead of the evidence.

2. **Speed of processing is the outlier.** In the 10-year analysis it was the
   only arm with reduced dementia risk (HR 0.71, CI 0.50 to 0.998, p = .049,
   note that the interval nearly touches 1.0). A February 2026 analysis
   extended this to 20 years and found the effect held **when reinforced with
   booster sessions** one to three years later.

**Read the caveats before quoting any of this.** The 20-year result is a
claims-based observational linkage on a reduced sample of about 2,021, not a
20-year randomised trial, and the authors state the effect on dementia risk
"remains under investigation." The original p-value is .049. This is
suggestive, not settled.

### What actually reduces dementia risk

The 2024 Lancet Commission puts roughly **45% of dementia cases** as
potentially preventable via 14 modifiable factors. Brain training is not one
of them. Two that are:

- **Social isolation**
- **Physical inactivity**

That is worth internalising, because it tells us where the honest impact story
lives. The kakis who remember your name and the daily reason to open the app
sit closer to a named risk factor than the puzzles do.

### The claim we can defend

> Garden of Life uses task designs drawn from the ACTIVE cognitive training
> protocol, and is built around daily engagement and social contact, two of
> the fourteen modifiable factors named by the 2024 Lancet Commission.
> Cognitive training reliably improves the skills it trains; broader transfer
> is not established, and we do not claim it.

That is a stronger deck line than an overreach, and it cannot be attacked.
Lumosity paid the FTC two million dollars for the overreach version.

---

## Part 2: Are our exercises real cognitive exercises?

Mapped against the ACTIVE domains:

| Our exercise | Real construct | Domain |
|---|---|---|
| Tile Match | Visual recognition memory, short-term | Memory |
| Pattern Sequence | Sequential recall, Corsi-block-like | Memory |
| Word Pairs | Verbal associative memory | Memory |
| Kopitiam Corner | Visual recognition memory, plus social contact | Memory |
| Odd One Out | Semantic categorisation | Reasoning, partly |

**Four of five exercises train the same domain.** The collection looks varied
and is not: it is memory, memory, memory, memory, and a light reasoning task.

Two gaps, in priority order:

### Gap 1: no speed of processing task at all

This is the domain with the best long-term evidence and we have nothing in it.

**The obstacle is our own UX floor, which says "no timers".** That rule exists
for good reasons and I am not proposing we drop it. But it is worth being
precise about what a UFOV task actually times, because the rule and the task
are compatible:

- UFOV controls **how long a stimulus is displayed**, then removes it.
- It does **not** put a clock on the player's answer.

There is no countdown, no running out of time, no failure for being slow. The
player answers whenever they are ready. Our existing Pattern Sequence already
works exactly this way: it shows a sequence, hides it, and waits.

So "no timers" should be read as **no time pressure on the player's response**,
not "no controlled stimulus exposure". Under that reading a UFOV task is fully
compatible with the floor, and we should say so explicitly in `RULES.md` so
nobody has to relitigate it.

**Proposed exercise: "Which one bloomed?"**

1. The garden is shown. One flower blooms at the centre, and at the same
   moment a second blooms somewhere in the periphery.
2. Both disappear after a controlled interval.
3. The player taps, at their own pace, which flower was at the centre and
   where the peripheral one appeared.
4. Difficulty adapts by **shortening the exposure and adding distractor
   flowers**, never by rushing the answer.

That is the ACTIVE speed protocol, garden-skinned, honest to the floor.
It also gives the deck a genuine line: our speed exercise is modelled on the
one training arm with 20-year follow-up data.

**Boosters are part of the protocol.** The 2026 result depended on them. Our
level path already replays levels at reduced reward, which is structurally the
same thing. Naming it as a booster in the copy costs nothing and is accurate.

### Gap 2: reasoning is thinner than it looks

ACTIVE's reasoning arm trained **serial pattern rule induction**: given a
sequence, work out the rule and continue it. Odd One Out is categorisation,
which is related but not the same, and our "Pattern" exercise is recall rather
than induction despite the name.

**Proposed exercise: "What comes next in the row?"** A row of planted patches
follows a rule (pandan, hibiscus, pandan, hibiscus, …; or growing in size; or
alternating colour). The player taps the seed that continues it. Pure rule
induction, no time element at all, and it fits the garden without contrivance.

---

## Part 3: Senior usability, measured against the current build

The strongest source here is a systematic review and thematic analysis of
design guidelines for mobile apps for older adults (JMIR mHealth, 2023). Its
guidelines, checked against what we actually shipped:

| Guideline | Our state | Action |
|---|---|---|
| **Favour tapping over gestures** (gestures need fine motor control) | **Fails at full land.** With 4 rows bought, 4 of 12 patches (33%) cannot be reached without a drag | Add a tap route to every patch |
| **Add text labels to icons** | The menu button is icon-only. Back and close buttons are icon-only | Label the menu button at minimum |
| **Do not assume symbol conventions** | We use a hamburger for the menu, which is exactly the abstract convention the review warns about | Label it, or replace with the word |
| **Avoid interactive elements at screen edges** | Nav tabs sit flush at 0px from both edges | Inset the nav row |
| **Reduce elements per screen** | Good. Four tabs, one main action per screen | Hold the line |
| **Every screen has an apparent exit** | Good. Modals close, play screen has back | Keep |
| **Clear immediate feedback after a tap** | Good. Sound, notification, animation | Keep |
| **Contextual step-by-step help, demonstrate before first use, video over text** | **Missing.** One first-visit hint card, no demonstration anywhere | Add a shown-not-told first run |
| **Simple familiar language** | Good throughout | Keep |
| **Minimise keyboard use** | Good. Only the optional kaki name | Keep |

### The gesture problem is the serious one

It is a direct consequence of the pannable field, and it is worth being
straight about: the roaming garden I built is a nicer toy and a worse
interface for the least dexterous third of the audience. Both things are true.

Three ways out, cheapest first:

1. **"See whole garden" button.** One tap zooms the field to fit the viewport
   so every patch is visible and tappable. Panning stays for anyone who wants
   it. Roughly an hour, and it fixes the guideline breach outright.
2. **Step arrows.** Big left/right buttons that pan one column per tap. Also
   about an hour, keeps the current zoom.
3. **Drop to one column.** No horizontal panning at any land size. Safest, and
   throws away the roaming feature.

I would ship 1. It preserves what we built and removes the barrier.

---

## Part 4: What I would do, given the clock

Ordered by value per hour, with the deadline in mind. There are not many hours
left, and the demo video and the deck's AI-creation section are worth more
than any of this.

| # | Change | Effort | Why |
|---|---|---|---|
| 1 | "See whole garden" button | ~1h | Fixes a measured accessibility breach affecting a third of patches |
| 2 | Label the menu button, inset the nav | ~30m | Two guideline breaches, trivial fixes |
| 3 | Write the honest evidence line into the deck | ~30m | Protects 30 Impact points and avoids the Lumosity trap |
| 4 | "Which one bloomed?" speed exercise | ~4h | Closes the real cognitive gap, gives the deck its strongest evidence line |
| 5 | Shown-not-told first run | ~3h | The review's clearest unmet guideline |
| 6 | "What comes next?" reasoning exercise | ~3h | Rounds out the domains |

Items 1 to 3 total about two hours and I would do all three. Items 4 to 6 are
real improvements that should not displace the submission deliverables.

---

## Sources

- [Ten-year effects of the ACTIVE cognitive training trial](https://pubmed.ncbi.nlm.nih.gov/24417410/). PubMed
- [Speed of processing training results in lower risk of dementia](https://www.sciencedirect.com/science/article/pii/S2352873717300598). Alzheimer's & Dementia: TRCI
- [Cognitive speed training linked to lower dementia incidence up to 20 years later](https://hub.jhu.edu/2026/02/10/cognitive-speed-training-lower-dementia/). Johns Hopkins, Feb 2026
- [Overview of the ACTIVE study at 20 years](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC6840874/). PMC
- [A randomized controlled trial of cognitive training using a visual speed of processing intervention](https://journals.plos.org/plosone/article?id=10.1371%2Fjournal.pone.0061624). PLOS One
- [Dementia prevention, intervention, and care: 2024 Lancet Commission](https://www.thelancet.com/commissions-do/dementia-prevention-intervention-and-care). The Lancet
- [2024 Lancet Commission: 14 modifiable risk factors](https://www.alzheimer-europe.org/news/2024-lancet-commission-underscores-potential-dementia-risk-reduction-identifying-14-modifiable?language_content_entity=en). Alzheimer Europe
- [Design guidelines of mobile apps for older adults: systematic review and thematic analysis](https://pmc.ncbi.nlm.nih.gov/articles/PMC10557006/). JMIR mHealth, 2023
- [The use of commercial computerised cognitive games in older adults: a meta-analysis](https://www.nature.com/articles/s41598-020-72281-3). Scientific Reports
