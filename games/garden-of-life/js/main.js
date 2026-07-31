/*
  Garden of Life boot and glue. It fetches the content banks, brings state up,
  and owns which section is on screen. No game rules live in this file.

  The three banks are written by other workflows and may simply not be there
  yet. Every one of those fetches is allowed to come back empty handed: a bank
  that has not landed leaves a calm screen, never a broken one.
*/

import { registerBank } from '../../../shared/ai.js';
import { loadTraits } from './composer.js';
import { initState, recordVisit } from './state.js';
import { initGardenView, renderGarden, markFreshPlant } from './garden-view.js';
import { initMemoryFlow, storyFor } from './memory-flow.js';

const GAME = 'garden-of-life';

const CONTENT_URLS = {
  prompts: '/games/garden-of-life/content/memory-prompts.json',
  gardenerLines: '/games/garden-of-life/content/gardener-lines.json',
  traits: '/games/garden-of-life/content/plant-traits.json'
};

// A tap that lands inside a section which only just appeared is almost always
// the second half of a double tap aimed at the screen before it. Swallowing
// those for a third of a second is the difference between a shaky finger and a
// memory nobody chose.
const STALE_TAP_MS = 350;

const VIEWS = {
  garden: { section: 'view-garden', heading: 'garden-heading' },
  picker: { section: 'view-picker', heading: 'picker-heading' },
  prompt: { section: 'view-prompt', heading: 'prompt-heading' },
  ceremony: { section: 'view-ceremony', heading: 'ceremony-heading' }
};

const content = { prompts: null, gardenerLines: null, traits: null };

// Kept for M3. The gardener greets differently depending on how the player
// arrived, and recordVisit can only answer that once per load, before it
// updates the books.
let visit = null;

/* ---- views --------------------------------------------------------------
   The handle every other module gets instead of reaching for sections itself.
   This shape is binding for memory-flow.js and gardener.js:

     show(name, moveFocus)  switch the visible section, optionally move focus
                            to its heading
     markShown(name)        tell the guard a section changed; overlays that are
                            not in VIEWS use this on open and on close
     staleTap(event)        true when this tap belongs to the previous screen
*/

let currentView = '';
let viewShownAt = 0;

function markViewShown(name) {
  if (name !== currentView) {
    currentView = name;
    // performance.now() and not a date. Every clock read in this game goes
    // through state.todayISO() so QA can move the calendar, and a tap guard
    // measured in milliseconds has no business in that conversation.
    viewShownAt = performance.now();
  }
}

/* Stepping between questions is not a section change, so answering fast is never
   punished. A keyboard activation reports detail 0 and always goes through: a
   key press cannot be the tail of a double tap. */
function staleTap(event) {
  if (event && event.detail === 0) {
    return false;
  }
  return performance.now() - viewShownAt < STALE_TAP_MS;
}

function showView(name, moveFocus) {
  const keys = Object.keys(VIEWS);
  for (let i = 0; i < keys.length; i += 1) {
    document.getElementById(VIEWS[keys[i]].section).hidden = keys[i] !== name;
  }
  markViewShown(name);
  if (moveFocus) {
    document.getElementById(VIEWS[name].heading).focus();
  }
}

const views = { show: showView, markShown: markViewShown, staleTap: staleTap };

/* ---- content ------------------------------------------------------------ */

async function fetchJson(url) {
  try {
    const response = await fetch(url, { cache: 'no-store' });
    /* The body is read even on a 404, before anything looks at the status. An
       unread error body leaves the request open as far as the browser is
       concerned, and a page waiting on network idle then waits for a bank that
       is never coming. QA drives this game through missing banks on purpose. */
    const body = await response.text();
    if (!response.ok) {
      return null;
    }
    return JSON.parse(body);
  } catch (err) {
    // Missing or malformed is the same answer here: nothing. The screens that
    // use a bank each carry their own waiting state.
    return null;
  }
}

/* File order is load bearing. aiGenerate hands back meta.template_index against
   the array registered here, and gardener.js looks the matching reply chips up
   by that index, so nothing may sort or filter these lines on the way in.

   This sits in boot only until gardener.js exists in M3, which then owns it per
   the consumption contract in content/SCHEMAS.md. */
function registerGardenerLines(data) {
  if (data === null || typeof data !== 'object') {
    return;
  }
  const events = data.events;
  if (events === null || typeof events !== 'object') {
    return;
  }
  const bank = {};
  const keys = Object.keys(events);
  for (let i = 0; i < keys.length; i += 1) {
    const lines = events[keys[i]];
    if (!Array.isArray(lines)) {
      continue;
    }
    const texts = [];
    for (let j = 0; j < lines.length; j += 1) {
      const line = lines[j];
      if (line !== null && typeof line === 'object' && typeof line.text === 'string') {
        texts.push(line.text);
      }
    }
    if (texts.length > 0) {
      bank[keys[i]] = texts;
    }
  }
  registerBank(GAME, bank);
}

/* ---- boot --------------------------------------------------------------- */

/* The garden points at the new plant once, then goes back to being a garden.
   memory-flow.js has already stored it by the time this runs. */
function onPlanted(plant) {
  markFreshPlant(plant.id);
  renderGarden();
}

function bindBackButtons() {
  const buttons = document.querySelectorAll('[data-back="garden"]');
  for (let i = 0; i < buttons.length; i += 1) {
    buttons[i].addEventListener('click', function (event) {
      if (staleTap(event)) {
        return;
      }
      renderGarden();
      showView('garden', true);
    });
  }
}

async function start() {
  bindBackButtons();

  const banks = await Promise.all([
    fetchJson(CONTENT_URLS.prompts),
    fetchJson(CONTENT_URLS.gardenerLines),
    fetchJson(CONTENT_URLS.traits)
  ]);
  content.prompts = banks[0];
  content.gardenerLines = banks[1];
  content.traits = banks[2];

  registerGardenerLines(content.gardenerLines);
  // Before anything composes a plant. Without it the composer answers every
  // request with a neutral sprout rather than refusing.
  loadTraits(content.traits);

  initState();
  visit = recordVisit();

  /* The picker's waiting line stays whatever happens here: memory-flow.js hides
     it by rendering object cards, and leaves it standing when it has no bank to
     render from. One owner for that region, and a screen that always reads. */
  initMemoryFlow({ prompts: content.prompts, views: views, onPlanted: onPlanted });

  initGardenView({ views: views, storyFor: storyFor });
  renderGarden();
  showView('garden', false);
}

start();
