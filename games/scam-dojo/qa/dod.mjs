#!/usr/bin/env node
/*
  Scam Dojo definition of done suite.

  Ten checks, A to J. A reads the content files straight off disk. B to J drive
  the real UI at a phone viewport: fourteen rounds end to end, a benign tap, a
  tell tap, the comply walkthrough, a reload, and an error tally kept for the
  whole session.

  Run from the repo root with the dev server up on PORT=4186.
  Self contained on purpose: its own port, its own state clearing, no import
  from smoke.mjs, so either file can be run or rewritten without the other.
*/
import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const PORT = 4186;
const TARGET = 'http://localhost:' + PORT + '/scam-dojo';
const STORAGE_KEY = 'ctrlai:scam-dojo';

// shared/ai.js returns this whenever an event is missing from the bank. A
// finished build must never render it, so it is the tripwire for missing content.
const NEUTRAL_FALLBACK = 'Take your time. There is no wrong answer here.';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CONTENT_DIR = path.join(HERE, '..', 'content');

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

const EM_DASH = '—';
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/u;
const SLOT_PATTERN = /\{([a-zA-Z0-9_]+)\}/g;

const SCRIPT_COUNT = 9;
const MIN_FAMILIES = 8;
const MIN_LINES = 6;
const MAX_LINES = 8;
const TELLS_PER_SCRIPT = 3;
const MIN_LINE_VARIANTS = 3;
const MIN_BANK_VARIANTS = 4;
const MIN_TEMPLATE_CHARS = 15;
const TOTAL_ROUNDS = 12;
const ROTATION_WINDOW = 2;

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

async function checkStatic() {
  const structureText = await readFile(path.join(CONTENT_DIR, 'call-structure.json'), 'utf8');
  const bankText = await readFile(path.join(CONTENT_DIR, 'scam-scripts.json'), 'utf8');
  const structure = JSON.parse(structureText);
  const bank = JSON.parse(bankText);
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
    assert(files[i].text.indexOf(EM_DASH) === -1, files[i].name + ' contains an em dash');
    assert(!EMOJI.test(files[i].text), files[i].name + ' contains an emoji');
  }
  assert(hits.length === 0, 'real institution names found: ' + hits.join('; '));
  note('clean of ' + (BANNED_EXACT.length + BANNED_LOOSE.length) + ' banned names, no em dash, no emoji');

  const keys = Object.keys(bank);
  let templateCount = 0;
  for (let i = 0; i < keys.length; i += 1) {
    const variants = bank[keys[i]];
    assert(Array.isArray(variants), 'bank event ' + keys[i] + ' is not an array');
    for (let j = 0; j < variants.length; j += 1) {
      const where = keys[i] + '[' + j + ']';
      const collapsed = collapseSlots(variants[j]);
      assert(
        /[.!?]$/.test(collapsed),
        where + ' does not end in terminal punctuation with slots empty: "' + collapsed + '"'
      );
      assert(
        collapsed.length >= MIN_TEMPLATE_CHARS,
        where + ' collapses to ' + collapsed.length + ' chars, expected ' + MIN_TEMPLATE_CHARS + '+'
      );
      templateCount += 1;
    }
  }
  note(templateCount + ' templates across ' + keys.length + ' events all survive an empty slot collapse');
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

/* ---- main ---------------------------------------------------------------- */

async function main() {
  console.log('SCAM DOJO DEFINITION OF DONE');
  console.log('target ' + TARGET);

  let ok = await check('A', 'static content integrity', checkStatic);

  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true
  });
  const page = await context.newPage();

  const consoleErrors = [];
  const pageErrors = [];
  const failedRequests = [];
  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text());
    }
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('requestfailed', (request) => {
    failedRequests.push(request.url() + ' :: ' + ((request.failure() && request.failure().errorText) || 'failed'));
  });
  page.on('response', (response) => {
    if (response.status() >= 400) {
      failedRequests.push(response.url() + ' :: HTTP ' + response.status());
    }
  });

  const shared = { rounds: [], tapRound: null, complyRound: null };

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
