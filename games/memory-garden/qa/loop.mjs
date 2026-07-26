#!/usr/bin/env node
/*
  Memory Garden definition of done. Spawns its own server, drives the whole loop
  twice on a phone viewport, then checks persistence, replay, a true return visit,
  and composer determinism. Exits nonzero if anything is off.
*/

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../..');
const PORT = 4191;
const ORIGIN = 'http://localhost:' + PORT;
const GAME_URL = ORIGIN + '/memory-garden';
const STORAGE_KEY = 'ctrlai:memory-garden';
const VIEWPORT = { width: 390, height: 844 };

const results = [];
const consoleErrors = [];
const pageErrors = [];
const failedRequests = [];
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

async function growMemory(page, objectId, who, where, feeling) {
  await tap(page, '#start-grow');
  await page.locator('#view-picker').waitFor({ state: 'visible' });
  await tap(page, '[data-object-id="' + objectId + '"]');
  await page.locator('#view-prompt').waitFor({ state: 'visible' });
  await answer(page, who);
  await answer(page, where);
  await answer(page, feeling);
  await page.locator('#view-ceremony').waitFor({ state: 'visible' });
  await page.waitForFunction(function () {
    const line = document.getElementById('ceremony-line');
    return line !== null && line.textContent.trim().length > 0;
  });
  await tap(page, '#ceremony-done');
  await page.locator('#view-garden').waitFor({ state: 'visible' });
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

  taps = 0;
  await growMemory(page, 'kopitiam-cup', 'my-mother', 'kopitiam', 'warm');
  const tapsForLoop = taps;
  loopTaps = tapsForLoop;

  const afterOne = await readPlots(page);
  check('one plant after the first loop', afterOne.length === 1, 'plots ' + afterOne.length);
  check('whole loop is 15 taps or fewer', tapsForLoop <= 15, tapsForLoop + ' taps');
  check('no typing needed anywhere in the loop',
    (await page.locator('input, textarea').count()) === 0,
    'text inputs on the page: ' + (await page.locator('input, textarea').count()));
  if (afterOne.length === 1) {
    check('first plant carries a full trait signature',
      Boolean(afterOne[0].species && afterOne[0].palette && afterOne[0].bloom && afterOne[0].ornament && afterOne[0].seed),
      [afterOne[0].species, afterOne[0].palette, afterOne[0].bloom, afterOne[0].ornament, afterOne[0].seed].join('|'));
    check('first plant svg has real structure', afterOne[0].length > 400, 'svg inner length ' + afterOne[0].length);
  }

  const storedAfterOne = await page.evaluate(function (key) {
    return window.localStorage.getItem(key);
  }, STORAGE_KEY);
  const parsedAfterOne = JSON.parse(storedAfterOne);
  const firstCaption = parsedAfterOne.plants[0].caption;
  check('caption stored at creation', typeof firstCaption === 'string' && firstCaption.length > 20, firstCaption);
  check('caption has no leftover slot braces', firstCaption.indexOf('{') === -1, firstCaption);

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
      focused: document.activeElement ? document.activeElement.id : ''
    };
  });
  check('replay opens with the object name', replay.title === 'Kopitiam cup', replay.title);
  check('replay shows the stored caption', replay.caption === firstCaption, replay.caption);
  check('replay shows three answer chips and the plant', replay.chips === 3 && replay.hasPlant,
    'chips ' + replay.chips + ', plant ' + replay.hasPlant);
  check('replay adds a fresh narration line', replay.line.length > 0, replay.line);
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
