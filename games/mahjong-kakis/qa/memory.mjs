#!/usr/bin/env node
// Mahjong Kakis memory QA. Lints the banter bank in plain node, then seeds a
// stored profile and checks that the kakis greet a returning player with what
// they remember: the name, and a history fact that is never a count of misses.

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const URL = process.env.MK_URL || 'http://localhost:4182/mahjong-kakis';
const BUBBLE_TIMEOUT = 3000;
const KEY = 'ctrlai:mahjong-kakis';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BANK_PATH = path.join(HERE, '..', 'content', 'kaki-banter.json');

const KAKIS = ['lily', 'beng', 'rose'];
const MINIMUMS = {
  round_start: 5,
  match_found: 6,
  near_miss: 6,
  round_win: 5,
  idle_nudge: 4,
  return_visit: 5,
};
const HISTORY_SLOTS = ['rounds', 'best'];
const ALLOWED_SLOTS = ['name', 'rounds', 'best'];
const SLOT_PATTERN = /\{([a-zA-Z0-9_]+)\}/g;
// U+2014 em dash and U+2013 en dash, written as code points so this file stays
// basic latin itself.
const DASHES = /[\u2013\u2014]/;

// The phrases game.js builds for the seeded profile below (roundsPlayed 3,
// bestClear 0). One of the two has to survive into whichever line is picked.
const EXPECTED_ROUNDS = 'a few rounds';
const BEST_MARKERS = ['first try', 'found every pair', 'to the last pair'];

function check(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function profile(overrides) {
  return Object.assign(
    {
      name: 'Mabel',
      visits: 2,
      roundsPlayed: 3,
      totalMatches: 14,
      bestClear: 0,
      recent: [
        { matches: 4, misses: 1 },
        { matches: 6, misses: 2 },
        { matches: 4, misses: 0 },
      ],
      dial: { tileCount: 12, lookalike: 0.5 },
    },
    overrides || {}
  );
}

/* ---- (d) bank shape lint, no browser ------------------------------------ */

async function lintBank() {
  const bank = JSON.parse(await readFile(BANK_PATH, 'utf8'));
  const events = Object.keys(MINIMUMS);
  const counts = {};

  for (const event of events) {
    for (const kaki of KAKIS) {
      const key = event + '__' + kaki;
      const lines = bank[key];
      check(Array.isArray(lines), `bank is missing the key ${key}`);
      check(
        lines.length >= MINIMUMS[event],
        `${key} has ${lines.length} lines, wants at least ${MINIMUMS[event]}`
      );
      counts[key] = lines.length;
    }
  }
  check(
    Object.keys(bank).length === events.length * KAKIS.length,
    `bank has ${Object.keys(bank).length} keys, expected ${events.length * KAKIS.length}`
  );

  for (const [key, lines] of Object.entries(bank)) {
    for (const line of lines) {
      check(typeof line === 'string' && line.trim() !== '', `${key} holds an empty line`);
      check(!DASHES.test(line), `${key} has an em or en dash: "${line}"`);
      // Printable ASCII only rejects every emoji range, both dashes and smart
      // quotes in one pass, which is exactly the bank's writing rule.
      check(/^[\x20-\x7E]*$/.test(line), `${key} has a non basic latin character: "${line}"`);

      const slots = [...line.matchAll(SLOT_PATTERN)].map((m) => m[1]);
      for (const slot of slots) {
        check(ALLOWED_SLOTS.includes(slot), `${key} uses the slot {${slot}}: "${line}"`);
        if (HISTORY_SLOTS.includes(slot)) {
          check(
            key.startsWith('return_visit__'),
            `${key} uses the history slot {${slot}} outside return_visit: "${line}"`
          );
        }
      }
      // Two slots with nothing but punctuation between them collapse into ",."
      // once both are empty, so the templates keep real words between them.
      check(
        !/\{[a-zA-Z0-9_]+\}[^a-zA-Z0-9]*\{[a-zA-Z0-9_]+\}/.test(line),
        `${key} puts two slots back to back: "${line}"`
      );
    }
  }

  for (const kaki of KAKIS) {
    for (const line of bank['return_visit__' + kaki]) {
      check(line.includes('{name}'), `return_visit__${kaki} line has no {name}: "${line}"`);
      check(
        line.includes('{rounds}') || line.includes('{best}'),
        `return_visit__${kaki} line carries no history: "${line}"`
      );
    }
  }

  return counts;
}

/* ---- browser helpers ---------------------------------------------------- */

async function openSeeded(browser, seed) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
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

async function readBubble(page, event) {
  await page.waitForSelector(`[data-bubble][data-event="${event}"]`, { timeout: BUBBLE_TIMEOUT });
  return page.$eval('[data-bubble]', (el) => {
    const text = el.querySelector('[data-bubble-text]');
    return {
      event: el.dataset.event || '',
      kaki: el.dataset.kaki || '',
      text: (text?.textContent || '').trim(),
      // The bubble clamps at three lines. A memory callback that gets cut off
      // is a broken beat, so the rendered text has to fit the box it lives in.
      clipped: text ? text.scrollHeight > text.clientHeight + 1 : false,
    };
  });
}

async function main() {
  const summary = { ok: true, bank: null, scenarios: {} };
  const browser = await chromium.launch();

  try {
    summary.bank = await lintBank();

    // (a) a returning player is greeted by what the kakis remember.
    {
      const { context, page, errors } = await openSeeded(browser, profile());
      check(
        !(await page.locator('[data-screen="name"]').isVisible()),
        'the name screen showed for a player the kakis already know'
      );
      await page.waitForSelector('[data-tile]', { timeout: 5000 });
      const tiles = await page.locator('[data-tile]').count();
      check(tiles >= 8 && tiles % 2 === 0, `dealt ${tiles} tiles`);

      const bubble = await readBubble(page, 'return_visit');
      check(bubble.text.includes('Mabel'), `return_visit line missing the name: "${bubble.text}"`);
      const saysRounds = bubble.text.includes(EXPECTED_ROUNDS);
      const saysBest = BEST_MARKERS.some((marker) => bubble.text.includes(marker));
      check(
        saysRounds || saysBest,
        `return_visit line carries no history fact: "${bubble.text}"`
      );
      check(!/\{|\}/.test(bubble.text), `return_visit line has an unfilled slot: "${bubble.text}"`);
      check(!bubble.clipped, `return_visit line is clipped by the bubble: "${bubble.text}"`);
      check(!/\bmiss|wrong|mistake|error/i.test(bubble.text), `return_visit line names a failure: "${bubble.text}"`);

      const stored = JSON.parse(await page.evaluate((k) => localStorage.getItem(k), KEY));
      check(stored.visits === 3, `stored visits is ${stored.visits}, expected 3`);
      check(errors.length === 0, `page errors: ${errors.join(' | ')}`);

      summary.scenarios.returning = {
        kaki: bubble.kaki,
        text: bubble.text,
        saysRounds,
        saysBest,
        tiles,
        visits: stored.visits,
      };
      await context.close();
    }

    // (b) named but never finished a round: nothing to remember yet.
    {
      const { context, page, errors } = await openSeeded(
        browser,
        profile({ roundsPlayed: 0, totalMatches: 0, bestClear: null, recent: [], visits: 1 })
      );
      await page.waitForSelector('[data-tile]', { timeout: 5000 });
      const bubble = await readBubble(page, 'round_start');
      check(bubble.event === 'round_start', `first bubble was ${bubble.event}, expected round_start`);
      check(bubble.text.includes('Mabel'), `round_start line missing the name: "${bubble.text}"`);
      const everReturn = await page.locator('[data-bubble][data-event="return_visit"]').count();
      check(everReturn === 0, 'a player with no finished round saw a return_visit line');
      check(errors.length === 0, `page errors: ${errors.join(' | ')}`);

      summary.scenarios.namedButNew = { event: bubble.event, kaki: bubble.kaki, text: bubble.text };
      await context.close();
    }

    // (c) a stranger still gets asked for a name.
    {
      const { context, page, errors } = await openSeeded(browser, null);
      await page.waitForSelector('[data-screen="name"]:not([hidden])', { timeout: 5000 });
      check(await page.locator('[data-screen="name"]').isVisible(), 'name screen not visible');
      check((await page.locator('[data-tile]').count()) === 0, 'tiles dealt before a name was given');
      check(errors.length === 0, `page errors: ${errors.join(' | ')}`);

      summary.scenarios.fresh = { nameScreen: true };
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
