#!/usr/bin/env node
/*
  Memory Garden definition of done. Spawns its own server, drives the whole loop
  twice on a phone viewport, then checks persistence, replay, a true return visit,
  and composer determinism. Exits nonzero if anything is off.
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

const results = [];
const consoleErrors = [];
const pageErrors = [];
const failedRequests = [];
const headingsSeen = { who: [], where: [], feeling: [] };
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

async function tap(page, selector) {
  taps += 1;
  await page.locator(selector).click();
}

async function answer(page, optionId) {
  await tap(page, '#prompt-chips [data-option-id="' + optionId + '"]');
  await tap(page, '#prompt-next');
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

async function growMemory(page, objectId, who, where, feeling, freeText) {
  await tap(page, '#start-grow');
  await page.locator('#view-picker').waitFor({ state: 'visible' });
  await tap(page, '[data-object-id="' + objectId + '"]');
  await page.locator('#view-prompt').waitFor({ state: 'visible' });
  await readHeading(page, 'who');
  await answer(page, who);
  await readHeading(page, 'where');
  await answer(page, where);
  await readHeading(page, 'feeling');
  if (typeof freeText === 'string' && freeText !== '') {
    await page.locator('#freetext').fill(freeText);
  }
  await answer(page, feeling);
  await page.locator('#view-ceremony').waitFor({ state: 'visible' });
  await page.waitForFunction(function () {
    const line = document.getElementById('ceremony-line');
    return line !== null && line.textContent.trim().length > 0;
  });
  const ceremonyLine = await page.evaluate(function () {
    return document.getElementById('ceremony-line').textContent.trim();
  });
  await tap(page, '#ceremony-done');
  await page.locator('#view-garden').waitFor({ state: 'visible' });
  return ceremonyLine;
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

async function run(browser) {
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

  /* ---- The picker offers every object ----------------------------------- */
  await page.locator('#start-grow').click();
  await page.locator('#view-picker').waitFor({ state: 'visible' });
  const cards = await page.locator('#objects .object-card').count();
  check('the picker shows 8 object cards', cards === 8, 'cards ' + cards);
  await page.locator('[data-back="garden"]').click();
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
  await page.locator('#start-grow').click();
  await page.locator('#view-picker').waitFor({ state: 'visible' });
  await page.locator('[data-back="garden"]').click();
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
    const fields = ['species', 'palette', 'bloom', 'ornament'];
    const differing = fields.filter(function (field) { return a[field] !== b[field]; });
    check('the two plants differ in at least 3 of 4 traits',
      differing.length >= 3,
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
  await page.locator('[data-plant-id]').first().click();
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

  taps += 1;
  await page.locator('#replay-close').click();
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

  taps += 1;
  await page.locator('[data-plant-id="' + written.id + '"]').click();
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
  await page.locator('#replay-close').click();
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
    returning.welcome.indexOf('2') !== -1, returning.welcome);

  /* ---- 360px width sweep ------------------------------------------------ */
  await returnPage.setViewportSize({ width: 360, height: 844 });
  const gardenFits = await noHorizontalScroll(returnPage);
  await returnPage.locator('#start-grow').click();
  await returnPage.locator('#view-picker').waitFor({ state: 'visible' });
  const pickerFits = await noHorizontalScroll(returnPage);
  await returnPage.locator('[data-object-id="five-stones"]').click();
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

  await returnPage.locator('#prompt-chips [data-option-id="my-father"]').click();
  await returnPage.locator('#prompt-next').click();
  await returnPage.locator('#prompt-chips [data-option-id="seaside"]').click();
  await returnPage.locator('#prompt-next').click();
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
  await calmPage.click('#start-grow');
  await calmPage.click('[data-object-id="rotary-phone"]');
  await calmPage.click('[data-option-id="my-father"]');
  await calmPage.click('#prompt-next');
  await calmPage.click('[data-option-id="seaside"]');
  await calmPage.click('#prompt-next');
  await calmPage.click('[data-option-id="happy"]');
  await calmPage.click('#prompt-next');
  await calmPage.locator('#view-ceremony').waitFor({ state: 'visible' });
  const layerOpacity = await calmPage.evaluate(function () {
    return Array.from(document.querySelectorAll('#ceremony-stage .plant > g')).map(function (layer) {
      return Number(window.getComputedStyle(layer).opacity);
    });
  });
  check('reduced motion shows every plant layer at once',
    layerOpacity.length === 5 && layerOpacity.every(function (value) { return value === 1; }),
    'layer opacities ' + JSON.stringify(layerOpacity));

  await calmPage.click('#ceremony-done');
  await calmPage.locator('#view-garden').waitFor({ state: 'visible' });
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

  await contextA.close();
  await contextB.close();
  await calmContext.close();
  await brokenContext.close();
  await mixedContext.close();
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
