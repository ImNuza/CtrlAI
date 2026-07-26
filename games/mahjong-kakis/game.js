/*
  Mahjong Kakis, Milestone A.

  Face up tiles, tap two that match, clear the table. No timers anywhere: the
  only counter is taps since the last match, and all it does is ask a kaki to
  offer a hint. A mismatch is a warm moment, never an error.
*/

import { registerBank, hashString } from '/shared/ai.js';
import { loadState, saveState } from '/shared/storage.js';
import { buildWall } from '/games/mahjong-kakis/tiles.js';
import { renderPortraits, createBanter } from '/games/mahjong-kakis/kakis.js';

const NS = 'mahjong-kakis';
const BANK_URL = '/games/mahjong-kakis/content/kaki-banter.json';

const CLEAR_MS = 240;
const MISS_HOLD_MS = 600;
const NUDGE_TAPS = 6;
// Two offers of help in a row with nothing found in between, and one pair
// breathes for a moment. Never named, never written down, never a fail state.
const GLOW_AFTER_NUDGES = 2;
const GLOW_MS = 900;
const RECENT_KEPT = 3;
const FIRST_ROUND = { tileCount: 8, lookalike: 0.25 };
const DEFAULT_NAME = 'Friend';

// The hidden dial. Four columns of tiles, so the count moves in twos between a
// two row table and a four row one, and the lookalike share moves with it.
const MIN_TILES = 8;
const MAX_TILES = 16;
const TILE_STEP = 2;
const MIN_LOOKALIKE = 0.25;
const MAX_LOOKALIKE = 1;
const LOOKALIKE_STEP = 0.25;
// Miss rate below FLOWING means the pairs are coming easily, above WORKING
// means the player is working for them. Between the two, nothing changes.
const FLOWING = 0.2;
const WORKING = 0.45;

const el = {
  nameScreen: document.querySelector('[data-screen="name"]'),
  play: document.querySelector('[data-screen="play"]'),
  win: document.querySelector('[data-screen="win"]'),
  bubbleSlot: document.querySelector('[data-bubble-slot]'),
  grid: document.querySelector('[data-grid]'),
  input: document.querySelector('#mk-name-input'),
  playerName: document.querySelector('[data-player-name]'),
  progress: document.querySelector('[data-progress]'),
  dots: document.querySelector('[data-dots]'),
  winName: document.querySelector('[data-win-name]'),
  winNote: document.querySelector('[data-win-note]')
};

let banter = null;
let state = blankState('');
let round = null;
// True until the first deal of a session that a returning player opened. That
// one deal is greeted with the memory callback instead of a plain round start.
let pendingReturn = false;

boot();

async function boot() {
  renderPortraits(document);
  // The celebration card starts under the bubble, and the bubble is not a fixed
  // height any more, so every render and dismissal re-measures the slot.
  banter = createBanter(document, { onChange: syncWinTop });
  wireControls();

  const bank = await loadBank();
  if (bank) {
    registerBank(NS, bank);
  }

  const saved = loadState(NS, null);
  if (saved && typeof saved.name === 'string' && saved.name.trim() !== '') {
    state = adopt(saved);
    state.visits += 1;
    // A name on its own is not a shared history. Only somebody who finished a
    // round has something for a kaki to remember.
    pendingReturn = state.roundsPlayed >= 1;
    banter.seat(state.visits);
    persist();
    startPlaying();
    return;
  }
  showNameScreen();
}

async function loadBank() {
  try {
    const response = await fetch(BANK_URL);
    if (!response.ok) {
      return null;
    }
    return await response.json();
  } catch (err) {
    // A missing bank is not fatal: shared/ai.js answers with a neutral line.
    return null;
  }
}

/* ---- screens ------------------------------------------------------------ */

function showNameScreen() {
  el.nameScreen.hidden = false;
  el.play.hidden = true;
  el.win.hidden = true;
  el.bubbleSlot.hidden = true;
}

function startPlaying() {
  el.nameScreen.hidden = true;
  el.win.hidden = true;
  el.play.hidden = false;
  el.bubbleSlot.hidden = false;
  deal();
}

function chooseName(raw) {
  const name = String(raw || '').trim().slice(0, 20) || DEFAULT_NAME;
  state = blankState(name);
  state.visits = 1;
  banter.seat(state.visits);
  persist();
  startPlaying();
}

/* ---- a round ------------------------------------------------------------ */

function deal() {
  const dial = nextDial();
  state.dial = dial;
  persist();

  const wall = buildWall({
    tileCount: dial.tileCount,
    lookalike: dial.lookalike,
    seed: hashString(state.name + ':' + state.roundsPlayed)
  });

  round = {
    tiles: wall.map(function (tile) {
      return { id: tile.id, label: tile.label, svg: tile.svg(), state: 'idle' };
    }),
    selected: null,
    resolving: false,
    matches: 0,
    misses: 0,
    taps: 0,
    nudges: 0
  };

  renderTiles();
  renderDots();
  updateBar();
  el.grid.focus({ preventScroll: true });

  if (pendingReturn) {
    pendingReturn = false;
    banter.speak('return_visit', returnContext());
    return;
  }
  banter.speak('round_start', { name: state.name });
}

/* ---- the hidden dial ----------------------------------------------------- */

/*
  Nothing in the UI ever names this. No level, no difficulty, no badge: the
  table just arrives a little bigger for somebody the pairs are coming easily
  for, a little smaller for somebody who is working for them, and the lookalike
  tiles thin out or crowd in to match. The only visible sign is the size of the
  table itself, which reads as a different hand of mahjong rather than a
  verdict on the player.

  It moves one step per finished round. Reopening the page mid profile must not
  walk it up on its own, so the round it was last computed for is remembered.
*/
function nextDial() {
  if (state.dialAt === state.roundsPlayed) {
    return clampDial(state.dial);
  }
  state.dialAt = state.roundsPlayed;

  if (state.recent.length === 0) {
    return { tileCount: FIRST_ROUND.tileCount, lookalike: FIRST_ROUND.lookalike };
  }

  let matches = 0;
  let misses = 0;
  for (let i = 0; i < state.recent.length; i += 1) {
    matches += state.recent[i].matches;
    misses += state.recent[i].misses;
  }
  const missRate = misses / Math.max(1, matches + misses);

  const dial = clampDial(state.dial);
  if (missRate < FLOWING) {
    return {
      tileCount: Math.min(MAX_TILES, dial.tileCount + TILE_STEP),
      lookalike: Math.min(MAX_LOOKALIKE, dial.lookalike + LOOKALIKE_STEP)
    };
  }
  if (missRate > WORKING) {
    return {
      tileCount: Math.max(MIN_TILES, dial.tileCount - TILE_STEP),
      lookalike: Math.max(MIN_LOOKALIKE, dial.lookalike - LOOKALIKE_STEP)
    };
  }
  return dial;
}

// A stored dial is only a hint. It gets pulled back into range and onto an even
// count before anything is built from it.
function clampDial(dial) {
  const asked = Number.isFinite(dial.tileCount) ? Math.round(dial.tileCount) : FIRST_ROUND.tileCount;
  const even = asked - (asked % 2);
  const lookalike = Number.isFinite(dial.lookalike) ? dial.lookalike : FIRST_ROUND.lookalike;
  return {
    tileCount: Math.max(MIN_TILES, Math.min(MAX_TILES, even)),
    lookalike: Math.max(MIN_LOOKALIKE, Math.min(MAX_LOOKALIKE, lookalike))
  };
}

/* ---- what a kaki remembers ---------------------------------------------- */

/*
  History slots for return_visit. Both are optional: a missing one is left out
  of the context entirely and shared/ai.js closes the gap, so every template
  still reads as a sentence. The values are warm phrases, never statistics, and
  never a count of what the player got wrong.
*/
function returnContext() {
  const context = { name: state.name };
  const rounds = roundsPhrase(state.roundsPlayed);
  if (rounds) {
    context.rounds = rounds;
  }
  const best = bestPhrase(state.bestClear);
  if (best) {
    context.best = best;
  }
  return context;
}

function roundsPhrase(played) {
  if (played >= 4) {
    return 'many rounds';
  }
  if (played >= 2) {
    return 'a few rounds';
  }
  if (played === 1) {
    return 'one round';
  }
  return null;
}

// bestClear is the fewest mismatches in any finished round. Every branch below
// reads as praise for what happened, never as a count of what did not.
function bestPhrase(bestClear) {
  if (!Number.isFinite(bestClear)) {
    return null;
  }
  if (bestClear === 0) {
    return 'how you cleared it first try';
  }
  if (bestClear <= 2) {
    return 'how fast you found the pairs';
  }
  return 'how you stayed until the end';
}

function renderTiles() {
  const nodes = round.tiles.map(function (tile, index) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'mk-tile';
    button.dataset.tile = tile.id;
    button.dataset.state = 'idle';
    button.dataset.index = String(index);
    button.setAttribute('aria-label', tile.label);
    button.style.setProperty('--mk-i', String(index));
    button.innerHTML = tile.svg;
    return button;
  });
  el.grid.replaceChildren(...nodes);
}

// One dot per pair, drawn once a deal and only ever filled in after that, so
// the dot that has just been won is the only one that pops.
function renderDots() {
  const pairs = round.tiles.length / 2;
  const nodes = [];
  for (let i = 0; i < pairs; i += 1) {
    const dot = document.createElement('span');
    dot.className = 'mk-dot';
    nodes.push(dot);
  }
  el.dots.replaceChildren(...nodes);
}

function onTileTap(index) {
  if (round === null || round.resolving) {
    return;
  }
  const tile = round.tiles[index];
  if (!tile || tile.state === 'cleared') {
    return;
  }

  round.taps += 1;

  if (round.selected === index) {
    setTileState(index, 'idle');
    round.selected = null;
    maybeNudge();
    return;
  }

  if (round.selected === null) {
    setTileState(index, 'selected');
    round.selected = index;
    maybeNudge();
    return;
  }

  const first = round.selected;
  setTileState(index, 'selected');
  round.selected = null;

  if (round.tiles[first].id === tile.id) {
    resolveMatch(first, index);
    return;
  }
  resolveMiss(first, index);
}

function resolveMatch(a, b) {
  round.resolving = true;
  round.matches += 1;
  round.taps = 0;
  round.nudges = 0;
  state.totalMatches += 1;

  const last = round.matches * 2 >= round.tiles.length;
  if (!last) {
    banter.speak('match_found', { name: state.name });
  }

  nodeAt(a).classList.add('is-clearing');
  nodeAt(b).classList.add('is-clearing');

  window.setTimeout(function () {
    [a, b].forEach(function (index) {
      const node = nodeAt(index);
      node.classList.remove('is-clearing');
      node.disabled = true;
      setTileState(index, 'cleared');
    });
    round.resolving = false;
    updateBar();
    if (last) {
      finishRound();
    }
  }, CLEAR_MS);
}

function resolveMiss(a, b) {
  round.resolving = true;
  round.misses += 1;

  nodeAt(a).classList.add('is-wiggle');
  nodeAt(b).classList.add('is-wiggle');
  banter.speak('near_miss', { name: state.name });

  window.setTimeout(function () {
    [a, b].forEach(function (index) {
      nodeAt(index).classList.remove('is-wiggle');
      setTileState(index, 'idle');
    });
    round.resolving = false;
  }, MISS_HOLD_MS);
}

function maybeNudge() {
  if (round.taps < NUDGE_TAPS) {
    return;
  }
  round.taps = 0;
  round.nudges += 1;
  banter.speak('idle_nudge', { name: state.name });

  if (round.nudges >= GLOW_AFTER_NUDGES) {
    round.nudges = 0;
    breathePair();
  }
}

// Light one real pair for a moment. Silent on purpose: the kaki is already
// talking, and nothing anywhere calls this help.
function breathePair() {
  const seen = new Map();
  for (let i = 0; i < round.tiles.length; i += 1) {
    const tile = round.tiles[i];
    if (tile.state === 'cleared') {
      continue;
    }
    const twin = seen.get(tile.id);
    if (twin !== undefined) {
      breathe(twin);
      breathe(i);
      return;
    }
    seen.set(tile.id, i);
  }
}

function breathe(index) {
  const node = nodeAt(index);
  if (!node) {
    return;
  }
  node.classList.add('is-glow');
  window.setTimeout(function () {
    node.classList.remove('is-glow');
  }, GLOW_MS);
}

function finishRound() {
  const pairs = round.tiles.length / 2;
  state.roundsPlayed += 1;
  state.recent = state.recent
    .concat([{ matches: round.matches, misses: round.misses }])
    .slice(-RECENT_KEPT);
  if (state.bestClear === null || round.misses < state.bestClear) {
    state.bestClear = round.misses;
  }
  persist();

  el.winName.textContent = state.name;
  el.winNote.textContent = 'All ' + pairs + ' pairs found.';
  el.win.hidden = false;
  // Start the card under the bubble so the kakis keep cheering above it. The
  // win line has not landed yet, so this is the slot as it stands; createBanter
  // calls back and this runs again once the line is on screen.
  syncWinTop();
  banter.speak('round_win', { name: state.name });
}

function syncWinTop() {
  if (el.win.hidden) {
    return;
  }
  const slot = el.bubbleSlot.getBoundingClientRect();
  el.win.style.setProperty('--mk-win-top', Math.max(0, Math.round(slot.bottom)) + 'px');
}

/* ---- small helpers ------------------------------------------------------ */

function nodeAt(index) {
  return el.grid.children[index];
}

function setTileState(index, value) {
  round.tiles[index].state = value;
  nodeAt(index).dataset.state = value;
}

function updateBar() {
  el.playerName.textContent = state.name;
  el.progress.textContent = round.matches + ' of ' + round.tiles.length / 2 + ' pairs';
  for (let i = 0; i < el.dots.children.length; i += 1) {
    el.dots.children[i].classList.toggle('is-found', i < round.matches);
  }
}

function wireControls() {
  el.grid.addEventListener('click', function (event) {
    const tile = event.target.closest('.mk-tile');
    if (tile && el.grid.contains(tile)) {
      onTileTap(Number(tile.dataset.index));
    }
  });

  document.querySelectorAll('[data-name-chip]').forEach(function (chip) {
    chip.addEventListener('click', function () {
      chooseName(chip.dataset.nameChip);
    });
  });

  document.querySelector('[data-action="confirm-name"]').addEventListener('click', function () {
    chooseName(el.input.value);
  });

  el.input.addEventListener('keydown', function (event) {
    if (event.key === 'Enter') {
      event.preventDefault();
      chooseName(el.input.value);
    }
  });

  document.querySelector('[data-action="again"]').addEventListener('click', function () {
    el.win.hidden = true;
    deal();
  });
}

function blankState(name) {
  return {
    name: name,
    visits: 0,
    roundsPlayed: 0,
    totalMatches: 0,
    bestClear: null,
    recent: [],
    dial: { tileCount: FIRST_ROUND.tileCount, lookalike: FIRST_ROUND.lookalike },
    // Which value of roundsPlayed the dial above was computed for. null means
    // it has never been computed, so the next deal works it out.
    dialAt: null
  };
}

/*
  Merge a stored profile onto a fresh blank one. Every field is taken only when
  it survives its own check, so a partial or older save loses the field it is
  missing instead of poisoning the round with undefined.
*/
function adopt(saved) {
  const base = blankState(String(saved.name).trim().slice(0, 20) || DEFAULT_NAME);
  base.visits = whole(saved.visits, base.visits);
  base.roundsPlayed = whole(saved.roundsPlayed, base.roundsPlayed);
  base.totalMatches = whole(saved.totalMatches, base.totalMatches);
  base.bestClear = Number.isFinite(saved.bestClear) && saved.bestClear >= 0
    ? Math.floor(saved.bestClear)
    : base.bestClear;
  base.recent = adoptRecent(saved.recent, base.recent);
  base.dial = adoptDial(saved.dial, base.dial);
  base.dialAt = Number.isFinite(saved.dialAt) ? Math.floor(saved.dialAt) : base.dialAt;
  return base;
}

function adoptRecent(saved, fallback) {
  if (!Array.isArray(saved)) {
    return fallback;
  }
  const kept = [];
  for (let i = 0; i < saved.length; i += 1) {
    const entry = saved[i];
    if (entry && typeof entry === 'object') {
      kept.push({ matches: whole(entry.matches, 0), misses: whole(entry.misses, 0) });
    }
  }
  return kept.slice(-RECENT_KEPT);
}

function adoptDial(saved, fallback) {
  if (!saved || typeof saved !== 'object') {
    return fallback;
  }
  return {
    tileCount: Number.isFinite(saved.tileCount) ? saved.tileCount : fallback.tileCount,
    lookalike: Number.isFinite(saved.lookalike) ? saved.lookalike : fallback.lookalike
  };
}

function whole(value, fallback) {
  return Number.isFinite(value) && value >= 0 ? Math.floor(value) : fallback;
}

function persist() {
  saveState(NS, {
    name: state.name,
    visits: state.visits,
    roundsPlayed: state.roundsPlayed,
    totalMatches: state.totalMatches,
    bestClear: state.bestClear,
    recent: state.recent,
    dial: state.dial,
    dialAt: state.dialAt
  });
}
