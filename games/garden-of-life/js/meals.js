/*
  Garden of Life meal cards.

  Six dishes, one card each, and every card is worth looking at whether or not
  it has been cooked. A cooked dish shows its picture, its name, what it is good
  for and the line somebody would actually say about it. One still to cook shows
  its name and the crops it grows from, so a player who has never unlocked
  anything still learns what to plant. Nothing on this screen is a dead end and
  nothing on it is a taunt.

  What is unlocked is state's answer, and consuming the crops that unlocked it
  is state's job. This file only ever draws the answer.

  Every id is queried lazily inside initMeals, so the module loads clean long
  before the section html exists and answers 0 when it is not there yet.
*/

import { composeCrop } from './composer.js';

/* Namespace import for the same reason shop.js uses one: this file and the meals
   half of state were written in parallel, and a named import of something that
   is not there fails the whole module graph at parse time. Reads are guarded, so
   a renamed accessor costs this screen its unlocks rather than costing the game
   its boot. */
import * as state from './state.js';

const MEAL_ART_DIR = '/games/garden-of-life/art/meals/';

// A dish id is pasted into an image path, so only ids this game could have
// written are allowed anywhere near a URL.
const SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/;

/* ---- copy ---------------------------------------------------------------
   A dish still to cook is a plan, not a failure, and every line here has to
   read that way out loud. */

const GRID_WAITING = 'Auntie Bee is still writing out her recipes. Come back in a moment.';
const STILL_TO_COOK = 'Still to cook';
const GROWS_FROM = 'Grows from: ';

/* ---- module state --------------------------------------------------------
   Both nodes start as a stated null rather than a field that is simply not
   there, so every guard below reads the same before init, after an init that
   found no section, and under plain node. celebrateMeals is called by glue that
   has no idea whether this screen was ever built. */

const el = { grid: null, back: null };

let views = null;
let bound = false;
let watching = false;

// Cleaned copies of the bank, never the parsed file itself, so nothing later
// has to ask whether a field survived.
let dishes = [];

/* The dishes that have just been unlocked, for exactly one render. The garden
   marks a new plot the same way: the render that uses it clears it, and nothing
   here is ever cleared by a timer. */
let arriving = [];

/* ---- small helpers ------------------------------------------------------- */

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

/* ---- reading the bank ----------------------------------------------------
   Rebuilt into the shape this file wants. A dish with no id and no name is
   dropped rather than rendered as a blank card, and everything else that did
   not survive the trip leaves a usable default. */

function cleanDish(raw) {
  if (raw === null || typeof raw !== 'object') {
    return null;
  }
  const id = trimmed(raw.id);
  if (id === '' || !SAFE_ID.test(id)) {
    return null;
  }
  const crops = [];
  const source = Array.isArray(raw.crops) ? raw.crops : [];
  for (let i = 0; i < source.length; i += 1) {
    const crop = trimmed(source[i]);
    if (crop !== '' && crops.indexOf(crop) === -1) {
      crops.push(crop);
    }
  }
  const name = trimmed(raw.name);
  return {
    id: id,
    name: name === '' ? id : name,
    crops: crops,
    benefit: trimmed(raw.benefit),
    line: trimmed(raw.line)
  };
}

function readBank(raw) {
  if (raw === null || typeof raw !== 'object') {
    return [];
  }
  // The parsed file, or the dishes array on its own. Both are handed over by
  // glue somewhere, and neither is worth an argument.
  const source = Array.isArray(raw) ? raw : (Array.isArray(raw.dishes) ? raw.dishes : []);
  const cleaned = [];
  for (let i = 0; i < source.length; i += 1) {
    const dish = cleanDish(source[i]);
    if (dish !== null) {
      cleaned.push(dish);
    }
  }
  return cleaned;
}

/* ---- reading state ------------------------------------------------------- */

function unlockedIds() {
  let list = null;
  try {
    // The reader state offers when it has one, the document underneath when it
    // does not, so neither seat renaming an accessor can empty this screen.
    if (typeof state.getUnlockedMeals === 'function') {
      list = state.getUnlockedMeals();
    }
    if (!Array.isArray(list)) {
      const doc = state.getState();
      const held = doc === null || typeof doc !== 'object' ? null : doc.meals;
      list = held === null || typeof held !== 'object' ? null : held.unlocked;
    }
  } catch (error) {
    return [];
  }
  if (!Array.isArray(list)) {
    return [];
  }
  const ids = [];
  for (let i = 0; i < list.length; i += 1) {
    const id = trimmed(list[i]);
    if (id !== '') {
      ids.push(id);
    }
  }
  return ids;
}

/* ---- crop names ----------------------------------------------------------
   The label the shop and the garden use, asked of the composer so all three
   screens call a crop the same thing. An id the bank cannot resolve answers
   with the composer's default crop, so the answer is only used when it is about
   the crop that was asked for; otherwise the id is tidied up and shown as it
   is, which still tells a player what to plant. */

function cropLabel(cropId) {
  try {
    const built = composeCrop({ cropId: cropId, stage: 2 });
    const traits = built === null || typeof built !== 'object' || built.traits === null ||
      typeof built.traits !== 'object' ? {} : built.traits;
    if (traits.crop === cropId && typeof traits.cropLabel === 'string' && traits.cropLabel !== '') {
      return traits.cropLabel;
    }
  } catch (error) {
    // Falls through to the id below, which is still a real answer.
  }
  return cropId.split('-').join(' ');
}

/**
 * The line a dish still to cook shows instead of a picture. Names what to grow,
 * in the order the recipe lists it.
 * @param {Array<string>} labels Crop labels, already resolved.
 * @returns {string} Empty when there is nothing to name.
 */
export function growsFromText(labels) {
  const list = Array.isArray(labels) ? labels : [];
  const parts = [];
  for (let i = 0; i < list.length; i += 1) {
    const label = trimmed(list[i]);
    if (label !== '') {
      parts.push(label);
    }
  }
  return parts.length === 0 ? '' : GROWS_FROM + parts.join(', ');
}

function cropLabelsFor(dish) {
  const labels = [];
  for (let i = 0; i < dish.crops.length; i += 1) {
    labels.push(cropLabel(dish.crops[i]));
  }
  return labels;
}

/* ---- building nodes ------------------------------------------------------ */

function para(className, text) {
  const node = document.createElement('p');
  node.className = className;
  node.textContent = text;
  return node;
}

/* Art arrives on its own schedule and one file may simply never turn up. A
   picture that cannot load takes itself out of the layout and leaves the card a
   warm block with its name and its line on it, which is the whole card anyway.

   No sizing here. garden.css sizes .meal-card img, and the dish photographs are
   800px square, so lazy is not a nicety: a screen of six locked cards should
   not be pulling megabytes of food nobody has cooked yet. */
function artNode(dish) {
  const art = document.createElement('img');
  art.className = 'meal-art';
  art.alt = '';
  art.src = MEAL_ART_DIR + dish.id + '.png';
  art.loading = 'lazy';
  art.decoding = 'async';
  art.addEventListener('error', function () {
    art.hidden = true;
  });
  return art;
}

function unlockedCard(dish, fresh) {
  const card = document.createElement('div');
  card.className = 'card meal-card is-cooked' + (fresh ? ' meal-new plot-new' : '');
  card.dataset.dishId = dish.id;
  card.dataset.locked = 'false';
  card.setAttribute('role', 'group');
  card.setAttribute('aria-label', dish.name + ', cooked' +
    (dish.benefit === '' ? '' : '. ' + dish.benefit));

  card.appendChild(artNode(dish));
  card.appendChild(para('meal-name', dish.name));
  if (dish.benefit !== '') {
    card.appendChild(para('meal-benefit', dish.benefit));
  }
  // The bank calls this one optional, and a dish without it still reads.
  if (dish.line !== '') {
    card.appendChild(para('meal-line muted', dish.line));
  }
  return card;
}

function lockedCard(dish) {
  const grows = growsFromText(cropLabelsFor(dish));
  const card = document.createElement('div');
  card.className = 'card meal-card is-locked';
  card.dataset.dishId = dish.id;
  card.dataset.locked = 'true';
  card.setAttribute('role', 'group');
  card.setAttribute('aria-label', dish.name + ', ' + STILL_TO_COOK.toLowerCase() +
    (grows === '' ? '' : '. ' + grows));

  card.appendChild(para('meal-name', dish.name));
  /* Said in words, not in colour or a padlock. The state has to survive being
     read out loud, and it has to sit above the contrast floor, which a greyed
     out card would not. */
  card.appendChild(para('meal-state muted', STILL_TO_COOK));
  if (grows !== '') {
    card.appendChild(para('meal-grows', grows));
  }
  return card;
}

/* ---- rendering ----------------------------------------------------------- */

/* Whether this screen is the one the player is looking at. A dish is unlocked by
   a harvest that happens in the garden, so the render that answers it is drawn
   into a hidden section, and an arrival nobody could see is not an arrival. */
function gridOnScreen() {
  if (el.grid === null || typeof el.grid.getClientRects !== 'function') {
    return false;
  }
  return el.grid.getClientRects().length > 0;
}

function renderGrid() {
  if (el.grid === null) {
    return 0;
  }
  if (dishes.length === 0) {
    // The same answer the picker gives with no bank: a calm line rather than an
    // empty box that reads as something broken.
    el.grid.replaceChildren(para('muted meals-waiting', GRID_WAITING));
    return 0;
  }

  const unlocked = unlockedIds();
  const nodes = [];
  for (let i = 0; i < dishes.length; i += 1) {
    const dish = dishes[i];
    // File order, unlocked or not. A card that jumped to the front the day it
    // was cooked would move every other card under the player's finger.
    if (unlocked.indexOf(dish.id) === -1) {
      nodes.push(lockedCard(dish));
    } else {
      nodes.push(unlockedCard(dish, arriving.indexOf(dish.id) !== -1));
    }
  }
  el.grid.replaceChildren.apply(el.grid, nodes);
  // Spent only once it has actually been seen. Until then it waits for the
  // render that happens when the player opens this screen.
  if (gridOnScreen()) {
    arriving = [];
  }
  return nodes.length;
}

/* ---- wiring -------------------------------------------------------------- */

function cacheElements() {
  // Deliberately not #meals-heading. The section owns its own copy and nothing
  // in here rewrites it. getElementById answers null when a section has not
  // landed, which is the shape every guard here is written to.
  el.grid = byId('meals-grid');
  el.back = byId('meals-back');
}

function bind() {
  if (bound) {
    return;
  }
  bound = true;

  /* main.js binds every [data-back="garden"] control on the page. Binding this
     one again would send the player back twice and move the focus twice, so a
     button the section already marked that way is left alone. */
  if (el.back !== null && el.back.getAttribute('data-back') !== 'garden') {
    on(el.back, 'click', function (event) {
      if (views.staleTap(event)) {
        return;
      }
      views.show('garden', true);
    });
  }
}

/* Dishes unlock in the garden, so this screen redraws itself when it comes on
   rather than trusting that it was told. It is also where a card that unlocked
   while nobody was looking finally gets to arrive. A redraw changes nothing the
   observer is listening for, so it cannot chase its own tail. */
function watchForOpening() {
  if (watching || typeof MutationObserver !== 'function' || el.grid === null) {
    return;
  }
  const section = typeof el.grid.closest === 'function' ? el.grid.closest('.view') : null;
  if (section === null) {
    return;
  }
  watching = true;
  const observer = new MutationObserver(function () {
    if (!section.hidden) {
      renderGrid();
    }
  });
  observer.observe(section, { attributes: true, attributeFilter: ['hidden'] });
}

/* ---- exports ------------------------------------------------------------- */

/**
 * Draw the meal cards and wire the way back.
 *
 * Every id is looked up here rather than at import time, so this module is safe
 * to load and safe to call before the meals section html exists. With no grid on
 * the page it renders nothing, binds nothing and answers 0, which is also what
 * it does under plain node where there is no document at all.
 *
 * Safe to call with nothing: a null or unusable bank leaves one calm line in the
 * grid rather than an empty screen. Calling it twice is a redraw.
 *
 * @param {Object} options
 * @param {{show: Function, markShown: Function, staleTap: Function}} [options.views]
 *   The view handle from main.js. staleTap(event) guards every tap in here.
 * @param {Object|Array|null} [options.dishes] Parsed content/meal-cards.json, or
 *   its dishes array, or null when the bank has not landed.
 * @returns {number} How many cards are on screen, 0 when there is no meals
 *   section or no usable dish in the bank.
 */
export function initMeals(options) {
  if (typeof document === 'undefined' || document === null) {
    return 0;
  }

  const config = options === null || typeof options !== 'object' ? {} : options;
  const handle = config.views === null || typeof config.views !== 'object' ? {} : config.views;

  views = {
    show: typeof handle.show === 'function' ? handle.show : function () {},
    markShown: typeof handle.markShown === 'function' ? handle.markShown : function () {},
    staleTap: typeof handle.staleTap === 'function' ? handle.staleTap : function () { return false; }
  };

  cacheElements();
  if (el.grid === null) {
    return 0;
  }

  dishes = readBank(config.dishes);
  bind();
  watchForOpening();
  return renderGrid();
}

/**
 * Redraw the cards and let the ones just unlocked arrive.
 *
 * The named dishes get the welcome ring the garden gives a new plot, for one
 * render and then never again, and a stylesheet without that class simply means
 * the card appears without it. The unlock happens in the garden, so the ring
 * waits for the render the player is actually looking at rather than being spent
 * on a hidden screen. What the gardener says about the dish is the glue's line
 * to deliver, not this file's.
 *
 * Takes what mealUnlockCheck() returns, which is a list of {id, name} records,
 * and takes plain ids just as happily.
 *
 * @param {Array<string|{id: string}>|string} dishIds The dishes state just
 *   added to unlocked.
 * @returns {number} How many cards are on screen after the redraw.
 */
export function celebrateMeals(dishIds) {
  const list = Array.isArray(dishIds) ? dishIds : (dishIds === null ? [] : [dishIds]);
  const marks = [];
  for (let i = 0; i < list.length; i += 1) {
    const entry = list[i];
    const id = entry !== null && typeof entry === 'object' ? trimmed(entry.id) : trimmed(entry);
    if (id !== '' && marks.indexOf(id) === -1) {
      marks.push(id);
    }
  }
  arriving = marks;
  return renderGrid();
}
