/*
  Garden of Life gardener. Auntie Bee lives in one bubble at the top of the
  garden: a line, a face, and the two or three things a player can tap back.

  Everything she says goes through shared/ai.js. The reply chips are what makes
  that seam load bearing. aiGenerate hands back the index of the template it
  used, and the chips for that exact line are looked up by that index, so the
  sentence on screen and the answers under it always belong to each other. That
  only holds while the array registered with the bank and the array the replies
  are read from are built in one pass, by one filter, in file order. They are,
  in readLines and bankFrom below, and nothing in here sorts, filters or
  reorders a line after that.

  She degrades all the way down. No bank at all leaves aiGenerate's neutral
  fallback in the bubble with one warm chip under it, and the name capture still
  works, because a garden with no content file is still a garden.

  Nothing exported from here throws or rejects. A missing line, a missing face
  and a storage write that failed are all just quieter versions of the same
  bubble.
*/

import { registerBank, aiGenerate, hashString } from '../../../shared/ai.js';
import { getPlayer, setPlayerName } from './state.js';

const GAME = 'garden-of-life';
const ART_DIR = '/games/garden-of-life/art/gardener/';

/* ---- expressions ---------------------------------------------------------
   The map the stretch plan fixes, written out so it can be read rather than
   inferred. welcome greets, happy answers a name, admires a plant and takes in
   a full basket, celebrate is for the moment a memory goes into the soil and
   for the dish a harvest just opened, watering is the can, and concerned is
   care for a thirsty plant and never blame for it. thinking is the quiet
   default, so an event nobody planned for still gets a face rather than a
   blank square.

   art/gardener/anchor.png is the character sheet the six faces were drawn
   from. It is not an expression and is deliberately not named here. */

const EXPRESSION = {
  first_visit: 'welcome',
  return_visit: 'welcome',
  return_after_absence: 'welcome',
  name_saved: 'happy',
  plant_comment: 'happy',
  harvest: 'happy',
  planting: 'celebrate',
  meal_unlock: 'celebrate',
  watering: 'watering',
  wilt_notice: 'concerned'
};

const DEFAULT_EXPRESSION = 'thinking';

const GREETINGS = ['first_visit', 'return_visit', 'return_after_absence'];

/* ---- copy written here rather than banked --------------------------------
   Three strings, and every one of them is a thing the bank has no event for.
   Same standards as the bank: read aloud, warm, no guilt, no hurry. */

// The answer to a line that arrived with no replies of its own. Every line she
// says can be answered, even the neutral fallback.
const CONTINUE_REPLY = 'Okay lah';

// The way out of the name form. Always present, never a penalty.
const SKIP_LABEL = 'Later lah';
const SKIP_LINE = 'No hurry lah. Come, the plants are waiting for you.';

// Only reached if a generated line comes back empty, which the seam does not
// do today. The bubble still has to read like her.
const NEUTRAL_LINE = 'Take your time. The garden is not going anywhere.';

const HONORIFICS = ['Auntie', 'Uncle', 'Ah Ma', 'Ah Gong'];

// The schema says 2 or 3 replies. The cap is for a hand edited file, so a row
// of nine chips can never push the garden off the bottom of a phone.
const MAX_REPLIES = 3;

/* Her first line after a name is given has to actually use it, and the bank
   holds one return_visit line with no {name} slot at all. The seed is the only
   lever a caller has over which template comes back, so a fresh one is tried a
   few times until the name lands. Bounded, and the last answer is kept either
   way, so a bank where no line carries a name still puts a line in the bubble. */
const NAME_TRIES = 6;

/* ---- module state ------------------------------------------------------- */

const el = {};

// Only the tap guard is used. This module never switches sections: it lives
// inside the garden and its form opens in place. A working default is here so
// a reaction that somehow lands before init still answers taps.
let views = { staleTap: function () { return false; } };

// event key mapped to the lines kept from the file, in file order. The one
// source for both the registration and the reply chips.
let kept = Object.create(null);

let ready = false;

// The line the bubble is showing belongs to the newest react. Anything older
// that resolves late has nothing to say to the screen the player is on now.
let reactToken = 0;

// Per load, and per event within the load. Without it the Nth call of an event
// picks the same template every session and her greeting freezes across
// visits, which is the determinism note at the top of shared/ai.js.
let reactCount = 0;
let loadSalt = '';

let currentExpression = '';
let repliesOpenNameForm = false;
let chosenHonorific = '';

// Whatever the caller knew about the last plant at boot, kept so the re-greet
// after a name is saved fills the same {plant} slot the greeting did.
let greetingPlant = '';

/* ---- small helpers ------------------------------------------------------ */

function byId(id) {
  return document.getElementById(id);
}

function on(node, type, handler) {
  if (node !== null && node !== undefined) {
    node.addEventListener(type, handler);
  }
}

function trimmed(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function notEmpty(value) {
  return value !== '';
}

function closestIn(container, event, selector) {
  const target = event.target;
  if (container === null || target === null || typeof target.closest !== 'function') {
    return null;
  }
  const node = target.closest(selector);
  return node !== null && container.contains(node) ? node : null;
}

/* ---- reading the bank ---------------------------------------------------
   registerBank keeps a template when it is a non empty string and silently
   drops everything else. This filter matches it exactly, on purpose: one line
   dropped on its side and not on ours would slide every reply after it onto
   the wrong sentence for the rest of the session. A malformed entry therefore
   goes entirely, text and replies together, and both arrays stay aligned. */

function cleanReplies(raw) {
  if (!Array.isArray(raw)) {
    return [];
  }
  const out = [];
  for (let i = 0; i < raw.length && out.length < MAX_REPLIES; i += 1) {
    const label = trimmed(raw[i]);
    if (label !== '') {
      out.push(label);
    }
  }
  return out;
}

function readLines(raw) {
  const out = Object.create(null);
  if (raw === null || typeof raw !== 'object') {
    return out;
  }
  const events = raw.events;
  if (events === null || typeof events !== 'object') {
    return out;
  }
  const keys = Object.keys(events);
  for (let i = 0; i < keys.length; i += 1) {
    const list = events[keys[i]];
    if (!Array.isArray(list)) {
      continue;
    }
    const entries = [];
    for (let j = 0; j < list.length; j += 1) {
      const line = list[j];
      if (line !== null && typeof line === 'object' &&
        typeof line.text === 'string' && line.text.trim() !== '') {
        // The text is passed on untouched. shared/ai.js tidies what it fills.
        entries.push({ text: line.text, replies: cleanReplies(line.replies) });
      }
    }
    if (entries.length > 0) {
      out[keys[i]] = entries;
    }
  }
  return out;
}

function bankFrom(source) {
  const bank = {};
  const keys = Object.keys(source);
  for (let i = 0; i < keys.length; i += 1) {
    const entries = source[keys[i]];
    const texts = [];
    for (let j = 0; j < entries.length; j += 1) {
      texts.push(entries[j].text);
    }
    bank[keys[i]] = texts;
  }
  return bank;
}

function repliesFor(event, index) {
  const entries = kept[event];
  if (!Array.isArray(entries)) {
    return [];
  }
  // Index -1 from the neutral fallback lands here as undefined, same as an
  // index from a bank that was swapped underneath us.
  const entry = entries[index];
  return entry === undefined || entry === null ? [] : entry.replies;
}

/* ---- the player --------------------------------------------------------- */

function player() {
  try {
    const record = getPlayer();
    return record === null || typeof record !== 'object' ? null : record;
  } catch (error) {
    return null;
  }
}

/* Honorific plus name, and an empty answer is a real answer: shared/ai.js drops
   the slot and tidies the sentence around it. Honorific only is the whole name
   when that is all anybody chose to say. */
function composedName() {
  const record = player();
  if (record === null) {
    return '';
  }
  return [trimmed(record.honorific), trimmed(record.name)].filter(notEmpty).join(' ');
}

function memoryHint() {
  const record = player();
  return record === null ? '' : trimmed(record.memoryHint);
}

function visitCount() {
  const record = player();
  const count = record === null ? 0 : record.visitCount;
  return Number.isFinite(count) ? count : 0;
}

/* ---- the seam ----------------------------------------------------------- */

/* One salt for the load, read the first time she speaks. performance and not a
   date: state.todayISO() is the only clock this game has, and a per load salt
   has no business in that conversation. timeOrigin moves every load, now moves
   within it, and the event counter keeps two reactions in the same load apart. */
function perLoadSalt() {
  if (loadSalt === '') {
    let origin = 0;
    let since = 0;
    try {
      if (typeof performance === 'object' && performance !== null) {
        origin = Number.isFinite(performance.timeOrigin) ? performance.timeOrigin : 0;
        since = typeof performance.now === 'function' ? performance.now() : 0;
      }
    } catch (error) {
      origin = 0;
    }
    loadSalt = String(origin) + ':' + String(since);
  }
  return loadSalt;
}

function freshSeed(event) {
  reactCount += 1;
  return hashString(perLoadSalt() + '|' + event + '#' + reactCount);
}

/* The slots every line of hers may use, filled from state so no caller has to
   remember them. A caller's own context sits on top of these, so passing
   name or memory_hint explicitly always wins, including passing an empty one. */
function baseSlots() {
  return { name: composedName(), memory_hint: memoryHint(), plant: '' };
}

async function askOnce(event, slots) {
  return aiGenerate({
    game: GAME,
    event: event,
    context: Object.assign({}, slots, { seed: freshSeed(event) })
  });
}

async function generate(event, context, needsName) {
  const extra = context === null || typeof context !== 'object' ? {} : context;
  const slots = Object.assign(baseSlots(), extra);
  let answer = await askOnce(event, slots);

  const wanted = needsName === true ? trimmed(slots.name) : '';
  let tries = 0;
  while (wanted !== '' && tries < NAME_TRIES && trimmed(textOf(answer)).indexOf(wanted) === -1) {
    tries += 1;
    answer = await askOnce(event, slots);
  }
  return answer;
}

function textOf(answer) {
  return answer !== null && typeof answer === 'object' ? trimmed(answer.text) : '';
}

function indexOf(answer) {
  const meta = answer !== null && typeof answer === 'object' ? answer.meta : null;
  const index = meta !== null && typeof meta === 'object' ? meta.template_index : -1;
  return Number.isFinite(index) ? index : -1;
}

function expressionFor(event, override) {
  if (typeof override === 'string' && override !== '') {
    return override;
  }
  const mapped = EXPRESSION[event];
  return typeof mapped === 'string' ? mapped : DEFAULT_EXPRESSION;
}

/* ---- painting the bubble ------------------------------------------------ */

/* A face that never loaded takes itself out of the layout and the bubble reads
   fine without it, so art landing late changes nothing. The retry rides on the
   expression changing rather than on every line, so a png that is genuinely
   missing is asked for once per expression instead of once per sentence. */
function setExpression(name) {
  if (el.art === null || el.art === undefined || name === currentExpression) {
    return;
  }
  currentExpression = name;
  el.art.hidden = false;
  el.art.src = ART_DIR + name + '.png';
}

function clearReplies() {
  repliesOpenNameForm = false;
  if (el.replies !== null && el.replies !== undefined) {
    el.replies.replaceChildren();
  }
}

function renderReplies(labels, routeToNameForm) {
  if (el.replies === null || el.replies === undefined) {
    return;
  }
  const list = Array.isArray(labels) && labels.length > 0 ? labels : [CONTINUE_REPLY];
  const nodes = [];
  for (let i = 0; i < list.length; i += 1) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip';
    chip.textContent = list[i];
    nodes.push(chip);
  }
  el.replies.replaceChildren.apply(el.replies, nodes);
  repliesOpenNameForm = routeToNameForm === true;
}

/* The bubble stays out of the way until there is something of hers in it, so a
   garden with nothing to say never shows an empty card. */
function showBubble() {
  if (el.root !== null && el.root !== undefined) {
    el.root.hidden = false;
  }
}

function paint(text, expression, replies, routeToNameForm) {
  showBubble();
  if (el.line !== null && el.line !== undefined) {
    el.line.textContent = text;
  }
  setExpression(expression);
  renderReplies(replies, routeToNameForm);
}

/* Every line she says comes through here. Replies are cleared before the first
   await, so the answers to the last line can never sit under the next one while
   it resolves, and the token makes the newest call the only one that paints. */
async function speak(event, context, options) {
  ensureReady();
  const settings = options === null || typeof options !== 'object' ? {} : options;

  reactToken += 1;
  const token = reactToken;
  clearReplies();
  hideNameForm();

  try {
    const answer = await generate(event, context, settings.needsName === true);
    if (token !== reactToken) {
      return;
    }
    const text = textOf(answer);
    paint(
      text === '' ? NEUTRAL_LINE : text,
      expressionFor(event, settings.expression),
      repliesFor(event, indexOf(answer)),
      settings.nameForm === true
    );
  } catch (error) {
    // The seam does not throw and neither does this. Whatever was in the bubble
    // stays in it, which is a quiet screen rather than a broken one.
  }
}

/* ---- the name form ------------------------------------------------------ */

function selectHonorific(value) {
  chosenHonorific = value;
  if (el.honorifics === null || el.honorifics === undefined) {
    return;
  }
  const chips = el.honorifics.querySelectorAll('.chip');
  for (let i = 0; i < chips.length; i += 1) {
    const picked = chips[i].dataset.honorific === value && value !== '';
    chips[i].setAttribute('aria-pressed', picked ? 'true' : 'false');
    chips[i].classList.toggle('is-selected', picked);
  }
}

function buildHonorificChips() {
  if (el.honorifics === null || el.honorifics === undefined) {
    return;
  }
  const nodes = [];
  for (let i = 0; i < HONORIFICS.length; i += 1) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip';
    chip.dataset.honorific = HONORIFICS[i];
    chip.setAttribute('aria-pressed', 'false');
    chip.textContent = HONORIFICS[i];
    nodes.push(chip);
  }
  el.honorifics.replaceChildren.apply(el.honorifics, nodes);
}

/* The skeleton carries the form's four parts and no way back out of one, so the
   chip that closes it is built here, inside the form and under the save button,
   which is where a way out belongs. It is the only node this module adds to the
   skeleton, and it lives inside the form the skeleton already reserves room for. */
function buildSkipChip() {
  if (el.form === null || el.form === undefined) {
    return;
  }
  const chip = document.createElement('button');
  chip.type = 'button';
  chip.className = 'chip';
  chip.textContent = SKIP_LABEL;
  el.form.appendChild(chip);
  el.skip = chip;
}

function openNameForm() {
  if (el.form === null || el.form === undefined) {
    return;
  }
  selectHonorific('');
  if (el.nameInput !== null && el.nameInput !== undefined) {
    el.nameInput.value = '';
  }
  el.form.hidden = false;
  // The row that led here has done its job. Later lah is the way back out now.
  clearReplies();
}

function hideNameForm() {
  if (el.form !== null && el.form !== undefined) {
    el.form.hidden = true;
  }
}

/* Both parts are optional and saving with neither is not an error. An honorific
   on its own is the whole name, which is how somebody who would rather not type
   still gets called something. */
function saveName() {
  const typed = el.nameInput === null || el.nameInput === undefined
    ? ''
    : trimmed(el.nameInput.value);
  try {
    setPlayerName(typed, chosenHonorific);
  } catch (error) {
    // Storage refusing to write is not the player's problem. She still answers.
  }
  if (el.nameInput !== null && el.nameInput !== undefined) {
    el.nameInput.value = '';
  }
  hideNameForm();

  /* Through the bank rather than written here, and return_visit because those
     are the lines that say a name out loud. needsName keeps trying seeds until
     the one line in that event with no {name} slot is not the one she uses. */
  speak('return_visit', { plant: greetingPlant }, { expression: 'happy', needsName: true });
}

/* Nothing is stored and nothing is held against anybody. The bubble says so in
   written copy because the bank has no event for a question politely declined. */
function skipName() {
  hideNameForm();
  // Any generate still in flight loses the bubble to this.
  reactToken += 1;
  paint(SKIP_LINE, 'happy', [], false);
}

/* ---- wiring ------------------------------------------------------------- */

function cacheElements() {
  el.root = byId('gardener');
  el.art = byId('gardener-art');
  el.line = byId('gardener-line');
  el.replies = byId('gardener-replies');
  el.form = byId('gardener-name-form');
  el.honorifics = byId('honorific-chips');
  el.nameInput = byId('gardener-name-input');
  el.save = byId('gardener-name-save');
  el.skip = null;
}

function bind() {
  on(el.art, 'error', function () {
    el.art.hidden = true;
  });

  on(el.replies, 'click', function (event) {
    if (views.staleTap(event)) {
      return;
    }
    const chip = closestIn(el.replies, event, '.chip');
    if (chip === null) {
      return;
    }
    if (repliesOpenNameForm) {
      openNameForm();
      return;
    }
    // Answered, so the row goes quiet. None of these was a question with a
    // right answer, and nothing asks again.
    clearReplies();
  });

  on(el.honorifics, 'click', function (event) {
    if (views.staleTap(event)) {
      return;
    }
    const chip = closestIn(el.honorifics, event, '.chip');
    if (chip === null || typeof chip.dataset.honorific !== 'string') {
      return;
    }
    selectHonorific(chip.dataset.honorific);
  });

  on(el.save, 'click', function (event) {
    if (views.staleTap(event)) {
      return;
    }
    saveName();
  });

  /* Typing is never on the way forward, and for the grandchild who is typing
     anyway the keyboard's own done key should finish the job. A key press
     cannot be the tail of a double tap, so it needs no guard. */
  on(el.nameInput, 'keydown', function (event) {
    if (event.key === 'Enter') {
      event.preventDefault();
      saveName();
    }
  });

  on(el.skip, 'click', function (event) {
    if (views.staleTap(event)) {
      return;
    }
    skipName();
  });
}

/* Once for the life of the page. A second run would append a second skip chip
   and answer every tap twice.

   Wiring up is the only part of this module that reaches for a document, and it
   is wrapped because the two exports promise never to throw. Nothing to wire
   into leaves every node unset, every paint below checks its node, and the
   module stays callable with nowhere to draw. */
function ensureReady() {
  if (ready) {
    return;
  }
  ready = true;
  try {
    cacheElements();
    buildHonorificChips();
    buildSkipChip();
    bind();
  } catch (error) {
    // Every node stays unset and every paint below checks its own.
  }
}

function visitKind(visit) {
  const kind = visit !== null && typeof visit === 'object' ? trimmed(visit.kind) : '';
  if (GREETINGS.indexOf(kind) !== -1) {
    return kind;
  }
  /* No classification handed over. recordVisit has already counted this load by
     the time anything calls in here, so a count past one says somebody has been
     here before, and a returning player is never asked their name again. */
  return visitCount() > 1 ? 'return_visit' : 'first_visit';
}

/* ---- exports ------------------------------------------------------------ */

/**
 * Wire up the gardener bubble, register her lines, and greet the player.
 *
 * Safe to call with nothing. A null or unusable bank registers no lines, which
 * leaves aiGenerate's neutral fallback in the bubble with one warm chip under
 * it, and the name capture still works. Nothing in here throws.
 *
 * @param {Object} options
 * @param {Object|null} [options.lines] Parsed content/gardener-lines.json, or
 *   null when it has not landed. Registered in file order, because the reply
 *   chips are looked up by the template index aiGenerate hands back.
 * @param {{staleTap: Function}} [options.views] The view handle from main.js.
 *   Only staleTap is used: this module never switches sections.
 * @param {{kind: string}} [options.visit] The recordVisit() classification kept
 *   from boot. kind is first_visit, return_visit or return_after_absence.
 * @param {string} [options.plant] Species label of the last plant, when the
 *   caller has one. Fills {plant} in the greeting; the lines read fine without.
 * @returns {number} How many event keys she has lines for.
 */
export function initGardener(options) {
  const config = options === null || typeof options !== 'object' ? {} : options;
  const handle = config.views === null || typeof config.views !== 'object' ? {} : config.views;

  views = {
    staleTap: typeof handle.staleTap === 'function'
      ? handle.staleTap
      : function () { return false; }
  };

  ensureReady();
  kept = readLines(config.lines);
  registerBank(GAME, bankFrom(kept));
  greetingPlant = trimmed(config.plant);

  const kind = visitKind(config.visit);
  // The first visit is the only greeting whose replies lead into the name form.
  speak(kind, { plant: greetingPlant }, { nameForm: kind === 'first_visit' });

  return Object.keys(kept).length;
}

/**
 * Have the gardener react to something that just happened.
 *
 * Fully replaces what is in the bubble: the line, her expression and the reply
 * chips under it. Safe to call again before the last call has resolved, and
 * safe to call repeatedly. The replies row is cleared the moment a call starts,
 * so the answers to the previous line never sit under the next one, and only
 * the newest call is allowed to paint.
 *
 * Reaction priority when several moments collide belongs to the wiring glue,
 * not to this function.
 *
 * Resolves either way and never rejects.
 *
 * @param {string} event Bank event key, for example planting, watering,
 *   wilt_notice or plant_comment. An unknown key lands on the neutral fallback.
 * @param {Object} [context] Slot values for the line. {name} and {memory_hint}
 *   are filled from state already, so a caller only needs the ones it knows,
 *   typically {plant}. Anything passed here wins over the state values, an
 *   empty string included.
 * @returns {Promise<void>}
 */
export async function gardenerReact(event, context) {
  await speak(trimmed(event), context, {});
}
