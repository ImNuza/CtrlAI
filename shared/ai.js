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

/*
  ============================ SWAP POINT ============================
  aiClassifyPhoto is the vision seam. When a real vision model is wired
  in (CodeBuddy phase), rewrite ONLY the body of aiClassifyPhoto to send
  the photo and map the answer onto the same shape, keeping this
  signature:

      aiClassifyPhoto({ game, photo, context }) -> Promise<{ found, meta }>

  found is { id, label, confidence } with id from photoFindChoices().
  Tonight the body is a canned classifier: it ignores the photo bytes and
  returns a plausible Singapore garden plant, seeded so QA is stable and
  consecutive calls vary. meta.source is "canned" now, "vision" later, so
  the UI and the demo can stay honest about which brain answered. The
  canned path also remains the offline fallback after the swap: try the
  model, catch, fall through to the canned pick.
  ====================================================================
*/

const PHOTO_FINDS = [
  { id: 'bougainvillea', label: 'Bougainvillea' },
  { id: 'hibiscus', label: 'Hibiscus' },
  { id: 'frangipani', label: 'Frangipani' },
  { id: 'money-plant', label: 'Money plant' },
  { id: 'orchid', label: 'Orchid' },
  { id: 'fern', label: 'Fern' },
  { id: 'heliconia', label: 'Heliconia' },
  { id: 'rain-tree', label: 'Rain tree' }
];

let photoCallCount = 0;
let lastPhotoIndex = -1;

/**
 * The closed set of plants the canned classifier can report. The manual
 * "what did you find" picker shows exactly these, so the two paths always
 * agree on vocabulary.
 * @returns {Array<{id: string, label: string}>} A fresh copy.
 */
export function photoFindChoices() {
  return PHOTO_FINDS.map(function (item) {
    return { id: item.id, label: item.label };
  });
}

/**
 * Identify the plant in a photo. Canned tonight, vision later.
 * Never throws and never inspects photo bytes in the canned path.
 * @param {{game: string, photo?: *, context?: Object}} request
 * @returns {Promise<{found: {id: string, label: string, confidence: number}, meta: Object}>}
 */
export async function aiClassifyPhoto(request) {
  const input = request === null || typeof request !== 'object' ? {} : request;
  const game = typeof input.game === 'string' ? input.game : '';
  const context = input.context === null || typeof input.context !== 'object' ? {} : input.context;

  photoCallCount += 1;
  const seedSource = context.seed === undefined || context.seed === null
    ? 'photo#' + photoCallCount
    : String(context.seed);
  const rng = makeRng(hashString(seedSource));

  let index = Math.floor(rng() * PHOTO_FINDS.length);
  if (index >= PHOTO_FINDS.length) {
    index = PHOTO_FINDS.length - 1;
  }
  if (index === lastPhotoIndex) {
    index = (index + 1) % PHOTO_FINDS.length;
  }
  lastPhotoIndex = index;

  const found = PHOTO_FINDS[index];
  return {
    found: { id: found.id, label: found.label, confidence: 0.6 },
    meta: {
      source: 'canned',
      game: game,
      choices: PHOTO_FINDS.length
    }
  };
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
