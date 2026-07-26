/*
  Round assembly. Loads the two content files, registers the bank with the
  shared AI seam once, then builds a whole round up front so every tap during
  the call reveals instantly with no await in the way.
*/

import { registerBank, aiGenerate, makeRng, hashString } from '/shared/ai.js';

const GAME = 'scam-dojo';
const STRUCTURE_URL = '/games/scam-dojo/content/call-structure.json';
const BANK_URL = '/games/scam-dojo/content/scam-scripts.json';
const BENIGN_FALLBACK = 'greeting';

let contentPromise = null;

/**
 * Fetch both content files once and register the bank. Repeat calls reuse the
 * same promise, so registerBank runs exactly once per page load.
 * @returns {Promise<Object>} The call structure document.
 */
export function loadContent() {
  if (contentPromise === null) {
    contentPromise = fetchContent();
  }
  return contentPromise;
}

async function fetchContent() {
  const [structureResponse, bankResponse] = await Promise.all([
    fetch(STRUCTURE_URL),
    fetch(BANK_URL)
  ]);
  if (!structureResponse.ok || !bankResponse.ok) {
    contentPromise = null;
    throw new Error('Scam Dojo content did not load');
  }
  const structure = await structureResponse.json();
  const bank = await bankResponse.json();
  registerBank(GAME, bank);
  return structure;
}

function pickIndex(rng, length) {
  let index = Math.floor(rng() * length);
  if (index >= length) {
    index = length - 1;
  }
  if (index < 0) {
    index = 0;
  }
  return index;
}

// Families seen in the last two rounds are skipped, so three rounds in a row
// are always three different calls. If every family is recent, nothing is
// excluded rather than nothing being playable.
function chooseScript(scripts, recentFamilies, rng) {
  const recent = Array.isArray(recentFamilies) ? recentFamilies : [];
  const fresh = scripts.filter(function (script) {
    return recent.indexOf(script.family) === -1;
  });
  const pool = fresh.length > 0 ? fresh : scripts;
  return pool[pickIndex(rng, pool.length)];
}

function rollSlots(slots, rng) {
  const context = {};
  if (slots === null || typeof slots !== 'object') {
    return context;
  }
  const names = Object.keys(slots);
  for (let i = 0; i < names.length; i += 1) {
    const pool = slots[names[i]];
    if (Array.isArray(pool) && pool.length > 0) {
      context[names[i]] = pool[pickIndex(rng, pool.length)];
    }
  }
  return context;
}

/**
 * Build a complete round: one script, one set of rolled slot values, and every
 * line already generated.
 * @param {{roundsPlayed: number, recentFamilies: string[]}} state
 * @returns {Promise<Object>} The round.
 */
export async function buildRound(state) {
  const structure = await loadContent();
  const scripts = Array.isArray(structure.scripts) ? structure.scripts : [];
  if (scripts.length === 0) {
    throw new Error('Scam Dojo has no scripts');
  }

  const rounds = Number.isFinite(state.roundsPlayed) ? state.roundsPlayed : 0;
  const rng = makeRng(hashString(String(Date.now()) + ':' + rounds));
  const script = chooseScript(scripts, state.recentFamilies, rng);
  // No context.seed: the bank rotates its own picks so repeated events vary.
  const context = rollSlots(script.slots, rng);

  const specs = Array.isArray(script.lines) ? script.lines : [];
  const lines = [];
  for (let i = 0; i < specs.length; i += 1) {
    const spec = specs[i];
    const generated = await aiGenerate({ game: GAME, event: spec.event, context: context });
    const tell = typeof spec.tell === 'string' && spec.tell !== '' ? spec.tell : null;
    lines.push({
      index: i,
      text: generated.text,
      tell: tell,
      benign: tell === null ? benignCategory(spec.benign) : null,
      tapped: false,
      caught: false
    });
  }

  return {
    id: String(script.id),
    family: String(script.family),
    callerName: String(script.callerName),
    callerNumber: String(script.callerNumber),
    tellLabels: structure.tellLabels && typeof structure.tellLabels === 'object' ? structure.tellLabels : {},
    context: context,
    lines: lines
  };
}

function benignCategory(value) {
  return typeof value === 'string' && value !== '' ? value : BENIGN_FALLBACK;
}

/**
 * Human label for a tell, falling back to the raw key so a new tell never
 * renders as blank.
 * @param {Object} labels
 * @param {string} tell
 * @returns {string}
 */
export function tellLabel(labels, tell) {
  if (labels && typeof labels[tell] === 'string' && labels[tell] !== '') {
    return labels[tell];
  }
  return String(tell);
}
