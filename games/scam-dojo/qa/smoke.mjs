#!/usr/bin/env node
// Scam Dojo smoke test. Drives the real UI at a phone viewport: three rounds end
// to end, the call opening on line one, a mid-call catch and a mid-call benign
// tap, the comply walkthrough tapped through to the recap, streak persistence
// across a reload, and a content safety sweep of both JSON files.
// Run from the repo root with the dev server up on PORT=4185.
import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const URL = 'http://localhost:4185/scam-dojo';
const STORAGE_KEY = 'ctrlai:scam-dojo';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const CONTENT_DIR = path.join(HERE, '..', 'content');

const BANNED_EXACT = ['DBS', 'OCBC', 'UOB', 'POSB', 'CPF', 'IRAS', 'MOM', 'ICA', 'SPF', 'LTA', 'HDB'];
const BANNED_LOOSE = [
  'singtel', 'starhub', 'singpost', 'shopee', 'lazada',
  'grab', 'dhl', 'fedex', 'maybank', 'citibank', 'hsbc'
];

const notes = [];

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function note(line) {
  notes.push(line);
  console.log('  ' + line);
}

async function screenVisible(page, name) {
  return page.locator('[data-screen="' + name + '"]:not([hidden])').count();
}

async function readState(page) {
  const raw = await page.evaluate((key) => window.localStorage.getItem(key), STORAGE_KEY);
  return raw === null ? null : JSON.parse(raw);
}

async function transcriptOf(page) {
  return page.locator('.bubble .bubble-text').allTextContents();
}

// Any class anywhere that reads as a punishment. The recap is allowed to say a
// line slipped past; the DOM is never allowed to call the player wrong.
async function penaltyArtifact(page) {
  return page.evaluate(() => {
    const nodes = document.querySelectorAll('*');
    for (let i = 0; i < nodes.length; i += 1) {
      const raw = nodes[i].className;
      const value = typeof raw === 'string' ? raw : (raw && raw.baseVal) || '';
      if (/wrong|fail/i.test(value)) {
        return nodes[i].tagName.toLowerCase() + '.' + value;
      }
    }
    return null;
  });
}

async function playRound(page, options) {
  const label = 'round ' + options.round;

  await page.locator('#answer-call').click();
  await page.waitForSelector('[data-screen="ring"]:not([hidden])', { timeout: 8000 });
  assert(await page.locator('#answer-btn').isVisible(), label + ': ring screen has no Answer button');

  await page.locator('#answer-btn').click();
  await page.waitForSelector('[data-screen="call"]:not([hidden])', { timeout: 8000 });

  const family = await page.locator('[data-screen="call"]').getAttribute('data-family');
  const script = await page.locator('[data-screen="call"]').getAttribute('data-script');
  assert(family !== null && family !== '', label + ': call screen has no data-family');

  // Answering reveals line one and nothing more. Every later line is a tap.
  const opening = await page.locator('.bubble:visible').count();
  assert(opening === 1, label + ': call should open with exactly 1 bubble, found ' + opening);
  assert(
    (await page.locator('#listen-btn').count()) > 0,
    label + ': Listen control missing after the opening line'
  );
  note(label + ': call opened with exactly 1 bubble before any Listen tap');

  let caughtTapped = false;
  let benignTapped = false;
  let taps = 0;

  for (let i = 0; i < 25; i += 1) {
    if (await page.locator('#hangup-btn').count() > 0) {
      break;
    }
    await page.locator('#listen-btn').click();
    taps += 1;

    if (!options.midCallTaps) {
      continue;
    }

    if (!caughtTapped) {
      const tell = page.locator('.bubble[data-tell]:not([data-tell=""])').first();
      if (await tell.count() > 0) {
        await tell.click();
        await page.waitForSelector('.tap-note[data-kind="catch"]', { timeout: 8000 });
        const classes = await tell.getAttribute('class');
        assert(classes.includes('is-caught'), label + ': tapped tell bubble did not gain is-caught');
        assert(
          (await tell.locator('.bubble-caught').count()) === 1,
          label + ': caught bubble has no Caught label'
        );
        caughtTapped = true;
        note('caught a tell mid-call, bubble is-caught and a catch note appeared');
      }
    }

    if (!benignTapped) {
      const benign = page.locator('.bubble[data-tell=""]').first();
      if (await benign.count() > 0) {
        await benign.click();
        await page.waitForSelector('.tap-note[data-kind="benign"]', { timeout: 8000 });
        const stored = await readState(page);
        assert(
          stored === null || stored.streak === 0,
          label + ': streak moved during the call, benign tap was penalised'
        );
        const artifact = await penaltyArtifact(page);
        assert(artifact === null, label + ': penalty artifact in the DOM: ' + artifact);
        benignTapped = true;
        note('tapped a benign line, gentle note appeared with no penalty and no streak change');
      }
    }
  }

  assert(taps > 0 && taps <= 25, label + ': listen taps out of range (' + taps + ')');
  assert(await page.locator('#hangup-btn').count() > 0, label + ': never reached the hang up choice');

  const transcript = await transcriptOf(page);
  assert(transcript.length >= 6, label + ': only ' + transcript.length + ' bubbles revealed');

  const tellCount = await page.locator('.bubble[data-tell]:not([data-tell=""])').count();
  assert(tellCount > 0, label + ': the script carried no tells at all');

  if (options.midCallTaps) {
    assert(caughtTapped, label + ': no tell bubble was available to tap');
    assert(benignTapped, label + ': no benign bubble was available to tap');
  }

  let walkthroughSteps = 0;

  if (options.comply) {
    await page.locator('#comply-btn').click();
    await page.waitForSelector('#walkthrough-continue', { timeout: 8000 });
    await page.waitForSelector('.walkthrough-step-intro', { timeout: 8000 });

    let continues = 0;
    while ((await page.locator('[data-screen="recap"]:not([hidden])').count()) === 0) {
      assert(continues < 30, label + ': the walkthrough never reached the recap');
      const before = await page.locator('.walkthrough-step').count();
      await page.locator('#walkthrough-continue').click();
      continues += 1;
      // Every tap either lands another step or leaves for the recap, never stalls.
      await page.waitForFunction(
        (count) =>
          document.querySelectorAll('.walkthrough-step').length > count ||
          document.querySelector('[data-screen="recap"]:not([hidden])') !== null,
        before,
        { timeout: 8000 }
      );
    }

    // The call screen is only hidden, so the steps are still countable.
    walkthroughSteps = await page.locator('.walkthrough-step').count();
    assert(
      walkthroughSteps >= 1 + tellCount,
      label + ': walkthrough rendered ' + walkthroughSteps + ' steps, expected at least ' + (1 + tellCount)
    );
    const complyArtifact = await penaltyArtifact(page);
    assert(complyArtifact === null, label + ': penalty artifact on the comply path: ' + complyArtifact);
    note(
      label + ': comply walkthrough rendered ' + walkthroughSteps + ' steps (intro plus ' +
      tellCount + ' tells) over ' + continues + ' taps, then the recap'
    );
  } else {
    await page.locator('#hangup-btn').click();

    // The walkthrough belongs to the comply path only, but step through it
    // rather than hanging the run if it ever turns up here.
    if (await page.locator('#walkthrough-continue').count() > 0) {
      await page.locator('#walkthrough-continue').click();
    }
  }

  await page.waitForSelector('[data-screen="recap"]:not([hidden])', { timeout: 8000 });
  return { family, script, transcript, taps, tellCount, walkthroughSteps };
}

async function checkContentSafety() {
  const files = ['call-structure.json', 'scam-scripts.json'];
  const hits = [];
  for (let i = 0; i < files.length; i += 1) {
    const text = await readFile(path.join(CONTENT_DIR, files[i]), 'utf8');
    JSON.parse(text);
    for (let j = 0; j < BANNED_EXACT.length; j += 1) {
      const word = BANNED_EXACT[j];
      if (new RegExp('\\b' + word + '\\b').test(text)) {
        hits.push(files[i] + ' contains ' + word);
      }
    }
    for (let j = 0; j < BANNED_LOOSE.length; j += 1) {
      const word = BANNED_LOOSE[j];
      if (new RegExp('\\b' + word + '\\b', 'i').test(text)) {
        hits.push(files[i] + ' contains ' + word);
      }
    }
  }
  return hits;
}

async function main() {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true
  });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('response', (response) => {
    if (response.status() >= 400) {
      pageErrors.push(response.url() + ' :: HTTP ' + response.status());
    }
  });

  try {
    console.log('1. home');
    await page.goto(URL, { waitUntil: 'networkidle', timeout: 20000 });
    await page.evaluate((key) => window.localStorage.removeItem(key), STORAGE_KEY);
    await page.reload({ waitUntil: 'networkidle' });
    assert((await screenVisible(page, 'home')) === 1, 'home screen is not visible');

    const filled = await page
      .locator('[data-screen="home"] .btn:not(.btn-plain):not(.btn-quiet)')
      .count();
    assert(filled === 1, 'home should have exactly one filled primary button, found ' + filled);
    note('home visible with exactly one filled primary button');

    console.log('2. round 1 with mid-call taps');
    const one = await playRound(page, { round: 1, midCallTaps: true });
    note('round 1 family "' + one.family + '" script "' + one.script + '", ' + one.transcript.length + ' lines');

    console.log('3. recap and shield');
    const recapItems = await page.locator('.recap-item').count();
    assert(recapItems >= 3, 'expected at least 3 recap items, found ' + recapItems);
    assert(await page.locator('#shield-ceremony').isVisible(), 'shield ceremony is missing');
    const afterOne = await readState(page);
    assert(afterOne !== null, 'nothing was saved to ' + STORAGE_KEY);
    assert(afterOne.streak === 1, 'streak should be 1 after round 1, got ' + afterOne.streak);
    note('recap shows ' + recapItems + ' tell cards, ceremony present, stored streak is 1');

    console.log('4. back home');
    await page.locator('#back-home-btn').click();
    await page.waitForSelector('[data-screen="home"]:not([hidden])', { timeout: 8000 });
    const homeStreak = await page.locator('#home-streak').textContent();
    assert(homeStreak.trim() === '1', 'home should show streak 1, shows ' + homeStreak);
    note('home re-rendered with streak 1');

    console.log('5. rounds 2 and 3, round 3 on the comply path');
    const two = await playRound(page, { round: 2, midCallTaps: false });
    await page.locator('#back-home-btn').click();
    await page.waitForSelector('[data-screen="home"]:not([hidden])', { timeout: 8000 });
    const three = await playRound(page, { round: 3, midCallTaps: false, comply: true });

    // Going along with the caller earns the same shield and the same recap.
    const complyRecapItems = await page.locator('.recap-item').count();
    assert(
      complyRecapItems === three.tellCount,
      'comply recap lists ' + complyRecapItems + ' tells, the call had ' + three.tellCount
    );
    assert(await page.locator('#shield-ceremony').isVisible(), 'comply path recap has no shield ceremony');
    // The ceremony waits until the player has scrolled to it, so scroll first.
    await page.locator('#shield-ceremony').scrollIntoViewIfNeeded();
    await page.waitForSelector('#shield-ceremony.is-in', { timeout: 8000 });
    assert(
      (await page.locator('#shield-ceremony .ceremony-ring').count()) === 1,
      'the ceremony ring is missing from the recap'
    );
    const complyStreak = await page.locator('#streak-count').textContent();
    assert(complyStreak.trim() === '3', 'comply path should still award a shield, streak shows ' + complyStreak);
    note('comply recap: ' + complyRecapItems + ' tell cards, ceremony played with its ring, streak 3');

    await page.locator('#back-home-btn').click();
    await page.waitForSelector('[data-screen="home"]:not([hidden])', { timeout: 8000 });
    note('round 2 family "' + two.family + '", round 3 family "' + three.family + '"');

    console.log('6. variety');
    const families = [one.family, two.family, three.family];
    assert(new Set(families).size === 3, 'families repeated across three rounds: ' + families.join(', '));
    const transcripts = [one, two, three].map((r) => r.transcript.join(' | '));
    assert(new Set(transcripts).size === 3, 'transcripts repeated across three rounds');
    note('three rounds, three different families and three different transcripts');

    console.log('7. reload');
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('[data-screen="home"]:not([hidden])', { timeout: 8000 });
    const reloaded = await page.locator('#home-streak').textContent();
    assert(reloaded.trim() === '3', 'home should show streak 3 after reload, shows ' + reloaded);
    const stored = await readState(page);
    assert(stored.streak === 3, 'stored streak should be 3, got ' + stored.streak);
    assert(stored.roundsPlayed === 3, 'stored roundsPlayed should be 3, got ' + stored.roundsPlayed);
    assert(stored.recentFamilies.length === 2, 'recentFamilies should hold the newest two');
    note('after reload home and storage both read streak 3, recentFamilies ' + stored.recentFamilies.join(','));

    console.log('8. content safety');
    const hits = await checkContentSafety();
    assert(hits.length === 0, 'real institution names found: ' + hits.join('; '));
    note('both content files clean of ' + (BANNED_EXACT.length + BANNED_LOOSE.length) + ' banned names');

    assert(pageErrors.length === 0, 'page errors or failed requests: ' + pageErrors.join('; '));
    note('no page errors, no failed requests');

    console.log('');
    console.log('SMOKE PASS: ' + notes.length + ' checks');
    await browser.close();
    process.exit(0);
  } catch (error) {
    console.error('');
    console.error('SMOKE FAIL: ' + (error && error.message ? error.message : error));
    if (pageErrors.length > 0) {
      console.error('page errors: ' + pageErrors.join('; '));
    }
    await browser.close();
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(String(error && error.stack ? error.stack : error));
  process.exit(1);
});
