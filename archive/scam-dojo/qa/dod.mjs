#!/usr/bin/env node
/*
  Scam Dojo definition of done suite.

  Fourteen checks, A to N. A reads the content files straight off disk. B to J
  drive the real UI at a phone viewport: fourteen rounds end to end, a benign
  tap, a tell tap, the comply walkthrough, a reload, and an error tally kept for
  the whole session. K to N are the regression floor under the fix round: double
  taps, the visibility of the teaching beats, a dropped content fetch, and the
  payment mechanism an explanation is allowed to name.

  Run from the repo root with the dev server up on PORT=4186.
  Self contained on purpose: its own port, its own state clearing, no import
  from smoke.mjs, so either file can be run or rewritten without the other.
*/
import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import path from 'node:path';

const runCommand = promisify(execFile);

const PORT = 4186;
const TARGET = 'http://localhost:' + PORT + '/archive/scam-dojo';
const STORAGE_KEY = 'ctrlai:scam-dojo';

// shared/ai.js returns this whenever an event is missing from the bank. A
// finished build must never render it, so it is the tripwire for missing content.
const NEUTRAL_FALLBACK = 'Take your time. There is no wrong answer here.';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CONTENT_DIR = path.join(HERE, '..', 'content');
const REPO_ROOT = path.join(HERE, '..', '..', '..');
const GAME_DIR = 'games/archive/scam-dojo';

const TELLS = [
  'urgency',
  'secrecy',
  'unusual_payment',
  'no_callback',
  'too_good',
  'detail_fishing',
  'penalty_threat',
  'official_transfer'
];

const BANNED_EXACT = ['DBS', 'OCBC', 'UOB', 'POSB', 'CPF', 'IRAS', 'MOM', 'ICA', 'SPF', 'LTA', 'HDB'];
const BANNED_LOOSE = [
  'singtel', 'starhub', 'singpost', 'shopee', 'lazada', 'grab',
  'dhl', 'fedex', 'maybank', 'citibank', 'hsbc', 'whatsapp'
];

// Written as an escape on purpose. The rule is that no committed file under this
// game carries a U+2014, and the checker enforcing it is a committed file.
const EM_DASH = '\u2014';
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/u;
const SLOT_PATTERN = /\{([a-zA-Z0-9_]+)\}/g;

const SCRIPT_COUNT = 9;
const MIN_FAMILIES = 8;
const MIN_LINES = 6;
const MAX_LINES = 8;
const TELLS_PER_SCRIPT = 3;
const MIN_LINE_VARIANTS = 5;
const MIN_BANK_VARIANTS = 6;
const MIN_TEMPLATE_CHARS = 15;
const MIN_TRACKED_FILES = 11;
const TOTAL_ROUNDS = 12;
const ROTATION_WINDOW = 2;

// Events that are not a script line render across every script, so their slots
// come from whatever round happens to be running and any of them can be empty.
const SUPPORT_PREFIXES = ['affirm_', 'benign_', 'recap_', 'walkthrough_', 'shield_earned'];

// A word that can only sit in front of punctuation because something was cut out
// from between them. Counted against the same pattern in the original template,
// so a sentence that legitimately ends "listening for." is not a hit.
const HANGING_WORD = /\b(the|a|an|of|for|into|to|is|only|worth)\s*([,.!?;:])/gi;
const DOUBLE_PUNCT = /[,.!?;:]\s*[,.!?;:]/g;
const DOUBLE_SPACE = /\s{2}/;

// The game ignores a tap that lands within 350ms of a control appearing, so a
// double tap cannot act on a button that was not there for the first tap. A
// script taps faster than any hand, so it waits the window out first.
const INPUT_GUARD_MS = 350;
const GUARD_WAIT = 450;
const DOUBLE_TAP_GAP = 80;
const CONTINUE_TAP_GAP = 90;
const SETTLE_MS = 350;
const WIDE_WIDTH = 390;
const NARROW_WIDTH = 360;
const VIEWPORT_HEIGHT = 844;
const BODY_FLOOR_PX = 28;

const CONTENT_GLOB = '**/archive/scam-dojo/content/*.json';
const MECHANISM_TELL = 'unusual_payment';

// What names a payment mechanism out loud. Used both ways: to read the mechanism
// out of a quoted line, and to catch an explanation naming one the line never used.
const MECHANISM_TERMS = {
  voucher: [/\bvouchers?\b/i, /\bgift cards?\b/i, /\bcards?\b/i, /\bcodes?\b/i, /\bscratch\b/i],
  courier: [
    /\bcouriers?\b/i,
    /\bcollectors?\b/i,
    /\bat (your|the) door\b/i,
    /\bto your (flat|door)\b/i,
    /\bvoid deck\b/i,
    /\benvelopes?\b/i,
    /\blift landing\b/i
  ]
};
const ACCOUNT_TERM = /\baccounts?\b/i;

// Nothing on a failure screen is allowed to read as the player's mistake.
const SCOLDING = [/\bwrong\b/i, /\bfail(s|ed|ing|ure)?\b/i, /error code/i, /\binvalid\b/i];

/* ---- runner -------------------------------------------------------------- */

const results = [];

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function note(line) {
  console.log('     ' + line);
}

async function check(id, title, fn) {
  console.log('');
  console.log(id + '. ' + title.toUpperCase());
  try {
    await fn();
    results.push({ id: id, title: title, status: 'PASS', message: '' });
    return true;
  } catch (error) {
    const message = error && error.message ? error.message : String(error);
    console.log('     FAIL: ' + message);
    results.push({ id: id, title: title, status: 'FAIL', message: message });
    return false;
  }
}

function skip(id, title, reason) {
  console.log('');
  console.log(id + '. ' + title.toUpperCase());
  console.log('     SKIPPED: ' + reason);
  results.push({ id: id, title: title, status: 'SKIP', message: reason });
}

/* ---- shared helpers ------------------------------------------------------ */

// Mirrors fillSlots plus tidy in shared/ai.js: what a template looks like when
// the round happens to carry none of the slots it names.
function collapseSlots(template) {
  return String(template)
    .replace(SLOT_PATTERN, '')
    .replace(/\s+([,.!?;:])/g, '$1')
    .replace(/\(\s*\)/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function slotsNamedBy(template) {
  const names = [];
  let match = null;
  SLOT_PATTERN.lastIndex = 0;
  while ((match = SLOT_PATTERN.exec(String(template))) !== null) {
    names.push(match[1]);
  }
  return names;
}

function tallyMatches(text, pattern) {
  const counts = new Map();
  pattern.lastIndex = 0;
  let match = null;
  while ((match = pattern.exec(text)) !== null) {
    const key = match[0].toLowerCase().replace(/\s+/g, ' ');
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return counts;
}

// Only what the collapse introduced. "Pressure is the thing you are listening
// for." ends in a preposition in the original too, so it is not damage.
function introducedBy(original, collapsed, pattern) {
  const before = tallyMatches(original, pattern);
  const after = tallyMatches(collapsed, pattern);
  const fresh = [];
  after.forEach(function (count, key) {
    if (count > (before.get(key) || 0)) {
      fresh.push(key);
    }
  });
  return fresh;
}

function mechanismsNamedBy(text) {
  return Object.keys(MECHANISM_TERMS).filter(function (mechanism) {
    return MECHANISM_TERMS[mechanism].some(function (pattern) {
      return pattern.test(text);
    });
  });
}

// A template with its slots turned into wildcards, so a rendered sentence can be
// traced back to the pool it came from even once the slots carry real values.
function templateMatcher(template) {
  const escaped = String(template)
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\\\{[a-zA-Z0-9_]+\\\}/g, '[\\s\\S]*?');
  return new RegExp('^' + escaped + '$');
}

async function trackedFiles() {
  const done = await runCommand('git', ['ls-files', GAME_DIR], { cwd: REPO_ROOT });
  return String(done.stdout).split('\n').filter(function (name) {
    return name !== '';
  });
}

function unquote(text) {
  const trimmed = String(text).trim();
  if (trimmed.length >= 2 && trimmed.charAt(0) === '"' && trimmed.charAt(trimmed.length - 1) === '"') {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function pairwiseDistinct(list) {
  return new Set(list).size === list.length;
}

function firstDuplicate(list) {
  const seen = new Set();
  for (let i = 0; i < list.length; i += 1) {
    if (seen.has(list[i])) {
      return i;
    }
    seen.add(list[i]);
  }
  return -1;
}

async function readState(page) {
  const raw = await page.evaluate((key) => window.localStorage.getItem(key), STORAGE_KEY);
  return raw === null ? null : JSON.parse(raw);
}

async function transcriptOf(page) {
  return page.locator('.bubble .bubble-text').allTextContents();
}

// Any class anywhere that reads as a punishment. The recap may say a line
// slipped past; the DOM is never allowed to call the player wrong.
async function penaltyArtifact(page) {
  return page.evaluate(() => {
    const nodes = document.querySelectorAll('*');
    for (let i = 0; i < nodes.length; i += 1) {
      const raw = nodes[i].className;
      const value = typeof raw === 'string' ? raw : (raw && raw.baseVal) || '';
      if (/wrong|fail|penal/i.test(value)) {
        return nodes[i].tagName.toLowerCase() + '.' + value;
      }
    }
    return null;
  });
}

async function bubbleMap(page) {
  return page.evaluate(() => {
    return Array.from(document.querySelectorAll('.bubble')).map((node) => ({
      text: node.querySelector('.bubble-text').textContent,
      tell: node.dataset.tell || ''
    }));
  });
}

async function recapItems(page) {
  return page.evaluate(() => {
    return Array.from(document.querySelectorAll('.recap-item')).map((node) => ({
      caught: node.dataset.caught,
      line: node.querySelector('.recap-line').textContent,
      tell: node.querySelector('.recap-tell').textContent,
      status: node.querySelector('.recap-status').textContent,
      why: node.querySelector('.recap-why').textContent
    }));
  });
}

/* ---- helpers for the regression checks, K to N --------------------------- */

// Every new section starts from a known screen rather than from whatever the
// previous one left behind. A reload keeps storage, which is the point.
async function resetToHome(page) {
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-screen="home"]:not([hidden])', { timeout: 8000 });
}

// Home to the first line of a call.
async function openCall(page, label) {
  await page.locator('#answer-call').click();
  await page.waitForSelector('[data-screen="ring"]:not([hidden])', { timeout: 8000 });
  await page.locator('#answer-btn').click();
  await page.waitForSelector('[data-screen="call"]:not([hidden])', { timeout: 8000 });
  const screen = page.locator('[data-screen="call"]');
  const script = await screen.getAttribute('data-script');
  assert(script !== null && script !== '', label + ': call screen carries no data-script');
  return { family: await screen.getAttribute('data-family'), script: script };
}

async function revealAll(page, label) {
  for (let guard = 0; guard < 30; guard += 1) {
    if ((await page.locator('#hangup-btn').count()) > 0) {
      return;
    }
    await page.locator('#listen-btn').click();
  }
  assert(false, label + ': never reached the hang up choice');
}

function scriptSpec(shared, id) {
  const found = shared.content.structure.scripts.filter(function (script) {
    return String(script.id) === String(id);
  });
  assert(found.length === 1, 'no script "' + id + '" in call-structure.json');
  return found[0];
}

// Records every click that reaches the document, with the button it landed on
// and when. That is how a section proves a tap really fired and was ignored,
// rather than passing because the tap missed.
async function installTapLog(page) {
  await page.evaluate(() => {
    window.__dodTaps = [];
    if (window.__dodTapHook === undefined) {
      window.__dodTapHook = function (event) {
        const target = event.target;
        const node = target && typeof target.closest === 'function' ? target.closest('button') : null;
        window.__dodTaps.push({ id: node === null ? '' : node.id, at: Date.now() });
      };
      document.addEventListener('click', window.__dodTapHook, true);
    }
  });
}

async function readTapLog(page) {
  return page.evaluate(() => (window.__dodTaps || []).map((entry) => ({ id: entry.id, at: entry.at })));
}

async function tapCentre(page, box) {
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
}

async function seedState(page, patch) {
  await page.evaluate(
    (args) => {
      const raw = window.localStorage.getItem(args.key);
      const held = raw === null ? {} : JSON.parse(raw);
      window.localStorage.setItem(args.key, JSON.stringify(Object.assign({}, held, args.patch)));
    },
    { key: STORAGE_KEY, patch: patch }
  );
}

// The whole session error tally belongs to J. These sections run after it, so
// each one watches its own stretch for a thrown page error.
function errorWatch(shared) {
  const start = shared.pageErrors.length;
  return function (where) {
    assert(
      shared.pageErrors.length === start,
      where + ' threw ' + (shared.pageErrors.length - start) + ' page error(s): ' +
        shared.pageErrors.slice(start).join('; ')
    );
  };
}

/*
  One round from home to recap. Options:
    tapBenign  tap the first benign bubble as it appears
    tapTell    tap the first tell bubble as it appears
    comply     take the walkthrough instead of hanging up
    home       return to home afterwards
*/
async function playRound(page, label, options) {
  const opts = options || {};

  await page.locator('#answer-call').click();
  await page.waitForSelector('[data-screen="ring"]:not([hidden])', { timeout: 8000 });
  await page.locator('#answer-btn').click();
  await page.waitForSelector('[data-screen="call"]:not([hidden])', { timeout: 8000 });

  const callScreen = page.locator('[data-screen="call"]');
  const family = await callScreen.getAttribute('data-family');
  const script = await callScreen.getAttribute('data-script');
  assert(family !== null && family !== '', label + ': call screen carries no data-family');
  assert(script !== null && script !== '', label + ': call screen carries no data-script');

  const tapped = { benign: null, tell: null, tellKind: null };

  // Tries the two mid call taps against whatever is on screen right now. Called
  // between reveals and once more after the last line, so the tell on the final
  // line of a script is as reachable as one in the middle.
  async function tryTaps() {
    if (opts.tapTell && tapped.tell === null) {
      const target = page.locator('.bubble[data-tell]:not([data-tell=""])').first();
      if ((await target.count()) > 0) {
        tapped.tellKind = await target.getAttribute('data-tell');
        tapped.tell = await target.locator('.bubble-text').textContent();
        await target.click();
        await page.waitForSelector('.tap-note[data-kind="catch"]', { timeout: 8000 });
      }
    }
    if (opts.tapBenign && tapped.benign === null) {
      const target = page.locator('.bubble[data-tell=""]').first();
      if ((await target.count()) > 0) {
        tapped.benign = await target.locator('.bubble-text').textContent();
        await target.click();
        await page.waitForSelector('.tap-note[data-kind="benign"]', { timeout: 8000 });
        if (typeof opts.afterBenign === 'function') {
          await opts.afterBenign();
        }
      }
    }
  }

  for (let guard = 0; guard < 30; guard += 1) {
    if ((await page.locator('#hangup-btn').count()) > 0) {
      break;
    }
    await tryTaps();
    await page.locator('#listen-btn').click();
  }
  await tryTaps();

  assert((await page.locator('#hangup-btn').count()) > 0, label + ': never reached the hang up choice');
  // The choice pair has just replaced Listen under the same thumb, so the guard
  // window is waited out before either choice is tapped.
  await page.waitForTimeout(GUARD_WAIT);

  const transcript = await transcriptOf(page);
  const bubbles = await bubbleMap(page);
  const tellCount = bubbles.filter((b) => b.tell !== '').length;

  let walkthroughSteps = 0;
  if (opts.comply) {
    await page.locator('#comply-btn').click();
    await page.waitForSelector('#walkthrough-continue', { timeout: 8000 });
    await page.waitForSelector('.walkthrough-step-intro', { timeout: 8000 });

    for (let guard = 0; guard < 30; guard += 1) {
      if ((await page.locator('[data-screen="recap"]:not([hidden])').count()) > 0) {
        break;
      }
      const before = await page.locator('.walkthrough-step').count();
      // Same guard on the continue control: a card that just landed cannot be
      // skipped by a second tap, so each tap waits the window out.
      await page.waitForTimeout(GUARD_WAIT);
      await page.locator('#walkthrough-continue').click();
      await page.waitForFunction(
        (count) =>
          document.querySelectorAll('.walkthrough-step').length > count ||
          document.querySelector('[data-screen="recap"]:not([hidden])') !== null,
        before,
        { timeout: 8000 }
      );
    }
    walkthroughSteps = await page.locator('.walkthrough-step').count();
  } else {
    await page.locator('#hangup-btn').click();
  }

  await page.waitForSelector('[data-screen="recap"]:not([hidden])', { timeout: 8000 });

  if (opts.home) {
    await page.locator('#back-home-btn').click();
    await page.waitForSelector('[data-screen="home"]:not([hidden])', { timeout: 8000 });
  }

  return {
    family: family,
    script: script,
    transcript: transcript.join(' | '),
    lines: transcript,
    bubbles: bubbles,
    tellCount: tellCount,
    walkthroughSteps: walkthroughSteps,
    tapped: tapped
  };
}

/* ---- A. static content integrity ----------------------------------------- */

async function checkStatic(shared) {
  const structureText = await readFile(path.join(CONTENT_DIR, 'call-structure.json'), 'utf8');
  const bankText = await readFile(path.join(CONTENT_DIR, 'scam-scripts.json'), 'utf8');
  const structure = JSON.parse(structureText);
  const bank = JSON.parse(bankText);
  shared.content = { structure: structure, bank: bank };
  note('both content files parse as JSON');

  const scripts = Array.isArray(structure.scripts) ? structure.scripts : [];
  assert(scripts.length === SCRIPT_COUNT, 'expected ' + SCRIPT_COUNT + ' scripts, found ' + scripts.length);

  const families = new Set(scripts.map((s) => s.family));
  assert(
    families.size >= MIN_FAMILIES,
    'expected at least ' + MIN_FAMILIES + ' families, found ' + families.size + ': ' + [...families].join(', ')
  );
  note(scripts.length + ' scripts across ' + families.size + ' families: ' + [...families].join(', '));

  const tellUse = new Map();
  const benignUse = new Set();

  for (let i = 0; i < scripts.length; i += 1) {
    const script = scripts[i];
    const id = String(script.id);
    const lines = Array.isArray(script.lines) ? script.lines : [];
    assert(
      lines.length >= MIN_LINES && lines.length <= MAX_LINES,
      id + ' has ' + lines.length + ' lines, expected ' + MIN_LINES + ' to ' + MAX_LINES
    );

    const scriptTells = new Set();
    for (let j = 0; j < lines.length; j += 1) {
      const line = lines[j];
      const variants = bank[line.event];
      assert(Array.isArray(variants), id + ' line ' + (j + 1) + ' event "' + line.event + '" is not in the bank');
      assert(
        variants.length >= MIN_LINE_VARIANTS,
        id + ' event "' + line.event + '" has ' + variants.length + ' variants, expected ' + MIN_LINE_VARIANTS + '+'
      );
      if (typeof line.tell === 'string' && line.tell !== '') {
        scriptTells.add(line.tell);
        tellUse.set(line.tell, (tellUse.get(line.tell) || new Set()).add(id));
      } else {
        assert(
          typeof line.benign === 'string' && line.benign !== '',
          id + ' line ' + (j + 1) + ' has neither a tell nor a benign category'
        );
        benignUse.add(line.benign);
      }
    }
    assert(
      scriptTells.size === TELLS_PER_SCRIPT,
      id + ' carries ' + scriptTells.size + ' distinct tells, expected exactly ' + TELLS_PER_SCRIPT
    );
  }
  note('every script runs ' + MIN_LINES + ' to ' + MAX_LINES + ' lines with exactly ' + TELLS_PER_SCRIPT + ' distinct tells');
  note('every line event resolves to a bank entry with ' + MIN_LINE_VARIANTS + '+ variants');

  const labels = structure.tellLabels && typeof structure.tellLabels === 'object' ? structure.tellLabels : {};
  for (let i = 0; i < TELLS.length; i += 1) {
    const tell = TELLS[i];
    assert(typeof labels[tell] === 'string' && labels[tell] !== '', 'tellLabels is missing "' + tell + '"');
  }
  note('tellLabels covers all ' + TELLS.length + ' tells');

  const usedTells = [...tellUse.keys()].sort();
  const expected = [...TELLS].sort();
  assert(
    usedTells.join(',') === expected.join(','),
    'scripts use tells ' + usedTells.join(',') + ' but the model declares ' + expected.join(',')
  );

  for (let i = 0; i < usedTells.length; i += 1) {
    const tell = usedTells[i];
    const recapKey = 'recap_' + tell;
    const stepKey = 'walkthrough_step_' + tell;
    assert(Array.isArray(bank[recapKey]), 'missing bank event ' + recapKey);
    assert(Array.isArray(bank[stepKey]), 'missing bank event ' + stepKey);
    assert(
      bank[recapKey].length >= MIN_BANK_VARIANTS,
      recapKey + ' has ' + bank[recapKey].length + ' variants, expected ' + MIN_BANK_VARIANTS + '+'
    );
    assert(
      bank[stepKey].length >= MIN_BANK_VARIANTS,
      stepKey + ' has ' + bank[stepKey].length + ' variants, expected ' + MIN_BANK_VARIANTS + '+'
    );
    const scriptCount = tellUse.get(tell).size;
    assert(
      scriptCount >= 2,
      'tell "' + tell + '" appears in only ' + scriptCount + ' script, expected 2 or more'
    );
  }
  note('every tell has recap_ and walkthrough_step_ banks with ' + MIN_BANK_VARIANTS + '+ variants and lives in 2+ scripts');

  const benignList = [...benignUse].sort();
  for (let i = 0; i < benignList.length; i += 1) {
    const key = 'benign_' + benignList[i];
    assert(Array.isArray(bank[key]) && bank[key].length > 0, 'missing bank event ' + key);
  }
  note('benign categories covered: ' + benignList.join(', '));

  const files = [
    { name: 'call-structure.json', text: structureText },
    { name: 'scam-scripts.json', text: bankText }
  ];
  const hits = [];
  for (let i = 0; i < files.length; i += 1) {
    for (let j = 0; j < BANNED_EXACT.length; j += 1) {
      if (new RegExp('\\b' + BANNED_EXACT[j] + '\\b').test(files[i].text)) {
        hits.push(files[i].name + ' contains ' + BANNED_EXACT[j]);
      }
    }
    for (let j = 0; j < BANNED_LOOSE.length; j += 1) {
      if (new RegExp('\\b' + BANNED_LOOSE[j] + '\\b', 'i').test(files[i].text)) {
        hits.push(files[i].name + ' contains ' + BANNED_LOOSE[j]);
      }
    }
    assert(!EMOJI.test(files[i].text), files[i].name + ' contains an emoji');
  }
  assert(hits.length === 0, 'real institution names found: ' + hits.join('; '));
  note('content clean of ' + (BANNED_EXACT.length + BANNED_LOOSE.length) + ' banned names and of emoji');

  // The em dash rule covers every committed file in the game, this checker
  // included, so the rule can no longer be broken by the file enforcing it.
  const tracked = await trackedFiles();
  assert(
    tracked.length >= MIN_TRACKED_FILES,
    'git ls-files returned ' + tracked.length + ' files under ' + GAME_DIR + ', expected ' + MIN_TRACKED_FILES + '+'
  );
  assert(
    tracked.indexOf(GAME_DIR + '/qa/dod.mjs') !== -1,
    'the tracked file list does not include this checker, so it is scanning the wrong tree'
  );
  const typography = [];
  for (let i = 0; i < tracked.length; i += 1) {
    const text = await readFile(path.join(REPO_ROOT, tracked[i]), 'utf8');
    if (text.indexOf(EM_DASH) !== -1) {
      typography.push(tracked[i] + ' contains an em dash');
    }
    if (EMOJI.test(text)) {
      typography.push(tracked[i] + ' contains an emoji');
    }
  }
  assert(typography.length === 0, typography.join('; '));
  note('all ' + tracked.length + ' tracked files under ' + GAME_DIR + ' hold zero U+2014 and zero emoji');

  /*
    Two kinds of event, two honest questions.

    A line event belongs to one script and that script rolls its slots, so the
    real invariant is that it never names a slot its own script cannot supply.
    A support event renders across every script, so it has to stay readable with
    every slot empty: terminal punctuation, enough length, and no word left
    hanging in front of punctuation by the collapse itself.
  */
  const lineEvents = new Set();
  let lineTemplates = 0;
  for (let i = 0; i < scripts.length; i += 1) {
    const script = scripts[i];
    const pool = script.slots && typeof script.slots === 'object' ? script.slots : {};
    const available = new Set(
      Object.keys(pool).filter(function (name) {
        return Array.isArray(pool[name]) && pool[name].length > 0;
      })
    );
    for (let j = 0; j < script.lines.length; j += 1) {
      const event = script.lines[j].event;
      lineEvents.add(event);
      const variants = bank[event];
      for (let k = 0; k < variants.length; k += 1) {
        lineTemplates += 1;
        const named = slotsNamedBy(variants[k]);
        for (let s = 0; s < named.length; s += 1) {
          assert(
            available.has(named[s]),
            event + '[' + k + '] names {' + named[s] + '} but ' + script.id +
              ' rolls only ' + [...available].join(', ')
          );
        }
      }
    }
  }
  note(lineTemplates + ' line templates name only slots their own script rolls');

  const bankKeys = Object.keys(bank);
  let supportTemplates = 0;
  let supportEvents = 0;
  for (let i = 0; i < bankKeys.length; i += 1) {
    const key = bankKeys[i];
    const variants = bank[key];
    assert(Array.isArray(variants), 'bank event ' + key + ' is not an array');
    if (lineEvents.has(key)) {
      continue;
    }
    const isSupport = SUPPORT_PREFIXES.some(function (prefix) {
      return key.indexOf(prefix) === 0;
    });
    assert(
      isSupport,
      'bank event ' + key + ' is neither used by a script line nor named like a support event, so nothing checks it'
    );
    supportEvents += 1;
    for (let j = 0; j < variants.length; j += 1) {
      const where = key + '[' + j + ']';
      const original = String(variants[j]);
      const collapsed = collapseSlots(original);
      assert(
        /[.!?]$/.test(collapsed),
        where + ' does not end in terminal punctuation with slots empty: "' + collapsed + '"'
      );
      assert(
        collapsed.length >= MIN_TEMPLATE_CHARS,
        where + ' collapses to ' + collapsed.length + ' chars, expected ' + MIN_TEMPLATE_CHARS + '+'
      );
      const hanging = introducedBy(original, collapsed, HANGING_WORD);
      assert(
        hanging.length === 0,
        where + ' collapses to a hanging "' + hanging.join('", "') + '": "' + collapsed + '"'
      );
      const doubled = introducedBy(original, collapsed, DOUBLE_PUNCT);
      assert(
        doubled.length === 0,
        where + ' collapses to doubled punctuation "' + doubled.join('", "') + '": "' + collapsed + '"'
      );
      assert(!DOUBLE_SPACE.test(collapsed), where + ' collapses to a doubled space: "' + collapsed + '"');
      supportTemplates += 1;
    }
  }
  note(
    supportTemplates + ' support templates across ' + supportEvents + ' events end in terminal punctuation, run ' +
    MIN_TEMPLATE_CHARS + '+ chars, and gain no hanging word, doubled punctuation or doubled space when every slot is empty'
  );
}

/* ---- B. zero instructions ------------------------------------------------ */

async function checkZeroInstructions(page) {
  assert(
    (await page.locator('[data-screen="home"]:not([hidden])').count()) === 1,
    'home screen is not the visible screen'
  );

  const filled = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('.btn'))
      .filter((node) => node.closest('[hidden]') === null)
      .filter((node) => !node.classList.contains('btn-plain') && !node.classList.contains('btn-quiet'))
      .map((node) => (node.textContent || '').trim());
  });
  assert(
    filled.length === 1,
    'home should offer exactly one filled primary action, found ' + filled.length + ': ' + filled.join(' / ')
  );
  note('one filled primary action and nothing else: "' + filled[0] + '"');

  // Zero instructions means the button is the instruction. Any visible prose on
  // this screen has to be a label, not a paragraph of how to play.
  const prose = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('[data-screen="home"] p, [data-screen="home"] li'))
      .filter((node) => {
        const rect = node.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      })
      .map((node) => (node.textContent || '').trim())
      .filter((text) => text !== '');
  });
  const longest = prose.reduce((a, b) => (b.length > a.length ? b : a), '');
  for (let i = 0; i < prose.length; i += 1) {
    const text = prose[i];
    const sentences = (text.match(/[.!?]/g) || []).length;
    assert(text.length <= 60, 'home paragraph reads as an instruction (' + text.length + ' chars): "' + text + '"');
    assert(sentences <= 1, 'home paragraph runs to ' + sentences + ' sentences: "' + text + '"');
  }
  note(prose.length + ' visible labels on home, longest is ' + longest.length + ' chars: "' + longest + '"');
}

/* ---- C. three consecutive rounds differ ---------------------------------- */

async function checkThreeRounds(page, shared) {
  const stored = await readState(page);
  assert(stored === null || stored.streak === 0, 'localStorage was not fresh at the start of the run');

  for (let i = 1; i <= 3; i += 1) {
    const played = await playRound(page, 'round ' + i, { home: true });
    shared.rounds.push(played);
    note('round ' + i + ': family "' + played.family + '", script "' + played.script + '", ' + played.lines.length + ' lines');
  }

  const families = shared.rounds.map((r) => r.family);
  assert(pairwiseDistinct(families), 'families repeated across the first three rounds: ' + families.join(', '));

  const transcripts = shared.rounds.map((r) => r.transcript);
  const dup = firstDuplicate(transcripts);
  assert(dup === -1, 'round ' + (dup + 1) + ' repeated an earlier transcript word for word');
  note('three rounds, three different families and three different transcripts');
}

/* ---- D. variety under repetition ----------------------------------------- */

async function checkVariety(page, shared) {
  for (let i = shared.rounds.length + 1; i <= TOTAL_ROUNDS; i += 1) {
    const played = await playRound(page, 'round ' + i, { home: true });
    shared.rounds.push(played);
  }

  const transcripts = shared.rounds.map((r) => r.transcript);
  const dup = firstDuplicate(transcripts);
  assert(
    dup === -1,
    'round ' + (dup + 1) + ' repeated an earlier transcript word for word, so repetition is visible to the player'
  );
  note('all ' + TOTAL_ROUNDS + ' transcripts are pairwise distinct');

  const byFamily = new Map();
  for (let i = 0; i < shared.rounds.length; i += 1) {
    const round = shared.rounds[i];
    if (!byFamily.has(round.family)) {
      byFamily.set(round.family, []);
    }
    byFamily.get(round.family).push(round);
  }

  let repeated = 0;
  const repeatNotes = [];
  byFamily.forEach((rounds, family) => {
    if (rounds.length < 2) {
      return;
    }
    repeated += 1;
    const inner = rounds.map((r) => r.transcript);
    assert(
      pairwiseDistinct(inner),
      'family "' + family + '" played ' + rounds.length + ' times with a repeated transcript'
    );
    const scripts = new Set(rounds.map((r) => r.script));
    repeatNotes.push(family + ' x' + rounds.length + ' (' + scripts.size + ' script(s), all transcripts differ)');
  });

  if (repeated > 0) {
    note('same family repeat exercised: yes, ' + repeated + ' family(ies) came round again');
    for (let i = 0; i < repeatNotes.length; i += 1) {
      note('  ' + repeatNotes[i]);
    }
  } else {
    note('same family repeat exercised: no, every round drew a different family');
  }

  const families = shared.rounds.map((r) => r.family);
  for (let i = ROTATION_WINDOW; i < families.length; i += 1) {
    const window = families.slice(i - ROTATION_WINDOW, i);
    assert(
      window.indexOf(families[i]) === -1,
      'round ' + (i + 1) + ' repeated family "' + families[i] + '" from the previous ' + ROTATION_WINDOW + ' rounds'
    );
  }
  note('rotation honored: none of the last ' + (families.length - ROTATION_WINDOW) + ' rounds reused a family from the previous ' + ROTATION_WINDOW);
}

/* ---- E and F. benign taps teach, tell taps affirm ------------------------- */

async function checkTaps(page, shared) {
  const before = await readState(page);
  let duringBenign = null;

  const played = await playRound(page, 'tap round', {
    tapBenign: true,
    tapTell: true,
    afterBenign: async () => {
      duringBenign = await readState(page);
    }
  });
  shared.tapRound = played;

  assert(played.tapped.benign !== null, 'no benign bubble turned up to tap');
  assert(played.tapped.tell !== null, 'no tell bubble turned up to tap');

  const benignNote = (await page.locator('.tap-note[data-kind="benign"]').first().textContent()).trim();
  assert(benignNote !== '', 'the benign tap note is empty');
  assert(benignNote !== NEUTRAL_FALLBACK, 'the benign tap fell through to the neutral fallback');
  assert(benignNote.indexOf('{') === -1, 'the benign tap note leaked a slot: ' + benignNote);
  note('benign tap answered with: "' + benignNote + '"');

  assert(duringBenign !== null, 'could not read storage at the moment of the benign tap');
  assert(
    duringBenign.streak === before.streak,
    'streak moved on a benign tap: ' + before.streak + ' to ' + duringBenign.streak
  );
  assert(
    duringBenign.roundsPlayed === before.roundsPlayed,
    'roundsPlayed moved on a benign tap: ' + before.roundsPlayed + ' to ' + duringBenign.roundsPlayed
  );
  note('streak and roundsPlayed both held at ' + before.streak + ' and ' + before.roundsPlayed + ' through the benign tap');

  const artifact = await penaltyArtifact(page);
  assert(artifact === null, 'a penalty class appeared in the DOM: ' + artifact);
  note('no class anywhere reads wrong, fail or penal');

  const caughtBubble = page.locator('.bubble.is-caught').first();
  assert((await caughtBubble.count()) === 1, 'the tapped tell bubble never gained is-caught');
  assert(
    (await caughtBubble.locator('.bubble-caught').count()) === 1,
    'the caught bubble carries no Caught label'
  );
  const catchNote = (await page.locator('.tap-note[data-kind="catch"]').first().textContent()).trim();
  assert(catchNote !== '', 'the catch note is empty');
  assert(catchNote !== NEUTRAL_FALLBACK, 'the catch note fell through to the neutral fallback');
  note('tell tap answered with: "' + catchNote + '"');

  const items = await recapItems(page);
  assert(items.length === played.tellCount, 'recap lists ' + items.length + ' tells, the call carried ' + played.tellCount);

  const tappedText = played.tapped.tell.trim();
  let matched = 0;
  let slipped = 0;
  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    const line = unquote(item.line);
    if (line === tappedText) {
      assert(item.caught === 'true', 'the tell you tapped is marked data-caught="' + item.caught + '"');
      matched += 1;
    } else {
      assert(item.caught === 'false', 'an untapped tell is marked data-caught="' + item.caught + '"');
      slipped += 1;
      assert(
        !/wrong|missed it|failed/i.test(item.status),
        'the slipped label scolds the player: "' + item.status + '"'
      );
    }
  }
  assert(matched === 1, 'the tapped line does not appear once in the recap, found ' + matched);
  assert(slipped >= 1, 'no untapped tell was left to check the slipped wording against');
  note(
    'recap marks the caught line data-caught="true" and ' + slipped +
    ' untapped tell(s) data-caught="false", worded "' + items.find((i) => i.caught === 'false').status + '"'
  );

  await page.locator('#back-home-btn').click();
  await page.waitForSelector('[data-screen="home"]:not([hidden])', { timeout: 8000 });
}

/* ---- G. comply path teaches ---------------------------------------------- */

async function checkComply(page, shared) {
  const before = await readState(page);
  const played = await playRound(page, 'comply round', { comply: true });
  shared.complyRound = played;

  assert(
    played.walkthroughSteps === 1 + played.tellCount,
    'walkthrough rendered ' + played.walkthroughSteps + ' steps, expected ' + (1 + played.tellCount) +
    ' (intro plus ' + played.tellCount + ' tells)'
  );
  note('walkthrough rendered 1 intro plus ' + played.tellCount + ' consequence steps');

  const intro = (await page.locator('.walkthrough-step-intro .walkthrough-lead').textContent()).trim();
  assert(intro !== NEUTRAL_FALLBACK, 'the walkthrough intro fell through to the neutral fallback');

  const steps = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('.walkthrough-step[data-tell]')).map((node) => ({
      tell: node.dataset.tell,
      quote: node.querySelector('.walkthrough-quote').textContent,
      consequence: node.querySelector('.walkthrough-line').textContent
    }));
  });
  assert(steps.length === played.tellCount, 'found ' + steps.length + ' consequence steps for ' + played.tellCount + ' tells');

  const byText = new Map();
  for (let i = 0; i < played.bubbles.length; i += 1) {
    byText.set(played.bubbles[i].text.trim(), played.bubbles[i].tell);
  }

  for (let i = 0; i < steps.length; i += 1) {
    const step = steps[i];
    const where = 'walkthrough step ' + (i + 1) + ' (' + step.tell + ')';
    const consequence = step.consequence.trim();
    assert(consequence !== '', where + ' has no consequence text');
    assert(consequence !== NEUTRAL_FALLBACK, where + ' fell through to the neutral fallback');
    assert(consequence.indexOf('{') === -1, where + ' leaked a slot: ' + consequence);

    const quoted = unquote(step.quote);
    assert(byText.has(quoted), where + ' quotes a line that was never said: "' + quoted + '"');
    assert(
      byText.get(quoted) === step.tell,
      where + ' quotes a line whose tell is "' + byText.get(quoted) + '"'
    );
  }
  note('every step quotes a line the caller actually said and names that line\'s own tell');
  note('sample consequence: "' + steps[0].consequence.trim() + '"');

  assert(await page.locator('#shield-ceremony').isVisible(), 'the comply recap has no shield ceremony');
  const after = await readState(page);
  assert(
    after.streak === before.streak + 1,
    'the comply path did not award a shield: streak ' + before.streak + ' to ' + after.streak
  );
  const shown = (await page.locator('#streak-count').textContent()).trim();
  assert(shown === String(after.streak), 'the recap shows streak ' + shown + ', storage holds ' + after.streak);
  note('the comply path still earns the shield, streak ' + before.streak + ' to ' + after.streak);

  const artifact = await penaltyArtifact(page);
  assert(artifact === null, 'a penalty class appeared on the comply path: ' + artifact);
}

/* ---- H. recap depth ------------------------------------------------------ */

async function checkRecapDepth(page) {
  const items = await recapItems(page);
  assert(items.length > 0, 'the recap listed no tells at all');
  for (let i = 0; i < items.length; i += 1) {
    const why = items[i].why.trim();
    assert(why !== '', 'recap item ' + (i + 1) + ' has no explanation');
    assert(why !== NEUTRAL_FALLBACK, 'recap item ' + (i + 1) + ' fell through to the neutral fallback');
    assert(why.indexOf('{') === -1, 'recap item ' + (i + 1) + ' leaked a slot: ' + why);
  }
  const ceremony = (await page.locator('#ceremony-line').textContent()).trim();
  assert(ceremony !== '', 'the ceremony line is empty');
  assert(ceremony !== NEUTRAL_FALLBACK, 'the ceremony line fell through to the neutral fallback');
  note(items.length + ' recap explanations, all written, none the fallback, none leaking a slot');
  note('sample explanation: "' + items[0].why.trim() + '"');
}

/* ---- I. streak survives a reload ----------------------------------------- */

async function checkReload(page) {
  await page.locator('#back-home-btn').click();
  await page.waitForSelector('[data-screen="home"]:not([hidden])', { timeout: 8000 });

  const before = await readState(page);
  assert(before !== null, 'nothing was stored under ' + STORAGE_KEY);
  const shownBefore = (await page.locator('#home-streak').textContent()).trim();
  assert(shownBefore === String(before.streak), 'home shows ' + shownBefore + ', storage holds ' + before.streak);

  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('[data-screen="home"]:not([hidden])', { timeout: 8000 });

  const shownAfter = (await page.locator('#home-streak').textContent()).trim();
  assert(
    shownAfter === String(before.streak),
    'home shows streak ' + shownAfter + ' after a reload, expected ' + before.streak
  );
  const after = await readState(page);
  assert(after.streak === before.streak, 'stored streak changed across a reload');
  assert(
    after.roundsPlayed === before.roundsPlayed,
    'stored roundsPlayed changed across a reload'
  );
  assert(
    after.recentFamilies.length === ROTATION_WINDOW,
    'recentFamilies holds ' + after.recentFamilies.length + ' entries, expected ' + ROTATION_WINDOW
  );
  note('streak ' + after.streak + ' over ' + after.roundsPlayed + ' rounds survived the reload in both the page and storage');
  note('recentFamilies still holds the newest ' + ROTATION_WINDOW + ': ' + after.recentFamilies.join(', '));
}

/* ---- K. double tap safety ------------------------------------------------ */

/*
  Two double taps, both aimed at the exact pixels a control just took over.
  A senior taps twice when the first tap looks like it did nothing, so the second
  tap has to cost nothing: no walkthrough entered by accident, no teaching card
  skipped, and never a round banked twice.
*/
async function checkDoubleTap(page, shared) {
  const watch = errorWatch(shared);

  await resetToHome(page);
  const opened = await openCall(page, 'double tap round');
  const spec = scriptSpec(shared, opened.script);
  const total = spec.lines.length;

  // Stop one line short: the first tap of the double tap is the one that reveals
  // the last line and swaps the dock from Listen to the choice pair.
  for (let i = 0; i < total - 2; i += 1) {
    await page.locator('#listen-btn').click();
  }
  const shown = await page.locator('.bubble').count();
  assert(shown === total - 1, 'expected ' + (total - 1) + ' lines before the last tap, found ' + shown);
  assert((await page.locator('#hangup-btn').count()) === 0, 'the choice pair arrived a line early');

  const listenBox = await page.locator('#listen-btn').boundingBox();
  assert(listenBox !== null, 'the Listen button has no box to tap');
  await installTapLog(page);
  await tapCentre(page, listenBox);
  await page.waitForTimeout(DOUBLE_TAP_GAP);
  await tapCentre(page, listenBox);
  await page.waitForTimeout(SETTLE_MS);

  const taps = await readTapLog(page);
  assert(taps.length === 2, 'expected 2 clicks from the double tap, the page saw ' + taps.length);
  assert(taps[0].id === 'listen-btn', 'the first tap landed on "' + taps[0].id + '", expected listen-btn');
  assert(
    taps[1].id === 'hangup-btn',
    'the second tap landed on "' + taps[1].id + '": the pixels Listen vacated must belong to Hang up'
  );
  const gap = taps[1].at - taps[0].at;
  assert(
    gap < INPUT_GUARD_MS,
    'the two taps were ' + gap + 'ms apart, outside the ' + INPUT_GUARD_MS + 'ms guard, so nothing was proved'
  );
  note('two real taps ' + gap + 'ms apart, the second one landing on Hang up where Listen had been');

  assert(
    (await page.locator('[data-screen="recap"]:not([hidden])').count()) === 0,
    'the second tap acted: the call ended and the recap is on screen'
  );
  assert((await page.locator('#walkthrough').count()) === 0, 'the second tap fell through into the walkthrough');
  assert(
    (await page.locator('[data-screen="call"]').getAttribute('data-phase')) === 'call',
    'the second tap moved the call out of the call phase'
  );
  assert((await page.locator('#hangup-btn').isVisible()), 'Hang up is not on screen after the double tap');
  assert((await page.locator('#comply-btn').isVisible()), 'Do what they say is not on screen after the double tap');
  note('the choice pair is still standing, no walkthrough, no recap');

  await page.waitForTimeout(500);
  await page.locator('#hangup-btn').click();
  await page.waitForSelector('[data-screen="recap"]:not([hidden])', { timeout: 8000 });
  note('a deliberate tap after the window still hangs up and reaches the recap');

  // Second half: the continue control lives on through the walkthrough, so it is
  // the one control a double tap can hit twice for real.
  await resetToHome(page);
  const before = await readState(page);
  const complyOpened = await openCall(page, 'comply double tap round');
  const complySpec = scriptSpec(shared, complyOpened.script);
  const tellTotal = complySpec.lines.filter(function (line) {
    return typeof line.tell === 'string' && line.tell !== '';
  }).length;

  await revealAll(page, 'comply double tap round');
  await page.waitForTimeout(GUARD_WAIT);
  await page.locator('#comply-btn').click();
  await page.waitForSelector('.walkthrough-step-intro', { timeout: 8000 });

  while ((await page.locator('.walkthrough-step[data-tell]').count()) < tellTotal - 1) {
    const seen = await page.locator('.walkthrough-step').count();
    await page.waitForTimeout(GUARD_WAIT);
    await page.locator('#walkthrough-continue').click();
    await page.waitForFunction(
      (count) => document.querySelectorAll('.walkthrough-step').length > count,
      seen,
      { timeout: 8000 }
    );
  }

  await page.waitForTimeout(GUARD_WAIT);
  await installTapLog(page);
  await page.locator('#walkthrough-continue').tap();
  await page.waitForTimeout(CONTINUE_TAP_GAP);
  await page.locator('#walkthrough-continue').tap();
  await page.waitForTimeout(SETTLE_MS);

  const continueTaps = await readTapLog(page);
  assert(continueTaps.length === 2, 'expected 2 clicks on the continue control, the page saw ' + continueTaps.length);
  assert(
    continueTaps[0].id === 'walkthrough-continue' && continueTaps[1].id === 'walkthrough-continue',
    'a continue tap landed elsewhere: ' + continueTaps.map((t) => t.id || 'nothing').join(', ')
  );
  const continueGap = continueTaps[1].at - continueTaps[0].at;
  assert(
    continueGap < INPUT_GUARD_MS,
    'the continue taps were ' + continueGap + 'ms apart, outside the guard, so nothing was proved'
  );

  const stepsNow = await page.locator('.walkthrough-step[data-tell]').count();
  assert(stepsNow === tellTotal, 'the walkthrough holds ' + stepsNow + ' steps, expected ' + tellTotal);
  assert(
    (await page.locator('[data-screen="recap"]:not([hidden])').count()) === 0,
    'the second tap skipped the last consequence card and jumped to the recap'
  );
  const label = (await page.locator('#walkthrough-continue').textContent()).trim();
  assert(label === 'See the recap', 'the continue control reads "' + label + '" after the last step');
  note(
    'two taps ' + continueGap + 'ms apart on the continue control left step ' + tellTotal + ' of ' + tellTotal +
    ' on screen with the recap still waiting'
  );

  await page.waitForTimeout(GUARD_WAIT);
  await page.locator('#walkthrough-continue').click();
  await page.waitForSelector('[data-screen="recap"]:not([hidden])', { timeout: 8000 });

  const after = await readState(page);
  assert(
    after.streak === before.streak + 1,
    'the round banked ' + (after.streak - before.streak) + ' shields, expected exactly 1'
  );
  assert(
    after.roundsPlayed === before.roundsPlayed + 1,
    'roundsPlayed moved by ' + (after.roundsPlayed - before.roundsPlayed) + ', expected exactly 1'
  );
  note('the round banked exactly once: streak ' + before.streak + ' to ' + after.streak);
  watch('K');
}

/* ---- L. visibility of the teaching beats --------------------------------- */

/*
  The sentence that teaches has to be on screen. Both beats are appended below
  content that is already at the foot of the page, so both have to be pulled
  into view: the tap note clear of the fixed dock, the walkthrough card under
  the sticky header rather than above it.
*/
async function visibilityPass(page, shared, width) {
  await page.setViewportSize({ width: width, height: VIEWPORT_HEIGHT });

  await resetToHome(page);
  await openCall(page, 'note round at ' + width);
  await revealAll(page, 'note round at ' + width);

  const bubbles = await page.locator('.bubble').count();
  await page.locator('.bubble').nth(bubbles - 1).click();
  await page.waitForSelector('.tap-note', { timeout: 8000 });
  await page.waitForTimeout(SETTLE_MS);

  const geometry = await page.evaluate(() => {
    const notes = document.querySelectorAll('.tap-note');
    const note = notes[notes.length - 1];
    const rect = note.getBoundingClientRect();
    const dock = document.getElementById('call-dock').getBoundingClientRect();
    return {
      text: note.textContent.trim(),
      top: rect.top,
      bottom: rect.bottom,
      dockTop: dock.top,
      innerWidth: window.innerWidth,
      viewport: window.innerHeight
    };
  });
  assert(
    geometry.innerWidth === width,
    'this pass claims ' + width + 'px but the page measured ' + geometry.innerWidth + 'px'
  );
  assert(geometry.bottom > geometry.top, 'the tap note has no height at ' + width);
  assert(
    geometry.bottom <= geometry.dockTop + 1,
    'at ' + width + ' the tap note runs to ' + Math.round(geometry.bottom) + ' and the dock starts at ' +
      Math.round(geometry.dockTop) + ', so ' + Math.round(geometry.bottom - geometry.dockTop) + 'px sit behind it'
  );
  assert(
    geometry.top >= 0,
    'at ' + width + ' the tap note starts at ' + Math.round(geometry.top) + ', above the top of the screen'
  );
  note(
    'w' + geometry.innerWidth + ': the note on the bottom-most line sits ' + Math.round(geometry.top) + ' to ' +
    Math.round(geometry.bottom) + ', clear of the dock at ' + Math.round(geometry.dockTop) +
    ' ("' + geometry.text + '")'
  );

  await page.waitForTimeout(GUARD_WAIT);
  await page.locator('#hangup-btn').click();
  await page.waitForSelector('[data-screen="recap"]:not([hidden])', { timeout: 8000 });

  await resetToHome(page);
  const opened = await openCall(page, 'walkthrough round at ' + width);
  const spec = scriptSpec(shared, opened.script);
  const tellTotal = spec.lines.filter(function (line) {
    return typeof line.tell === 'string' && line.tell !== '';
  }).length;

  await revealAll(page, 'walkthrough round at ' + width);
  await page.waitForTimeout(GUARD_WAIT);
  await page.locator('#comply-btn').click();
  await page.waitForSelector('.walkthrough-step-intro', { timeout: 8000 });

  const tops = [];
  for (let step = 0; step < tellTotal; step += 1) {
    const seen = await page.locator('.walkthrough-step').count();
    await page.waitForTimeout(GUARD_WAIT);
    await page.locator('#walkthrough-continue').click();
    await page.waitForFunction(
      (count) => document.querySelectorAll('.walkthrough-step').length > count,
      seen,
      { timeout: 8000 }
    );
    // Measured once the entrance animation has settled, which is the position
    // the player actually reads from.
    await page.waitForTimeout(SETTLE_MS);
    const placed = await page.evaluate(() => {
      const cards = document.querySelectorAll('.walkthrough-step');
      const card = cards[cards.length - 1];
      const rect = card.getBoundingClientRect();
      const header = document.getElementById('call-header').getBoundingClientRect();
      const counter = card.querySelector('.walkthrough-count');
      return {
        top: rect.top,
        headerBottom: header.bottom,
        innerWidth: window.innerWidth,
        viewport: window.innerHeight,
        counter: counter === null ? '' : counter.textContent.trim()
      };
    });
    assert(
      placed.innerWidth === width,
      'this pass claims ' + width + 'px but the page measured ' + placed.innerWidth + 'px'
    );
    assert(
      placed.top >= placed.headerBottom - 1,
      width + ': ' + (placed.counter || 'a step card') + ' landed with its top at ' + Math.round(placed.top) +
        ', above the header bottom at ' + Math.round(placed.headerBottom)
    );
    assert(
      placed.top <= placed.viewport - 60,
      width + ': ' + (placed.counter || 'a step card') + ' landed with its top at ' + Math.round(placed.top) +
        ', off the bottom of a ' + placed.viewport + 'px screen'
    );
    tops.push(Math.round(placed.top));
  }
  note('w' + width + ': every walkthrough card landed top first under the header, tops ' + tops.join(', '));

  await page.waitForTimeout(GUARD_WAIT);
  await page.locator('#walkthrough-continue').click();
  await page.waitForSelector('[data-screen="recap"]:not([hidden])', { timeout: 8000 });
}

async function checkVisibility(page, shared) {
  const watch = errorWatch(shared);
  await visibilityPass(page, shared, WIDE_WIDTH);
  await visibilityPass(page, shared, NARROW_WIDTH);
  await page.setViewportSize({ width: WIDE_WIDTH, height: VIEWPORT_HEIGHT });
  watch('L');
}

/* ---- M. fetch failure recovery ------------------------------------------- */

/*
  A dropped connection is the ordinary phone failure. The player must be told in
  one plain sentence, and the very next tap must be a retry: no reload, no
  scolding, nothing left on screen once the round starts.
*/
async function checkFetchFailure(page, shared) {
  const watch = errorWatch(shared);
  try {
    await failAndRecover(page, shared);
  } finally {
    // The abort and the tally gate are undone even on a failure, so section N
    // still runs against a healthy page.
    await page.unroute(CONTENT_GLOB).catch(function () {});
    shared.expectContentFailures = false;
  }
  note(
    shared.expectedFailures.length + ' log lines from the deliberate abort (failed requests plus their console ' +
    'errors) were kept out of the J tally, nothing else was'
  );
  await resetToHome(page);
  watch('M');
}

async function failAndRecover(page, shared) {
  shared.expectContentFailures = true;
  await page.route(CONTENT_GLOB, function (route) {
    route.abort('failed');
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-screen="home"]:not([hidden])', { timeout: 8000 });
  await page.evaluate(() => {
    window.__dodPageLoad = 'kept';
  });

  const quiet = await page.evaluate(() => {
    const node = document.querySelector('[role="status"]');
    return node === null ? null : node.textContent.trim();
  });
  assert(quiet === '', 'the status region already holds "' + quiet + '" before anything was tapped');

  await page.locator('#answer-call').click();
  try {
    await page.waitForFunction(
      () => {
        const node = document.querySelector('[role="status"]');
        return node !== null && node.textContent.trim() !== '';
      },
      null,
      { timeout: 8000 }
    );
  } catch (error) {
    assert(false, 'the load failed and no role="status" element ever said so, the tap looks like it did nothing');
  }

  const status = await page.evaluate(() => {
    const nodes = document.querySelectorAll('[role="status"]');
    const node = nodes[0];
    const rect = node.getBoundingClientRect();
    const style = window.getComputedStyle(node);
    return {
      count: nodes.length,
      text: node.textContent.trim(),
      width: rect.width,
      height: rect.height,
      fontSize: parseFloat(style.fontSize),
      display: style.display
    };
  });
  assert(status.count >= 1, 'no role="status" element exists to carry the message');
  assert(status.width > 0 && status.height > 0 && status.display !== 'none', 'the status message is not visible');
  assert(
    status.fontSize >= BODY_FLOOR_PX,
    'the status message renders at ' + status.fontSize + 'px, under the ' + BODY_FLOOR_PX + 'px floor'
  );
  assert(/[.!?]$/.test(status.text), 'the status message is not a finished sentence: "' + status.text + '"');
  assert(/try again/i.test(status.text), 'the status message never invites a retry: "' + status.text + '"');
  for (let i = 0; i < SCOLDING.length; i += 1) {
    assert(!SCOLDING[i].test(status.text), 'the status message scolds the player: "' + status.text + '"');
  }
  assert(
    (await page.locator('[data-screen="home"]:not([hidden])').count()) === 1,
    'a failed load moved the player off the home screen'
  );
  assert(
    (await page.locator('#answer-call').getAttribute('aria-disabled')) === null,
    'the primary button stayed busy after the load failed, so no retry is possible'
  );
  note('load failure answered with "' + status.text + '" at ' + status.fontSize + 'px, button still live');

  await page.unroute(CONTENT_GLOB);
  await page.locator('#answer-call').click();
  try {
    await page.waitForSelector('[data-screen="ring"]:not([hidden])', { timeout: 8000 });
  } catch (error) {
    assert(false, 'the network came back but the next tap never reached the ring, so the button is dead until a reload');
  }

  const survived = await page.evaluate(() => window.__dodPageLoad);
  assert(survived === 'kept', 'the page reloaded to recover, so the retry was not a retry');
  const cleared = await page.evaluate(() => {
    const node = document.querySelector('[role="status"]');
    const style = window.getComputedStyle(node);
    return { text: node.textContent.trim(), display: style.display };
  });
  assert(cleared.text === '', 'the status message still reads "' + cleared.text + '" once the round started');
  assert(cleared.display === 'none', 'the empty status box is still taking up room on the screen');
  note('the next tap reached the ring on the same page load and cleared the message');
}

/* ---- N. mechanism match -------------------------------------------------- */

/*
  One tell, three different scams underneath. A voucher ask and a courier at the
  door are not the same warning, so the explanation is keyed off the line's own
  mechanism and is never allowed to name one the line did not use.
*/
async function checkMechanismMatch(page, shared) {
  const watch = errorWatch(shared);
  const structure = shared.content.structure;
  const bank = shared.content.bank;
  const scripts = structure.scripts;

  const mechanisms = new Set();
  const payingFamilies = new Set();
  let taggedLines = 0;

  for (let i = 0; i < scripts.length; i += 1) {
    const script = scripts[i];
    for (let j = 0; j < script.lines.length; j += 1) {
      const line = script.lines[j];
      if (line.tell !== MECHANISM_TELL) {
        continue;
      }
      taggedLines += 1;
      payingFamilies.add(String(script.family));
      assert(
        typeof line.mechanism === 'string' && line.mechanism !== '',
        script.id + ' line "' + line.event + '" is tagged ' + MECHANISM_TELL + ' with no mechanism field'
      );
      mechanisms.add(line.mechanism);

      const keys = ['recap_' + MECHANISM_TELL + '_' + line.mechanism, 'walkthrough_step_' + MECHANISM_TELL + '_' + line.mechanism];
      for (let k = 0; k < keys.length; k += 1) {
        assert(Array.isArray(bank[keys[k]]), line.event + ' names mechanism "' + line.mechanism + '" but ' + keys[k] + ' does not exist');
        assert(
          bank[keys[k]].length >= MIN_BANK_VARIANTS,
          keys[k] + ' has ' + bank[keys[k]].length + ' variants, expected ' + MIN_BANK_VARIANTS + '+'
        );
      }

      // The tag has to match what the line actually says, or the keyed pool is
      // just a different way of being wrong.
      const variants = bank[line.event];
      for (let k = 0; k < variants.length; k += 1) {
        const named = mechanismsNamedBy(variants[k]);
        assert(
          named.indexOf(line.mechanism) !== -1,
          line.event + '[' + k + '] is tagged "' + line.mechanism + '" but never names it: "' + variants[k] + '"'
        );
        assert(
          named.length === 1,
          line.event + '[' + k + '] is tagged "' + line.mechanism + '" and also names ' + named.join(' and ')
        );
      }
    }
  }
  assert(taggedLines >= 2, 'only ' + taggedLines + ' line carries ' + MECHANISM_TELL);
  assert(mechanisms.size >= 2, 'only one mechanism is in use, so nothing can be mismatched');
  note(taggedLines + ' tagged lines across mechanisms ' + [...mechanisms].join(', ') + ', each with both pools behind it');

  const mechanismList = [...mechanisms];
  for (let i = 0; i < mechanismList.length; i += 1) {
    const mechanism = mechanismList[i];
    const foreign = mechanismList.filter(function (other) {
      return other !== mechanism;
    });
    const keys = ['recap_' + MECHANISM_TELL + '_' + mechanism, 'walkthrough_step_' + MECHANISM_TELL + '_' + mechanism];
    for (let k = 0; k < keys.length; k += 1) {
      const pool = bank[keys[k]];
      for (let v = 0; v < pool.length; v += 1) {
        const named = mechanismsNamedBy(pool[v]);
        for (let f = 0; f < foreign.length; f += 1) {
          assert(
            named.indexOf(foreign[f]) === -1,
            keys[k] + '[' + v + '] speaks about ' + foreign[f] + ': "' + pool[v] + '"'
          );
        }
        assert(!ACCOUNT_TERM.test(pool[v]), keys[k] + '[' + v + '] sends the money to an account: "' + pool[v] + '"');
      }
    }
  }
  const baseKeys = ['recap_' + MECHANISM_TELL, 'walkthrough_step_' + MECHANISM_TELL];
  for (let k = 0; k < baseKeys.length; k += 1) {
    const pool = bank[baseKeys[k]];
    for (let v = 0; v < pool.length; v += 1) {
      const named = mechanismsNamedBy(pool[v]);
      assert(
        named.length === 0,
        baseKeys[k] + '[' + v + '] is the neutral pool but names ' + named.join(' and ') + ': "' + pool[v] + '"'
      );
      assert(!ACCOUNT_TERM.test(pool[v]), baseKeys[k] + '[' + v + '] is the neutral pool but names an account: "' + pool[v] + '"');
    }
  }
  note('keyed pools stay inside their own mechanism, the neutral pools name none');

  // Live. The family is not directly choosable, so the rotation is used against
  // itself: seeding recentFamilies bars two families per attempt, and an attempt
  // that draws the wrong script is abandoned by a reload rather than played.
  const allFamilies = [...new Set(scripts.map(function (script) {
    return String(script.family);
  }))];
  const quiet = allFamilies.filter(function (family) {
    return !payingFamilies.has(family);
  });
  const blocks = [quiet.slice(0, ROTATION_WINDOW), quiet.slice(ROTATION_WINDOW, ROTATION_WINDOW * 2)];

  let drawn = null;
  let attempts = 0;
  for (let attempt = 0; attempt < 10 && drawn === null; attempt += 1) {
    attempts += 1;
    const block = blocks[attempt % blocks.length];
    await seedState(page, { recentFamilies: block });
    await resetToHome(page);
    const opened = await openCall(page, 'mechanism round');
    const spec = scriptSpec(shared, opened.script);
    const tagged = spec.lines.filter(function (line) {
      return line.tell === MECHANISM_TELL;
    });
    if (tagged.length > 0) {
      drawn = { spec: spec, line: tagged[0] };
      break;
    }
  }
  assert(drawn !== null, 'no script carrying ' + MECHANISM_TELL + ' came up in ' + attempts + ' attempts');
  note('drew ' + drawn.spec.id + ' after ' + attempts + ' attempt(s), mechanism "' + drawn.line.mechanism + '"');

  await revealAll(page, 'mechanism round');
  await page.waitForTimeout(GUARD_WAIT);
  await page.locator('#hangup-btn').click();
  await page.waitForSelector('[data-screen="recap"]:not([hidden])', { timeout: 8000 });

  const label = structure.tellLabels[MECHANISM_TELL];
  const items = (await recapItems(page)).filter(function (item) {
    return item.tell.trim() === label;
  });
  assert(items.length === 1, 'the recap holds ' + items.length + ' "' + label + '" cards, expected 1');

  const quoted = unquote(items[0].line);
  const why = items[0].why.trim();
  const lineMechanisms = mechanismsNamedBy(quoted);
  const whyMechanisms = mechanismsNamedBy(why);
  assert(
    lineMechanisms.length > 0,
    'the quoted line names no mechanism at all, so the check has nothing to compare: "' + quoted + '"'
  );
  for (let i = 0; i < whyMechanisms.length; i += 1) {
    assert(
      lineMechanisms.indexOf(whyMechanisms[i]) !== -1,
      'the explanation talks about ' + whyMechanisms[i] + ' but the line asked for ' + lineMechanisms.join(', ') +
        '.\n       line: "' + quoted + '"\n       why:  "' + why + '"'
    );
  }

  const keyed = bank['recap_' + MECHANISM_TELL + '_' + drawn.line.mechanism];
  const fromKeyedPool = keyed.some(function (template) {
    return templateMatcher(template).test(why);
  });
  assert(
    fromKeyedPool,
    'the explanation did not come from recap_' + MECHANISM_TELL + '_' + drawn.line.mechanism + ': "' + why + '"'
  );
  note('line: "' + quoted + '"');
  note('why:  "' + why + '"');
  note(
    'both speak ' + lineMechanisms.join(', ') + ', and the explanation came from the keyed pool. The draw is ' +
    'random, so the live round covers one mechanism per run; the rest are covered by the static half above'
  );
  watch('N');
}

/* ---- main ---------------------------------------------------------------- */

async function main() {
  console.log('SCAM DOJO DEFINITION OF DONE');
  console.log('target ' + TARGET);

  const shared = {
    rounds: [],
    tapRound: null,
    complyRound: null,
    content: null,
    consoleErrors: [],
    pageErrors: [],
    failedRequests: [],
    expectedFailures: [],
    expectContentFailures: false
  };

  let ok = await check('A', 'static content integrity', () => checkStatic(shared));

  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: WIDE_WIDTH, height: VIEWPORT_HEIGHT },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true
  });
  const page = await context.newPage();

  const consoleErrors = shared.consoleErrors;
  const pageErrors = shared.pageErrors;
  const failedRequests = shared.failedRequests;

  // Section M cuts the content requests on purpose. Only that noise, only while
  // M is running, is kept out of the tally; anything else still counts.
  function expected(text) {
    return shared.expectContentFailures &&
      /games\/scam-dojo\/content\/[a-z-]+\.json|Failed to load resource/i.test(String(text));
  }

  page.on('console', (message) => {
    if (message.type() !== 'error') {
      return;
    }
    const where = message.location() && message.location().url ? message.location().url : '';
    if (expected(message.text()) || expected(where)) {
      shared.expectedFailures.push(message.text());
      return;
    }
    consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('requestfailed', (request) => {
    const line = request.url() + ' :: ' + ((request.failure() && request.failure().errorText) || 'failed');
    if (expected(request.url())) {
      shared.expectedFailures.push(line);
      return;
    }
    failedRequests.push(line);
  });
  page.on('response', (response) => {
    if (response.status() >= 400) {
      failedRequests.push(response.url() + ' :: HTTP ' + response.status());
    }
  });

  try {
    await page.goto(TARGET, { waitUntil: 'networkidle', timeout: 20000 });
    await page.evaluate((key) => window.localStorage.removeItem(key), STORAGE_KEY);
    await page.reload({ waitUntil: 'networkidle' });
  } catch (error) {
    console.error('could not open ' + TARGET + ': ' + (error && error.message ? error.message : error));
    await browser.close();
    process.exit(1);
  }

  ok = (await check('B', 'zero instructions on home', () => checkZeroInstructions(page))) && ok;

  // C to I share one browser session and build on each other, so the first
  // failure stops the chain rather than reporting a pile of knock on errors.
  const chain = [
    ['C', 'three consecutive rounds differ', () => checkThreeRounds(page, shared)],
    ['D', 'variety under repetition', () => checkVariety(page, shared)],
    ['E and F', 'benign tap teaches, tell tap affirms', () => checkTaps(page, shared)],
    ['G', 'comply path teaches', () => checkComply(page, shared)],
    ['H', 'recap depth', () => checkRecapDepth(page)],
    ['I', 'streak survives a reload', () => checkReload(page)]
  ];

  let broken = null;
  for (let i = 0; i < chain.length; i += 1) {
    const [id, title, fn] = chain[i];
    if (broken !== null) {
      skip(id, title, 'check ' + broken + ' failed first');
      ok = false;
      continue;
    }
    const passed = await check(id, title, fn);
    if (!passed) {
      ok = false;
      broken = id;
    }
  }

  ok = (await check('J', 'clean run', async () => {
    assert(consoleErrors.length === 0, consoleErrors.length + ' console errors: ' + consoleErrors.join('; '));
    assert(pageErrors.length === 0, pageErrors.length + ' page errors: ' + pageErrors.join('; '));
    assert(failedRequests.length === 0, failedRequests.length + ' failed requests: ' + failedRequests.join('; '));
    note('zero console errors, zero page errors, zero failed requests across the whole session');
  })) && ok;

  // K to N stand on their own: each resets to the home screen first and each
  // watches its own stretch for a thrown page error, so one failing does not
  // take the others with it.
  const regressions = [
    ['K', 'double tap safety', () => checkDoubleTap(page, shared)],
    ['L', 'visibility of the teaching beats', () => checkVisibility(page, shared)],
    ['M', 'fetch failure recovery', () => checkFetchFailure(page, shared)],
    ['N', 'mechanism match', () => checkMechanismMatch(page, shared)]
  ];
  for (let i = 0; i < regressions.length; i += 1) {
    const [id, title, fn] = regressions[i];
    if (shared.content === null) {
      skip(id, title, 'check A never parsed the content files');
      ok = false;
      continue;
    }
    ok = (await check(id, title, fn)) && ok;
  }

  await browser.close();

  console.log('');
  console.log('SUMMARY');
  let passed = 0;
  for (let i = 0; i < results.length; i += 1) {
    const row = results[i];
    const label = (row.id + '. ' + row.title).padEnd(46, ' ');
    console.log('  ' + label + row.status + (row.status === 'PASS' ? '' : '  ' + row.message));
    if (row.status === 'PASS') {
      passed += 1;
    }
  }
  console.log('');
  if (ok) {
    console.log('DOD PASS: ' + passed + ' of ' + results.length + ' checks');
    process.exit(0);
  }
  console.log('DOD FAIL: ' + passed + ' of ' + results.length + ' checks passed');
  process.exit(1);
}

main().catch((error) => {
  console.error(String(error && error.stack ? error.stack : error));
  process.exit(1);
});
