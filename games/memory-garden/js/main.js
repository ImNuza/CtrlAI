/*
  Memory Garden. View state machine, storage, and every wire between a tap and a
  plant. Tap only, no timers, nothing that can be failed.
*/

import { registerBank, aiGenerate } from '../../../shared/ai.js';
import { loadState, saveState } from '../../../shared/storage.js';
import { OBJECTS, PROMPTS } from './data.js';
import { composePlant } from './composer.js';

const GAME = 'memory-garden';
const NS = 'memory-garden';
const STATE_VERSION = 1;
const BANK_URL = '/games/memory-garden/content/garden-lines.json';
const MIN_PLOTS = 6;

// Where answers become phrases so a caption reads like a sentence, not a label.
const WHERE_PHRASES = {
  kampung: 'in the old kampung',
  'first-flat': 'in our first flat',
  kopitiam: 'at the kopitiam downstairs',
  market: 'at the wet market',
  seaside: 'by the seaside'
};

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
const el = {};

/* ---- state -------------------------------------------------------------- */

function emptyGarden() {
  return { version: STATE_VERSION, plants: [] };
}

function isPlant(value) {
  return value !== null &&
    typeof value === 'object' &&
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

function labelFor(promptId, optionId) {
  const options = promptById(promptId).options;
  for (let i = 0; i < options.length; i += 1) {
    if (options[i].id === optionId) {
      return options[i].label;
    }
  }
  return '';
}

function captionContext(plant) {
  return {
    object: 'the ' + objectById(plant.objectId).name.toLowerCase(),
    who: labelFor('who', plant.answers.who).toLowerCase(),
    where: WHERE_PHRASES[plant.answers.where] || '',
    feeling: labelFor('feeling', plant.answers.feeling).toLowerCase(),
    seed: plant.seed
  };
}

/* ---- views -------------------------------------------------------------- */

function showView(name, moveFocus) {
  const keys = Object.keys(VIEWS);
  for (let i = 0; i < keys.length; i += 1) {
    const view = VIEWS[keys[i]];
    document.getElementById(view.section).hidden = keys[i] !== name;
  }
  if (moveFocus) {
    document.getElementById(VIEWS[name].heading).focus();
  }
}

/* ---- garden ------------------------------------------------------------- */

function renderPlots() {
  const plants = garden.plants;
  const total = Math.max(MIN_PLOTS, Math.ceil((plants.length + 1) / 3) * 3);
  const parts = [];

  for (let i = 0; i < total; i += 1) {
    const plant = plants[i];
    if (plant) {
      const built = composePlant({ objectId: plant.objectId, answers: plant.answers });
      parts.push('<button type="button" class="plot plot-filled" data-plant-id="' + plant.id +
        '" aria-label="' + objectById(plant.objectId).name + ' memory. Tap to open the story.">' +
        built.svg + '</button>');
    } else {
      parts.push('<button type="button" class="plot" data-empty="true"' +
        ' aria-label="Empty plot. Tap to plant a memory here.">' + SOIL_MOUND + '</button>');
    }
  }
  el.plots.innerHTML = parts.join('');
}

async function renderWelcome() {
  const count = garden.plants.length;
  const line = await aiGenerate({
    game: GAME,
    event: count === 0 ? 'welcome_first' : 'welcome_back',
    context: { count: count }
  });
  el.welcomeLine.textContent = line.text;
}

function renderGarden() {
  renderPlots();
  renderWelcome();
}

/* ---- picker ------------------------------------------------------------- */

function renderObjects() {
  const parts = [];
  for (let i = 0; i < OBJECTS.length; i += 1) {
    const item = OBJECTS[i];
    parts.push('<button type="button" class="object-card" data-object-id="' + item.id + '">' +
      item.art + '<span>' + item.name + '</span></button>');
  }
  el.objects.innerHTML = parts.join('');
}

/* ---- prompts ------------------------------------------------------------ */

function setNextReady(ready) {
  el.promptNext.setAttribute('aria-disabled', ready ? 'false' : 'true');
}

function renderPrompt() {
  const prompt = PROMPTS[draft.step];
  const chosen = draft.answers[prompt.id];

  el.promptStep.textContent = 'Question ' + (draft.step + 1) + ' of ' + PROMPTS.length;
  el.promptHeading.textContent = prompt.question;

  const parts = [];
  for (let i = 0; i < prompt.options.length; i += 1) {
    const option = prompt.options[i];
    const picked = option.id === chosen;
    parts.push('<button type="button" class="chip' + (picked ? ' is-selected' : '') +
      '" data-option-id="' + option.id + '" aria-pressed="' + (picked ? 'true' : 'false') + '">' +
      option.label + '</button>');
  }
  el.promptChips.innerHTML = parts.join('');

  el.promptNext.textContent = draft.step === PROMPTS.length - 1 ? 'Grow this memory' : 'Next';
  setNextReady(Boolean(chosen));
}

/* ---- growing ------------------------------------------------------------ */

async function growPlant() {
  const built = composePlant({ objectId: draft.objectId, answers: draft.answers });
  const plant = {
    id: 'mg-' + Date.now().toString(36) + '-' + built.seed.toString(36),
    createdAt: new Date().toISOString(),
    objectId: draft.objectId,
    answers: {
      who: draft.answers.who,
      where: draft.answers.where,
      feeling: draft.answers.feeling
    },
    freeText: '',
    seed: built.seed,
    caption: ''
  };

  const caption = await aiGenerate({ game: GAME, event: 'caption', context: captionContext(plant) });
  plant.caption = caption.text;

  garden.plants.push(plant);
  saveState(NS, garden);

  el.ceremonyStage.className = 'stage stage-grow';
  el.ceremonyStage.innerHTML = built.svg;
  showView('ceremony', true);

  const line = await aiGenerate({
    game: GAME,
    event: 'ceremony_grow',
    context: { object: objectById(plant.objectId).name.toLowerCase() }
  });
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

async function openReplay(plantId, source) {
  const plant = findPlant(plantId);
  if (plant === null) {
    return;
  }
  lastPlot = source || null;

  const built = composePlant({ objectId: plant.objectId, answers: plant.answers });
  el.replayTitle.textContent = objectById(plant.objectId).name;
  el.replayPlant.innerHTML = built.svg;

  const chips = [
    labelFor('who', plant.answers.who),
    labelFor('where', plant.answers.where),
    labelFor('feeling', plant.answers.feeling)
  ];
  const parts = [];
  for (let i = 0; i < chips.length; i += 1) {
    if (chips[i] !== '') {
      parts.push('<span class="chip chip-static">' + chips[i] + '</span>');
    }
  }
  el.replayAnswers.innerHTML = parts.join('');
  el.replayCaption.textContent = plant.caption;
  el.replayLine.textContent = '';
  el.replay.hidden = false;
  el.replayTitle.focus();

  const line = await aiGenerate({ game: GAME, event: 'replay_open', context: {} });
  el.replayLine.textContent = line.text;
}

function closeReplay() {
  el.replay.hidden = true;
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
  showView('picker', true);
}

function backToGarden() {
  renderGarden();
  showView('garden', true);
}

function bind() {
  el.startGrow.addEventListener('click', startFlow);

  el.plots.addEventListener('click', function (event) {
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
    const card = event.target.closest('.object-card');
    if (card === null) {
      return;
    }
    draft.objectId = card.dataset.objectId;
    draft.answers = {};
    draft.step = 0;
    renderPrompt();
    showView('prompt', true);
  });

  el.promptChips.addEventListener('click', function (event) {
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

  el.promptNext.addEventListener('click', function () {
    if (el.promptNext.getAttribute('aria-disabled') === 'true') {
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

  el.promptBack.addEventListener('click', function () {
    if (draft.step > 0) {
      draft.step -= 1;
      renderPrompt();
      showView('prompt', true);
      return;
    }
    showView('picker', true);
  });

  el.ceremonyDone.addEventListener('click', backToGarden);
  el.replayClose.addEventListener('click', closeReplay);

  el.replay.addEventListener('click', function (event) {
    if (event.target === el.replay) {
      closeReplay();
    }
  });
  el.replay.addEventListener('keydown', keepFocusInReplay);

  const backButtons = document.querySelectorAll('[data-back="garden"]');
  for (let i = 0; i < backButtons.length; i += 1) {
    backButtons[i].addEventListener('click', backToGarden);
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
  el.promptBack = document.getElementById('prompt-back');
  el.ceremonyStage = document.getElementById('ceremony-stage');
  el.ceremonyLine = document.getElementById('ceremony-line');
  el.ceremonyDone = document.getElementById('ceremony-done');
  el.replay = document.getElementById('view-replay');
  el.replayTitle = document.getElementById('replay-title');
  el.replayPlant = document.getElementById('replay-plant');
  el.replayAnswers = document.getElementById('replay-answers');
  el.replayCaption = document.getElementById('replay-caption');
  el.replayLine = document.getElementById('replay-line');
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
