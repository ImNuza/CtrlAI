#!/usr/bin/env node
// Mahjong Kakis dial QA. The table quietly follows recent form: bigger when the
// pairs are coming easily, smaller when they are not. Nothing on screen is ever
// allowed to name it, so this also checks the words the UI must never say.

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const URL = process.env.MK_URL || 'http://localhost:4182/mahjong-kakis';
const KEY = 'ctrlai:mahjong-kakis';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BANK_PATH = path.join(HERE, '..', 'content', 'kaki-banter.json');

// The dial is hidden, so none of these may ever reach the screen.
const DIAL_WORDS = /difficult|level|easy|hard/i;
const TAP_MIN = 60;

function check(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function profile(recent, dial) {
  return {
    name: 'Mabel',
    visits: 2,
    roundsPlayed: recent.length,
    totalMatches: recent.reduce((sum, r) => sum + r.matches, 0),
    bestClear: 1,
    recent,
    dial,
  };
}

async function open(browser, seed, viewport) {
  const context = await browser.newContext({
    viewport: viewport || { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  await context.addInitScript(
    ([key, value]) => {
      try {
        localStorage.clear();
        if (value !== null) {
          localStorage.setItem(key, value);
        }
      } catch (err) {
        // storage blocked, the game falls back to its in memory shim
      }
    },
    [KEY, seed === null ? null : JSON.stringify(seed)]
  );
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto(URL, { waitUntil: 'networkidle', timeout: 20000 });
  return { context, page, errors };
}

async function dealtCount(browser, label, recent, dial, want) {
  const { context, page, errors } = await open(browser, profile(recent, dial));
  await page.waitForSelector('[data-tile]', { timeout: 5000 });
  const tiles = await page.locator('[data-tile]').count();
  check(tiles === want, `${label}: dealt ${tiles} tiles, expected ${want}`);
  const stored = JSON.parse(await page.evaluate((k) => localStorage.getItem(k), KEY));
  check(
    stored.dial && stored.dial.tileCount === want,
    `${label}: stored dial is ${JSON.stringify(stored.dial)}, expected tileCount ${want}`
  );
  check(errors.length === 0, `${label}: page errors: ${errors.join(' | ')}`);
  await context.close();
  return { tiles, dial: stored.dial };
}

async function main() {
  const summary = { ok: true, scenarios: {} };
  const browser = await chromium.launch();

  try {
    // The bank must not carry the vocabulary either, since every line lands in
    // the DOM the moment a kaki says it.
    const bank = JSON.parse(await readFile(BANK_PATH, 'utf8'));
    for (const [key, lines] of Object.entries(bank)) {
      for (const line of lines) {
        check(!DIAL_WORDS.test(line), `${key} names the dial: "${line}"`);
      }
    }

    // (a) pairs coming easily: the table grows one step.
    summary.scenarios.thriving = await dealtCount(
      browser,
      'thriving',
      [{ matches: 6, misses: 0 }, { matches: 6, misses: 1 }],
      { tileCount: 12, lookalike: 0.5 },
      14
    );

    // (b) working for them: the table eases off one step.
    summary.scenarios.struggling = await dealtCount(
      browser,
      'struggling',
      [{ matches: 4, misses: 6 }, { matches: 4, misses: 5 }],
      { tileCount: 12, lookalike: 0.5 },
      10
    );

    // (c) in between: nothing moves.
    summary.scenarios.steady = await dealtCount(
      browser,
      'steady',
      [{ matches: 4, misses: 2 }, { matches: 4, misses: 2 }],
      { tileCount: 12, lookalike: 0.5 },
      12
    );

    // (d) the screen never names the dial.
    {
      const { context, page } = await open(
        browser,
        profile([{ matches: 6, misses: 0 }, { matches: 6, misses: 1 }], { tileCount: 12, lookalike: 0.5 })
      );
      await page.waitForSelector('[data-tile]', { timeout: 5000 });
      await page.waitForSelector('[data-bubble][data-event]', { timeout: 3000 });
      const text = await page.evaluate(() => document.body.innerText);
      const hit = text.match(DIAL_WORDS);
      check(hit === null, `the screen names the dial: "${hit && hit[0]}" in "${text.replace(/\s+/g, ' ')}"`);
      summary.scenarios.vocabulary = { clean: true, sampled: text.replace(/\s+/g, ' ').trim() };
      await context.close();
    }

    // (e) a first ever round is always the small table.
    {
      const { context, page, errors } = await open(browser, null);
      await page.waitForSelector('[data-screen="name"]:not([hidden])', { timeout: 5000 });
      await page.locator('[data-name-chip="Ah Ma"]').tap();
      await page.waitForSelector('[data-tile]', { timeout: 5000 });
      const tiles = await page.locator('[data-tile]').count();
      check(tiles === 8, `fresh player was dealt ${tiles} tiles, expected 8`);
      check(errors.length === 0, `fresh: page errors: ${errors.join(' | ')}`);
      summary.scenarios.fresh = { tiles };
      await context.close();
    }

    // (f) the biggest table this dial can reach in one step still fits a narrow
    //     phone: real tap targets, nothing pushed off the side.
    {
      const { context, page } = await open(
        browser,
        profile([{ matches: 6, misses: 0 }, { matches: 6, misses: 1 }], { tileCount: 12, lookalike: 0.5 }),
        { width: 360, height: 844 }
      );
      await page.waitForSelector('[data-tile]', { timeout: 5000 });
      const layout = await page.evaluate(() => {
        const tiles = [...document.querySelectorAll('[data-tile]')].map((el) => {
          const r = el.getBoundingClientRect();
          return { w: Math.round(r.width), h: Math.round(r.height) };
        });
        const doc = document.documentElement;
        const grid = document.querySelector('[data-grid]');
        const slot = document.querySelector('[data-bubble-slot]').getBoundingClientRect();
        return {
          count: tiles.length,
          minW: Math.min(...tiles.map((t) => t.w)),
          minH: Math.min(...tiles.map((t) => t.h)),
          columns: getComputedStyle(grid).gridTemplateColumns.split(' ').length,
          hScroll: doc.scrollWidth > doc.clientWidth,
          scrollWidth: doc.scrollWidth,
          clientWidth: doc.clientWidth,
          // the fixed bubble slot must never sit on top of the table
          bubbleClearsGrid: grid.getBoundingClientRect().top >= slot.bottom,
        };
      });
      check(layout.count === 14, `narrow phone dealt ${layout.count} tiles, expected 14`);
      check(layout.columns === 4, `grid has ${layout.columns} columns, expected 4`);
      check(
        layout.minW >= TAP_MIN && layout.minH >= TAP_MIN,
        `smallest tile is ${layout.minW}x${layout.minH}, floor is ${TAP_MIN}`
      );
      check(
        !layout.hScroll,
        `horizontal scroll at 360px: ${layout.scrollWidth} vs ${layout.clientWidth}`
      );
      check(layout.bubbleClearsGrid, 'the bubble slot overlaps the tile grid');
      summary.scenarios.narrowPhone = layout;
      await context.close();
    }

    process.stdout.write(JSON.stringify(summary, null, 2) + '\n');
  } catch (error) {
    summary.ok = false;
    summary.failure = String(error && error.message ? error.message : error);
    process.stdout.write(JSON.stringify(summary, null, 2) + '\n');
    await browser.close();
    process.exit(1);
  }

  await browser.close();
}

main().catch((error) => {
  process.stderr.write(String(error && error.stack ? error.stack : error) + '\n');
  process.exit(1);
});
