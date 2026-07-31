#!/usr/bin/env node
/*
  Garden of Life economy QA. The money suite: earning it, spending it, the things
  it buys, and the arc from a seed packet to a dish card.

  Third sibling to qa/core.mjs and qa/days.mjs, same discipline throughout: own
  the port or refuse to run, keep the server's output, wait the stale tap guard
  out before every scripted tap, explicit element state waits and never
  networkidle, and a named check list that prints in full even when the run stops
  early.

  Three things this suite does that the other two do not.

  It mirrors the puzzle board. A face down tile carries no data-face, so the only
  honest way to solve a round on purpose is to ask the game's own roundSeed and
  buildDeck what it dealt, then check every tile turned up is the face the mirror
  predicted. A wrong mirror therefore fails loudly on the first tap instead of
  quietly tapping the wrong squares. The round counter starts at zero at boot,
  not when the section opens, so the calendar is pinned before the first
  navigation and the counter is tracked from the page load.

  It never asserts a payout it did not watch happen. Coins are read from state
  and from both pills, before and after, and the claim is the difference.

  It reads her face as well as her words. A harvest with nothing behind it and a
  harvest that finishes a dish are different moments, and the picture has to
  agree with the sentence, so both are checked against the bank and the art
  filename together.
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
const MEALS_PATH = path.join(gameRoot, 'content', 'meal-cards.json');
const TRAITS_PATH = path.join(gameRoot, 'content', 'plant-traits.json');

// 4193 per the port registry in the stretch plan.
const PORT = Number(process.env.GOL_ECON_PORT) || 4193;
const ORIGIN = 'http://localhost:' + PORT;
const GAME_URL = ORIGIN + '/garden-of-life';
const STORAGE_KEY = 'ctrlai:garden-of-life';
const QA_CLOCK_KEY = 'ctrlai:garden-of-life:qa-clock';
const VIEWPORT = { width: 390, height: 844 };

const GUARD_WAIT = 400;
const TAP_FLOOR = 64;
const TILE_FLOOR = 80;

// The binding numbers from the stretch plan. Written here so a silent change to
// any of them fails this suite rather than passing it.
const PAYOUT = 6;
const PRICES = { common: 4, uncommon: 8, rare: 12 };
const RARE_RUNGS = [3, 7, 14];
const PAIRS = 8;

/* A refusal is a refusal, not a telling off. Nothing on the shop screen may
   suggest the player did something wrong by being short of coins. */
const SHAME_WORDS = ['cannot afford', 'too poor', 'denied', 'not allowed', 'sorry',
  'failed', 'invalid', 'error', 'greedy', 'wrong'];

const TOLERATED_ABSENCE = [
  /\/content\/[^?]*\.json$/,
  /\/art\/[^?]*\.(png|svg)$/,
  /\/icons\//
];

const EARN_DAY = '2026-06-10';
const STREAK_DAY = '2026-06-20';
const CROP_DAY = '2026-07-05';
const MIGRATE_DAY = '2026-07-20';

// The cheapest complete dish on the board: one common the free seed can cover
// and one uncommon a single purchase covers.
const DISH = { id: 'sambal-kangkung', common: 'kangkung', uncommon: 'chilli' };

const NAME = {
  banksReadable: 'the gardener, dish and crop files on disk parse with what this suite needs',
  migration: 'a v1 save migrates to v2 with everything kept and the economy defaulted',
  boardMirrors: 'the board deals exactly the deck its seed says it deals',
  roundPays: 'a solved round pays exactly 6 coins',
  twoRoundsSame: 'a second round pays the same as the first, no variance anywhere',
  prices: 'every seed card shows its tier price, 4 and 8 and 12',
  buyLeavesTwo: 'buying a 4 coin common out of 6 leaves 2',
  refusalKind: 'a purchase you cannot afford is refused kindly and takes nothing',
  freeSeedOnce: 'the free seed is claimable once a day and the guard holds after that',
  freeSeedTomorrow: 'the next day the free seed is there to take again',
  streakPauses: 'a missed day pauses the streak instead of resetting it',
  streakRungs: 'a three day streak opens the rare shelf',
  lockKind: 'a locked seed card keeps its price and says kindly when it opens',
  placementBanner: 'plant now asks where it should go, by name, with a way out',
  placementCancel: 'cancelling keeps the seed and takes the banner down',
  placementViewSwitch: 'leaving the garden clears the placement mode',
  placementPlants: 'the next empty plot tap plants the seed and clears the mode',
  cropGrows: 'a crop waters to stage 2 across two days',
  harvestBasket: 'picking a ripe crop fills the basket and frees the plot',
  harvestFace: 'a harvest with no dish behind it gets the harvest bank and her happy face',
  mealUnlock: 'the last crop of a set unlocks the dish and consumes exactly that set',
  mealFace: 'a dish unlocking gets the meal_unlock bank and her celebrate face',
  mealReplies: 'the reply chips under a line are the ones that belong to that line',
  mealCardPermanent: 'the cooked card is on the meals screen and survives a reload',
  lockedPreviews: 'every dish not yet cooked is previewed rather than hidden',
  tileFloor: 'every puzzle tile is at least 80 by 80',
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
const tiles = [];
const mirrorFaults = [];
let bank = Object.create(null);
let dishes = [];
let crops = {};

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

const MS_PER_DAY = 86400000;

function shiftDay(iso, days) {
  const at = new Date(Date.parse(iso + 'T00:00:00Z') + days * MS_PER_DAY);
  const pad = function (value) { return value < 10 ? '0' + String(value) : String(value); };
  return String(at.getUTCFullYear()) + '-' + pad(at.getUTCMonth() + 1) + '-' + pad(at.getUTCDate());
}

/* ---- the banks ----------------------------------------------------------
   fillSlots and tidy are reproduced from shared/ai.js rather than imported,
   because neither is exported. Copied line for line, and this comment is the
   coupling: if the seam's slot syntax or its tidy rules change, this pair
   changes with them or every membership check here starts lying. */

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

// The same filter gardener.js applies before registering, so the candidate list
// and the array the reply chips are indexed out of stay in step.
function entriesFor(event) {
  const raw = bank[event];
  if (!Array.isArray(raw)) {
    return [];
  }
  const out = [];
  for (let i = 0; i < raw.length; i += 1) {
    const line = raw[i];
    if (line !== null && typeof line === 'object' && typeof line.text === 'string' &&
      line.text.trim() !== '') {
      const replies = [];
      const rawReplies = Array.isArray(line.replies) ? line.replies : [];
      for (let j = 0; j < rawReplies.length && replies.length < 3; j += 1) {
        const label = typeof rawReplies[j] === 'string' ? rawReplies[j].trim() : '';
        if (label !== '') {
          replies.push(label);
        }
      }
      out.push({ text: line.text, replies: replies });
    }
  }
  return out;
}

function candidatesFor(event, context) {
  return entriesFor(event).map(function (entry) {
    return fillTemplate(entry.text, context);
  });
}

// The chips that belong to the line on screen, found the way gardener.js finds
// them: by the index of the template that produced it. A line with no replies of
// its own gets the one written continue chip.
function repliesBehind(event, line, context) {
  const filled = candidatesFor(event, context);
  const index = filled.indexOf(line);
  if (index === -1) {
    return null;
  }
  const entry = entriesFor(event)[index];
  return entry.replies.length > 0 ? entry.replies : ['Okay lah'];
}

async function loadBanks() {
  const lines = JSON.parse(await readFile(BANK_PATH, 'utf8'));
  bank = lines !== null && typeof lines === 'object' && lines.events !== null &&
    typeof lines.events === 'object' ? lines.events : Object.create(null);
  const meals = JSON.parse(await readFile(MEALS_PATH, 'utf8'));
  dishes = Array.isArray(meals.dishes) ? meals.dishes : [];
  const traits = JSON.parse(await readFile(TRAITS_PATH, 'utf8'));
  crops = traits.crops !== null && typeof traits.crops === 'object' ? traits.crops : {};

  const wantedEvents = ['harvest', 'meal_unlock'];
  const thin = wantedEvents.filter(function (event) { return entriesFor(event).length === 0; });
  const dish = dishes.filter(function (row) { return row.id === DISH.id; })[0];
  const rares = Object.keys(crops).filter(function (id) {
    return crops[id] && crops[id].price_tier === 'rare';
  });
  const dishOk = dish !== undefined && Array.isArray(dish.crops) &&
    dish.crops.length === 2 && dish.crops.indexOf(DISH.common) !== -1 &&
    dish.crops.indexOf(DISH.uncommon) !== -1;

  check(NAME.banksReadable,
    thin.length === 0 && dishOk && rares.length >= 1,
    'harvest ' + entriesFor('harvest').length + ' lines, meal_unlock ' +
      entriesFor('meal_unlock').length + ' lines, ' + dishes.length + ' dishes, ' +
      Object.keys(crops).length + ' crops, ' + rares.length + ' rare (' + rares.join(', ') + ')' +
      (dishOk ? '' : ', but ' + DISH.id + ' is not the two crop dish this suite plans around') +
      (thin.length === 0 ? '' : ', missing lines for ' + thin.join(', ')));
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
  /* Chromium narrates every 404 it meets in the console itself, so art that has
     not landed would fail the zero errors contract for doing exactly what the
     absence contract asks. Only the browser's own narration of a tolerated url
     is let through, and it is counted out loud. */
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

/* The app's own books, read through the very modules main.js is running on. ES
   module instances are per document, so this is the live state and not a second
   copy with its own idea of the world. Read only. */
function readBooks(page) {
  return page.evaluate(async function () {
    const state = await import('/games/garden-of-life/js/state.js');
    const doc = state.getState();
    return {
      coins: state.getCoins(),
      streak: { days: state.getStreak().days, lastCountedDay: state.getStreak().lastCountedDay },
      seeds: JSON.parse(JSON.stringify(state.getSeeds())),
      basket: JSON.parse(JSON.stringify(state.getBasket())),
      meals: state.getUnlockedMeals().slice(),
      canClaimFree: state.canClaimFreeSeed(),
      today: state.todayISO(),
      version: doc.version,
      plants: state.getPlants().map(function (plant) {
        return {
          id: plant.id,
          kind: plant.kind,
          cropId: plant.cropId || '',
          stage: state.plantStage(plant),
          wateredDays: plant.wateredDays.slice()
        };
      })
    };
  });
}

function readPills(page) {
  return page.evaluate(function () {
    const read = function (id) {
      const node = document.getElementById(id);
      return node === null ? '' : node.textContent.trim();
    };
    return { garden: read('garden-coins'), puzzle: read('puzzle-coins'), shop: read('shop-coins') };
  });
}

function coinsIn(text) {
  const found = String(text).match(/(-?\d+)/);
  return found === null ? null : Number(found[1]);
}

function gardenerLine(page) {
  return page.evaluate(function () {
    const node = document.getElementById('gardener-line');
    return node === null ? '' : node.textContent.trim();
  });
}

function gardenerFace(page) {
  return page.evaluate(function () {
    const art = document.getElementById('gardener-art');
    return art === null ? '' : String(art.getAttribute('src') || '');
  });
}

function gardenerReplies(page) {
  return page.evaluate(function () {
    return Array.from(document.querySelectorAll('#gardener-replies .chip')).map(function (chip) {
      return chip.textContent.trim();
    });
  });
}

async function waitForLine(page, candidates, timeout) {
  try {
    await page.waitForFunction(function (list) {
      const node = document.getElementById('gardener-line');
      return node !== null && list.indexOf(node.textContent.trim()) !== -1;
    }, candidates, { timeout: timeout === undefined ? 5000 : timeout });
  } catch (err) {
    // The membership check reports the truth, with the sentence that was there.
  }
  return gardenerLine(page);
}

function shameIn(text) {
  const lowered = String(text).toLowerCase();
  return SHAME_WORDS.filter(function (word) { return lowered.indexOf(word) !== -1; });
}

function readShopCards(page) {
  return page.evaluate(function () {
    return Array.from(document.querySelectorAll('#shop-grid .shop-card')).map(function (card) {
      const pick = function (selector) { return card.querySelector(selector); };
      const buy = pick('.shop-buy');
      const plant = pick('.shop-plant');
      const note = pick('.shop-note');
      const lock = pick('.shop-lock');
      return {
        cropId: card.dataset.cropId || '',
        tier: card.dataset.tier || '',
        locked: card.dataset.locked || '',
        label: card.getAttribute('aria-label') || '',
        hasBuy: buy !== null,
        plantHidden: plant === null ? true : plant.hidden,
        note: note === null ? '' : note.textContent.trim(),
        lock: lock === null ? '' : lock.textContent.trim()
      };
    });
  });
}

function cardFor(cards, cropId) {
  for (let i = 0; i < cards.length; i += 1) {
    if (cards[i].cropId === cropId) {
      return cards[i];
    }
  }
  return null;
}

// The price a card advertises, taken from its own aria-label so a locked card
// with no buy button is read the same way as one with.
function advertisedPrice(card) {
  if (card === null) {
    return null;
  }
  const found = String(card.label).match(/(\d+)\s*coin/);
  return found === null ? null : Number(found[1]);
}

function readMealCards(page) {
  return page.evaluate(function () {
    return Array.from(document.querySelectorAll('#meals-grid .meal-card')).map(function (card) {
      return {
        dishId: card.dataset.dishId || '',
        locked: card.dataset.locked || '',
        text: card.textContent.replace(/\s+/g, ' ').trim()
      };
    });
  });
}

function readBanner(page) {
  return page.evaluate(function () {
    const banner = document.getElementById('placement-banner');
    const line = document.getElementById('placement-line');
    return {
      shown: banner !== null && banner.hidden === false,
      line: line === null ? '' : line.textContent.trim()
    };
  });
}

/* ---- the floor ---------------------------------------------------------- */

async function auditScreen(page, label) {
  const row = await page.evaluate(function (floors) {
    const small = [];
    let counted = 0;
    const nodes = Array.from(document.querySelectorAll('.btn, .chip, .plot'));
    for (let i = 0; i < nodes.length; i += 1) {
      const box = nodes[i].getBoundingClientRect();
      if (box.width <= 0 || box.height <= 0) {
        continue;
      }
      counted += 1;
      if (Math.min(box.width, box.height) < floors.tap) {
        const node = nodes[i];
        const named = node.id ? '#' + node.id : (node.getAttribute('class') || node.tagName);
        small.push(named + ' at ' + Math.round(box.width) + 'x' + Math.round(box.height));
      }
    }
    // Tiles are their own floor: a memory grid that fits the phone is no use if
    // the squares are too small to hit.
    const tileBoxes = [];
    const tileNodes = Array.from(document.querySelectorAll('.puzzle-tile'));
    for (let i = 0; i < tileNodes.length; i += 1) {
      const box = tileNodes[i].getBoundingClientRect();
      if (box.width > 0 && box.height > 0) {
        tileBoxes.push({ w: Math.round(box.width), h: Math.round(box.height) });
      }
    }
    return {
      counted: counted,
      small: small,
      tiles: tileBoxes,
      scrollWidth: document.scrollingElement.scrollWidth
    };
  }, { tap: TAP_FLOOR });
  screens.push({ label: label, counted: row.counted, small: row.small, scrollWidth: row.scrollWidth });
  if (row.tiles.length > 0) {
    tiles.push({ label: label, boxes: row.tiles });
  }
  return row;
}

/* ---- contexts ----------------------------------------------------------- */

/* One context per scenario, with the clock and any seeded save written before
   the first navigation, because the first load is the one that classifies the
   visit and deals the first puzzle board.

   Written only when absent, on purpose. This same script runs again on every
   reload in the context, and an unconditional write would restore the seed over
   the top of whatever the player just did. */
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
      // Storage refusing to write is the game's problem to survive. The checks
      // below say what the page actually did.
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

async function settle(page) {
  await page.waitForFunction(function () {
    const plots = document.getElementById('plots');
    return plots !== null && plots.childElementCount > 0;
  }, null, { timeout: 8000 });
}

async function setClock(page, day) {
  await page.evaluate(function (payload) {
    window.localStorage.setItem(payload.key, payload.day);
  }, { key: QA_CLOCK_KEY, day: day });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await settle(page);
}

async function reload(page) {
  await page.reload({ waitUntil: 'domcontentloaded' });
  await settle(page);
}

function economySave(fields) {
  return Object.assign({
    version: 2,
    player: {
      name: 'Bee Lian',
      honorific: 'Auntie',
      visitCount: 2,
      lastVisitDay: '',
      prevVisitDay: '',
      lastPlantId: '',
      memoryHint: ''
    },
    nextPlantId: 1,
    plants: [],
    coins: 0,
    streak: { days: 1, lastCountedDay: '' },
    seeds: {},
    basket: {},
    meals: { unlocked: [] },
    freeSeed: { lastClaimDay: '' }
  }, fields || {});
}

/* ---- driving the puzzle -------------------------------------------------
   A face down tile carries no data-face, so the board cannot be read and has to
   be mirrored. roundSeed and buildDeck are the game's own, imported into the
   page, so the mirror is the same code the board was dealt from rather than a
   reimplementation that could drift. Every tile turned up is then checked
   against what the mirror said it would be, which turns a wrong mirror into a
   loud failure on the first tap instead of a run of nonsense taps. */

async function dealtDeck(page, day, counter) {
  return page.evaluate(async function (payload) {
    const puzzle = await import('/games/garden-of-life/js/puzzle.js');
    return puzzle.buildDeck(puzzle.roundSeed(payload.day, payload.counter));
  }, { day: day, counter: counter });
}

function pairsFromDeck(deck) {
  const firstSeen = {};
  const pairs = [];
  for (let i = 0; i < deck.length; i += 1) {
    if (firstSeen[deck[i]] === undefined) {
      firstSeen[deck[i]] = i;
    } else {
      pairs.push([firstSeen[deck[i]], i]);
    }
  }
  return pairs;
}

function readTile(page, index) {
  return page.evaluate(function (want) {
    const node = document.querySelector('#puzzle-board [data-index="' + want + '"]');
    return node === null ? null : {
      state: node.dataset.state || '',
      face: node.dataset.face === undefined ? '' : node.dataset.face
    };
  }, String(index));
}

async function tapTile(page, index) {
  await pressLocator(page.locator('#puzzle-board [data-index="' + index + '"]'));
}

async function solveRound(page, day, counter, label) {
  const deck = await dealtDeck(page, day, counter);
  const pairs = pairsFromDeck(deck);
  if (pairs.length !== PAIRS) {
    mirrorFaults.push(label + ': the deck made ' + pairs.length + ' pairs, not ' + PAIRS);
    return false;
  }
  for (let i = 0; i < pairs.length; i += 1) {
    const first = pairs[i][0];
    const second = pairs[i][1];
    await tapTile(page, first);
    const up = await readTile(page, first);
    if (up === null || up.state !== 'up' || up.face !== deck[first]) {
      mirrorFaults.push(label + ': tile ' + first + ' turned up as "' +
        (up === null ? 'missing' : up.face + '" in state "' + up.state) +
        '", the seed said "' + deck[first] + '"');
      return false;
    }
    await tapTile(page, second);
    const settled = await readTile(page, second);
    if (settled === null || settled.state !== 'matched') {
      mirrorFaults.push(label + ': tile ' + second + ' did not settle, it reads "' +
        (settled === null ? 'missing' : settled.state) + '"');
      return false;
    }
    if (i === 0) {
      await auditScreen(page, label + ', mid round');
    }
  }
  // The round is over when she offers another one, which is also the only way
  // to deal the next board, so this wait is load bearing and not decoration.
  await page.locator('#puzzle-again').waitFor({ state: 'visible', timeout: 4000 });
  return true;
}

/* ---- the panel ---------------------------------------------------------- */

async function openPanelFor(page, plantId) {
  await press(page, '.plot-filled[data-plant-id="' + plantId + '"]', '#view-plant');
  await page.locator('#view-plant').waitFor({ state: 'visible', timeout: 4000 });
}

async function tapWater(page, previous) {
  await pressLocator(page.locator('#plant-water'));
  try {
    await page.waitForFunction(function (was) {
      const node = document.getElementById('plant-water-note');
      const text = node === null ? '' : node.textContent.trim();
      return text.length > 0 && text !== was;
    }, previous, { timeout: 2500 });
  } catch (err) {
    // The caller reads the note either way.
  }
  return page.evaluate(function () {
    const node = document.getElementById('plant-water-note');
    return node === null ? '' : node.textContent.trim();
  });
}

async function closePanelNow(page) {
  await press(page, '#plant-close', '!#view-plant');
  await page.locator('#view-plant').waitFor({ state: 'hidden', timeout: 4000 });
}

async function waterOnce(page, plantId) {
  await openPanelFor(page, plantId);
  const note = await tapWater(page, '');
  await closePanelNow(page);
  return note;
}

/* ---- navigation --------------------------------------------------------- */

async function openSection(page, buttonId, viewId) {
  await press(page, '#' + buttonId, '#' + viewId);
  await page.locator('#' + viewId).waitFor({ state: 'visible', timeout: 4000 });
}

async function backToGarden(page, buttonId) {
  await press(page, '#' + buttonId, '#view-garden');
  await page.locator('#view-garden').waitFor({ state: 'visible', timeout: 4000 });
}

/* ======================================================================
   Scenario one: earn it, then spend it.
   ====================================================================== */

async function earnAndSpendRun(browser) {
  const run = await scenario(browser, EARN_DAY, null);
  const page = run.page;
  const opening = await readBooks(page);

  await openSection(page, 'open-puzzle', 'view-puzzle');
  await auditScreen(page, 'puzzle, fresh board');
  const solvedFirst = await solveRound(page, EARN_DAY, 0, 'round one');
  const afterFirst = await readBooks(page);
  const pillsFirst = await readPills(page);
  await auditScreen(page, 'puzzle, round complete');

  check(NAME.roundPays,
    solvedFirst && opening.coins === 0 && afterFirst.coins === PAYOUT &&
      coinsIn(pillsFirst.puzzle) === PAYOUT && coinsIn(pillsFirst.garden) === PAYOUT,
    'started with ' + opening.coins + ', finished a round of ' + PAIRS + ' pairs with ' +
      afterFirst.coins + ', pills read "' + pillsFirst.puzzle + '" and "' + pillsFirst.garden + '"' +
      (solvedFirst ? '' : ', and the round was never solved'));

  await backToGarden(page, 'puzzle-back');
  await openSection(page, 'open-shop', 'view-shop');
  await auditScreen(page, 'shop, six coins');

  const cards = await readShopCards(page);
  const byTier = { common: [], uncommon: [], rare: [] };
  for (let i = 0; i < cards.length; i += 1) {
    const tier = cards[i].tier;
    if (byTier[tier] !== undefined) {
      byTier[tier].push(advertisedPrice(cards[i]));
    }
  }
  const priceFaults = [];
  const tierNames = Object.keys(byTier);
  for (let i = 0; i < tierNames.length; i += 1) {
    const tier = tierNames[i];
    const wanted = PRICES[tier];
    for (let j = 0; j < byTier[tier].length; j += 1) {
      if (byTier[tier][j] !== wanted) {
        priceFaults.push(tier + ' card advertising ' + byTier[tier][j] + ' not ' + wanted);
      }
    }
  }
  check(NAME.prices,
    cards.length === Object.keys(crops).length && priceFaults.length === 0 &&
      byTier.common.length > 0 && byTier.uncommon.length > 0 && byTier.rare.length > 0,
    cards.length + ' cards, ' + byTier.common.length + ' common at ' + PRICES.common + ', ' +
      byTier.uncommon.length + ' uncommon at ' + PRICES.uncommon + ', ' + byTier.rare.length +
      ' rare at ' + PRICES.rare +
      (priceFaults.length === 0 ? '' : ' :: ' + priceFaults.join(', ')));

  // A common, bought with one round's pay. The guardrail from the plan is that
  // this is always possible, so the balance afterwards is the guardrail.
  const commonId = cards.filter(function (card) {
    return card.tier === 'common' && card.hasBuy;
  })[0];
  const boughtId = commonId === undefined ? '' : commonId.cropId;
  await pressLocator(page.locator('.shop-card[data-crop-id="' + boughtId + '"] .shop-buy'));
  await page.waitForFunction(function (id) {
    const card = document.querySelector('.shop-card[data-crop-id="' + id + '"]');
    const note = card === null ? null : card.querySelector('.shop-note');
    return note !== null && note.textContent.trim().length > 0;
  }, boughtId, { timeout: 3000 });
  const afterBuy = await readBooks(page);
  const pillsAfterBuy = await readPills(page);

  check(NAME.buyLeavesTwo,
    afterBuy.coins === PAYOUT - PRICES.common && afterBuy.seeds[boughtId] === 1 &&
      coinsIn(pillsAfterBuy.shop) === PAYOUT - PRICES.common,
    'bought ' + boughtId + ' for ' + PRICES.common + ' out of ' + PAYOUT + ', left with ' +
      afterBuy.coins + ' and ' + (afterBuy.seeds[boughtId] || 0) + ' packet, shop pill "' +
      pillsAfterBuy.shop + '"');

  /* ---- the refusal ---- */
  const uncommon = cards.filter(function (card) {
    return card.tier === 'uncommon' && card.hasBuy;
  })[0];
  const shortId = uncommon === undefined ? '' : uncommon.cropId;
  await pressLocator(page.locator('.shop-card[data-crop-id="' + shortId + '"] .shop-buy'));
  await page.waitForFunction(function (id) {
    const card = document.querySelector('.shop-card[data-crop-id="' + id + '"]');
    const note = card === null ? null : card.querySelector('.shop-note');
    return note !== null && note.textContent.trim().length > 0;
  }, shortId, { timeout: 3000 });
  const refusedCards = await readShopCards(page);
  const refused = cardFor(refusedCards, shortId);
  const afterRefusal = await readBooks(page);
  const refusalShame = refused === null ? [] : shameIn(refused.note);

  check(NAME.refusalKind,
    refused !== null && refused.note.length > 0 && refusalShame.length === 0 &&
      afterRefusal.coins === afterBuy.coins && afterRefusal.seeds[shortId] === undefined,
    'tried ' + shortId + ' at ' + PRICES.uncommon + ' holding ' + afterBuy.coins +
      ', it said "' + (refused === null ? 'nothing at all' : refused.note) +
      '", coins now ' + afterRefusal.coins + ', packets ' + JSON.stringify(afterRefusal.seeds) +
      (refusalShame.length === 0 ? '' : ', shame words ' + refusalShame.join(', ')));

  /* ---- a second round pays the same ---- */
  await backToGarden(page, 'shop-back');
  await openSection(page, 'open-puzzle', 'view-puzzle');
  await press(page, '#puzzle-again', '#puzzle-board');
  const solvedSecond = await solveRound(page, EARN_DAY, 1, 'round two');
  const afterSecond = await readBooks(page);

  check(NAME.twoRoundsSame,
    solvedSecond && (afterSecond.coins - afterRefusal.coins) === PAYOUT &&
      (afterFirst.coins - opening.coins) === PAYOUT,
    'first round paid ' + (afterFirst.coins - opening.coins) + ', second round paid ' +
      (afterSecond.coins - afterRefusal.coins) + ', balance now ' + afterSecond.coins);

  check(NAME.boardMirrors, mirrorFaults.length === 0,
    mirrorFaults.length === 0 ?
      'two boards dealt and solved, every tile matched the seed' : mirrorFaults.join(' | '));

  await run.context.close();
}

/* ======================================================================
   Scenario two: showing up, and the shelf that opens because you did.
   The gap is the point. A streak that survives a missed day is the whole
   forgiving reading, so the run misses one on purpose.
   ====================================================================== */

async function streakRun(browser) {
  const dayOne = STREAK_DAY;
  const dayTwo = shiftDay(STREAK_DAY, 1);
  // Deliberately not day three. The day between is the one nobody came.
  const dayFour = shiftDay(STREAK_DAY, 3);

  const run = await scenario(browser, dayOne, null);
  const page = run.page;

  const first = await readBooks(page);
  await openSection(page, 'open-shop', 'view-shop');
  await auditScreen(page, 'shop, streak one');
  const lockedCards = await readShopCards(page);
  const rare = lockedCards.filter(function (card) { return card.tier === 'rare'; })[0];
  const rarePrice = advertisedPrice(rare === undefined ? null : rare);
  await backToGarden(page, 'shop-back');

  await setClock(page, dayTwo);
  const second = await readBooks(page);

  await setClock(page, dayFour);
  const third = await readBooks(page);
  await openSection(page, 'open-shop', 'view-shop');
  await auditScreen(page, 'shop, streak three');
  const openCards = await readShopCards(page);
  const rareOpen = openCards.filter(function (card) { return card.tier === 'rare'; })[0];

  check(NAME.streakPauses,
    first.streak.days === 1 && second.streak.days === 2 && third.streak.days === 3 &&
      third.streak.lastCountedDay === dayFour,
    'visited ' + dayOne + ', ' + dayTwo + ' and ' + dayFour + ' (nothing on ' +
      shiftDay(STREAK_DAY, 2) + '), streak read ' + first.streak.days + ', ' +
      second.streak.days + ' then ' + third.streak.days);

  check(NAME.streakRungs,
    rare !== undefined && rare.locked === 'true' && rareOpen !== undefined &&
      rareOpen.locked === 'false' && rareOpen.hasBuy && RARE_RUNGS[0] === 3,
    rare === undefined ? 'no rare card on the shelf at all' :
      rare.cropId + ' was locked at streak ' + first.streak.days + ' and reads locked "' +
        (rareOpen === undefined ? 'gone' : rareOpen.locked) + '" at streak ' + third.streak.days +
        ' (rungs ' + RARE_RUNGS.join(', ') + ')');

  const lockShame = rare === undefined ? [] : shameIn(rare.lock);
  check(NAME.lockKind,
    rare !== undefined && rare.lock.length > 0 && rarePrice === PRICES.rare &&
      lockShame.length === 0 && rare.lock.indexOf(String(RARE_RUNGS[0])) !== -1,
    rare === undefined ? 'no rare card to read' :
      'it says "' + rare.lock + '" and still advertises ' + rarePrice + ' coins' +
        (lockShame.length === 0 ? '' : ', shame words ' + lockShame.join(', ')));

  await run.context.close();
}

/* ======================================================================
   Scenario three: one free seed a day.
   The guard is asked of state directly, because once the seed is taken the
   chips are gone and there is no control left to tap at it.
   ====================================================================== */

async function freeSeedRun(browser) {
  const today = CROP_DAY;
  const tomorrow = shiftDay(CROP_DAY, 1);
  const run = await scenario(browser, today, null);
  const page = run.page;

  await openSection(page, 'open-shop', 'view-shop');
  await page.locator('#shop-free').waitFor({ state: 'visible', timeout: 4000 });
  await auditScreen(page, 'shop, free seed waiting');

  const picks = page.locator('#shop-free .shop-free-pick');
  const pickCount = await picks.count();
  const commons = Object.keys(crops).filter(function (id) {
    return crops[id] && crops[id].price_tier === 'common';
  });

  await pressLocator(page.locator('#shop-free .shop-free-pick[data-crop-id="' + DISH.common + '"]'));
  await page.waitForFunction(function () {
    const picksRow = document.querySelector('#shop-free .shop-free-picks');
    return picksRow !== null && picksRow.hidden === true;
  }, null, { timeout: 3000 });
  const claimed = await readBooks(page);

  /* The control is gone by design, so the guard is asked of the rule rather than
     of a button. A second claim must refuse and must not quietly grant a seed. */
  const guard = await page.evaluate(async function (cropId) {
    const state = await import('/games/garden-of-life/js/state.js');
    const before = JSON.parse(JSON.stringify(state.getSeeds()));
    const answer = state.claimFreeSeed(cropId);
    return {
      answer: answer,
      before: before,
      after: JSON.parse(JSON.stringify(state.getSeeds())),
      canClaim: state.canClaimFreeSeed()
    };
  }, DISH.common);

  await reload(page);
  await openSection(page, 'open-shop', 'view-shop');
  const stillTaken = await page.evaluate(function () {
    const picksRow = document.querySelector('#shop-free .shop-free-picks');
    return picksRow === null ? 'missing' : String(picksRow.hidden);
  });

  check(NAME.freeSeedOnce,
    pickCount === commons.length && pickCount > 0 && claimed.seeds[DISH.common] === 1 &&
      claimed.canClaimFree === false && guard.answer === false &&
      JSON.stringify(guard.before) === JSON.stringify(guard.after) &&
      guard.canClaim === false && stillTaken === 'true',
    pickCount + ' free picks for ' + commons.length + ' commons, took ' + DISH.common +
      ' and hold ' + (claimed.seeds[DISH.common] || 0) +
      ', a second claim answered ' + guard.answer + ' with packets unchanged ' +
      JSON.stringify(guard.after) + ', after a reload the picks are hidden ' + stillTaken);

  await setClock(page, tomorrow);
  await openSection(page, 'open-shop', 'view-shop');
  const tomorrowState = await page.evaluate(function () {
    const picksRow = document.querySelector('#shop-free .shop-free-picks');
    return picksRow === null ? 'missing' : String(picksRow.hidden);
  });
  const tomorrowBooks = await readBooks(page);
  check(NAME.freeSeedTomorrow,
    tomorrowState === 'false' && tomorrowBooks.canClaimFree === true,
    'on ' + tomorrow + ' the picks are hidden ' + tomorrowState + ' and state says claimable ' +
      tomorrowBooks.canClaimFree);

  await run.context.close();
}

/* ======================================================================
   Scenario four: a seed, a plot, two days, a basket, and a dish.
   Coins are seeded rather than played for. Earning them is scenario one's
   job, and grinding two more rounds here would only add ways for the part
   this scenario is actually about to fail for unrelated reasons.
   ====================================================================== */

async function cropToDishRun(browser) {
  const dayOne = CROP_DAY;
  const dayTwo = shiftDay(CROP_DAY, 1);
  const run = await scenario(browser, dayOne, economySave({ coins: 20 }));
  const page = run.page;

  /* ---- take the free common, and refuse the plot it is offered ---- */
  await openSection(page, 'open-shop', 'view-shop');
  await pressLocator(page.locator('#shop-free .shop-free-pick[data-crop-id="' + DISH.common + '"]'));
  await page.locator('#shop-free .shop-free-plant').waitFor({ state: 'visible', timeout: 3000 });
  await press(page, '#shop-free .shop-free-plant', '#view-garden');
  await page.locator('#view-garden').waitFor({ state: 'visible', timeout: 4000 });

  const banner = await readBanner(page);
  await auditScreen(page, 'garden, placing a seed');
  const commonLabel = crops[DISH.common] && crops[DISH.common].label ? crops[DISH.common].label : DISH.common;
  check(NAME.placementBanner,
    banner.shown && banner.line.indexOf(commonLabel) !== -1 &&
      await page.locator('#placement-cancel').isVisible(),
    'the banner says "' + banner.line + '" and offers a way out');

  await press(page, '#placement-cancel', '!#placement-banner');
  const cancelled = await readBanner(page);
  const afterCancel = await readBooks(page);
  check(NAME.placementCancel,
    cancelled.shown === false && afterCancel.seeds[DISH.common] === 1 &&
      afterCancel.plants.length === 0,
    'banner shown ' + cancelled.shown + ', packets ' + JSON.stringify(afterCancel.seeds) +
      ', plants in the ground ' + afterCancel.plants.length);

  /* ---- buy the uncommon, then walk away mid placement ---- */
  await openSection(page, 'open-shop', 'view-shop');
  await pressLocator(page.locator('.shop-card[data-crop-id="' + DISH.uncommon + '"] .shop-buy'));
  await page.locator('.shop-card[data-crop-id="' + DISH.uncommon + '"] .shop-plant')
    .waitFor({ state: 'visible', timeout: 3000 });
  await press(page, '.shop-card[data-crop-id="' + DISH.uncommon + '"] .shop-plant', '#view-garden');
  const placing = await readBanner(page);

  await openSection(page, 'open-meals', 'view-meals');
  await auditScreen(page, 'meals, nothing cooked yet');
  await backToGarden(page, 'meals-back');
  const walkedAway = await readBanner(page);
  const afterWalk = await readBooks(page);
  check(NAME.placementViewSwitch,
    placing.shown === true && walkedAway.shown === false &&
      afterWalk.seeds[DISH.uncommon] === 1 && afterWalk.plants.length === 0,
    'banner was up ' + placing.shown + ', after a trip to the meals screen it is up ' +
      walkedAway.shown + ', packets kept ' + JSON.stringify(afterWalk.seeds));

  /* ---- now actually plant both ---- */
  const planted = {};
  const wanted = [DISH.common, DISH.uncommon];
  for (let i = 0; i < wanted.length; i += 1) {
    const cropId = wanted[i];
    await openSection(page, 'open-shop', 'view-shop');
    await press(page, '.shop-card[data-crop-id="' + cropId + '"] .shop-plant', '#view-garden');
    await page.locator('#placement-banner').waitFor({ state: 'visible', timeout: 3000 });
    await pressLocator(page.locator('.plot[data-empty="true"] >> nth=0'));
    await page.locator('#placement-banner').waitFor({ state: 'hidden', timeout: 3000 });
    const books = await readBooks(page);
    const match = books.plants.filter(function (plant) { return plant.cropId === cropId; })[0];
    planted[cropId] = match === undefined ? '' : match.id;
  }
  const afterPlanting = await readBooks(page);
  check(NAME.placementPlants,
    afterPlanting.plants.length === 2 &&
      afterPlanting.plants.every(function (plant) { return plant.kind === 'crop'; }) &&
      Object.keys(afterPlanting.seeds).length === 0 &&
      planted[DISH.common] !== '' && planted[DISH.uncommon] !== '' &&
      (await readBanner(page)).shown === false,
    afterPlanting.plants.length + ' crops in the ground (' +
      afterPlanting.plants.map(function (plant) { return plant.cropId + ' ' + plant.id; }).join(', ') +
      '), packets left ' + JSON.stringify(afterPlanting.seeds));

  /* ---- two days of water ---- */
  await waterOnce(page, planted[DISH.common]);
  await waterOnce(page, planted[DISH.uncommon]);
  const dayOneBooks = await readBooks(page);

  await setClock(page, dayTwo);
  await waterOnce(page, planted[DISH.common]);
  await waterOnce(page, planted[DISH.uncommon]);
  const ripe = await readBooks(page);
  await auditScreen(page, 'garden, two ripe crops');

  const stagesDayOne = dayOneBooks.plants.map(function (plant) { return plant.stage; });
  const stagesDayTwo = ripe.plants.map(function (plant) { return plant.stage; });
  check(NAME.cropGrows,
    stagesDayOne.length === 2 && stagesDayOne.every(function (stage) { return stage === 1; }) &&
      stagesDayTwo.length === 2 && stagesDayTwo.every(function (stage) { return stage === 2; }),
    'day one stages ' + stagesDayOne.join(' and ') + ', day two stages ' + stagesDayTwo.join(' and '));

  /* ---- pick the first one: a harvest with no dish behind it ---- */
  await openPanelFor(page, planted[DISH.common]);
  const harvestVisible = await page.locator('#plant-harvest').isVisible();
  await press(page, '#plant-harvest', '!#view-plant');
  const picked = await readBooks(page);
  const harvestSlots = {
    name: 'Auntie Bee Lian',
    memory_hint: '',
    plant: crops[DISH.common] && crops[DISH.common].label ? crops[DISH.common].label : DISH.common
  };
  const harvestCandidates = candidatesFor('harvest', harvestSlots);
  const harvestLine = await waitForLine(page, harvestCandidates);
  const harvestFace = await gardenerFace(page);
  await auditScreen(page, 'garden, one crop picked');

  check(NAME.harvestBasket,
    harvestVisible && picked.basket[DISH.common] === 1 && picked.plants.length === 1 &&
      picked.plants[0].cropId === DISH.uncommon && picked.meals.length === 0,
    'the pick button was there ' + harvestVisible + ', basket ' + JSON.stringify(picked.basket) +
      ', plots still growing ' + picked.plants.length + ', dishes unlocked ' + picked.meals.length);

  check(NAME.harvestFace,
    harvestCandidates.indexOf(harvestLine) !== -1 && /happy\.png$/.test(harvestFace),
    'she said "' + harvestLine + '" against ' + harvestCandidates.length +
      ' harvest lines, wearing "' + harvestFace + '"');

  /* ---- pick the second: the dish completes ---- */
  await openPanelFor(page, planted[DISH.uncommon]);
  await press(page, '#plant-harvest', '!#view-plant');
  const cooked = await readBooks(page);
  const dish = dishes.filter(function (row) { return row.id === DISH.id; })[0];
  const mealSlots = { name: 'Auntie Bee Lian', memory_hint: '', plant: dish === undefined ? '' : dish.name };
  const mealCandidates = candidatesFor('meal_unlock', mealSlots);
  const mealLine = await waitForLine(page, mealCandidates);
  const mealFace = await gardenerFace(page);
  const chips = await gardenerReplies(page);
  const wantedChips = repliesBehind('meal_unlock', mealLine, mealSlots);
  await auditScreen(page, 'garden, dish unlocked');

  check(NAME.mealUnlock,
    cooked.meals.length === 1 && cooked.meals[0] === DISH.id &&
      cooked.basket[DISH.common] === undefined && cooked.basket[DISH.uncommon] === undefined &&
      Object.keys(cooked.basket).length === 0 && cooked.plants.length === 0,
    'unlocked ' + JSON.stringify(cooked.meals) + ', basket after the dish took its share ' +
      JSON.stringify(cooked.basket) + ', plots left ' + cooked.plants.length);

  check(NAME.mealFace,
    mealCandidates.indexOf(mealLine) !== -1 && /celebrate\.png$/.test(mealFace) &&
      harvestCandidates.indexOf(mealLine) === -1,
    'she said "' + mealLine + '" against ' + mealCandidates.length +
      ' meal_unlock lines, wearing "' + mealFace + '"');

  check(NAME.mealReplies,
    wantedChips !== null && chips.length === wantedChips.length &&
      chips.every(function (label, index) { return label === wantedChips[index]; }),
    wantedChips === null ? 'the line was not in the bank, so its chips cannot be checked' :
      'on screen ' + JSON.stringify(chips) + ', the line it belongs to carries ' +
        JSON.stringify(wantedChips));

  /* ---- the card, and the ones still to come ---- */
  await openSection(page, 'open-meals', 'view-meals');
  await auditScreen(page, 'meals, one cooked');
  const cards = await readMealCards(page);
  await reload(page);
  await openSection(page, 'open-meals', 'view-meals');
  const cardsAfterReload = await readMealCards(page);

  const cooked1 = cards.filter(function (card) { return card.locked === 'false'; });
  const kept = cardsAfterReload.filter(function (card) { return card.locked === 'false'; });
  const lockedPreviews = cards.filter(function (card) { return card.locked === 'true'; });
  const emptyPreviews = lockedPreviews.filter(function (card) { return card.text.length === 0; });

  check(NAME.mealCardPermanent,
    cooked1.length === 1 && cooked1[0].dishId === DISH.id &&
      kept.length === 1 && kept[0].dishId === DISH.id,
    'cooked cards on screen ' + cooked1.map(function (card) { return card.dishId; }).join(', ') +
      ', after a reload ' + kept.map(function (card) { return card.dishId; }).join(', '));

  check(NAME.lockedPreviews,
    cards.length === dishes.length && lockedPreviews.length === dishes.length - 1 &&
      emptyPreviews.length === 0,
    cards.length + ' cards for ' + dishes.length + ' dishes, ' + lockedPreviews.length +
      ' still to cook and every one of them says something' +
      (emptyPreviews.length === 0 ? '' : ', except ' + emptyPreviews.length + ' blank ones'));

  await run.context.close();
}

/* ======================================================================
   Scenario five: a save written before the economy existed.
   ====================================================================== */

async function migrationRun(browser) {
  const plantedDay = shiftDay(MIGRATE_DAY, -4);
  const v1 = {
    version: 1,
    player: {
      name: 'Bee Lian',
      honorific: 'Auntie',
      visitCount: 5,
      lastVisitDay: shiftDay(MIGRATE_DAY, -1),
      prevVisitDay: shiftDay(MIGRATE_DAY, -2),
      lastPlantId: 'gol-1',
      memoryHint: 'the kopitiam cup with my father'
    },
    nextPlantId: 2,
    plants: [{
      id: 'gol-1',
      kind: 'memory',
      plantedDay: plantedDay,
      objectId: 'kopitiam-cup',
      answers: { who: 'my-father', where: 'kampung-shop', feeling: 'warm-and-cosy' },
      phrases: {
        object: 'the kopitiam cup',
        who: 'with my father',
        where: 'at the kampung shop',
        feeling: 'warm and cosy'
      },
      tags: { palette: 'warm', bloom: 'one-big', ornament: 'kampung' },
      freeText: 'He always drank it too hot.',
      seed: 4242,
      wateredDays: [plantedDay, shiftDay(MIGRATE_DAY, -3)]
    }]
  };

  const run = await scenario(browser, MIGRATE_DAY, v1);
  const page = run.page;
  const books = await readBooks(page);
  const saved = await page.evaluate(function (key) {
    const raw = window.localStorage.getItem(key);
    try {
      return JSON.parse(raw);
    } catch (err) {
      return null;
    }
  }, STORAGE_KEY);
  await auditScreen(page, 'garden, migrated save');

  const player = saved === null ? {} : (saved.player || {});
  const plant = saved === null || !Array.isArray(saved.plants) ? null : saved.plants[0];
  const kept = plant !== null && plant.id === 'gol-1' && plant.objectId === 'kopitiam-cup' &&
    plant.freeText === v1.plants[0].freeText && plant.seed === 4242 &&
    JSON.stringify(plant.wateredDays) === JSON.stringify(v1.plants[0].wateredDays) &&
    plant.phrases.object === 'the kopitiam cup';
  const identity = player.name === 'Bee Lian' && player.honorific === 'Auntie' &&
    player.lastPlantId === 'gol-1' && player.memoryHint === v1.player.memoryHint &&
    player.visitCount === 6;
  const economy = books.version === 2 && saved !== null && saved.version === 2 &&
    books.coins === 0 && Object.keys(books.seeds).length === 0 &&
    Object.keys(books.basket).length === 0 && books.meals.length === 0 &&
    saved.freeSeed !== undefined && saved.freeSeed.lastClaimDay === '' &&
    saved.streak !== undefined && Number.isFinite(saved.streak.days);

  check(NAME.migration, kept && identity && economy,
    'version ' + (saved === null ? 'unreadable' : saved.version) + ', plant kept ' + kept +
      ', player kept ' + identity + ' (visits ' + player.visitCount + ', was ' +
      v1.player.visitCount + '), coins ' + books.coins + ', seeds ' +
      JSON.stringify(books.seeds) + ', basket ' + JSON.stringify(books.basket) + ', meals ' +
      JSON.stringify(books.meals) + ', freeSeed ' + JSON.stringify(saved === null ? null : saved.freeSeed) +
      ', streak ' + JSON.stringify(books.streak));

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

  const faults = [];
  let counted = 0;
  let smallest = null;
  for (let i = 0; i < tiles.length; i += 1) {
    for (let j = 0; j < tiles[i].boxes.length; j += 1) {
      const box = tiles[i].boxes[j];
      counted += 1;
      const least = Math.min(box.w, box.h);
      if (smallest === null || least < smallest) {
        smallest = least;
      }
      if (box.w < TILE_FLOOR || box.h < TILE_FLOOR) {
        faults.push(tiles[i].label + ': a tile at ' + box.w + 'x' + box.h);
      }
    }
  }
  check(NAME.tileFloor, counted > 0 && faults.length === 0,
    counted === 0 ? 'no tile was ever measured' :
      (faults.length === 0 ? counted + ' tiles measured, smallest side ' + smallest +
        ' against a ' + TILE_FLOOR + 'px floor' : faults.slice(0, 4).join(' | ')));
}

/* ---- the run ------------------------------------------------------------ */

async function run(browser) {
  await earnAndSpendRun(browser);
  await streakRun(browser);
  await freeSeedRun(browser);
  await cropToDishRun(browser);
  await migrationRun(browser);
}

async function main() {
  await loadBanks();

  const portFree = await waitForFreePort(5000);
  if (!portFree) {
    process.stdout.write('Garden of Life economy QA cannot start: port ' + PORT +
      ' is still held after 5s, so this run would be driving a server it does not ' +
      'own and the results would be worthless. Find the holder with ' +
      '"lsof -nP -iTCP:' + PORT + ' -sTCP:LISTEN" and stop it, or set GOL_ECON_PORT.\n');
    process.exit(1);
  }

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

  await sleep(150);

  judgeScreens();

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
  process.stdout.write('\nGarden of Life economy QA\n');
  process.stdout.write('-------------------------\n');
  for (let i = 0; i < rows.length; i += 1) {
    if (!rows[i].pass) {
      failures += 1;
    }
    process.stdout.write((rows[i].pass ? 'PASS  ' : 'FAIL  ') + rows[i].name +
      (rows[i].detail ? '  ::  ' + rows[i].detail : '') + '\n');
  }
  process.stdout.write('-------------------------\n');
  process.stdout.write((failures === 0 ? 'ALL PASS' : 'FAILURES: ' + failures) +
    '  (' + rows.length + ' checks, ' + screens.length + ' screens measured)\n');

  if (crash !== null) {
    process.stdout.write('\nthe run stopped early: ' + String(crash.stack || crash) + '\n');
  }
  process.exit(failures === 0 ? 0 : 1);
}

main();
