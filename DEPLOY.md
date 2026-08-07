# Deploying & Developing Garden of Life

Two things: getting it live on a phone, and working on it in VS Code.

---

## Part 1 — What was blocking deployment (now fixed)

`GAME_ANALYSIS.md` flagged `BUG-09`: the app claimed to be a PWA but could not install. Three independent blockers, all resolved:

| Blocker | Was | Now |
|---|---|---|
| Service worker | none — every launch needed the network | `app/sw.js`, registered in `game.js` |
| Icon files | `manifest.json` pointed at `icons/*.png`; the folder did not exist | 4 PNGs generated in `app/icons/` |
| `start_url` | `/app/index.html` — wrong for any deploy root | `./` — resolves correctly either way |

Also added: `apple-touch-icon`, favicon, `apple-mobile-web-app-title`, and a `description` meta.

### What the service worker does

- **Precaches the shell** on install: `index.html`, `styles.css`, `game.js`, `manifest.json`, all icons.
- **Navigations are network-first** — a redeploy is picked up immediately, with the cached shell as fallback when offline.
- **Static assets are stale-while-revalidate** — instant from cache, refreshed in the background.
- **Google Fonts are cached separately and cache-first.** This is what makes the app render with real type offline; without it, offline would silently fall back to Georgia/system-ui.
- **Auto-updates.** A waiting worker is told to `SKIP_WAITING` and the page reloads once. A stuck service worker serving a stale build is a classic demo-day failure — this avoids it.

Verified live: worker `activated`, 9 shell files + 3 font entries cached, `index.html` served from cache intact (19,480 bytes).

> **Bump `CACHE_VERSION` in `app/sw.js` on every deploy** (`gol-v1` → `gol-v2` → …). Old caches are deleted on activate. This is the one manual step; forget it and returning users may sit on stale assets longer than intended.

---

## Part 2 — Deploy to EdgeOne Pages

Your notes already target EdgeOne Pages. The critical setting:

| Setting | Value |
|---|---|
| **Root / output directory** | `app` |
| Build command | *(none — no build step)* |
| Framework preset | Static / None |

Setting the root to `app` means `index.html`, `manifest.json`, and `sw.js` all sit at the site root, which is what `start_url: "./"` and the service worker scope assume.

### Option A — Git-connected (recommended)

The repo is already initialised. Commit and push:

```bash
git commit -m "Garden of Life — PWA deployment ready"
```

Then create a repo on GitHub and push:

```bash
git remote add origin <your-repo-url> && git branch -M main && git push -u origin main
```

Connect that repo in the EdgeOne Pages console, set the root directory to `app`, and deploy. Every push then redeploys automatically — and you get preview URLs per branch, which is the fastest way to test on a real phone.

### Option B — Direct upload

Drag the **contents of `app/`** (not the folder itself) into the EdgeOne Pages upload. Faster for a one-off, but no preview URLs and no rollback.

### Verify after deploying

1. Open the URL on an Android phone in Chrome → you should get an **"Install app"** prompt.
2. On iPhone/Safari → Share → **Add to Home Screen**.
3. Install it, then **turn on airplane mode and reopen it.** It must still load and play. That is the real test.

---

## Part 3 — Local development

### Serve it

This repo keeps its own zero-dependency dev server, so there is nothing to install:

```bash
node server.js
```

That prints `http://localhost:4173`. The app is at **`http://localhost:4173/app/`**.
`PORT=8765 node server.js` moves it. Node builtins only, no build step.

`/garden-of-life` is kept as an alias for `/app/` so older links and QA scripts
still land somewhere real. The archived round-one prototypes stay served at
`/archive/<name>`.

If you would rather use VS Code Live Server, point its root at `/app`. There is
no `.vscode/` folder committed here, so that is a one-time setting in your own
workspace config.

### Day-to-day loop

1. `node server.js`, then open `http://localhost:4173/app/`.
2. Set the viewport to a phone. **390×844 is the design target, portrait only.**
3. Edit `app/game.js`, `app/styles.css`, or `app/index.html`.
4. **Hard-reload** (`Cmd+Shift+R`) — the service worker caches aggressively, so a soft reload can serve stale files during development.

> While developing, tick **Application → Service Workers → "Bypass for network"** in DevTools. It stops the worker serving stale files and saves a lot of confusion. Or **"Update on reload"** on the same panel.

### Debugging

`app/game.js` is a single classic script, no modules and no build step, so Chrome DevTools breakpoints land on the real lines with no source map involved.

To inspect saved state:

```js
JSON.parse(localStorage.getItem('garden-of-life-v1'))
```

To wipe and test as a brand-new player:

```js
localStorage.clear(); location.reload();
```

### Regenerating icons

Art lives in `tools/make_icons.py` (pure Pillow, no SVG toolchain needed). Edit the drawing code and run:

```bash
python3 tools/make_icons.py
```

It writes straight into `app/icons/`. Needs Pillow (`pip install pillow`).

---

## Part 4 — Testing on a real phone

This is where the one genuine gotcha is.

### The secure-context problem

**Service workers only register on `https://` or `localhost`.** Serving on your LAN IP (`http://192.168.1.x:8765`) means the phone loads the app fine but **the service worker silently does not register** — so you cannot test install or offline that way. The game still runs; only the PWA layer is missing.

Three ways around it, best first:

**1. Deploy a preview and test that.** With the git-connected setup, push a branch and open the preview URL on your phone. Real HTTPS, real install prompt, real offline. This is the one I would use.

**2. Chrome USB port forwarding** — full DevTools on the phone, and `localhost` counts as secure:

- Enable Developer Options → USB debugging on the Android phone, plug it in.
- Desktop Chrome → `chrome://inspect/#devices` → **Port forwarding** → map `8765` → `localhost:8765`.
- Open `http://localhost:8765` **on the phone**. Service worker registers normally.

**3. A quick HTTPS tunnel** if you have one installed:

```bash
cloudflared tunnel --url http://localhost:8765
```

### For LAN testing anyway (no PWA layer)

`node server.js` already listens on every interface, so `http://<your-mac-ip>:4173/app/` works from a phone on the same Wi-Fi. Find the IP with `ipconfig getifaddr en0`. The game plays; only the PWA layer is missing.

### What to actually check on the device

- Tap targets — the design floor is 64px. Check the shelf plots and daily-task rows with a real thumb.
- Text legibility in daylight.
- Safe areas — notch and home indicator (`viewport-fit=cover` and `env(safe-area-inset-*)` are already in the CSS).
- The bottom nav is not covered by the browser chrome (the `100dvh` fix handles this — confirm it holds).
- Sound, since it is gated behind a user gesture on iOS.

---

## Part 5 — Pre-launch checklist

```
[ ] Bump CACHE_VERSION in app/sw.js
[ ] EdgeOne root directory set to `app`
[ ] Install prompt appears on Android
[ ] Add to Home Screen works on iOS
[ ] Airplane-mode reload still plays
[ ] Icon looks right on the home screen (not letterboxed)
[ ] Test as a brand-new player (localStorage.clear())
[ ] Test on the oldest phone you can find, not just yours
```

---

## Part 6 — Known gaps

These are deliberate, not oversights.

**Google Fonts is still an external dependency.** The service worker caches it after first load, so offline works from the second visit onward — but the *very first* load needs network, and the fonts come from a third-party origin. Self-hosting the two `.woff2` files in `app/fonts/` would remove that dependency entirely. Worth doing if you have a spare hour; the CSS already falls back to Georgia/system-ui, so the failure mode is cosmetic rather than broken.

**`--font-label` (Pinyon Script) is declared in `styles.css:41` but never used.** Harmless now that it is no longer fetched, but it is dead code.

**No social/leaderboard backend.** `identity` and `social` state do not exist yet — see `PLAN_RETENTION_SYSTEMS.md` §4. That work is still gated on EdgeOne KV being provisioned.

**The `mind_allfour` achievement still counts four types, not five.** Mahjong Kakis is the fifth exercise type, but the "all four in one day" achievement fires on the fourth distinct type played in a day and was left alone deliberately, because changing it to five would move the goalposts for anyone already partway there. See `PORT_MAHJONG_KAKIS.md`.

**The archived `archive/mahjong-kakis/` build is still in the repo.** It is the reference the port was read from, and it still runs on its own at `/archive/mahjong-kakis` off the ES-module `shared/ai.js` seam. It is not part of the deployed `app/` and shares no state with it (different localStorage keys). Delete it once you trust the port.
