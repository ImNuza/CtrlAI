/*
  Garden of Life memory flow. Three screens live in here: the object picker, the
  three tap prompts, and the ceremony where the plant finally arrives. It holds
  the draft memory from the first tap until Done plants it, and it owns the story
  a plant tells whenever anything asks for one.

  None of it needs the content bank to have landed. A missing bank leaves the
  picker sitting on its waiting line with no objects rendered into it, which is a
  calm screen rather than a broken one, and every field read back out of the bank
  is treated as something a person could have hand edited.

  Typing is never on the way forward. The one text field is optional, it belongs
  to the grandchild, and nothing downstream ever reads what goes in it.
*/

import { aiGenerate } from '../../../shared/ai.js';
import { addPlant, recordPlanting, getPlayer } from './state.js';
import { composePlant } from './composer.js';

const GAME = 'garden-of-life';
const OBJECT_ART_DIR = '/games/garden-of-life/art/objects/';

// The ceremony always shows the plant grown up. The garden then puts it in as a
// sprout, and index.html says so in writing, so the picture is a promise rather
// than a lie about what is about to appear in the plot.
const CEREMONY_STAGE = 2;

const MAX_FREE_TEXT = 120;

// Axis order is the bank's, and the bank names it on every prompt. The list is
// only the fallback for a prompt that arrived without one.
const AXES = ['who', 'where', 'feeling'];

// Who shapes the blooms, where hangs the ornament, feeling sets the palette.
const TAG_PREFIX = { who: 'bloom:', where: 'ornament:', feeling: 'palette:' };
const TAG_KEY = { who: 'bloom', where: 'ornament', feeling: 'palette' };

// An id off the bank is pasted into an image path, so only ids this game could
// have written are allowed anywhere near a URL.
const SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/;

const FALLBACK_QUESTION = 'What comes back when you think of it?';
const GENERIC_PLANT = 'garden plant';
const NEUTRAL_STORY = 'This one still remembers that day, clear as anything.';

/* ---- module state ------------------------------------------------------- */

const el = {};

// Cleaned copies of the bank, never the parsed file itself, so nothing later
// has to ask whether a field survived.
let objects = [];

let views = null;
let onPlanted = null;

// The memory being told. picks is indexed by step rather than by axis, so a bank
// that repeats an axis cannot make the next question look already answered.
const draft = { object: null, step: 0, picks: [] };

// Built at the ceremony, planted by Done. Nulled the moment it is used, which is
// what stops a second tap from planting the same memory twice.
let pending = null;

// One ceremony at a time. runCeremony crosses an await, and without this a
// second activation inside that window would compose a second plant.
let growing = false;
let planting = false;

// The story asked for last. A late answer for a memory the player already left
// has nothing to say to the screen they are on now.
let storyToken = 0;

/* Listeners go on once for the life of the page. A second init would otherwise
   answer every tap twice, and two runs of one handler is not a doubled tap: the
   first run moves the step and the second reads the step it just moved to, so a
   question gets skipped and Back walks out of the flow entirely. */
let bound = false;

/* One story per plant for as long as the page is open. shared/ai.js deliberately
   rotates off the previous pick for an event, so asking a second time with the
   same seed lands on the next template instead of the same one. A memory that
   reads differently every time it is opened is a memory nobody can trust, so the
   first answer stays the answer. */
const stories = new Map();

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

/* ---- reading the bank ---------------------------------------------------
   Everything below rebuilds the bank into the shape this file wants. A field
   that did not survive the trip leaves a usable default, and anything with no
   usable content at all is dropped rather than rendered as a blank card. */

function cleanChip(raw) {
  if (raw === null || typeof raw !== 'object') {
    return null;
  }
  const id = trimmed(raw.id);
  if (id === '') {
    return null;
  }
  const label = trimmed(raw.label);
  return {
    id: id,
    label: label === '' ? id : label,
    phrase: trimmed(raw.phrase),
    tags: Array.isArray(raw.tags) ? raw.tags : []
  };
}

function cleanPrompt(raw, index) {
  if (raw === null || typeof raw !== 'object') {
    return null;
  }
  const source = Array.isArray(raw.chips) ? raw.chips : [];
  const chips = [];
  for (let i = 0; i < source.length; i += 1) {
    const chip = cleanChip(source[i]);
    if (chip !== null) {
      chips.push(chip);
    }
  }
  if (chips.length === 0) {
    return null;
  }
  // The position is the source position, not the kept one, so dropping a broken
  // prompt cannot slide the axis of the ones after it.
  const named = trimmed(raw.axis);
  const axis = TAG_PREFIX[named] === undefined
    ? (AXES[index] === undefined ? AXES[AXES.length - 1] : AXES[index])
    : named;
  const question = trimmed(raw.q);
  return {
    axis: axis,
    q: question === '' ? FALLBACK_QUESTION : question,
    freeText: raw.free_text === true,
    chips: chips
  };
}

function cleanObject(raw) {
  if (raw === null || typeof raw !== 'object') {
    return null;
  }
  const id = trimmed(raw.id);
  if (id === '') {
    return null;
  }
  const source = Array.isArray(raw.prompts) ? raw.prompts : [];
  const prompts = [];
  for (let i = 0; i < source.length; i += 1) {
    const prompt = cleanPrompt(source[i], i);
    if (prompt !== null) {
      prompts.push(prompt);
    }
  }
  if (prompts.length === 0) {
    return null;
  }
  const label = trimmed(raw.label);
  return {
    id: id,
    label: label === '' ? id : label,
    phrase: trimmed(raw.phrase),
    prompts: prompts
  };
}

function readBank(raw) {
  if (raw === null || typeof raw !== 'object') {
    return [];
  }
  const source = Array.isArray(raw.objects) ? raw.objects : [];
  const cleaned = [];
  for (let i = 0; i < source.length; i += 1) {
    const object = cleanObject(source[i]);
    if (object !== null) {
      cleaned.push(object);
    }
  }
  return cleaned;
}

function objectById(id) {
  for (let i = 0; i < objects.length; i += 1) {
    if (objects[i].id === id) {
      return objects[i];
    }
  }
  return null;
}

function chipById(prompt, id) {
  for (let i = 0; i < prompt.chips.length; i += 1) {
    if (prompt.chips[i].id === id) {
      return prompt.chips[i];
    }
  }
  return null;
}

/* The trait value the composer wants, taken off the chip that was just tapped.
   First matching tag wins and extra tags after it are ignored, which is the rule
   the content schema is written to. Nothing found leaves the trait undefined and
   the composer's own defaults absorb it. */
function tagValue(chip, axis) {
  const prefix = TAG_PREFIX[axis];
  if (prefix === undefined) {
    return undefined;
  }
  for (let i = 0; i < chip.tags.length; i += 1) {
    const tag = chip.tags[i];
    if (typeof tag === 'string' && tag.indexOf(prefix) === 0) {
      const value = tag.slice(prefix.length).trim();
      if (value !== '') {
        return value;
      }
    }
  }
  return undefined;
}

/* ---- picker ------------------------------------------------------------- */

function objectCard(item) {
  const card = document.createElement('button');
  card.type = 'button';
  card.className = 'object-card';
  card.dataset.objectId = item.id;

  if (SAFE_ID.test(item.id)) {
    const art = document.createElement('img');
    art.className = 'object-art';
    art.alt = '';
    art.src = OBJECT_ART_DIR + item.id + '.png';
    /* Art arrives on its own schedule and one file may simply never turn up. A
       picture that cannot load takes itself out of the layout and leaves the
       card a warm block with its name on it, which is all the tap needs. */
    art.addEventListener('error', function () {
      art.hidden = true;
    });
    card.appendChild(art);
  }

  /* The blurb from the bank stays off the card. Two columns at 390 wide give a
     track no wider than the longest word it has to hold, and a sentence at the
     28px floor drops the name to three words a line. The copy waits for a layout
     with room for it. */
  const name = document.createElement('span');
  name.textContent = item.label;
  card.appendChild(name);

  return card;
}

function renderObjects() {
  const nodes = [];
  for (let i = 0; i < objects.length; i += 1) {
    nodes.push(objectCard(objects[i]));
  }
  el.objects.replaceChildren.apply(el.objects, nodes);
  // The waiting line answers whether there is anything here to tap, so it stands
  // until there genuinely is, and it comes back if the cards ever go away.
  if (el.pickerWait !== null) {
    el.pickerWait.hidden = nodes.length > 0;
  }
}

/* ---- prompts ------------------------------------------------------------ */

function steps() {
  return draft.object === null ? [] : draft.object.prompts;
}

function currentPrompt() {
  const list = steps();
  return list[draft.step] === undefined ? null : list[draft.step];
}

function onLastStep() {
  return draft.step >= steps().length - 1;
}

function pickedNow() {
  const pick = draft.picks[draft.step];
  return pick === undefined || pick === null ? null : pick;
}

function clearNudge() {
  if (el.promptNudge !== null) {
    el.promptNudge.textContent = '';
  }
}

// The not yet button keeps a readable label and still answers a tap. No shake,
// no red, nobody told off for pressing the biggest thing on the screen.
function showNudge() {
  if (el.promptNudge !== null) {
    el.promptNudge.textContent = onLastStep()
      ? 'Pick one of the answers first, then we grow it.'
      : 'Pick one of the answers first, then we carry on.';
  }
}

function setNextReady(ready) {
  if (el.promptNext === null) {
    return;
  }
  el.promptNext.setAttribute('aria-disabled', ready ? 'false' : 'true');
  if (ready) {
    clearNudge();
  }
}

/* Stepping between questions is not a section change. Focus moves here rather
   than through views.show so the stale tap guard is never restarted mid flow,
   which is what keeps a fast answer from being swallowed. */
function focusQuestion() {
  if (el.promptHeading !== null && typeof el.promptHeading.focus === 'function') {
    el.promptHeading.focus();
  }
}

function renderPrompt() {
  const prompt = currentPrompt();
  if (prompt === null) {
    return;
  }
  const chosen = pickedNow();

  el.promptStep.textContent = 'Question ' + (draft.step + 1) + ' of ' + steps().length;
  el.promptHeading.textContent = prompt.q;
  el.freeTextField.hidden = !prompt.freeText;
  clearNudge();

  const nodes = [];
  for (let i = 0; i < prompt.chips.length; i += 1) {
    const chip = prompt.chips[i];
    const selected = chosen !== null && chosen.chipId === chip.id;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'chip' + (selected ? ' is-selected' : '');
    button.dataset.chipId = chip.id;
    button.setAttribute('aria-pressed', selected ? 'true' : 'false');
    button.textContent = chip.label;
    nodes.push(button);
  }
  el.promptChips.replaceChildren.apply(el.promptChips, nodes);

  el.promptNext.textContent = onLastStep() ? 'Grow this memory' : 'Next';
  setNextReady(chosen !== null);
}

function startObject(id) {
  const object = objectById(id);
  if (object === null) {
    return;
  }
  draft.object = object;
  draft.step = 0;
  draft.picks = [];
  pending = null;
  // A note typed for one object must never follow the player to another.
  if (el.freeText !== null) {
    el.freeText.value = '';
  }
  renderPrompt();
  views.show('prompt', true);
}

function freeTextValue() {
  if (el.freeText === null) {
    return '';
  }
  return trimmed(el.freeText.value).slice(0, MAX_FREE_TEXT);
}

/* ---- the draft plant ---------------------------------------------------- */

/* Phrases and traits are both read off the chips that were tapped, and both are
   copied onto the plant now. A saved story then replays word for word years
   after the bank it came from was edited, and the composer never sees a chip id. */
function draftPlant() {
  const answers = {};
  const phrases = {};
  const tags = {};

  for (let i = 0; i < draft.picks.length; i += 1) {
    const pick = draft.picks[i];
    if (pick === undefined || pick === null) {
      continue;
    }
    answers[pick.axis] = pick.chipId;
    phrases[pick.axis] = pick.phrase;
    if (pick.tagValue !== undefined && TAG_KEY[pick.axis] !== undefined) {
      tags[TAG_KEY[pick.axis]] = pick.tagValue;
    }
  }

  return {
    objectId: draft.object.id,
    answers: { who: answers.who, where: answers.where, feeling: answers.feeling },
    phrases: {
      object: draft.object.phrase,
      who: phrases.who,
      where: phrases.where,
      feeling: phrases.feeling
    },
    tags: { palette: tags.palette, bloom: tags.bloom, ornament: tags.ornament },
    freeText: freeTextValue(),
    seed: 0
  };
}

/* ---- ceremony ----------------------------------------------------------- */

async function runCeremony() {
  if (growing || draft.object === null) {
    return;
  }
  growing = true;
  storyToken += 1;
  const token = storyToken;
  let plant = null;

  try {
    plant = draftPlant();
    const built = composePlant({
      objectId: plant.objectId,
      tags: plant.tags,
      stage: CEREMONY_STAGE,
      wilted: false
    });
    // The composer's own seed, kept on the plant, is what makes this exact
    // picture regrow in the plot and in the panel forever.
    plant.seed = built.seed;
    pending = plant;

    el.ceremonyStage.className = 'stage stage-grow';
    el.ceremonyStage.innerHTML = built.svg;
    el.ceremonyLine.textContent = '';
    views.show('ceremony', true);
  } finally {
    growing = false;
  }

  const line = await storyFor(plant);
  if (token === storyToken) {
    el.ceremonyLine.textContent = line;
  }
}

function plantIt() {
  if (planting || pending === null) {
    return;
  }
  planting = true;
  const ready = pending;
  pending = null;
  try {
    const plant = addPlant(ready);
    recordPlanting(plant);
    if (onPlanted !== null) {
      onPlanted(plant);
    }
  } finally {
    planting = false;
    // In the finally on purpose. Whatever a renderer downstream does with the
    // new plant, the player who tapped Done ends up in their garden.
    views.show('garden', true);
  }
}

/* ---- the story ---------------------------------------------------------- */

function playerName() {
  try {
    const player = getPlayer();
    return player === null || typeof player !== 'object' ? '' : trimmed(player.name);
  } catch (error) {
    return '';
  }
}

// One compose call for the species name. Wasteful looking and worth it: the name
// then always matches the plant that is actually on screen, including when the
// traits file never landed and every plant is a sprout.
function speciesLabel(plant) {
  try {
    const built = composePlant({
      objectId: typeof plant.objectId === 'string' ? plant.objectId : '',
      tags: plant.tags === null || typeof plant.tags !== 'object' ? {} : plant.tags,
      stage: CEREMONY_STAGE,
      wilted: false
    });
    const label = built === null || typeof built !== 'object' || built.traits === null ||
      typeof built.traits !== 'object' ? '' : trimmed(built.traits.speciesLabel);
    return label === '' ? GENERIC_PLANT : label;
  } catch (error) {
    return GENERIC_PLANT;
  }
}

function storyKey(plant, phrases, name) {
  return [
    String(plant.seed),
    typeof plant.objectId === 'string' ? plant.objectId : '',
    trimmed(phrases.object),
    trimmed(phrases.who),
    trimmed(phrases.where),
    trimmed(phrases.feeling),
    name
  ].join('|');
}

/* ---- exports ------------------------------------------------------------ */

/**
 * Wire up the picker, the three prompts and the ceremony.
 *
 * Safe to call with nothing: a null or unusable bank renders no object cards, so
 * the picker keeps the waiting line index.html ships with and every screen stays
 * navigable. Nothing in here throws.
 *
 * @param {Object} options
 * @param {Object|null} [options.prompts] Parsed content/memory-prompts.json, or
 *   null when it has not landed.
 * @param {{show: Function, staleTap: Function}} [options.views] The view handle
 *   from main.js. show(name, moveFocus) switches section, staleTap(event) is
 *   true when a tap belongs to the screen before this one.
 * @param {Function} [options.onPlanted] Called with the stored plant once Done
 *   has planted it, before the garden comes back on screen.
 * @returns {number} How many objects the picker can offer.
 */
export function initMemoryFlow(options) {
  const config = options === null || typeof options !== 'object' ? {} : options;
  const handle = config.views === null || typeof config.views !== 'object' ? {} : config.views;

  // markShown is for overlays, and this module owns none: every screen it shows
  // is a real section and goes through show.
  views = {
    show: typeof handle.show === 'function' ? handle.show : function () {},
    staleTap: typeof handle.staleTap === 'function' ? handle.staleTap : function () { return false; }
  };
  onPlanted = typeof config.onPlanted === 'function' ? config.onPlanted : null;

  cacheElements();
  objects = readBank(config.prompts);
  bind();
  renderObjects();
  return objects.length;
}

/**
 * The line a plant tells when its story is replayed.
 *
 * Takes anything carrying phrases, tags, objectId and seed, so the ceremony
 * draft and a plant read back out of storage both work and both read the same.
 * The seed is the plant's own, and the answer is remembered for the page, so a
 * story told twice is the same story twice. Resolves to a warm line whatever
 * happens; it never rejects.
 *
 * @param {{phrases?: Object, tags?: Object, objectId?: string, seed?: number}} plantish
 * @returns {Promise<string>} The story line, never empty.
 */
export async function storyFor(plantish) {
  const plant = plantish === null || typeof plantish !== 'object' ? {} : plantish;
  const phrases = plant.phrases === null || typeof plant.phrases !== 'object' ? {} : plant.phrases;
  const name = playerName();
  const key = storyKey(plant, phrases, name);

  const told = stories.get(key);
  if (told !== undefined) {
    return told;
  }

  try {
    // Reads mid sentence, exactly as state.js stores it: "the kopitiam cup with
    // my mother" drops straight into a line of hers.
    const hint = [trimmed(phrases.object), trimmed(phrases.who)].filter(function (part) {
      return part !== '';
    }).join(' ');

    const answer = await aiGenerate({
      game: GAME,
      event: 'story_retell',
      context: {
        object_phrase: trimmed(phrases.object),
        who_phrase: trimmed(phrases.who),
        where_phrase: trimmed(phrases.where),
        feeling_phrase: trimmed(phrases.feeling),
        plant: speciesLabel(plant),
        // An empty name is a real answer: nobody has to tell her anything, and
        // shared/ai.js drops the slot and tidies the sentence around it.
        name: name,
        memory_hint: hint,
        seed: plant.seed
      }
    });

    const text = answer === null || typeof answer !== 'object' ? '' : trimmed(answer.text);
    const line = text === '' ? NEUTRAL_STORY : text;
    stories.set(key, line);
    return line;
  } catch (error) {
    // Not remembered, so a bank that lands later still gets its turn.
    return NEUTRAL_STORY;
  }
}

/* ---- wiring ------------------------------------------------------------- */

function cacheElements() {
  el.pickerWait = byId('picker-wait');
  el.objects = byId('objects');
  el.promptStep = byId('prompt-step');
  el.promptHeading = byId('prompt-heading');
  el.promptChips = byId('prompt-chips');
  el.promptNext = byId('prompt-next');
  el.promptNudge = byId('prompt-nudge');
  el.promptBack = byId('prompt-back');
  el.freeTextField = byId('freetext-field');
  el.freeText = byId('freetext');
  el.ceremonyStage = byId('ceremony-stage');
  el.ceremonyLine = byId('ceremony-line');
  el.ceremonyDone = byId('ceremony-done');
}

function closestIn(container, event, selector) {
  const target = event.target;
  if (target === null || typeof target.closest !== 'function') {
    return null;
  }
  const node = target.closest(selector);
  return node !== null && container.contains(node) ? node : null;
}

function bind() {
  if (bound) {
    return;
  }
  bound = true;

  on(el.objects, 'click', function (event) {
    if (views.staleTap(event)) {
      return;
    }
    const card = closestIn(el.objects, event, '.object-card');
    if (card === null) {
      return;
    }
    startObject(card.dataset.objectId);
  });

  on(el.promptChips, 'click', function (event) {
    if (views.staleTap(event)) {
      return;
    }
    const node = closestIn(el.promptChips, event, '.chip');
    if (node === null) {
      return;
    }
    const prompt = currentPrompt();
    if (prompt === null) {
      return;
    }
    const chip = chipById(prompt, node.dataset.chipId);
    if (chip === null) {
      return;
    }

    // Traits are pulled from the chip here, at answer time, so the draft never
    // carries a chip id anywhere near the composer.
    draft.picks[draft.step] = {
      axis: prompt.axis,
      chipId: chip.id,
      phrase: chip.phrase,
      tagValue: tagValue(chip, prompt.axis)
    };

    const all = el.promptChips.querySelectorAll('.chip');
    for (let i = 0; i < all.length; i += 1) {
      const selected = all[i] === node;
      all[i].setAttribute('aria-pressed', selected ? 'true' : 'false');
      all[i].classList.toggle('is-selected', selected);
    }
    setNextReady(true);
  });

  on(el.promptNext, 'click', function (event) {
    if (views.staleTap(event)) {
      return;
    }
    if (el.promptNext.getAttribute('aria-disabled') === 'true') {
      showNudge();
      return;
    }
    if (!onLastStep()) {
      draft.step += 1;
      renderPrompt();
      focusQuestion();
      return;
    }
    runCeremony();
  });

  on(el.promptBack, 'click', function (event) {
    if (views.staleTap(event)) {
      return;
    }
    if (draft.step > 0) {
      draft.step -= 1;
      renderPrompt();
      focusQuestion();
      return;
    }
    views.show('picker', true);
  });

  on(el.ceremonyDone, 'click', function (event) {
    if (views.staleTap(event)) {
      return;
    }
    plantIt();
  });
}
