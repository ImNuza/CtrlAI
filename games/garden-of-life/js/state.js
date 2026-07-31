/*
  Garden of Life state.

  Two jobs, and nobody else does either of them. It is the only file that touches
  the storage namespace, and it is the only file that reads a clock. Growth, wilt
  and streaks all hang off the calendar, so QA has to be able to move the
  calendar; keeping every date read behind todayISO() is what makes that one
  localStorage key enough.

  Everything returned from here is defensive: storage is a file a curious person
  can edit, so nothing trusts what comes back out of it.
*/

import { loadState, saveState } from '../../../shared/storage.js';

const NS = 'garden-of-life';
const STATE_VERSION = 2;

// QA writes this key and reloads to simulate a day passing. Read directly rather
// than through shared/storage.js, because it is QA apparatus and not game state.
const QA_CLOCK_KEY = 'ctrlai:garden-of-life:qa-clock';

const ISO_DAY = /^\d{4}-\d{2}-\d{2}/;
const PLANT_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const PLANT_ID_PREFIX = 'gol-';

const MAX_STAGE = 2;
// Two whole days without water, and two days away, are the same threshold on
// purpose: the garden and the gardener agree on what counts as a gap.
const ABSENCE_DAYS = 2;
const MS_PER_DAY = 86400000;
const MAX_NAME = 40;
const MAX_HONORIFIC = 24;
const MAX_FREE_TEXT = 120;
const MAX_CROP_ID = 40;
const FREE_SEED_TIER = 'common';

let state = emptyState();

/* The crop and dish catalogues, injected once at boot from the files main.js
   already fetches. Held rather than imported so this module keeps its promise of
   working under plain node with no network and no content on disk: without them
   the free seed and the meal check simply answer no, and nothing throws. */
let catalogue = { crops: {}, dishes: [] };

/* ---- the document ------------------------------------------------------- */

function emptyState() {
  return {
    version: STATE_VERSION,
    player: {
      name: '',
      honorific: '',
      visitCount: 0,
      lastVisitDay: '',
      prevVisitDay: '',
      lastPlantId: '',
      memoryHint: ''
    },
    nextPlantId: 1,
    plants: [],
    // ---- v2, the economy. Everything below defaults to empty, which is what a
    // v1 save migrates into: nothing owned, nothing spent, nothing lost.
    coins: 0,
    streak: { days: 0, lastCountedDay: '' },
    seeds: {},
    basket: {},
    meals: { unlocked: [] },
    freeSeed: { lastClaimDay: '' }
  };
}

function text(value, limit) {
  const raw = typeof value === 'string' ? value.trim() : '';
  return limit === undefined ? raw : raw.slice(0, limit);
}

function plainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function isoDay(value) {
  return typeof value === 'string' && ISO_DAY.test(value) ? value.slice(0, 10) : '';
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

// Everything a plant needs is filled in here, so no reader downstream has to ask
// whether wateredDays exists before counting it.
function cleanPlant(raw) {
  const days = Array.isArray(raw.wateredDays) ? raw.wateredDays : [];
  const watered = [];
  for (let i = 0; i < days.length; i += 1) {
    const day = isoDay(days[i]);
    if (day !== '' && watered.indexOf(day) === -1) {
      watered.push(day);
    }
  }
  return {
    id: raw.id,
    kind: raw.kind === 'crop' ? 'crop' : 'memory',
    plantedDay: isoDay(raw.plantedDay),
    objectId: raw.objectId,
    // Empty on a memory, and the reason a crop knows what it is.
    cropId: text(raw.cropId, MAX_CROP_ID),
    answers: plainObject(raw.answers),
    phrases: plainObject(raw.phrases),
    tags: plainObject(raw.tags),
    freeText: text(raw.freeText, MAX_FREE_TEXT),
    seed: Number.isFinite(raw.seed) ? raw.seed : 0,
    wateredDays: watered
  };
}

/* A map of crop id to how many, for the seed packet drawer and the basket. Only
   whole positive counts survive: a zero or a negative is the same as not owning
   the thing, and carrying it around would only complicate every reader. */
function countMap(value) {
  const source = plainObject(value);
  const out = {};
  const keys = Object.keys(source);
  for (let i = 0; i < keys.length; i += 1) {
    const id = text(keys[i], MAX_CROP_ID);
    const count = source[keys[i]];
    if (id !== '' && Number.isFinite(count) && count > 0) {
      out[id] = Math.floor(count);
    }
  }
  return out;
}

function idList(value) {
  const source = Array.isArray(value) ? value : [];
  const out = [];
  for (let i = 0; i < source.length; i += 1) {
    const id = text(source[i], MAX_CROP_ID);
    if (id !== '' && out.indexOf(id) === -1) {
      out.push(id);
    }
  }
  return out;
}

function wholeCount(value) {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

function cleanPlayer(raw) {
  const source = plainObject(raw);
  const count = Number.isFinite(source.visitCount) && source.visitCount > 0
    ? Math.floor(source.visitCount)
    : 0;
  return {
    name: text(source.name, MAX_NAME),
    honorific: text(source.honorific, MAX_HONORIFIC),
    visitCount: count,
    lastVisitDay: isoDay(source.lastVisitDay),
    prevVisitDay: isoDay(source.prevVisitDay),
    lastPlantId: typeof source.lastPlantId === 'string' && PLANT_ID_PATTERN.test(source.lastPlantId)
      ? source.lastPlantId
      : '',
    memoryHint: text(source.memoryHint, MAX_FREE_TEXT)
  };
}

// A counter that has fallen behind the plants it is supposed to be ahead of
// would hand out an id that already exists, so it gets pushed past the highest
// one on record before anything is allowed to use it.
function nextIdFor(stored, plants) {
  let next = Number.isFinite(stored) && stored > 0 ? Math.floor(stored) : 1;
  for (let i = 0; i < plants.length; i += 1) {
    const id = plants[i].id;
    if (id.indexOf(PLANT_ID_PREFIX) === 0) {
      const seen = Number(id.slice(PLANT_ID_PREFIX.length));
      if (Number.isFinite(seen) && seen >= next) {
        next = Math.floor(seen) + 1;
      }
    }
  }
  return next;
}

/* ---- the clock ----------------------------------------------------------
   The whole game asks todayISO() what day it is. QA answers for it by writing
   one key, which is how a week of growth fits inside a test run. */

function pad2(value) {
  return value < 10 ? '0' + String(value) : String(value);
}

function qaClock() {
  try {
    if (typeof localStorage === 'undefined' || localStorage === null) {
      return '';
    }
    const raw = localStorage.getItem(QA_CLOCK_KEY);
    if (typeof raw !== 'string' || raw === '') {
      return '';
    }
    // A harness may write the plain day or a JSON quoted one. Both are honoured,
    // and anything that is not a date is ignored rather than trusted.
    let value = raw.trim();
    if (value.charAt(0) === '"') {
      const parsed = JSON.parse(value);
      value = typeof parsed === 'string' ? parsed.trim() : '';
    }
    return isoDay(value);
  } catch (err) {
    return '';
  }
}

/**
 * Today, as the player's calendar sees it.
 * Honours the QA override at localStorage key ctrlai:garden-of-life:qa-clock.
 * @returns {string} "YYYY-MM-DD".
 */
export function todayISO() {
  const override = qaClock();
  if (override !== '') {
    return override;
  }
  // The one clock read in the game. Local parts, not the UTC ones, so a player
  // in Singapore never sees yesterday's date late at night.
  const now = new Date();
  return String(now.getFullYear()) + '-' + pad2(now.getMonth() + 1) + '-' + pad2(now.getDate());
}

// Reads its argument, never the clock. Fixed to UTC midnight so a daylight
// saving jump somewhere in the world cannot turn a whole day into 23 hours.
function dayNumber(iso) {
  const day = isoDay(iso);
  if (day === '') {
    return null;
  }
  const ms = Date.parse(day + 'T00:00:00Z');
  return Number.isFinite(ms) ? Math.round(ms / MS_PER_DAY) : null;
}

/**
 * Whole calendar days between two ISO days, in either order.
 * @param {string} isoA
 * @param {string} isoB
 * @returns {number} 0 when either day is unreadable.
 */
export function daysBetween(isoA, isoB) {
  const a = dayNumber(isoA);
  const b = dayNumber(isoB);
  if (a === null || b === null) {
    return 0;
  }
  return Math.abs(b - a);
}

/* ---- load and save ------------------------------------------------------ */

/**
 * Read the saved garden, drop anything malformed, and hold it as the singleton.
 * Called once by main.js on boot.
 *
 * Migration from v1 is lossless by construction: every v1 field is read by the
 * same code that read it before, and the v2 blocks are defaulted from the empty
 * document rather than being required. A save written before the economy
 * existed keeps every plant, every phrase and every watered day, and simply
 * arrives with nothing in its pockets.
 *
 * @returns {Object} The live state document.
 */
export function initState() {
  const raw = loadState(NS, null);
  const fresh = emptyState();
  if (raw === null || typeof raw !== 'object') {
    state = fresh;
    return state;
  }
  const plants = [];
  const stored = Array.isArray(raw.plants) ? raw.plants : [];
  for (let i = 0; i < stored.length; i += 1) {
    if (isPlant(stored[i])) {
      plants.push(cleanPlant(stored[i]));
    }
  }
  const streak = plainObject(raw.streak);
  const meals = plainObject(raw.meals);
  const freeSeed = plainObject(raw.freeSeed);
  state = {
    version: STATE_VERSION,
    player: cleanPlayer(raw.player),
    nextPlantId: nextIdFor(raw.nextPlantId, plants),
    plants: plants,
    coins: wholeCount(raw.coins),
    streak: {
      days: wholeCount(streak.days),
      lastCountedDay: isoDay(streak.lastCountedDay)
    },
    seeds: countMap(raw.seeds),
    basket: countMap(raw.basket),
    meals: { unlocked: idList(meals.unlocked) },
    freeSeed: { lastClaimDay: isoDay(freeSeed.lastClaimDay) }
  };
  return state;
}

/**
 * Hand state the catalogues it needs to judge an economy move: which crops exist
 * and what tier they are, and which dishes want which crops. Injected rather
 * than imported, so this module still runs with no content on disk.
 * @param {{crops?: Object, dishes?: Array<Object>}} data crops is the crops map
 *   from plant-traits.json, dishes is the dishes array from meal-cards.json.
 * @returns {{crops: number, dishes: number}} How much of each was accepted.
 */
export function loadCatalogue(data) {
  const source = plainObject(data);
  const crops = plainObject(source.crops);
  const dishes = [];
  const rawDishes = Array.isArray(source.dishes) ? source.dishes : [];
  for (let i = 0; i < rawDishes.length; i += 1) {
    const dish = plainObject(rawDishes[i]);
    const id = text(dish.id, MAX_CROP_ID);
    const wants = idList(dish.crops);
    if (id !== '' && wants.length > 0) {
      dishes.push({ id: id, name: text(dish.name, MAX_NAME), crops: wants });
    }
  }
  catalogue = { crops: crops, dishes: dishes };
  return { crops: Object.keys(crops).length, dishes: dishes.length };
}

/**
 * The live state document. Read it, write through the functions in this file.
 * @returns {Object}
 */
export function getState() {
  return state;
}

/**
 * Persist the current document.
 * @returns {boolean} True when it was stored.
 */
export function saveNow() {
  return saveState(NS, state);
}

/* ---- visits ------------------------------------------------------------- */

/**
 * Count this load as a visit. Classifies before it mutates, so the gardener can
 * still tell what kind of arrival it was after the books are updated.
 * @returns {{kind: string, daysAway: number}} kind is first_visit, return_visit
 *   or return_after_absence; daysAway is 0 on a first visit.
 */
export function recordVisit() {
  const today = todayISO();
  const player = state.player;
  const last = player.lastVisitDay;
  let kind = 'first_visit';
  let daysAway = 0;

  if (player.visitCount > 0 && last !== '') {
    daysAway = daysBetween(last, today);
    kind = daysAway >= ABSENCE_DAYS ? 'return_after_absence' : 'return_visit';
  }

  player.prevVisitDay = last;
  player.lastVisitDay = today;
  player.visitCount += 1;
  recordPlayDay(today);
  saveNow();

  return { kind: kind, daysAway: daysAway };
}

/* The streak counts days the player showed up, and nothing else. A gap pauses
   it and picks up where it left off, because a counter that punishes a week in
   hospital by going back to zero is a counter that teaches people to stop
   coming back. Folded into recordVisit so no caller can forget it. */
function recordPlayDay(today) {
  if (today === '' || state.streak.lastCountedDay === today) {
    return;
  }
  state.streak.days += 1;
  state.streak.lastCountedDay = today;
}

/* ---- plants ------------------------------------------------------------- */

/**
 * Plant a memory. The id comes off a saved counter, so two plants can never
 * collide and nothing here needs a clock or a dice roll.
 * @param {{objectId: string, answers: Object, phrases: Object, tags: Object,
 *   freeText?: string, seed?: number}} input
 * @returns {Object} The stored plant.
 */
export function addPlant(input) {
  const data = plainObject(input);
  const plant = {
    id: PLANT_ID_PREFIX + String(state.nextPlantId),
    kind: 'memory',
    plantedDay: todayISO(),
    objectId: text(data.objectId, 64),
    answers: plainObject(data.answers),
    // Captured now, on purpose. A saved story has to replay word for word years
    // after the bank it came from was edited or lost.
    phrases: plainObject(data.phrases),
    tags: plainObject(data.tags),
    freeText: text(data.freeText, MAX_FREE_TEXT),
    seed: Number.isFinite(data.seed) ? data.seed : 0,
    wateredDays: []
  };
  state.nextPlantId += 1;
  state.plants.push(plant);
  saveNow();
  return plant;
}

/**
 * Remember what was just planted, so the gardener has something to call back to.
 * @param {Object} plant A plant from addPlant.
 * @returns {string} The memory hint that was stored, empty when there is none.
 */
export function recordPlanting(plant) {
  if (!isPlant(plant)) {
    return '';
  }
  const phrases = plainObject(plant.phrases);
  const parts = [text(phrases.object), text(phrases.who)];
  // Reads inside a sentence, which is the only way a bank line can use it:
  // "the kopitiam cup with your mother" drops straight into her greeting.
  const hint = parts.filter(function (part) { return part !== ''; }).join(' ');
  state.player.lastPlantId = plant.id;
  state.player.memoryHint = hint.slice(0, MAX_FREE_TEXT);
  saveNow();
  return state.player.memoryHint;
}

/**
 * Every plant, in planting order. Read only.
 * @returns {Array<Object>}
 */
export function getPlants() {
  return state.plants;
}

/**
 * @param {string} id
 * @returns {Object|null}
 */
export function findPlant(id) {
  if (typeof id !== 'string' || id === '') {
    return null;
  }
  for (let i = 0; i < state.plants.length; i += 1) {
    if (state.plants[i].id === id) {
      return state.plants[i];
    }
  }
  return null;
}

/* ---- growth and wilt ----------------------------------------------------
   Both are computed from the calendar every time they are asked for, never
   stored. A plant that is read back after a week away is therefore in the state
   the week actually left it in, with no catch up pass to get wrong. */

/**
 * Growth stage: one per distinct watered day, capped.
 * @param {Object} plant
 * @returns {number} 0, 1 or 2.
 */
export function plantStage(plant) {
  if (!isPlant(plant)) {
    return 0;
  }
  const days = Array.isArray(plant.wateredDays) ? plant.wateredDays.length : 0;
  return days > MAX_STAGE ? MAX_STAGE : days;
}

// The later of the planting day and the last watering. ISO days compare
// correctly as plain strings, so this needs no date maths at all.
function lastTendedDay(plant) {
  let latest = isoDay(plant.plantedDay);
  const days = Array.isArray(plant.wateredDays) ? plant.wateredDays : [];
  for (let i = 0; i < days.length; i += 1) {
    const day = isoDay(days[i]);
    if (day > latest) {
      latest = day;
    }
  }
  return latest;
}

/**
 * True when the plant has been dry for two whole days or more. Never true on the
 * day it was planted, and never true when the clock has been moved backwards.
 * @param {Object} plant
 * @returns {boolean}
 */
export function isWilted(plant) {
  if (!isPlant(plant)) {
    return false;
  }
  // Signed on purpose: daysBetween is order safe, and an order safe gap would
  // read a clock wound back to last week as a week of neglect.
  const tended = dayNumber(lastTendedDay(plant));
  const today = dayNumber(todayISO());
  if (tended === null || today === null) {
    return false;
  }
  return today - tended >= ABSENCE_DAYS;
}

/**
 * Water a plant for today. Watering twice in one day is not an error, it just
 * does not count twice, and the caller is told so it can answer kindly.
 * @param {string} id
 * @returns {{alreadyToday: boolean, advanced: boolean, recovered: boolean, stage: number}}
 */
export function waterPlant(id) {
  const plant = findPlant(id);
  if (plant === null) {
    return { alreadyToday: false, advanced: false, recovered: false, stage: 0 };
  }
  const today = todayISO();
  if (plant.wateredDays.indexOf(today) !== -1) {
    return { alreadyToday: true, advanced: false, recovered: false, stage: plantStage(plant) };
  }
  const before = plantStage(plant);
  const wasWilted = isWilted(plant);
  plant.wateredDays.push(today);
  saveNow();
  const after = plantStage(plant);
  return {
    alreadyToday: false,
    advanced: after > before,
    // Recovery is total. Coming back is the whole ask, and the game never keeps
    // a record of how long it took.
    recovered: wasWilted,
    stage: after
  };
}

/* ---- player ------------------------------------------------------------- */

/**
 * The player record. Read only.
 * @returns {Object}
 */
export function getPlayer() {
  return state.player;
}

/**
 * Set what the gardener calls the player. Both parts are optional, and an empty
 * name is a valid answer: nobody has to tell her anything.
 * @param {string} name
 * @param {string} honorific For example "Auntie" or "Uncle".
 * @returns {Object} The player record.
 */
export function setPlayerName(name, honorific) {
  state.player.name = text(name, MAX_NAME);
  state.player.honorific = text(honorific, MAX_HONORIFIC);
  saveNow();
  return state.player;
}

/* ---- coins --------------------------------------------------------------
   One currency, earned at a fixed rate, spent at printed prices. There is no
   second currency, no top up and no chance anywhere in here, which is the point:
   a game aimed at seniors must never contain a mechanism a regulator would
   recognise as a compulsion loop. */

/**
 * @returns {number} Coins in hand.
 */
export function getCoins() {
  return state.coins;
}

/**
 * Pay the player. The amount is the caller's fixed constant, never a roll.
 * @param {number} amount Whole coins. Anything else is ignored.
 * @returns {number} The new balance.
 */
export function addCoins(amount) {
  const gain = wholeCount(amount);
  if (gain === 0) {
    return state.coins;
  }
  state.coins += gain;
  saveNow();
  return state.coins;
}

/**
 * Take coins for a purchase. Refuses rather than going negative, and refuses an
 * amount that is not a whole positive number, so a malformed price can never
 * hand out something for nothing.
 * @param {number} amount
 * @returns {boolean} True only when the coins actually left the purse.
 */
export function spendCoins(amount) {
  const cost = wholeCount(amount);
  if (cost === 0 || state.coins < cost) {
    return false;
  }
  state.coins -= cost;
  saveNow();
  return true;
}

/**
 * @returns {{days: number, lastCountedDay: string}} Days shown up, never reset.
 */
export function getStreak() {
  return state.streak;
}

/* ---- seeds and crops ---------------------------------------------------- */

/**
 * @returns {Object.<string, number>} Seed packets by crop id. Read only.
 */
export function getSeeds() {
  return state.seeds;
}

/**
 * Put a seed packet in the drawer, however it was come by.
 * @param {string} cropId
 * @returns {number} How many of that seed the player now holds.
 */
export function grantSeed(cropId) {
  const id = text(cropId, MAX_CROP_ID);
  if (id === '') {
    return 0;
  }
  state.seeds[id] = (state.seeds[id] || 0) + 1;
  saveNow();
  return state.seeds[id];
}

/**
 * Put a held seed in the ground. Refuses when the drawer is empty, so the only
 * way to a crop plot is through a seed that was earned or bought.
 * @param {string} cropId
 * @returns {Object|null} The planted crop, or null when there was no seed.
 */
export function plantSeed(cropId) {
  const id = text(cropId, MAX_CROP_ID);
  if (id === '' || !(state.seeds[id] > 0)) {
    return null;
  }
  state.seeds[id] -= 1;
  if (state.seeds[id] === 0) {
    delete state.seeds[id];
  }
  const plant = {
    id: PLANT_ID_PREFIX + String(state.nextPlantId),
    kind: 'crop',
    plantedDay: todayISO(),
    objectId: '',
    cropId: id,
    answers: {},
    phrases: {},
    tags: {},
    freeText: '',
    seed: 0,
    wateredDays: []
  };
  state.nextPlantId += 1;
  state.plants.push(plant);
  saveNow();
  return plant;
}

/**
 * @returns {Object.<string, number>} Harvested crops by id. Read only.
 */
export function getBasket() {
  return state.basket;
}

/**
 * Pick a fully grown crop. The plot goes back to bare soil, ready for the next
 * thing, and the crop goes in the basket.
 * @param {string} plantId
 * @returns {string|null} The crop id that was picked, or null when the plant is
 *   not a crop, is not there, or is not ready yet.
 */
export function harvestCrop(plantId) {
  const plant = findPlant(plantId);
  if (plant === null || plant.kind !== 'crop' || plant.cropId === '') {
    return null;
  }
  if (plantStage(plant) < MAX_STAGE) {
    return null;
  }
  const cropId = plant.cropId;
  state.basket[cropId] = (state.basket[cropId] || 0) + 1;
  const index = state.plants.indexOf(plant);
  if (index !== -1) {
    state.plants.splice(index, 1);
  }
  saveNow();
  return cropId;
}

/**
 * Whether today's free seed is still there to take.
 * @returns {boolean}
 */
export function canClaimFreeSeed() {
  return state.freeSeed.lastClaimDay !== todayISO();
}

/**
 * Take the one free seed of the day. Common tier only, so the free packet can
 * never be the fast route to the rare shelf, and once a day, judged by the same
 * clock as everything else.
 * @param {string} cropId
 * @returns {boolean} True when a seed was actually granted.
 */
export function claimFreeSeed(cropId) {
  const id = text(cropId, MAX_CROP_ID);
  const crop = plainObject(catalogue.crops)[id];
  if (id === '' || crop === undefined || plainObject(crop).price_tier !== FREE_SEED_TIER) {
    return false;
  }
  if (!canClaimFreeSeed()) {
    return false;
  }
  state.freeSeed.lastClaimDay = todayISO();
  grantSeed(id);
  saveNow();
  return true;
}

/* ---- meals -------------------------------------------------------------- */

/**
 * @returns {Array<string>} Dish ids already unlocked. Read only.
 */
export function getUnlockedMeals() {
  return state.meals.unlocked;
}

/**
 * Check the basket against every dish and unlock whatever it now completes.
 *
 * The crops are consumed, deliberately: a dish is an arc that the ingredients
 * are spent on, and the card it leaves behind is permanent. Dishes are checked
 * in file order, so a crop that two dishes want goes to the first one that is
 * otherwise complete rather than to both.
 *
 * @returns {Array<{id: string, name: string}>} Dishes unlocked by this call,
 *   empty when nothing completed. A dish already unlocked never appears again.
 */
export function mealUnlockCheck() {
  const unlocked = [];
  for (let i = 0; i < catalogue.dishes.length; i += 1) {
    const dish = catalogue.dishes[i];
    if (state.meals.unlocked.indexOf(dish.id) !== -1) {
      continue;
    }
    let complete = true;
    for (let j = 0; j < dish.crops.length; j += 1) {
      if (!(state.basket[dish.crops[j]] > 0)) {
        complete = false;
        break;
      }
    }
    if (!complete) {
      continue;
    }
    for (let j = 0; j < dish.crops.length; j += 1) {
      const cropId = dish.crops[j];
      state.basket[cropId] -= 1;
      if (state.basket[cropId] === 0) {
        delete state.basket[cropId];
      }
    }
    state.meals.unlocked.push(dish.id);
    unlocked.push({ id: dish.id, name: dish.name });
  }
  if (unlocked.length > 0) {
    saveNow();
  }
  return unlocked;
}
