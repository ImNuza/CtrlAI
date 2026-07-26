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
const RECENT_KEPT = 3;
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
// True until the first deal of a session that a returning player opened. That
// one deal is greeted with the memory callback instead of a plain round start.
let pendingReturn = false;

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
    // A name on its own is not a shared history. Only somebody who finished a
    // round has something for a kaki to remember.
    pendingReturn = state.roundsPlayed >= 1;
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

  if (pendingReturn) {
    pendingReturn = false;
    banter.speak('return_visit', returnContext());
    return;
  }
  banter.speak('round_start', { name: state.name });
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
    return 'how fast you found every pair';
  }
  return 'how you stayed to the last pair';
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
  state.recent = state.recent
    .concat([{ matches: round.matches, misses: round.misses }])
    .slice(-RECENT_KEPT);
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
    dial: state.dial
  });
}
