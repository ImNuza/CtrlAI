# CtrlAI

Team repo for the Tencent Cloud "Age Well" Social Good Challenge Singapore,
Game Track. Team: Dewa, Matthew, Zoe. Submission deadline 9 Aug 2026,
11:59 PM SGT.

The game is **Garden of Life**: cognitive exercises that grow a garden. Round
one was a three-prototype bake-off, the team picked the gardening direction on
29 Jul, and the build now in `app/` is the one going forward.

Five courses of exercises. Four of them are the original set (Tile Match,
Pattern, Odd One Out, Word Pairs). The fifth is **Kopitiam Corner**, which is
Mahjong Kakis ported in from the round-one prototype: face-up mahjong tiles,
three companions who banter and remember your name, and a difficulty dial
nothing in the UI ever mentions.

---

## Setting up and running it in VS Code

There is **no build step and nothing to compile**. You need two things
installed, then it runs.

### 1. Install what you need

- **[Node.js](https://nodejs.org)** version 18 or newer. Check what you have by
  opening a terminal and running `node --version`. If that prints a version
  number you are already done.
- **[VS Code](https://code.visualstudio.com)**.

You do **not** need to run `npm install`. The app has zero runtime
dependencies. (The two packages in `package.json` are only for the optional
screenshot tool described further down.)

### 2. Open the project

In VS Code: **File → Open Folder**, then pick the `CtrlAI` folder.

### 3. Start the server

Open the built-in terminal with **Terminal → New Terminal** (or `` Ctrl+` ``),
and run:

```bash
node server.js
```

You should see:

```
CtrlAI dev server running at http://localhost:4173
```

Leave that terminal running. To stop the server later, click into it and press
`Ctrl+C`.

### 4. Open the game

Go to **<http://localhost:4173/app/>** in your browser.

The root page, `http://localhost:4173/`, is just a signpost with links. The
game itself is at `/app/`.

### 5. Set a phone viewport

**This matters.** The game is portrait phone only and looks wrong on a desktop
window.

In Chrome: press `F12` to open DevTools, then click the **phone/tablet icon**
in the top-left of the DevTools panel (or press `Ctrl+Shift+M` /
`Cmd+Shift+M`). Set the size to **390 x 844**, which is the design target.

### Optional: run it with the F5 key

If you would rather press `F5` than type the command each time, create a file
at `.vscode/launch.json` containing:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "CtrlAI dev server",
      "type": "node",
      "request": "launch",
      "program": "${workspaceFolder}/server.js"
    }
  ]
}
```

Then press `F5` to start it and `Shift+F5` to stop it.

### If something goes wrong

**You changed a file but the browser shows the old version.** This is the one
gotcha in this project, and it will cost you an hour if you do not know about
it. The app is a PWA with a service worker that caches hard. In DevTools go to
**Application → Service Workers** and tick **"Bypass for network"**. Keep it
ticked the whole time you are working.

**`port 4173 is already in use`.** Something is still running on that port,
probably a server you forgot to stop. Either stop it, or pick another port:

```bash
PORT=4174 node server.js
```

**`node: command not found`.** Node is not installed, or VS Code's terminal
opened before you installed it. Install Node, then close and reopen the
terminal.

---

## Where things live

- `app/` **the shipping build.** One classic script (`game.js`), one stylesheet,
  no modules and no build step. This folder is also the deploy root on EdgeOne
  Pages, which is why `manifest.json` and `sw.js` sit inside it rather than at
  the repo root.
- `server.js` the dev server. Node builtins only, no dependencies.
- `design-system/` the Muted Botanical system: `design-tokens.css` is the token
  source, `design-system.html` is the living reference with every colour ratio
  measured and written down.
- `DEPLOY.md` how to get it onto a phone, and the one genuine gotcha
  (service workers need HTTPS or localhost, so a LAN IP will not do).
- `PORT_MAHJONG_KAKIS.md` what the Kakis port actually did: every file that
  moved, every colour that was remapped, what was dropped and why, and the
  limits that are still real.
- `GAME_ANALYSIS.md`, `PLAN_3D_GARDEN.md`, `PLAN_RETENTION_SYSTEMS.md` the
  analysis and specs the current build was worked from.
- `SPEC.md`, `RULES.md`, `CONTEXT.md`, `GOAL.md`, `BUILD-REPORT*.md` the record
  of round one and two: scope, constraints, decisions, spend ledger.
- `shared/` the seam layer the archived prototypes run on: `ai.js` (the SWAP
  POINT seams), `storage.js`, and the round-one UI tokens. `app/` does not
  import any of it, on purpose. See `PORT_MAHJONG_KAKIS.md`.
- `archive/` the three round-one prototypes (Memory Garden, Mahjong Kakis, Scam
  Dojo), still playable at `/archive/<name>`. The Mahjong Kakis copy is the
  reference the port was read from, kept intact until the port is trusted.
- `tools/make_icons.py` regenerates `app/icons/` with Pillow.
- `meetings/` the 29 Jul meeting record that picked the direction.

## The app's four tabs

Patches, Exercises, Shop, Profile. **Patches is the garden**: the field of soil
patches you pan around, where you plant, water and harvest. Tap a bare patch to
choose a seed, tap a plant in bloom to harvest it, tap any other plant to open
its detail panel. Everything else hangs off the menu button in the top bar,
which holds today's tasks, the sound toggle and sharing.

## Where the AI seam is

`kakiGenerate()` in `app/game.js` is the one function a real model replaces. It
is already async and already returns `{ text, meta }`, so no call site changes
when Tencent Cloud gets wired in. `KAKI_BANTER` then becomes the offline
fallback, and `meta.source` stays how the demo tells a real answer from a banked
one. The block above the function spells out the contract.

## Verify it

There is no automated suite for `app/` yet. It is verified by driving the real
UI at a phone-sized viewport. `PORT_MAHJONG_KAKIS.md` lists exactly what was
checked and what was not.

There is an optional screenshot and UX-floor inspector at `tools/qa/inspect.mjs`.
It is the only thing in this repo that needs dependencies:

```bash
npm install
node tools/qa/inspect.mjs --url http://localhost:4173/app/
```

The archived prototypes keep their own Playwright QA under `archive/<name>/qa/`,
pointed at the archive routes:

```bash
PORT=4182 node server.js
```

```bash
node archive/mahjong-kakis/qa/core.mjs
```

Those exercise the archived ES-module build, not `app/`. They are still useful
as a description of what the Kakis behaviour is meant to be.

## House rules

Senior UX floor on every screen: tap targets 60px or larger, body text 28px
equivalent or larger, contrast 4.5:1 minimum, tap-only, no timers, no shame
states, reduced motion respected. No `console.log` in production code. Commit at
working milestones. Honest READMEs everywhere, including about what is not done.
