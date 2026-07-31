/*
  Garden of Life boot and glue. It fetches the content banks, brings state up,
  and owns which section is on screen. No game rules live in this file.

  The three banks are written by other workflows and may simply not be there
  yet. Every one of those fetches is allowed to come back empty handed: a bank
  that has not landed leaves a calm screen, never a broken one.
*/

import { loadTraits } from './composer.js';
import {
  initState, recordVisit, getPlants, getPlayer, findPlant, isWilted,
  loadCatalogue, getCoins, addCoins, grantSeed, mealUnlockCheck,
  photoQuestAvailable, claimPhotoQuest, getAudioMuted, setAudioMuted
} from './state.js';
import {
  initGardenView, renderGarden, markFreshPlant, speciesLabelFor,
  enterPlacement, clearPlacement, revealPlacement
} from './garden-view.js';
import { initMemoryFlow, storyFor } from './memory-flow.js';
import { initGardener, gardenerReact } from './gardener.js';
import { initPuzzle, refreshPuzzleCoins } from './puzzle.js';
import { initShop, refreshShopCoins } from './shop.js';
import { initMeals, celebrateMeals } from './meals.js';
import { initPhotoQuest } from './photo-quest.js';
import { initShareCard } from './share-card.js';
import { initAudio, setMuted as setAudioOutput, play } from './audio.js';

const GAME = 'garden-of-life';

const CONTENT_URLS = {
  prompts: '/games/garden-of-life/content/memory-prompts.json',
  gardenerLines: '/games/garden-of-life/content/gardener-lines.json',
  traits: '/games/garden-of-life/content/plant-traits.json',
  meals: '/games/garden-of-life/content/meal-cards.json'
};

// Fixed, and the only number a round can pay. No variance, no bonus roll.
const PUZZLE_PAYOUT = 6;

/* The camera walk pays the same way: a flat 3 coins and one common seed the
   player picks, once a day. Written here rather than in photo-quest.js for the
   same reason the payout above is written here, which is that what a moment is
   worth is the game's judgement and never the screen's. */
const PHOTO_COINS = 3;
const PHOTO_TIER = 'common';
const PHOTO_DONE_TODAY = 'You have already been out with the camera today. There will be another one tomorrow.';

const MUTE_ART = '/games/garden-of-life/art/ui/mute.svg';
const SOUND_ON_LABEL = 'Sound on';
const SOUND_OFF_LABEL = 'Sound off';

// A tap that lands inside a section which only just appeared is almost always
// the second half of a double tap aimed at the screen before it. Swallowing
// those for a third of a second is the difference between a shaky finger and a
// memory nobody chose.
const STALE_TAP_MS = 350;

const VIEWS = {
  garden: { section: 'view-garden', heading: 'garden-heading' },
  picker: { section: 'view-picker', heading: 'picker-heading' },
  prompt: { section: 'view-prompt', heading: 'prompt-heading' },
  ceremony: { section: 'view-ceremony', heading: 'ceremony-heading' },
  puzzle: { section: 'view-puzzle', heading: 'puzzle-heading' },
  shop: { section: 'view-shop', heading: 'shop-heading' },
  meals: { section: 'view-meals', heading: 'meals-heading' },
  photo: { section: 'view-photo', heading: 'photo-heading' },
  // Nothing is played here and nothing is earned. It answers the one question a
  // garden cannot answer for itself, which is why it exists at all.
  why: { section: 'view-why', heading: 'why-heading' }
};

const content = { prompts: null, gardenerLines: null, traits: null, meals: null };

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
  // A seed waiting for a plot is a moment, and leaving the garden ends it.
  if (name !== 'garden') {
    clearPlacement();
  }
  markViewShown(name);
  if (moveFocus) {
    document.getElementById(VIEWS[name].heading).focus();
  }
  /* Arriving at the garden with a seed still waiting is the shop handing it
     over, and the plots have to be where the player can see them. This goes
     after the focus above, which scrolls to the heading on its own and would
     otherwise undo it. */
  if (name === 'garden') {
    /* The purse is spent on other screens and the garden shows it, so the pill
       is redrawn on the way back in rather than at each of the six exits that
       lead here. The shop is the one that actually took coins, but a refresh
       hung off the shop's own back button is a refresh the next screen with a
       price on it has to remember to copy. Coming home is the one event they
       all share, so it is the one place this belongs. */
    refreshCoins();
    revealPlacement();
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

/* ---- what the gardener answers to ---------------------------------------
   Registration of her lines moved into gardener.js with M3, per the
   consumption contract in content/SCHEMAS.md: whoever reads meta.template_index
   back has to be the one who registered the array it indexes into. */

// She may notice a thirsty plant once in a sitting. Twice is nagging.
let wiltNoticed = false;

/* The garden points at the new plant once, then goes back to being a garden.
   memory-flow.js has already stored it by the time this runs. */
function onPlanted(plant) {
  markFreshPlant(plant.id);
  renderGarden();
  playCue('planting');
  gardenerReact('planting', { plant: speciesLabelFor(plant) });
}

/* Priority when several moments land on the same panel close, from the stretch
   plan: watering beats the wilt notice beats a passing comment. Watering wins
   because the player just did the thing, and being told about a dry plant in
   the same breath would read as never quite enough. */
function onPanelClosed(plant, didWater) {
  if (didWater) {
    gardenerReact('watering', { plant: speciesLabelFor(plant) });
    return;
  }
  if (!wiltNoticed) {
    const thirsty = firstWiltedPlant();
    if (thirsty !== null) {
      wiltNoticed = true;
      gardenerReact('wilt_notice', { plant: speciesLabelFor(thirsty) });
      return;
    }
  }
  gardenerReact('plant_comment', { plant: speciesLabelFor(plant) });
}

function firstWiltedPlant() {
  const plants = getPlants();
  for (let i = 0; i < plants.length; i += 1) {
    if (isWilted(plants[i])) {
      return plants[i];
    }
  }
  return null;
}

/* Picking something is the end of an arc, so it gets the bigger of the two
   answers when both are available: a dish that just became possible beats a
   comment about the crop that completed it. */
function onHarvest(cropId) {
  const dishes = mealUnlockCheck();
  refreshCoins();
  if (dishes.length > 0) {
    playCue('meal_unlock');
    gardenerReact('meal_unlock', { plant: dishes[0].name });
    // The card reveal is the meals screen's job, the line about it is ours.
    celebrateMeals(dishes);
    return;
  }
  gardenerReact('harvest', { plant: cropLabel(cropId) });
}

// The crops the game knows about, straight from the traits file main.js already
// fetched. A file that never landed leaves an empty map, which every reader
// below is written to survive.
function cropsMap() {
  const traits = content.traits === null || typeof content.traits !== 'object' ? {} : content.traits;
  return traits.crops === null || typeof traits.crops !== 'object' ? {} : traits.crops;
}

function cropLabel(cropId) {
  const crop = cropsMap()[cropId];
  return crop !== null && crop !== undefined && typeof crop.label === 'string' ? crop.label : cropId;
}

/* What the camera walk is allowed to hand over: common tier only, in file order.
   The same rule the free seed lives by, and for the same reason, which is that
   no free packet may be the short way to the rare shelf. The tier travels with
   each record because the screen filters again on its own side, and a list that
   arrived without one would come out empty. */
function commonCrops() {
  const crops = cropsMap();
  const keys = Object.keys(crops);
  const out = [];
  for (let i = 0; i < keys.length; i += 1) {
    const crop = crops[keys[i]];
    if (crop !== null && typeof crop === 'object' && crop.price_tier === PHOTO_TIER) {
      out.push({
        id: keys[i],
        label: typeof crop.label === 'string' ? crop.label : keys[i],
        price_tier: PHOTO_TIER
      });
    }
  }
  return out;
}

/* ---- coins on screen -----------------------------------------------------
   One purse, shown in two places. Both are read from state rather than counted
   locally, so a balance can never drift from the one that gets spent. */

function refreshCoins() {
  const amount = getCoins();
  const pill = document.getElementById('garden-coins');
  if (pill !== null) {
    pill.textContent = String(amount) + (amount === 1 ? ' coin' : ' coins');
  }
  refreshPuzzleCoins();
}

// The payout is this constant and nothing else. The puzzle reports that a round
// is finished; what that is worth was never the puzzle's business.
function onRoundComplete() {
  addCoins(PUZZLE_PAYOUT);
  refreshCoins();
}

/* ---- sound ---------------------------------------------------------------
   Four cues, and every one of them rides on a visual change that has already
   happened, so silence never costs the player information. Both calls go through
   these two functions rather than being sprinkled through the glue, so the whole
   game's relationship with the sound module is nine lines long. */

/* Called from inside the tap that caused the thing being described, which is
   what lets the module build its context at all: a browser refuses one asked for
   anywhere else. Muted, it does nothing and builds nothing. */
function playCue(name) {
  play(name);
}

// The save is the record. This only tells the sound module which way the switch
// is now pointing, so a cue already halfway through can fade out properly.
function pushMuteToAudio(muted) {
  setAudioOutput(muted);
}

function paintMute(button, label, muted) {
  // Pressed means quiet. The label says the same thing in words, so the state
  // never rides on the ring alone.
  button.setAttribute('aria-pressed', muted ? 'true' : 'false');
  if (label !== null) {
    label.textContent = muted ? SOUND_OFF_LABEL : SOUND_ON_LABEL;
  }
}

function bindMute() {
  const button = document.getElementById('mute-toggle');
  const label = document.getElementById('mute-label');
  const art = document.getElementById('mute-art');
  if (button === null) {
    return;
  }
  if (art !== null) {
    /* The listener goes on before the src, so a file that is not there is caught
       rather than left as a broken picture. The label carries the button either
       way, which is the fallback contract every art path in this game keeps. */
    art.addEventListener('error', function () {
      art.hidden = true;
    });
    art.src = MUTE_ART;
    art.hidden = false;
  }
  paintMute(button, label, getAudioMuted());
  button.addEventListener('click', function (event) {
    if (staleTap(event)) {
      return;
    }
    const muted = !getAudioMuted();
    setAudioMuted(muted);
    pushMuteToAudio(muted);
    paintMute(button, label, muted);
  });
}

/* The board settles a matched pair itself and tells nobody: the puzzle reports a
   finished round and nothing smaller, which is the right seam for a payout and
   the wrong one for a sound. So the cue is read off the board rather than
   plumbed through the module, by counting what has settled after each tap.

   Two things make that honest. This listener is added after initPuzzle, so it
   runs after the module's own handler on the same node and sees the board the
   tap left behind. And it compares a count rather than looking at the tile that
   was tapped, so a tap on an already settled pair plays nothing, and a fresh
   round, which empties the board, simply starts the count again. */
let settledSeen = 0;

function bindMatchCue() {
  const board = document.getElementById('puzzle-board');
  if (board === null) {
    return;
  }
  board.addEventListener('click', function () {
    const settled = board.querySelectorAll('[data-state="matched"]').length;
    if (settled > settledSeen) {
      playCue('match');
    }
    settledSeen = settled;
  });
}

function onWatered() {
  playCue('water');
}

/* ---- the camera walk -----------------------------------------------------
   photo-quest.js runs the screen and works out what the photo shows. Every grant
   happens here, through state, so the reward stays one fixed ruling in one file
   and the module stays a screen. Nothing about the photograph reaches this
   function, and there is nowhere in state to put it if it did. */

function onQuestDone(result) {
  const found = result === null || typeof result !== 'object' ? {} : result;
  const label = typeof found.findLabel === 'string' ? found.findLabel : '';
  const cropId = typeof found.seedCropId === 'string' ? found.seedCropId : '';

  /* The day is spent first. A claim that comes back false means this walk was
     already paid for, so the walk still ends in the garden and the coins are not
     handed over twice. */
  if (!claimPhotoQuest()) {
    showView('garden', true);
    return;
  }

  addCoins(PHOTO_COINS);
  if (cropId !== '') {
    grantSeed(cropId);
    // Straight into the same guided moment a bought seed gets. One way to put
    // something in the ground, however it was come by.
    enterPlacement(cropId, cropLabel(cropId));
  }
  refreshCoins();
  /* Shown from here rather than left to the module, so the walk ends in the
     garden even if the screen forgets to leave. Calling it twice costs a repeat
     of the same render, which is why it is safe to insist on it. */
  showView('garden', true);
  // Last, so her line lands on a garden the player is already looking at.
  gardenerReact('photo_result', { plant: label });
}

function bindPhotoEntry() {
  const button = document.getElementById('open-photo');
  const note = document.getElementById('photo-note');
  if (button === null) {
    return;
  }
  button.addEventListener('click', function (event) {
    if (staleTap(event)) {
      return;
    }
    /* Never disabled into silence. A walk already taken today answers in a line
       under the button that was just pressed, and the button keeps working, so
       nothing on this screen ever reads as broken. */
    if (!photoQuestAvailable()) {
      if (note !== null) {
        note.textContent = PHOTO_DONE_TODAY;
      }
      return;
    }
    if (note !== null) {
      note.textContent = '';
    }
    showView('photo', true);
  });
}

/* ---- boot --------------------------------------------------------------- */

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

/* The way out of a section that is not marked data-back. puzzle.js binds its own
   back button, so this is only for the shop and the meals, and the marked one in
   the picker stays with bindBackButtons above. */
function bindExit(id) {
  const button = document.getElementById(id);
  if (button === null) {
    return;
  }
  button.addEventListener('click', function (event) {
    if (staleTap(event)) {
      return;
    }
    renderGarden();
    showView('garden', true);
  });
}

function bindEntry(id, view) {
  const button = document.getElementById(id);
  if (button === null) {
    return;
  }
  button.addEventListener('click', function (event) {
    if (staleTap(event)) {
      return;
    }
    showView(view, true);
    /* One purse, three screens. Whichever one is being opened is redrawn from
       state, because the balance may have moved on either of the other two. */
    if (view === 'puzzle') {
      refreshPuzzleCoins();
    } else if (view === 'shop') {
      refreshShopCoins();
    }
  });
}

async function start() {
  bindBackButtons();
  bindEntry('open-puzzle', 'puzzle');
  bindEntry('open-shop', 'shop');
  bindEntry('open-meals', 'meals');
  bindEntry('open-why', 'why');
  bindExit('shop-back');
  bindExit('meals-back');
  bindExit('why-back');
  /* photo-back is deliberately not bound here. photo-quest.js binds it, the same
     way puzzle.js binds its own, because walking out of that screen also has to
     reset the flow behind it, and binding it twice would send the player back
     twice and move the focus twice. */
  // The entry answers for itself, so it is not a plain bindEntry: today's walk
  // may already be spent, and the answer to that is a line, not a screen.
  bindPhotoEntry();

  const banks = await Promise.all([
    fetchJson(CONTENT_URLS.prompts),
    fetchJson(CONTENT_URLS.gardenerLines),
    fetchJson(CONTENT_URLS.traits),
    fetchJson(CONTENT_URLS.meals)
  ]);
  content.prompts = banks[0];
  content.gardenerLines = banks[1];
  content.traits = banks[2];
  content.meals = banks[3];

  // Before anything composes a plant. Without it the composer answers every
  // request with a neutral sprout rather than refusing.
  loadTraits(content.traits);

  /* State judges the economy moves, so it needs to know which crops are common
     and which dishes want what. Injected, not imported, so a missing file costs
     the free seed and the meal check and nothing else. */
  loadCatalogue({
    crops: content.traits === null ? {} : content.traits.crops,
    dishes: content.meals === null ? [] : content.meals.dishes
  });

  initState();
  visit = recordVisit();

  /* She greets on init, so she needs to know how this arrival was classified
     and what the player last planted, which is the callback that makes a second
     visit feel like a second visit. An empty label is a real answer: her lines
     read fine without it. */
  const last = findPlant(getPlayer().lastPlantId);
  initGardener({
    lines: content.gardenerLines,
    views: views,
    visit: visit,
    plant: last === null ? '' : speciesLabelFor(last)
  });

  /* The picker's waiting line stays whatever happens here: memory-flow.js hides
     it by rendering object cards, and leaves it standing when it has no bank to
     render from. One owner for that region, and a screen that always reads. */
  initMemoryFlow({ prompts: content.prompts, views: views, onPlanted: onPlanted });

  initGardenView({
    views: views,
    storyFor: storyFor,
    onPanelClosed: onPanelClosed,
    onHarvest: onHarvest,
    onWatered: onWatered
  });

  // The board deals itself a round on init and keeps it until the player
  // finishes it, so opening the puzzle later never costs a wait.
  initPuzzle({ views: views, onRoundComplete: onRoundComplete, coins: getCoins });
  // After initPuzzle on purpose: same node, same phase, so this listener runs
  // second and reads the board the module has already repainted.
  bindMatchCue();
  // The shop hands a bought seed straight to the garden's guided placement.
  initShop({ views: views, onPlantNow: enterPlacement });
  initMeals({ views: views, dishes: content.meals });

  /* Which seeds the walk may hand over is the game's ruling and not the screen's,
     so the list goes over already filtered. It carries the tier as well as the
     name, because the module filters again on its own side and a list with no
     tier on it would come out empty. */
  initPhotoQuest({ views: views, onQuestDone: onQuestDone, crops: commonCrops() });
  // The share button belongs to that module, which binds it and narrates the
  // result into #share-note itself.
  initShareCard({ views: views });
  /* Nothing is built here. The sound module creates its machinery inside the
     first cue that runs after a real tap, which is the only place a browser
     allows it, so this call only hands over the saved setting. */
  initAudio({ muted: getAudioMuted() });

  bindMute();

  renderGarden();
  refreshCoins();
  showView('garden', false);
}

start();
