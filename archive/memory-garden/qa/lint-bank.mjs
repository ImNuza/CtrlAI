#!/usr/bin/env node
/*
  Bank lint for Memory Garden.

  shared/content-banks.md sets one rule that is easy to write past and impossible
  to see in the running game: "Every line must make sense with every slot empty."
  Today no code path can reach a partial context, so a broken line sits there
  quietly until the day aiGenerate is a real model that answers with half a
  context. This renders every template of every event through the real seam with
  nothing in the context and fails on the fragments that produces.

  Runs under plain node. No browser, no server, no dependencies.
*/

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { registerBank, aiGenerate } from '../../../shared/ai.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const BANK_PATH = path.join(here, '..', 'content', 'garden-lines.json');

/* A sentence that ends on one of these has lost the thing it was pointing at.
   Prepositions and articles first, then the handful of verbs in this register
   that cannot stand without an object: "it already holds." is not a sentence. */
const DANGLING_TAILS = [
  'of', 'in', 'at', 'on', 'to', 'with', 'about', 'for', 'from', 'by', 'into',
  'through', 'over', 'under', 'onto', 'upon', 'within', 'without', 'near',
  'a', 'an', 'the',
  'and', 'or', 'but', 'nor', 'because', 'plus',
  'holds', 'held', 'keeps', 'kept', 'carries', 'carried', 'brings', 'brought',
  'gives', 'gave', 'names', 'named', 'mentions', 'mentioned', 'includes', 'included'
];

/* Sentences with their terminator kept, because a question is allowed to end on
   a preposition ("Where does this one take you back to?") and a statement is not. */
function sentencesOf(text) {
  const chunks = text.match(/[^.!?]+[.!?]*/g) || [];
  const out = [];
  for (let i = 0; i < chunks.length; i += 1) {
    const raw = chunks[i].trim();
    if (raw !== '') {
      out.push({ text: raw.replace(/[.!?]+$/, '').trim(), question: /\?$/.test(raw) });
    }
  }
  return out;
}

function lastWord(sentence) {
  const words = sentence.replace(/[",:;]+$/, '').trim().split(/\s+/);
  return words[words.length - 1].replace(/[^A-Za-z']/g, '').toLowerCase();
}

/**
 * Faults in one rendered line. Empty array means the line survives an empty context.
 * @param {string} text
 * @returns {string[]}
 */
export function faultsIn(text) {
  const faults = [];
  const trimmed = String(text === undefined || text === null ? '' : text).trim();

  if (trimmed === '') {
    faults.push('renders empty');
    return faults;
  }
  if (trimmed.indexOf('{') !== -1 || trimmed.indexOf('}') !== -1) {
    faults.push('leaves a visible slot brace');
  }
  if (/ {2,}/.test(trimmed)) {
    faults.push('double space');
  }
  if (/\s[,.;:!?]/.test(trimmed)) {
    faults.push('space before punctuation');
  }
  if (/,\s*[,.;:!?]/.test(trimmed)) {
    faults.push('orphan comma');
  }

  const sentences = sentencesOf(trimmed);
  for (let i = 0; i < sentences.length; i += 1) {
    const sentence = sentences[i];
    const tail = lastWord(sentence.text);
    if (!sentence.question && DANGLING_TAILS.indexOf(tail) !== -1) {
      faults.push('sentence ' + (i + 1) + ' dangles on "' + tail + '"');
    }
    if (/^[a-z]/.test(sentence.text)) {
      faults.push('sentence ' + (i + 1) + ' starts lowercase, a slot fell off the front');
    }
  }
  return faults;
}

/* The lint has to be able to fail, so it proves its own rules before it trusts
   them. Synthetic strings only, so nothing here is content anybody could ship. */
const SELF_TEST = [
  { text: 'Down at the roots it already holds.', want: 'dangles' },
  { text: 'This one remembers everything about.', want: 'dangles' },
  { text: 'The garden kept all of the.', want: 'dangles' },
  { text: 'Two  spaces in here.', want: 'double space' },
  { text: 'A space before the comma , like this.', want: 'space before punctuation' },
  { text: 'The garden did it ,. and stopped.', want: 'orphan' },
  { text: '', want: 'renders empty' },
  { text: 'Still holds {object} here.', want: 'brace' },
  { text: 'Good line. still growing here.', want: 'lowercase' }
];

async function renderEveryTemplate(bank) {
  const rows = [];
  const events = Object.keys(bank);
  for (let e = 0; e < events.length; e += 1) {
    const event = events[e];
    const templates = bank[event];
    for (let i = 0; i < templates.length; i += 1) {
      // One throwaway game id per template, so the real pickIndex has exactly one
      // line to choose and the output is the line under test rather than a rotation.
      const id = 'lint-' + event + '-' + i;
      const single = {};
      single[event] = [templates[i]];
      registerBank(id, single);
      const line = await aiGenerate({ game: id, event: event, context: {} });
      rows.push({ event: event, index: i, text: line.text, source: line.meta.source });
    }
  }
  return rows;
}

async function main() {
  const bank = JSON.parse(await readFile(BANK_PATH, 'utf8'));

  let failures = 0;
  process.stdout.write('\nMemory Garden bank lint\n');
  process.stdout.write('-----------------------\n');

  for (let i = 0; i < SELF_TEST.length; i += 1) {
    const probe = SELF_TEST[i];
    const caught = faultsIn(probe.text).length > 0;
    if (!caught) {
      failures += 1;
    }
    process.stdout.write((caught ? 'PASS  ' : 'FAIL  ') + 'self test catches ' + probe.want +
      '  ::  ' + JSON.stringify(probe.text) + '\n');
  }

  const rows = await renderEveryTemplate(bank);
  let clean = 0;
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    const faults = faultsIn(row.text);
    if (row.source !== 'bank') {
      faults.push('did not come from the bank');
    }
    if (faults.length === 0) {
      clean += 1;
    } else {
      failures += 1;
      process.stdout.write('FAIL  ' + row.event + '[' + row.index + ']  ::  ' +
        faults.join('; ') + '  ::  ' + JSON.stringify(row.text) + '\n');
    }
  }
  process.stdout.write('PASS  every template reads as a sentence with every slot empty  ::  ' +
    clean + ' of ' + rows.length + ' clean\n');

  process.stdout.write('-----------------------\n');
  process.stdout.write((failures === 0 ? 'ALL PASS' : 'FAILURES: ' + failures) +
    '  (' + (SELF_TEST.length + rows.length + 1) + ' checks, ' + rows.length +
    ' templates rendered through the real seam)\n');
  process.exit(failures === 0 ? 0 : 1);
}

// Only when run as a script, so faultsIn can be imported by another checker
// without this file exiting the process out from under it.
const invokedDirectly = typeof process.argv[1] === 'string' &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  main().catch(function (error) {
    process.stderr.write(String(error && error.stack ? error.stack : error) + '\n');
    process.exit(1);
  });
}
