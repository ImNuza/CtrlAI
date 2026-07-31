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
const STATE_VERSION = 1;

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

let state = emptyState();

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
    plants: []
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
    answers: plainObject(raw.answers),
    phrases: plainObject(raw.phrases),
    tags: plainObject(raw.tags),
    freeText: text(raw.freeText, MAX_FREE_TEXT),
    seed: Number.isFinite(raw.seed) ? raw.seed : 0,
    wateredDays: watered
  };
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
  state = {
    version: STATE_VERSION,
    player: cleanPlayer(raw.player),
    nextPlantId: nextIdFor(raw.nextPlantId, plants),
    plants: plants
  };
  return state;
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
  saveNow();

  return { kind: kind, daysAway: daysAway };
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
