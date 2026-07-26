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
const FIRST_ROUND = { tileCount: 8, lookalike: 0.25 };
const LATER_ROUND = { tileCount: 12, lookalike: 0.5 };
const DEFAULT_NAME = 'Friend';

const el = {
  nameScreen: document.querySelector('[data-screen="name"]'),
  play: document.querySelector('[data-screen="play"]'),
  win: document.querySelector('[data-screen="win"]'),
  bubbleSlot: document.querySelector('[data-bubble-slot]'),
  grid: document.querySelector('[data-grid]'),
  input: document.querySelector('#mk-name-input'),
  playerName: document.querySelector('[data-player-name]'),
  progress: document.querySelector('[data-progress]'),
  winName: document.querySelector('[data-win-name]'),
  winNote: document.querySelector('[data-win-note]')
};

let banter = null;
let state = blankState('');
let round = null;

boot();

async function boot() {
  renderPortraits(document);
  banter = createBanter(document);
  wireControls();

  const bank = await loadBank();
  if (bank) {
    registerBank(NS, bank);
  }

  const saved = loadState(NS, null);
  if (saved && typeof saved.name === 'string' && saved.name.trim() !== '') {
    state = adopt(saved);
    state.visits += 1;
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
  persist();
  startPlaying();
}

/* ---- a round ------------------------------------------------------------ */

function deal() {
  const dial = state.roundsPlayed === 0 ? FIRST_ROUND : LATER_ROUND;
  state.dial = { tileCount: dial.tileCount, lookalike: dial.lookalike };

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
    taps: 0
  };

  renderTiles();
  updateBar();
  el.grid.focus({ preventScroll: true });
  banter.speak('round_start', { name: state.name });
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
  banter.speak('idle_nudge', { name: state.name });
}

function finishRound() {
  const pairs = round.tiles.length / 2;
  state.roundsPlayed += 1;
  state.recent = state.recent.concat([{ matches: round.matches, misses: round.misses }]).slice(-3);
  if (state.bestClear === null || round.misses < state.bestClear) {
    state.bestClear = round.misses;
  }
  persist();

  el.winName.textContent = state.name;
  el.winNote.textContent = 'All ' + pairs + ' pairs found.';
  // Start the card under the bubble so the kakis keep cheering above it.
  const slot = el.bubbleSlot.getBoundingClientRect();
  el.win.style.setProperty('--mk-win-top', Math.max(0, Math.round(slot.bottom)) + 'px');
  el.win.hidden = false;
  banter.speak('round_win', { name: state.name });
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
    dial: { tileCount: FIRST_ROUND.tileCount, lookalike: FIRST_ROUND.lookalike }
  };
}

function adopt(saved) {
  const base = blankState(String(saved.name).trim().slice(0, 20) || DEFAULT_NAME);
  base.visits = whole(saved.visits, 0);
  base.roundsPlayed = whole(saved.roundsPlayed, 0);
  base.totalMatches = whole(saved.totalMatches, 0);
  base.bestClear = Number.isFinite(saved.bestClear) ? saved.bestClear : null;
  base.recent = Array.isArray(saved.recent) ? saved.recent.slice(-3) : [];
  if (saved.dial && Number.isFinite(saved.dial.tileCount)) {
    base.dial = { tileCount: saved.dial.tileCount, lookalike: Number(saved.dial.lookalike) || 0 };
  }
  return base;
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
    dial: state.dial
  });
}
