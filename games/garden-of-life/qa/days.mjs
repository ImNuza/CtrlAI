#!/usr/bin/env node
/*
  Garden of Life day cycle QA. The calendar suite: growth across simulated days,
  wilt and recovery, a real month boundary, and every gardener event the spec
  says a player must actually see.

  Sibling to qa/core.mjs, not a replacement. core.mjs proves one sitting works;
  this proves the days between sittings work. Same discipline throughout: own the
  port or refuse to run, keep the server's output, wait the stale tap guard out
  before every scripted tap, explicit element state waits and never networkidle,
  and a named check list that prints in full even when the run stops early.

  Two landmines are designed around rather than worked around.

  The clock. state.todayISO() honours localStorage ctrlai:garden-of-life:qa-clock,
  and the FIRST load of a context is the one that classifies the visit. Setting
  the clock after a goto and then reloading spends the first visit on the wrong
  day, so the greeting under test has already been counted as a return. Every
  scenario therefore seeds its clock, and its saved garden, through
  context.addInitScript before the first navigation.

  The same init script runs again on every later navigation in that context, and
  a script that writes unconditionally would wipe the save on every reload. So it
  writes only what is not there yet. After the first load the game owns both keys,
  page.evaluate moves the clock within the context, and a reload keeps the garden
  it just built.

  Membership, not wording. Her lines come out of content/gardener-lines.json, so
  every assertion loads that bank from disk, fills the slots the way shared/ai.js
  fills them, and checks the sentence on screen is one of the results. Retuning
  the bank keeps this suite green; wiring the wrong event to the wrong moment does
  not. Three strings are written in gardener.js rather than banked, by design, and
  are compared literally instead: the continue chip, the skip chip and the skip
  line.
*/

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const gameRoot = path.resolve(here, '..');
const repoRoot = path.resolve(here, '../../..');
const BANK_PATH = path.join(gameRoot, 'content', 'gardener-lines.json');

// 4196 per the port registry in the stretch plan. Override it when a second copy
// could be running from a worktree or another agent: both would want the same
// port and the loser is testing a stranger.
const PORT = Number(process.env.GOL_DAYS_PORT) || 4196;
const ORIGIN = 'http://localhost:' + PORT;
const GAME_URL = ORIGIN + '/garden-of-life';
const STORAGE_KEY = 'ctrlai:garden-of-life';
const QA_CLOCK_KEY = 'ctrlai:garden-of-life:qa-clock';
const VIEWPORT = { width: 390, height: 844 };

const GUARD_WAIT = 400;
const TAP_FLOOR = 64;
const BODY_FLOOR = 28;

/* The three strings gardener.js writes rather than banks, per its own comment.
   They have no bank event to be a member of, so they are the one place this
   suite compares wording literally. */
const SKIP_LABEL = 'Later lah';
const SKIP_LINE = 'No hurry lah. Come, the plants are waiting for you.';

/* A wilted plant is a thirsty plant, never a rebuke. Nothing on that screen may
   suggest the player let something die or should have come sooner. */
const SHAME_WORDS = ['dead', 'dying', 'died', 'neglect', 'forgot', 'failed', 'fault',
  'too late', 'should have', 'ashamed', 'lazy', 'abandoned', 'ignored', 'sorry'];

const TOLERATED_ABSENCE = [
  /\/content\/[^?]*\.json$/,
  /\/art\/[^?]*\.(png|svg)$/,
  /\/icons\//
];

// Calendar anchors. The boundary run is the only one pinned to real dates,
// because crossing the end of July is the whole point of it.
const GROW_DAY = '2026-06-10';
const VISIT_DAY = '2026-06-20';
const BOUNDARY_DAY = '2026-07-31';

const NAME = {
  bankReadable: 'the gardener bank on disk parses with every event this suite checks',
  firstGreeting: 'a fresh player is greeted from the first_visit bank',
  plantingReaction: 'the ceremony is answered from the planting bank',
  welcomeRing: 'the new plot wears the welcome ring once and loses it on the next render',
  labelReadsOnce: 'the new plot says just planted once, not twice',
  growthDay0: 'watering on planting day grows the sprout to stage 1',
  growthSameDay: 'a second watering the same day answers kindly and never advances',
  wateringReaction: 'closing the panel after watering is answered from the watering bank',
  growthDay1: 'a day later another watering reaches stage 2',
  wiltAppears: 'two dry days wilt the plant and the label stays kind',
  wiltRecovers: 'water after a wilt recovers it completely and keeps the stage',
  boundaryHolds: 'the wilt arithmetic crosses 2026-07-31 to 2026-08-02 correctly',
  absenceGreeting: 'a gap of two days greets from the return_after_absence bank',
  returnGreeting: 'a gap of one day greets from the return_visit bank',
  nameSaved: 'an honorific plus a typed name is stored and re-greeted by name',
  nameSkipped: 'skipping the name stores nothing and answers with the written skip line',
  wiltNotice: 'closing the panel beside a thirsty plant is answered from the wilt_notice bank',
  wateringWins: 'watering suppresses the wilt notice for that moment',
  gardenerFloor: 'her bubble clears 28px and the name form controls clear 64px',
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
const narratedAbsences = [];
const retriedTaps = [];
const screens = [];
const bubbles = [];
let bank = Object.create(null);

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

/* ---- the calendar -------------------------------------------------------
   Node side only. The game may not read a clock outside state.todayISO(); a
   harness that writes the clock obviously has to know what day it is asking
   for. Fixed to UTC midnight, exactly like state.dayNumber, so no daylight
   saving jump anywhere in the world can turn a day into 23 hours. */

const MS_PER_DAY = 86400000;

function shiftDay(iso, days) {
  const ms = Date.parse(iso + 'T00:00:00Z') + days * MS_PER_DAY;
  const at = new Date(ms);
  const pad = function (value) { return value < 10 ? '0' + String(value) : String(value); };
  return String(at.getUTCFullYear()) + '-' + pad(at.getUTCMonth() + 1) + '-' + pad(at.getUTCDate());
}

/* ---- the bank -----------------------------------------------------------
   fillSlots and tidy are reproduced from shared/ai.js rather than imported,
   because neither is exported. They are copied line for line and this comment
   is the coupling: if the seam's slot syntax or its tidy rules change, this
   pair changes with them or every membership check here starts lying. */

const SLOT_PATTERN = /\{([a-zA-Z0-9_]+)\}/g;

function fillTemplate(template, context) {
  const raw = String(template).replace(SLOT_PATTERN, function (match, slot) {
    const value = context[slot];
    if (value === undefined || value === null || value === '') {
      return '';
    }
    return String(value);
  });
  return raw
    .replace(/\s+([,.!?;:])/g, '$1')
    .replace(/\(\s*\)/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

// registerBank keeps a template when it is a non empty string and drops the
// rest, and gardener.js filters to exactly the same rule before registering.
// This third copy of that filter is what keeps the candidate list honest.
function templatesFor(event) {
  const entries = bank[event];
  if (!Array.isArray(entries)) {
    return [];
  }
  const out = [];
  for (let i = 0; i < entries.length; i += 1) {
    const line = entries[i];
    if (line !== null && typeof line === 'object' && typeof line.text === 'string' &&
      line.text.trim() !== '') {
      out.push(line.text);
    }
  }
  return out;
}

function candidatesFor(event, context) {
  return templatesFor(event).map(function (template) {
    return fillTemplate(template, context);
  });
}

async function loadBank() {
  const raw = JSON.parse(await readFile(BANK_PATH, 'utf8'));
  bank = raw !== null && typeof raw === 'object' && raw.events !== null &&
    typeof raw.events === 'object' ? raw.events : Object.create(null);
  const wanted = ['first_visit', 'return_visit', 'return_after_absence', 'planting',
    'watering', 'wilt_notice', 'plant_comment'];
  const thin = wanted.filter(function (event) { return templatesFor(event).length === 0; });
  check(NAME.bankReadable, thin.length === 0,
    thin.length === 0 ? wanted.map(function (event) {
      return event + ' ' + templatesFor(event).length;
    }).join(', ') : 'no usable lines for ' + thin.join(', '));
}

/* ---- health ------------------------------------------------------------- */

function tolerated(url) {
  let pathname = url;
  try {
    pathname = new URL(url).pathname;
  } catch (err) {
    // A url the parser will not take is not a tolerated absence either.
  }
  for (let i = 0; i < TOLERATED_ABSENCE.length; i += 1) {
    if (TOLERATED_ABSENCE[i].test(pathname)) {
      return true;
    }
  }
  return false;
}

function watch(page) {
  /* Chromium narrates every 404 it meets in the console itself, so a bank or a
     face that has not landed would fail the zero errors contract for doing
     exactly what the absence contract asks. Only the browser's own narration of
     a tolerated url is let through, and it is counted out loud. Anything the
     game itself wrote still fails. */
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

/* ---- owning the port ---------------------------------------------------- */

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

/* ---- tapping ------------------------------------------------------------ */

async function pressLocator(locator, force) {
  await sleep(GUARD_WAIT);
  await locator.click({ force: Boolean(force), timeout: 5000 });
}

/* Pass what a tap is meant to bring about and the tap is checked, not assumed.
   A selector waits for that thing to appear, the same selector behind a "!"
   waits for it to go away. The game may swallow a tap that lands too soon after
   a screen change, so a tap that did not land is repeated exactly the way a
   person would repeat it, and every retry is counted. */
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

/* The app's own answer to what it knows, read through the very modules main.js
   used. ES module instances are per document, so importing state.js here is the
   same state.js the game is running on, not a second copy with its own idea of
   the world. Read only: nothing in here writes. */
function readFacts(page) {
  return page.evaluate(async function () {
    const state = await import('/games/garden-of-life/js/state.js');
    const view = await import('/games/garden-of-life/js/garden-view.js');
    const player = state.getPlayer();
    const last = state.findPlant(player.lastPlantId);
    const plants = state.getPlants().map(function (plant) {
      return {
        id: plant.id,
        label: view.speciesLabelFor(plant),
        stage: state.plantStage(plant),
        wilted: state.isWilted(plant),
        wateredDays: plant.wateredDays.slice()
      };
    });
    return {
      name: player.name,
      honorific: player.honorific,
      memoryHint: player.memoryHint,
      visitCount: player.visitCount,
      lastVisitDay: player.lastVisitDay,
      prevVisitDay: player.prevVisitDay,
      lastPlantId: player.lastPlantId,
      lastLabel: last === null ? '' : view.speciesLabelFor(last),
      today: state.todayISO(),
      plants: plants
    };
  });
}

function composedName(facts) {
  return [String(facts.honorific || '').trim(), String(facts.name || '').trim()]
    .filter(function (part) { return part !== ''; })
    .join(' ');
}

// The slots gardener.js fills from state before a caller's own context lands on
// top. Callers only ever pass {plant}, so this plus a label is the whole context.
function slotsFor(facts, plantLabel) {
  return {
    name: composedName(facts),
    memory_hint: String(facts.memoryHint || ''),
    plant: plantLabel === undefined ? '' : String(plantLabel)
  };
}

function labelOf(facts, plantId) {
  for (let i = 0; i < facts.plants.length; i += 1) {
    if (facts.plants[i].id === plantId) {
      return facts.plants[i].label;
    }
  }
  return '';
}

function plantById(facts, plantId) {
  for (let i = 0; i < facts.plants.length; i += 1) {
    if (facts.plants[i].id === plantId) {
      return facts.plants[i];
    }
  }
  return null;
}

function gardenerLine(page) {
  return page.evaluate(function () {
    const node = document.getElementById('gardener-line');
    return node === null ? '' : node.textContent.trim();
  });
}

/* Waits for the bubble to be saying one of the lines this moment is allowed to
   say, then reports whatever it actually says. A wait that expires is not an
   error here: the membership check is what has to do the talking, and it needs
   the real sentence to put in the report. */
async function waitForLine(page, candidates, timeout) {
  try {
    await page.waitForFunction(function (list) {
      const node = document.getElementById('gardener-line');
      return node !== null && list.indexOf(node.textContent.trim()) !== -1;
    }, candidates, { timeout: timeout === undefined ? 5000 : timeout });
  } catch (err) {
    // Reported by the caller, with the sentence that was there instead.
  }
  return gardenerLine(page);
}

async function waitForGreeting(page) {
  await page.waitForFunction(function () {
    const root = document.getElementById('gardener');
    const line = document.getElementById('gardener-line');
    return root !== null && root.hidden === false &&
      line !== null && line.textContent.trim().length > 0;
  }, null, { timeout: 8000 });
  return gardenerLine(page);
}

function shameIn(text) {
  const lowered = String(text).toLowerCase();
  return SHAME_WORDS.filter(function (word) { return lowered.indexOf(word) !== -1; });
}

function readPlot(page, plantId) {
  return page.evaluate(function (id) {
    const plot = document.querySelector('.plot-filled[data-plant-id="' + id + '"]');
    if (plot === null) {
      return null;
    }
    const svg = plot.querySelector('svg');
    return {
      wiltedClass: plot.classList.contains('is-wilted'),
      wilted: plot.dataset.wilted || '',
      stage: plot.dataset.stage || '',
      svgStage: svg === null ? '' : (svg.getAttribute('data-stage') || ''),
      svgWilted: svg === null ? '' : (svg.getAttribute('data-wilted') || ''),
      label: plot.getAttribute('aria-label') || ''
    };
  }, plantId);
}

function readRing(page) {
  return page.evaluate(function () {
    const marked = Array.from(document.querySelectorAll('.plot-new'));
    return {
      count: marked.length,
      label: marked.length > 0 ? (marked[0].getAttribute('aria-label') || '') : ''
    };
  });
}

/* ---- the floor ---------------------------------------------------------- */

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
      if (Math.min(box.width, box.height) < floor) {
        const node = nodes[i];
        const named = node.id ? '#' + node.id : (node.getAttribute('class') || node.tagName);
        small.push(named + ' at ' + Math.round(box.width) + 'x' + Math.round(box.height));
      }
    }
    return { counted: counted, small: small, scrollWidth: document.scrollingElement.scrollWidth };
  }, TAP_FLOOR);
  screens.push({ label: label, counted: row.counted, small: row.small, scrollWidth: row.scrollWidth });
  return row;
}

/* Her bubble is the one region core.mjs never saw, so it gets measured on its
   own terms: the sentence at body size, and every control the name form puts
   under a finger at the tap floor. */
async function auditBubble(page, label) {
  const row = await page.evaluate(function () {
    const box = function (node) {
      if (node === null) {
        return null;
      }
      const rect = node.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) {
        return null;
      }
      return { w: Math.round(rect.width), h: Math.round(rect.height), small: Math.min(rect.width, rect.height) };
    };
    const boxes = function (selector) {
      return Array.from(document.querySelectorAll(selector)).map(box).filter(function (found) {
        return found !== null;
      });
    };
    const line = document.getElementById('gardener-line');
    return {
      lineVisible: line !== null && line.getBoundingClientRect().height > 0,
      lineFont: line === null ? 0 : parseFloat(window.getComputedStyle(line).fontSize),
      lineText: line === null ? '' : line.textContent.trim(),
      input: box(document.getElementById('gardener-name-input')),
      save: box(document.getElementById('gardener-name-save')),
      replies: boxes('#gardener-replies .chip'),
      honorifics: boxes('#honorific-chips .chip'),
      skip: boxes('#gardener-name-form > .chip')
    };
  });
  bubbles.push(Object.assign({ label: label }, row));
  return row;
}

/* ---- contexts ----------------------------------------------------------- */

/* One context per calendar scenario. The clock and any seeded garden go in
   before the first navigation, because the first load is the one that decides
   what kind of visit this is, and nothing later can un-decide it.

   Written only when absent, on purpose. This same script runs again on every
   reload in the context, and an unconditional write would restore the seed over
   the top of whatever the player just did, which is a persistence test that can
   never fail and never means anything. */
async function scenario(browser, day, saved) {
  const context = await browser.newContext({ viewport: VIEWPORT, hasTouch: true });
  await context.addInitScript(function (payload) {
    try {
      if (window.localStorage.getItem(payload.clockKey) === null) {
        window.localStorage.setItem(payload.clockKey, payload.day);
      }
      if (payload.saved !== null && window.localStorage.getItem(payload.stateKey) === null) {
        window.localStorage.setItem(payload.stateKey, payload.saved);
      }
    } catch (err) {
      // Storage refusing to write is the game's problem to survive, not this
      // script's to hide. The checks below will say what the page actually did.
    }
  }, {
    clockKey: QA_CLOCK_KEY,
    stateKey: STORAGE_KEY,
    day: day,
    saved: saved === undefined || saved === null ? null : JSON.stringify(saved)
  });
  const page = watch(await context.newPage());
  await gotoGame(page);
  return { context: context, page: page };
}

async function gotoGame(page) {
  await page.goto(GAME_URL, { waitUntil: 'domcontentloaded' });
  await settle(page);
}

// Boot fetches three banks before the garden draws, so wait for the plots rather
// than for the network to go quiet: a missing bank would make quiet a lie.
async function settle(page) {
  await page.waitForFunction(function () {
    const plots = document.getElementById('plots');
    return plots !== null && plots.childElementCount > 0;
  }, null, { timeout: 8000 });
}

// Moving the clock inside a context is safe once the first load has happened,
// which is the whole reason the init script above writes only what is missing.
async function setClock(page, day) {
  await page.evaluate(function (payload) {
    window.localStorage.setItem(payload.key, payload.day);
  }, { key: QA_CLOCK_KEY, day: day });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await settle(page);
}

/* ---- seeded gardens ------------------------------------------------------
   Written to the shape state.js validates: anything that fails isPlant is
   dropped on load, so a seed that is quietly wrong would show up as an empty
   garden rather than as a passing test. */

function seededPlant(number, objectId, tags, phrases, plantedDay, wateredDays) {
  return {
    id: 'gol-' + String(number),
    kind: 'memory',
    plantedDay: plantedDay,
    objectId: objectId,
    answers: { who: 'seeded-who', where: 'seeded-where', feeling: 'seeded-feeling' },
    phrases: phrases,
    tags: tags,
    freeText: '',
    seed: 1000 + number,
    wateredDays: wateredDays
  };
}

const CUP_PHRASES = {
  object: 'the kopitiam cup',
  who: 'with my father',
  where: 'at the kampung shop',
  feeling: 'warm and cosy'
};

const TV_PHRASES = {
  object: 'the old Setron TV',
  who: 'with the whole family',
  where: 'in our first flat',
  feeling: 'noisy and happy'
};

function seededGarden(plants, player, nextId) {
  return {
    version: 1,
    player: Object.assign({
      name: '',
      honorific: '',
      visitCount: 0,
      lastVisitDay: '',
      prevVisitDay: '',
      lastPlantId: '',
      memoryHint: ''
    }, player),
    nextPlantId: nextId,
    plants: plants
  };
}

/* ---- driving the flow --------------------------------------------------- */

async function itemsIn(page, containerId, itemClass) {
  const classed = page.locator('#' + containerId + ' ' + itemClass);
  if (await classed.count() > 0) {
    return classed;
  }
  return page.locator('#' + containerId + ' > *');
}

// The whole memory flow by position, deterministic on purpose. core.mjs is what
// asserts this flow in detail; here it is only the way to get a plant into the
// soil so the calendar has something to act on.
async function growMemory(page, objectIndex, chipIndex) {
  await press(page, '#tell-memory', '#view-picker');
  await page.waitForFunction(function () {
    const objects = document.getElementById('objects');
    return objects !== null && objects.childElementCount > 0;
  }, null, { timeout: 5000 });
  await auditScreen(page, 'picker');
  const cards = await itemsIn(page, 'objects', '.object-card');
  await pressLocator(cards.nth(objectIndex));
  await page.locator('#view-prompt').waitFor({ state: 'visible', timeout: 4000 });

  for (let step = 0; step < 3; step += 1) {
    await page.waitForFunction(function () {
      const row = document.getElementById('prompt-chips');
      return row !== null && row.childElementCount > 0;
    }, null, { timeout: 4000 });
    const chips = await itemsIn(page, 'prompt-chips', '.chip');
    const count = await chips.count();
    await auditScreen(page, 'prompt step ' + (step + 1));
    await pressLocator(chips.nth(Math.min(chipIndex, count - 1)));
    const stepLabel = await page.evaluate(function () {
      const node = document.getElementById('prompt-step');
      return node === null ? '' : node.textContent.trim();
    });
    await pressLocator(page.locator('#prompt-next'));
    if (step < 2) {
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
        await pressLocator(page.locator('#prompt-next'));
      }
    }
  }

  await page.locator('#view-ceremony').waitFor({ state: 'visible', timeout: 5000 });
  await page.waitForFunction(function () {
    const line = document.getElementById('ceremony-line');
    return line !== null && line.textContent.trim().length > 0;
  }, null, { timeout: 4000 });
  await auditScreen(page, 'ceremony');
  await press(page, '#ceremony-done', '#view-garden');
  await page.locator('#view-garden').waitFor({ state: 'visible', timeout: 4000 });
}

async function openPanelFor(page, plantId) {
  await press(page, '.plot-filled[data-plant-id="' + plantId + '"]', '#view-plant');
  await page.locator('#view-plant').waitFor({ state: 'visible', timeout: 4000 });
  await auditScreen(page, 'plant panel');
}

function panelNote(page) {
  return page.evaluate(function () {
    const node = document.getElementById('plant-water-note');
    return node === null ? '' : node.textContent.trim();
  });
}

function panelStage(page) {
  return page.evaluate(function () {
    const svg = document.querySelector('#plant-stage svg');
    return svg === null ? { stage: '', wilted: '' } : {
      stage: svg.getAttribute('data-stage') || '',
      wilted: svg.getAttribute('data-wilted') || ''
    };
  });
}

// previous is what the note said before the tap, so the first pour waits for any
// answer and every later one waits for a different answer.
async function tapWater(page, previous) {
  await pressLocator(page.locator('#plant-water'));
  try {
    await page.waitForFunction(function (was) {
      const node = document.getElementById('plant-water-note');
      const text = node === null ? '' : node.textContent.trim();
      return text.length > 0 && text !== was;
    }, previous, { timeout: 2500 });
  } catch (err) {
    // The check reads the note either way and says what it found.
  }
  return panelNote(page);
}

async function closePanelNow(page) {
  await press(page, '#plant-close', '!#view-plant');
  await page.locator('#view-plant').waitFor({ state: 'hidden', timeout: 4000 });
}

/* ======================================================================
   Scenario one: a plant lives through a week.
   First visit, ceremony, welcome ring, watering, a day later, then two dry
   days and a recovery. Every gardener event this run can reach is checked
   where it happens rather than in a separate context that would have to
   rebuild the same garden to get there.
   ====================================================================== */

async function growthRun(browser) {
  const run = await scenario(browser, GROW_DAY, null);
  const page = run.page;

  const greeting = await waitForGreeting(page);
  const fresh = await readFacts(page);
  await auditScreen(page, 'garden, first visit');
  await auditBubble(page, 'first visit greeting');
  const firstCandidates = candidatesFor('first_visit', slotsFor(fresh, ''));
  check(NAME.firstGreeting,
    firstCandidates.indexOf(greeting) !== -1,
    'she said "' + greeting + '" against ' + firstCandidates.length + ' first_visit lines' +
      ', visit count ' + fresh.visitCount + ' on ' + fresh.today);

  await growMemory(page, 0, 1);
  const planted = await readFacts(page);
  const newest = planted.plants.length > 0 ? planted.plants[planted.plants.length - 1] : null;
  const plantId = newest === null ? '' : newest.id;
  const plantingCandidates = candidatesFor('planting', slotsFor(planted, newest === null ? '' : newest.label));
  const plantingLine = await waitForLine(page, plantingCandidates);
  check(NAME.plantingReaction,
    newest !== null && plantingCandidates.indexOf(plantingLine) !== -1,
    'she said "' + plantingLine + '" against ' + plantingCandidates.length +
      ' planting lines, for ' + (newest === null ? 'no plant at all' : newest.label));

  const ringOn = await readRing(page);
  await auditScreen(page, 'garden, just planted');
  await auditBubble(page, 'planting reaction');

  await openPanelFor(page, plantId);
  const firstNote = await tapWater(page, '');
  const wateredStage = await panelStage(page);
  const afterWater = await readFacts(page);
  const wateredPlant = plantById(afterWater, plantId);
  check(NAME.growthDay0,
    wateredStage.stage === '1' && wateredPlant !== null && wateredPlant.stage === 1 &&
      firstNote.length > 0,
    'panel svg stage "' + wateredStage.stage + '", state stage ' +
      (wateredPlant === null ? 'no plant' : wateredPlant.stage) + ', note "' + firstNote + '"');

  const secondNote = await tapWater(page, firstNote);
  const heldStage = await panelStage(page);
  const afterSecond = await readFacts(page);
  const heldPlant = plantById(afterSecond, plantId);
  check(NAME.growthSameDay,
    heldStage.stage === '1' && heldPlant !== null && heldPlant.stage === 1 &&
      heldPlant.wateredDays.length === 1 && secondNote.length > 0 && secondNote !== firstNote &&
      shameIn(secondNote).length === 0,
    'stage still "' + heldStage.stage + '", watered days ' +
      (heldPlant === null ? 'none' : heldPlant.wateredDays.join(' ')) +
      ', note "' + secondNote + '"');

  await closePanelNow(page);
  const wateringCandidates = candidatesFor('watering', slotsFor(afterSecond, labelOf(afterSecond, plantId)));
  const wateringLine = await waitForLine(page, wateringCandidates);
  const ringOff = await readRing(page);
  check(NAME.wateringReaction,
    wateringCandidates.indexOf(wateringLine) !== -1,
    'she said "' + wateringLine + '" against ' + wateringCandidates.length + ' watering lines');
  check(NAME.welcomeRing,
    ringOn.count === 1 && ringOn.label.indexOf('just planted') !== -1 && ringOff.count === 0,
    'ringed plots after the ceremony ' + ringOn.count + ' ("' + ringOn.label +
      '"), after the next render ' + ringOff.count);

  /* A stage 0 plant is already described as just planted by its growth word, and
     the fresh plot then appends the same phrase again, so a screen reader says it
     twice in one breath. Sighted players never see this, which is exactly why it
     needs a check of its own rather than a note somebody reads later. */
  const saidTwice = (ringOn.label.match(/just planted/g) || []).length;
  check(NAME.labelReadsOnce, saidTwice === 1,
    'the phrase appears ' + saidTwice + ' times in "' + ringOn.label + '"');

  /* ---- one day on ---- */
  const dayOne = shiftDay(GROW_DAY, 1);
  await setClock(page, dayOne);
  await openPanelFor(page, plantId);
  const grownNote = await tapWater(page, '');
  const grownStage = await panelStage(page);
  const grown = await readFacts(page);
  const grownPlant = plantById(grown, plantId);
  check(NAME.growthDay1,
    grownStage.stage === '2' && grownPlant !== null && grownPlant.stage === 2 &&
      grownPlant.wateredDays.length === 2,
    'on ' + grown.today + ' the panel says stage "' + grownStage.stage + '", state says ' +
      (grownPlant === null ? 'no plant' : grownPlant.stage) + ', watered ' +
      (grownPlant === null ? 'never' : grownPlant.wateredDays.join(' ')) +
      ', note "' + grownNote + '"');
  await closePanelNow(page);

  /* ---- three dry days ---- */
  const dryDay = shiftDay(dayOne, 3);
  await setClock(page, dryDay);
  const wiltedPlot = await readPlot(page, plantId);
  const dry = await readFacts(page);
  const dryPlant = plantById(dry, plantId);
  await auditScreen(page, 'garden, thirsty plant');
  const shame = wiltedPlot === null ? [] : shameIn(wiltedPlot.label);
  check(NAME.wiltAppears,
    wiltedPlot !== null && wiltedPlot.wiltedClass && wiltedPlot.wilted === 'true' &&
      wiltedPlot.svgWilted === 'true' && dryPlant !== null && dryPlant.wilted === true &&
      shame.length === 0 && wiltedPlot.label.length > 0,
    wiltedPlot === null ? 'the plot was gone on ' + dry.today :
      'on ' + dry.today + ' the plot reads is-wilted ' + wiltedPlot.wiltedClass +
        ', data-wilted "' + wiltedPlot.wilted + '", svg "' + wiltedPlot.svgWilted +
        '", label "' + wiltedPlot.label + '"' +
        (shame.length === 0 ? '' : ', shame words ' + shame.join(', ')));

  await openPanelFor(page, plantId);
  const recoverNote = await tapWater(page, '');
  const recoveredStage = await panelStage(page);
  await closePanelNow(page);
  const recoveredPlot = await readPlot(page, plantId);
  const recovered = await readFacts(page);
  const recoveredPlant = plantById(recovered, plantId);
  const recoverShame = shameIn(recoverNote);
  check(NAME.wiltRecovers,
    recoveredStage.stage === '2' && recoveredStage.wilted === 'false' &&
      recoveredPlant !== null && recoveredPlant.stage === 2 && recoveredPlant.wilted === false &&
      recoveredPlot !== null && recoveredPlot.wilted === 'false' && recoveredPlot.svgStage === '2' &&
      recoverNote.length > 0 && recoverShame.length === 0,
    'panel came back stage "' + recoveredStage.stage + '" wilted "' + recoveredStage.wilted +
      '", garden plot stage "' + (recoveredPlot === null ? 'gone' : recoveredPlot.svgStage) +
      '" wilted "' + (recoveredPlot === null ? 'gone' : recoveredPlot.wilted) +
      '", note "' + recoverNote + '"' +
      (recoverShame.length === 0 ? '' : ', shame words ' + recoverShame.join(', ')));

  await run.context.close();
}

/* ======================================================================
   Scenario two: the end of a month is not a special case.
   Seeded rather than played, because the arithmetic is the subject and
   replaying the flow would only add ways for this to fail for other reasons.
   ====================================================================== */

async function boundaryRun(browser) {
  const nextDay = shiftDay(BOUNDARY_DAY, 1);
  const twoDaysOn = shiftDay(BOUNDARY_DAY, 2);
  const saved = seededGarden(
    [seededPlant(1, 'kopitiam-cup', { palette: 'warm', bloom: 'one-big', ornament: 'kampung' },
      CUP_PHRASES, BOUNDARY_DAY, [BOUNDARY_DAY])],
    {
      visitCount: 1,
      lastVisitDay: BOUNDARY_DAY,
      prevVisitDay: '',
      lastPlantId: 'gol-1',
      memoryHint: 'the kopitiam cup with my father'
    },
    2
  );

  const run = await scenario(browser, BOUNDARY_DAY, saved);
  const page = run.page;
  await waitForGreeting(page);

  const onTheDay = await readPlot(page, 'gol-1');
  await auditScreen(page, 'garden, ' + BOUNDARY_DAY);

  await setClock(page, nextDay);
  const dayAfter = await readPlot(page, 'gol-1');

  await setClock(page, twoDaysOn);
  const twoDays = await readPlot(page, 'gol-1');
  await auditScreen(page, 'garden, ' + twoDaysOn);

  // The gap arithmetic asked directly, on the same boundary, so a plot that
  // happened to look right cannot cover for daysBetween being wrong.
  const gaps = await page.evaluate(async function (days) {
    const state = await import('/games/garden-of-life/js/state.js');
    return {
      one: state.daysBetween(days.from, days.next),
      two: state.daysBetween(days.from, days.later),
      backwards: state.daysBetween(days.later, days.from)
    };
  }, { from: BOUNDARY_DAY, next: nextDay, later: twoDaysOn });

  check(NAME.boundaryHolds,
    onTheDay !== null && onTheDay.wilted === 'false' &&
      dayAfter !== null && dayAfter.wilted === 'false' &&
      twoDays !== null && twoDays.wilted === 'true' &&
      gaps.one === 1 && gaps.two === 2 && gaps.backwards === 2,
    BOUNDARY_DAY + ' wilted "' + (onTheDay === null ? 'gone' : onTheDay.wilted) + '", ' +
      nextDay + ' wilted "' + (dayAfter === null ? 'gone' : dayAfter.wilted) + '", ' +
      twoDaysOn + ' wilted "' + (twoDays === null ? 'gone' : twoDays.wilted) +
      '", daysBetween ' + gaps.one + ' and ' + gaps.two + ' (' + gaps.backwards + ' reversed)');

  await run.context.close();
}

/* ======================================================================
   Scenario three and four: how long you were away changes what she says.
   ====================================================================== */

function visitorGarden(lastVisitDay) {
  return seededGarden(
    [seededPlant(1, 'kopitiam-cup', { palette: 'warm', bloom: 'one-big', ornament: 'kampung' },
      CUP_PHRASES, shiftDay(VISIT_DAY, -6), [shiftDay(VISIT_DAY, -6)])],
    {
      name: 'Bee Lian',
      honorific: 'Auntie',
      visitCount: 3,
      lastVisitDay: lastVisitDay,
      prevVisitDay: shiftDay(lastVisitDay, -1),
      lastPlantId: 'gol-1',
      memoryHint: 'the kopitiam cup with my father'
    },
    2
  );
}

async function greetingRun(browser, gapDays, expected, other, checkName) {
  const lastVisit = shiftDay(VISIT_DAY, -gapDays);
  const run = await scenario(browser, VISIT_DAY, visitorGarden(lastVisit));
  const page = run.page;

  await waitForGreeting(page);
  const facts = await readFacts(page);
  const slots = slotsFor(facts, facts.lastLabel);
  const wanted = candidatesFor(expected, slots);
  const line = await waitForLine(page, wanted);
  const wrongSet = candidatesFor(other, slots);
  await auditScreen(page, 'garden, ' + gapDays + ' day gap');
  await auditBubble(page, expected + ' greeting');

  /* Membership in the right bank and absence from the wrong one. The second
     half is what makes this a test of the classification rather than of the
     copy: the two events could not both have produced this sentence. */
  check(checkName,
    wanted.indexOf(line) !== -1 && wrongSet.indexOf(line) === -1,
    'away ' + gapDays + ' day(s), last visit ' + lastVisit + ', seen as "' + line +
      '" against ' + wanted.length + ' ' + expected + ' lines' +
      (wrongSet.indexOf(line) === -1 ? '' : ', but it is also a ' + other + ' line') +
      ' :: name "' + slots.name + '", plant "' + slots.plant + '"');

  await run.context.close();
}

/* ======================================================================
   Scenario five and six: the name, given and declined.
   ====================================================================== */

async function nameRun(browser) {
  const run = await scenario(browser, VISIT_DAY, null);
  const page = run.page;

  await waitForGreeting(page);
  await page.waitForFunction(function () {
    const replies = document.getElementById('gardener-replies');
    return replies !== null && replies.childElementCount > 0;
  }, null, { timeout: 5000 });
  await auditBubble(page, 'first visit replies');

  // The first visit is the only greeting whose replies lead into the form.
  await press(page, '#gardener-replies .chip >> nth=0', '#gardener-name-form');
  await page.locator('#gardener-name-form').waitFor({ state: 'visible', timeout: 4000 });
  await auditScreen(page, 'garden, name form open');
  await auditBubble(page, 'name form open');

  await pressLocator(page.locator('#honorific-chips .chip[data-honorific="Auntie"]'));
  const pressed = await page.locator('#honorific-chips .chip[data-honorific="Auntie"]')
    .getAttribute('aria-pressed');
  await page.locator('#gardener-name-input').fill('Bee Lian');
  await pressLocator(page.locator('#gardener-name-save'));
  await page.locator('#gardener-name-form').waitFor({ state: 'hidden', timeout: 4000 });

  const facts = await readFacts(page);
  const slots = slotsFor(facts, facts.lastLabel);
  const wanted = candidatesFor('return_visit', slots);
  const line = await waitForLine(page, wanted);
  await auditBubble(page, 'after the name was saved');

  check(NAME.nameSaved,
    facts.name === 'Bee Lian' && facts.honorific === 'Auntie' && pressed === 'true' &&
      wanted.indexOf(line) !== -1 && line.indexOf('Auntie Bee Lian') !== -1,
    'stored honorific "' + facts.honorific + '" name "' + facts.name + '" (chip pressed ' +
      pressed + '), she answered "' + line + '"' +
      (wanted.indexOf(line) === -1 ? ' which is not a return_visit line' : ''));

  await run.context.close();
}

async function skipRun(browser) {
  const run = await scenario(browser, VISIT_DAY, null);
  const page = run.page;

  await waitForGreeting(page);
  await page.waitForFunction(function () {
    const replies = document.getElementById('gardener-replies');
    return replies !== null && replies.childElementCount > 0;
  }, null, { timeout: 5000 });
  await press(page, '#gardener-replies .chip >> nth=0', '#gardener-name-form');
  await page.locator('#gardener-name-form').waitFor({ state: 'visible', timeout: 4000 });

  const skip = page.locator('#gardener-name-form > .chip');
  const skipLabel = await skip.textContent();
  await pressLocator(skip);
  await page.locator('#gardener-name-form').waitFor({ state: 'hidden', timeout: 4000 });

  // Written copy, not a bank line, so this is the one place wording is the test.
  await waitForLine(page, [SKIP_LINE], 3000);
  const line = await gardenerLine(page);
  const facts = await readFacts(page);
  await auditBubble(page, 'name declined');
  await auditScreen(page, 'garden, name declined');

  check(NAME.nameSkipped,
    String(skipLabel).trim() === SKIP_LABEL && line === SKIP_LINE &&
      facts.name === '' && facts.honorific === '',
    'the way out reads "' + String(skipLabel).trim() + '", she answered "' + line +
      '", stored name "' + facts.name + '" honorific "' + facts.honorific + '"');

  await run.context.close();
}

/* ======================================================================
   Scenario seven: two thirsty plants, and the order she notices them in.

   Two on purpose. Watering the only wilted plant would leave nothing for the
   wilt notice to be about, and then a suite could not tell suppression apart
   from there being nothing to suppress. With a second thirsty plant still
   standing, the watering line is proof she had something else she could have
   said and did not say it.
   ====================================================================== */

async function wiltNoticeRun(browser) {
  const plantedDay = shiftDay(VISIT_DAY, -6);
  const saved = seededGarden(
    [
      seededPlant(1, 'kopitiam-cup', { palette: 'warm', bloom: 'one-big', ornament: 'kampung' },
        CUP_PHRASES, plantedDay, [plantedDay]),
      seededPlant(2, 'setron-tv', { palette: 'happy', bloom: 'cluster', ornament: 'first-flat' },
        TV_PHRASES, plantedDay, [plantedDay])
    ],
    {
      name: 'Bee Lian',
      honorific: 'Auntie',
      visitCount: 4,
      // Today, so this is an ordinary return and the name form stays shut.
      lastVisitDay: VISIT_DAY,
      prevVisitDay: shiftDay(VISIT_DAY, -1),
      lastPlantId: 'gol-2',
      memoryHint: 'the kopitiam cup with my father'
    },
    3
  );

  const run = await scenario(browser, VISIT_DAY, saved);
  const page = run.page;
  await waitForGreeting(page);

  const start = await readFacts(page);
  const bothWilted = start.plants.length === 2 &&
    start.plants.every(function (plant) { return plant.wilted === true; });

  /* ---- water one of them: watering wins the moment ---- */
  await openPanelFor(page, 'gol-1');
  const note = await tapWater(page, '');
  await closePanelNow(page);
  const afterWater = await readFacts(page);
  const stillThirsty = plantById(afterWater, 'gol-2');
  const wateringCandidates = candidatesFor('watering', slotsFor(afterWater, labelOf(afterWater, 'gol-1')));
  const wiltCandidatesThen = candidatesFor('wilt_notice', slotsFor(afterWater, labelOf(afterWater, 'gol-2')));
  const wateringLine = await waitForLine(page, wateringCandidates);
  await auditScreen(page, 'garden, after watering a thirsty plant');
  await auditBubble(page, 'watering beats the wilt notice');

  check(NAME.wateringWins,
    bothWilted && stillThirsty !== null && stillThirsty.wilted === true &&
      wateringCandidates.indexOf(wateringLine) !== -1 &&
      wiltCandidatesThen.indexOf(wateringLine) === -1,
    'both plants started thirsty ' + bothWilted + ', gol-2 still thirsty ' +
      (stillThirsty === null ? 'gone' : stillThirsty.wilted) +
      ', she said "' + wateringLine + '" which is ' +
      (wateringCandidates.indexOf(wateringLine) !== -1 ? 'a watering line' : 'not a watering line') +
      ' and ' + (wiltCandidatesThen.indexOf(wateringLine) === -1 ? 'not' : 'also') +
      ' a wilt_notice line, note "' + note + '"');

  /* ---- close on the thirsty one with nothing poured: now she says it ---- */
  await openPanelFor(page, 'gol-2');
  await closePanelNow(page);
  const afterLook = await readFacts(page);
  const wiltCandidates = candidatesFor('wilt_notice', slotsFor(afterLook, labelOf(afterLook, 'gol-2')));
  const wiltLine = await waitForLine(page, wiltCandidates);
  const commentCandidates = candidatesFor('plant_comment', slotsFor(afterLook, labelOf(afterLook, 'gol-2')));
  await auditBubble(page, 'wilt notice');
  const wiltShame = shameIn(wiltLine);

  check(NAME.wiltNotice,
    wiltCandidates.indexOf(wiltLine) !== -1 && commentCandidates.indexOf(wiltLine) === -1 &&
      wiltShame.length === 0,
    'she said "' + wiltLine + '" against ' + wiltCandidates.length + ' wilt_notice lines' +
      (commentCandidates.indexOf(wiltLine) === -1 ? '' : ', but it is also a plant_comment line') +
      (wiltShame.length === 0 ? '' : ', shame words ' + wiltShame.join(', ')));

  await run.context.close();
}

/* ---- judging what was measured ------------------------------------------ */

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
        wide.map(function (row) { return row.label + ' at ' + row.scrollWidth; }).join(' | ')));
}

function judgeBubble() {
  const faults = [];
  let controls = 0;
  for (let i = 0; i < bubbles.length; i += 1) {
    const row = bubbles[i];
    if (row.lineVisible && !(row.lineFont >= BODY_FLOOR)) {
      faults.push(row.label + ': her line at ' + row.lineFont + 'px');
    }
    const named = [
      { name: 'the name field', boxes: row.input === null ? [] : [row.input] },
      { name: 'the save button', boxes: row.save === null ? [] : [row.save] },
      { name: 'a reply chip', boxes: row.replies },
      { name: 'an honorific chip', boxes: row.honorifics },
      { name: 'the way out chip', boxes: row.skip }
    ];
    for (let k = 0; k < named.length; k += 1) {
      for (let j = 0; j < named[k].boxes.length; j += 1) {
        const box = named[k].boxes[j];
        controls += 1;
        if (box.small < TAP_FLOOR) {
          faults.push(row.label + ': ' + named[k].name + ' at ' + box.w + 'x' + box.h);
        }
      }
    }
  }
  const fonts = bubbles.filter(function (row) { return row.lineVisible; })
    .map(function (row) { return row.lineFont; });
  const smallestFont = fonts.length === 0 ? 0 : Math.min.apply(null, fonts);
  check(NAME.gardenerFloor, bubbles.length > 0 && faults.length === 0,
    bubbles.length === 0 ? 'the bubble was never measured' :
      (faults.length === 0 ?
        bubbles.length + ' bubble states measured, ' + controls + ' controls, smallest line ' +
          smallestFont + 'px against a ' + BODY_FLOOR + 'px floor' :
        faults.join(' | ')));
}

/* ---- the run ------------------------------------------------------------ */

async function run(browser) {
  await growthRun(browser);
  await boundaryRun(browser);
  await greetingRun(browser, 3, 'return_after_absence', 'return_visit', NAME.absenceGreeting);
  await greetingRun(browser, 1, 'return_visit', 'return_after_absence', NAME.returnGreeting);
  await nameRun(browser);
  await skipRun(browser);
  await wiltNoticeRun(browser);
}

async function main() {
  await loadBank();

  // Never race a server that is still on its way out, and never quietly borrow
  // somebody else's. This suite has to own the port it tests.
  const portFree = await waitForFreePort(5000);
  if (!portFree) {
    process.stdout.write('Garden of Life day cycle QA cannot start: port ' + PORT +
      ' is still held after 5s, so this run would be driving a server it does not ' +
      'own and the results would be worthless. Find the holder with ' +
      '"lsof -nP -iTCP:' + PORT + ' -sTCP:LISTEN" and stop it, or set GOL_DAYS_PORT.\n');
    process.exit(1);
  }

  /* Keep the server's pipes and read them. With the output thrown away, a server
     that dies mid run leaves nothing behind but baffling connection refused
     failures and the reason for all of them is gone. */
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
  judgeBubble();

  const serverOutput = serverLog.join('').trim().split('\n').join(' / ');
  check(NAME.serverUp, serverDied === '',
    serverDied === '' ? 'it said "' + serverOutput + '"' :
      serverDied + ' :: ' + (serverOutput || 'it printed nothing at all'));

  check(NAME.tapsLand, retriedTaps.length <= 2,
    retriedTaps.length === 0 ? 'no retries in the whole run' :
      retriedTaps.length + ' retries :: ' + retriedTaps.join(' | '));

  const absenceNote = narratedAbsences.length === 0 ? '' :
    ' (' + narratedAbsences.length + ' browser 404 narrations for documented absences)';
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
  process.stdout.write('\nGarden of Life day cycle QA\n');
  process.stdout.write('---------------------------\n');
  for (let i = 0; i < rows.length; i += 1) {
    if (!rows[i].pass) {
      failures += 1;
    }
    process.stdout.write((rows[i].pass ? 'PASS  ' : 'FAIL  ') + rows[i].name +
      (rows[i].detail ? '  ::  ' + rows[i].detail : '') + '\n');
  }
  process.stdout.write('---------------------------\n');
  process.stdout.write((failures === 0 ? 'ALL PASS' : 'FAILURES: ' + failures) +
    '  (' + rows.length + ' checks, ' + screens.length + ' screens and ' +
    bubbles.length + ' bubble states measured)\n');

  if (crash !== null) {
    process.stdout.write('\nthe run stopped early: ' + String(crash.stack || crash) + '\n');
  }
  process.exit(failures === 0 ? 0 : 1);
}

main();
