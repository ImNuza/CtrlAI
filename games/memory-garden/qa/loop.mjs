#!/usr/bin/env node
/*
  Memory Garden definition of done. Spawns its own server, drives the whole loop
  twice on a phone viewport, then checks persistence, replay, a true return visit,
  and composer determinism. Exits nonzero if anything is off.

  It also holds the regression suite for the fix round: the double tap skips, the
  two below the fold buttons, count grammar at one plant, unbroken text overrun,
  the poisoned record, double grow, the ornament clip, the not yet button, per
  load freshness, and a blocked content bank.
*/

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../..');
const PORT = 4191;
const ORIGIN = 'http://localhost:' + PORT;
const GAME_URL = ORIGIN + '/memory-garden';
const STORAGE_KEY = 'ctrlai:memory-garden';
const BANK_PATH = path.join(here, '..', 'content', 'garden-lines.json');
const VIEWPORT = { width: 390, height: 844 };
const GRANDCHILD_LINE = 'Ah Gong told me this one twice, both times he laughed at the same part.';
const UNBROKEN_120 = 'A'.repeat(60) + 'B'.repeat(60);

/* The game swallows a tap that lands inside a section which only just appeared,
   because that is almost always the second half of a double tap meant for the
   screen before. A script clicks far faster than any hand, so every scripted
   click waits the guard out first. Waiting costs the script time, not the player
   taps, so the 9 tap assertion is untouched by it. */
const GUARD_WAIT = 400;
const STALE_GAP = 100;

const results = [];
const consoleErrors = [];
const pageErrors = [];
const failedRequests = [];
const headingsSeen = { who: [], where: [], feeling: [] };
const retriedTaps = [];
let bank = {};
let taps = 0;
let loopTaps = 0;

function check(name, pass, detail) {
  results.push({ name: name, pass: Boolean(pass), detail: detail === undefined ? '' : String(detail) });
}

function watch(page) {
  page.on('console', function (message) {
    if (message.type() === 'error') {
      consoleErrors.push(message.text());
    }
  });
  page.on('pageerror', function (error) {
    pageErrors.push(error.message);
  });
  page.on('requestfailed', function (request) {
    const failure = request.failure();
    failedRequests.push(request.url() + ' :: ' + (failure ? failure.errorText : 'failed'));
  });
  page.on('response', function (response) {
    if (response.status() >= 400) {
      failedRequests.push(response.url() + ' :: HTTP ' + response.status());
    }
  });
  return page;
}

function sleep(ms) {
  return new Promise(function (resolve) { setTimeout(resolve, ms); });
}

async function waitForServer(timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(ORIGIN + '/');
      if (response.status === 200) {
        return true;
      }
    } catch (err) {
      // not up yet
    }
    await sleep(150);
  }
  return false;
}

async function pressLocator(locator) {
  await sleep(GUARD_WAIT);
  await locator.click();
}

/* Pass what a tap is meant to bring about and the tap is checked, not assumed.
   A selector waits for that thing to appear, the same selector behind a "!"
   waits for it to go away. The game is now allowed to swallow a tap that lands
   too soon after a screen change, so if the screen did not arrive the script
   taps again exactly the way a person would. Every retry is counted and
   reported, so a guard that starts eating real taps shows up as a number rather
   than as a suite that silently papers over it. */
async function press(target, selector, expect) {
  await pressLocator(target.locator(selector));
  if (typeof expect !== 'string') {
    return;
  }
  const wantGone = expect.charAt(0) === '!';
  const wanted = wantGone ? expect.slice(1) : expect;
  const state = wantGone ? 'hidden' : 'visible';
  try {
    await target.locator(wanted).waitFor({ state: state, timeout: 2500 });
  } catch (err) {
    retriedTaps.push(selector + ' did not make ' + wanted + ' ' + state);
    await pressLocator(target.locator(selector));
    await target.locator(wanted).waitFor({ state: state });
  }
}

/* Playwright treats aria-disabled as not actionable and refuses to click it,
   which is exactly the control this suite has to tap. A real mouse click with
   the actionability check skipped is what a finger does anyway. */
async function pressAnyway(target, selector) {
  await sleep(GUARD_WAIT);
  await target.locator(selector).click({ force: true });
}

async function tap(page, selector, expectVisible) {
  taps += 1;
  await press(page, selector, expectVisible);
}

async function answer(page, optionId, expectVisible) {
  await tap(page, '#prompt-chips [data-option-id="' + optionId + '"]', '#prompt-next[aria-disabled="false"]');
  await tap(page, '#prompt-next', expectVisible);
}

// The heading is written from the bank a tick after the view opens, so wait for a
// line the bank actually holds, then record whatever is on screen either way.
async function readHeading(page, promptId) {
  const variations = bank['prompt_' + promptId] || [];
  try {
    await page.waitForFunction(function (list) {
      const node = document.getElementById('prompt-heading');
      return node !== null && list.indexOf(node.textContent.trim()) !== -1;
    }, variations, { timeout: 4000 });
  } catch (err) {
    // The membership check below is what reports this, so do not crash the run.
  }
  const text = await page.evaluate(function () {
    return document.getElementById('prompt-heading').textContent.trim();
  });
  headingsSeen[promptId].push(text);
  return text;
}

// The loop with no heading reading, for the sub tests that only need a plant.
async function growSimple(page, objectId, who, where, feeling, freeText) {
  await press(page, '#start-grow', '#view-picker');
  await page.locator('#view-picker').waitFor({ state: 'visible' });
  await press(page, '[data-object-id="' + objectId + '"]', '#view-prompt');
  await page.locator('#view-prompt').waitFor({ state: 'visible' });
  await press(page, '#prompt-chips [data-option-id="' + who + '"]', '#prompt-next[aria-disabled="false"]');
  await press(page, '#prompt-next');
  await press(page, '#prompt-chips [data-option-id="' + where + '"]', '#prompt-next[aria-disabled="false"]');
  await press(page, '#prompt-next');
  if (typeof freeText === 'string' && freeText !== '') {
    await page.locator('#freetext').fill(freeText);
  }
  await press(page, '#prompt-chips [data-option-id="' + feeling + '"]', '#prompt-next[aria-disabled="false"]');
  await press(page, '#prompt-next', '#view-ceremony');
  await page.waitForFunction(function () {
    const line = document.getElementById('ceremony-line');
    return line !== null && line.textContent.trim().length > 0;
  });
  await press(page, '#ceremony-done', '#view-garden');
}

async function growMemory(page, objectId, who, where, feeling, freeText) {
  await tap(page, '#start-grow', '#view-picker');
  await page.locator('#view-picker').waitFor({ state: 'visible' });
  await tap(page, '[data-object-id="' + objectId + '"]', '#view-prompt');
  await page.locator('#view-prompt').waitFor({ state: 'visible' });
  await readHeading(page, 'who');
  await answer(page, who);
  await readHeading(page, 'where');
  await answer(page, where);
  await readHeading(page, 'feeling');
  if (typeof freeText === 'string' && freeText !== '') {
    await page.locator('#freetext').fill(freeText);
  }
  await answer(page, feeling, '#view-ceremony');
  await page.waitForFunction(function () {
    const line = document.getElementById('ceremony-line');
    return line !== null && line.textContent.trim().length > 0;
  });
  const ceremonyLine = await page.evaluate(function () {
    return document.getElementById('ceremony-line').textContent.trim();
  });
  await tap(page, '#ceremony-done', '#view-garden');
  return ceremonyLine;
}

// Straight to the last question, answers picked on the way, nothing grown yet.
async function toStepThree(page, objectId, who, where) {
  await press(page, '#start-grow', '#view-picker');
  await page.locator('#view-picker').waitFor({ state: 'visible' });
  await press(page, '[data-object-id="' + objectId + '"]', '#view-prompt');
  await page.locator('#view-prompt').waitFor({ state: 'visible' });
  await press(page, '#prompt-chips [data-option-id="' + who + '"]', '#prompt-next[aria-disabled="false"]');
  await press(page, '#prompt-next');
  await press(page, '#prompt-chips [data-option-id="' + where + '"]', '#prompt-next[aria-disabled="false"]');
  await press(page, '#prompt-next');
  await page.locator('#freetext').waitFor({ state: 'visible' });
}

// What a finger would now be pressing at that point, named well enough to read.
function whatIsAt(page, point) {
  return page.evaluate(function (spot) {
    const node = document.elementFromPoint(spot.x, spot.y);
    if (node === null) {
      return 'nothing';
    }
    const card = node.closest === undefined ? null : node.closest('.object-card');
    if (card !== null) {
      return 'object card ' + card.dataset.objectId;
    }
    const button = node.closest === undefined ? null : node.closest('button');
    if (button !== null && button.id) {
      return '#' + button.id;
    }
    return node.id ? '#' + node.id : (node.getAttribute('class') || node.tagName);
  }, point);
}

function viewState(page) {
  return page.evaluate(function () {
    const shown = function (id) { return document.getElementById(id).hidden === false; };
    return {
      garden: shown('view-garden'),
      picker: shown('view-picker'),
      prompt: shown('view-prompt'),
      ceremony: shown('view-ceremony'),
      replay: shown('view-replay')
    };
  });
}

function readPlots(page) {
  return page.evaluate(function () {
    const plots = Array.from(document.querySelectorAll('[data-plant-id]'));
    return plots.map(function (plot) {
      const svg = plot.querySelector('svg');
      return {
        plantId: plot.dataset.plantId,
        species: svg.getAttribute('data-species'),
        palette: svg.getAttribute('data-palette'),
        bloom: svg.getAttribute('data-bloom'),
        ornament: svg.getAttribute('data-ornament'),
        seed: svg.getAttribute('data-seed'),
        markup: svg.outerHTML,
        length: svg.innerHTML.length
      };
    });
  });
}

function sharedPrefix(a, b) {
  const limit = Math.min(a.length, b.length);
  let i = 0;
  while (i < limit && a.charCodeAt(i) === b.charCodeAt(i)) {
    i += 1;
  }
  return i;
}

async function noHorizontalScroll(page) {
  return page.evaluate(function () {
    return document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1;
  });
}

async function freshPage(browser, options) {
  const settings = Object.assign({ viewport: VIEWPORT, hasTouch: true }, options || {});
  const context = await browser.newContext(settings);
  const page = watch(await context.newPage());
  return { context: context, page: page };
}

async function run(browser) {
  const spare = [];

  /* ---- Session A: first ever visit, one memory ------------------------- */
  const contextA = await browser.newContext({ viewport: VIEWPORT, hasTouch: true });
  const page = watch(await contextA.newPage());
  await page.goto(GAME_URL, { waitUntil: 'networkidle' });

  await page.waitForFunction(function () {
    const line = document.getElementById('welcome-line');
    return line !== null && line.textContent.trim().length > 0;
  });

  const firstVisit = await page.evaluate(function () {
    return {
      welcome: document.getElementById('welcome-line').textContent.trim(),
      cardVisible: document.getElementById('welcome-card').getBoundingClientRect().height > 0,
      planted: document.querySelectorAll('[data-plant-id]').length,
      empty: document.querySelectorAll('[data-empty]').length
    };
  });
  check('empty garden shows a welcome line', firstVisit.welcome.length > 0 && firstVisit.cardVisible, firstVisit.welcome);
  check('empty garden has no plants and six empty plots',
    firstVisit.planted === 0 && firstVisit.empty === 6,
    'planted ' + firstVisit.planted + ', empty ' + firstVisit.empty);

  /* ---- A second tap must not skip the picker ----------------------------
     Grow a new memory sits exactly where the object grid's third row lands, so
     before the guard a retry tap chose a heritage object the player never saw. */
  const growBox = await page.locator('#start-grow').boundingBox();
  // A quarter across, not dead centre: that is where the reported skip landed on
  // a card rather than in the gutter between the two columns.
  const growPoint = { x: growBox.x + growBox.width * 0.25, y: growBox.y + growBox.height / 2 };
  await sleep(GUARD_WAIT);
  await page.mouse.click(growPoint.x, growPoint.y);
  await sleep(STALE_GAP);
  const underPoint = await whatIsAt(page, growPoint);
  await page.mouse.click(growPoint.x, growPoint.y);
  await sleep(200);
  const afterDoubleGrow = await viewState(page);
  check('a second tap 100ms after Grow a new memory stays on the picker',
    afterDoubleGrow.picker && !afterDoubleGrow.prompt,
    'the point now holds "' + underPoint + '", views ' + JSON.stringify(afterDoubleGrow));

  // The guard must only eat the stale tap, never a real one.
  await sleep(450);
  await page.locator('[data-object-id="tingkat"]').click();
  await sleep(150);
  const afterHonestTap = await viewState(page);
  check('a normal object tap 450ms later still works',
    afterHonestTap.prompt && !afterHonestTap.picker, JSON.stringify(afterHonestTap));
  await press(page, '#prompt-back', '#view-picker');

  /* ---- The picker offers every object ----------------------------------- */
  const cards = await page.locator('#objects .object-card').count();
  check('the picker shows 8 object cards', cards === 8, 'cards ' + cards);
  await press(page, '[data-back="garden"]', '#view-garden');
  await page.locator('#view-garden').waitFor({ state: 'visible' });

  taps = 0;
  const firstCeremony = await growMemory(page, 'kopitiam-cup', 'my-mother', 'kopitiam', 'warm');
  const tapsForLoop = taps;
  loopTaps = tapsForLoop;

  const afterOne = await readPlots(page);
  check('one plant after the first loop', afterOne.length === 1, 'plots ' + afterOne.length);
  check('whole loop is 15 taps or fewer', tapsForLoop <= 15, tapsForLoop + ' taps');
  check('a chips only loop stays at 9 taps or fewer', tapsForLoop <= 9, tapsForLoop + ' taps');
  check('the ceremony line names the object in article form',
    firstCeremony.indexOf('the kopitiam cup') !== -1 && firstCeremony.indexOf('{') === -1,
    firstCeremony);
  if (afterOne.length === 1) {
    check('first plant carries a full trait signature',
      Boolean(afterOne[0].species && afterOne[0].palette && afterOne[0].bloom && afterOne[0].ornament && afterOne[0].seed),
      [afterOne[0].species, afterOne[0].palette, afterOne[0].bloom, afterOne[0].ornament, afterOne[0].seed].join('|'));
    check('first plant svg has real structure', afterOne[0].length > 400, 'svg inner length ' + afterOne[0].length);
  }

  /* ---- The new plant is pointed at once, then left alone ---------------- */
  const arrival = await page.evaluate(function () {
    const marked = Array.from(document.querySelectorAll('.plot-new'));
    const planted = document.querySelectorAll('[data-plant-id]');
    const style = marked.length === 1 ? window.getComputedStyle(marked[0]) : null;
    return {
      marked: marked.length,
      label: marked.length === 1 ? marked[0].getAttribute('aria-label') : '',
      // The name, not the live value: the ring fades on its own, so reading the
      // painted shadow would make this check a race against the clock.
      animation: style === null ? '' : style.animationName,
      onNewest: marked.length === 1 && marked[0] === planted[planted.length - 1]
    };
  });
  check('the plot just planted is highlighted on the way back to the garden',
    arrival.marked === 1 && arrival.onNewest &&
      arrival.animation.indexOf('plot-arrive') !== -1 && arrival.animation.indexOf('plot-ring') !== -1,
    'marked ' + arrival.marked + ', on newest ' + arrival.onNewest + ', animation ' + arrival.animation);
  check('the new plot says so in its aria-label',
    arrival.label.indexOf('just planted') !== -1, arrival.label);

  // Any later render drops it: no pulse that never ends, no stale ring.
  await press(page, '#start-grow', '#view-picker');
  await page.locator('#view-picker').waitFor({ state: 'visible' });
  await press(page, '[data-back="garden"]', '#view-garden');
  await page.locator('#view-garden').waitFor({ state: 'visible' });
  const settled = await page.evaluate(function () {
    const plot = document.querySelector('[data-plant-id]');
    return {
      marked: document.querySelectorAll('.plot-new').length,
      label: plot === null ? '' : plot.getAttribute('aria-label')
    };
  });
  check('the highlight is gone on the next render of the garden',
    settled.marked === 0 && settled.label.indexOf('just planted') === -1,
    'still marked ' + settled.marked + ', label "' + settled.label + '"');

  const storedAfterOne = await page.evaluate(function (key) {
    return window.localStorage.getItem(key);
  }, STORAGE_KEY);
  const parsedAfterOne = JSON.parse(storedAfterOne);
  const firstCaption = parsedAfterOne.plants[0].caption;
  check('caption stored at creation', typeof firstCaption === 'string' && firstCaption.length > 20, firstCaption);
  check('caption has no leftover slot braces', firstCaption.indexOf('{') === -1, firstCaption);
  check('the caption names the object in article form',
    firstCaption.indexOf('the kopitiam cup') !== -1, firstCaption);

  const fields = await page.evaluate(function () {
    const nodes = Array.from(document.querySelectorAll('input, textarea'));
    return {
      total: nodes.length,
      required: nodes.filter(function (node) {
        return node.required === true || node.getAttribute('aria-required') === 'true';
      }).length
    };
  });
  check('no typing needed anywhere in the loop',
    fields.required === 0 && parsedAfterOne.plants[0].freeText === '',
    fields.total + ' optional field, ' + fields.required + ' required, plant freeText "' +
      parsedAfterOne.plants[0].freeText + '"');

  /* ---- Session B: same context, a very different memory ---------------- */
  await growMemory(page, 'sewing-machine', 'my-friends', 'seaside', 'wistful');

  const afterTwo = await readPlots(page);
  check('two plants after the second loop', afterTwo.length === 2, 'plots ' + afterTwo.length);

  if (afterTwo.length === 2) {
    const a = afterTwo[0];
    const b = afterTwo[1];
    const traitFields = ['species', 'palette', 'bloom', 'ornament'];
    const differing = traitFields.filter(function (field) { return a[field] !== b[field]; });
    // Both scripted answer sets differ in every dimension, so 4 of 4 is the true
    // claim for this test and the one the README leans on.
    check('the two plants differ in all 4 traits',
      differing.length === 4,
      'differ in ' + differing.join(', ') + ' (' + differing.length + '/4)');

    const lengthDelta = Math.abs(a.markup.length - b.markup.length) / Math.max(a.markup.length, b.markup.length);
    const prefixShare = sharedPrefix(a.markup, b.markup) / Math.min(a.markup.length, b.markup.length);
    check('the two svg strings are substantially different',
      a.markup !== b.markup && (lengthDelta > 0.1 || prefixShare < 0.9),
      'length delta ' + lengthDelta.toFixed(3) + ', shared prefix share ' + prefixShare.toFixed(3));
  }

  /* ---- Persistence across a reload ------------------------------------- */
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('#view-garden').waitFor({ state: 'visible' });
  const afterReload = await readPlots(page);
  check('both plants survive a reload', afterReload.length === 2, 'plots ' + afterReload.length);

  const storedRaw = await page.evaluate(function (key) {
    return window.localStorage.getItem(key);
  }, STORAGE_KEY);
  let parsed = null;
  try {
    parsed = JSON.parse(storedRaw);
  } catch (err) {
    parsed = null;
  }
  check('localStorage key parses with two plants',
    parsed !== null && Array.isArray(parsed.plants) && parsed.plants.length === 2,
    STORAGE_KEY + ' plants ' + (parsed && parsed.plants ? parsed.plants.length : 'unreadable'));
  check('saved plants keep answers and seed',
    parsed !== null && parsed.plants.every(function (plant) {
      return plant.answers && plant.answers.who && plant.answers.where && plant.answers.feeling &&
        typeof plant.seed === 'number' && typeof plant.caption === 'string';
    }),
    'schema version ' + (parsed ? parsed.version : 'none'));

  /* ---- Replay ---------------------------------------------------------- */
  taps += 1;
  await press(page, '[data-plant-id] >> nth=0', '#view-replay');
  await page.locator('#view-replay').waitFor({ state: 'visible' });
  await page.waitForFunction(function () {
    const line = document.getElementById('replay-line');
    return line !== null && line.textContent.trim().length > 0;
  });
  const replay = await page.evaluate(function () {
    return {
      title: document.getElementById('replay-title').textContent.trim(),
      caption: document.getElementById('replay-caption').textContent.trim(),
      line: document.getElementById('replay-line').textContent.trim(),
      chips: document.querySelectorAll('#replay-answers .chip').length,
      hasPlant: document.querySelectorAll('#replay-plant svg').length === 1,
      toldShown: document.getElementById('replay-told').hidden === false,
      focused: document.activeElement ? document.activeElement.id : ''
    };
  });
  check('replay opens with the object name', replay.title === 'Kopitiam cup', replay.title);
  check('replay shows the stored caption', replay.caption === firstCaption, replay.caption);
  check('replay shows three answer chips and the plant', replay.chips === 3 && replay.hasPlant,
    'chips ' + replay.chips + ', plant ' + replay.hasPlant);
  check('replay adds a fresh narration line', replay.line.length > 0, replay.line);
  check('a plant with no grandchild line shows no quoted block',
    replay.toldShown === false, 'told block shown ' + replay.toldShown);
  check('focus moves into the replay dialog', replay.focused === 'replay-title', 'focused ' + replay.focused);

  /* ---- The story with no note keeps its generated line above the band ----
     The caption alone runs past a phone, so the overlay scrolls no matter what.
     What must never happen again is a generated line nobody can see and no sign
     that there is more underneath. */
  const shortStory = await page.evaluate(function () {
    const overlay = document.getElementById('view-replay');
    overlay.scrollTop = 0;
    const foot = document.querySelector('.overlay-foot').getBoundingClientRect();
    const box = function (id) {
      const rect = document.getElementById(id).getBoundingClientRect();
      return { top: Math.round(rect.top), bottom: Math.round(rect.bottom) };
    };
    return {
      footTop: Math.round(foot.top),
      line: box('replay-line'),
      plant: box('replay-plant'),
      chips: box('replay-answers'),
      hiddenBelow: overlay.scrollHeight - overlay.clientHeight,
      cueShown: document.getElementById('replay-more').hidden === false,
      footBorder: window.getComputedStyle(document.querySelector('.overlay-foot')).borderTopWidth,
      overscroll: window.getComputedStyle(overlay).overscrollBehaviorY
    };
  });
  check('with no note the generated line, plant and answers all sit above the sticky foot',
    shortStory.line.bottom <= shortStory.footTop && shortStory.plant.bottom <= shortStory.footTop &&
      shortStory.chips.bottom <= shortStory.footTop,
    'foot at ' + shortStory.footTop + ', line ' + JSON.stringify(shortStory.line) +
      ', plant bottom ' + shortStory.plant.bottom + ', chips bottom ' + shortStory.chips.bottom);
  check('the sticky foot reads as an edge and says when there is more below',
    shortStory.footBorder === '2px' && (shortStory.hiddenBelow <= 1 || shortStory.cueShown),
    'border ' + shortStory.footBorder + ', hidden below ' + shortStory.hiddenBelow +
      ', cue shown ' + shortStory.cueShown);
  check('the overlay does not chain its scroll into the garden behind it',
    shortStory.overscroll === 'contain', 'overscroll-behavior-y ' + shortStory.overscroll);

  const gardenScrollKept = await page.evaluate(async function () {
    const overlay = document.getElementById('view-replay');
    overlay.scrollTop = overlay.scrollHeight;
    await new Promise(function (resolve) { window.requestAnimationFrame(resolve); });
    return { cueAtBottom: document.getElementById('replay-more').hidden === false };
  });
  check('the more below cue goes away once the reader reaches the end',
    gardenScrollKept.cueAtBottom === false, 'cue still shown ' + gardenScrollKept.cueAtBottom);

  taps += 1;
  await press(page, '#replay-close', '!#view-replay');
  await page.locator('#view-replay').waitFor({ state: 'hidden' });
  check('replay closes back to the garden',
    await page.locator('#view-garden').isVisible(), 'garden visible');

  /* ---- Determinism ------------------------------------------------------ */
  const determinism = await page.evaluate(async function () {
    const module = await import('/games/memory-garden/js/composer.js');
    const memory = { objectId: 'tingkat', answers: { who: 'my-grandmother', where: 'market', feeling: 'calm' } };
    const first = module.composePlant(memory);
    const second = module.composePlant(memory);
    const otherFeeling = module.composePlant({
      objectId: 'tingkat',
      answers: { who: 'my-grandmother', where: 'market', feeling: 'proud' }
    });
    return {
      identical: first.svg === second.svg,
      sameSeed: first.seed === second.seed,
      palette: first.traits.palette,
      otherPalette: otherFeeling.traits.palette,
      changed: first.svg !== otherFeeling.svg
    };
  });
  check('same memory composes byte identical svg twice',
    determinism.identical && determinism.sameSeed,
    'identical ' + determinism.identical + ', same seed ' + determinism.sameSeed);
  check('a different feeling changes the palette attribute',
    determinism.palette !== determinism.otherPalette && determinism.changed,
    determinism.palette + ' vs ' + determinism.otherPalette);

  /* ---- Every ornament fits inside the box it is drawn in -----------------
     An outermost svg clips at its own viewport, and the ornaments reach a long
     way left of their anchor, so 31 of these 40 used to be sliced flat down one
     side. Mounted for real and measured against the declared viewBox. */
  const ornaments = await page.evaluate(async function () {
    const module = await import('/games/memory-garden/js/composer.js');
    const objects = ['kopitiam-cup', 'sewing-machine', 'rotary-phone', 'tingkat', 'cassette',
      'five-stones', 'setron-tv', 'rattan-chair'];
    const places = ['kampung', 'first-flat', 'kopitiam', 'market', 'seaside'];
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;left:0;top:0;width:400px;opacity:0;pointer-events:none';
    document.body.appendChild(host);

    const rows = [];
    for (let i = 0; i < objects.length; i += 1) {
      for (let k = 0; k < places.length; k += 1) {
        const built = module.composePlant({
          objectId: objects[i],
          answers: { who: 'my-mother', where: places[k], feeling: 'warm' }
        });
        host.innerHTML = built.svg;
        const svg = host.querySelector('svg');
        svg.style.width = '400px';
        const group = svg.querySelector('.layer-ornament');
        const view = svg.viewBox.baseVal;
        const svgRect = svg.getBoundingClientRect();
        const inkRect = group.getBoundingClientRect();
        // getBBox is the geometry box in the group's own space, the client rect
        // is the ink including every stroke. The ink is what actually gets cut.
        const geometry = group.getBBox();
        const scale = svgRect.width / view.width;
        rows.push({
          combo: objects[i] + ' + ' + places[k],
          left: (inkRect.left - svgRect.left) / scale + view.x,
          right: (inkRect.right - svgRect.left) / scale + view.x,
          geometryWidth: geometry.width,
          boxLeft: view.x,
          boxRight: view.x + view.width
        });
      }
    }
    host.remove();

    const outside = rows.filter(function (row) {
      return row.left < row.boxLeft - 0.01 || row.right > row.boxRight + 0.01 ||
        !(row.geometryWidth > 0);
    });
    let worst = rows[0];
    for (let i = 0; i < rows.length; i += 1) {
      if (rows[i].left < worst.left) {
        worst = rows[i];
      }
    }
    return {
      total: rows.length,
      outside: outside.length,
      worstCombo: worst.combo,
      worstLeft: Math.round(worst.left * 100) / 100,
      boxLeft: worst.boxLeft,
      boxRight: worst.boxRight
    };
  });
  check('every ornament on all 8 species by 5 places fits inside the plant viewBox',
    ornaments.outside === 0 && ornaments.total === 40,
    ornaments.total + ' combinations, ' + ornaments.outside + ' clipped, worst is ' +
      ornaments.worstCombo + ' reaching ' + ornaments.worstLeft + ' inside a box from ' +
      ornaments.boxLeft + ' to ' + ornaments.boxRight);

  /* ---- The bellflower actually hangs bells ------------------------------ */
  const bells = await page.evaluate(async function () {
    const module = await import('/games/memory-garden/js/composer.js');
    const read = function (who) {
      const built = module.composePlant({
        objectId: 'rotary-phone',
        answers: { who: who, where: 'kampung', feeling: 'warm' }
      });
      const doc = new DOMParser().parseFromString(built.svg, 'image/svg+xml');
      const groups = Array.from(doc.querySelectorAll('.layer-blooms .bloom'));
      return {
        who: who,
        blooms: groups.length,
        shapes: groups.map(function (group) { return group.children.length; }),
        pedicels: groups.filter(function (group) { return group.querySelector('.pedicel') !== null; }).length,
        bells: groups.filter(function (group) { return group.querySelector('.bell') !== null; }).length
      };
    };
    const round = function (who) {
      const built = module.composePlant({
        objectId: 'kopitiam-cup',
        answers: { who: who, where: 'kampung', feeling: 'warm' }
      });
      const doc = new DOMParser().parseFromString(built.svg, 'image/svg+xml');
      return doc.querySelectorAll('.layer-blooms .bell').length;
    };
    return { hung: [read('my-mother'), read('my-father'), read('my-grandmother')], vineBells: round('my-mother') };
  });
  const everyBloomHangs = bells.hung.every(function (entry) {
    return entry.blooms > 0 && entry.blooms === entry.pedicels && entry.blooms === entry.bells &&
      entry.shapes.every(function (count) { return count > 1; });
  });
  check('every bellflower bloom is a hanging bell, pedicel plus bell shape, not a dot',
    everyBloomHangs,
    bells.hung.map(function (entry) {
      return entry.who + ' ' + entry.blooms + ' blooms, shapes ' + entry.shapes.join('/') +
        ', pedicels ' + entry.pedicels;
    }).join(' | '));
  check('the bloom count still follows the who on the bellflower',
    bells.hung[0].blooms === 3 && bells.hung[1].blooms === 1 && bells.hung[2].blooms === 5,
    bells.hung.map(function (entry) { return entry.who + ':' + entry.blooms; }).join(' '));
  check('bells belong to the bellflower alone', bells.vineBells === 0,
    'bells found on the kopi vine: ' + bells.vineBells);

  /* ---- The two Milestone B objects, one of them with a written line ------ */
  const tvCeremony = await growMemory(page, 'setron-tv', 'my-siblings', 'first-flat', 'happy');
  check('the Setron TV ceremony line names it in article form',
    tvCeremony.indexOf('the old Setron TV') !== -1, tvCeremony);

  await growMemory(page, 'rattan-chair', 'my-grandmother', 'kampung', 'calm', GRANDCHILD_LINE);

  const afterFour = await readPlots(page);
  check('four plants after the two new objects', afterFour.length === 4, 'plots ' + afterFour.length);
  if (afterFour.length === 4) {
    const species = afterFour.map(function (plot) { return plot.species; });
    const unique = species.filter(function (value, index) { return species.indexOf(value) === index; });
    check('all four plants carry a different species silhouette',
      unique.length === 4, species.join(', '));
    check('the two new objects grow the two new species',
      species[2] === 'sunburst-bloom' && species[3] === 'woven-palm',
      species[2] + ' and ' + species[3]);
  }

  const storedFour = await page.evaluate(function (key) {
    return JSON.parse(window.localStorage.getItem(key));
  }, STORAGE_KEY);
  const written = storedFour.plants[3];
  check('a written line is stored as plant.freeText',
    written.freeText === GRANDCHILD_LINE, 'stored "' + written.freeText + '"');
  check('plants nobody wrote on keep an empty freeText',
    storedFour.plants.slice(0, 3).every(function (plant) { return plant.freeText === ''; }),
    'first three: ' + storedFour.plants.slice(0, 3).map(function (plant) {
      return JSON.stringify(plant.freeText);
    }).join(' '));
  const ids = storedFour.plants.map(function (plant) { return plant.id; });
  const uniqueIds = ids.filter(function (value, index) { return ids.indexOf(value) === index; });
  check('every stored plant id is unique', uniqueIds.length === ids.length, ids.join(' '));

  taps += 1;
  await press(page, '[data-plant-id="' + written.id + '"]', '#view-replay');
  await page.locator('#view-replay').waitFor({ state: 'visible' });
  const toldReplay = await page.evaluate(function () {
    return {
      shown: document.getElementById('replay-told').hidden === false,
      text: document.getElementById('replay-freetext').textContent.trim(),
      style: window.getComputedStyle(document.getElementById('replay-freetext')).fontStyle,
      fontPx: parseFloat(window.getComputedStyle(document.getElementById('replay-freetext')).fontSize)
    };
  });
  check('the grandchild line shows in that plant replay, set apart',
    toldReplay.shown && toldReplay.text === GRANDCHILD_LINE && toldReplay.style === 'italic',
    toldReplay.style + ', ' + toldReplay.fontPx + 'px, "' + toldReplay.text + '"');
  check('the grandchild line stays at body size or larger', toldReplay.fontPx >= 28,
    toldReplay.fontPx + 'px');
  taps += 1;
  await press(page, '#replay-close', '!#view-replay');
  await page.locator('#view-replay').waitFor({ state: 'hidden' });

  /* ---- Every prompt heading came out of the bank ------------------------- */
  const promptIds = ['who', 'where', 'feeling'];
  const strays = [];
  let variedEvents = 0;
  for (let i = 0; i < promptIds.length; i += 1) {
    const seen = headingsSeen[promptIds[i]];
    const variations = bank['prompt_' + promptIds[i]] || [];
    for (let k = 0; k < seen.length; k += 1) {
      if (variations.indexOf(seen[k]) === -1) {
        strays.push(promptIds[i] + ': ' + seen[k]);
      }
    }
    const distinct = seen.filter(function (value, index) { return seen.indexOf(value) === index; });
    if (distinct.length > 1) {
      variedEvents += 1;
    }
  }
  const headingCount = headingsSeen.who.length + headingsSeen.where.length + headingsSeen.feeling.length;
  check('every prompt heading is a line from the bank',
    strays.length === 0 && headingCount >= 12,
    headingCount + ' headings read, strays: ' + (strays.join(' | ') || 'none'));
  check('prompt headings rephrase themselves across plays',
    variedEvents === 3,
    variedEvents + ' of 3 events varied, who saw: ' + headingsSeen.who.join(' / '));

  /* ---- Return visit in a fresh context ---------------------------------- */
  const contextB = await browser.newContext({ viewport: VIEWPORT, hasTouch: true });
  await contextB.addInitScript(function (payload) {
    window.localStorage.setItem(payload.key, payload.value);
  }, { key: STORAGE_KEY, value: storedRaw });
  const returnPage = watch(await contextB.newPage());
  await returnPage.goto(GAME_URL, { waitUntil: 'networkidle' });
  await returnPage.waitForFunction(function () {
    const line = document.getElementById('welcome-line');
    return line !== null && line.textContent.trim().length > 0;
  });
  const returning = await returnPage.evaluate(function () {
    return {
      welcome: document.getElementById('welcome-line').textContent.trim(),
      planted: document.querySelectorAll('[data-plant-id]').length
    };
  });
  check('a return visit renders both saved plants', returning.planted === 2, 'plots ' + returning.planted);
  check('a return visit greets with a welcome back line',
    returning.welcome.length > 0, returning.welcome);
  check('the welcome back line mentions the count',
    returning.welcome.indexOf('2 memories') !== -1, returning.welcome);

  /* ---- 360px width sweep ------------------------------------------------ */
  await returnPage.setViewportSize({ width: 360, height: 844 });
  const gardenFits = await noHorizontalScroll(returnPage);
  await press(returnPage, '#start-grow', '#view-picker');
  await returnPage.locator('#view-picker').waitFor({ state: 'visible' });
  const pickerFits = await noHorizontalScroll(returnPage);
  await press(returnPage, '[data-object-id="five-stones"]', '#view-prompt');
  await returnPage.locator('#view-prompt').waitFor({ state: 'visible' });
  const promptFits = await noHorizontalScroll(returnPage);
  check('no horizontal scroll at 360px on garden, picker and prompts',
    gardenFits && pickerFits && promptFits,
    'garden ' + gardenFits + ', picker ' + pickerFits + ', prompt ' + promptFits);

  const hiddenOnStepOne = await returnPage.evaluate(function () {
    return document.getElementById('freetext-field').hidden;
  });
  check('the optional field stays away until the third step', hiddenOnStepOne === true,
    'hidden on step 1: ' + hiddenOnStepOne);

  const targets = await returnPage.evaluate(function () {
    const nodes = Array.from(document.querySelectorAll('button, a, .btn, .chip')).filter(function (node) {
      const box = node.getBoundingClientRect();
      return box.width > 0 && box.height > 0;
    });
    return nodes.filter(function (node) {
      const box = node.getBoundingClientRect();
      return box.width < 60 || box.height < 60;
    }).length;
  });
  check('every visible tap target clears 60px at 360px wide', targets === 0, targets + ' undersized');

  /* ---- The not yet button stays readable and answers the tap ------------- */
  const notYet = await returnPage.evaluate(function () {
    const button = document.getElementById('prompt-next');
    const style = window.getComputedStyle(button);
    const channel = function (value) {
      const v = value / 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    };
    const luminance = function (rgb) {
      const parts = rgb.match(/[\d.]+/g).map(Number);
      return 0.2126 * channel(parts[0]) + 0.7152 * channel(parts[1]) + 0.0722 * channel(parts[2]);
    };
    const a = luminance(style.color);
    const b = luminance(style.backgroundColor);
    const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    return {
      ariaDisabled: button.getAttribute('aria-disabled'),
      opacity: style.opacity,
      pointerEvents: style.pointerEvents,
      contrast: Math.round(ratio * 100) / 100,
      colour: style.color + ' on ' + style.backgroundColor
    };
  });
  const beforeNudge = await returnPage.evaluate(function () {
    return {
      heading: document.getElementById('prompt-heading').textContent.trim(),
      step: document.getElementById('prompt-step').textContent.trim()
    };
  });
  await pressAnyway(returnPage, '#prompt-next');
  const nudged = await returnPage.evaluate(function () {
    const nudge = document.getElementById('prompt-nudge');
    return {
      step: document.getElementById('prompt-step').textContent.trim(),
      prompt: document.getElementById('view-prompt').hidden === false,
      text: nudge.textContent.trim(),
      visible: nudge.getBoundingClientRect().height > 0,
      live: nudge.getAttribute('aria-live'),
      fontPx: parseFloat(window.getComputedStyle(nudge).fontSize)
    };
  });
  check('the not yet button keeps a fully readable label and stays tappable',
    notYet.ariaDisabled === 'true' && notYet.opacity === '1' &&
      notYet.pointerEvents === 'auto' && notYet.contrast >= 4.5,
    'aria-disabled ' + notYet.ariaDisabled + ', opacity ' + notYet.opacity + ', pointer-events ' +
      notYet.pointerEvents + ', ' + notYet.colour + ' at ' + notYet.contrast + ':1');
  check('tapping it before an answer nudges gently instead of doing nothing',
    nudged.prompt && nudged.step === beforeNudge.step && nudged.visible &&
      nudged.text.length > 0 && nudged.live === 'polite' && nudged.fontPx >= 28,
    'still on ' + nudged.step + ', nudge "' + nudged.text + '" at ' + nudged.fontPx + 'px');

  await press(returnPage, '#prompt-chips [data-option-id="my-father"]', '#prompt-next[aria-disabled="false"]');
  const nudgeGone = await returnPage.evaluate(function () {
    const nudge = document.getElementById('prompt-nudge');
    return { text: nudge.textContent.trim(), height: nudge.getBoundingClientRect().height };
  });
  check('the nudge clears the moment an answer is chosen',
    nudgeGone.text === '' && nudgeGone.height === 0,
    'nudge "' + nudgeGone.text + '", height ' + nudgeGone.height);

  await press(returnPage, '#prompt-next');
  await press(returnPage, '#prompt-chips [data-option-id="seaside"]', '#prompt-next[aria-disabled="false"]');
  await press(returnPage, '#prompt-next');
  await returnPage.locator('#freetext').waitFor({ state: 'visible' });
  const field = await returnPage.evaluate(function () {
    const input = document.getElementById('freetext');
    const label = document.querySelector('.freetext-label');
    const box = input.getBoundingClientRect();
    return {
      height: Math.round(box.height),
      fontPx: parseFloat(window.getComputedStyle(input).fontSize),
      labelText: label.textContent.trim(),
      labelFontPx: parseFloat(window.getComputedStyle(label).fontSize),
      labelFor: label.getAttribute('for'),
      maxLength: input.maxLength,
      required: input.required
    };
  });
  const fieldFits = await noHorizontalScroll(returnPage);
  check('the optional field is labelled, body size and 64px tall or more',
    field.height >= 64 && field.fontPx >= 28 && field.labelFontPx >= 28 &&
      field.labelFor === 'freetext' && field.labelText.length > 0 && field.required === false,
    field.labelText + ' :: ' + field.height + 'px tall, ' + field.fontPx + 'px text, maxlength ' +
      field.maxLength);
  check('no horizontal scroll at 360px with the field showing', fieldFits, 'fits ' + fieldFits);

  /* ---- Reduced motion collapses the ceremony to instant ----------------- */
  const calmContext = await browser.newContext({
    viewport: VIEWPORT,
    hasTouch: true,
    reducedMotion: 'reduce'
  });
  const calmPage = watch(await calmContext.newPage());
  await calmPage.goto(GAME_URL, { waitUntil: 'networkidle' });
  await press(calmPage, '#start-grow', '#view-picker');
  await press(calmPage, '[data-object-id="rotary-phone"]', '#view-prompt');
  await press(calmPage, '[data-option-id="my-father"]', '#prompt-next[aria-disabled="false"]');
  await press(calmPage, '#prompt-next');
  await press(calmPage, '[data-option-id="seaside"]', '#prompt-next[aria-disabled="false"]');
  await press(calmPage, '#prompt-next');
  await press(calmPage, '[data-option-id="happy"]', '#prompt-next[aria-disabled="false"]');
  await press(calmPage, '#prompt-next', '#view-ceremony');
  const layerOpacity = await calmPage.evaluate(function () {
    return Array.from(document.querySelectorAll('#ceremony-stage .plant > g')).map(function (layer) {
      return Number(window.getComputedStyle(layer).opacity);
    });
  });
  check('reduced motion shows every plant layer at once',
    layerOpacity.length === 5 && layerOpacity.every(function (value) { return value === 1; }),
    'layer opacities ' + JSON.stringify(layerOpacity));

  await press(calmPage, '#ceremony-done', '#view-garden');
  const calmArrival = await calmPage.evaluate(function () {
    const plot = document.querySelector('.plot-new');
    if (plot === null) {
      return { marked: 0, shadow: '', animation: '' };
    }
    const style = window.getComputedStyle(plot);
    return { marked: 1, shadow: style.boxShadow, animation: style.animationName };
  });
  check('reduced motion still marks the new plot, it just never moves',
    calmArrival.marked === 1 && calmArrival.animation === 'none' &&
      calmArrival.shadow !== 'none' && calmArrival.shadow !== '',
    'marked ' + calmArrival.marked + ', animation ' + calmArrival.animation +
      ', shadow ' + calmArrival.shadow);

  /* ---- Unreadable saved state falls back instead of breaking ------------ */
  const brokenContext = await browser.newContext({ viewport: VIEWPORT, hasTouch: true });
  await brokenContext.addInitScript(function (key) {
    window.localStorage.setItem(key, '{ not json at all');
  }, STORAGE_KEY);
  const brokenPage = watch(await brokenContext.newPage());
  await brokenPage.goto(GAME_URL, { waitUntil: 'networkidle' });
  await brokenPage.waitForFunction(function () {
    const line = document.getElementById('welcome-line');
    return line !== null && line.textContent.trim().length > 0;
  });
  const recovered = await brokenPage.evaluate(function () {
    return {
      planted: document.querySelectorAll('[data-plant-id]').length,
      empty: document.querySelectorAll('[data-empty]').length,
      welcome: document.getElementById('welcome-line').textContent.trim()
    };
  });
  check('unreadable saved state falls back to an empty garden',
    recovered.planted === 0 && recovered.empty === 6 && recovered.welcome.length > 0,
    'planted ' + recovered.planted + ', empty ' + recovered.empty);

  /* ---- A junk plant entry is dropped, good ones survive ----------------- */
  const mixedContext = await browser.newContext({ viewport: VIEWPORT, hasTouch: true });
  await mixedContext.addInitScript(function (key) {
    window.localStorage.setItem(key, JSON.stringify({
      version: 1,
      plants: [
        null,
        { nope: true },
        {
          id: 'kept-1',
          objectId: 'kopitiam-cup',
          answers: { who: 'my-mother', where: 'kampung', feeling: 'warm' },
          seed: 1,
          caption: 'kept'
        }
      ]
    }));
  }, STORAGE_KEY);
  const mixedPage = watch(await mixedContext.newPage());
  await mixedPage.goto(GAME_URL, { waitUntil: 'networkidle' });
  await mixedPage.locator('#view-garden').waitFor({ state: 'visible' });
  const kept = await mixedPage.evaluate(function () {
    return document.querySelectorAll('[data-plant-id]').length;
  });
  check('a broken plant entry is dropped and the good one still grows', kept === 1, 'plants rendered ' + kept);

  /* ======================================================================
     Fix round regressions. Each one gets its own context so nothing here can
     quietly change what an earlier check measured.
     ====================================================================== */

  /* ---- A second tap on Grow this memory must not skip the ceremony ------ */
  const skipRun = await freshPage(browser);
  spare.push(skipRun.context);
  await skipRun.page.goto(GAME_URL, { waitUntil: 'networkidle' });
  await toStepThree(skipRun.page, 'cassette', 'my-mother', 'kampung');
  await press(skipRun.page, '#prompt-chips [data-option-id="proud"]', '#prompt-next[aria-disabled="false"]');
  const nextBox = await skipRun.page.locator('#prompt-next').boundingBox();
  const nextPoint = { x: nextBox.x + nextBox.width / 2, y: nextBox.y + nextBox.height / 2 };
  check('the grow button is reachable without scrolling before the second tap test',
    nextBox.y >= 0 && nextBox.y + nextBox.height <= VIEWPORT.height,
    'button at ' + Math.round(nextBox.y) + ' to ' + Math.round(nextBox.y + nextBox.height) +
      ' in a ' + VIEWPORT.height + 'px viewport');
  await sleep(GUARD_WAIT);
  await skipRun.page.mouse.click(nextPoint.x, nextPoint.y);
  await sleep(STALE_GAP);
  const underNext = await whatIsAt(skipRun.page, nextPoint);
  await skipRun.page.mouse.click(nextPoint.x, nextPoint.y);
  await sleep(250);
  const afterDoubleGrow2 = await viewState(skipRun.page);
  check('a second tap 100ms after Grow this memory does not skip the ceremony',
    afterDoubleGrow2.ceremony && !afterDoubleGrow2.garden,
    'the point now holds "' + underNext + '", views ' + JSON.stringify(afterDoubleGrow2));
  await skipRun.page.waitForFunction(function () {
    const line = document.getElementById('ceremony-line');
    return line !== null && line.textContent.trim().length > 0;
  });
  await press(skipRun.page, '#ceremony-done', '#view-garden');
  const afterCeremony = await readPlots(skipRun.page);
  check('See the garden still works once the ceremony has played',
    afterCeremony.length === 1, 'plants ' + afterCeremony.length);

  /* ---- The last question keeps its primary button on screen -------------- */
  const foldWidths = [390, 360];
  const foldRows = [];
  for (let i = 0; i < foldWidths.length; i += 1) {
    const fold = await freshPage(browser, { viewport: { width: foldWidths[i], height: 844 } });
    spare.push(fold.context);
    await fold.page.goto(GAME_URL, { waitUntil: 'networkidle' });
    await toStepThree(fold.page, 'tingkat', 'my-mother', 'seaside');
    const before = await fold.page.evaluate(function () {
      window.scrollTo(0, 0);
      const rect = document.getElementById('prompt-next').getBoundingClientRect();
      return { top: Math.round(rect.top), bottom: Math.round(rect.bottom), vh: window.innerHeight };
    });
    await press(fold.page, '#prompt-chips [data-option-id="proud"]', '#prompt-next[aria-disabled="false"]');
    const after = await fold.page.evaluate(function () {
      window.scrollTo(0, 0);
      const rect = document.getElementById('prompt-next').getBoundingClientRect();
      return { top: Math.round(rect.top), bottom: Math.round(rect.bottom), vh: window.innerHeight };
    });
    foldRows.push({ width: foldWidths[i], before: before, after: after });
  }
  const foldOk = foldRows.every(function (row) {
    return row.before.top >= 0 && row.before.bottom <= row.before.vh &&
      row.after.top >= 0 && row.after.bottom <= row.after.vh;
  });
  check('on question 3 the primary button is fully on screen at scrollY 0, before and after a chip',
    foldOk,
    foldRows.map(function (row) {
      return row.width + 'px before ' + row.before.top + '-' + row.before.bottom +
        ', after ' + row.after.top + '-' + row.after.bottom;
    }).join(' | '));

  /* ---- 120 unbroken characters must not turn the story sideways ---------- */
  const overrunRun = await freshPage(browser);
  spare.push(overrunRun.context);
  await overrunRun.page.goto(GAME_URL, { waitUntil: 'networkidle' });
  await growSimple(overrunRun.page, 'rotary-phone', 'my-father', 'market', 'calm', UNBROKEN_120);
  await press(overrunRun.page, '[data-plant-id] >> nth=0', '#view-replay');
  await overrunRun.page.locator('#view-replay').waitFor({ state: 'visible' });
  await overrunRun.page.waitForFunction(function () {
    const line = document.getElementById('replay-line');
    return line !== null && line.textContent.trim().length > 0;
  });
  const overrun = await overrunRun.page.evaluate(function () {
    const nodes = Array.from(document.querySelectorAll('#view-replay, #view-replay *'));
    const worst = nodes.map(function (node) {
      return {
        what: node.id || (typeof node.className === 'string' ? node.className : node.tagName),
        over: node.scrollWidth - node.clientWidth
      };
    }).filter(function (row) { return row.over > 1; });
    return {
      worst: worst,
      told: document.getElementById('replay-freetext').textContent.trim().length,
      wrap: window.getComputedStyle(document.getElementById('replay-freetext')).overflowWrap,
      docOver: document.documentElement.scrollWidth - document.documentElement.clientWidth
    };
  });
  check('a 120 character run with no spaces never scrolls the story panel sideways',
    overrun.worst.length === 0 && overrun.docOver <= 1 && overrun.told === 120,
    overrun.told + ' characters, overflow-wrap ' + overrun.wrap + ', offenders ' +
      (overrun.worst.length === 0 ? 'none' : JSON.stringify(overrun.worst)));

  /* ---- The more below cue on a long story ------------------------------- */
  const longStory = await overrunRun.page.evaluate(async function () {
    const overlay = document.getElementById('view-replay');
    overlay.scrollTop = 0;
    await new Promise(function (resolve) { window.requestAnimationFrame(resolve); });
    const cue = document.getElementById('replay-more');
    const atTop = {
      shown: cue.hidden === false,
      height: cue.getBoundingClientRect().height,
      fontPx: parseFloat(window.getComputedStyle(cue).fontSize),
      chevrons: cue.querySelectorAll('svg').length,
      overflow: overlay.scrollHeight - overlay.clientHeight
    };
    overlay.scrollTop = overlay.scrollHeight;
    await new Promise(function (resolve) { window.requestAnimationFrame(resolve); });
    return { atTop: atTop, shownAtBottom: cue.hidden === false };
  });
  check('a long story shows a real more below cue at the top and drops it at the end',
    longStory.atTop.shown && longStory.atTop.height > 0 && longStory.atTop.fontPx >= 28 &&
      longStory.atTop.chevrons === 1 && longStory.shownAtBottom === false,
    'overflow ' + longStory.atTop.overflow + 'px, cue ' + Math.round(longStory.atTop.height) +
      'px tall at ' + longStory.atTop.fontPx + 'px, gone at the bottom ' +
      (longStory.shownAtBottom === false));
  await press(overrunRun.page, '#replay-close', '!#view-replay');

  /* ---- One plant is one memory, not "all 1 of them" --------------------- */
  const onePlantRaw = await overrunRun.page.evaluate(function (key) {
    return window.localStorage.getItem(key);
  }, STORAGE_KEY);
  const oneRun = await freshPage(browser);
  spare.push(oneRun.context);
  await oneRun.context.addInitScript(function (payload) {
    window.localStorage.setItem(payload.key, payload.value);
  }, { key: STORAGE_KEY, value: onePlantRaw });
  await oneRun.page.goto(GAME_URL, { waitUntil: 'networkidle' });
  await oneRun.page.waitForFunction(function () {
    const line = document.getElementById('welcome-line');
    return line !== null && line.textContent.trim().length > 0;
  });
  const oneWelcome = await oneRun.page.evaluate(function () {
    return {
      line: document.getElementById('welcome-line').textContent.trim(),
      planted: document.querySelectorAll('[data-plant-id]').length
    };
  });
  check('the welcome line reads as English at exactly one plant',
    oneWelcome.planted === 1 && oneWelcome.line.indexOf('one memory') !== -1 &&
      !/\b1 (memories|plants|stories)\b/.test(oneWelcome.line) &&
      oneWelcome.line.indexOf('all 1 of') === -1,
    oneWelcome.planted + ' plant :: ' + oneWelcome.line);

  /* ---- A note typed for one object must not follow to another ----------- */
  const carryRun = await freshPage(browser);
  spare.push(carryRun.context);
  await carryRun.page.goto(GAME_URL, { waitUntil: 'networkidle' });
  await toStepThree(carryRun.page, 'kopitiam-cup', 'my-mother', 'kopitiam');
  await carryRun.page.locator('#freetext').fill('Note written for the KOPITIAM CUP memory');
  await press(carryRun.page, '#prompt-back');
  await press(carryRun.page, '#prompt-back');
  await press(carryRun.page, '#prompt-back', '#view-picker');
  await press(carryRun.page, '[data-object-id="setron-tv"]', '#view-prompt');
  await press(carryRun.page, '#prompt-chips [data-option-id="my-siblings"]', '#prompt-next[aria-disabled="false"]');
  await press(carryRun.page, '#prompt-next');
  await press(carryRun.page, '#prompt-chips [data-option-id="first-flat"]', '#prompt-next[aria-disabled="false"]');
  await press(carryRun.page, '#prompt-next');
  await carryRun.page.locator('#freetext').waitFor({ state: 'visible' });
  const carriedOver = await carryRun.page.evaluate(function () {
    return document.getElementById('freetext').value;
  });
  await press(carryRun.page, '#prompt-chips [data-option-id="happy"]', '#prompt-next[aria-disabled="false"]');
  await press(carryRun.page, '#prompt-next', '#view-ceremony');
  await carryRun.page.waitForFunction(function () {
    const line = document.getElementById('ceremony-line');
    return line !== null && line.textContent.trim().length > 0;
  });
  const carriedStored = await carryRun.page.evaluate(function (key) {
    return JSON.parse(window.localStorage.getItem(key)).plants[0];
  }, STORAGE_KEY);
  check('a note typed for one object is cleared when a different object is chosen',
    carriedOver === '' && carriedStored.objectId === 'setron-tv' && carriedStored.freeText === '',
    'field held "' + carriedOver + '", stored on ' + carriedStored.objectId + ' as "' +
      carriedStored.freeText + '"');

  /* ---- A poisoned record in storage must never reach the page ----------- */
  const dialogs = [];
  const xssRun = await freshPage(browser);
  spare.push(xssRun.context);
  xssRun.page.on('dialog', function (dialog) {
    dialogs.push(dialog.message());
    dialog.dismiss();
  });
  await xssRun.context.addInitScript(function (key) {
    window.localStorage.setItem(key, JSON.stringify({
      version: 1,
      plants: [
        {
          id: '"><img src=x onerror=alert(9)>',
          objectId: 'kopitiam-cup',
          answers: { who: 'my-mother', where: 'kampung', feeling: 'warm' },
          seed: 1,
          caption: 'poisoned'
        },
        {
          id: 'good-1',
          objectId: 'tingkat',
          answers: { who: 'my-father', where: 'seaside', feeling: 'calm' },
          seed: 2,
          caption: 'good'
        }
      ]
    }));
  }, STORAGE_KEY);
  await xssRun.page.goto(GAME_URL, { waitUntil: 'networkidle' });
  await xssRun.page.locator('#view-garden').waitFor({ state: 'visible' });
  await sleep(300);
  const poisoned = await xssRun.page.evaluate(function () {
    const planted = Array.from(document.querySelectorAll('[data-plant-id]'));
    return {
      planted: planted.length,
      ids: planted.map(function (plot) { return plot.dataset.plantId; }),
      images: document.querySelectorAll('img').length,
      markupHasScript: document.body.innerHTML.indexOf('onerror') !== -1
    };
  });
  check('a poisoned plant id is dropped, no script runs and the good plant still grows',
    dialogs.length === 0 && poisoned.images === 0 && poisoned.planted === 1 &&
      poisoned.ids[0] === 'good-1' && poisoned.markupHasScript === false,
    'dialogs ' + dialogs.length + ', img nodes ' + poisoned.images + ', plants ' +
      JSON.stringify(poisoned.ids));

  /* ---- Three activations of the grow button grow one plant --------------- */
  const reentryRun = await freshPage(browser);
  spare.push(reentryRun.context);
  await reentryRun.page.goto(GAME_URL, { waitUntil: 'networkidle' });
  await toStepThree(reentryRun.page, 'five-stones', 'my-grandmother', 'market');
  await press(reentryRun.page, '#prompt-chips [data-option-id="warm"]', '#prompt-next[aria-disabled="false"]');
  await reentryRun.page.evaluate(function () {
    const button = document.getElementById('prompt-next');
    button.click();
    button.click();
    button.click();
  });
  await reentryRun.page.locator('#view-ceremony').waitFor({ state: 'visible' });
  await reentryRun.page.waitForFunction(function () {
    const line = document.getElementById('ceremony-line');
    return line !== null && line.textContent.trim().length > 0;
  });
  await press(reentryRun.page, '#ceremony-done', '#view-garden');
  // The same memory again, so two identical answer sets have to earn two ids.
  await growSimple(reentryRun.page, 'five-stones', 'my-grandmother', 'market', 'warm');
  const reentry = await reentryRun.page.evaluate(function (key) {
    const plants = JSON.parse(window.localStorage.getItem(key)).plants;
    const ids = plants.map(function (plant) { return plant.id; });
    const unique = ids.filter(function (value, index) { return ids.indexOf(value) === index; });
    return { count: plants.length, ids: ids, unique: unique.length };
  }, STORAGE_KEY);
  check('three activations of the grow button store one plant, and identical memories get different ids',
    reentry.count === 2 && reentry.unique === 2,
    reentry.count + ' plants, ' + reentry.unique + ' unique ids :: ' + reentry.ids.join(' '));

  /* ---- The generated lines are not the same on every fresh load ---------- */
  const welcomes = [];
  for (let i = 0; i < 5; i += 1) {
    const loadRun = await freshPage(browser);
    await loadRun.page.goto(GAME_URL, { waitUntil: 'networkidle' });
    await loadRun.page.waitForFunction(function () {
      const line = document.getElementById('welcome-line');
      return line !== null && line.textContent.trim().length > 0;
    });
    welcomes.push(await loadRun.page.evaluate(function () {
      return document.getElementById('welcome-line').textContent.trim();
    }));
    await loadRun.context.close();
  }
  const distinctWelcomes = welcomes.filter(function (value, index) {
    return welcomes.indexOf(value) === index;
  });
  check('five fresh loads do not all greet with the same line',
    distinctWelcomes.length >= 2,
    distinctWelcomes.length + ' distinct across 5 loads :: ' +
      distinctWelcomes.map(function (line) { return line.slice(0, 34); }).join(' | '));

  /* ---- A blocked content bank must not brick the game -------------------- */
  const offlineContext = await browser.newContext({ viewport: VIEWPORT, hasTouch: true });
  const offlinePage = await offlineContext.newPage();
  spare.push(offlineContext);
  const offlineErrors = [];
  const offlineNoise = [];
  const offlineFailed = [];
  offlinePage.on('pageerror', function (error) { offlineErrors.push(error.message); });
  offlinePage.on('console', function (message) {
    // Chromium logs its own console line for the request this test deliberately
    // blocks. Anything else on the console is a real fault and is counted.
    if (message.type() !== 'error') {
      return;
    }
    if (message.text().indexOf('garden-lines.json') !== -1 ||
      message.text().indexOf('ERR_FAILED') !== -1) {
      offlineNoise.push(message.text());
      return;
    }
    offlineErrors.push('console: ' + message.text());
  });
  offlinePage.on('requestfailed', function (request) { offlineFailed.push(request.url()); });
  offlinePage.on('response', function (response) {
    if (response.status() >= 400) {
      offlineFailed.push(response.url() + ' :: HTTP ' + response.status());
    }
  });
  await offlinePage.route('**/garden-lines.json', function (route) { route.abort(); });
  await offlinePage.goto(GAME_URL, { waitUntil: 'networkidle' });
  await offlinePage.waitForFunction(function () {
    const line = document.getElementById('welcome-line');
    return line !== null && line.textContent.trim().length > 0;
  });
  const offlineWelcome = await offlinePage.evaluate(function () {
    return document.getElementById('welcome-line').textContent.trim();
  });
  await growSimple(offlinePage, 'rattan-chair', 'my-grandmother', 'kampung', 'calm');
  const offlineState = await offlinePage.evaluate(function (key) {
    const stored = JSON.parse(window.localStorage.getItem(key));
    return {
      planted: document.querySelectorAll('[data-plant-id]').length,
      caption: stored.plants[0].caption,
      welcome: document.getElementById('welcome-line').textContent.trim()
    };
  }, STORAGE_KEY);
  const onlyBankFailed = offlineFailed.length === 1 &&
    offlineFailed[0].indexOf('garden-lines.json') !== -1;
  check('a blocked content bank still leaves a playable garden on neutral lines',
    offlineWelcome.length > 0 && offlineState.planted === 1 &&
      offlineState.caption.length > 0 && offlineErrors.length === 0 && onlyBankFailed,
    'welcome "' + offlineWelcome + '", plants ' + offlineState.planted + ', unexpected errors ' +
      (offlineErrors.length === 0 ? 'none' : JSON.stringify(offlineErrors)) +
      ', failed requests ' + JSON.stringify(offlineFailed) +
      ', expected console noise ' + offlineNoise.length);

  await contextA.close();
  await contextB.close();
  await calmContext.close();
  await brokenContext.close();
  await mixedContext.close();
  for (let i = 0; i < spare.length; i += 1) {
    await spare[i].close();
  }
}

async function main() {
  bank = JSON.parse(await readFile(BANK_PATH, 'utf8'));

  const server = spawn(process.execPath, ['server.js'], {
    cwd: repoRoot,
    env: Object.assign({}, process.env, { PORT: String(PORT) }),
    stdio: 'ignore'
  });
  let stopped = false;
  const stopServer = function () {
    if (!stopped) {
      stopped = true;
      try {
        server.kill('SIGTERM');
      } catch (err) {
        // already gone
      }
    }
  };
  process.on('exit', stopServer);

  let browser = null;
  let crash = null;
  try {
    const up = await waitForServer(10000);
    if (!up) {
      throw new Error('dev server did not answer on ' + ORIGIN + ' within 10s');
    }
    browser = await chromium.launch();
    await run(browser);
  } catch (error) {
    crash = error;
  } finally {
    if (browser !== null) {
      await browser.close();
    }
    stopServer();
  }

  // A tap the guard swallows is not a bug on its own, a suite full of them is.
  check('scripted taps land first time, the stale tap guard is not eating real ones',
    retriedTaps.length <= 2,
    retriedTaps.length === 0 ? 'no retries in the whole run' :
      retriedTaps.length + ' retries :: ' + retriedTaps.join(' | '));
  check('zero console errors', consoleErrors.length === 0, consoleErrors.slice(0, 5).join(' | '));
  check('zero page errors', pageErrors.length === 0, pageErrors.slice(0, 5).join(' | '));
  check('zero failed requests', failedRequests.length === 0, failedRequests.slice(0, 5).join(' | '));
  if (crash !== null) {
    check('script ran to completion', false, String(crash && crash.message ? crash.message : crash));
  }

  let failures = 0;
  process.stdout.write('\nMemory Garden loop QA\n');
  process.stdout.write('---------------------\n');
  for (let i = 0; i < results.length; i += 1) {
    const result = results[i];
    if (!result.pass) {
      failures += 1;
    }
    process.stdout.write((result.pass ? 'PASS  ' : 'FAIL  ') + result.name +
      (result.detail ? '  ::  ' + result.detail : '') + '\n');
  }
  process.stdout.write('---------------------\n');
  process.stdout.write((failures === 0 ? 'ALL PASS' : 'FAILURES: ' + failures) +
    '  (' + results.length + ' checks, one full grow loop took ' + loopTaps + ' taps)\n');

  if (crash !== null && failures === 0) {
    process.stdout.write(String(crash.stack || crash) + '\n');
  }
  process.exit(failures === 0 ? 0 : 1);
}

main();
