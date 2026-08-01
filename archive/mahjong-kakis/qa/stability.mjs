#!/usr/bin/env node
/*
  Mahjong Kakis stability QA. Every class here is a defect an adversarial sweep
  actually found, written so the same defect cannot come back quietly:

    (a) the table moving under a resting finger
    (b) a greeting frozen to one line per kaki forever
    (c) every new player on earth meeting the same sentence
    (d) a kaki's own title colliding with the name the player picked
    (e) the game dying when the content bank does not arrive
    (f) the player bar eating the name it exists to show
    (g) an empty box quietly becoming a permanent name
*/

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { registerBank, aiGenerate } from '../../../shared/ai.js';

const URL = process.env.MK_URL || 'http://localhost:4182/archive/mahjong-kakis';
const KEY = 'ctrlai:mahjong-kakis';
const BUBBLE_TIMEOUT = 5000;
const DEAL_SETTLE_MS = 800;

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BANK_PATH = path.join(HERE, '..', 'content', 'kaki-banter.json');

const KAKIS = ['lily', 'beng', 'rose'];
// A twenty character name is the longest the input takes and the only way to
// push the longest lines in the bank onto a fourth line at 360.
const LONG_NAME = 'Wilhelmina Kesavaran';
/*
  The spread this profile gets is name dependent: shared/ai.js picks uniformly
  from five templates and a kaki only greets on four of twelve visits, so some
  names collide down to two. This one is a real name chip and reaches three or
  more per kaki, which is what a working picker looks like. A frozen picker
  collapses every kaki to one and fails loudly here.
*/
const VARIETY_NAME = 'Ah Ma';
const VARIETY_MIN = 3;
const BAR_NAMES = ['Ah Ma', 'Ah Gong', 'Auntie', 'Uncle', 'Margaret'];
const FRESH_NAMES = ['Ah Ma', 'Ah Gong', 'Auntie', 'Uncle', 'Margaret', 'Siew Ling'];
const DOUBLE_NAMES = ['Auntie', 'Uncle', 'Ah Ma'];
const DOUBLED = [/Auntie Auntie/, /Uncle Uncle/, /Ah Ah/];
const TEACH_MARKERS = ['two same tiles', 'tap both', 'that match', 'look alike', 'its twin', 'find two'];
const BEST_PHRASES = [
  'how you cleared it first try',
  'how fast you found the pairs',
  'how you stayed until the end',
];
const ROUNDS_PHRASES = ['one round', 'a few rounds', 'many rounds'];

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
      roundsPlayed: 4,
      totalMatches: 30,
      bestClear: 0,
      recent: [
        { matches: 8, misses: 0 },
        { matches: 8, misses: 1 },
        { matches: 8, misses: 0 },
      ],
      dial: { tileCount: 16, lookalike: 1 },
      dialAt: 4,
    },
    overrides || {}
  );
}

async function open(browser, seed, viewport, block) {
  const context = await browser.newContext({
    viewport: viewport || { width: 360, height: 844 },
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
  if (block) {
    await page.route(block, (route) => route.abort());
  }
  // A blocked request never lets the network go idle, so the load event is the
  // only signal that works for both the healthy and the broken case.
  await page.goto(URL, { waitUntil: 'load', timeout: 20000 });
  return { context, page, errors };
}

// Where the first tile sits, to the hundredth of a pixel. The whole of class
// (a) is this number refusing to change.
const readLayout = () => {
  const tile = document.querySelector('[data-tile]').getBoundingClientRect();
  const slot = document.querySelector('[data-bubble-slot]').getBoundingClientRect();
  const text = document.querySelector('[data-bubble-text]');
  return {
    tileTop: Math.round(tile.top * 100) / 100,
    slotHeight: Math.round(slot.height * 100) / 100,
    lines: Math.round(text.scrollHeight / parseFloat(getComputedStyle(text).lineHeight)),
  };
};

/* ---- (a) the table never moves on its own ------------------------------- */

async function layoutShift(browser, summary) {
  const samples = [];
  for (const width of [360, 390]) {
    // Find a visit whose greeting really does wrap to four lines. If the bank
    // ever stops producing one, this fails instead of testing nothing.
    let tallest = null;
    for (let visits = 1; visits <= 12 && tallest === null; visits += 1) {
      const { context, page } = await open(
        browser,
        profile({ name: LONG_NAME, visits }),
        { width, height: 844 }
      );
      await page.waitForSelector('[data-tile]', { timeout: 5000 });
      await page.waitForSelector('[data-bubble][data-event]', { timeout: BUBBLE_TIMEOUT });
      const shape = await page.evaluate(readLayout);
      if (shape.lines >= 4) {
        tallest = visits;
      }
      await context.close();
    }
    check(tallest !== null, `${width}px: no greeting in the bank wraps to four lines`);

    const { context, page, errors } = await open(
      browser,
      profile({ name: LONG_NAME, visits: tallest }),
      { width, height: 844 }
    );
    await page.waitForSelector('[data-tile]', { timeout: 5000 });
    await page.waitForSelector('[data-bubble][data-event]', { timeout: BUBBLE_TIMEOUT });
    // Tiles land with a staggered transform, and a transform counts in
    // getBoundingClientRect, so let the deal finish before taking the baseline.
    // 240ms of animation plus a stagger of up to 16 tiles at 90ms/4 each.
    await page.waitForTimeout(DEAL_SETTLE_MS);
    const atLoad = await page.evaluate(readLayout);

    // Six seconds is past every timer this game used to run.
    await page.waitForTimeout(6000);
    const after6s = await page.evaluate(readLayout);

    await page.locator('[data-bubble]').tap();
    await page.waitForTimeout(400);
    const afterTap = await page.evaluate(readLayout);
    const faded = await page.evaluate(() => {
      const bubble = document.querySelector('[data-bubble]');
      return {
        dismissed: !('event' in bubble.dataset),
        opacity: Number(getComputedStyle(bubble).opacity),
        keptItsWords: (document.querySelector('[data-bubble-text]').textContent || '').trim().length > 0,
      };
    });

    check(atLoad.lines >= 4, `${width}px: greeting rendered ${atLoad.lines} lines, wanted 4`);
    check(
      after6s.tileTop === atLoad.tileTop,
      `${width}px: the table moved ${after6s.tileTop - atLoad.tileTop}px six seconds after landing`
    );
    check(
      afterTap.tileTop === atLoad.tileTop,
      `${width}px: the table moved ${afterTap.tileTop - atLoad.tileTop}px when the bubble was put away`
    );
    check(
      afterTap.slotHeight === atLoad.slotHeight,
      `${width}px: the bubble slot changed height on dismiss`
    );
    check(faded.dismissed, `${width}px: tapping the bubble did not put it away`);
    check(faded.opacity === 0, `${width}px: the dismissed bubble is still at opacity ${faded.opacity}`);
    check(faded.keptItsWords, `${width}px: dismissal emptied the bubble, which is what collapsed the slot`);
    check(errors.length === 0, `${width}px: page errors: ${errors.join(' | ')}`);

    samples.push({
      width,
      visits: tallest,
      lines: atLoad.lines,
      slotHeight: atLoad.slotHeight,
      tileTop: [atLoad.tileTop, after6s.tileTop, afterTap.tileTop],
      driftAfter6s: Math.round((after6s.tileTop - atLoad.tileTop) * 100) / 100,
      driftAfterTap: Math.round((afterTap.tileTop - atLoad.tileTop) * 100) / 100,
    });
    await context.close();
  }
  summary.scenarios.layoutShift = samples;
}

/* ---- (b) the memory callback is not one frozen line --------------------- */

async function greetingVariety(browser, summary) {
  const spread = { lily: new Set(), beng: new Set(), rose: new Set() };
  const observed = [];

  // Stored visits 1 through 12, which the boot bumps to visits 2 through 13.
  for (let visits = 1; visits <= 12; visits += 1) {
    const { context, page, errors } = await open(browser, profile({ name: VARIETY_NAME, visits }));
    await page.waitForSelector('[data-bubble][data-event="return_visit"]', { timeout: BUBBLE_TIMEOUT });
    const line = await page.$eval('[data-bubble]', (el) => ({
      kaki: el.dataset.kaki || '',
      text: (el.querySelector('[data-bubble-text]').textContent || '').trim(),
    }));
    check(line.text.includes(VARIETY_NAME), `visit ${visits + 1}: name missing from "${line.text}"`);
    check(!/\{|\}/.test(line.text), `visit ${visits + 1}: unfilled slot in "${line.text}"`);
    check(errors.length === 0, `visit ${visits + 1}: page errors: ${errors.join(' | ')}`);
    spread[line.kaki].add(line.text);
    observed.push({ visits: visits + 1, kaki: line.kaki, text: line.text });
    await context.close();
  }

  for (const kaki of KAKIS) {
    check(
      spread[kaki].size >= VARIETY_MIN,
      `${kaki} said ${spread[kaki].size} distinct greetings over twelve visits, wanted ${VARIETY_MIN}`
    );
  }

  summary.scenarios.greetingVariety = {
    name: VARIETY_NAME,
    loads: observed.length,
    distinct: { lily: spread.lily.size, beng: spread.beng.size, rose: spread.rose.size },
    observed,
  };
}

/* ---- (c) a first hello welcomes, teaches, and is not always the same ---- */

async function firstVisit(browser, summary) {
  const texts = [];
  for (const name of FRESH_NAMES) {
    const { context, page, errors } = await open(browser, null, { width: 390, height: 844 });
    await page.waitForSelector('[data-screen="name"]:not([hidden])', { timeout: 5000 });
    await page.fill('#mk-name-input', name);
    await page.locator('[data-action="confirm-name"]').tap();
    await page.waitForSelector('[data-bubble][data-event]', { timeout: BUBBLE_TIMEOUT });
    const bubble = await page.$eval('[data-bubble]', (el) => ({
      event: el.dataset.event || '',
      kaki: el.dataset.kaki || '',
      text: (el.querySelector('[data-bubble-text]').textContent || '').trim(),
    }));
    check(bubble.event === 'first_visit', `${name} was met with ${bubble.event}, expected first_visit`);
    check(bubble.text.includes(name), `${name}: the greeting does not say the name: "${bubble.text}"`);
    check(!/\{|\}/.test(bubble.text), `${name}: unfilled slot in "${bubble.text}"`);
    // Nothing may claim a past with somebody who has never played.
    check(
      !/\b(again|back|last time|remember|forget|already|like always)\b/i.test(bubble.text),
      `${name}: the first hello claims a shared history: "${bubble.text}"`
    );
    check(errors.length === 0, `${name}: page errors: ${errors.join(' | ')}`);
    texts.push({ name, kaki: bubble.kaki, text: bubble.text });
    await context.close();
  }

  const distinct = new Set(texts.map((t) => t.text));
  check(distinct.size >= 2, `six fresh players all heard the same line: "${texts[0].text}"`);
  const taught = texts.filter((t) => TEACH_MARKERS.some((m) => t.text.toLowerCase().includes(m)));
  check(taught.length >= 1, 'no fresh player was told how to play');

  summary.scenarios.firstVisit = { distinct: distinct.size, taught: taught.length, texts };
}

/* ---- (d) no kaki ever doubles the name the player picked ---------------- */

async function doubledTokens(summary) {
  const bank = JSON.parse(await readFile(BANK_PATH, 'utf8'));
  registerBank('mk-lint', bank);
  const hits = [];
  let rendered = 0;

  for (const key of Object.keys(bank)) {
    for (const name of DOUBLE_NAMES) {
      for (const best of BEST_PHRASES.concat([null])) {
        for (const rounds of ROUNDS_PHRASES.concat([null])) {
          // One template at a time, so every line in the bank is rendered
          // rather than whichever one the picker happens to choose.
          for (const template of bank[key]) {
            registerBank('mk-lint-one', { line: [template] });
            const context = { name };
            if (best !== null) context.best = best;
            if (rounds !== null) context.rounds = rounds;
            const out = await aiGenerate({ game: 'mk-lint-one', event: 'line', context });
            rendered += 1;
            if (DOUBLED.some((pattern) => pattern.test(out.text))) {
              hits.push({ key, name, text: out.text });
            }
            // A slot that goes missing must not leave a hole in the punctuation
            // either: no floating comma, no comma running into a full stop.
            check(!/\s[,.!?]|,\s*\.|\(\)/.test(out.text), `${key} renders broken punctuation: "${out.text}"`);
            check(!/\{|\}/.test(out.text), `${key} leaked a slot marker: "${out.text}"`);
          }
        }
      }
    }
  }

  check(hits.length === 0, `${hits.length} lines double a name token, first: ${JSON.stringify(hits[0] || null)}`);
  summary.scenarios.doubledTokens = { rendered, names: DOUBLE_NAMES, hits: hits.length };
}

/* ---- (e) the game boots without its content bank ------------------------ */

async function bankMissing(browser, summary) {
  const { context, page, errors } = await open(
    browser,
    profile({ name: 'Ah Ma', dial: { tileCount: 8, lookalike: 0.25 } }),
    { width: 390, height: 844 },
    '**/content/kaki-banter.json'
  );
  await page.waitForSelector('[data-tile]', { timeout: 5000 });
  await page.waitForSelector('[data-bubble][data-event]', { timeout: BUBBLE_TIMEOUT });
  const state = await page.evaluate(() => ({
    tiles: document.querySelectorAll('[data-tile]').length,
    text: (document.querySelector('[data-bubble-text]').textContent || '').trim(),
    speaker: (document.querySelector('[data-bubble-name]').textContent || '').trim(),
    progress: (document.querySelector('[data-progress]').textContent || '').trim(),
  }));
  check(state.tiles >= 8, `the blocked bank left ${state.tiles} tiles on the table`);
  check(state.text.length > 0, 'the bubble is empty with the bank blocked');
  check(state.speaker.length > 0, 'nobody is speaking with the bank blocked');

  // The round still plays: clear one real pair and watch the count move.
  const ids = await page.$$eval('[data-tile]', (els) => els.map((el, i) => ({ i, id: el.dataset.tile })));
  const groups = new Map();
  let pair = null;
  for (const tile of ids) {
    const group = groups.get(tile.id) || [];
    group.push(tile.i);
    groups.set(tile.id, group);
    if (group.length === 2) {
      pair = group;
      break;
    }
  }
  check(pair !== null, 'no matching pair on the table');
  const tiles = page.locator('[data-tile]');
  await tiles.nth(pair[0]).tap();
  await tiles.nth(pair[1]).tap();
  await page.waitForFunction(
    (want) => document.querySelectorAll('[data-tile][data-state="cleared"]').length === want,
    2,
    { timeout: 5000 }
  );
  const after = await page.evaluate(() =>
    (document.querySelector('[data-progress]').textContent || '').trim()
  );
  check(after !== state.progress, `progress did not move: still "${after}"`);
  check(errors.length === 0, `page errors with the bank blocked: ${errors.join(' | ')}`);

  summary.scenarios.bankMissing = { tiles: state.tiles, line: state.text, before: state.progress, after };
  await context.close();
}

/* ---- (f) the player bar shows the whole name ---------------------------- */

async function playerBar(browser, summary) {
  const measured = [];
  for (const width of [360, 390]) {
    for (const name of BAR_NAMES) {
      const { context, page, errors } = await open(
        browser,
        profile({ name }),
        { width, height: 844 }
      );
      await page.waitForSelector('[data-tile]', { timeout: 5000 });
      const bar = await page.evaluate(() => {
        const el = document.querySelector('[data-player-name]');
        const range = document.createRange();
        range.selectNodeContents(el);
        const doc = document.documentElement;
        return {
          text: (el.textContent || '').trim(),
          textWidth: Math.round(range.getBoundingClientRect().width),
          boxWidth: Math.round(el.getBoundingClientRect().width),
          scrollWidth: el.scrollWidth,
          clientWidth: el.clientWidth,
          pairs: document.querySelectorAll('[data-tile]').length / 2,
          progress: (document.querySelector('[data-progress]').textContent || '').trim(),
          hScroll: doc.scrollWidth > doc.clientWidth,
        };
      });
      check(bar.pairs === 8, `${width}px: wanted an 8 pair wall, dealt ${bar.pairs}`);
      check(
        bar.scrollWidth <= bar.clientWidth,
        `${width}px: "${name}" is ellipsised, ${bar.scrollWidth} of ${bar.clientWidth}px`
      );
      check(bar.text === name, `${width}px: the bar says "${bar.text}" for ${name}`);
      check(bar.progress.includes('pairs'), `${width}px: the pair count went missing: "${bar.progress}"`);
      check(!bar.hScroll, `${width}px: the bar pushed the page sideways`);
      check(errors.length === 0, `${width}px ${name}: page errors: ${errors.join(' | ')}`);
      measured.push({ width, ...bar });
      await context.close();
    }
  }
  summary.scenarios.playerBar = measured;
}

/* ---- (g) an empty box never becomes a name ------------------------------ */

async function emptyConfirm(browser, summary) {
  const { context, page, errors } = await open(browser, null, { width: 390, height: 844 });
  await page.waitForSelector('[data-screen="name"]:not([hidden])', { timeout: 5000 });

  const tries = [];
  for (const value of ['', '   ']) {
    await page.fill('#mk-name-input', value);
    await page.locator('[data-action="confirm-name"]').tap();
    await page.waitForTimeout(300);
    const after = await page.evaluate((key) => ({
      nameScreen: !document.querySelector('[data-screen="name"]').hidden,
      play: !document.querySelector('[data-screen="play"]').hidden,
      tiles: document.querySelectorAll('[data-tile]').length,
      stored: localStorage.getItem(key),
      focused: document.activeElement === document.querySelector('#mk-name-input'),
    }), KEY);
    check(after.nameScreen, `confirming ${JSON.stringify(value)} left the name screen`);
    check(!after.play, `confirming ${JSON.stringify(value)} started a round`);
    check(after.tiles === 0, `confirming ${JSON.stringify(value)} dealt ${after.tiles} tiles`);
    check(after.stored === null, `confirming ${JSON.stringify(value)} stored ${after.stored}`);
    tries.push({ value, ...after });
  }

  // And a real name still works from the same screen.
  await page.fill('#mk-name-input', 'Margaret');
  await page.locator('[data-action="confirm-name"]').tap();
  await page.waitForSelector('[data-tile]', { timeout: 5000 });
  const stored = JSON.parse(await page.evaluate((key) => localStorage.getItem(key), KEY));
  check(stored.name === 'Margaret', `stored name is ${JSON.stringify(stored.name)}`);
  check(errors.length === 0, `page errors: ${errors.join(' | ')}`);

  summary.scenarios.emptyConfirm = { tries, recovered: stored.name };
  await context.close();
}

/* ---- rename keeps the profile ------------------------------------------- */

async function rename(browser, summary) {
  const { context, page, errors } = await open(
    browser,
    profile({ name: 'Ah Ma', dial: { tileCount: 8, lookalike: 0.25 } }),
    { width: 390, height: 844 }
  );
  await page.waitForSelector('[data-tile]', { timeout: 5000 });

  // clear the table so the celebration card, and the control on it, show up
  for (let guard = 0; guard < 20; guard += 1) {
    const left = await page.$$eval('[data-tile]', (els) =>
      els.map((el, i) => ({ i, id: el.dataset.tile, state: el.dataset.state })).filter((t) => t.state !== 'cleared')
    );
    if (left.length === 0) break;
    const groups = new Map();
    let pair = null;
    for (const tile of left) {
      const group = groups.get(tile.id) || [];
      group.push(tile.i);
      groups.set(tile.id, group);
      if (group.length === 2) {
        pair = group;
        break;
      }
    }
    check(pair !== null, 'no matching pair left');
    const tiles = page.locator('[data-tile]');
    await tiles.nth(pair[0]).tap();
    await tiles.nth(pair[1]).tap();
    // CLEAR_MS in game.js is 240ms, so the pair is off the table by now.
    await page.waitForTimeout(360);
  }
  await page.waitForSelector('[data-screen="win"]:not([hidden])', { timeout: 5000 });

  const control = await page.$eval('[data-action="rename"]', (el) => {
    const r = el.getBoundingClientRect();
    return { w: Math.round(r.width), h: Math.round(r.height), label: (el.textContent || '').trim() };
  });
  check(control.h >= 60 && control.w >= 60, `the rename control is ${control.w}x${control.h}`);

  const before = JSON.parse(await page.evaluate((key) => localStorage.getItem(key), KEY));
  await page.locator('[data-action="rename"]').tap();
  await page.waitForSelector('[data-screen="name"]:not([hidden])', { timeout: 5000 });
  await page.fill('#mk-name-input', 'Margaret');
  await page.locator('[data-action="confirm-name"]').tap();
  await page.waitForSelector('[data-tile]', { timeout: 5000 });
  const after = JSON.parse(await page.evaluate((key) => localStorage.getItem(key), KEY));

  check(after.name === 'Margaret', `the rename stored ${JSON.stringify(after.name)}`);
  for (const field of ['visits', 'roundsPlayed', 'totalMatches', 'bestClear']) {
    check(
      after[field] === before[field],
      `renaming changed ${field}: ${before[field]} became ${after[field]}`
    );
  }
  const shown = await page.$eval('[data-player-name]', (el) => (el.textContent || '').trim());
  check(shown === 'Margaret', `the bar still says ${JSON.stringify(shown)}`);
  check(errors.length === 0, `page errors: ${errors.join(' | ')}`);

  summary.scenarios.rename = { control, before, after };
  await context.close();
}

async function main() {
  const summary = { ok: true, scenarios: {} };
  const browser = await chromium.launch();

  try {
    await doubledTokens(summary);
    await layoutShift(browser, summary);
    await greetingVariety(browser, summary);
    await firstVisit(browser, summary);
    await bankMissing(browser, summary);
    await playerBar(browser, summary);
    await emptyConfirm(browser, summary);
    await rename(browser, summary);
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
