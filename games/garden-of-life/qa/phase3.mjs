#!/usr/bin/env node
/*
  Garden of Life phase 3 QA. The camera walk, the picture you can send, the
  manifest that makes it installable, and the four sounds.

  Fourth sibling to qa/core.mjs, qa/days.mjs and qa/economy.mjs, same discipline
  throughout: own the port or refuse to run, keep the server's output, wait the
  stale tap guard out before every scripted tap, explicit element state waits and
  never networkidle, and a named check list that prints in full even when the run
  stops early.

  Four things this suite does that the others do not.

  It brings its own photograph. The fixture png is built here, byte by byte, into
  the scratch directory outside the repo, so nothing is committed and nothing is
  downloaded to make this run.

  It never names the find. The classifier rotates its answers, so every
  assertion about what the photo turned out to be is membership in
  photoFindChoices, and the guess line is read with a regex that accepts a and an
  rather than being compared to a sentence somebody might retune.

  It proves the silence. isStarted is the seam: it must be false on a fresh load,
  false after every tap while muted, and true only once a cue has actually run.
  So the audio checks are about which tap built the context, not about hearing
  anything.

  It catches the download rather than the file. Playwright holds the download in
  its own artifacts directory, so the evidence is the download event, its
  suggested filename, and the bytes it carries. Nothing lands anywhere real.
*/

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const gameRoot = path.resolve(here, '..');
const repoRoot = path.resolve(here, '../../..');
const BANK_PATH = path.join(gameRoot, 'content', 'gardener-lines.json');
const INDEX_PATH = path.join(gameRoot, 'index.html');

/* The fixture never goes in the repo. A photograph is test apparatus, it is not
   content, and a committed one would be the only image in this project nobody
   drew on purpose. */
const SCRATCH = process.env.CLAUDE_SCRATCH ||
  '/private/tmp/garden-of-life-phase3-qa';
const FIXTURE = path.join(SCRATCH, 'qa-plant-photo.png');

const PORT = Number(process.env.GOL_P3_PORT) || 4192;
const ORIGIN = 'http://localhost:' + PORT;
const GAME_URL = ORIGIN + '/garden-of-life';
const MANIFEST_URL = ORIGIN + '/games/garden-of-life/manifest.webmanifest';
const STORAGE_KEY = 'ctrlai:garden-of-life';
const QA_CLOCK_KEY = 'ctrlai:garden-of-life:qa-clock';
const VIEWPORT = { width: 390, height: 844 };

const GUARD_WAIT = 400;
const TAP_FLOOR = 64;

// Binding numbers from the phase 3 plan.
const PHOTO_COINS = 3;
const CARD_W = 1080;
const CARD_H = 1350;
const ENVELOPE_MS = 15000;
const FIND_COUNT = 8;

/* The guess has to stay a question. Both halves of the honest wording are
   pinned, and the article is allowed to be either one so the Orchid case reads
   as English rather than as a bug. */
const GUESS_SHAPE = /^I think it looks like an? (.+)\. Am I right\?$/;

const SHAME_WORDS = ['failed', 'error', 'invalid', 'denied', 'sorry', 'wrong',
  'not allowed', 'cannot', 'unable'];

// What must never appear in the save after a photograph has been looked at.
const LEAK_MARKERS = ['data:image', 'data:', 'base64', 'blob:'];

const TOLERATED_ABSENCE = [
  /\/content\/[^?]*\.json$/,
  /\/art\/[^?]*\.(png|svg)$/,
  /\/icons\//
];

const PHOTO_DAY = '2026-08-10';
const AUDIO_DAY = '2026-08-14';
const SHARE_DAY = '2026-08-18';

const NAME = {
  fixtureMade: 'the suite built its own photograph, outside the repo',
  guessHonest: 'the guess names one of the eight finds and asks instead of telling',
  yesPath: 'agreeing with the guess reaches the reward',
  otherPath: 'the something else path offers all eight and reaches the reward',
  doneGated: 'plant this seed waits until a seed has been chosen',
  rewardExact: 'a confirmed find pays exactly 3 coins and the one seed chosen',
  placementHandoff: 'the walk ends in the garden with the seed asking where to go',
  photoLine: 'the gardener answers from the photo_result bank naming the find',
  privacy: 'nothing of the photograph reaches the save and the input is emptied',
  dayGuard: 'a second walk the same day is refused kindly and grants nothing',
  dayGuardTomorrow: 'the next day the camera walk is there again',
  envelope: 'photo to gardener comment inside 15 seconds',
  noAutoplay: 'no audio context exists before the first gesture',
  waterCue: 'the water tap is what builds the audio context',
  matchCausal: 'reveals and misses build nothing, a settling pair builds the context',
  mutedSilent: 'muted from a fresh load, no context is ever built',
  mutePersists: 'the mute toggle flips aria-pressed and survives a reload',
  shareDownloads: 'sharing on localhost downloads a real 1080 by 1350 png',
  shareNote: 'the note says warmly where the picture went',
  shareOnce: 'a double tap on share produces one download, not two',
  shareEmpty: 'an empty garden is invited to plant something, not handed a file',
  manifest: 'the manifest answers 200 with valid json and both icons resolve',
  manifestLinked: 'index.html links the manifest',
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

const MS_PER_DAY = 86400000;

function shiftDay(iso, days) {
  const at = new Date(Date.parse(iso + 'T00:00:00Z') + days * MS_PER_DAY);
  const pad = function (value) { return value < 10 ? '0' + String(value) : String(value); };
  return String(at.getUTCFullYear()) + '-' + pad(at.getUTCMonth() + 1) + '-' + pad(at.getUTCDate());
}

/* ---- png, written and read ----------------------------------------------
   Hand rolled rather than pulled from a dependency, because a fixture that
   needs an install step is a fixture that will not be there on the machine
   somebody debugs this on. The reader is the same eight byte signature and the
   same IHDR the writer produces, used on the card the game hands back. */

const CRC_TABLE = (function () {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let c = 0xffffffff;
  for (let i = 0; i < buffer.length; i += 1) {
    c = CRC_TABLE[(c ^ buffer[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typed = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typed), 0);
  return Buffer.concat([length, typed, crc]);
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function makePng(width, height) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  // Truecolour, no alpha. The smallest thing a browser will happily call a
  // photograph.
  ihdr[9] = 2;
  const raw = Buffer.alloc(height * (1 + width * 3));
  let at = 0;
  for (let y = 0; y < height; y += 1) {
    raw[at] = 0;
    at += 1;
    for (let x = 0; x < width; x += 1) {
      raw[at] = 90;
      raw[at + 1] = 140;
      raw[at + 2] = 70;
      at += 3;
    }
  }
  return Buffer.concat([
    Buffer.from(PNG_SIGNATURE),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0))
  ]);
}

function readPng(buffer) {
  let signature = buffer.length > 24;
  for (let i = 0; i < 8 && signature; i += 1) {
    if (buffer[i] !== PNG_SIGNATURE[i]) {
      signature = false;
    }
  }
  return {
    signature: signature,
    width: signature ? buffer.readUInt32BE(16) : 0,
    height: signature ? buffer.readUInt32BE(20) : 0,
    bytes: buffer.length
  };
}

/* ---- the bank ------------------------------------------------------------
   fillSlots and tidy reproduced from shared/ai.js, which exports neither.
   Copied line for line, and this comment is the coupling: if the seam's slot
   syntax or its tidy rules change, this pair changes with them or the
   membership check starts lying. */

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

function templatesFor(event) {
  const raw = bank[event];
  if (!Array.isArray(raw)) {
    return [];
  }
  const out = [];
  for (let i = 0; i < raw.length; i += 1) {
    const line = raw[i];
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

function readBooks(page) {
  return page.evaluate(async function () {
    const state = await import('/games/garden-of-life/js/state.js');
    const player = state.getPlayer();
    return {
      coins: state.getCoins(),
      seeds: JSON.parse(JSON.stringify(state.getSeeds())),
      today: state.todayISO(),
      muted: state.getAudioMuted(),
      questAvailable: state.photoQuestAvailable(),
      name: player.name,
      honorific: player.honorific,
      memoryHint: player.memoryHint,
      plants: state.getPlants().map(function (plant) {
        return { id: plant.id, kind: plant.kind, stage: state.plantStage(plant) };
      })
    };
  });
}

// The eight the canned classifier is allowed to answer with, asked of the seam
// itself so this suite can never drift from the closed set it is checking.
function findChoices(page) {
  return page.evaluate(async function () {
    const ai = await import('/shared/ai.js');
    return ai.photoFindChoices();
  });
}

function audioState(page) {
  return page.evaluate(async function () {
    const audio = await import('/games/garden-of-life/js/audio.js');
    return { started: audio.isStarted(), muted: audio.isMuted() };
  });
}

function gardenerLine(page) {
  return page.evaluate(function () {
    const node = document.getElementById('gardener-line');
    return node === null ? '' : node.textContent.trim();
  });
}

async function waitForLine(page, candidates, timeout) {
  try {
    await page.waitForFunction(function (list) {
      const node = document.getElementById('gardener-line');
      return node !== null && list.indexOf(node.textContent.trim()) !== -1;
    }, candidates, { timeout: timeout === undefined ? 6000 : timeout });
  } catch (err) {
    // The membership check reports the truth with the sentence that was there.
  }
  return gardenerLine(page);
}

function textOf(page, id) {
  return page.evaluate(function (want) {
    const node = document.getElementById(want);
    return node === null ? '' : node.textContent.trim();
  }, id);
}

function shameIn(text) {
  const lowered = String(text).toLowerCase();
  return SHAME_WORDS.filter(function (word) { return lowered.indexOf(word) !== -1; });
}

function composedName(books) {
  return [String(books.honorific || '').trim(), String(books.name || '').trim()]
    .filter(function (part) { return part !== ''; })
    .join(' ');
}

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

/* ---- contexts ----------------------------------------------------------- */

async function scenario(browser, day, saved) {
  const context = await browser.newContext({ viewport: VIEWPORT, hasTouch: true, acceptDownloads: true });
  await context.addInitScript(function (payload) {
    try {
      if (window.localStorage.getItem(payload.clockKey) === null) {
        window.localStorage.setItem(payload.clockKey, payload.day);
      }
      if (payload.saved !== null && window.localStorage.getItem(payload.stateKey) === null) {
        window.localStorage.setItem(payload.stateKey, payload.saved);
      }
    } catch (err) {
      // Storage refusing to write is the game's problem to survive.
    }
  }, {
    clockKey: QA_CLOCK_KEY,
    stateKey: STORAGE_KEY,
    day: day,
    saved: saved === undefined || saved === null ? null : JSON.stringify(saved)
  });
  const page = watch(await context.newPage());
  await page.goto(GAME_URL, { waitUntil: 'domcontentloaded' });
  await settle(page);
  return { context: context, page: page };
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

function seededGarden(fields, plants) {
  return Object.assign({
    version: 2,
    player: {
      name: 'Bee Lian',
      honorific: 'Auntie',
      visitCount: 3,
      lastVisitDay: '',
      prevVisitDay: '',
      lastPlantId: plants && plants.length > 0 ? plants[0].id : '',
      memoryHint: 'the kopitiam cup with my father'
    },
    nextPlantId: (plants ? plants.length : 0) + 1,
    plants: plants || [],
    coins: 0,
    streak: { days: 1, lastCountedDay: '' },
    seeds: {},
    basket: {},
    meals: { unlocked: [] },
    freeSeed: { lastClaimDay: '' },
    photo: { lastQuestDay: '' },
    audio: { muted: false }
  }, fields || {});
}

function memoryPlant(number, plantedDay, wateredDays) {
  return {
    id: 'gol-' + String(number),
    kind: 'memory',
    plantedDay: plantedDay,
    objectId: 'kopitiam-cup',
    cropId: '',
    answers: { who: 'seeded-who', where: 'seeded-where', feeling: 'seeded-feeling' },
    phrases: {
      object: 'the kopitiam cup',
      who: 'with my father',
      where: 'at the kampung shop',
      feeling: 'warm and cosy'
    },
    tags: { palette: 'warm', bloom: 'one-big', ornament: 'kampung' },
    freeText: '',
    seed: 1000 + number,
    wateredDays: wateredDays || []
  };
}

/* ======================================================================
   The camera walk.
   Two confirmations, on two days, because one quest a day is the rule and
   running the second path tomorrow proves the guard opens again at the same
   time as it proves the other path works.
   ====================================================================== */

async function openPhoto(page) {
  await press(page, '#open-photo', '#view-photo');
  await page.locator('#view-photo').waitFor({ state: 'visible', timeout: 4000 });
}

async function offerPhoto(page) {
  await page.locator('#photo-input').setInputFiles(FIXTURE);
  await page.waitForFunction(function () {
    const guess = document.getElementById('photo-guess');
    const line = document.getElementById('photo-guess-line');
    return guess !== null && guess.hidden === false &&
      line !== null && line.textContent.trim().length > 0;
  }, null, { timeout: 8000 });
  return textOf(page, 'photo-guess-line');
}

async function takeSeedAndFinish(page) {
  await page.locator('#photo-reward').waitFor({ state: 'visible', timeout: 4000 });
  await page.waitForFunction(function () {
    const chips = document.getElementById('photo-seed-chips');
    return chips !== null && chips.querySelectorAll('.photo-seed').length > 0;
  }, null, { timeout: 4000 });
  await auditScreen(page, 'photo, reward');

  const gateBefore = await page.locator('#photo-done').getAttribute('data-ready');
  const chip = page.locator('#photo-seed-chips .photo-seed').first();
  const cropId = await chip.getAttribute('data-crop-id');
  await pressLocator(chip);
  const gateAfter = await page.locator('#photo-done').getAttribute('data-ready');

  await press(page, '#photo-done', '#view-garden');
  await page.locator('#view-garden').waitFor({ state: 'visible', timeout: 4000 });
  return { cropId: cropId, gateBefore: gateBefore, gateAfter: gateAfter };
}

async function photoRun(browser) {
  const tomorrow = shiftDay(PHOTO_DAY, 1);
  const run = await scenario(browser, PHOTO_DAY, seededGarden({}, []));
  const page = run.page;

  const choices = await findChoices(page);
  const labels = choices.map(function (choice) { return choice.label; });
  const before = await readBooks(page);

  /* ---- day one, the yes path ---- */
  const startedAt = Date.now();
  await openPhoto(page);
  await auditScreen(page, 'photo, camera waiting');
  const guess = await offerPhoto(page);
  await auditScreen(page, 'photo, the guess');

  const shape = GUESS_SHAPE.exec(guess);
  const guessed = shape === null ? '' : shape[1];
  check(NAME.guessHonest,
    shape !== null && labels.indexOf(guessed) !== -1,
    'it said "' + guess + '"' + (shape === null ? ', which is not the honest shape' :
      ', naming "' + guessed + '" out of ' + labels.length + ' choices'));

  await press(page, '#photo-yes', '#photo-reward');
  const rewardLine = await textOf(page, 'photo-reward-line');
  check(NAME.yesPath,
    await page.locator('#photo-reward').isVisible() && rewardLine.length > 0 &&
      rewardLine.indexOf(guessed) !== -1,
    'the reward says "' + rewardLine + '"');

  const finished = await takeSeedAndFinish(page);
  const photoSlots = {
    name: composedName(before),
    memory_hint: String(before.memoryHint || ''),
    plant: guessed
  };
  const photoCandidates = candidatesFor('photo_result', photoSlots);
  const photoLine = await waitForLine(page, photoCandidates);
  const elapsed = Date.now() - startedAt;
  const after = await readBooks(page);
  await auditScreen(page, 'garden, back from the camera');

  check(NAME.doneGated,
    finished.gateBefore === 'false' && finished.gateAfter === 'true',
    'plant this seed read ready "' + String(finished.gateBefore) + '" before a seed was chosen and "' +
      String(finished.gateAfter) + '" after');

  check(NAME.rewardExact,
    after.coins - before.coins === PHOTO_COINS &&
      after.seeds[finished.cropId] === 1 &&
      Object.keys(after.seeds).length === 1,
    'coins went ' + before.coins + ' to ' + after.coins + ', packets ' +
      JSON.stringify(after.seeds) + ' for the chosen ' + finished.cropId);

  const banner = await page.evaluate(function () {
    const node = document.getElementById('placement-banner');
    const line = document.getElementById('placement-line');
    return {
      shown: node !== null && node.hidden === false,
      line: line === null ? '' : line.textContent.trim()
    };
  });
  check(NAME.placementHandoff,
    banner.shown && banner.line.length > 0,
    'the banner says "' + banner.line + '"');

  /* Membership alone is not enough on this event. One photo_result template has
     no {plant} slot at all, so a run that lands on it would pass while never
     testing that the find reached the sentence. The template that actually
     produced the line is looked up, and when it carries the slot the label has
     to be in the words. Which case happened goes in the report either way. */
  const usedIndex = photoCandidates.indexOf(photoLine);
  const usedTemplate = usedIndex === -1 ? '' : templatesFor('photo_result')[usedIndex];
  const carriesSlot = usedTemplate.indexOf('{plant}') !== -1;
  check(NAME.photoLine,
    usedIndex !== -1 && (!carriesSlot || photoLine.indexOf(guessed) !== -1),
    'she said "' + photoLine + '" against ' + photoCandidates.length +
      ' photo_result lines filled with "' + guessed + '", and the template it used ' +
      (usedIndex === -1 ? 'is not in the bank' :
        (carriesSlot ? 'carries {plant}, which the line does name' :
          'carries no plant slot, so the label was not under test this run')));

  check(NAME.envelope, elapsed <= ENVELOPE_MS,
    'camera to comment took ' + (elapsed / 1000).toFixed(1) + 's against a ' +
      (ENVELOPE_MS / 1000) + 's envelope, including ' + (GUARD_WAIT / 1000) +
      's of guard wait before every scripted tap');

  /* ---- privacy: the photograph was looked at and not kept ---- */
  const saved = await page.evaluate(function (key) {
    return window.localStorage.getItem(key) || '';
  }, STORAGE_KEY);
  const inputValue = await page.locator('#photo-input').inputValue();
  const leaks = LEAK_MARKERS.filter(function (marker) { return saved.indexOf(marker) !== -1; });
  const namedFile = saved.indexOf(path.basename(FIXTURE)) !== -1;
  check(NAME.privacy,
    leaks.length === 0 && !namedFile && inputValue === '' && saved.length > 0,
    'the save is ' + saved.length + ' characters with no ' + LEAK_MARKERS.join(', ') +
      (leaks.length === 0 ? '' : ' (found ' + leaks.join(', ') + ')') +
      ', the fixture name appears ' + namedFile + ', the input reads "' + inputValue + '"');

  /* ---- the same day again ---- */
  const guardCoins = await readBooks(page);
  await pressLocator(page.locator('#open-photo'));
  await sleep(600);
  const guardNote = await textOf(page, 'photo-note');
  const guardView = await page.locator('#view-photo').isVisible();
  const guardBooks = await readBooks(page);
  const guardShame = shameIn(guardNote);
  check(NAME.dayGuard,
    guardView === false && guardNote.length > 0 && guardShame.length === 0 &&
      guardBooks.coins === guardCoins.coins &&
      JSON.stringify(guardBooks.seeds) === JSON.stringify(guardCoins.seeds) &&
      guardBooks.questAvailable === false,
    'the camera screen opened ' + guardView + ', it said "' + guardNote +
      '", coins stayed ' + guardBooks.coins + ', packets stayed ' + JSON.stringify(guardBooks.seeds) +
      (guardShame.length === 0 ? '' : ', shame words ' + guardShame.join(', ')));

  /* ---- tomorrow, the something else path ---- */
  await setClock(page, tomorrow);
  const freshDay = await readBooks(page);
  await openPhoto(page);
  await offerPhoto(page);
  await press(page, '#photo-other', '#photo-picker');
  await page.waitForFunction(function () {
    const picker = document.getElementById('photo-choices');
    return picker !== null && picker.querySelectorAll('.photo-find').length > 0;
  }, null, { timeout: 4000 });
  await auditScreen(page, 'photo, the picker');

  const pickerChips = await page.evaluate(function () {
    return Array.from(document.querySelectorAll('#photo-choices .photo-find')).map(function (chip) {
      return { id: chip.dataset.findId || '', label: chip.textContent.trim() };
    });
  });
  // The second one, not the first, so this is provably not the guess again.
  const chosen = pickerChips.length > 1 ? pickerChips[1] : pickerChips[0];
  await pressLocator(page.locator('#photo-choices .photo-find[data-find-id="' + chosen.id + '"]'));
  const otherReward = await textOf(page, 'photo-reward-line');
  const secondFinish = await takeSeedAndFinish(page);
  const afterSecond = await readBooks(page);

  const ids = choices.map(function (choice) { return choice.id; });
  check(NAME.otherPath,
    pickerChips.length === FIND_COUNT &&
      pickerChips.every(function (chip) { return ids.indexOf(chip.id) !== -1; }) &&
      otherReward.indexOf(chosen.label) !== -1,
    pickerChips.length + ' finds offered, picked "' + chosen.label + '" and the reward said "' +
      otherReward + '"');

  check(NAME.dayGuardTomorrow,
    freshDay.questAvailable === true &&
      afterSecond.coins - guardBooks.coins === PHOTO_COINS &&
      afterSecond.seeds[secondFinish.cropId] >= 1,
    'on ' + tomorrow + ' the walk was available ' + freshDay.questAvailable + ', coins went ' +
      guardBooks.coins + ' to ' + afterSecond.coins + ', packets ' + JSON.stringify(afterSecond.seeds));

  await run.context.close();
}

/* ======================================================================
   Sound, which is really a suite about silence.
   ====================================================================== */

async function waterOnce(page, plantId) {
  await press(page, '.plot-filled[data-plant-id="' + plantId + '"]', '#view-plant');
  await page.locator('#view-plant').waitFor({ state: 'visible', timeout: 4000 });
  await pressLocator(page.locator('#plant-water'));
  await page.waitForFunction(function () {
    const note = document.getElementById('plant-water-note');
    return note !== null && note.textContent.trim().length > 0;
  }, null, { timeout: 3000 });
  await press(page, '#plant-close', '!#view-plant');
}

async function audioRun(browser) {
  const plants = [memoryPlant(1, shiftDay(AUDIO_DAY, -1), [])];

  /* ---- sound on: nothing before the gesture, everything after it ---- */
  const loud = await scenario(browser, AUDIO_DAY, seededGarden({}, plants));
  const beforeGesture = await audioState(loud.page);
  await auditScreen(loud.page, 'garden, sound on');
  await waterOnce(loud.page, 'gol-1');
  const afterWater = await audioState(loud.page);

  check(NAME.noAutoplay,
    beforeGesture.started === false && beforeGesture.muted === false,
    'on a fresh load with sound on, a context exists ' + beforeGesture.started);
  check(NAME.waterCue, afterWater.started === true,
    'after the water tap a context exists ' + afterWater.started);

  /* ---- the toggle, and whether it is remembered ---- */
  const pressedBefore = await loud.page.locator('#mute-toggle').getAttribute('aria-pressed');
  await pressLocator(loud.page.locator('#mute-toggle'));
  const pressedAfter = await loud.page.locator('#mute-toggle').getAttribute('aria-pressed');
  const mutedBooks = await readBooks(loud.page);
  await reload(loud.page);
  const pressedReloaded = await loud.page.locator('#mute-toggle').getAttribute('aria-pressed');
  const reloadedBooks = await readBooks(loud.page);
  check(NAME.mutePersists,
    pressedBefore === 'false' && pressedAfter === 'true' && mutedBooks.muted === true &&
      pressedReloaded === 'true' && reloadedBooks.muted === true,
    'aria-pressed went ' + pressedBefore + ' to ' + pressedAfter + ' with state.audio.muted ' +
      mutedBooks.muted + ', and after a reload it reads ' + pressedReloaded + ' with state ' +
      reloadedBooks.muted);
  await loud.context.close();

  /* ---- muted from the very first load: no context, ever ---- */
  const quiet = await scenario(browser, AUDIO_DAY,
    seededGarden({ audio: { muted: true } }, plants));
  const quietStart = await audioState(quiet.page);
  const quietPressed = await quiet.page.locator('#mute-toggle').getAttribute('aria-pressed');
  await waterOnce(quiet.page, 'gol-1');
  const quietAfter = await audioState(quiet.page);
  check(NAME.mutedSilent,
    quietStart.started === false && quietStart.muted === true && quietPressed === 'true' &&
      quietAfter.started === false,
    'muted on arrival, toggle reads ' + quietPressed + ', context after a full water tap ' +
      quietAfter.started);
  await quiet.context.close();

  /* ---- the match cue is caused by a pair settling, not by touching tiles ---- */
  const board = await scenario(browser, AUDIO_DAY, seededGarden({}, plants));
  const page = board.page;
  await press(page, '#open-puzzle', '#view-puzzle');
  await auditScreen(page, 'puzzle, sound on');

  const deck = await page.evaluate(async function (payload) {
    const puzzle = await import('/games/garden-of-life/js/puzzle.js');
    return puzzle.buildDeck(puzzle.roundSeed(payload.day, 0));
  }, { day: AUDIO_DAY });

  // A pair, and a tile that belongs to neither, so the miss is a real miss.
  const firstSeen = {};
  const pairs = [];
  for (let i = 0; i < deck.length; i += 1) {
    if (firstSeen[deck[i]] === undefined) {
      firstSeen[deck[i]] = i;
    } else {
      pairs.push([firstSeen[deck[i]], i]);
    }
  }
  const missA = pairs[0][0];
  const missB = pairs[1][1];
  const matchPair = pairs[2];

  await pressLocator(page.locator('#puzzle-board [data-index="' + missA + '"]'));
  const afterReveal = await audioState(page);
  await pressLocator(page.locator('#puzzle-board [data-index="' + missB + '"]'));
  const afterMiss = await audioState(page);
  /* The next tap spends itself putting the missed pair back, so it has to land
     outside that pair or it turns nothing up and the phase slips. */
  await pressLocator(page.locator('#puzzle-board [data-index="' + matchPair[0] + '"]'));
  const afterFlipBack = await audioState(page);
  await pressLocator(page.locator('#puzzle-board [data-index="' + matchPair[1] + '"]'));
  await page.waitForFunction(function (want) {
    const node = document.querySelector('#puzzle-board [data-index="' + want + '"]');
    return node !== null && node.dataset.state === 'matched';
  }, String(matchPair[1]), { timeout: 3000 });
  const afterMatch = await audioState(page);

  check(NAME.matchCausal,
    afterReveal.started === false && afterMiss.started === false &&
      afterFlipBack.started === false && afterMatch.started === true,
    'context after a reveal ' + afterReveal.started + ', after a miss ' + afterMiss.started +
      ', after the flip back ' + afterFlipBack.started + ', after a pair settled ' +
      afterMatch.started);

  await board.context.close();
}

/* ======================================================================
   The picture you can send.
   ====================================================================== */

async function shareRun(browser) {
  const plants = [
    memoryPlant(1, shiftDay(SHARE_DAY, -2), [shiftDay(SHARE_DAY, -2)]),
    memoryPlant(2, shiftDay(SHARE_DAY, -1), [shiftDay(SHARE_DAY, -1)])
  ];
  const run = await scenario(browser, SHARE_DAY, seededGarden({}, plants));
  const page = run.page;
  await auditScreen(page, 'garden, ready to share');

  let downloads = 0;
  page.on('download', function () { downloads += 1; });

  const caught = await Promise.all([
    page.waitForEvent('download', { timeout: 20000 }),
    pressLocator(page.locator('#open-share'))
  ]);
  const download = caught[0];
  const filename = download.suggestedFilename();
  const saved = await download.path();
  const bytes = saved === null ? Buffer.alloc(0) : await readFile(saved);
  const png = readPng(bytes);

  await page.waitForFunction(function () {
    const note = document.getElementById('share-note');
    return note !== null && note.textContent.trim().length > 0 &&
      note.textContent.indexOf('Getting') === -1;
  }, null, { timeout: 8000 });
  const note = await textOf(page, 'share-note');

  check(NAME.shareDownloads,
    png.signature && png.width === CARD_W && png.height === CARD_H && png.bytes > 1000 &&
      filename === 'garden-of-life-' + SHARE_DAY + '.png',
    'downloaded "' + filename + '", ' + png.bytes + ' bytes, ' + png.width + 'x' + png.height +
      ', png signature ' + png.signature);

  const noteShame = shameIn(note);
  check(NAME.shareNote,
    note.length > 0 && noteShame.length === 0 && /down/i.test(note),
    'the note says "' + note + '"' +
      (noteShame.length === 0 ? '' : ', shame words ' + noteShame.join(', ')));

  /* ---- two taps in one tick ----
     Dispatched together from inside the page so the second one lands while the
     first card is still being painted. That is the moment the busy guard exists
     for, and a real double tap on a phone is exactly this. */
  const beforeDouble = downloads;
  await sleep(GUARD_WAIT);
  await page.evaluate(function () {
    const button = document.getElementById('open-share');
    button.click();
    button.click();
  });
  await sleep(6000);
  const afterDouble = downloads;
  check(NAME.shareOnce, afterDouble - beforeDouble === 1,
    'the double tap produced ' + (afterDouble - beforeDouble) + ' download(s)');

  await run.context.close();

  /* ---- an empty garden is not given a file ---- */
  const bare = await scenario(browser, SHARE_DAY, seededGarden({}, []));
  let bareDownloads = 0;
  bare.page.on('download', function () { bareDownloads += 1; });
  await pressLocator(bare.page.locator('#open-share'));
  await bare.page.waitForFunction(function () {
    const node = document.getElementById('share-note');
    return node !== null && node.textContent.trim().length > 0;
  }, null, { timeout: 5000 });
  await sleep(2500);
  const bareNote = await textOf(bare.page, 'share-note');
  const bareShame = shameIn(bareNote);
  await auditScreen(bare.page, 'garden, nothing to share yet');

  check(NAME.shareEmpty,
    bareDownloads === 0 && bareNote.length > 0 && bareShame.length === 0,
    'downloads ' + bareDownloads + ', it said "' + bareNote + '"' +
      (bareShame.length === 0 ? '' : ', shame words ' + bareShame.join(', ')));

  await bare.context.close();
}

/* ======================================================================
   The manifest, asked of the server rather than of the disk.
   ====================================================================== */

async function manifestRun() {
  const response = await fetch(MANIFEST_URL);
  const body = await response.text();
  let parsed = null;
  try {
    parsed = JSON.parse(body);
  } catch (err) {
    parsed = null;
  }
  const icons = parsed !== null && Array.isArray(parsed.icons) ? parsed.icons : [];
  const statuses = [];
  for (let i = 0; i < icons.length; i += 1) {
    const iconUrl = ORIGIN + String(icons[i].src);
    try {
      const iconResponse = await fetch(iconUrl);
      await iconResponse.arrayBuffer();
      statuses.push(String(icons[i].sizes) + ' ' + iconResponse.status);
    } catch (err) {
      statuses.push(String(icons[i].sizes) + ' unreachable');
    }
  }
  const allOk = statuses.length === 2 && statuses.every(function (row) {
    return row.indexOf(' 200') !== -1;
  });

  check(NAME.manifest,
    response.status === 200 && parsed !== null && parsed.name === 'Garden of Life' &&
      parsed.start_url === '/garden-of-life' && parsed.display === 'standalone' && allOk,
    'HTTP ' + response.status + ', name "' + (parsed === null ? 'unparseable' : parsed.name) +
      '", start_url "' + (parsed === null ? '' : parsed.start_url) + '", display "' +
      (parsed === null ? '' : parsed.display) + '", icons ' + statuses.join(' and '));

  const html = await readFile(INDEX_PATH, 'utf8');
  check(NAME.manifestLinked,
    /<link[^>]+rel="manifest"[^>]+href="[^"]*manifest\.webmanifest"/.test(html),
    /rel="manifest"/.test(html) ? 'the head carries the manifest link' :
      'no manifest link in the head at all');
}

/* ---- judging ------------------------------------------------------------ */

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

async function run(browser) {
  await photoRun(browser);
  await audioRun(browser);
  await shareRun(browser);
  await manifestRun();
}

async function main() {
  const lines = JSON.parse(await readFile(BANK_PATH, 'utf8'));
  bank = lines !== null && typeof lines === 'object' && lines.events !== null &&
    typeof lines.events === 'object' ? lines.events : Object.create(null);

  await mkdir(SCRATCH, { recursive: true });
  const fixture = makePng(48, 48);
  await writeFile(FIXTURE, fixture);
  const readBack = readPng(await readFile(FIXTURE));
  check(NAME.fixtureMade,
    readBack.signature && readBack.width === 48 && readBack.height === 48 &&
      FIXTURE.indexOf(repoRoot) === -1 && templatesFor('photo_result').length > 0,
    readBack.bytes + ' byte png at ' + readBack.width + 'x' + readBack.height + ', written to ' +
      SCRATCH + ' (inside the repo: ' + (FIXTURE.indexOf(repoRoot) !== -1) + '), ' +
      templatesFor('photo_result').length + ' photo_result lines on disk');

  const portFree = await waitForFreePort(5000);
  if (!portFree) {
    process.stdout.write('Garden of Life phase 3 QA cannot start: port ' + PORT +
      ' is still held after 5s, so this run would be driving a server it does not ' +
      'own and the results would be worthless. Find the holder with ' +
      '"lsof -nP -iTCP:' + PORT + ' -sTCP:LISTEN" and stop it, or set GOL_P3_PORT.\n');
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
  process.stdout.write('\nGarden of Life phase 3 QA\n');
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
