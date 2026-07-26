# Scam Dojo

A daily two minute scam drill for seniors. The phone rings inside the game, a scammer
tries an angle, you tap the lines that feel off, hang up, and earn the day's shield.
Wrong choices teach kindly. There is no fail state anywhere in the game.

## How to run

From the repo root:

    PORT=4173 node server.js

Then open http://localhost:4173/scam-dojo on a phone or a phone sized viewport (390x844).
No build step, no dependencies, nothing leaves localhost.

## What works

- The full loop: dojo home with shield streak, full screen incoming call, tap paced
  message bubbles (nothing ever advances on a clock), tap any line to flag it, hang up
  or comply, a kind recap, shield ceremony, streak saved in localStorage.
- 9 scam scripts across 8 families: fake grandchild (two different premises), fake bank,
  fake parcel fee, fake government official, lucky draw, tech support, charity, and
  investment. Rotation never repeats a family within two rounds, and every line draws
  one of several written variants with randomized slots (names, amounts, places), so
  consecutive rounds read differently. qa/dod.mjs plays 12 rounds and asserts every
  transcript is distinct.
- 8 tells taught: rushing you, secrecy, odd ways to pay, blocking verification, too good
  to be true, detail fishing, penalty threats, and transfers to "their" account. Tapping
  a tell earns a warm affirmation. Tapping a normal line gets a gentle note about why
  that part is actually normal, with zero penalty.
- Choosing "Do what they say" never punishes: a step by step walkthrough shows what
  would have happened at each tell, then the same recap, and the shield is earned anyway.
- Senior UX floor throughout: 64px tap targets, 28px minimum text, AAA contrast pairs
  from the shared tokens, tap only, no timers, reduced motion fully respected.

## What is mocked, and where the AI seam is

- Every generated line (scam lines, affirmations, recap explanations, walkthrough
  consequences, ceremony lines) comes from template banks with slot filling, routed
  through aiGenerate in shared/ai.js. That function body is the single swap point for a
  real model later, and meta.source labels where each line came from. The banks live in
  content/scam-scripts.json; call structure, tells and slot pools in
  content/call-structure.json.
- The streak counts completed rounds rather than calendar days, so the team can play
  several rounds in one sitting while judging the prototype.
- Every brand, agency and phone number is fictional on purpose (Merlion Bank, ParcelGo,
  Central Registry Office, numbers like +65 0000 4821). QA greps the content for real
  institution names and fails if any appear.
- Family mode (a grandchild crafting practice scams for ah ma) stays a paper idea for
  the report. Not built.

## QA

- qa/smoke.mjs: fast full loop suite, 16 checks. Expects the server on port 4185.
- qa/dod.mjs: definition of done suite, 9 sections covering content integrity, a 12
  round variety sweep, gentle teaching, the comply path, reload persistence and a
  clean console. Expects the server on port 4186.

Start a server on the matching port, then run each with node.

## Known issues

- Line events carry 3 variants each, so a very long session can start to feel the
  pattern inside one family even though no two rounds are identical.
- The 8 line official script uses the logistics benign category twice; variant rotation
  keeps the two taps from reading the same.
- The shield ceremony plays when it scrolls into view on the recap. A player who never
  scrolls that far will simply find the streak already updated back home.
