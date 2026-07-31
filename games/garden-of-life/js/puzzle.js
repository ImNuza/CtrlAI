/*
  Garden of Life tile puzzle.

  Eight pairs of garden motifs on a four by four board, lifted from the Mahjong
  Kakis wall and reskinned. The mechanism is the same one that already proved
  itself with seniors: tap a tile, tap another, a pair stays put. What changed is
  the pacing. Kakis flipped a miss back on a 600ms timer, and this game may not
  hold a timer of any kind, so a miss here stays visible until the player's own
  next tap takes it away. Nobody is ever racing the board.

  Two layers live in this file, and the seam between them is deliberate:

    the engine   pure, DOM free, exported. buildDeck, createRound, applyTap and
                 clearPendingMiss are the whole rulebook, and they run under
                 plain node. QA can rebuild the exact deck a live page is
                 showing by asking roundSeed for the same day and counter, then
                 drive the board by index without ever guessing a face.
    the DOM      reads the round the engine holds and paints it. It decides
                 nothing. Every id is queried lazily inside initPuzzle, so this
                 module loads clean long before the section html exists, and
                 init answers 0 and touches nothing when it is not there.

  Money is not this file's business. The round pays a fixed 6 coins per the
  stretch plan, and the glue pays it when onRoundComplete fires. Nothing here
  adds, spends or rolls for a single coin: layout is the only place randomness
  is allowed anywhere near this game.
*/

import { makeRng, hashString } from '../../../shared/ai.js';
import { todayISO } from './state.js';

/* ---- the shape of a round ----------------------------------------------- */

// Eight pairs, so sixteen tiles, laid out four across by css/garden.css. PAIRS
// is the only one of those three numbers this file needs to know.
const PAIRS = 8;

// Fixed by the stretch plan and paid by the glue, never by this file. It is
// named here only so the finishing line can say out loud what was earned.
const PAYOUT_COINS = 6;

const DOWN = 'down';
const UP = 'up';
const MATCHED = 'matched';

/* ---- copy ---------------------------------------------------------------
   Warm, short, and never a telling off. There is no such thing as a wrong tap
   on this board, so no line in here reacts to one. */

const OPENING_LINE = 'Turn over two tiles. The ones that match stay up.';
const COMPLETE_LINE = 'All 8 pairs found. That is ' + PAYOUT_COINS + ' coins for your garden.';
const AGAIN_LABEL = 'One more round';

/* ---- faces --------------------------------------------------------------
   Eight motifs from a Singapore garden, drawn here as inline svg so the board
   owes nothing to a file that may not have landed and nothing to composer.js.

   Drawn to the locked style in art/style/LOCKED.md, small prop clause: flat
   fills, extra bold dark outlines, simple friendly rounded shapes, no texture
   and no halftone. The contour is the register's signature, so it is set once
   on the svg root and inherited by every shape rather than repeated sixteen
   times; a shape that wants a different weight says so itself, and the light
   detail lines carry their own colour and are drawn on top of the fill.

   Every shape is built for a tile about 80px across: one dominant silhouette
   per motif, no detail under about 2.5 units in a 60 unit box, and no two
   motifs sharing an outline. Every fill that touches the tile clears 4.7:1
   against the cream a turned up tile is painted with, against the 3:1 the
   brief asks for, and the dark contour around it is 16:1. Light detail on top
   of a dark fill uses --color-surface, the same pairing in reverse. */

/* The warm poster palette has two fills the token set does not carry. Both are
   lifted verbatim from the committed props in art/ui, so the register matches
   by construction rather than by taste: olive is the leaf green in
   watering-can.svg and sprout.svg, amber is the warm gold in both. Everything
   else on these tiles is a token. There is no blue anywhere in the locked
   palette, which is why the can and the butterfly left --accent-dojo behind. */
const OLIVE = '#4a6b2f';
const AMBER = '#a6600b';

const FACE_BOX = '0 0 60 60';

function face(inner) {
  return '<svg viewBox="' + FACE_BOX + '" aria-hidden="true" focusable="false" ' +
    'xmlns="http://www.w3.org/2000/svg" stroke="var(--color-text)" stroke-width="3" ' +
    'stroke-linejoin="round" stroke-linecap="round">' + inner + '</svg>';
}

const FACES = [
  {
    id: 'leaf',
    label: 'leaf',
    svg: face(
      '<path d="M30 5 C 47 15 50 38 30 55 C 10 38 13 15 30 5 Z" fill="' + OLIVE + '"/>' +
      '<path d="M30 11 L30 51" fill="none" stroke="var(--color-surface)" stroke-width="3"/>' +
      '<path d="M30 23 L19 19 M30 31 L41 27 M30 39 L20 35" fill="none" ' +
      'stroke="var(--color-surface)" stroke-width="2.6"/>'
    )
  },
  {
    id: 'bloom',
    label: 'bloom',
    svg: face(
      '<circle cx="30" cy="17" r="10" fill="var(--color-danger)"/>' +
      '<circle cx="42.4" cy="26" r="10" fill="var(--color-danger)"/>' +
      '<circle cx="37.6" cy="40.5" r="10" fill="var(--color-danger)"/>' +
      '<circle cx="22.4" cy="40.5" r="10" fill="var(--color-danger)"/>' +
      '<circle cx="17.6" cy="26" r="10" fill="var(--color-danger)"/>' +
      '<circle cx="30" cy="30" r="9" fill="' + AMBER + '"/>'
    )
  },
  {
    id: 'chilli',
    label: 'chilli',
    svg: face(
      '<path d="M33 17 C 45 24 46 40 30 54 C 21 44 20 29 26 21 Z" fill="var(--color-danger)"/>' +
      // The stalk is a line, so it earns its contour by being drawn twice: the
      // dark pass is the outline, the olive pass sits inside it.
      '<path d="M32 16 C 27 10 22 8 17 9" fill="none" stroke="var(--color-text)" ' +
      'stroke-width="9"/>' +
      '<path d="M32 16 C 27 10 22 8 17 9" fill="none" stroke="' + OLIVE + '" stroke-width="4.5"/>' +
      '<circle cx="32" cy="17" r="5.5" fill="' + OLIVE + '"/>'
    )
  },
  {
    id: 'calamansi',
    label: 'calamansi',
    svg: face(
      '<circle cx="30" cy="31" r="20" fill="' + AMBER + '"/>' +
      '<path d="M30 31 L30 11 M30 31 L47.3 21 M30 31 L47.3 41 M30 31 L30 51 ' +
      'M30 31 L12.7 41 M30 31 L12.7 21" fill="none" stroke="var(--color-surface)" ' +
      'stroke-width="2.8"/>' +
      '<circle cx="30" cy="31" r="4" fill="var(--color-surface)" stroke-width="2"/>'
    )
  },
  {
    id: 'can',
    label: 'watering can',
    svg: face(
      '<path d="M24 29 L9 20 L5 26 L24 38 Z" fill="var(--accent-kopitiam)"/>' +
      '<rect x="24" y="25" width="27" height="26" rx="5" fill="var(--accent-kopitiam)"/>' +
      '<path d="M28 25 C 30 14 47 14 48 25" fill="none" stroke="var(--color-text)" ' +
      'stroke-width="9"/>' +
      '<path d="M28 25 C 30 14 47 14 48 25" fill="none" stroke="var(--accent-kopitiam)" ' +
      'stroke-width="4.5"/>' +
      // Grown from 2.6 to make room for a contour and still leave an amber core
      // that reads as water at 80px.
      '<circle cx="8" cy="34" r="3.4" fill="' + AMBER + '" stroke-width="2"/>' +
      '<circle cx="14" cy="40" r="3.4" fill="' + AMBER + '" stroke-width="2"/>'
    )
  },
  {
    id: 'packet',
    label: 'seed packet',
    svg: face(
      '<rect x="14" y="9" width="32" height="43" rx="3" fill="var(--accent-kopitiam)"/>' +
      // Inset, so the sealed flap reads as a fold without cutting the top off the
      // packet's silhouette against a tile painted the same colour as the band.
      '<rect x="18" y="13" width="24" height="6" rx="3" fill="var(--color-surface)" ' +
      'stroke-width="2"/>' +
      '<rect x="20" y="23" width="20" height="22" rx="2" fill="var(--color-surface)"/>' +
      /* Seeds pulled in from 4 by 5 to 3.2 by 4 on a 2 wide contour. At the old
         size the new outlines closed the gaps between them and the three read as
         one dark mass through the window. */
      '<ellipse cx="25.5" cy="29.5" rx="3.2" ry="4" fill="var(--color-text)" stroke-width="2"/>' +
      // One seed green, the way the committed seed-packet.svg puts a single
      // growing thing on the label.
      '<ellipse cx="34.5" cy="34" rx="3.2" ry="4" fill="' + OLIVE + '" stroke-width="2"/>' +
      '<ellipse cx="25.5" cy="39.5" rx="3.2" ry="4" fill="var(--color-text)" stroke-width="2"/>'
    )
  },
  {
    id: 'butterfly',
    label: 'butterfly',
    svg: face(
      '<path d="M28 24 C 18 9 6 12 6 22 C 6 30 16 33 28 33 Z" fill="' + AMBER + '"/>' +
      '<path d="M32 24 C 42 9 54 12 54 22 C 54 30 44 33 32 33 Z" fill="' + AMBER + '"/>' +
      '<path d="M28 35 C 18 37 10 41 12 48 C 15 53 25 50 28 42 Z" fill="var(--accent-kopitiam)"/>' +
      '<path d="M32 35 C 42 37 50 41 48 48 C 45 53 35 50 32 42 Z" fill="var(--accent-kopitiam)"/>' +
      '<circle cx="16" cy="22" r="4" fill="var(--color-surface)" stroke-width="2"/>' +
      '<circle cx="44" cy="22" r="4" fill="var(--color-surface)" stroke-width="2"/>' +
      '<ellipse cx="30" cy="32" rx="3" ry="13" fill="var(--color-text)"/>' +
      '<path d="M30 20 C 27 13 24 11 21 10 M30 20 C 33 13 36 11 39 10" ' +
      'fill="none" stroke="var(--color-text)" stroke-width="2.4"/>'
    )
  },
  {
    id: 'snail',
    label: 'snail',
    svg: face(
      '<path d="M8 49 C 8 42 13 39 20 39 H45 C 49 39 51 43 51 49 Z" fill="var(--color-text-muted)"/>' +
      '<path d="M12 45 C 9 34 11 26 18 24 C 23 23 25 27 23 31 C 20 35 19 40 20 45 Z" ' +
      'fill="var(--color-text-muted)"/>' +
      // Line art, so the dark is the drawing rather than an outline around it.
      '<path d="M18 24 L14 15 M23 25 L28 17" fill="none" stroke="var(--color-text)" ' +
      'stroke-width="2.6"/>' +
      '<circle cx="14" cy="14" r="2.4" fill="var(--color-text)"/>' +
      '<circle cx="28" cy="16" r="2.4" fill="var(--color-text)"/>' +
      '<circle cx="37" cy="29" r="15" fill="' + AMBER + '"/>' +
      '<path d="M37 29 C 37 25 40 24 42.5 26 C 46 29 44 35 39 36 C 32 37 28 31 30 24 ' +
      'C 32 18 39 16 45 19" fill="none" stroke="var(--color-surface)" stroke-width="2.8"/>'
    )
  }
];

const FACE_BY_ID = new Map(FACES.map(function (item) {
  return [item.id, item];
}));

/* A tile nobody has turned yet. One quiet ring, the same on all sixteen, so a
   face down tile reads as "something is under here" and never as broken or
   switched off. Solid rather than faded: a wash at low opacity would drop the
   only mark on the tile under the 3:1 non-text floor. */
const BACK_SVG = face(
  '<circle cx="30" cy="30" r="12" fill="none" stroke="var(--color-text-muted)" stroke-width="3"/>'
);

/* The settled mark a matched pair keeps. Colour is never the only signal: the
   badge, the heavier border and the aria label all say the same thing. It takes
   the same dark contour as the motif it sits beside, or it would be the one flat
   shape on the tile with no outline. The fill stays --accent, because that is
   the whole game's colour and not this file's to re-pick. */
const MATCH_MARK = '<span class="puzzle-mark">' +
  '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg">' +
  '<circle cx="12" cy="12" r="10.6" fill="var(--accent)" stroke="var(--color-text)" ' +
  'stroke-width="2"/>' +
  '<path d="M6.5 12.5 L10.5 16.5 L17.5 8" fill="none" stroke="var(--color-text-on-accent)" ' +
  'stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg></span>';

/* ---- where the styling lives --------------------------------------------
   css/garden.css owns .puzzle-board, .puzzle-tile, its data-state variants and
   .puzzle-mark. This module carried a copy of those rules while the section html
   was still on its way, and dropped it the moment the real css landed; the class
   names and the data-state values below are the whole seam between the two
   files, so renaming one here silently unstyles the board.

   Two things that css is holding, worth knowing before anything moves them: the
   grid is four fractional columns rather than four pinned 64px ones, so a narrow
   phone loses a little tile rather than gaining a sideways scrollbar, and a
   settled tile is told apart from a turned up one by fill, border weight and the
   badge together, never by colour alone. */

/* ---- the engine ---------------------------------------------------------
   Everything from here to the DOM layer is pure: it reads the round it is
   handed and nothing else, it never touches the document, and it runs under
   plain node. The DOM layer below owns no rules of its own and reads only from
   the round these functions move. */

/**
 * The seed a round is shuffled with. Layout is the one place this game is
 * allowed to be random, and even here it is reproducible: the same day and the
 * same counter always deal the same board.
 * @param {string} day An ISO day, normally state.todayISO().
 * @param {number} counter Rounds already dealt this page load, starting at 0.
 * @returns {number} Unsigned 32 bit seed for makeRng.
 */
export function roundSeed(day, counter) {
  const safeDay = typeof day === 'string' ? day : '';
  const turn = Number.isFinite(counter) ? Math.floor(counter) : 0;
  return hashString('puzzle:' + safeDay + ':' + turn);
}

/**
 * Deal sixteen face ids: every motif exactly twice, shuffled.
 * @param {number|string} seed Anything makeRng accepts, normally roundSeed().
 * @returns {Array<string>} Sixteen face ids in board order.
 */
export function buildDeck(seed) {
  const deck = [];
  for (let i = 0; i < FACES.length; i += 1) {
    deck.push(FACES[i].id, FACES[i].id);
  }
  const rng = makeRng(seed);
  // Fisher-Yates off the seeded generator, and off nothing else. The platform
  // random source is never read in this file, so a board is always reproducible.
  for (let i = deck.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const swap = deck[i];
    deck[i] = deck[j];
    deck[j] = swap;
  }
  return deck;
}

/**
 * A fresh round, every tile face down.
 * @param {number|string} seed Passed straight to buildDeck.
 * @returns {{tiles: Array<{faceId: string, state: string}>, firstPick: (number|null),
 *   pendingMiss: (Array<number>|null), pairsFound: number, complete: boolean}}
 */
export function createRound(seed) {
  const deck = buildDeck(seed);
  const tiles = [];
  for (let i = 0; i < deck.length; i += 1) {
    tiles.push({ faceId: deck[i], state: DOWN });
  }
  return {
    tiles: tiles,
    // The one tile turned up and waiting for a partner.
    firstPick: null,
    // Two turned up tiles that did not match. They stay exactly where they are,
    // in full view, until the player's next tap puts them back. No timer, and
    // nothing on screen counting down at them.
    pendingMiss: null,
    pairsFound: 0,
    complete: false
  };
}

function effect(kind, revealed, changed, completed) {
  return { kind: kind, revealed: revealed, changed: changed, completed: completed };
}

function nothingHappened() {
  return effect('ignored', null, [], false);
}

function usable(round) {
  return round !== null && typeof round === 'object' && Array.isArray(round.tiles);
}

/**
 * Put a waiting pair of unmatched tiles back face down. This is the "tap
 * anywhere on the board" half of the rule: a tap that lands between tiles is
 * still the player asking for the pair to go away.
 * @param {Object} round A round from createRound. Moved in place.
 * @returns {{kind: string, revealed: null, changed: Array<number>, completed: boolean}}
 *   kind is flipBack when a pair went down, ignored when there was none.
 */
export function clearPendingMiss(round) {
  if (!usable(round) || round.pendingMiss === null) {
    return nothingHappened();
  }
  const flipped = round.pendingMiss;
  round.pendingMiss = null;
  for (let i = 0; i < flipped.length; i += 1) {
    round.tiles[flipped[i]].state = DOWN;
  }
  return effect('flipBack', null, flipped.slice(), false);
}

/**
 * The whole rulebook for a tap on a tile, moving the round in place.
 *
 * Reading the returned effect: changed lists every tile index whose state moved,
 * which is all the DOM layer needs to repaint; revealed is the tile that ended
 * the tap face up and waiting, if any; completed is true on the single tap that
 * finishes the round, and on no other tap ever.
 *
 * The three shapes a tap can take:
 *   nothing waiting   a face down tile turns up. Two turned up tiles either
 *                     settle as a matched pair or stay in view as a miss.
 *   a miss waiting    the pair goes back down first. If this tap landed on a
 *                     face down tile that was not part of it, that tile turns up
 *                     as the new first pick inside the same tap, so a player who
 *                     already knows where they are going never taps twice.
 *   already settled   matched tiles, and the pick already turned up, answer with
 *                     nothing. A shaky double tap can undo nothing here.
 *
 * @param {Object} round A round from createRound.
 * @param {number} index Tile index, 0 to 15.
 * @returns {{kind: string, revealed: (number|null), changed: Array<number>, completed: boolean}}
 *   kind is one of ignored, reveal, match, miss, flipBack.
 */
export function applyTap(round, index) {
  if (!usable(round) || round.complete) {
    return nothingHappened();
  }
  if (!Number.isInteger(index) || index < 0 || index >= round.tiles.length) {
    return nothingHappened();
  }

  if (round.pendingMiss !== null) {
    const back = clearPendingMiss(round);
    const landed = round.tiles[index];
    // The tapped tile has just been turned back over by the line above, so a tap
    // on one of the pair spends itself on the flip and reveals nothing.
    if (landed.state === DOWN && back.changed.indexOf(index) === -1) {
      landed.state = UP;
      round.firstPick = index;
      return effect('flipBack', index, back.changed.concat([index]), false);
    }
    return effect('flipBack', null, back.changed, false);
  }

  const tile = round.tiles[index];
  if (tile.state !== DOWN) {
    return nothingHappened();
  }

  if (round.firstPick === null) {
    tile.state = UP;
    round.firstPick = index;
    return effect('reveal', index, [index], false);
  }

  const first = round.firstPick;
  round.firstPick = null;
  tile.state = UP;

  if (round.tiles[first].faceId === tile.faceId) {
    round.tiles[first].state = MATCHED;
    tile.state = MATCHED;
    round.pairsFound += 1;
    round.complete = round.pairsFound >= PAIRS;
    return effect('match', index, [first, index], round.complete);
  }

  round.pendingMiss = [first, index];
  return effect('miss', index, [first, index], false);
}

/* ---- module state -------------------------------------------------------- */

const el = {};

let views = null;
let onRoundComplete = null;
let readCoins = null;

let round = null;

// Rounds dealt this page load. It only ever goes up, so a second round is never
// the same board as the first even though the day has not changed.
let roundCounter = 0;

// The finish has been announced for the round on screen. The engine already
// refuses every tap once a round is complete, so this is the second lock on a
// glue call that must happen exactly once.
let announced = false;

let bound = false;

/* ---- small helpers ------------------------------------------------------- */

function byId(id) {
  return document.getElementById(id);
}

function on(node, type, handler) {
  if (node !== null && node !== undefined) {
    node.addEventListener(type, handler);
  }
}

// A region that changes under the player without them looking at it has to say
// so. Anything the section html already marks live is left exactly as it is.
function ensureLive(node) {
  if (node === null || node === undefined) {
    return;
  }
  const role = node.getAttribute('role');
  if (node.hasAttribute('aria-live') || role === 'status' || role === 'alert') {
    return;
  }
  node.setAttribute('aria-live', 'polite');
}

function coinWord(amount) {
  return amount === 1 ? ' coin' : ' coins';
}

/* ---- painting -----------------------------------------------------------
   The DOM layer decides nothing. Every function below reads the round the
   engine holds and draws it, and none of them may change it. */

function tileLabel(index, tile) {
  const position = 'Tile ' + (index + 1);
  if (tile.state === DOWN) {
    // The face is the whole game. A label that named it would hand the answer to
    // exactly the player who most needs the game to be fair.
    return position + ', face down';
  }
  const known = FACE_BY_ID.get(tile.faceId);
  const name = known === undefined ? 'garden tile' : known.label;
  return position + ', ' + name + (tile.state === MATCHED ? ', matched' : ', turned up');
}

function paintTile(index) {
  const node = el.board === null ? null : el.board.children[index];
  if (node === null || node === undefined || round === null) {
    return;
  }
  const tile = round.tiles[index];
  const known = FACE_BY_ID.get(tile.faceId);
  const drawing = known === undefined ? BACK_SVG : known.svg;

  node.dataset.state = tile.state;
  if (tile.state === DOWN) {
    node.innerHTML = BACK_SVG;
    delete node.dataset.face;
  } else {
    node.innerHTML = tile.state === MATCHED ? drawing + MATCH_MARK : drawing;
    // Only ever set on a tile the player can already see, so QA can read the
    // board without the markup ever leaking a hidden face.
    node.dataset.face = tile.faceId;
  }
  // aria-disabled rather than disabled: a settled tile stays in the tab order,
  // so finishing a pair never pulls the focus ring out from under a keyboard
  // player. Taps on it are already refused by the engine.
  node.setAttribute('aria-disabled', tile.state === MATCHED ? 'true' : 'false');
  node.setAttribute('aria-label', tileLabel(index, tile));
}

function paintAll() {
  for (let i = 0; i < round.tiles.length; i += 1) {
    paintTile(i);
  }
}

function paintChanged(changed) {
  for (let i = 0; i < changed.length; i += 1) {
    paintTile(changed[i]);
  }
}

function updateProgress() {
  if (el.progress === null || round === null) {
    return;
  }
  el.progress.textContent = round.pairsFound + ' of ' + PAIRS + ' pairs';
}

function renderBoard() {
  if (el.board === null) {
    return;
  }
  const nodes = [];
  for (let i = 0; i < round.tiles.length; i += 1) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'puzzle-tile';
    button.dataset.index = String(i);
    nodes.push(button);
  }
  el.board.replaceChildren.apply(el.board, nodes);
  paintAll();
}

/* ---- a round ------------------------------------------------------------- */

function startRound(moveFocus) {
  round = createRound(roundSeed(todayISO(), roundCounter));
  roundCounter += 1;
  announced = false;

  renderBoard();
  updateProgress();
  if (el.line !== null) {
    el.line.textContent = OPENING_LINE;
  }
  if (el.again !== null) {
    el.again.hidden = true;
  }
  refreshPuzzleCoins();

  // Only after One more round, and never on the first draw: a board that grabbed
  // the focus on arrival would scroll the page out from under whoever had just
  // walked in. preventScroll for the same reason.
  if (moveFocus && el.board !== null && el.board.firstElementChild !== null) {
    el.board.firstElementChild.focus({ preventScroll: true });
  }
}

function finishRound() {
  if (announced) {
    return;
  }
  announced = true;

  if (el.line !== null) {
    el.line.textContent = COMPLETE_LINE;
  }
  if (el.again !== null) {
    el.again.hidden = false;
    // The round is over and this is the way on, so a keyboard player lands on it
    // instead of somewhere in a board full of settled tiles.
    el.again.focus({ preventScroll: true });
  }

  // Last on purpose, and not wrapped: the celebration is already on screen, so
  // a glue that throws while paying cannot swallow the moment, and it also does
  // not get to fail quietly where QA would never see it.
  if (onRoundComplete !== null) {
    onRoundComplete();
  }
  refreshPuzzleCoins();
}

function handleEffect(result) {
  paintChanged(result.changed);
  updateProgress();
  if (result.completed) {
    finishRound();
  }
}

/* ---- wiring -------------------------------------------------------------- */

function cacheElements() {
  // Deliberately not #puzzle-heading. The section owns its own copy and nothing
  // here rewrites it.
  el.board = byId('puzzle-board');
  el.coins = byId('puzzle-coins');
  el.progress = byId('puzzle-progress');
  el.line = byId('puzzle-line');
  el.again = byId('puzzle-again');
  el.back = byId('puzzle-back');
}

function bind() {
  if (bound) {
    return;
  }
  bound = true;

  on(el.board, 'click', function (event) {
    if (views.staleTap(event) || round === null) {
      return;
    }
    const target = event.target;
    const node = target === null || typeof target.closest !== 'function'
      ? null
      : target.closest('.puzzle-tile');
    if (node === null || !el.board.contains(node)) {
      // A tap that landed between tiles still counts as a tap on the board, so a
      // pair left in view goes back down. Nothing else happens.
      handleEffect(clearPendingMiss(round));
      return;
    }
    handleEffect(applyTap(round, Number(node.dataset.index)));
  });

  on(el.again, 'click', function (event) {
    if (views.staleTap(event)) {
      return;
    }
    startRound(true);
  });

  /* main.js already binds every [data-back="garden"] control on the page. If the
     section html marks this button that way, binding it here as well would send
     the player back twice and move the focus twice, so it is left alone. */
  if (el.back !== null && el.back.getAttribute('data-back') !== 'garden') {
    on(el.back, 'click', function (event) {
      if (views.staleTap(event)) {
        return;
      }
      views.show('garden', true);
    });
  }
}

/* ---- exports ------------------------------------------------------------- */

/**
 * Build the board and wire it up.
 *
 * Every id is looked up here rather than at import time, so this module is safe
 * to load and safe to call before the puzzle section html exists. With no board
 * on the page it renders nothing, binds nothing and answers 0, which is also
 * what it does under plain node where there is no document at all.
 *
 * Calling it twice is safe: listeners go on once, and a round already in play is
 * left exactly as the player left it.
 *
 * @param {Object} options
 * @param {{show: Function, markShown: Function, staleTap: Function}} [options.views]
 *   The view handle from main.js. staleTap(event) guards every tap in here.
 * @param {Function} [options.onRoundComplete] Fired once, with no arguments, on
 *   the tap that finds the last pair. The payout is the glue's to pay.
 * @param {Function|number} [options.coins] Optional reader for the player's coin
 *   balance, since the economy lives in state and not in here. Left out, the
 *   #puzzle-coins node keeps whatever the section html put in it.
 * @returns {number} How many tiles are on the board, 0 when there is no board.
 */
export function initPuzzle(options) {
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
  onRoundComplete = typeof config.onRoundComplete === 'function' ? config.onRoundComplete : null;
  readCoins = typeof config.coins === 'function'
    ? config.coins
    : (Number.isFinite(config.coins) ? function () { return config.coins; } : null);

  cacheElements();
  if (el.board === null) {
    return 0;
  }

  ensureLive(el.progress);
  ensureLive(el.line);
  if (el.again !== null && el.again.textContent.trim() === '') {
    el.again.textContent = AGAIN_LABEL;
  }

  bind();
  if (round === null) {
    startRound(false);
  }
  return round.tiles.length;
}

/**
 * Redraw the coin pill from whatever reader init was given. The glue calls this
 * after paying, and again whenever it brings the puzzle back on screen with a
 * balance that may have moved in the shop.
 * @returns {boolean} True when a number was actually written.
 */
export function refreshPuzzleCoins() {
  if (el.coins === null || el.coins === undefined || readCoins === null) {
    return false;
  }
  const amount = readCoins();
  if (!Number.isFinite(amount)) {
    return false;
  }
  const whole = Math.floor(amount);
  el.coins.textContent = whole + coinWord(whole);
  return true;
}

/**
 * Whether the round on screen has found all its pairs. For QA, and for any glue
 * that needs to know without reaching into the board.
 * @returns {boolean}
 */
export function isRoundComplete() {
  return round !== null && round.complete === true;
}

/**
 * Pairs found in the round on screen.
 * @returns {number} 0 when no round has been dealt.
 */
export function pairsFound() {
  return round === null ? 0 : round.pairsFound;
}
