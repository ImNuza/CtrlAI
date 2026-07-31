/*
  Garden of Life photo quest. The one screen that sends the player outside.

  She photographs something growing near her block, the classifier has a guess,
  and whichever way the guess lands she comes home with coins and a seed. Two
  rules shape every line in this file.

  The first is privacy, and it is not negotiable. The photo never leaves the
  phone and is never kept. Nothing in here reads the bytes, draws them, previews
  them, makes a data URL or an object URL out of them, or lets anything derived
  from the picture near state or the DOM. The File goes straight to
  aiClassifyPhoto and nowhere else, and the input is emptied the moment the
  reference is taken. What reaches the screen is a plant name out of a closed set
  of eight, and nothing else. There is no object URL created anywhere below, so
  there is never one to revoke.

  The second is honesty. Tonight the classifier is canned: it does not look at
  the photo at all, it returns a plausible Singapore garden plant. So the guess
  is offered as a guess, with a way to correct it that is exactly as big as the
  way to agree with it. Nothing on this screen claims to have seen anything.

  Every id is queried lazily inside initPhotoQuest, so this module loads clean
  long before the section html exists and answers 0 when it is not there yet.
  Granting the coins and the seed, marking the day and Auntie Bee's reaction all
  belong to the glue. This file classifies, presents, and hands back a result.
*/

import { aiClassifyPhoto, photoFindChoices } from '../../../shared/ai.js';

/* The namespace form on purpose, the way the shop does it. This file and the
   photo half of state were written in parallel, and a named import of something
   that has not landed yet fails the whole module graph at parse time, which
   takes the garden down rather than just this screen. Every call below is
   guarded, and the one field it reads (photo.lastQuestDay) is frozen by the
   plan, so a getter being renamed on the other seat costs nothing here. */
import * as state from './state.js';

const GAME = 'garden-of-life';

// Ids off a content file end up in dataset values and comparisons, so only ids
// this game could have written are allowed through.
const SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/;

const COMMON_TIER = 'common';

/* The grant is the glue's, fixed by ruling: 3 coins plus one common seed of the
   player's choosing. The number lives here only so the reward line can say it
   out loud, and it is written once. */
const PHOTO_COINS = 3;

/* ---- copy ---------------------------------------------------------------
   Read every one of these out loud. Nothing here tells anybody off, nothing
   claims certainty, and every state the screen can be in has a line that leaves
   the player somewhere to go. */

// Verbatim from the plan, and never hidden while this screen is up.
const PRIVACY_LINE = 'The photo stays on your phone.';

const OPEN_LABEL = 'Take a photo';
const OPEN_ARIA = 'Take a photo of a plant outside';
const CANCELLED = 'No photo this time. Tap the button whenever you are ready.';
const THINKING = 'Let me have a look at this one.';
const CAMERA_NOT_READY = 'The camera is not ready yet. Give it a moment and tap again.';
const UNSURE = 'I cannot tell from this one. Which plant did you find?';
const PICKER_LEAD = 'No problem. Which one did you find?';
const YES_LABEL = 'Yes, that is it';
const OTHER_LABEL = 'Something else';
const PICKER_GROUP_LABEL = 'Choose the plant you found';
const SEED_GROUP_LABEL = 'Choose a seed to take home';
const DONE_LABEL = 'Take it to the garden';
const SEED_NUDGE = 'Pick a seed first, then we take it to the garden.';
const NO_SEEDS = 'The seed packets are not out yet. Take the coins for now.';
const DONE_TODAY = 'One photo a day is plenty. Bring me another tomorrow.';

function coinWord(amount) {
  return amount === 1 ? ' coin' : ' coins';
}

/* "a Orchid" is the kind of small wrongness that makes a screen feel machine
   made, and one of the eight finds starts with a vowel. The two halves the
   wording contract cares about, "I think it looks like" and "Am I right?", are
   untouched. */
function article(label) {
  const first = typeof label === 'string' ? label.charAt(0).toLowerCase() : '';
  return 'aeiou'.indexOf(first) === -1 ? 'a' : 'an';
}

// The guess is a guess and says so twice, once in the verb and once in the
// question. This wording does not change when the classifier changes.
function guessLine(label) {
  return 'I think it looks like ' + article(label) + ' ' + label + '. Am I right?';
}

function rewardLine(label, hasSeeds) {
  const start = label + ' it is. ' + PHOTO_COINS + coinWord(PHOTO_COINS) + ' for you';
  return hasSeeds ? start + ', and pick a seed to plant.' : start + '.';
}

/* ---- module state --------------------------------------------------------
   Every node starts as a stated null rather than a field that is simply not
   there, so the guards below read the same before init, after an init that found
   no section, and under plain node where there is no document at all. */

const el = {
  section: null,
  privacy: null,
  open: null,
  input: null,
  guess: null,
  guessLine: null,
  yes: null,
  other: null,
  answers: null,
  picker: null,
  choices: null,
  reward: null,
  rewardLine: null,
  seedChips: null,
  done: null,
  back: null,
  note: null,
  nudge: null,
  chipRow: null
};

// True when the section ships its own lead above the find chips, which index.html
// does. Then the flow's own line steps aside rather than asking the same
// question twice, and a section without one still gets a lead.
let pickerHasLead = false;

let views = null;
let onQuestDone = null;

// The eight the canned classifier can name, which is also exactly what the
// manual picker offers. One vocabulary, both paths.
let choices = [];

// The common tier crops the glue handed over, in file order. Empty is a real
// answer and the screen has a calm state for it.
let commons = [];

/* open, thinking, guess, picker, reward. There is no done stage: whether the
   quest is still there to take is a question for state and for this page load,
   asked fresh on every render. */
let stage = 'open';

let noteText = '';
/* Empty on the ordinary path, where the player asked for the list herself.
   It carries a line only when the flow has something to own up to. */
let pickerLead = '';
let chosenFind = null;
let chosenSeed = '';

/* A classify call crosses an await. A second photo chosen inside that window
   takes the token with it, and the answer to the first one is dropped rather
   than painted over the screen the player is looking at now. */
let classifyToken = 0;

/* Repeat quests are the glue's guard, through the day it marks in state. This
   is the belt to that pair of braces: whatever state does, one page load hands
   off one quest. */
let questFinished = false;

let bound = false;
let watching = false;

/* ---- small helpers ------------------------------------------------------- */

function byId(id) {
  if (typeof document === 'undefined' || document === null) {
    return null;
  }
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

function setHidden(node, hidden) {
  if (node !== null && node !== undefined) {
    node.hidden = hidden;
  }
}

function setText(node, value) {
  if (node !== null && node !== undefined) {
    node.textContent = value;
  }
}

// For the two lines this file builds itself. An empty paragraph in a flex column
// still costs a gap, so a line with nothing to say takes itself out of the
// layout rather than pushing the screen around.
function setSpokenText(node, value) {
  if (node === null || node === undefined) {
    return;
  }
  node.textContent = value;
  node.hidden = value === '';
}

// Only when the section shipped the node empty. Copy that is already in the
// html belongs to the seat that wrote it.
function setTextIfEmpty(node, value) {
  if (node !== null && node !== undefined && trimmed(node.textContent) === '') {
    node.textContent = value;
  }
}

function setLabelIfMissing(node, value) {
  if (node !== null && node !== undefined && !node.hasAttribute('aria-label')) {
    node.setAttribute('aria-label', value);
  }
}

function moveFocusTo(node) {
  if (node !== null && node !== undefined && typeof node.focus === 'function') {
    node.focus();
  }
}

/* ---- reading state -------------------------------------------------------
   Storage is a file a curious person can edit and the photo block arrives with
   another seat's work, so nothing below trusts a shape. */

function readState() {
  try {
    const doc = typeof state.getState === 'function' ? state.getState() : null;
    return doc === null || typeof doc !== 'object' ? {} : doc;
  } catch (error) {
    return {};
  }
}

function todayOrEmpty() {
  try {
    const day = typeof state.todayISO === 'function' ? state.todayISO() : '';
    return typeof day === 'string' ? day : '';
  } catch (error) {
    return '';
  }
}

/* ---- the closed set ------------------------------------------------------ */

function readChoices() {
  let list = [];
  try {
    list = photoFindChoices();
  } catch (error) {
    return [];
  }
  const out = [];
  const source = Array.isArray(list) ? list : [];
  for (let i = 0; i < source.length; i += 1) {
    const raw = source[i] === null || typeof source[i] !== 'object' ? {} : source[i];
    const id = trimmed(raw.id);
    if (id === '' || !SAFE_ID.test(id)) {
      continue;
    }
    const label = trimmed(raw.label);
    out.push({ id: id, label: label === '' ? id : label });
  }
  return out;
}

function choiceById(id) {
  for (let i = 0; i < choices.length; i += 1) {
    if (choices[i].id === id) {
      return choices[i];
    }
  }
  return null;
}

/* The label comes off the closed set rather than off the answer, so the guess
   and the manual picker can never name the same plant two different ways. An id
   this game does not know about is not a find at all, and the screen says so
   instead of inventing one. */
function readFound(answer) {
  const data = answer === null || typeof answer !== 'object' ? {} : answer;
  const found = data.found === null || typeof data.found !== 'object' ? {} : data.found;
  return choiceById(trimmed(found.id));
}

/* ---- the seed choice -----------------------------------------------------
   The crops arrive through init from the glue, which already has the traits
   file and already knows what a walk is worth. Nothing in here fetches, so a
   bank that never landed costs the seed chips and nothing else.

   Both shapes the glue might send are read the same way: the raw traits map,
   where every crop carries its price_tier, and a list main.js has already
   filtered, which carries the tier as well so this side can check it again.
   Tiers are honoured wherever they appear. A list with no tier on it anywhere
   has already been ruled on by whoever built it and is taken as it stands,
   because the alternative is a screen that silently offers nothing. */

function readSeedList(input) {
  if (input === null || input === undefined) {
    return [];
  }
  // The whole traits file is accepted as well as the crops map inside it.
  let source = input;
  if (!Array.isArray(source) && typeof source === 'object' &&
      source.crops !== null && typeof source.crops === 'object') {
    source = source.crops;
  }
  if (typeof source !== 'object' || source === null) {
    return [];
  }

  const pairs = [];
  if (Array.isArray(source)) {
    for (let i = 0; i < source.length; i += 1) {
      const raw = source[i] === null || typeof source[i] !== 'object' ? {} : source[i];
      pairs.push({ id: trimmed(raw.id), raw: raw });
    }
  } else {
    const keys = Object.keys(source);
    for (let i = 0; i < keys.length; i += 1) {
      const raw = source[keys[i]] === null || typeof source[keys[i]] !== 'object'
        ? {} : source[keys[i]];
      pairs.push({ id: trimmed(keys[i]), raw: raw });
    }
  }

  /* Decided across the whole list rather than record by record, so one crop
     that lost its tier in a hand edit cannot smuggle itself onto a screen that
     is otherwise filtering, and a list that never had tiers is not thrown away
     one entry at a time. */
  let tiered = false;
  for (let i = 0; i < pairs.length; i += 1) {
    if (tierOf(pairs[i].raw) !== '') {
      tiered = true;
      break;
    }
  }

  const out = [];
  for (let i = 0; i < pairs.length; i += 1) {
    const id = pairs[i].id;
    if (id === '' || !SAFE_ID.test(id)) {
      continue;
    }
    if (tiered && tierOf(pairs[i].raw) !== COMMON_TIER) {
      continue;
    }
    const label = trimmed(pairs[i].raw.label);
    out.push({ id: id, label: label === '' ? id : label });
  }
  return out;
}

// price_tier is what the traits file writes, tier is accepted because a list
// handed over by hand may say it the short way.
function tierOf(raw) {
  const named = trimmed(raw.price_tier);
  return named === '' ? trimmed(raw.tier) : named;
}

function commonById(id) {
  for (let i = 0; i < commons.length; i += 1) {
    if (commons[i].id === id) {
      return commons[i];
    }
  }
  return null;
}

/* ---- building nodes ------------------------------------------------------ */

function chipNode(className, label) {
  const node = document.createElement('button');
  node.type = 'button';
  node.className = className;
  node.textContent = label;
  return node;
}

/* The chips go in the section's own grid when it has one and straight into the
   region when it does not, so nothing this file draws can wipe out a lead line
   the html already put there. */
function pickerHome() {
  return el.choices === null ? el.picker : el.choices;
}

function renderPicker() {
  const home = pickerHome();
  if (home === null) {
    return 0;
  }
  home.setAttribute('role', 'group');
  setLabelIfMissing(home, PICKER_GROUP_LABEL);
  const nodes = [];
  for (let i = 0; i < choices.length; i += 1) {
    const chip = chipNode('chip photo-find', choices[i].label);
    chip.dataset.findId = choices[i].id;
    chip.setAttribute('aria-label', 'I found ' + article(choices[i].label) + ' ' + choices[i].label);
    nodes.push(chip);
  }
  home.replaceChildren.apply(home, nodes);
  return nodes.length;
}

// Selection is shown by fill, border and the pressed state, never by colour
// alone, which is what base.css styles .chip.is-selected for.
function paintSeedChoice() {
  if (el.seedChips === null) {
    return;
  }
  const all = el.seedChips.querySelectorAll('.photo-seed');
  for (let i = 0; i < all.length; i += 1) {
    const selected = all[i].dataset.cropId === chosenSeed;
    all[i].setAttribute('aria-pressed', selected ? 'true' : 'false');
    all[i].classList.toggle('is-selected', selected);
  }
}

function renderSeedChips() {
  if (el.seedChips === null) {
    return 0;
  }
  el.seedChips.setAttribute('role', 'group');
  setLabelIfMissing(el.seedChips, SEED_GROUP_LABEL);
  const nodes = [];
  for (let i = 0; i < commons.length; i += 1) {
    const selected = commons[i].id === chosenSeed;
    const chip = chipNode('chip photo-seed' + (selected ? ' is-selected' : ''), commons[i].label);
    chip.dataset.cropId = commons[i].id;
    chip.setAttribute('aria-pressed', selected ? 'true' : 'false');
    chip.setAttribute('aria-label', 'Take a ' + commons[i].label + ' seed');
    nodes.push(chip);
  }
  el.seedChips.replaceChildren.apply(el.seedChips, nodes);
  return nodes.length;
}

/* ---- rendering -----------------------------------------------------------
   One function paints every state this screen can be in, and it is the only
   thing that decides what is on show. Whether the quest is still there to take
   is asked fresh here rather than remembered, so a day rolling over or the glue
   marking the day is picked up on the next paint. */

function questOpen() {
  return !questFinished && questAvailableToday();
}

function showing() {
  if (stage === 'thinking' || stage === 'guess' || stage === 'picker' || stage === 'reward') {
    // A flow already under way is never yanked out from under the player.
    return stage;
  }
  return questOpen() ? 'open' : 'done';
}

function keepPrivacyVisible() {
  if (el.privacy === null) {
    return;
  }
  // Never hidden, at any stage. The one line the player is owed on this screen
  // is the one that says where the photo goes.
  el.privacy.hidden = false;
  setTextIfEmpty(el.privacy, PRIVACY_LINE);
}

/* The flow speaks over the picker only when it has something the section's own
   lead cannot say: that the classifier could not name the plant. A player who
   tapped something else already knows why she is looking at a list. */
function leadAtPicker() {
  if (pickerLead !== '') {
    return pickerLead;
  }
  return pickerHasLead ? '' : PICKER_LEAD;
}

function render(moveFocus) {
  if (el.section === null) {
    return;
  }
  keepPrivacyVisible();
  const at = showing();
  const speaksAtPicker = at === 'picker' && leadAtPicker() !== '';

  setHidden(el.open, at !== 'open');
  setHidden(el.guess, !(at === 'thinking' || at === 'guess' || speaksAtPicker));
  setHidden(el.picker, at !== 'picker');
  setHidden(el.reward, at !== 'reward');
  setHidden(el.yes, at !== 'guess');
  setHidden(el.other, at !== 'guess');
  // The wrapper the section stacks the two answers in, so hiding them does not
  // leave an empty box holding a gap open.
  setHidden(el.answers, at !== 'guess');

  if (at === 'open') {
    setSpokenText(el.note, noteText);
  } else if (at === 'done') {
    setSpokenText(el.note, DONE_TODAY);
  } else {
    setSpokenText(el.note, '');
  }

  if (at === 'thinking') {
    setText(el.guessLine, THINKING);
  } else if (at === 'guess') {
    setText(el.guessLine, chosenFind === null ? UNSURE : guessLine(chosenFind.label));
    if (chosenFind !== null) {
      // The chips carry the guess into the label, so a reader who tabs straight
      // to them is not agreeing with a sentence they never heard.
      if (el.yes !== null) {
        el.yes.setAttribute('aria-label', 'Yes, it is ' +
          article(chosenFind.label) + ' ' + chosenFind.label);
      }
      if (el.other !== null) {
        el.other.setAttribute('aria-label', 'No, it is something else');
      }
    }
  } else if (at === 'picker') {
    setText(el.guessLine, leadAtPicker());
    renderPicker();
  }

  if (at === 'reward') {
    setText(el.rewardLine, chosenFind === null ? '' : rewardLine(chosenFind.label, commons.length > 0));
    renderSeedChips();
    paintDone();
  }

  if (moveFocus) {
    focusStage(at);
  }
}

function focusStage(at) {
  if (at === 'open') {
    moveFocusTo(el.open);
    return;
  }
  if (at === 'guess') {
    moveFocusTo(el.yes);
    return;
  }
  if (at === 'picker' && el.picker !== null) {
    moveFocusTo(el.picker.querySelector('.photo-find'));
    return;
  }
  if (at === 'reward') {
    const first = el.seedChips === null ? null : el.seedChips.querySelector('.photo-seed');
    moveFocusTo(first === null ? el.done : first);
  }
}

/* The not yet state from the memory flow, and deliberately NOT aria-disabled.
   base.css renders .btn[aria-disabled="true"] at 0.55 opacity with pointer
   events off, which is below the contrast floor and swallows the tap in
   silence; its own comment says to prefer this pattern instead. So the button
   stays a live, fully readable button and answers a tap that came too early
   with a line. data-ready is the hook if the section ever wants to style the
   waiting state, and any aria-disabled the html shipped is taken off, because a
   control that answers every tap is not disabled and must never be painted as
   though it were. With no seeds to choose from there is nothing to wait for. */
function paintDone() {
  if (el.done === null) {
    return;
  }
  const waiting = commons.length > 0 && chosenSeed === '';
  el.done.dataset.ready = waiting ? 'false' : 'true';
  el.done.removeAttribute('aria-disabled');
  setTextIfEmpty(el.done, DONE_LABEL);
  setSpokenText(el.nudge, commons.length === 0 ? NO_SEEDS : '');
}

function setNudge(text) {
  setSpokenText(el.nudge, text);
}

/* ---- the flow ------------------------------------------------------------ */

function openCamera() {
  if (el.input === null) {
    noteText = CAMERA_NOT_READY;
    render(false);
    return;
  }
  noteText = '';
  el.input.click();
}

/*
  The privacy critical path, and the whole of it is these few lines.

  The File reference is taken, the input is emptied immediately so the browser
  is holding nothing on this page, and the reference goes to the classifier and
  nowhere else. It is never assigned to module state, never read, never drawn,
  never turned into a URL of any kind.
*/
function onFileChosen() {
  if (el.input === null) {
    return;
  }
  const files = el.input.files;
  const file = files === null || files === undefined || files.length === 0 ? null : files[0];
  el.input.value = '';

  if (file === null) {
    // A dialog closed with nothing chosen. Nobody changed their mind wrongly.
    stage = 'open';
    noteText = CANCELLED;
    render(true);
    return;
  }
  if (!questOpen()) {
    // The day turned over or the glue marked it while the dialog was open.
    stage = 'open';
    render(true);
    return;
  }
  classify(file);
}

async function classify(file) {
  classifyToken += 1;
  const token = classifyToken;
  chosenFind = null;
  stage = 'thinking';
  render(false);

  let answer = null;
  try {
    /*
      ======================= SWAP POINT =======================
      The one call that changes when live vision lands. Tonight
      shared/ai.js answers from a canned closed set and never looks at the
      photo; later this same call reaches a vision model, keeps the same
      signature, and falls back to the canned pick when the network is gone.
      Nothing else in this file moves: the wording is already written for a
      guess, and the manual picker is already the way to correct it.
      ==========================================================
    */
    answer = await aiClassifyPhoto({ game: GAME, photo: file, context: {} });
  } catch (error) {
    // The seam promises never to throw. If a later one does, the player still
    // gets to say what she found.
    answer = null;
  }

  if (token !== classifyToken) {
    return;
  }

  const found = readFound(answer);
  if (found === null) {
    // No pretending. The picker is the honest answer to not knowing.
    pickerLead = UNSURE;
    stage = 'picker';
    render(true);
    return;
  }
  chosenFind = found;
  stage = 'guess';
  render(true);
}

function openPicker() {
  pickerLead = '';
  stage = 'picker';
  render(true);
}

function confirmFind(find) {
  if (find === null) {
    return;
  }
  chosenFind = find;
  chosenSeed = '';
  stage = 'reward';
  render(true);
}

function chooseSeed(cropId) {
  const crop = commonById(cropId);
  if (crop === null) {
    return;
  }
  chosenSeed = crop.id;
  setNudge('');
  // Painted in place rather than rebuilt. A chip that is replaced the instant it
  // is chosen takes the keyboard focus down with it, and the player who pressed
  // Enter on it ends up back at the top of the document.
  paintSeedChoice();
  paintDone();
}

/* Exactly once per page load, whatever the glue does with it. The garden comes
   back even if the hand off throws, because a player who tapped Done has
   finished and must never be left holding a screen. */
function finishQuest() {
  if (questFinished || chosenFind === null) {
    return;
  }
  if (commons.length > 0 && chosenSeed === '') {
    setNudge(SEED_NUDGE);
    return;
  }
  questFinished = true;
  const result = {
    findId: chosenFind.id,
    findLabel: chosenFind.label,
    seedCropId: chosenSeed
  };
  try {
    if (onQuestDone !== null) {
      onQuestDone(result);
    }
  } finally {
    stage = 'open';
    noteText = '';
    views.show('garden', true);
  }
}

/* ---- wiring -------------------------------------------------------------- */

/* The two chips the guess needs. Bound when the section shipped them, built
   when it did not, so this screen works under either reading of the plan and
   the ids stay the frozen ones either way. */
function ensureChip(id, label, className) {
  let node = byId(id);
  if (node !== null || el.guess === null || typeof document === 'undefined') {
    return node;
  }
  node = chipNode(className, label);
  node.id = id;
  chipHome().appendChild(node);
  return node;
}

function chipHome() {
  const sibling = byId('photo-yes') === null ? byId('photo-other') : byId('photo-yes');
  if (sibling !== null && sibling.parentNode !== null) {
    return sibling.parentNode;
  }
  if (el.chipRow === null) {
    el.chipRow = document.createElement('div');
    el.chipRow.className = 'row photo-guess-chips';
    el.guess.appendChild(el.chipRow);
  }
  return el.chipRow;
}

/* The camera door. It belongs in the section html and normally is there; built
   here when it is not, because without it there is no quest at all. Out of the
   tab order on purpose: the big labelled button is the control, and a bare file
   input in the middle of the flow is a trap for anyone driving by keyboard. */
function ensureInput() {
  const found = byId('photo-input');
  if (found !== null || el.section === null || typeof document === 'undefined') {
    return found;
  }
  const node = document.createElement('input');
  node.type = 'file';
  node.id = 'photo-input';
  node.className = 'visually-hidden';
  node.accept = 'image/*';
  node.setAttribute('capture', 'environment');
  node.setAttribute('aria-hidden', 'true');
  node.tabIndex = -1;
  el.section.appendChild(node);
  return node;
}

/* Where this screen says the quiet things: the line after a cancelled dialog,
   and the kind one on a day already spent. It sits where the camera button sits
   so a player looking at the button is looking at the answer. Not called
   photo-note, which is the garden entry's line under the entry button and a
   different sentence in a different section. */
function ensureNote() {
  if (el.section === null || typeof document === 'undefined') {
    return null;
  }
  const node = document.createElement('p');
  node.className = 'photo-quiet muted';
  node.setAttribute('role', 'status');
  node.hidden = true;
  if (el.open !== null && el.open.parentNode !== null) {
    el.open.parentNode.insertBefore(node, el.open);
  } else {
    el.section.appendChild(node);
  }
  return node;
}

function ensureNudge() {
  if (el.reward === null || typeof document === 'undefined') {
    return null;
  }
  const node = document.createElement('p');
  node.className = 'photo-nudge muted';
  node.setAttribute('role', 'status');
  node.hidden = true;
  el.reward.appendChild(node);
  return node;
}

/* The wrapper the section stacks the two answers in. Only reported when both of
   them share it and it is not the whole region, so hiding it can never take the
   guess line down with it. */
function answersWrapper() {
  if (el.yes === null || el.other === null) {
    return null;
  }
  const parent = el.yes.parentNode;
  if (parent === null || parent === undefined || parent !== el.other.parentNode) {
    return null;
  }
  return parent === el.guess || parent === el.section ? null : parent;
}

function cacheElements() {
  el.section = byId('view-photo');
  el.privacy = byId('photo-privacy');
  el.open = byId('photo-open');
  el.guess = byId('photo-guess');
  el.guessLine = byId('photo-guess-line');
  el.picker = byId('photo-picker');
  el.choices = byId('photo-choices');
  el.reward = byId('photo-reward');
  el.rewardLine = byId('photo-reward-line');
  el.seedChips = byId('photo-seed-chips');
  el.done = byId('photo-done');
  el.back = byId('photo-back');

  if (el.section === null) {
    return;
  }
  el.input = ensureInput();
  el.yes = ensureChip('photo-yes', YES_LABEL, 'chip photo-answer');
  el.other = ensureChip('photo-other', OTHER_LABEL, 'chip photo-answer');
  el.answers = answersWrapper();
  if (el.note === null) {
    el.note = ensureNote();
  }
  if (el.nudge === null) {
    el.nudge = ensureNudge();
  }

  /* Asked before a single chip is rendered into it, so what is measured is the
     section's own words and never this file's. */
  pickerHasLead = el.picker !== null && trimmed(el.picker.textContent) !== '';

  /* Reachable by finger through the big button above it and out of the tab
     order, wherever it came from. A visually hidden input left in the sequence
     is an invisible stop with no label on it for anyone driving by keyboard. */
  if (el.input !== null) {
    el.input.tabIndex = -1;
  }

  setTextIfEmpty(el.open, OPEN_LABEL);
  setLabelIfMissing(el.open, OPEN_ARIA);
  setTextIfEmpty(el.yes, YES_LABEL);
  setTextIfEmpty(el.other, OTHER_LABEL);
  setTextIfEmpty(el.done, DONE_LABEL);
  if (el.guessLine !== null && !el.guessLine.hasAttribute('role') &&
      !el.guessLine.hasAttribute('aria-live')) {
    // The line changes under the player rather than arriving with a new screen,
    // so it has to announce itself. The section may have said so already.
    el.guessLine.setAttribute('role', 'status');
  }
}

function tappedId(event, container, selector, key) {
  const target = event.target;
  if (target === null || typeof target.closest !== 'function' || container === null) {
    return '';
  }
  const node = target.closest(selector);
  if (node === null || !container.contains(node)) {
    return '';
  }
  const id = node.dataset[key];
  return typeof id === 'string' ? id : '';
}

function bind() {
  if (bound) {
    return;
  }
  bound = true;

  on(el.open, 'click', function (event) {
    if (views.staleTap(event)) {
      return;
    }
    openCamera();
  });

  /* Not a tap and never guarded as one: change arrives from the file dialog,
     which the player was inside of, so the stale tap window has nothing to say
     about it. */
  on(el.input, 'change', function () {
    onFileChosen();
  });

  on(el.yes, 'click', function (event) {
    if (views.staleTap(event)) {
      return;
    }
    confirmFind(chosenFind);
  });

  on(el.other, 'click', function (event) {
    if (views.staleTap(event)) {
      return;
    }
    openPicker();
  });

  // Delegated, so a picker rebuilt between stages is never a dead node with a
  // listener still on it.
  on(el.picker, 'click', function (event) {
    if (views.staleTap(event)) {
      return;
    }
    const id = tappedId(event, el.picker, '.photo-find', 'findId');
    if (id === '') {
      return;
    }
    confirmFind(choiceById(id));
  });

  on(el.seedChips, 'click', function (event) {
    if (views.staleTap(event)) {
      return;
    }
    const id = tappedId(event, el.seedChips, '.photo-seed', 'cropId');
    if (id === '') {
      return;
    }
    chooseSeed(id);
  });

  on(el.done, 'click', function (event) {
    if (views.staleTap(event)) {
      return;
    }
    finishQuest();
  });

  /* Walking out of here belongs to this file, the way the puzzle owns its own
     back button: leaving has to put the flow back to the start behind the
     player, so coming in again starts fresh rather than in the middle of a
     guess. main.js leaves it alone for exactly that reason, and the data-back
     check is there in case the section is ever marked for the shared handler,
     which would otherwise send the player home twice. */
  on(el.back, 'click', function (event) {
    if (views.staleTap(event)) {
      return;
    }
    resetFlow();
    render(false);
    if (el.back === null || el.back.getAttribute('data-back') !== 'garden') {
      views.show('garden', true);
    }
  });
}

function resetFlow() {
  classifyToken += 1;
  stage = 'open';
  chosenFind = null;
  chosenSeed = '';
  noteText = '';
  pickerLead = '';
  setNudge('');
}

/* The quest turns over at midnight and the glue marks the day on the way out,
   so a screen painted once at boot goes stale. It watches for its own section
   being unhidden and repaints rather than depending on glue remembering to ask.
   A repaint changes nothing the observer listens for, so it cannot chase its
   own tail. */
function watchForOpening() {
  if (watching || typeof MutationObserver !== 'function' || el.section === null) {
    return;
  }
  watching = true;
  const observer = new MutationObserver(function () {
    if (el.section.hidden) {
      return;
    }
    if (stage === 'open') {
      noteText = '';
    }
    render(false);
  });
  observer.observe(el.section, { attributes: true, attributeFilter: ['hidden'] });
}

/* ---- exports ------------------------------------------------------------- */

/**
 * Wire up the photo quest screen.
 *
 * Every id is looked up here rather than at import time, so this module is safe
 * to load and safe to call before the section html exists. With no #view-photo
 * on the page it renders nothing, binds nothing and answers 0, which is also
 * what it does under plain node where there is no document at all.
 *
 * Calling it twice is safe: listeners go on once and the second call is a
 * redraw.
 *
 * @param {Object} options
 * @param {{show: Function, staleTap: Function}} [options.views] The view handle
 *   from main.js. staleTap(event) guards every tap in here, and
 *   show('garden', true) is how a finished quest gets the player home.
 * @param {function({findId: string, findLabel: string, seedCropId: string}): void}
 *   [options.onQuestDone] Called once, when the player taps done. The coins, the
 *   seed, the day marking and Auntie Bee's line all belong to the caller.
 *   seedCropId is empty only when there were no common crops to offer.
 * @param {Object|Array} [options.crops] The seeds the walk may pay in. Takes the
 *   crops map from plant-traits.json, the whole traits file, or a list main.js
 *   has already filtered, which is what it sends. Records carrying a tier are
 *   held to the common tier here as well; a list with no tiers on it at all has
 *   been ruled on by its builder and is taken as it stands. Order is kept.
 *   Nothing here fetches: no crops means no chips and a calm line, never a
 *   broken screen.
 * @param {Object|Array} [options.seedChoices] The same thing under the name the
 *   plan first used. Read only when crops is absent.
 * @returns {number} How many plants the picker can offer, 0 when the section is
 *   not on the page.
 */
export function initPhotoQuest(options) {
  const config = options === null || typeof options !== 'object' ? {} : options;
  const handle = config.views === null || typeof config.views !== 'object' ? {} : config.views;

  views = {
    show: typeof handle.show === 'function' ? handle.show : function () {},
    staleTap: typeof handle.staleTap === 'function' ? handle.staleTap : function () { return false; }
  };
  onQuestDone = typeof config.onQuestDone === 'function' ? config.onQuestDone : null;

  choices = readChoices();
  commons = config.crops === null || config.crops === undefined
    ? readSeedList(config.seedChoices)
    : readSeedList(config.crops);

  cacheElements();
  if (el.section === null) {
    return 0;
  }
  bind();
  watchForOpening();
  render(false);
  return choices.length;
}

/**
 * Whether today's photo quest is still there to take.
 *
 * Read only, and it answers from the saved day rather than from anything this
 * screen remembers, so the garden entry and this screen can never disagree.
 * State's own reader is asked first and the saved field is the fallback, which
 * is what lets this file work against a state that has the getter and one that
 * does not. A clock that cannot be read leaves the quest open, because the one
 * thing this must not do is take the walk away on a guess.
 *
 * @returns {boolean} True when the quest has not been done today.
 */
export function questAvailableToday() {
  try {
    if (typeof state.photoQuestAvailable === 'function') {
      return state.photoQuestAvailable() !== false;
    }
  } catch (error) {
    return true;
  }
  const doc = readState();
  const photo = doc.photo === null || typeof doc.photo !== 'object' ? {} : doc.photo;
  const last = typeof photo.lastQuestDay === 'string' ? photo.lastQuestDay : '';
  const today = todayOrEmpty();
  if (today === '' || last === '') {
    return true;
  }
  return last !== today;
}
