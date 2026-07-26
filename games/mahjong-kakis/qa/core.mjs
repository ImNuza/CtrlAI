#!/usr/bin/env node
// Mahjong Kakis core QA. Drives the real UI at a phone viewport: fresh player,
// name chip, a forced near miss, then a full round cleared by tapping real
// pairs. Captures one banter line per event and reads the saved profile back.
//
// The four events a first sitting produces are first_visit, near_miss,
// match_found and round_win. round_start belongs to the second deal onwards,
// which this run never reaches, so it is not in the set below.

import { chromium } from 'playwright';

const URL = process.env.MK_URL || 'http://localhost:4182/mahjong-kakis';
const BUBBLE_TIMEOUT = 3000;

function check(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function readBubble(page) {
  return page.$eval('[data-bubble]', (el) => ({
    event: el.dataset.event || '',
    kaki: el.dataset.kaki || '',
    text: (el.querySelector('[data-bubble-text]')?.textContent || '').trim(),
  }));
}

async function waitForBubble(page, event) {
  await page.waitForSelector(`[data-bubble][data-event="${event}"]`, { timeout: BUBBLE_TIMEOUT });
  return readBubble(page);
}

async function tileInfo(page) {
  return page.$$eval('[data-tile]', (els) =>
    els.map((el, index) => {
      const r = el.getBoundingClientRect();
      return {
        index,
        id: el.dataset.tile,
        state: el.dataset.state,
        w: Math.round(r.width),
        h: Math.round(r.height),
      };
    })
  );
}

async function waitForStates(page, indexes, want) {
  await page.waitForFunction(
    (arg) => {
      const els = document.querySelectorAll('[data-tile]');
      return arg.indexes.every((i) => els[i] && els[i].dataset.state === arg.want);
    },
    { indexes, want },
    { timeout: 5000 }
  );
}

async function main() {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  await context.addInitScript(() => {
    try {
      localStorage.clear();
    } catch (err) {
      // storage blocked, the game falls back to its in memory shim
    }
  });

  const page = await context.newPage();
  const pageErrors = [];
  const consoleErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e.message)));
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });

  const seen = new Set();
  const events = {};

  try {
    await page.goto(URL, { waitUntil: 'networkidle', timeout: 20000 });

    // (a) fresh player lands on the name screen and nothing else.
    await page.waitForSelector('[data-screen="name"]:not([hidden])', { timeout: 5000 });
    check(await page.locator('[data-screen="name"]').isVisible(), 'name screen not visible');
    check(!(await page.locator('[data-grid]').isVisible()), 'tile grid visible on the name screen');
    check((await page.locator('[data-tile]').count()) === 0, 'tiles rendered on the name screen');

    const chips = await page.$$eval('[data-name-chip]', (els) =>
      els.map((el) => {
        const r = el.getBoundingClientRect();
        return { label: el.dataset.nameChip, w: Math.round(r.width), h: Math.round(r.height) };
      })
    );
    check(chips.length >= 3, `expected at least 3 name chips, saw ${chips.length}`);
    for (const chip of chips) {
      check(chip.w >= 60 && chip.h >= 60, `name chip "${chip.label}" is ${chip.w}x${chip.h}`);
    }

    const primaries = await page
      .locator('button.btn:not(.btn-plain):not(.btn-quiet):visible')
      .count();
    check(primaries === 1, `expected exactly one primary button on the name screen, saw ${primaries}`);

    // (b) one tap on a chip starts the game.
    await page.locator('[data-name-chip="Ah Ma"]').tap();
    await page.waitForSelector('[data-tile]', { timeout: 5000 });
    const dealt = await tileInfo(page);
    check(dealt.length >= 8, `expected at least 8 tiles, saw ${dealt.length}`);
    check(dealt.length % 2 === 0, `expected an even tile count, saw ${dealt.length}`);
    for (const tile of dealt) {
      check(tile.w >= 60 && tile.h >= 60, `tile ${tile.id} is ${tile.w}x${tile.h}`);
    }

    // (c) the kakis welcome the player by name. A player who has never finished
    //     a round is met with first_visit, not a round start: the opening line
    //     teaches the rule and claims no history it cannot have.
    const start = await waitForBubble(page, 'first_visit');
    seen.add(start.event);
    events.first_visit = start.text;
    check(start.text.includes('Ah Ma'), `first_visit line missing the name: "${start.text}"`);
    check(
      !/\{|\}/.test(start.text),
      `first_visit line has an unfilled slot: "${start.text}"`
    );

    // (d) force a near miss with two different identities.
    const differing = [];
    for (const tile of dealt) {
      if (differing.length === 0 || dealt[differing[0]].id !== tile.id) {
        differing.push(tile.index);
      }
      if (differing.length === 2) break;
    }
    check(differing.length === 2, 'could not find two tiles with different identities');
    const tiles = page.locator('[data-tile]');
    await tiles.nth(differing[0]).tap();
    await tiles.nth(differing[1]).tap();
    const miss = await waitForBubble(page, 'near_miss');
    seen.add(miss.event);
    events.near_miss = miss.text;
    await waitForStates(page, differing, 'idle');
    const afterMiss = await tileInfo(page);
    for (const index of differing) {
      check(afterMiss[index].state === 'idle', `tile ${index} did not return to idle after a near miss`);
    }

    // (e) clear the table pair by pair.
    let guard = 0;
    while (guard < 40) {
      guard += 1;
      const remaining = (await tileInfo(page)).filter((t) => t.state !== 'cleared');
      if (remaining.length === 0) break;

      const byId = new Map();
      let pair = null;
      for (const tile of remaining) {
        const group = byId.get(tile.id) || [];
        group.push(tile.index);
        byId.set(tile.id, group);
        if (group.length === 2) {
          pair = group;
          break;
        }
      }
      check(pair !== null, 'no matching pair left among the uncleared tiles');

      await tiles.nth(pair[0]).tap();
      await tiles.nth(pair[1]).tap();

      if (!events.match_found && remaining.length > 2) {
        const match = await waitForBubble(page, 'match_found');
        seen.add(match.event);
        events.match_found = match.text;
      }
      await waitForStates(page, pair, 'cleared');
    }
    check(guard < 40, 'gave up before the table was clear');
    check(Boolean(events.match_found), 'never saw a match_found line');

    // (f) celebration plus the win line.
    await page.waitForSelector('[data-screen="win"]:not([hidden])', { timeout: 5000 });
    check(await page.locator('[data-screen="win"]').isVisible(), 'celebration not visible');
    const win = await waitForBubble(page, 'round_win');
    seen.add(win.event);
    events.round_win = win.text;

    // (g) four distinct lines, four distinct events.
    const texts = Object.values(events);
    check(texts.length === 4, `expected 4 recorded lines, have ${texts.length}`);
    for (const text of texts) {
      check(text.length > 0, 'recorded an empty banter line');
    }
    check(new Set(texts).size === 4, `banter lines repeated: ${JSON.stringify(texts)}`);
    for (const name of ['first_visit', 'match_found', 'near_miss', 'round_win']) {
      check(seen.has(name), `never observed the ${name} event on the bubble`);
    }

    // (h) the profile is on disk.
    const raw = await page.evaluate(() => localStorage.getItem('ctrlai:mahjong-kakis'));
    check(Boolean(raw), 'nothing saved under ctrlai:mahjong-kakis');
    const stored = JSON.parse(raw);
    check(stored.name === 'Ah Ma', `stored name is ${JSON.stringify(stored.name)}`);
    check(stored.roundsPlayed >= 1, `stored roundsPlayed is ${stored.roundsPlayed}`);

    check(pageErrors.length === 0, `page errors: ${pageErrors.join(' | ')}`);
    check(consoleErrors.length === 0, `console errors: ${consoleErrors.join(' | ')}`);

    const summary = {
      ok: true,
      events,
      tiles: dealt.length,
      storage: {
        name: stored.name,
        visits: stored.visits,
        roundsPlayed: stored.roundsPlayed,
        totalMatches: stored.totalMatches,
        bestClear: stored.bestClear,
        recent: stored.recent,
        dial: stored.dial,
      },
    };
    process.stdout.write(JSON.stringify(summary, null, 2) + '\n');
  } catch (error) {
    const failure = {
      ok: false,
      failure: String(error && error.message ? error.message : error),
      events,
      pageErrors,
      consoleErrors,
    };
    process.stdout.write(JSON.stringify(failure, null, 2) + '\n');
    await browser.close();
    process.exit(1);
  }

  await browser.close();
}

main().catch((error) => {
  process.stderr.write(String(error && error.stack ? error.stack : error) + '\n');
  process.exit(1);
});
