/*
  Self test for the shared foundation modules.
  Run: node tools/selftest-shared.mjs
  Exits nonzero if any check fails, so it can gate a commit.
*/

import { registerBank, aiGenerate, makeRng, hashString } from '../shared/ai.js';
import { loadState, saveState, clearState } from '../shared/storage.js';

let failures = 0;

function check(label, passed, detail) {
  const status = passed ? 'PASS' : 'FAIL';
  if (!passed) {
    failures += 1;
  }
  const suffix = detail === undefined || detail === '' ? '' : '  (' + detail + ')';
  process.stdout.write(status + '  ' + label + suffix + '\n');
}

/* ---- shared/ai.js: banks and slot filling ------------------------------- */

const accepted = registerBank('selftest', {
  greet: [
    'Hello {name}, good to see you.',
    'Wah {name}, you came back.',
    'Morning {name}, sit sit.',
    'Eh {name}, long time.'
  ],
  solo: ['Only one line here, {name}.'],
  bad_shape: 'not an array',
  empty: []
});

check('registerBank accepts only well formed event arrays', accepted === 2, 'accepted ' + accepted + ' of 4');

const greeting = await aiGenerate({
  game: 'selftest',
  event: 'greet',
  context: { name: 'Ah Ma' }
});

check('aiGenerate fills a slot from context', greeting.text.includes('Ah Ma'), greeting.text);
check('aiGenerate leaves no unfilled braces', !/[{}]/.test(greeting.text), greeting.text);
check('aiGenerate meta reports the bank source', greeting.meta.source === 'bank', 'source ' + greeting.meta.source);
check('aiGenerate meta carries the event', greeting.meta.event === 'greet', 'event ' + greeting.meta.event);
check(
  'aiGenerate meta carries a real template index',
  Number.isInteger(greeting.meta.template_index) && greeting.meta.template_index >= 0 && greeting.meta.template_index < 4,
  'index ' + greeting.meta.template_index
);

/* ---- shared/ai.js: no repeat back to back ------------------------------- */

const seen = [];
let repeated = false;
for (let i = 0; i < 24; i += 1) {
  const line = await aiGenerate({ game: 'selftest', event: 'greet', context: { name: 'Ah Ma' } });
  if (seen.length > 0 && line.meta.template_index === seen[seen.length - 1]) {
    repeated = true;
  }
  seen.push(line.meta.template_index);
}
check('aiGenerate never repeats the previous pick for an event', !repeated, '24 draws, indexes ' + seen.join(''));

const distinct = new Set(seen);
check('aiGenerate reaches more than one template', distinct.size > 1, distinct.size + ' distinct of 4');

/* ---- shared/ai.js: single template bank must not deadlock --------------- */

const soloA = await aiGenerate({ game: 'selftest', event: 'solo', context: { name: 'Uncle' } });
const soloB = await aiGenerate({ game: 'selftest', event: 'solo', context: { name: 'Uncle' } });
check(
  'aiGenerate survives a one template event',
  soloA.meta.template_index === 0 && soloB.meta.template_index === 0 && soloB.text.includes('Uncle'),
  soloB.text
);

/* ---- shared/ai.js: missing slot degrades quietly ------------------------ */

const noName = await aiGenerate({ game: 'selftest', event: 'greet', context: {} });
check('aiGenerate drops a missing slot instead of showing braces', !/[{}]/.test(noName.text), noName.text);
check('aiGenerate reports the missing slot in meta', noName.meta.missing_slots.includes('name'), noName.meta.missing_slots.join(','));
check('aiGenerate repairs spacing around a dropped slot', !/\s,|\s{2,}/.test(noName.text), noName.text);

/* ---- shared/ai.js: fallbacks ------------------------------------------- */

const unknownEvent = await aiGenerate({ game: 'selftest', event: 'nope_not_here', context: {} });
check('aiGenerate falls back on an unknown event', unknownEvent.meta.source === 'fallback', 'source ' + unknownEvent.meta.source);
check('aiGenerate fallback still returns usable text', typeof unknownEvent.text === 'string' && unknownEvent.text.length > 0, unknownEvent.text);

const unknownGame = await aiGenerate({ game: 'no-such-game', event: 'greet', context: {} });
check('aiGenerate falls back on an unknown game', unknownGame.meta.source === 'fallback', 'source ' + unknownGame.meta.source);

let threw = false;
let junk = null;
try {
  junk = await aiGenerate();
} catch (err) {
  threw = true;
}
check('aiGenerate does not throw on no arguments', !threw && junk !== null && junk.meta.source === 'fallback');

/* ---- shared/ai.js: makeRng --------------------------------------------- */

const rngA = makeRng(12345);
const rngB = makeRng(12345);
const seqA = [rngA(), rngA(), rngA(), rngA(), rngA()];
const seqB = [rngB(), rngB(), rngB(), rngB(), rngB()];
check('makeRng is deterministic for the same seed', seqA.join(',') === seqB.join(','));

const rngC = makeRng(54321);
const seqC = [rngC(), rngC(), rngC(), rngC(), rngC()];
check('makeRng diverges on a different seed', seqA.join(',') !== seqC.join(','));

const rngStrA = makeRng('kopitiam cup');
const rngStrB = makeRng('kopitiam cup');
check('makeRng accepts a string seed deterministically', rngStrA() === rngStrB());

const rngRange = makeRng(7);
let inRange = true;
let allSame = true;
const first = rngRange();
for (let i = 0; i < 5000; i += 1) {
  const value = rngRange();
  if (!(value >= 0 && value < 1)) {
    inRange = false;
  }
  if (value !== first) {
    allSame = false;
  }
}
check('makeRng stays inside [0, 1)', inRange);
check('makeRng actually varies', !allSame);

/* ---- shared/ai.js: hashString ------------------------------------------ */

const hashOnce = hashString('Setron television');
const hashTwice = hashString('Setron television');
check('hashString is stable across calls', hashOnce === hashTwice, String(hashOnce));
check('hashString returns an unsigned 32 bit integer', Number.isInteger(hashOnce) && hashOnce >= 0 && hashOnce <= 0xffffffff, String(hashOnce));
check('hashString separates different inputs', hashString('sewing machine') !== hashString('kopitiam cup'));
check('hashString handles empty and nullish input', hashString('') === hashString(undefined) && Number.isInteger(hashString(null)));

/* ---- shared/storage.js -------------------------------------------------- */

clearState('selftest');

check('loadState returns the fallback when nothing is stored', loadState('selftest', 'nothing') === 'nothing');

const payload = { plants: [{ id: 'a1', tags: ['warm', 'kopi'] }], visits: 3, nested: { ok: true } };
const wrote = saveState('selftest', payload);
check('saveState reports success', wrote === true);

const readBack = loadState('selftest', null);
check('storage round trips a nested object', JSON.stringify(readBack) === JSON.stringify(payload), JSON.stringify(readBack));

saveState('selftest-two', 42);
check('storage keeps namespaces apart', loadState('selftest', null) !== 42 && loadState('selftest-two', null) === 42);

clearState('selftest');
check('clearState removes the value', loadState('selftest', 'gone') === 'gone');
check('clearState on a missing namespace is harmless', clearState('never-existed') === true);

let storageThrew = false;
try {
  const cyclic = {};
  cyclic.self = cyclic;
  const ok = saveState('selftest-cyclic', cyclic);
  check('saveState refuses unserialisable data without throwing', ok === false);
} catch (err) {
  storageThrew = true;
}
check('saveState never throws', !storageThrew);

clearState('selftest-two');
clearState('selftest-cyclic');

/* ---- result ------------------------------------------------------------- */

if (failures > 0) {
  process.stdout.write('\n' + failures + ' check(s) failed\n');
  process.exit(1);
}
process.stdout.write('\nAll checks passed\n');
