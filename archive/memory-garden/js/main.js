/*
  Memory Garden. View state machine, storage, and every wire between a tap and a
  plant. Tap only, no timers, nothing that can be failed.
*/

import { registerBank, aiGenerate, hashString } from '../../../shared/ai.js';
import { loadState, saveState } from '../../../shared/storage.js';
import { OBJECTS, PROMPTS } from './data.js';
import { composePlant } from './composer.js';

const GAME = 'memory-garden';
const NS = 'memory-garden';
const STATE_VERSION = 1;
const BANK_URL = '/archive/memory-garden/content/garden-lines.json';
const MIN_PLOTS = 6;
const FREE_TEXT_STEP = 'feeling';

// A tap that lands inside a section which only just appeared is almost always the
// second half of a double tap aimed at the screen before it. Swallowing those for
// a third of a second is the difference between a shaky finger and a memory the
// player never chose.
const STALE_TAP_MS = 350;

// Only ids this game could have written are allowed back out of storage.
const PLANT_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

const SOIL_MOUND = '<svg viewBox="0 0 120 74" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg">' +
  '<ellipse cx="60" cy="56" rx="44" ry="15" fill="#6f5a44"/>' +
  '<ellipse cx="60" cy="49" rx="31" ry="10" fill="#8a7458"/>' +
  '<circle cx="47" cy="45" r="3.2" fill="#4a3524"/>' +
  '<circle cx="66" cy="43" r="3.2" fill="#4a3524"/>' +
  '<circle cx="58" cy="50" r="3.2" fill="#4a3524"/></svg>';

const VIEWS = {
  garden: { section: 'view-garden', heading: 'garden-heading' },
  picker: { section: 'view-picker', heading: 'picker-heading' },
  prompt: { section: 'view-prompt', heading: 'prompt-heading' },
  ceremony: { section: 'view-ceremony', heading: 'ceremony-heading' }
};

let garden = emptyGarden();
const draft = { objectId: null, answers: {}, step: 0 };
let lastPlot = null;
// The plant that was just grown, so the garden can point at it once and then
// forget. Cleared by the render that used it, never by a timer.
let freshPlantId = null;
// One grow at a time. growPlant crosses an await, and without this a second
// activation in that window would write a second plant.
let growing = false;
// Where the garden was standing when the story overlay opened, so closing it puts
// the player back where they were instead of at some scroll position they never chose.
let gardenScrollY = 0;
const el = {};

/* ---- per load freshness -------------------------------------------------
   shared/ai.js rotates its picks off a module counter that resets with the page,
   so without a salt the first line of every event is byte identical on every
   fresh load. One salt per load, one counter per event, and the demo stops
   greeting three reloads with the same sentence. Captions are deliberately left
   out: a saved story has to read the same way every time it is opened. */

const LOAD_SALT = String(Date.now()) + '.' + String(Math.random());
const freshCalls = new Map();

function freshSeed(event) {
  const turn = (freshCalls.get(event) || 0) + 1;
  freshCalls.set(event, turn);
  return hashString(LOAD_SALT + ':' + event + ':' + turn);
}

function generateFresh(event, context) {
  const merged = context === undefined || context === null ? {} : context;
  merged.seed = freshSeed(event);
  return aiGenerate({ game: GAME, event: event, context: merged });
}

/* ---- state -------------------------------------------------------------- */

function emptyGarden() {
  return { version: STATE_VERSION, plants: [] };
}

function isPlant(value) {
  return value !== null &&
    typeof value === 'object' &&
    typeof value.id === 'string' &&
    PLANT_ID_PATTERN.test(value.id) &&
    typeof value.objectId === 'string' &&
    value.answers !== null &&
    typeof value.answers === 'object';
}

function readGarden() {
  const raw = loadState(NS, null);
  if (raw === null || typeof raw !== 'object' || !Array.isArray(raw.plants)) {
    return emptyGarden();
  }
  return { version: STATE_VERSION, plants: raw.plants.filter(isPlant) };
}

/* ---- lookups ------------------------------------------------------------ */

function objectById(id) {
  for (let i = 0; i < OBJECTS.length; i += 1) {
    if (OBJECTS[i].id === id) {
      return OBJECTS[i];
    }
  }
  return OBJECTS[0];
}

function promptById(id) {
  for (let i = 0; i < PROMPTS.length; i += 1) {
    if (PROMPTS[i].id === id) {
      return PROMPTS[i];
    }
  }
  return PROMPTS[0];
}

function optionById(promptId, optionId) {
  const options = promptById(promptId).options;
  for (let i = 0; i < options.length; i += 1) {
    if (options[i].id === optionId) {
      return options[i];
    }
  }
  return null;
}

function labelFor(promptId, optionId) {
  const option = optionById(promptId, optionId);
  return option === null ? '' : option.label;
}

// Sentence form, never the chip label. data.js owns every phrase, this is only
// the lookup, so no caller has to guess at an article.
function phraseFor(promptId, optionId) {
  const option = optionById(promptId, optionId);
  return option === null ? '' : option.phrase;
}

function captionContext(plant) {
  return {
    object: objectById(plant.objectId).phrase,
    who: phraseFor('who', plant.answers.who),
    where: phraseFor('where', plant.answers.where),
    feeling: phraseFor('feeling', plant.answers.feeling),
    seed: plant.seed
  };
}

/* ---- views -------------------------------------------------------------- */

let currentView = '';
let viewShownAt = 0;

function markViewShown(name) {
  if (name !== currentView) {
    currentView = name;
    viewShownAt = Date.now();
  }
}

/* True when this tap arrived too soon after a whole section changed under the
   finger. Stepping between questions is not a section change, so answering fast
   is never punished. A keyboard activation reports detail 0 and always goes
   through: a key press cannot be the tail of a double tap. */
function staleTap(event) {
  if (event && event.detail === 0) {
    return false;
  }
  return Date.now() - viewShownAt < STALE_TAP_MS;
}

function showView(name, moveFocus) {
  const keys = Object.keys(VIEWS);
  for (let i = 0; i < keys.length; i += 1) {
    const view = VIEWS[keys[i]];
    document.getElementById(view.section).hidden = keys[i] !== name;
  }
  markViewShown(name);
  if (moveFocus) {
    document.getElementById(VIEWS[name].heading).focus();
  }
}

/* ---- garden ------------------------------------------------------------- */

/* Built as elements rather than a string of HTML. Everything here comes back out
   of localStorage, and a plant id built into markup by concatenation is a hole
   the isPlant filter should not have to be the only guard on. */

function plotButton(plant, fresh) {
  const built = composePlant({ objectId: plant.objectId, answers: plant.answers });
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'plot plot-filled' + (fresh ? ' plot-new' : '');
  button.dataset.plantId = plant.id;
  button.setAttribute('aria-label', objectById(plant.objectId).name + ' memory' +
    (fresh ? ', just planted' : '') + '. Tap to open the story.');
  button.innerHTML = built.svg;
  return button;
}

function emptyPlotButton() {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'plot';
  button.dataset.empty = 'true';
  button.setAttribute('aria-label', 'Empty plot. Tap to plant a memory here.');
  button.innerHTML = SOIL_MOUND;
  return button;
}

function renderPlots() {
  const plants = garden.plants;
  const total = Math.max(MIN_PLOTS, Math.ceil((plants.length + 1) / 3) * 3);
  const nodes = [];

  for (let i = 0; i < total; i += 1) {
    const plant = plants[i];
    nodes.push(plant ? plotButton(plant, plant.id === freshPlantId) : emptyPlotButton());
  }
  el.plots.replaceChildren.apply(el.plots, nodes);
  freshPlantId = null;
}

async function renderWelcome() {
  const count = garden.plants.length;
  // The count arrives already worded, so no template has to carry a plural noun
  // that reads "1 memories" on the visit every player makes.
  const line = await generateFresh(count === 0 ? 'welcome_first' : 'welcome_back', {
    count: count === 1 ? 'one memory' : count + ' memories'
  });
  el.welcomeLine.textContent = line.text;
}

function renderGarden() {
  renderPlots();
  renderWelcome();
}

/* ---- picker ------------------------------------------------------------- */

function renderObjects() {
  const nodes = [];
  for (let i = 0; i < OBJECTS.length; i += 1) {
    const item = OBJECTS[i];
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'object-card';
    card.dataset.objectId = item.id;
    card.innerHTML = item.art;

    /* The written blurb in data.js stays off the card on purpose. Measured at
       360px it pushes the 2 column grid past the viewport, since a grid track
       cannot shrink under its longest word, and it drops the card to two or
       three words a line at the 28px floor. That is the opposite of calm on the
       one screen a player uses most, so the copy waits for a layout with room
       for it rather than getting squeezed into one that has none. */
    const name = document.createElement('span');
    name.textContent = item.name;
    card.appendChild(name);

    nodes.push(card);
  }
  el.objects.replaceChildren.apply(el.objects, nodes);
}

/* ---- prompts ------------------------------------------------------------ */

function setNextReady(ready) {
  el.promptNext.setAttribute('aria-disabled', ready ? 'false' : 'true');
  if (ready) {
    clearNudge();
  }
}

function clearNudge() {
  el.promptNudge.textContent = '';
}

// The not yet button still answers a tap, and it answers kindly. No shake, no
// red, no telling anyone off for pressing the biggest thing on the screen.
function showNudge() {
  el.promptNudge.textContent = draft.step === PROMPTS.length - 1
    ? 'Pick one of the answers first, then we grow it.'
    : 'Pick one of the answers first, then we carry on.';
}

/* The question itself is generated, so the same three steps never read exactly
   the same way twice. The written question in data.js is the floor underneath.
   The token drops a late answer if the player already moved on. */
let headingToken = 0;

async function renderPromptHeading(prompt) {
  headingToken += 1;
  const token = headingToken;
  el.promptHeading.textContent = prompt.question;
  const line = await generateFresh('prompt_' + prompt.id, {});
  if (token === headingToken && line.meta.source === 'bank' && line.text !== '') {
    el.promptHeading.textContent = line.text;
  }
}

function renderPrompt() {
  const prompt = PROMPTS[draft.step];
  const chosen = draft.answers[prompt.id];

  el.promptStep.textContent = 'Question ' + (draft.step + 1) + ' of ' + PROMPTS.length;
  renderPromptHeading(prompt);
  el.freeTextField.hidden = prompt.id !== FREE_TEXT_STEP;
  clearNudge();

  const nodes = [];
  for (let i = 0; i < prompt.options.length; i += 1) {
    const option = prompt.options[i];
    const picked = option.id === chosen;
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip' + (picked ? ' is-selected' : '');
    chip.dataset.optionId = option.id;
    chip.setAttribute('aria-pressed', picked ? 'true' : 'false');
    chip.textContent = option.label;
    nodes.push(chip);
  }
  el.promptChips.replaceChildren.apply(el.promptChips, nodes);

  el.promptNext.textContent = draft.step === PROMPTS.length - 1 ? 'Grow this memory' : 'Next';
  setNextReady(Boolean(chosen));
}

/* ---- growing ------------------------------------------------------------ */

async function growPlant() {
  if (growing) {
    return;
  }
  growing = true;
  let grownPhrase = '';
  try {
    const built = composePlant({ objectId: draft.objectId, answers: draft.answers });
    const plant = {
      // Time, memory and a throw of the dice. Two identical memories planted in
      // the same millisecond still cannot collide on an id.
      id: 'mg-' + Date.now().toString(36) + '-' + built.seed.toString(36) + '-' +
        Math.floor(Math.random() * 1679616).toString(36),
      createdAt: new Date().toISOString(),
      objectId: draft.objectId,
      answers: {
        who: draft.answers.who,
        where: draft.answers.where,
        feeling: draft.answers.feeling
      },
      freeText: el.freeText.value.trim(),
      seed: built.seed,
      caption: ''
    };

    const caption = await aiGenerate({ game: GAME, event: 'caption', context: captionContext(plant) });
    plant.caption = caption.text;

    garden.plants.push(plant);
    saveState(NS, garden);
    freshPlantId = plant.id;

    el.ceremonyStage.className = 'stage stage-grow';
    el.ceremonyStage.innerHTML = built.svg;
    grownPhrase = objectById(plant.objectId).phrase;
    showView('ceremony', true);
  } finally {
    growing = false;
  }

  const line = await generateFresh('ceremony_grow', { object: grownPhrase });
  el.ceremonyLine.textContent = line.text;
}

/* ---- replay ------------------------------------------------------------- */

function findPlant(id) {
  for (let i = 0; i < garden.plants.length; i += 1) {
    if (garden.plants[i].id === id) {
      return garden.plants[i];
    }
  }
  return null;
}

// The overlay is taller than a phone whenever the caption runs long, so it says
// so out loud instead of leaving the ending under a band that looks like the end.
function updateMoreCue() {
  const overflows = el.replay.scrollHeight > el.replay.clientHeight + 1;
  const atBottom = el.replay.scrollTop + el.replay.clientHeight >= el.replay.scrollHeight - 4;
  el.replayMore.hidden = !overflows || atBottom;
}

async function openReplay(plantId, source) {
  const plant = findPlant(plantId);
  if (plant === null) {
    return;
  }
  lastPlot = source || null;
  gardenScrollY = window.scrollY;

  const built = composePlant({ objectId: plant.objectId, answers: plant.answers });
  el.replayTitle.textContent = objectById(plant.objectId).name;
  el.replayPlant.innerHTML = built.svg;

  const chips = [
    labelFor('who', plant.answers.who),
    labelFor('where', plant.answers.where),
    labelFor('feeling', plant.answers.feeling)
  ];
  const nodes = [];
  for (let i = 0; i < chips.length; i += 1) {
    if (chips[i] !== '') {
      const chip = document.createElement('span');
      chip.className = 'chip chip-static';
      chip.textContent = chips[i];
      nodes.push(chip);
    }
  }
  el.replayAnswers.replaceChildren.apply(el.replayAnswers, nodes);
  el.replayCaption.textContent = plant.caption;

  const told = typeof plant.freeText === 'string' ? plant.freeText.trim() : '';
  el.replayFreeText.textContent = told;
  el.replayTold.hidden = told === '';

  el.replayLine.textContent = '';
  el.replay.hidden = false;
  el.replay.scrollTop = 0;
  markViewShown('replay');
  el.replayTitle.focus();
  updateMoreCue();

  const line = await generateFresh('replay_open', {});
  el.replayLine.textContent = line.text;
  updateMoreCue();
}

function closeReplay() {
  el.replay.hidden = true;
  el.replayMore.hidden = true;
  markViewShown('garden');
  window.scrollTo(0, gardenScrollY);
  if (lastPlot && document.contains(lastPlot)) {
    lastPlot.focus();
  }
  lastPlot = null;
}

function keepFocusInReplay(event) {
  if (event.key === 'Escape') {
    event.preventDefault();
    closeReplay();
    return;
  }
  if (event.key !== 'Tab') {
    return;
  }
  const items = el.replay.querySelectorAll('button, a[href], [tabindex]:not([tabindex="-1"])');
  if (items.length === 0) {
    event.preventDefault();
    return;
  }
  const first = items[0];
  const last = items[items.length - 1];
  const active = document.activeElement;
  if (event.shiftKey) {
    if (active === first || !el.replay.contains(active)) {
      event.preventDefault();
      last.focus();
    }
    return;
  }
  if (active === last || !el.replay.contains(active)) {
    event.preventDefault();
    first.focus();
  }
}

/* ---- flow --------------------------------------------------------------- */

function startFlow() {
  draft.objectId = null;
  draft.answers = {};
  draft.step = 0;
  el.freeText.value = '';
  showView('picker', true);
}

function backToGarden() {
  renderGarden();
  showView('garden', true);
}

function bind() {
  el.startGrow.addEventListener('click', function (event) {
    if (staleTap(event)) {
      return;
    }
    startFlow();
  });

  el.plots.addEventListener('click', function (event) {
    if (staleTap(event)) {
      return;
    }
    const plot = event.target.closest('.plot');
    if (plot === null) {
      return;
    }
    if (plot.dataset.plantId) {
      openReplay(plot.dataset.plantId, plot);
      return;
    }
    startFlow();
  });

  el.objects.addEventListener('click', function (event) {
    if (staleTap(event)) {
      return;
    }
    const card = event.target.closest('.object-card');
    if (card === null) {
      return;
    }
    draft.objectId = card.dataset.objectId;
    draft.answers = {};
    draft.step = 0;
    // A note typed for one object must never follow the player to another.
    el.freeText.value = '';
    renderPrompt();
    showView('prompt', true);
  });

  el.promptChips.addEventListener('click', function (event) {
    if (staleTap(event)) {
      return;
    }
    const chip = event.target.closest('.chip');
    if (chip === null) {
      return;
    }
    const prompt = PROMPTS[draft.step];
    draft.answers[prompt.id] = chip.dataset.optionId;
    const all = el.promptChips.querySelectorAll('.chip');
    for (let i = 0; i < all.length; i += 1) {
      const picked = all[i] === chip;
      all[i].setAttribute('aria-pressed', picked ? 'true' : 'false');
      all[i].classList.toggle('is-selected', picked);
    }
    setNextReady(true);
  });

  el.promptNext.addEventListener('click', function (event) {
    if (staleTap(event)) {
      return;
    }
    if (el.promptNext.getAttribute('aria-disabled') === 'true') {
      showNudge();
      return;
    }
    if (draft.step < PROMPTS.length - 1) {
      draft.step += 1;
      renderPrompt();
      showView('prompt', true);
      return;
    }
    growPlant();
  });

  el.promptBack.addEventListener('click', function (event) {
    if (staleTap(event)) {
      return;
    }
    if (draft.step > 0) {
      draft.step -= 1;
      renderPrompt();
      showView('prompt', true);
      return;
    }
    showView('picker', true);
  });

  el.ceremonyDone.addEventListener('click', function (event) {
    if (staleTap(event)) {
      return;
    }
    backToGarden();
  });

  el.replayClose.addEventListener('click', function (event) {
    if (staleTap(event)) {
      return;
    }
    closeReplay();
  });

  el.replay.addEventListener('click', function (event) {
    if (staleTap(event)) {
      return;
    }
    if (event.target === el.replay) {
      closeReplay();
    }
  });
  el.replay.addEventListener('keydown', keepFocusInReplay);
  el.replay.addEventListener('scroll', updateMoreCue);

  const backButtons = document.querySelectorAll('[data-back="garden"]');
  for (let i = 0; i < backButtons.length; i += 1) {
    backButtons[i].addEventListener('click', function (event) {
      if (staleTap(event)) {
        return;
      }
      backToGarden();
    });
  }
}

/* ---- boot --------------------------------------------------------------- */

function cacheElements() {
  el.plots = document.getElementById('plots');
  el.welcomeLine = document.getElementById('welcome-line');
  el.startGrow = document.getElementById('start-grow');
  el.objects = document.getElementById('objects');
  el.promptStep = document.getElementById('prompt-step');
  el.promptHeading = document.getElementById('prompt-heading');
  el.promptChips = document.getElementById('prompt-chips');
  el.promptNext = document.getElementById('prompt-next');
  el.promptNudge = document.getElementById('prompt-nudge');
  el.promptBack = document.getElementById('prompt-back');
  el.freeTextField = document.getElementById('freetext-field');
  el.freeText = document.getElementById('freetext');
  el.ceremonyStage = document.getElementById('ceremony-stage');
  el.ceremonyLine = document.getElementById('ceremony-line');
  el.ceremonyDone = document.getElementById('ceremony-done');
  el.replay = document.getElementById('view-replay');
  el.replayTitle = document.getElementById('replay-title');
  el.replayPlant = document.getElementById('replay-plant');
  el.replayAnswers = document.getElementById('replay-answers');
  el.replayCaption = document.getElementById('replay-caption');
  el.replayTold = document.getElementById('replay-told');
  el.replayFreeText = document.getElementById('replay-freetext');
  el.replayLine = document.getElementById('replay-line');
  el.replayMore = document.getElementById('replay-more');
  el.replayClose = document.getElementById('replay-close');
}

async function loadBank() {
  try {
    const response = await fetch(BANK_URL, { cache: 'no-store' });
    if (!response.ok) {
      return;
    }
    registerBank(GAME, await response.json());
  } catch (err) {
    // A missing bank is not fatal: shared/ai.js answers with a neutral line.
  }
}

async function start() {
  cacheElements();
  bind();
  await loadBank();
  garden = readGarden();
  renderObjects();
  renderGarden();
  showView('garden', false);
}

start();
