#!/usr/bin/env node
/*
  Garden of Life core slice definition of done. Static checks first, then one
  browser run that plays the whole first session on a phone viewport: tell a
  memory, three prompts, ceremony, planted sprout, panel, reload, a second and
  different memory, watering, and a missing prompt bank.

  Discipline lifted from games/memory-garden/qa/loop.mjs: this suite spawns its
  own server and owns the port or refuses to run, keeps the server's output so a
  crash names itself, waits the stale tap guard out before every scripted tap,
  checks what a tap was meant to do instead of assuming it, and leaves no server
  behind even when it dies halfway.

  Every check is named up front in NAME, and a check that never ran prints as a
  failure saying so. The run can therefore stop dead in the middle and the output
  still tells you which contracts were tested and which were not.
*/

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const gameRoot = path.resolve(here, '..');
const repoRoot = path.resolve(here, '../../..');

/* 4195 by default, one past the neighbouring suites, so a failure reproduces by
   hand. Override it when a second copy could be running from a worktree or
   another agent: both would want the same port and the loser tests nothing. */
const PORT = Number(process.env.GOL_PORT) || 4195;
const ORIGIN = 'http://localhost:' + PORT;
const GAME_URL = ORIGIN + '/garden-of-life';
const STORAGE_KEY = 'ctrlai:garden-of-life';
const VIEWPORT = { width: 390, height: 844 };

/* The game swallows a tap that lands inside a section which only just appeared,
   because that is almost always the second half of a double tap meant for the
   screen before. The guard is 350ms in main.js; a script clicks far faster than
   any hand, so every scripted tap waits it out first. */
const GUARD_WAIT = 400;
const TAP_FLOOR = 64;
// Built from its code point on purpose. The house rule bans the character itself
// from every file, and a scanner carrying a copy of what it hunts is a liar.
const EM_DASH = String.fromCharCode(0x2014);

/* Content and art are written by other workflows and may not have landed. A 404
   on those is the documented absence contract, not a fault. Anything else that
   fails on the wire is this game's problem. Matched on the path alone, so a
   cache buster in the query string cannot smuggle a real failure through. */
const TOLERATED_ABSENCE = [
  /\/content\/[^?]*\.json$/,
  /\/art\/[^?]*\.(png|svg)$/,
  /\/icons\//
];

const NAME = {
  noConsole: 'no console.log in the game js',
  noRandom: 'no Math.random in the game js',
  dateOnce: 'date reads live in state.js alone, twice at most',
  noEmDash: 'no em dash in the js, index.html or garden.css',
  firstLoad: 'first load shows the garden, 12 plots and the way in, and fits 390',
  pickerOpens: 'tell a memory opens the picker with 8 objects and no waiting line',
  chipCounts: 'every prompt step offers exactly 4 chips',
  nextGated: 'next reads as not yet before the first chip is tapped',
  chipPressed: 'a tapped chip reports itself pressed',
  ceremonyPlant: 'the ceremony shows a full grown memory plant',
  ceremonyLine: 'the ceremony line arrives within 4s',
  plantedSprout: 'done lands in the garden with one plant at stage 0',
  panelOpens: 'the plant panel opens with its story and its plant',
  panelFocus: 'closing the panel puts focus back on the plot',
  reloadIdentity: 'a reload keeps the plant identity attribute for attribute',
  secondPlot: 'a second memory fills a second plot',
  plantsDiffer: 'the two plants differ in species and in the whole trait tuple',
  storyStable: 'a story reads the same every time it is told',
  waterGrows: 'watering answers and grows the plant to stage 1',
  waterAgain: 'watering twice in one day answers differently and does not grow again',
  waterSticks: 'the garden and a reload both keep stage 1',
  calmDegrade: 'a missing prompt bank leaves a calm picker and a way back',
  tapFloor: 'every tap target on every screen visited clears 64px',
  noSideScroll: 'no screen visited scrolls sideways at 390',
  serverUp: 'the dev server stayed up for the whole run',
  tapsLand: 'scripted taps land first time, the stale tap guard is not eating real ones',
  noConsoleErrors: 'zero console errors',
  noPageErrors: 'zero page errors',
  noBadRequests: 'no failed request outside the tolerated absences'
};

const results = new Map();
const extras = [];
const consoleErrors = [];
const pageErrors = [];
const failedRequests = [];
const retriedTaps = [];
const screens = [];
const narratedAbsences = [];

function check(name, pass, detail) {
  results.set(name, { pass: Boolean(pass), detail: detail === undefined ? '' : String(detail) });
}

function extra(name, pass, detail) {
  extras.push({ name: name, pass: Boolean(pass), detail: detail === undefined ? '' : String(detail) });
}

function describe(error) {
  if (error === null || error === undefined) {
    return 'unknown failure';
  }
  return String(error.message ? error.message : error).split('\n')[0];
}

function sleep(ms) {
  return new Promise(function (resolve) { setTimeout(resolve, ms); });
}

function tolerated(url) {
  let pathname = url;
  try {
    pathname = new URL(url).pathname;
  } catch (err) {
    // A url the URL parser will not take is not a tolerated absence either.
  }
  for (let i = 0; i < TOLERATED_ABSENCE.length; i += 1) {
    if (TOLERATED_ABSENCE[i].test(pathname)) {
      return true;
    }
  }
  return false;
}

function watch(page) {
  /* Chromium writes its own console error for every 404 it meets, so a bank that
     has not landed would fail the zero errors contract for doing exactly what
     the absence contract asks. Only the browser's own narration of a tolerated
     url is let through, and it is counted out loud rather than swallowed.
     A console error the game itself wrote still fails, whatever it is about. */
  page.on('console', function (message) {
    if (message.type() !== 'error') {
      return;
    }
    const where = message.location();
    const url = where && where.url ? where.url : '';
    const text = message.text();
    if (url !== '' && tolerated(url) && text.indexOf('Failed to load resource') !== -1) {
      narratedAbsences.push(url);
      return;
    }
    consoleErrors.push(text + (url ? ' :: ' + url : ''));
  });
  page.on('pageerror', function (error) {
    pageErrors.push(error.message);
  });
  page.on('requestfailed', function (request) {
    const failure = request.failure();
    failedRequests.push(request.url() + ' :: ' + (failure ? failure.errorText : 'failed'));
  });
  page.on('response', function (response) {
    const status = response.status();
    if (status < 400) {
      return;
    }
    if (status === 404 && tolerated(response.url())) {
      return;
    }
    failedRequests.push(response.url() + ' :: HTTP ' + status);
  });
  return page;
}

/* ---- owning the port ----------------------------------------------------
   The previous run's server is killed with a signal and not waited for, so for a
   few milliseconds after a run ends the port is still held. Two runs back to
   back land inside that window: the new server dies of EADDRINUSE, this suite
   unknowingly drives the old one, and the results are worthless. */

function portIsFree() {
  return new Promise(function (resolve) {
    const probe = net.createServer();
    probe.once('error', function () { resolve(false); });
    probe.listen(PORT, function () {
      probe.close(function () { resolve(true); });
    });
  });
}

async function waitForFreePort(timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (await portIsFree()) {
      return true;
    }
    if (Date.now() >= deadline) {
      return false;
    }
    await sleep(100);
  }
}

// isMine tells us the spawned server is still alive. Without it a dead child
// leaves this polling a stranger on the same port until the timeout.
async function waitForServer(timeoutMs, isMine) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (typeof isMine === 'function' && !isMine()) {
      return false;
    }
    try {
      const response = await fetch(ORIGIN + '/');
      await response.text();
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

/* ---- static checks, no browser needed ----------------------------------- */

async function jsFiles(dir) {
  const found = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (let i = 0; i < entries.length; i += 1) {
    const entry = entries[i];
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const nested = await jsFiles(full);
      for (let j = 0; j < nested.length; j += 1) {
        found.push(nested[j]);
      }
    } else if (entry.name.endsWith('.js')) {
      found.push(full);
    }
  }
  return found;
}

function occurrences(text, needle) {
  let count = 0;
  let at = text.indexOf(needle);
  while (at !== -1) {
    count += 1;
    at = text.indexOf(needle, at + needle.length);
  }
  return count;
}

function shortPath(file) {
  return path.relative(gameRoot, file);
}

async function staticChecks() {
  const files = await jsFiles(path.join(gameRoot, 'js'));
  const sources = [];
  for (let i = 0; i < files.length; i += 1) {
    sources.push({ file: files[i], text: await readFile(files[i], 'utf8') });
  }

  const logging = sources.filter(function (row) { return row.text.indexOf('console.log(') !== -1; });
  check(NAME.noConsole, logging.length === 0,
    (logging.length === 0 ? sources.length + ' files clean' : logging.map(function (row) {
      return shortPath(row.file);
    }).join(', ')));

  const random = sources.filter(function (row) { return row.text.indexOf('Math.random(') !== -1; });
  check(NAME.noRandom, random.length === 0,
    (random.length === 0 ? sources.length + ' files clean' : random.map(function (row) {
      return shortPath(row.file);
    }).join(', ')));

  /* The QA clock only works if there is exactly one place the calendar can be
     read from. Two calls is the ceiling because todayISO may need a parse
     alongside the read; anything past that is a second clock. */
  let inState = 0;
  const strays = [];
  for (let i = 0; i < sources.length; i += 1) {
    const row = sources[i];
    const hits = occurrences(row.text, 'Date.now(') + occurrences(row.text, 'new Date(');
    if (path.basename(row.file) === 'state.js') {
      inState = hits;
    } else if (hits > 0) {
      strays.push(shortPath(row.file) + ' has ' + hits);
    }
  }
  check(NAME.dateOnce, inState <= 2 && strays.length === 0,
    'state.js has ' + inState + ', elsewhere ' + (strays.length === 0 ? 'none' : strays.join(', ')));

  const dashChecked = files.slice();
  dashChecked.push(path.join(gameRoot, 'index.html'));
  dashChecked.push(path.join(gameRoot, 'css', 'garden.css'));
  const dashed = [];
  for (let i = 0; i < dashChecked.length; i += 1) {
    const text = await readFile(dashChecked[i], 'utf8');
    const hits = occurrences(text, EM_DASH);
    if (hits > 0) {
      dashed.push(shortPath(dashChecked[i]) + ' has ' + hits);
    }
  }
  check(NAME.noEmDash, dashed.length === 0,
    dashed.length === 0 ? dashChecked.length + ' files clean' : dashed.join(', '));
}

/* ---- tapping ------------------------------------------------------------ */

async function pressLocator(locator, force) {
  await sleep(GUARD_WAIT);
  // An explicit timeout so a control that never becomes actionable fails in
  // seconds with a name attached, instead of stalling the whole run.
  await locator.click({ force: Boolean(force), timeout: 5000 });
}

/* Pass what a tap is meant to bring about and the tap is checked, not assumed. A
   selector waits for that thing to appear, the same selector behind a "!" waits
   for it to go away. The game may swallow a tap that lands too soon after a
   screen change, so if the screen did not arrive the script taps again exactly
   the way a person would. Every retry is counted, so a guard that starts eating
   real taps shows up as a number rather than as a suite papering over it. */
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
    await target.locator(wanted).waitFor({ state: state, timeout: 4000 });
  }
}

/* ---- reading the page --------------------------------------------------- */

/* The house class names come first, direct children second. A wrapper choice
   this suite did not predict then reports a real count instead of a phantom
   zero, and the count is what the contract is written in. */
async function itemsIn(page, containerId, itemClass) {
  const classed = page.locator('#' + containerId + ' ' + itemClass);
  if (await classed.count() > 0) {
    return classed;
  }
  return page.locator('#' + containerId + ' > *');
}

function readPlots(page) {
  return page.evaluate(function () {
    return Array.from(document.querySelectorAll('.plot-filled')).map(function (plot) {
      const svg = plot.querySelector('svg');
      const attr = function (name) {
        return svg === null ? '' : (svg.getAttribute(name) || '');
      };
      return {
        plantId: plot.dataset.plantId || '',
        plotStage: plot.dataset.stage || '',
        hasSvg: svg !== null,
        kind: attr('data-kind'),
        species: attr('data-species'),
        palette: attr('data-palette'),
        bloom: attr('data-bloom'),
        ornament: attr('data-ornament'),
        stage: attr('data-stage'),
        seed: attr('data-seed')
      };
    });
  });
}

function identity(plot) {
  return [plot.species, plot.palette, plot.bloom, plot.ornament, plot.seed].join('|');
}

function tuple(plot) {
  return [plot.species, plot.palette, plot.bloom, plot.ornament].join('|');
}

/* Measured on every screen the run visits, then judged once at the end. Elements
   inside a hidden section report a zero box and are skipped, so this only ever
   asks about what a finger could actually reach. */
async function auditScreen(page, label) {
  const row = await page.evaluate(function (floor) {
    const nodes = Array.from(document.querySelectorAll('.btn, .chip, .plot'));
    const small = [];
    let counted = 0;
    for (let i = 0; i < nodes.length; i += 1) {
      const box = nodes[i].getBoundingClientRect();
      if (box.width <= 0 || box.height <= 0) {
        continue;
      }
      counted += 1;
      const smaller = Math.min(box.width, box.height);
      if (smaller < floor) {
        const node = nodes[i];
        const label = node.id ? '#' + node.id : (node.getAttribute('class') || node.tagName);
        small.push(label + ' at ' + Math.round(box.width) + 'x' + Math.round(box.height));
      }
    }
    return {
      counted: counted,
      small: small,
      scrollWidth: document.scrollingElement.scrollWidth
    };
  }, TAP_FLOOR);
  screens.push({
    label: label,
    counted: row.counted,
    small: row.small,
    scrollWidth: row.scrollWidth
  });
  return row;
}

async function waitForText(page, id, timeout) {
  try {
    await page.waitForFunction(function (target) {
      const node = document.getElementById(target);
      return node !== null && node.textContent.trim().length > 0;
    }, id, { timeout: timeout });
  } catch (err) {
    // The check that follows reports the emptiness, this only bounds the wait.
  }
  return page.evaluate(function (target) {
    const node = document.getElementById(target);
    return node === null ? '' : node.textContent.trim();
  }, id);
}

async function waitForPlots(page, wanted, timeout) {
  try {
    await page.waitForFunction(function (count) {
      return document.querySelectorAll('.plot-filled').length === count;
    }, wanted, { timeout: timeout });
  } catch (err) {
    // Reported by whichever check asked for the count.
  }
}

/* A new Playwright context carries no storage at all, so this is already the
   cleared storage a first session needs. It is deliberately not cleared by an
   init script: those run again on every navigation, so a reload would wipe the
   save right before the game read it and persistence could never pass. The
   first load check proves the precondition instead, by finding no plants. */
async function freshContext(browser, options) {
  const settings = Object.assign({ viewport: VIEWPORT, hasTouch: true }, options || {});
  return browser.newContext(settings);
}

async function openGame(context) {
  const page = watch(await context.newPage());
  await page.goto(GAME_URL, { waitUntil: 'domcontentloaded' });
  // Boot is async: banks are fetched before the garden draws. Wait for the plots
  // to exist rather than for the network to go quiet, which a missing bank or a
  // slow art request would make a lie either way.
  await page.waitForFunction(function () {
    const plots = document.getElementById('plots');
    return plots !== null && plots.childElementCount > 0;
  }, null, { timeout: 8000 });
  return page;
}

/* ---- the memory flow ---------------------------------------------------- */

/* Deterministic on purpose: the object and the chip are chosen by position, not
   at random, so two runs with different indexes are a real comparison and a
   failure is reproducible by hand. Everything read out of the page comes back
   for the caller to judge, because this function drives and never asserts. */
async function plantMemory(page, objectIndex, chipIndex) {
  const seen = {
    cards: 0,
    waitVisible: null,
    chipCounts: [],
    chipIds: [],
    pressedFlips: [],
    gateBefore: '',
    gateStuck: [],
    ceremony: null,
    ceremonyLine: ''
  };

  await press(page, '#tell-memory', '#view-picker');
  await page.locator('#view-picker').waitFor({ state: 'visible', timeout: 4000 });
  // The cards arrive a tick after the view, so give them a chance before counting.
  try {
    await page.waitForFunction(function () {
      const objects = document.getElementById('objects');
      return objects !== null && objects.childElementCount > 0;
    }, null, { timeout: 4000 });
  } catch (err) {
    // An empty picker is a finding, not a crash. Counted below either way.
  }
  const cards = await itemsIn(page, 'objects', '.object-card');
  seen.cards = await cards.count();
  seen.waitVisible = await page.locator('#picker-wait').isVisible();
  await auditScreen(page, 'picker');

  if (seen.cards === 0) {
    return seen;
  }

  await pressLocator(cards.nth(objectIndex));
  await page.locator('#view-prompt').waitFor({ state: 'visible', timeout: 4000 });

  for (let step = 0; step < 3; step += 1) {
    try {
      await page.waitForFunction(function () {
        const row = document.getElementById('prompt-chips');
        return row !== null && row.childElementCount > 0;
      }, null, { timeout: 4000 });
    } catch (err) {
      // An empty chip row is a finding. The count below carries it.
    }
    const chips = await itemsIn(page, 'prompt-chips', '.chip');
    const count = await chips.count();
    seen.chipCounts.push(count);
    if (step === 0) {
      seen.gateBefore = await page.locator('#prompt-next').getAttribute('aria-disabled');
    }
    await auditScreen(page, 'prompt step ' + (step + 1));
    if (count === 0) {
      return seen;
    }

    const chip = chips.nth(Math.min(chipIndex, count - 1));
    seen.chipIds.push(await chip.getAttribute('data-chip-id'));
    const before = await chip.getAttribute('aria-pressed');
    await pressLocator(chip);
    const after = await chip.getAttribute('aria-pressed');
    seen.pressedFlips.push({ step: step + 1, before: String(before), after: String(after) });

    /* The gate has to open before the tap, or the tap is not a tap a player
       could make. If it never opens, force the click so the rest of the run
       still happens, and say so instead of hiding it behind a green line. */
    let stuck = false;
    try {
      await page.locator('#prompt-next[aria-disabled="false"]').waitFor({ state: 'attached', timeout: 2500 });
    } catch (err) {
      stuck = true;
      seen.gateStuck.push('step ' + (step + 1));
    }

    const stepLabel = await page.evaluate(function () {
      const node = document.getElementById('prompt-step');
      return node === null ? '' : node.textContent.trim();
    });
    await pressLocator(page.locator('#prompt-next'), stuck);

    if (step < 2) {
      /* A step change shows up either in the step label or in the gate closing
         again for a fresh question. Either is proof the screen moved, and
         asking for both would pin a copy decision this suite does not own. */
      try {
        await page.waitForFunction(function (was) {
          const label = document.getElementById('prompt-step');
          const next = document.getElementById('prompt-next');
          const moved = label !== null && label.textContent.trim() !== was;
          const reset = next !== null && next.getAttribute('aria-disabled') === 'true';
          return moved || reset;
        }, stepLabel, { timeout: 2500 });
      } catch (err) {
        retriedTaps.push('#prompt-next did not move past step ' + (step + 1));
        await pressLocator(page.locator('#prompt-next'), stuck);
      }
    }
  }

  await page.locator('#view-ceremony').waitFor({ state: 'visible', timeout: 5000 });
  seen.ceremonyLine = await waitForText(page, 'ceremony-line', 4000);
  seen.ceremony = await page.evaluate(function () {
    const svg = document.querySelector('#ceremony-stage svg');
    return {
      present: svg !== null,
      kind: svg === null ? '' : (svg.getAttribute('data-kind') || ''),
      stage: svg === null ? '' : (svg.getAttribute('data-stage') || ''),
      species: svg === null ? '' : (svg.getAttribute('data-species') || '')
    };
  });
  await auditScreen(page, 'ceremony');

  await press(page, '#ceremony-done', '#view-garden');
  await page.locator('#view-garden').waitFor({ state: 'visible', timeout: 4000 });
  return seen;
}

async function openPanel(page, index) {
  await press(page, '.plot-filled >> nth=' + index, '#view-plant');
  await page.locator('#view-plant').waitFor({ state: 'visible', timeout: 4000 });
  const story = await waitForText(page, 'plant-story', 4000);
  const shape = await page.evaluate(function () {
    const svg = document.querySelector('#plant-stage svg');
    return {
      hasSvg: svg !== null,
      stage: svg === null ? '' : (svg.getAttribute('data-stage') || '')
    };
  });
  return { story: story, hasSvg: shape.hasSvg, stage: shape.stage };
}

async function closePanel(page) {
  await press(page, '#plant-close', '!#view-plant');
  await page.locator('#view-plant').waitFor({ state: 'hidden', timeout: 4000 });
}

function panelStage(page) {
  return page.evaluate(function () {
    const svg = document.querySelector('#plant-stage svg');
    return svg === null ? '' : (svg.getAttribute('data-stage') || '');
  });
}

/* ---- the run ------------------------------------------------------------ */

async function mainSession(browser) {
  const context = await freshContext(browser);
  const page = await openGame(context);

  /* ---- 5 first load --------------------------------------------------- */
  const first = await page.evaluate(function () {
    const plots = document.getElementById('plots');
    return {
      garden: document.getElementById('view-garden').hidden === false,
      plots: plots === null ? -1 : plots.childElementCount,
      plotClass: document.querySelectorAll('#plots > .plot').length,
      tell: document.getElementById('tell-memory').getBoundingClientRect().height > 0,
      filled: document.querySelectorAll('.plot-filled').length
    };
  });
  const gardenBox = await auditScreen(page, 'garden, first load');
  check(NAME.firstLoad,
    first.garden && first.plots === 12 && first.plotClass === 12 && first.tell &&
      first.filled === 0 && gardenBox.scrollWidth <= VIEWPORT.width,
    'garden visible ' + first.garden + ', ' + first.plotClass + ' of ' + first.plots +
      ' children are .plot, tell a memory visible ' + first.tell +
      ', plants already there ' + first.filled +
      ', scrollWidth ' + gardenBox.scrollWidth);

  /* ---- 6 the whole first session -------------------------------------- */
  const run1 = await plantMemory(page, 0, 1);
  check(NAME.pickerOpens, run1.cards === 8 && run1.waitVisible === false,
    run1.cards + ' object cards, picker-wait visible ' + run1.waitVisible);
  check(NAME.chipCounts,
    run1.chipCounts.length === 3 && run1.chipCounts.every(function (n) { return n === 4; }),
    'chips per step: ' + (run1.chipCounts.join(', ') || 'no step reached') +
      (run1.chipIds.length ? ' :: chip ids ' + run1.chipIds.join(', ') : ''));
  check(NAME.nextGated, run1.gateBefore === 'true',
    'aria-disabled on step one before any chip: ' + String(run1.gateBefore) +
      (run1.gateStuck.length ? ', and it never opened on ' + run1.gateStuck.join(', ') : ''));
  check(NAME.chipPressed,
    run1.pressedFlips.length === 3 && run1.pressedFlips.every(function (flip) {
      return flip.after === 'true' && flip.before !== flip.after;
    }),
    run1.pressedFlips.length === 0 ? 'no chip was ever tapped' :
      run1.pressedFlips.map(function (flip) {
        return 'step ' + flip.step + ' ' + flip.before + ' to ' + flip.after;
      }).join(', '));
  check(NAME.ceremonyPlant,
    run1.ceremony !== null && run1.ceremony.present && run1.ceremony.kind === 'memory' &&
      run1.ceremony.stage === '2',
    run1.ceremony === null ? 'the ceremony was never reached' :
      'svg present ' + run1.ceremony.present + ', data-kind "' + run1.ceremony.kind +
        '", data-stage "' + run1.ceremony.stage + '", species "' + run1.ceremony.species + '"');
  check(NAME.ceremonyLine, run1.ceremonyLine.length > 0,
    run1.ceremonyLine.length > 0 ? run1.ceremonyLine : 'still empty after 4s');

  await waitForPlots(page, 1, 4000);
  const afterOne = await readPlots(page);
  await auditScreen(page, 'garden, one plant');
  check(NAME.plantedSprout,
    afterOne.length === 1 && afterOne[0].hasSvg && afterOne[0].stage === '0',
    afterOne.length + ' filled plots' + (afterOne.length === 1 ?
      ', svg ' + afterOne[0].hasSvg + ', svg data-stage "' + afterOne[0].stage +
      '", plot data-stage "' + afterOne[0].plotStage + '", identity ' + identity(afterOne[0]) : ''));

  /* ---- 7 the panel ----------------------------------------------------- */
  const panel = await openPanel(page, 0);
  await auditScreen(page, 'plant panel');
  check(NAME.panelOpens, panel.story.length > 0 && panel.hasSvg,
    'story "' + (panel.story || 'still empty after 4s') + '", svg in the stage ' + panel.hasSvg);
  await closePanel(page);
  const focus = await page.evaluate(function () {
    const node = document.activeElement;
    if (node === null) {
      return { isPlot: false, plantId: '', label: 'nothing' };
    }
    return {
      isPlot: node.classList ? node.classList.contains('plot') : false,
      plantId: node.dataset ? (node.dataset.plantId || '') : '',
      label: node.id ? '#' + node.id : (node.getAttribute('class') || node.tagName)
    };
  });
  check(NAME.panelFocus,
    focus.isPlot && focus.plantId !== '' &&
      (afterOne.length === 0 || focus.plantId === afterOne[0].plantId),
    'focus landed on ' + focus.label + (focus.plantId ? ' for plant ' + focus.plantId : ''));

  /* ---- 8 reload -------------------------------------------------------- */
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(function () {
    const plots = document.getElementById('plots');
    return plots !== null && plots.childElementCount > 0;
  }, null, { timeout: 8000 });
  await waitForPlots(page, 1, 4000);
  const reloaded = await readPlots(page);
  const sameCount = reloaded.length === 1 && afterOne.length === 1;
  check(NAME.reloadIdentity,
    sameCount && identity(reloaded[0]) === identity(afterOne[0]) && identity(reloaded[0]) !== '||||',
    sameCount ? 'before ' + identity(afterOne[0]) + ' :: after ' + identity(reloaded[0]) :
      afterOne.length + ' plants before the reload, ' + reloaded.length + ' after');

  /* ---- 9 a second, different memory ------------------------------------ */
  const run2 = await plantMemory(page, 1, 2);
  await waitForPlots(page, 2, 4000);
  const afterTwo = await readPlots(page);
  check(NAME.secondPlot, afterTwo.length === 2,
    afterTwo.length + ' filled plots, second run chip ids ' +
      (run2.chipIds.join(', ') || 'none read'));
  if (afterTwo.length === 2) {
    check(NAME.plantsDiffer,
      afterTwo[0].species !== afterTwo[1].species && tuple(afterTwo[0]) !== tuple(afterTwo[1]) &&
        afterTwo[0].species !== '',
      afterTwo[0].species + ' vs ' + afterTwo[1].species + ' :: ' +
        tuple(afterTwo[0]) + ' vs ' + tuple(afterTwo[1]));
  } else {
    check(NAME.plantsDiffer, false, 'only ' + afterTwo.length + ' plants to compare');
  }

  /* ---- 10 the story does not drift ------------------------------------- */
  const told = await openPanel(page, 0);
  await closePanel(page);
  const retold = await openPanel(page, 0);
  await closePanel(page);
  check(NAME.storyStable, told.story.length > 0 && told.story === retold.story,
    told.story === retold.story ? 'both tellings: "' + told.story + '"' :
      'first "' + told.story + '" then "' + retold.story + '"');

  /* ---- 11 watering ------------------------------------------------------ */
  const watering = await openPanel(page, 0);
  await pressLocator(page.locator('#plant-water'));
  const firstNote = await waitForText(page, 'plant-water-note', 2000);
  try {
    await page.waitForFunction(function () {
      const svg = document.querySelector('#plant-stage svg');
      return svg !== null && svg.getAttribute('data-stage') === '1';
    }, null, { timeout: 2500 });
  } catch (err) {
    // Reported by the check below with whatever the stage actually says.
  }
  const grownStage = await panelStage(page);
  check(NAME.waterGrows, firstNote.length > 0 && grownStage === '1',
    'note "' + (firstNote || 'still empty after 2s') + '", panel stage went ' +
      (watering.stage || 'unset') + ' to ' + (grownStage || 'unset'));

  await pressLocator(page.locator('#plant-water'));
  try {
    await page.waitForFunction(function (was) {
      const node = document.getElementById('plant-water-note');
      const text = node === null ? '' : node.textContent.trim();
      return text.length > 0 && text !== was;
    }, firstNote, { timeout: 2500 });
  } catch (err) {
    // The check below says whether it changed, this only bounds the wait.
  }
  const secondNote = await page.evaluate(function () {
    const node = document.getElementById('plant-water-note');
    return node === null ? '' : node.textContent.trim();
  });
  const heldStage = await panelStage(page);
  check(NAME.waterAgain,
    secondNote.length > 0 && secondNote !== firstNote && heldStage === '1',
    'first "' + firstNote + '" then "' + secondNote + '", stage still ' + (heldStage || 'unset'));

  await closePanel(page);
  const wateredInGarden = await readPlots(page);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(function () {
    const plots = document.getElementById('plots');
    return plots !== null && plots.childElementCount > 0;
  }, null, { timeout: 8000 });
  await waitForPlots(page, 2, 4000);
  const afterWaterReload = await readPlots(page);
  /* The svg is the plant, so its data-stage is what a player sees. The plot's
     own data-stage is read alongside it so a disagreement between the two is
     visible in the report rather than hidden by whichever one was asked. */
  const gardenStage = wateredInGarden.length > 0 ? wateredInGarden[0].stage : '';
  const keptStage = afterWaterReload.length > 0 ? afterWaterReload[0].stage : '';
  check(NAME.waterSticks, gardenStage === '1' && keptStage === '1',
    'in the garden "' + (gardenStage || 'unset') + '" (plot attribute "' +
      (wateredInGarden.length > 0 ? wateredInGarden[0].plotStage : 'unset') +
      '"), after a reload "' + (keptStage || 'unset') + '"');

  await context.close();
}

async function calmDegradeSession(browser) {
  const pageErrorsBefore = pageErrors.length;
  const context = await freshContext(browser);
  /* Routed to a 404 rather than aborted, because a missing file is what the
     absence contract is about. An aborted request is a different failure and
     would let the game pass this on the wrong code path. */
  await context.route('**/content/memory-prompts.json*', function (route) {
    route.fulfill({
      status: 404,
      contentType: 'text/plain; charset=utf-8',
      body: 'Not found'
    });
  });
  const page = await openGame(context);

  await press(page, '#tell-memory', '#view-picker');
  await page.locator('#view-picker').waitFor({ state: 'visible', timeout: 4000 });
  // Give the picker the same tick it gets in the happy path before calling it
  // empty, so this cannot pass for the wrong reason on a slow render.
  await sleep(500);
  const calm = await page.evaluate(function () {
    const objects = document.getElementById('objects');
    const wait = document.getElementById('picker-wait');
    return {
      picker: document.getElementById('view-picker').hidden === false,
      waitVisible: wait !== null && wait.getBoundingClientRect().height > 0,
      waitText: wait === null ? '' : wait.textContent.trim(),
      objects: objects === null ? -1 : objects.childElementCount
    };
  });
  await auditScreen(page, 'picker with no prompt bank');

  /* Scoped to the picker rather than page wide. The three stretch-two sections
     bring their own way out and deliberately do not carry data-back, but a page
     wide match would still be one selector hoping to stay unique forever, and
     the button this check means is the picker's. */
  await press(page, '#view-picker [data-back="garden"]', '#view-garden');
  const back = await page.locator('#view-garden').isVisible();
  const newErrors = pageErrors.length - pageErrorsBefore;

  check(NAME.calmDegrade,
    calm.picker && calm.waitVisible && calm.objects === 0 && back && newErrors === 0,
    'picker ' + calm.picker + ', waiting line visible ' + calm.waitVisible +
      ' ("' + calm.waitText + '"), objects ' + calm.objects + ', back to the garden ' + back +
      ', page errors in this context ' + newErrors);

  await context.close();
}

async function run(browser) {
  await mainSession(browser);
  await calmDegradeSession(browser);
}

function judgeScreens() {
  const undersized = screens.filter(function (row) { return row.small.length > 0; });
  const wide = screens.filter(function (row) { return row.scrollWidth > VIEWPORT.width; });
  const visited = screens.map(function (row) { return row.label; }).join(', ');

  check(NAME.tapFloor, screens.length > 0 && undersized.length === 0,
    screens.length === 0 ? 'no screen was ever measured' :
      (undersized.length === 0 ?
        screens.length + ' screens measured (' + visited + '), all targets clear ' + TAP_FLOOR + 'px' :
        undersized.map(function (row) {
          return row.label + ': ' + row.small.join(' / ');
        }).join(' | ')));

  check(NAME.noSideScroll, screens.length > 0 && wide.length === 0,
    screens.length === 0 ? 'no screen was ever measured' :
      (wide.length === 0 ? 'widest scrollWidth ' + screens.reduce(function (most, row) {
        return row.scrollWidth > most ? row.scrollWidth : most;
      }, 0) + ' at ' + VIEWPORT.width :
        wide.map(function (row) {
          return row.label + ' at ' + row.scrollWidth;
        }).join(' | ')));
}

async function main() {
  await staticChecks();

  // Never race a server that is still on its way out, and never quietly borrow
  // somebody else's. This suite has to own the port it tests.
  const portFree = await waitForFreePort(5000);
  if (!portFree) {
    process.stdout.write('Garden of Life core QA cannot start: port ' + PORT +
      ' is still held after 5s, so this run would be driving a server it does not ' +
      'own and the results would be worthless. Find the holder with ' +
      '"lsof -nP -iTCP:' + PORT + ' -sTCP:LISTEN" and stop it, or set GOL_PORT.\n');
    process.exit(1);
  }

  /* Keep the server's pipes and read them. With the output thrown away, a server
     that dies mid run leaves nothing behind but baffling connection refused
     failures, and the reason for all of them is gone. */
  const server = spawn(process.execPath, ['server.js'], {
    cwd: repoRoot,
    env: Object.assign({}, process.env, { PORT: String(PORT) }),
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let stopped = false;
  let exited = false;
  let markGone = null;
  const serverGone = new Promise(function (resolve) { markGone = resolve; });
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

  const serverLog = [];
  const keepOutput = function (stream) {
    if (!stream) {
      return;
    }
    stream.setEncoding('utf8');
    stream.on('data', function (chunk) { serverLog.push(chunk); });
  };
  keepOutput(server.stdout);
  keepOutput(server.stderr);
  let serverDied = '';
  server.on('error', function (error) {
    serverDied = 'the dev server could not be spawned: ' + error.message;
    exited = true;
    markGone();
  });
  server.on('exit', function (code, signal) {
    if (!stopped) {
      serverDied = 'the dev server exited on its own, code ' + code + ', signal ' + signal;
    }
    exited = true;
    markGone();
  });

  let browser = null;
  let crash = null;
  try {
    const up = await waitForServer(10000, function () { return !exited; });
    if (!up) {
      throw new Error(serverDied || 'dev server did not answer on ' + ORIGIN + ' within 10s');
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
    // Wait for it to really go, so the next run back to back finds a free port.
    await Promise.race([serverGone, sleep(3000)]);
    if (!exited) {
      try {
        server.kill('SIGKILL');
      } catch (err) {
        // already gone
      }
      await Promise.race([serverGone, sleep(1000)]);
    }
  }

  // Let any last exit event and any final bytes off the pipes land before asking.
  await sleep(150);

  judgeScreens();

  /* Ask this before the error counts, because a server that fell over is the
     reason for every one of them and should read that way. */
  const serverOutput = serverLog.join('').trim().split('\n').join(' / ');
  check(NAME.serverUp, serverDied === '',
    serverDied === '' ? 'it said "' + serverOutput + '"' :
      serverDied + ' :: ' + (serverOutput || 'it printed nothing at all'));

  // A tap the guard swallows is not a bug on its own, a suite full of them is.
  check(NAME.tapsLand, retriedTaps.length <= 2,
    retriedTaps.length === 0 ? 'no retries in the whole run' :
      retriedTaps.length + ' retries :: ' + retriedTaps.join(' | '));
  const absenceNote = narratedAbsences.length === 0 ? '' :
    ' (' + narratedAbsences.length + ' browser 404 narrations for documented absences: ' +
      narratedAbsences.slice(0, 3).join(', ') + ')';
  check(NAME.noConsoleErrors, consoleErrors.length === 0,
    (consoleErrors.length === 0 ? 'none' : consoleErrors.slice(0, 5).join(' | ')) + absenceNote);
  check(NAME.noPageErrors, pageErrors.length === 0,
    pageErrors.length === 0 ? 'none' : pageErrors.slice(0, 5).join(' | '));
  check(NAME.noBadRequests, failedRequests.length === 0,
    failedRequests.length === 0 ? 'none outside content json, art and icons' :
      failedRequests.slice(0, 5).join(' | '));

  if (crash !== null) {
    extra('script ran to completion', false, describe(crash));
  }

  const order = Object.keys(NAME);
  const rows = [];
  for (let i = 0; i < order.length; i += 1) {
    const name = NAME[order[i]];
    const found = results.get(name);
    rows.push(found ? { name: name, pass: found.pass, detail: found.detail } :
      { name: name, pass: false, detail: 'not reached, the run stopped before this check' });
  }
  for (let i = 0; i < extras.length; i += 1) {
    rows.push(extras[i]);
  }

  let failures = 0;
  process.stdout.write('\nGarden of Life core QA\n');
  process.stdout.write('----------------------\n');
  for (let i = 0; i < rows.length; i += 1) {
    if (!rows[i].pass) {
      failures += 1;
    }
    process.stdout.write((rows[i].pass ? 'PASS  ' : 'FAIL  ') + rows[i].name +
      (rows[i].detail ? '  ::  ' + rows[i].detail : '') + '\n');
  }
  process.stdout.write('----------------------\n');
  process.stdout.write((failures === 0 ? 'ALL PASS' : 'FAILURES: ' + failures) +
    '  (' + rows.length + ' checks, ' + screens.length + ' screens measured)\n');

  if (crash !== null) {
    process.stdout.write('\nthe run stopped early: ' + String(crash.stack || crash) + '\n');
  }
  process.exit(failures === 0 ? 0 : 1);
}

main();
