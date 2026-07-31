/*
  Garden of Life share card.

  One picture of the garden as it stands, drawn on a canvas in the page and
  handed to the player. Nothing is uploaded, nothing is stored, and there is no
  account anywhere in it. The only way the image leaves the phone is the OS
  share sheet the player opened themselves, and on a browser without that sheet
  it simply lands in their downloads.

  The plants are the same drawings the garden is showing, rasterized from the
  composer's own svg at each plant's current stage and thirst, so the card is a
  photograph of the garden rather than a second version of it that could drift.

  The caption counts memories and crops apart, because a card that calls a
  bought bayam a memory is the game telling a small lie about somebody's life.
  The grid is measured per garden for the same reason: whatever a player has,
  one plot or twelve, the card should look composed around it rather than laid
  out for a garden they do not have yet.

  Everything decorative is optional by contract. Auntie Bee's portrait is
  layered only if it loads, and her absence changes how the card looks and
  nothing about whether it works.

  Every id is queried lazily inside initShareCard, so the module loads clean
  long before the share button exists and answers false when it is not there.
*/

import { composePlant, composeCrop } from './composer.js';
import { getPlants, plantStage, isWilted, todayISO } from './state.js';

/* ---- the card ------------------------------------------------------------
   1080 by 1350 is the tall frame every phone gallery and every social app
   crops least badly, and it leaves room for twelve plants without shrinking a
   plant past the point where its species is readable. */

const CARD_W = 1080;
const CARD_H = 1350;

const MAX_PLANTS = 12;

/* The grid is measured rather than fixed. Three columns is as busy as this card
   is ever allowed to get and 924 is as wide as the grid gets on a 1080 card,
   but how many columns a garden actually uses, and how big a tile grows, are
   worked out per garden in layoutFor. A card holding one memory should show it
   large. A card holding twelve should show twelve. Nothing in between should
   look like it was laid out for somebody else's garden. */
const MAX_COLUMNS = 3;
const GRID_W = 924;
const CELL_GAP = 12;

/* Where a tile stops growing. Past this one plot is bigger than the card can
   carry gracefully and the plant inside starts reading as a poster rather than
   as something growing in a garden. */
const MAX_CELL_W = 620;
const MAX_CELL_H = 640;

/* How far a tile is allowed to stray from the shape of a plot. The game's own
   plot is 300 by 216, which is the widest shape here. The other way a tile is
   let go a little taller than it is wide, which is what lets a garden of two
   fill its half of the card instead of sitting in a wide letterbox, but not so
   far that a row of three turns into three tall slots with a plant rattling
   around in each. */
const CELL_ASPECT_WIDE = 300 / 216;
const CELL_ASPECT_TALL = 0.8;

/* Room inside a tile, as a share of the tile, so a big plot is not just a big
   empty frame. At 300 by 216 these come out as the 18 and 12 the card already
   had. SIT_DOWN settles the plant towards the soil instead of floating it in
   the middle, and it is always smaller than the padding, which is what stops
   the nudge from ever pushing a plant out of its own tile. */
const PAD_X = 0.06;
const PAD_Y = 0.055;
const SIT_DOWN = 0.028;

/* The space the grid and the words share, between the rule under the title and
   a comfortable margin above the drawn border. The whole block is centred in
   it, which is what keeps a garden of two from sitting in a third of a card
   with the rest empty around it. */
const BLOCK_TOP = 236;
const BLOCK_BOTTOM = 1292;

// Grid bottom to the caption baseline, then down through the warm line to the
// game's own name and its descenders. What is left over belongs to the grid.
const CAPTION_GAP = 62;
const CAPTION_CAP = 34;
const FOOTER_GAP = 50;
const BRAND_GAP = 42;
const BRAND_TAIL = 12;
const WORDS_H = CAPTION_GAP + CAPTION_CAP + FOOTER_GAP + BRAND_GAP + BRAND_TAIL;
const GRID_MAX_H = BLOCK_BOTTOM - BLOCK_TOP - WORDS_H;

/* The composer draws into a 136 by 160 viewBox. Kept exactly, because a plant
   squashed to fit a square stops looking like the plant in the plot. The plant
   is then fitted to whatever tile the layout settled on, by height and by
   width, which is why it cannot outgrow the tile it sits in at any count. */
const PLANT_RATIO = 160 / 136;

/* Caption sizes, largest first. A garden of memories and crops together has
   more to say than a garden of one thing, so the line steps down a size until
   it fits rather than walking off the edge of the paper. */
const CAPTION_SIZES = [46, 42, 38, 34];
const TEXT_W = CARD_W - 140;

/* Top left, small, like a stamp on a postcard. She sits clear of the centred
   title and well above the first row of plots, so the card is composed the same
   way whether or not her picture ever arrives. */
const GARDENER_ART = '/games/garden-of-life/art/gardener/welcome.png';
const GARDENER_W = 150;
const GARDENER_X = 60;
const GARDENER_Y = 46;

const FILE_TYPE = 'image/png';
const FILE_STEM = 'garden-of-life';

/* Fallbacks only. The live page owns these values in tokens.css, and the card
   reads them from there first so it can never drift from the game it is a
   picture of. */
const FALLBACK = {
  bg: '#fbf6ee',
  surface: '#fffcf7',
  sunk: '#f3ebde',
  text: '#241c14',
  muted: '#5a4a3a',
  border: '#9c8a6c',
  accent: '#1b5e38',
  tint: '#e7f0e6'
};

/* ---- copy ---------------------------------------------------------------
   The card is going to sit in somebody's photo roll and maybe in a family
   chat, so every line has to read well out of context and take nothing for
   granted about who is looking at it. */

const TITLE = 'Garden of Life';

/* The warm line under the caption. The game's own line is about memories, and
   on a card that happens to hold none it would be the same small lie the
   caption is careful not to tell, so a garden of crops gets the other one. */
const FOOTER = 'Grown one memory at a time.';
const FOOTER_CROPS = 'Grown one day at a time.';

/* The game signs its own name at the bottom, quietly. A card gets forwarded and
   cropped and screenshotted, and it should still say where it came from without
   anybody having to read the caption. No hashtags are baked in: those belong to
   whatever the player types when they post it, and an image cannot take them
   back afterwards. */
const BRAND = 'Garden of Life';

const NOTE_WORKING = 'Getting your garden ready.';
const NOTE_SHARED = 'Sent. Your garden is on its way.';
const NOTE_CANCELLED = 'No problem. The picture stays here with you.';
const NOTE_DOWNLOADED = 'Saved to your downloads. It is yours to send to anyone you like.';
const NOTE_TROUBLE = 'The picture did not come out this time. Nothing is lost, try again in a moment.';
const NOTE_EMPTY = 'Plant one memory first, then there is a garden worth sending.';

function wholeCount(value) {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

/* Counted things read warmer as words than as digits, and a card never holds
   more than twelve of anything, so the whole table fits here. */
const NUMBER_WORDS = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven',
  'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve'];

function countWord(n) {
  return n > 0 && n < NUMBER_WORDS.length ? NUMBER_WORDS[n] : String(n);
}

function memoryPhrase(n) {
  return countWord(n) + (n === 1 ? ' memory' : ' memories');
}

function cropPhrase(n) {
  return countWord(n) + (n === 1 ? ' plant' : ' plants');
}

function lowerFirst(text) {
  return text === '' ? '' : text.charAt(0).toLowerCase() + text.slice(1);
}

/**
 * The caption under the plants.
 *
 * Memories and crops are counted apart and named apart, because they are not
 * the same thing and the card must not say otherwise. A garden holding one
 * bought bayam has no memories in it at all, and calling it one memory would be
 * the card telling a small lie about somebody's own life. Either kind alone
 * gets its own sentence, and a garden holding both is told as both.
 *
 * @param {number} memories Plants grown from a told memory.
 * @param {number} [crops=0] Plants grown from a seed out of the shop.
 * @returns {string} One warm sentence, whatever the mix.
 */
export function captionFor(memories, crops) {
  const told = wholeCount(memories);
  const grown = wholeCount(crops);
  if (told === 0 && grown === 0) {
    return 'The soil is ready and waiting.';
  }
  if (grown === 0) {
    return memoryPhrase(told) + ', planted and growing.';
  }
  if (told === 0) {
    return cropPhrase(grown) + ', coming along nicely.';
  }
  return memoryPhrase(told) + ' and ' + lowerFirst(cropPhrase(grown)) +
    ', growing together.';
}

/**
 * The quiet line under the caption, and the words that go with the picture when
 * it leaves through a share sheet.
 *
 * @param {number} memories Plants grown from a told memory.
 * @param {number} [crops=0] Plants grown from a seed out of the shop.
 * @returns {string} The game's own line, unless the card holds no memories to
 *   have grown that way.
 */
export function footerFor(memories, crops) {
  return wholeCount(memories) === 0 && wholeCount(crops) > 0 ? FOOTER_CROPS : FOOTER;
}

/**
 * Sort a garden into the two things it can hold.
 *
 * State normalises every plant to a kind of memory or crop, so anything that is
 * not a crop is counted as a memory rather than being dropped: a card that
 * quietly loses a plot is worse than one that calls it by the commoner name.
 *
 * @param {Array<Object>} plants The plants being drawn.
 * @returns {{memories: number, crops: number, total: number}}
 */
export function tallyKinds(plants) {
  const list = Array.isArray(plants) ? plants : [];
  let crops = 0;
  let memories = 0;
  for (let i = 0; i < list.length; i += 1) {
    const plant = list[i];
    if (plant !== null && typeof plant === 'object' && plant.kind === 'crop') {
      crops += 1;
    } else if (plant !== null && typeof plant === 'object') {
      memories += 1;
    }
  }
  return { memories: memories, crops: crops, total: memories + crops };
}

/**
 * What the saved file is called. The day comes in rather than being read here,
 * so this stays pure and QA can build a filename for any date it likes.
 * @param {string} day An ISO day, normally state.todayISO().
 * @returns {string} For example garden-of-life-2026-08-01.png.
 */
export function shareFilename(day) {
  const iso = typeof day === 'string' ? day.slice(0, 10) : '';
  const safe = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : '';
  return safe === '' ? FILE_STEM + '.' + 'png' : FILE_STEM + '-' + safe + '.png';
}

/* How big the plant inside a tile of this size is. Fitted by height and by
   width both, so whichever room runs out first is the one that decides. This is
   the whole of the no-overflow rule and every drawn plant comes through it. */
function plantSize(cellW, cellH) {
  const roomH = cellH - 2 * Math.round(cellH * PAD_Y);
  const roomW = cellW - 2 * Math.round(cellW * PAD_X);
  const height = Math.max(Math.floor(Math.min(roomH, roomW * PLANT_RATIO)), 1);
  return { w: Math.max(Math.floor(height / PLANT_RATIO), 1), h: height };
}

/* What a garden of this size comes to laid out in this many columns. Tiles take
   what the grid and the band will give them, up to their own ceiling, and the
   shape is clamped both ways so a tile stays a plot. */
function fitColumns(count, columns) {
  const rows = Math.ceil(count / columns);
  let w = Math.min((GRID_W - (columns - 1) * CELL_GAP) / columns, MAX_CELL_W);
  let h = Math.min((GRID_MAX_H - (rows - 1) * CELL_GAP) / rows, MAX_CELL_H);
  if (w > h * CELL_ASPECT_WIDE) {
    w = h * CELL_ASPECT_WIDE;
  } else if (w < h * CELL_ASPECT_TALL) {
    h = w / CELL_ASPECT_TALL;
  }
  const cellW = Math.max(Math.floor(w), 1);
  const cellH = Math.max(Math.floor(h), 1);
  const plant = plantSize(cellW, cellH);
  return {
    columns: columns,
    rows: rows,
    cellW: cellW,
    cellH: cellH,
    plantW: plant.w,
    plantH: plant.h,
    /* How much plant the card ends up carrying. Keeping the arrangement that
       covers the most is what gives one memory a big plot and twelve the full
       grid, without either being written down here as a special case. */
    covered: count * plant.w * plant.h
  };
}

/**
 * The whole card worked out for a garden of this size.
 *
 * Columns, tile size, where the grid starts and where every line of words sits
 * are decided here and nowhere else. The arrangement is chosen by trying one,
 * two and three columns and keeping whichever puts the most plant on the paper,
 * so a garden of one is a single large plot instead of a small tile adrift in a
 * card sized for twelve, and every count in between is composed for the same
 * reason rather than by luck.
 *
 * The grid, the caption, the warm line and the game's name are one block, and
 * the block is centred in the space under the title.
 *
 * @param {number} count Plants being drawn. Under 1 is treated as 1 and over 12
 *   as 12, since twelve is all a card holds.
 * @returns {{count: number, columns: number, rows: number, cellW: number,
 *   cellH: number, plantW: number, plantH: number, gridW: number,
 *   gridH: number, gridTop: number, gridBottom: number, captionY: number,
 *   footerY: number, brandY: number}} All in card pixels.
 */
export function layoutFor(count) {
  const total = Math.min(Math.max(wholeCount(count), 1), MAX_PLANTS);

  // Widest first, so a tie between two arrangements keeps the one that spreads
  // across the card rather than the one that stacks down it.
  let best = null;
  for (let columns = Math.min(MAX_COLUMNS, total); columns >= 1; columns -= 1) {
    const fit = fitColumns(total, columns);
    if (best === null || fit.covered > best.covered) {
      best = fit;
    }
  }

  const across = Math.min(best.columns, total);
  const gridW = across * best.cellW + (across - 1) * CELL_GAP;
  const gridH = best.rows * best.cellH + (best.rows - 1) * CELL_GAP;
  const slack = (BLOCK_BOTTOM - BLOCK_TOP) - (gridH + WORDS_H);
  const gridTop = BLOCK_TOP + (slack > 0 ? Math.round(slack / 2) : 0);
  const gridBottom = gridTop + gridH;
  const captionY = gridBottom + CAPTION_GAP + CAPTION_CAP;
  const footerY = captionY + FOOTER_GAP;
  return {
    count: total,
    columns: best.columns,
    rows: best.rows,
    cellW: best.cellW,
    cellH: best.cellH,
    plantW: best.plantW,
    plantH: best.plantH,
    gridW: gridW,
    gridH: gridH,
    gridTop: gridTop,
    gridBottom: gridBottom,
    captionY: captionY,
    footerY: footerY,
    brandY: footerY + BRAND_GAP
  };
}

/**
 * Where one plant sits, by its place in the garden.
 *
 * Rows are centred across the card, including a last row that did not fill up,
 * so the shape of a small garden is deliberate rather than ragged. The plant's
 * own box comes back alongside the tile, already fitted and already settled
 * towards the soil, so nothing downstream has to work out whether it fits.
 *
 * @param {number} index 0 based.
 * @param {number} [count=12] How many plants are on the card, which is what
 *   decides how big a tile is and where the row it lives in starts.
 * @returns {{x: number, y: number, w: number, h: number, plantX: number,
 *   plantY: number, plantW: number, plantH: number}} The tile and the plant
 *   inside it, in card pixels.
 */
export function cellBox(index, count) {
  const asked = wholeCount(count);
  const plan = layoutFor(asked === 0 ? MAX_PLANTS : asked);
  const at = Math.min(wholeCount(index), plan.count - 1);
  const row = Math.floor(at / plan.columns);
  const column = at % plan.columns;
  const inThisRow = Math.min(plan.count - row * plan.columns, plan.columns);
  const rowW = inThisRow * plan.cellW + (inThisRow - 1) * CELL_GAP;
  const x = Math.round((CARD_W - rowW) / 2) + column * (plan.cellW + CELL_GAP);
  const y = plan.gridTop + row * (plan.cellH + CELL_GAP);
  return {
    x: x,
    y: y,
    w: plan.cellW,
    h: plan.cellH,
    plantX: x + Math.round((plan.cellW - plan.plantW) / 2),
    plantY: y + Math.round((plan.cellH - plan.plantH) / 2) +
      Math.round(plan.cellH * SIT_DOWN),
    plantW: plan.plantW,
    plantH: plan.plantH
  };
}

/**
 * Give a composed svg a size so it rasterizes the same way in every browser.
 *
 * The composer writes a viewBox and no width or height, which is right for a
 * plot that sizes itself with css and wrong for an Image, where a missing
 * intrinsic size is drawn as nothing by some engines. Pure string work on the
 * composer's own output.
 *
 * @param {string} svg The composer's svg string.
 * @param {number} width
 * @param {number} height
 * @returns {string} The same svg carrying width and height, or '' when it was
 *   handed something that is not an svg.
 */
export function sizedSvg(svg, width, height) {
  if (typeof svg !== 'string' || svg.indexOf('<svg') !== 0) {
    return '';
  }
  const w = Number.isFinite(width) && width > 0 ? Math.round(width) : 1;
  const h = Number.isFinite(height) && height > 0 ? Math.round(height) : 1;
  return '<svg width="' + w + '" height="' + h + '"' + svg.slice(4);
}

/* ---- module state -------------------------------------------------------- */

const el = { open: null, note: null };

let views = null;
let bound = false;

// One card at a time. Building crosses several awaits, and a second tap inside
// that window would race two downloads of the same garden.
let building = false;

/* ---- small helpers ------------------------------------------------------- */

function byId(id) {
  return document.getElementById(id);
}

function setNote(text) {
  if (el.note !== null) {
    el.note.textContent = text;
  }
}

// A region that changes under the player without them looking at it has to say
// so. Anything the section html already marks live is left exactly as it is.
function ensureLive(node) {
  if (node === null) {
    return;
  }
  const role = node.getAttribute('role');
  if (node.hasAttribute('aria-live') || role === 'status' || role === 'alert') {
    return;
  }
  node.setAttribute('aria-live', 'polite');
}

function token(name, fallback) {
  try {
    const value = getComputedStyle(document.documentElement).getPropertyValue(name);
    const text = typeof value === 'string' ? value.trim() : '';
    return text === '' ? fallback : text;
  } catch (error) {
    return fallback;
  }
}

function palette() {
  return {
    bg: token('--color-bg', FALLBACK.bg),
    surface: token('--color-surface', FALLBACK.surface),
    sunk: token('--color-surface-sunk', FALLBACK.sunk),
    text: token('--color-text', FALLBACK.text),
    muted: token('--color-text-muted', FALLBACK.muted),
    border: token('--color-border', FALLBACK.border),
    accent: token('--accent-garden', FALLBACK.accent),
    tint: token('--accent-garden-tint', FALLBACK.tint)
  };
}

function font(size, weight) {
  return weight + ' ' + size + 'px system-ui, -apple-system, "Segoe UI", Roboto, ' +
    '"Helvetica Neue", Arial, sans-serif';
}

function roundedRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

/* ---- loading pictures ----------------------------------------------------
   Both paths answer with null rather than rejecting. A card that throws
   because one drawing was slow is a card nobody gets. */

function loadImage(src, revoke) {
  return new Promise(function (resolve) {
    const img = new Image();
    img.decoding = 'async';
    img.addEventListener('load', function () {
      resolve(img);
    });
    img.addEventListener('error', function () {
      if (revoke) {
        URL.revokeObjectURL(src);
      }
      resolve(null);
    });
    img.src = src;
  });
}

/* An svg blob is same origin, so the canvas it is drawn onto stays clean and
   can be read back. The url is released either way, because twelve plants is
   twelve blobs and this runs every time the player taps share. */
async function svgImage(svg, width, height) {
  const sized = sizedSvg(svg, width, height);
  if (sized === '') {
    return null;
  }
  let url = '';
  try {
    const blob = new Blob([sized], { type: 'image/svg+xml;charset=utf-8' });
    url = URL.createObjectURL(blob);
    const img = await loadImage(url, false);
    return img;
  } catch (error) {
    return null;
  } finally {
    if (url !== '') {
      URL.revokeObjectURL(url);
    }
  }
}

/* ---- what goes on the card ----------------------------------------------- */

// The same call the plot makes, so the card shows the plant the player is
// looking at rather than a fresh interpretation of it.
function composeFor(plant) {
  const stage = plantStage(plant);
  const wilted = isWilted(plant);
  if (plant.kind === 'crop') {
    return composeCrop({ cropId: plant.cropId, stage: stage, wilted: wilted });
  }
  return composePlant({
    objectId: plant.objectId,
    tags: plant.tags,
    stage: stage,
    wilted: wilted,
    seed: Number.isFinite(plant.seed) && plant.seed > 0 ? plant.seed : undefined
  });
}

function readPlants() {
  let list = [];
  try {
    const all = getPlants();
    list = Array.isArray(all) ? all : [];
  } catch (error) {
    return [];
  }
  const kept = [];
  for (let i = 0; i < list.length && kept.length < MAX_PLANTS; i += 1) {
    const plant = list[i];
    if (plant !== null && typeof plant === 'object') {
      kept.push(plant);
    }
  }
  return kept;
}

/* ---- drawing ------------------------------------------------------------- */

/* Paper, not a flat fill. A wash from the top, a warmer pool behind the title
   and a lattice of soft dots at very low alpha, all at fixed positions: the
   card has to come out byte identical for the same garden, so there is not a
   dice roll anywhere in here. */
function drawPaper(ctx, pal) {
  ctx.fillStyle = pal.bg;
  ctx.fillRect(0, 0, CARD_W, CARD_H);

  const wash = ctx.createLinearGradient(0, 0, 0, CARD_H);
  wash.addColorStop(0, pal.tint);
  wash.addColorStop(0.45, pal.bg);
  wash.addColorStop(1, pal.sunk);
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, CARD_W, CARD_H);
  ctx.globalAlpha = 1;

  ctx.globalAlpha = 0.06;
  ctx.fillStyle = pal.border;
  for (let row = 0; row * 34 < CARD_H; row += 1) {
    const y = 18 + row * 34;
    const offset = row % 2 === 0 ? 0 : 17;
    for (let x = 18 + offset; x < CARD_W; x += 34) {
      ctx.beginPath();
      ctx.arc(x, y, 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;

  // A drawn edge, so the card reads as a card when it lands in a chat thread
  // on a white background.
  ctx.strokeStyle = pal.border;
  ctx.lineWidth = 6;
  roundedRect(ctx, 20, 20, CARD_W - 40, CARD_H - 40, 34);
  ctx.stroke();
}

function drawTitle(ctx, pal) {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = pal.accent;
  ctx.font = font(84, '700');
  ctx.fillText(TITLE, CARD_W / 2, 178);

  ctx.strokeStyle = pal.accent;
  ctx.globalAlpha = 0.45;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(CARD_W / 2 - 120, 214);
  ctx.lineTo(CARD_W / 2 + 120, 214);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

/* The corner and the line grow with the tile. A 26 pixel corner is right on a
   plot the size of a plot and looks like a scratch on one four times the size,
   and at the base tile these come out at exactly the 26 and 3 the card had. */
function drawPlot(ctx, pal, box) {
  ctx.fillStyle = pal.surface;
  roundedRect(ctx, box.x, box.y, box.w, box.h, Math.round(box.h * 0.12));
  ctx.fill();
  ctx.strokeStyle = pal.border;
  ctx.lineWidth = Math.max(3, Math.round(box.h * 0.014));
  ctx.stroke();
}

/* The biggest of the sizes that fits between the margins. A mixed garden of
   twelve has a longer sentence than a garden of one, and a line that runs off
   the paper is worse than a line one step smaller. */
function fitSize(ctx, text, sizes, weight) {
  for (let i = 0; i < sizes.length; i += 1) {
    ctx.font = font(sizes[i], weight);
    if (ctx.measureText(text).width <= TEXT_W) {
      return sizes[i];
    }
  }
  return sizes[sizes.length - 1];
}

function drawCaption(ctx, pal, tally, layout) {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';

  const caption = captionFor(tally.memories, tally.crops);
  ctx.fillStyle = pal.text;
  ctx.font = font(fitSize(ctx, caption, CAPTION_SIZES, '600'), '600');
  ctx.fillText(caption, CARD_W / 2, layout.captionY);

  ctx.fillStyle = pal.muted;
  ctx.font = font(34, '400');
  ctx.fillText(footerFor(tally.memories, tally.crops), CARD_W / 2, layout.footerY);

  /* The signature, and it stays quiet on purpose: it is there for the stranger
     two forwards down the chat who wonders what this is, not for the player who
     already knows. */
  ctx.fillStyle = pal.accent;
  ctx.globalAlpha = 0.7;
  ctx.font = font(30, '600');
  ctx.fillText(BRAND, CARD_W / 2, layout.brandY);
  ctx.globalAlpha = 1;
}

/* Layered only if she arrived, into a corner that is hers alone: nothing else
   is laid out around her, so a portrait that never loads leaves the card
   balanced rather than leaving a hole where she was meant to be. */
function drawGardener(ctx, pal, img) {
  if (img === null) {
    return;
  }
  const width = img.naturalWidth > 0 ? img.naturalWidth : GARDENER_W;
  const height = img.naturalHeight > 0 ? img.naturalHeight : GARDENER_W;
  const h = height * (GARDENER_W / width);
  ctx.save();
  roundedRect(ctx, GARDENER_X, GARDENER_Y, GARDENER_W, h, 24);
  ctx.clip();
  ctx.drawImage(img, GARDENER_X, GARDENER_Y, GARDENER_W, h);
  ctx.restore();
  ctx.strokeStyle = pal.border;
  ctx.lineWidth = 3;
  roundedRect(ctx, GARDENER_X, GARDENER_Y, GARDENER_W, h, 24);
  ctx.stroke();
}

async function paintCard(plants) {
  const canvas = document.createElement('canvas');
  canvas.width = CARD_W;
  canvas.height = CARD_H;
  const ctx = canvas.getContext('2d');
  if (ctx === null) {
    return null;
  }
  const pal = palette();

  drawPaper(ctx, pal);
  drawTitle(ctx, pal);

  // Her portrait is asked for first and waited on last, so it downloads while
  // the plants are being rasterized instead of after them.
  const gardener = loadImage(GARDENER_ART, false);

  /* One plan for the whole card, so the size a plant is rasterized at is the
     same size it is drawn at. Rasterizing at the drawn size is also why a big
     tile stays crisp instead of being a small drawing stretched. */
  const layout = layoutFor(plants.length);

  /* Every plant is rasterized before anything is drawn, so one slow drawing
     cannot leave a half painted card, and the plots underneath are laid down
     first either way. */
  const drawings = [];
  for (let i = 0; i < plants.length; i += 1) {
    const built = composeFor(plants[i]);
    const svg = built === null || typeof built !== 'object' ? '' : built.svg;
    drawings.push(await svgImage(svg, layout.plantW, layout.plantH));
  }

  for (let i = 0; i < plants.length; i += 1) {
    const box = cellBox(i, plants.length);
    drawPlot(ctx, pal, box);
    const img = drawings[i];
    if (img !== null) {
      ctx.drawImage(img, box.plantX, box.plantY, box.plantW, box.plantH);
    }
  }

  drawGardener(ctx, pal, await gardener);
  drawCaption(ctx, pal, tallyKinds(plants), layout);

  return canvas;
}

function toPngBlob(canvas) {
  return new Promise(function (resolve) {
    try {
      canvas.toBlob(function (blob) {
        resolve(blob === null || blob === undefined ? null : blob);
      }, FILE_TYPE);
    } catch (error) {
      // A tainted canvas answers here. Nothing to do but say so kindly.
      resolve(null);
    }
  });
}

/* ---- handing it over ------------------------------------------------------
   Two routes and one rule: the file only ever moves because the player asked
   it to, and this file never sends it anywhere itself. */

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  // Released on the next turn, because a url revoked in the same tick can beat
  // the download that was just asked for.
  setTimeout(function () {
    URL.revokeObjectURL(url);
  }, 0);
}

function canShareFile(file) {
  try {
    return typeof navigator !== 'undefined' && navigator !== null &&
      typeof navigator.share === 'function' &&
      typeof navigator.canShare === 'function' &&
      navigator.canShare({ files: [file] });
  } catch (error) {
    return false;
  }
}

function fileFrom(blob, filename) {
  try {
    if (typeof File !== 'function') {
      return null;
    }
    return new File([blob], filename, { type: FILE_TYPE });
  } catch (error) {
    return null;
  }
}

async function handOver(blob, filename, words) {
  const file = fileFrom(blob, filename);
  if (file !== null && canShareFile(file)) {
    try {
      await navigator.share({ files: [file], title: TITLE, text: words });
      return 'shared';
    } catch (error) {
      /* Backing out of a share sheet is an answer, not a fault: the player
         looked at it and decided not to. Anything else that goes wrong in the
         sheet lands here too, and falling through to a download would push a
         file at somebody who just said no. */
      return 'cancelled';
    }
  }
  downloadBlob(blob, filename);
  return 'downloaded';
}

/* ---- exports ------------------------------------------------------------- */

/**
 * Build a picture of the garden and hand it to the player.
 *
 * Safe to call from anywhere, and safe to call when nothing is wired: with no
 * canvas support, no plants or no way to save, it answers with a warm note and
 * a false rather than throwing. Runs inside the tap that called it, which is
 * what lets the share sheet open on the browsers that have one.
 *
 * @returns {Promise<string>} What happened: shared, cancelled, downloaded,
 *   empty, busy, or trouble. Never rejects.
 */
export async function shareGarden() {
  if (building) {
    return 'busy';
  }
  if (typeof document === 'undefined' || document === null) {
    return 'trouble';
  }

  const plants = readPlants();
  if (plants.length === 0) {
    // Nothing to send is not a failure, it is an invitation.
    setNote(NOTE_EMPTY);
    return 'empty';
  }

  building = true;
  setNote(NOTE_WORKING);
  try {
    const canvas = await paintCard(plants);
    if (canvas === null) {
      setNote(NOTE_TROUBLE);
      return 'trouble';
    }
    const blob = await toPngBlob(canvas);
    if (blob === null) {
      setNote(NOTE_TROUBLE);
      return 'trouble';
    }
    const said = tallyKinds(plants);
    const result = await handOver(blob, shareFilename(todayISO()),
      footerFor(said.memories, said.crops));
    if (result === 'shared') {
      setNote(NOTE_SHARED);
    } else if (result === 'cancelled') {
      setNote(NOTE_CANCELLED);
    } else {
      setNote(NOTE_DOWNLOADED);
    }
    return result;
  } catch (error) {
    /* Canvas work is the one place in this game that can run out of memory on
       an old phone. The player gets a line that says try again, and nothing
       about the garden has changed. */
    setNote(NOTE_TROUBLE);
    return 'trouble';
  } finally {
    building = false;
  }
}

/**
 * Wire the share button.
 *
 * The id is looked up here rather than at import time, so this module is safe
 * to load and safe to call before the button exists. With no button on the page
 * it binds nothing and answers false, which is also what it does under plain
 * node where there is no document at all.
 *
 * @param {Object} options
 * @param {{show: Function, markShown: Function, staleTap: Function}} [options.views]
 *   The view handle from main.js. staleTap(event) guards the tap.
 * @returns {boolean} True when a share button was found and wired.
 */
export function initShareCard(options) {
  if (typeof document === 'undefined' || document === null) {
    return false;
  }

  const config = options === null || typeof options !== 'object' ? {} : options;
  const handle = config.views === null || typeof config.views !== 'object' ? {} : config.views;
  views = {
    show: typeof handle.show === 'function' ? handle.show : function () {},
    markShown: typeof handle.markShown === 'function' ? handle.markShown : function () {},
    staleTap: typeof handle.staleTap === 'function' ? handle.staleTap : function () { return false; }
  };

  el.open = byId('open-share');
  el.note = byId('share-note');
  ensureLive(el.note);

  if (el.open === null) {
    return false;
  }
  if (bound) {
    return true;
  }
  bound = true;

  el.open.addEventListener('click', function (event) {
    if (views.staleTap(event)) {
      return;
    }
    shareGarden();
  });
  return true;
}
