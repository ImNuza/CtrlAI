/*
  shared/ai.js
  The single AI seam for all three CtrlAI games.

  Deliberately DOM free so it imports under plain node and can be unit tested
  without a browser. Games register a content bank, then ask for a line by event
  key. Nothing here ever throws: a game mid-round must never die because a
  template was missing.

  ============================ SWAP POINT ============================
  aiGenerate is the one function a real LLM replaces. When Tencent Cloud
  (or any provider) is wired in, rewrite ONLY the body of aiGenerate to
  make the call, and keep this exact signature:

      aiGenerate({ game, event, context }) -> Promise<{ text, meta }>

  It is already async and already returns a promise, so no call site has to
  change. The content banks then become the offline fallback for when the
  network is gone: try the model, catch, fall through to pickFromBank.
  meta.source is how the UI and the demo tell the two apart, so keep setting it
  ("bank", "fallback", and later "llm").
  ====================================================================

  Determinism note for callers: template picks are seeded per (game, event)
  call count, so the Nth call of an event in a page load lands on the same
  template every session. For events that fire once per load (welcomes,
  greetings), pass context.seed with per-visit entropy, for example a hash of
  the player name and visit count, or a per-load salt. Memory Garden and
  Mahjong Kakis both use this pattern; without it a once-per-load line feels
  frozen across visits.
*/

const banks = new Map();
const lastPickByKey = new Map();
const callCountByKey = new Map();

const NEUTRAL_FALLBACK = 'Take your time. There is no wrong answer here.';
const SLOT_PATTERN = /\{([a-zA-Z0-9_]+)\}/g;

/**
 * Register a game's content bank.
 * @param {string} game  Game id, for example "memory-garden".
 * @param {Object.<string, string[]>} bank  Event key mapped to template strings.
 * @returns {number} How many event keys were accepted.
 */
export function registerBank(game, bank) {
  if (typeof game !== 'string' || game === '') {
    return 0;
  }
  if (bank === null || typeof bank !== 'object') {
    return 0;
  }
  const cleaned = Object.create(null);
  let accepted = 0;
  const keys = Object.keys(bank);
  for (let i = 0; i < keys.length; i += 1) {
    const key = keys[i];
    const value = bank[key];
    if (!Array.isArray(value)) {
      continue;
    }
    const templates = value.filter(function (item) {
      return typeof item === 'string' && item.trim() !== '';
    });
    if (templates.length > 0) {
      cleaned[key] = templates;
      accepted += 1;
    }
  }
  const existing = banks.get(game);
  if (existing) {
    const cleanedKeys = Object.keys(cleaned);
    for (let i = 0; i < cleanedKeys.length; i += 1) {
      existing[cleanedKeys[i]] = cleaned[cleanedKeys[i]];
    }
  } else {
    banks.set(game, cleaned);
  }
  return accepted;
}

/**
 * Ask for a line of generated text.
 * @param {{game: string, event: string, context?: Object}} request
 * @returns {Promise<{text: string, meta: Object}>}
 */
export async function aiGenerate(request) {
  const input = request === null || typeof request !== 'object' ? {} : request;
  const game = typeof input.game === 'string' ? input.game : '';
  const event = typeof input.event === 'string' ? input.event : '';
  const context = input.context === null || typeof input.context !== 'object' ? {} : input.context;

  const bank = banks.get(game);
  const templates = bank && Array.isArray(bank[event]) ? bank[event] : null;

  if (templates === null || templates.length === 0) {
    return {
      text: NEUTRAL_FALLBACK,
      meta: {
        source: 'fallback',
        game: game,
        event: event,
        template_index: -1,
        missing_slots: []
      }
    };
  }

  const index = pickIndex(game + '::' + event, templates.length, context.seed);
  const filled = fillSlots(templates[index], context);

  return {
    text: filled.text,
    meta: {
      source: 'bank',
      game: game,
      event: event,
      template_index: index,
      missing_slots: filled.missing
    }
  };
}

/**
 * Deterministic PRNG (mulberry32). Same seed, same sequence, every time.
 * @param {number|string} seed
 * @returns {() => number} Function returning floats in [0, 1).
 */
export function makeRng(seed) {
  let state;
  if (typeof seed === 'number' && Number.isFinite(seed)) {
    state = seed >>> 0;
  } else {
    state = hashString(seed === undefined || seed === null ? 'ctrlai' : seed);
  }
  return function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Stable 32 bit hash (FNV-1a). Turns any answer or name into a seed.
 * @param {*} value
 * @returns {number} Unsigned 32 bit integer.
 */
export function hashString(value) {
  const text = value === undefined || value === null ? '' : String(value);
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/* ---- internals ---------------------------------------------------------- */

function pickIndex(key, length, seed) {
  const turn = (callCountByKey.get(key) || 0) + 1;
  callCountByKey.set(key, turn);

  const seedSource = seed === undefined || seed === null ? key + '#' + turn : String(seed);
  const rng = makeRng(hashString(seedSource));

  let index = Math.floor(rng() * length);
  if (index >= length) {
    index = length - 1;
  }
  if (index < 0) {
    index = 0;
  }

  const previous = lastPickByKey.get(key);
  if (length > 1 && index === previous) {
    index = (index + 1) % length;
  }
  lastPickByKey.set(key, index);
  return index;
}

function fillSlots(template, context) {
  const missing = [];
  const raw = String(template).replace(SLOT_PATTERN, function (match, slot) {
    const value = context[slot];
    if (value === undefined || value === null || value === '') {
      missing.push(slot);
      return '';
    }
    return String(value);
  });
  return { text: tidy(raw), missing: missing };
}

// A missing slot leaves a hole rather than a visible {placeholder}. This closes
// the gap so the sentence still reads like a sentence.
function tidy(text) {
  return text
    .replace(/\s+([,.!?;:])/g, '$1')
    .replace(/\(\s*\)/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}
