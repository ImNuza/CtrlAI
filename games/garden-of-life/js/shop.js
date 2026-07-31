/*
  Garden of Life seed shop.

  Two things live on this screen: the free seed Auntie Bee puts out every day,
  and her table of ten seed packets. Everything this file knows about money it
  asks state for, and everything it knows about a crop it asks the composer for,
  so the only numbers written down here are the three the stretch plan fixed.

  Nothing on this screen tells anybody off. A packet you cannot afford yet
  answers with its price and what you have so far, a free seed already taken
  says when the next one arrives, and a rare packet still on its way says which
  streak brings it. There is no wrong tap here.

  Every id is queried lazily inside initShop, so the module loads clean long
  before the section html exists and answers 0 when it is not there yet.
*/

import { composeCrop } from './composer.js';

/* The namespace form on purpose, not the named imports the rest of the game
   uses. This file and the economy half of state were written in parallel, and a
   named import of a function that is not there fails the whole module graph at
   parse time, which takes the garden down rather than just the shop. Every call
   below is guarded, so a renamed or missing function costs a calm refusal on one
   card instead of the game. */
import * as state from './state.js';

/* ---- the closed set -----------------------------------------------------
   The ten crops in plant-traits.json order, which SCHEMAS.md fixes as a closed
   set. Order is load bearing twice: the table lists in it, and the rare unlocks
   walk it. Labels, palettes and tiers all come from the bank through the
   composer; only the order lives here. */

const CROP_IDS = [
  'bayam',
  'kangkung',
  'chye-sim',
  'chilli',
  'tomato',
  'calamansi',
  'pandan',
  'ginger',
  'long-bean',
  'sweet-potato-leaf'
];

/* Stretch plan, binding, and the guardrail is satisfied by construction: one
   puzzle round pays 6, so a common packet is always one round away. */
const PRICE_COMMON = 4;
const PRICE_UNCOMMON = 8;
const PRICE_RARE = 12;

// Rare crops open in file order on these streaks. Anything past the list waits
// for the last one rather than becoming unreachable.
const RARE_STREAKS = [3, 7, 14];

// Grown up art on every packet. A shop full of sprouts tells you nothing about
// what you are buying.
const SHOP_STAGE = 2;

/* ---- copy ---------------------------------------------------------------
   Read every one of these out loud. None of them may sound like a telling off,
   and every refusal has to leave the player somewhere to go. */

const FREE_LEAD = 'A free seed every day. Pick the one you want.';
const FREE_TAKEN_LEAD = 'You have taken today\'s free seed. The next one is here tomorrow.';
const FREE_ALREADY = 'Today\'s free seed is in your packet already. Another one tomorrow.';
const GRID_WAITING = 'Auntie Bee is still laying out her seed packets. Come back in a moment.';
const TABLE_NOT_READY = 'The seed table is not quite open yet. Come back in a moment.';
const PLANT_LABEL = 'Plant it now';

function coinWord(amount) {
  return amount === 1 ? ' coin' : ' coins';
}

function priceText(amount) {
  return amount + coinWord(amount);
}

// Names the price, says where the player stands, and stops there. No maths
// about how many rounds it would take, because that reads like homework.
function cannotAffordLine(label, price, coins) {
  const have = coins === 0 ? 'none yet' : String(coins);
  return label + ' is ' + priceText(price) + '. You have ' + have + ' so far, no rush.';
}

function boughtLine(label) {
  return label + ' seed is yours. Plant it now, or keep it for later.';
}

function claimedLine(label) {
  return label + ' seed is in your packet now.';
}

/* ---- module state --------------------------------------------------------
   Every node starts as a stated null rather than a field that is simply not
   there, so the guards below read the same before init, after an init that
   found no section, and under plain node. refreshShopCoins is called by glue
   that has no idea whether this screen was ever built. */

const el = { coins: null, free: null, grid: null, back: null };

let views = null;
let onPlacement = null;
let bound = false;
let watching = false;

// The crops that actually resolved against the live traits file, in file order,
// rebuilt on every full render. Everything downstream reads this rather than
// the bank, so a half written bank simply means a shorter table.
let entries = [];
const cardNodes = new Map();

/* Which seed came out of today's free packet, for as long as this page is open.
   state only remembers the day, which is all it needs to guard the claim, so
   naming the seed is this screen's job and only while the player is on it. */
let freeClaimed = '';

/* ---- small helpers ------------------------------------------------------- */

function byId(id) {
  return document.getElementById(id);
}

function on(node, type, handler) {
  if (node !== null && node !== undefined) {
    node.addEventListener(type, handler);
  }
}

/* ---- reading state -------------------------------------------------------
   Storage is a file a curious person can edit and half of these fields arrive
   with the v2 migration, so nothing below trusts a shape. A number that is not
   there reads as zero, which is a true answer for a fresh player anyway. */

function readState() {
  try {
    const doc = state.getState();
    return doc === null || typeof doc !== 'object' ? {} : doc;
  } catch (error) {
    return {};
  }
}

function wholeNumber(value) {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

// The reader state offers when it has one, the document underneath when it does
// not. Two lines each, and the shop cannot be broken by either seat renaming an
// accessor while the other is mid file.
function coinsNow() {
  try {
    if (typeof state.getCoins === 'function') {
      return wholeNumber(state.getCoins());
    }
  } catch (error) {
    return 0;
  }
  return wholeNumber(readState().coins);
}

function streakDays() {
  let streak = null;
  try {
    streak = typeof state.getStreak === 'function' ? state.getStreak() : null;
  } catch (error) {
    return 0;
  }
  if (streak === null || typeof streak !== 'object') {
    const doc = readState();
    streak = doc.streak === null || typeof doc.streak !== 'object' ? {} : doc.streak;
  }
  return wholeNumber(streak.days);
}

function seedsHeld(cropId) {
  let seeds = null;
  try {
    seeds = typeof state.getSeeds === 'function' ? state.getSeeds() : null;
  } catch (error) {
    return 0;
  }
  if (seeds === null || typeof seeds !== 'object') {
    const doc = readState();
    seeds = doc.seeds === null || typeof doc.seeds !== 'object' ? {} : doc.seeds;
  }
  return wholeNumber(seeds[cropId]);
}

function todayOrEmpty() {
  try {
    const day = state.todayISO();
    return typeof day === 'string' ? day : '';
  } catch (error) {
    return '';
  }
}

function freeTakenToday() {
  try {
    if (typeof state.canClaimFreeSeed === 'function') {
      return state.canClaimFreeSeed() === false;
    }
  } catch (error) {
    return false;
  }
  const doc = readState();
  const free = doc.freeSeed === null || typeof doc.freeSeed !== 'object' ? {} : doc.freeSeed;
  const day = todayOrEmpty();
  return day !== '' && free.lastClaimDay === day;
}

/**
 * How this screen reads an answer from state.
 *
 * A write that came back false, null or undefined was a refusal and nothing
 * happened. Anything else is a yes, including a record, which is checked for the
 * three ways a record says no. Written this way so the shop works against a
 * state that answers in booleans and against one that answers in records,
 * without either seat having to wait on the other.
 *
 * @param {*} result Whatever spendCoins, grantSeed or claimFreeSeed returned.
 * @returns {boolean} True when the write went through.
 */
export function writeAccepted(result) {
  if (result === false || result === null || result === undefined) {
    return false;
  }
  if (typeof result === 'object') {
    return result.ok !== false && result.claimed !== false && result.alreadyToday !== true;
  }
  return true;
}

/* ---- prices and locks ---------------------------------------------------- */

/**
 * What a packet of this tier costs. Common 4, uncommon 8, rare 12, straight from
 * the stretch plan. An unreadable tier is charged as a common, because the one
 * thing this must never do is overcharge on a guess.
 * @param {string} tier common, uncommon or rare.
 * @returns {number} Coins.
 */
export function priceForTier(tier) {
  if (tier === 'rare') {
    return PRICE_RARE;
  }
  if (tier === 'uncommon') {
    return PRICE_UNCOMMON;
  }
  return PRICE_COMMON;
}

/**
 * The streak that opens the nth rare crop, counting rares in traits file order.
 * Three thresholds, and anything past them waits for the last one rather than
 * being unreachable.
 * @param {number} rareIndex 0 for the first rare crop in the file.
 * @returns {number} Streak days.
 */
export function rareUnlockStreak(rareIndex) {
  const index = wholeNumber(rareIndex);
  return index < RARE_STREAKS.length
    ? RARE_STREAKS[index]
    : RARE_STREAKS[RARE_STREAKS.length - 1];
}

/**
 * How a packet that is still on its way says so. Kind, specific, and it names
 * the thing the player already has going rather than the thing they lack.
 * @param {number} days The streak that opens it.
 * @returns {string}
 */
export function lockLabel(days) {
  return 'Comes with your ' + days + ' day streak';
}

/* Ten compose calls per render, which is the same trick garden-view uses for a
   species name: the label, the tier and the picture then always agree, because
   they all came out of the same call. A crop the bank cannot resolve answers
   with the composer's default crop, so an entry is only kept when the answer is
   about the crop that was asked for. */
function readCrop(cropId, rareIndex) {
  const built = composeCrop({ cropId: cropId, stage: SHOP_STAGE });
  const traits = built === null || typeof built !== 'object' || built.traits === null ||
    typeof built.traits !== 'object' ? {} : built.traits;
  if (traits.crop !== cropId || typeof traits.cropLabel !== 'string' || traits.cropLabel === '') {
    return null;
  }
  const tier = traits.priceTier;
  const unlockAt = tier === 'rare' ? rareUnlockStreak(rareIndex) : 0;
  return {
    id: cropId,
    label: traits.cropLabel,
    tier: tier,
    price: priceForTier(tier),
    unlockAt: unlockAt,
    svg: built.svg
  };
}

function readCrops() {
  const list = [];
  let rareIndex = 0;
  for (let i = 0; i < CROP_IDS.length; i += 1) {
    const entry = readCrop(CROP_IDS[i], rareIndex);
    if (entry === null) {
      continue;
    }
    if (entry.tier === 'rare') {
      rareIndex += 1;
    }
    list.push(entry);
  }
  return list;
}

function entryFor(cropId) {
  for (let i = 0; i < entries.length; i += 1) {
    if (entries[i].id === cropId) {
      return entries[i];
    }
  }
  return null;
}

function isLocked(entry) {
  return entry.unlockAt > 0 && streakDays() < entry.unlockAt;
}

/* ---- building nodes ------------------------------------------------------ */

function para(className, text) {
  const node = document.createElement('p');
  node.className = className;
  node.textContent = text === undefined ? '' : text;
  return node;
}

function button(className, label) {
  const node = document.createElement('button');
  node.type = 'button';
  node.className = className;
  node.textContent = label;
  return node;
}

/* The composer's svg carries its own role and label, which is the right answer
   in a plot where the drawing is the whole plant. On a card the words underneath
   already say the name and the price, so the picture is decoration and the
   wrapper hides it from the reader rather than saying everything twice.

   No sizing here. garden.css sizes .shop-card svg, and an inline width would
   only take that decision away from the seat that owns it. */
function artNode(svg) {
  const box = document.createElement('div');
  box.className = 'shop-art';
  box.setAttribute('aria-hidden', 'true');
  box.innerHTML = svg;
  return box;
}

function cropCard(entry) {
  const locked = isLocked(entry);
  const card = document.createElement('div');
  card.className = 'card shop-card' + (locked ? ' is-locked' : '');
  card.dataset.cropId = entry.id;
  card.dataset.tier = entry.tier;
  card.dataset.locked = locked ? 'true' : 'false';
  card.setAttribute('role', 'group');
  card.setAttribute('aria-label', entry.label + ', ' + priceText(entry.price) +
    (locked ? ', ' + lockLabel(entry.unlockAt).toLowerCase() : ''));

  card.appendChild(artNode(entry.svg));
  card.appendChild(para('shop-name', entry.label));
  card.appendChild(para('shop-price', priceText(entry.price)));

  if (locked) {
    // A locked packet keeps its picture and its price. It is a preview of
    // something coming, not a door with nothing behind it.
    card.appendChild(para('shop-lock', lockLabel(entry.unlockAt)));
    return card;
  }

  const buy = button('btn btn-block shop-buy', 'Buy for ' + priceText(entry.price));
  buy.dataset.cropId = entry.id;
  buy.setAttribute('aria-label', 'Buy ' + entry.label + ' seed for ' + priceText(entry.price));
  card.appendChild(buy);

  const packet = para('shop-packet muted', '');
  packet.hidden = true;
  card.appendChild(packet);

  /* Shown whenever the player holds one of these, not only in the moment after
     a purchase. A seed bought yesterday would otherwise sit in the packet with
     nowhere to go, and this screen is the only way into the ground. */
  const plant = button('btn btn-quiet btn-block shop-plant', PLANT_LABEL);
  plant.dataset.cropId = entry.id;
  plant.setAttribute('aria-label', 'Plant ' + entry.label + ' now');
  plant.hidden = true;
  card.appendChild(plant);

  /* Every answer this card gives lands here, and the node is built once and
     kept, so the reader is told about it before anything is written into it. */
  const note = para('shop-note', '');
  note.setAttribute('role', 'status');
  card.appendChild(note);

  return card;
}

function findIn(card, selector) {
  return card === null || card === undefined ? null : card.querySelector(selector);
}

// Reads state and paints one card from it. Called after a purchase, so a buy
// never rebuilds the grid and never pulls the focus out from under a finger.
function paintCard(entry) {
  const card = cardNodes.get(entry.id);
  if (card === undefined) {
    return;
  }
  const held = seedsHeld(entry.id);
  const packet = findIn(card, '.shop-packet');
  const plant = findIn(card, '.shop-plant');
  if (packet !== null) {
    packet.textContent = held > 0 ? 'In your packet: ' + held : '';
    packet.hidden = held === 0;
  }
  if (plant !== null) {
    plant.hidden = held === 0;
  }
}

function setNote(cropId, text) {
  const note = findIn(cardNodes.get(cropId), '.shop-note');
  if (note !== null) {
    note.textContent = text;
  }
}

/* ---- the free packet ----------------------------------------------------- */

function commonEntries() {
  const list = [];
  for (let i = 0; i < entries.length; i += 1) {
    if (entries[i].tier === 'common') {
      list.push(entries[i]);
    }
  }
  return list;
}

/* Built once per full render and painted after, so the line that answers a tap
   is a node the reader already knows about rather than one that appeared with
   the answer already inside it. */
function renderFree() {
  if (el.free === null) {
    return;
  }
  const commons = commonEntries();
  if (commons.length === 0) {
    el.free.replaceChildren();
    el.free.hidden = true;
    return;
  }
  el.free.hidden = false;

  const lead = para('shop-free-lead', FREE_LEAD);
  const picks = document.createElement('div');
  picks.className = 'row shop-free-picks';
  for (let i = 0; i < commons.length; i += 1) {
    const chip = button('chip shop-free-pick', commons[i].label);
    chip.dataset.cropId = commons[i].id;
    chip.setAttribute('aria-label', 'Take the free ' + commons[i].label + ' seed');
    picks.appendChild(chip);
  }

  const note = para('shop-free-note', '');
  note.setAttribute('role', 'status');

  const plant = button('btn btn-quiet btn-block shop-free-plant', PLANT_LABEL);
  plant.hidden = true;

  el.free.replaceChildren(lead, picks, note, plant);
  paintFree();
}

function paintFree() {
  if (el.free === null) {
    return;
  }
  const taken = freeTakenToday();
  const lead = findIn(el.free, '.shop-free-lead');
  const picks = findIn(el.free, '.shop-free-picks');
  const plant = findIn(el.free, '.shop-free-plant');
  const claimed = freeClaimed === '' ? null : entryFor(freeClaimed);

  if (lead !== null) {
    lead.textContent = taken ? FREE_TAKEN_LEAD : FREE_LEAD;
  }
  if (picks !== null) {
    // Hidden rather than left tappable. Five chips that answer every tap with
    // the same sentence is a screen arguing with the person reading it.
    picks.hidden = taken;
  }
  if (plant !== null) {
    plant.hidden = claimed === null;
    if (claimed !== null) {
      plant.dataset.cropId = claimed.id;
      plant.setAttribute('aria-label', 'Plant ' + claimed.label + ' now');
    }
  }
}

function setFreeNote(text) {
  const note = findIn(el.free, '.shop-free-note');
  if (note !== null) {
    note.textContent = text;
  }
}

/* ---- what the buttons do ------------------------------------------------- */

function buySeed(cropId) {
  const entry = entryFor(cropId);
  if (entry === null || isLocked(entry)) {
    return;
  }
  // Checked together and before a single coin moves. Spending into a state that
  // cannot hand a seed back would take the money for nothing.
  if (typeof state.spendCoins !== 'function' || typeof state.grantSeed !== 'function') {
    setNote(cropId, TABLE_NOT_READY);
    return;
  }

  const coins = coinsNow();
  if (coins < entry.price) {
    setNote(cropId, cannotAffordLine(entry.label, entry.price, coins));
    return;
  }
  if (!writeAccepted(state.spendCoins(entry.price))) {
    // state had the last word and said no. Whatever it saw, the answer to the
    // player is the same one, with the balance it is now sure of.
    setNote(cropId, cannotAffordLine(entry.label, entry.price, coinsNow()));
    return;
  }

  state.grantSeed(cropId);
  setNote(cropId, boughtLine(entry.label));
  paintCard(entry);
  writeCoins();
}

function claimFree(cropId) {
  const entry = entryFor(cropId);
  if (entry === null || entry.tier !== 'common') {
    return;
  }
  if (typeof state.claimFreeSeed !== 'function') {
    setFreeNote(TABLE_NOT_READY);
    return;
  }
  if (freeTakenToday() || !writeAccepted(state.claimFreeSeed(cropId))) {
    setFreeNote(FREE_ALREADY);
    paintFree();
    return;
  }

  freeClaimed = cropId;
  setFreeNote(claimedLine(entry.label));
  paintFree();
  paintCard(entry);
  writeCoins();

  // The chips the tap landed on have just gone, so the focus goes to the thing
  // this moment is actually offering rather than back to the top of the page.
  const plant = findIn(el.free, '.shop-free-plant');
  if (plant !== null && !plant.hidden && typeof plant.focus === 'function') {
    plant.focus({ preventScroll: true });
  }
}

/* The shop's part of planting ends here. Where the seed goes is the garden's
   business, and the glue wires this to its guided placement. */
function plantNow(cropId) {
  const entry = entryFor(cropId);
  if (entry === null) {
    return;
  }
  if (onPlacement !== null) {
    onPlacement(entry.id, entry.label);
  }
  views.show('garden', true);
}

/* ---- rendering ----------------------------------------------------------- */

function writeCoins() {
  if (el.coins === null) {
    return false;
  }
  const amount = coinsNow();
  el.coins.textContent = amount + coinWord(amount);
  return true;
}

function renderGrid() {
  cardNodes.clear();
  if (el.grid === null) {
    return 0;
  }
  if (entries.length === 0) {
    // The same answer the picker gives with no bank: a calm line rather than an
    // empty box that reads as something broken.
    el.grid.replaceChildren(para('muted shop-waiting', GRID_WAITING));
    return 0;
  }
  const nodes = [];
  for (let i = 0; i < entries.length; i += 1) {
    const card = cropCard(entries[i]);
    cardNodes.set(entries[i].id, card);
    nodes.push(card);
  }
  el.grid.replaceChildren.apply(el.grid, nodes);
  for (let i = 0; i < entries.length; i += 1) {
    paintCard(entries[i]);
  }
  return nodes.length;
}

function render() {
  entries = readCrops();
  const count = renderGrid();
  renderFree();
  writeCoins();
  return count;
}

/* ---- wiring -------------------------------------------------------------- */

function cacheElements() {
  // Deliberately not #shop-heading. The section owns its own copy and nothing
  // in here rewrites it. getElementById answers null when a section has not
  // landed, which is the shape every guard here is written to.
  el.coins = byId('shop-coins');
  el.free = byId('shop-free');
  el.grid = byId('shop-grid');
  el.back = byId('shop-back');
}

function tappedCropId(event, container, selector) {
  const target = event.target;
  if (target === null || typeof target.closest !== 'function') {
    return '';
  }
  const node = target.closest(selector);
  if (node === null || !container.contains(node)) {
    return '';
  }
  const id = node.dataset.cropId;
  return typeof id === 'string' ? id : '';
}

function bind() {
  if (bound) {
    return;
  }
  bound = true;

  // Delegated, so a card painted after a purchase is never a dead node with a
  // listener still on it.
  on(el.grid, 'click', function (event) {
    if (views.staleTap(event)) {
      return;
    }
    const buying = tappedCropId(event, el.grid, '.shop-buy');
    if (buying !== '') {
      buySeed(buying);
      return;
    }
    const planting = tappedCropId(event, el.grid, '.shop-plant');
    if (planting !== '') {
      plantNow(planting);
    }
  });

  on(el.free, 'click', function (event) {
    if (views.staleTap(event)) {
      return;
    }
    const picking = tappedCropId(event, el.free, '.shop-free-pick');
    if (picking !== '') {
      claimFree(picking);
      return;
    }
    const planting = tappedCropId(event, el.free, '.shop-free-plant');
    if (planting !== '') {
      plantNow(planting);
    }
  });

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

/* Coins are earned on another screen and the streak turns over on another day,
   so a table drawn once at boot goes stale the first time the player wins a
   round. The screen watches for its own section being unhidden and redraws
   itself rather than depending on glue remembering to ask. refreshShopCoins
   does the same job and the two are safe together: a redraw changes nothing the
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
      render();
    }
  });
  observer.observe(section, { attributes: true, attributeFilter: ['hidden'] });
}

/* ---- exports ------------------------------------------------------------- */

/**
 * Lay out the seed table and wire it up.
 *
 * Every id is looked up here rather than at import time, so this module is safe
 * to load and safe to call before the shop section html exists. With no grid on
 * the page it renders nothing, binds nothing and answers 0, which is also what
 * it does under plain node where there is no document at all.
 *
 * Calling it twice is safe: listeners go on once and the second call is a
 * redraw.
 *
 * @param {Object} options
 * @param {{show: Function, markShown: Function, staleTap: Function}} [options.views]
 *   The view handle from main.js. staleTap(event) guards every tap in here and
 *   show('garden', true) is how a planted seed gets the player home.
 * @param {function(string, string): void} [options.onPlantNow] Handed the crop
 *   id and its label when the player chooses to plant a seed they hold. The
 *   garden's guided placement takes it from there; this file does not plant.
 *   Also accepted as onPlacement, which is what the stretch brief called it.
 * @returns {number} How many seed packets are on the table, 0 when there is no
 *   shop on the page or no crop in the bank that resolved.
 */
export function initShop(options) {
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
  /* Two names for one hook. main.js says onPlantNow and the stretch brief said
     onPlacement, and a seed that cannot reach the ground because two files
     disagreed about a key is not a trade worth making. */
  onPlacement = typeof config.onPlantNow === 'function'
    ? config.onPlantNow
    : (typeof config.onPlacement === 'function' ? config.onPlacement : null);

  cacheElements();
  if (el.grid === null) {
    return 0;
  }

  bind();
  watchForOpening();
  return render();
}

/**
 * Redraw the shop from state.
 *
 * More than the coin readout, on purpose: coins, the streak that opens a rare
 * packet and the seeds already in hand can all have moved somewhere else since
 * the player last stood here, so the glue calling this when it brings the shop
 * on screen gets a table that is true. The cards are rebuilt, so an answer left
 * on one from an earlier visit goes with them.
 *
 * @returns {boolean} True when there was a shop on the page to redraw.
 */
export function refreshShopCoins() {
  if (el.grid === null) {
    return false;
  }
  render();
  return true;
}
