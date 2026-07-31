/*
  Garden of Life plot grid and plant panel.

  The grid draws what state holds and turns a tap on bare soil into the memory
  flow. The panel is the one thing a planted memory can do: tapping it replays
  its story and puts the watering can in reach. One affordance, no modes, and
  nothing anywhere that can be got wrong.
*/

import { composePlant } from './composer.js';
import { getPlants, findPlant, plantStage, isWilted, waterPlant } from './state.js';

// 12 plots, 3 across. At 390 wide that is a 106px track, comfortably past the
// tap floor, and the grid then grows a whole row at a time so it never goes
// ragged halfway through a line.
const MIN_PLOTS = 12;
const COLUMNS = 3;

// One string, used both as the stage 0 growth word and as the just planted
// note, so a label can never end up saying it twice.
const JUST_PLANTED = 'just planted';
const GROWTH_WORDS = [JUST_PLANTED, 'growing well', 'in full bloom'];
const THIRSTY_WORD = 'ready for a drink';

/* The four answers the watering can gives, and every one of them is good news.
   A player who waters twice in a day has done nothing wrong, and a plant that
   was dry says so by perking up, never by having been neglected. */
const WATER_NOTES = {
  watered: 'A good long drink. It will keep growing from here.',
  advanced: 'Look at that, it is already growing.',
  already: 'It has had a good drink today. Come back tomorrow.',
  recovered: 'It perked up the moment you came back.'
};

const SOIL_MOUND = '<svg viewBox="0 0 120 74" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg">' +
  '<ellipse cx="60" cy="56" rx="44" ry="15" fill="#6f5a44"/>' +
  '<ellipse cx="60" cy="49" rx="31" ry="10" fill="#8a7458"/>' +
  '<circle cx="47" cy="45" r="3.2" fill="#4a3524"/>' +
  '<circle cx="66" cy="43" r="3.2" fill="#4a3524"/>' +
  '<circle cx="58" cy="50" r="3.2" fill="#4a3524"/></svg>';

let views = null;
let storyFor = null;
let onPanelClosed = null;
const el = {};

// Whether water actually went in during this opening of the panel. Read once by
// the close handler, so the gardener can answer the moment rather than the tap.
let wateredThisOpen = false;

// The plant that was just grown, so the garden can point at it once and then
// forget. Cleared by the render that used it, never by a timer.
let freshPlantId = null;
// Which plant the panel is showing, and where the garden was standing when it
// opened, so closing puts the player back where they were.
let openPlantId = '';
let gardenScrollY = 0;
// A story that resolves after the panel has moved on belongs to a plant nobody
// is looking at any more.
let storyToken = 0;

/**
 * Bind the garden and the plant panel. Listeners are delegated, so a re-render
 * never leaves a dead plot behind, and every one of them is guarded against the
 * tail of a double tap.
 * @param {{views: {show: Function, markShown: Function, staleTap: Function},
 *   storyFor?: function(Object): Promise<*>,
 *   onPanelClosed?: function(Object, boolean): void}} options storyFor comes
 *   from memory-flow.js. Without it the panel tells the story from the plant's
 *   own saved phrases, so the panel never depends on a module or a bank.
 *   onPanelClosed is handed the plant that was open and whether water actually
 *   went in, so main.js can decide what the gardener says about it.
 * @returns {void}
 */
export function initGardenView(options) {
  const config = options === null || typeof options !== 'object' ? {} : options;
  views = config.views;
  storyFor = typeof config.storyFor === 'function' ? config.storyFor : null;
  onPanelClosed = typeof config.onPanelClosed === 'function' ? config.onPanelClosed : null;

  el.plots = document.getElementById('plots');
  el.tellMemory = document.getElementById('tell-memory');
  el.panel = document.getElementById('view-plant');
  el.panelTitle = document.getElementById('plant-title');
  el.panelStage = document.getElementById('plant-stage');
  el.panelChips = document.getElementById('plant-chips');
  el.panelStory = document.getElementById('plant-story');
  el.panelTold = document.getElementById('plant-told');
  el.panelFreeText = document.getElementById('plant-freetext');
  el.panelNote = document.getElementById('plant-water-note');
  el.panelMore = document.getElementById('plant-more');
  el.panelWater = document.getElementById('plant-water');
  el.panelClose = document.getElementById('plant-close');

  el.tellMemory.addEventListener('click', function (event) {
    if (views.staleTap(event)) {
      return;
    }
    startMemory();
  });

  el.plots.addEventListener('click', function (event) {
    if (views.staleTap(event)) {
      return;
    }
    const plot = event.target.closest('.plot');
    if (plot === null) {
      return;
    }
    if (plot.dataset.plantId) {
      openPanel(plot.dataset.plantId);
      return;
    }
    startMemory();
  });

  el.panelWater.addEventListener('click', function (event) {
    if (views.staleTap(event)) {
      return;
    }
    waterOpenPlant();
  });

  el.panelClose.addEventListener('click', function (event) {
    if (views.staleTap(event)) {
      return;
    }
    closePanel();
  });

  el.panel.addEventListener('click', function (event) {
    if (views.staleTap(event)) {
      return;
    }
    if (event.target === el.panel) {
      closePanel();
    }
  });

  el.panel.addEventListener('keydown', keepFocusInPanel);
  el.panel.addEventListener('scroll', updateMoreCue);
}

/* The panel can outrun the screen once a plant is grown and the story runs long,
   and the sticky band looks exactly like an ending. So it says when it is not
   one, and stops saying it the moment the reader reaches the bottom. */
function updateMoreCue() {
  const overflows = el.panel.scrollHeight > el.panel.clientHeight + 1;
  const atBottom = el.panel.scrollTop + el.panel.clientHeight >= el.panel.scrollHeight - 4;
  el.panelMore.hidden = !overflows || atBottom;
}

/* Bare soil and the big button do the same thing, so the way in is wherever the
   player happened to be looking. */
function startMemory() {
  views.show('picker', true);
}

/**
 * Mark the plant that was just planted. The next render gives that plot the
 * welcome ring once and then forgets it.
 * @param {string} id
 * @returns {void}
 */
export function markFreshPlant(id) {
  freshPlantId = typeof id === 'string' && id !== '' ? id : null;
}

/**
 * Draw every plot from state. Rebuilt whole rather than patched, because a
 * garden is a dozen small nodes and a diff would be the only fragile part of it.
 * @returns {void}
 */
export function renderGarden() {
  const plants = getPlants();
  // Room for the next one always, rounded up to a full row.
  const grown = Math.ceil((plants.length + 1) / COLUMNS) * COLUMNS;
  const total = grown > MIN_PLOTS ? grown : MIN_PLOTS;

  const nodes = [];
  for (let i = 0; i < total; i += 1) {
    const plant = plants[i];
    nodes.push(plant ? filledPlot(plant, plant.id === freshPlantId) : emptyPlot());
  }
  el.plots.replaceChildren.apply(el.plots, nodes);
  freshPlantId = null;
}

function emptyPlot() {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'plot';
  button.dataset.empty = 'true';
  button.setAttribute('aria-label', 'Empty plot. Tap to plant a memory here.');
  button.innerHTML = SOIL_MOUND;
  return button;
}

/* Built as elements, not a string of markup. Everything on a plant came back out
   of localStorage, and an id concatenated into HTML is a hole that the state
   filter should not have to be the only guard on. The svg is the one exception,
   and it is the composer's own output, built from closed set values. */
function filledPlot(plant, fresh) {
  const built = composeFor(plant);
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'plot plot-filled' + (built.traits.wilted ? ' is-wilted' : '') +
    (fresh ? ' plot-new' : '');
  button.dataset.plantId = plant.id;
  button.dataset.stage = String(built.traits.stage);
  button.dataset.wilted = built.traits.wilted ? 'true' : 'false';
  const growth = growthWord(built);
  button.setAttribute('aria-label', plantName(plant, built) + ', ' + growth +
    (fresh && growth !== JUST_PLANTED ? ', ' + JUST_PLANTED : '') + '. Tap to hear its story.');
  button.innerHTML = built.svg;
  return button;
}

function composeFor(plant) {
  return composePlant({
    objectId: plant.objectId,
    tags: plant.tags,
    stage: plantStage(plant),
    wilted: isWilted(plant),
    // Only a real seed is passed on. A missing one is left to the composer,
    // which derives a stable seed from the memory itself, so a plant saved
    // without one still regrows the same way every time.
    seed: Number.isFinite(plant.seed) && plant.seed > 0 ? plant.seed : undefined
  });
}

/**
 * What the gardener calls this plant. It comes from the composer, so the name
 * she says out loud is the same name the drawing answers to.
 * @param {Object} plant
 * @returns {string} Empty when there is no plant to name.
 */
export function speciesLabelFor(plant) {
  if (plant === null || typeof plant !== 'object') {
    return '';
  }
  return composeFor(plant).traits.speciesLabel;
}

function growthWord(built) {
  if (built.traits.wilted) {
    return THIRSTY_WORD;
  }
  return GROWTH_WORDS[built.traits.stage] ? GROWTH_WORDS[built.traits.stage] : GROWTH_WORDS[0];
}

function capitalize(value) {
  return value === '' ? '' : value.charAt(0).toUpperCase() + value.slice(1);
}

function phraseOf(plant, key) {
  const phrases = plant.phrases !== null && typeof plant.phrases === 'object' ? plant.phrases : {};
  return typeof phrases[key] === 'string' ? phrases[key].trim() : '';
}

/* The object phrase was saved with the memory, so the name a plant answers to is
   the player's own words. The species label is the fallback for anything planted
   before there were phrases to save. */
function plantName(plant, built) {
  const phrase = phraseOf(plant, 'object');
  return capitalize(phrase !== '' ? phrase : built.traits.speciesLabel);
}

/* ---- the plant panel ---------------------------------------------------- */

function openPanel(plantId) {
  const plant = findPlant(plantId);
  if (plant === null) {
    return;
  }
  openPlantId = plant.id;
  gardenScrollY = window.scrollY;
  wateredThisOpen = false;

  const built = renderPanelPlant(plant);
  el.panelTitle.textContent = plantName(plant, built);
  renderPanelChips(plant);
  el.panelNote.textContent = '';

  const told = typeof plant.freeText === 'string' ? plant.freeText.trim() : '';
  el.panelFreeText.textContent = told;
  el.panelTold.hidden = told === '';

  el.panel.hidden = false;
  el.panel.scrollTop = 0;
  views.markShown('plant');
  el.panelTitle.focus();
  updateMoreCue();

  showStory(plant);
}

function renderPanelPlant(plant) {
  const built = composeFor(plant);
  el.panelStage.innerHTML = built.svg;
  return built;
}

function renderPanelChips(plant) {
  const keys = ['who', 'where', 'feeling'];
  const nodes = [];
  for (let i = 0; i < keys.length; i += 1) {
    const phrase = phraseOf(plant, keys[i]);
    if (phrase === '') {
      continue;
    }
    const chip = document.createElement('span');
    chip.className = 'chip chip-static';
    chip.textContent = capitalize(phrase);
    nodes.push(chip);
  }
  el.panelChips.replaceChildren.apply(el.panelChips, nodes);
}

/* The plant's own words go up first, so there is never an empty line waiting on
   a promise, and the told story replaces them when it arrives. */
function showStory(plant) {
  storyToken += 1;
  const token = storyToken;
  el.panelStory.textContent = savedStory(plant);
  updateMoreCue();
  if (storyFor === null) {
    return;
  }
  Promise.resolve(storyFor(plant)).then(function (line) {
    if (token !== storyToken || openPlantId !== plant.id) {
      return;
    }
    const text = typeof line === 'string'
      ? line
      : (line !== null && typeof line === 'object' && typeof line.text === 'string' ? line.text : '');
    if (text !== '') {
      el.panelStory.textContent = text;
    }
    // A longer line than the one it replaced can push the last chip under the
    // band, so the cue is recomputed on the height the story actually took.
    updateMoreCue();
  }).catch(function () {
    // The sentence built from the saved phrases is already on screen.
  });
}

// The story a plant can always tell, assembled from what was stored with it the
// day it was planted. No bank, no module and no network involved.
function savedStory(plant) {
  const opener = [phraseOf(plant, 'object'), phraseOf(plant, 'who'), phraseOf(plant, 'where')]
    .filter(function (part) { return part !== ''; })
    .join(', ');
  const feeling = phraseOf(plant, 'feeling');
  let line = opener === '' ? '' : capitalize(opener) + '.';
  if (feeling !== '') {
    line = line === '' ? capitalize(feeling) + '.' : line + ' ' + capitalize(feeling) + '.';
  }
  return line;
}

function waterOpenPlant() {
  const plant = findPlant(openPlantId);
  if (plant === null) {
    return;
  }
  const result = waterPlant(plant.id);
  if (result.alreadyToday) {
    el.panelNote.textContent = WATER_NOTES.already;
    updateMoreCue();
    return;
  }
  // Only a tap that actually put water in counts. A second tap on the same day
  // is answered kindly here and is not a watering for the gardener to remark on.
  wateredThisOpen = true;
  el.panelNote.textContent = result.recovered
    ? WATER_NOTES.recovered
    : (result.advanced ? WATER_NOTES.advanced : WATER_NOTES.watered);
  // Grown in place, so the change happens where the player is looking.
  renderPanelPlant(plant);
  // The note itself takes a line of the band, which is enough to put the last
  // chip under it.
  updateMoreCue();
}

function closePanel() {
  const returnTo = openPlantId;
  // Read before the close clears it, and handed over after the garden is back
  // on screen, so her line lands on a garden the player is already looking at.
  const closed = findPlant(returnTo);
  const didWater = wateredThisOpen;
  el.panel.hidden = true;
  el.panelMore.hidden = true;
  wateredThisOpen = false;
  openPlantId = '';
  views.markShown('garden');
  // Watering can have moved a stage while the panel was open, so the garden is
  // redrawn before the player looks at it again.
  renderGarden();
  window.scrollTo(0, gardenScrollY);
  const plot = plotNodeFor(returnTo);
  if (plot !== null) {
    plot.focus();
  }
  if (onPanelClosed !== null && closed !== null) {
    onPanelClosed(closed, didWater);
  }
}

// The render above replaced every node, so the plot to hand focus back to is
// found by id rather than held as a reference that is now detached.
function plotNodeFor(id) {
  if (id === '') {
    return null;
  }
  const nodes = el.plots.children;
  for (let i = 0; i < nodes.length; i += 1) {
    if (nodes[i].dataset && nodes[i].dataset.plantId === id) {
      return nodes[i];
    }
  }
  return null;
}

function keepFocusInPanel(event) {
  if (event.key === 'Escape') {
    event.preventDefault();
    closePanel();
    return;
  }
  if (event.key !== 'Tab') {
    return;
  }
  const items = el.panel.querySelectorAll('button, a[href], [tabindex]:not([tabindex="-1"])');
  if (items.length === 0) {
    event.preventDefault();
    return;
  }
  const first = items[0];
  const last = items[items.length - 1];
  const active = document.activeElement;
  if (event.shiftKey) {
    if (active === first || !el.panel.contains(active)) {
      event.preventDefault();
      last.focus();
    }
    return;
  }
  if (active === last || !el.panel.contains(active)) {
    event.preventDefault();
    first.focus();
  }
}
