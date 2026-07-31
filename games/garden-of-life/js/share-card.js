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
const COLUMNS = 3;

/* The plot grid in card pixels. Three columns of 300 with 12 between them is
   924 wide, and four rows of 216 is 900 tall, which is the tallest grid that
   still leaves the caption and the footer room under it. Rows are centred
   across the card and the last one is centred on its own, so a garden of four
   is a row of three with the fourth under the middle of it rather than shoved
   against the left edge. */
const CELL_W = 300;
const CELL_H = 216;
const CELL_GAP = 12;

/* The space the grid and the caption share, between the rule under the title
   and the inside of the bottom border. The whole block is centred in it, which
   is what keeps a garden of two from sitting in a third of a card with the rest
   empty underneath. */
const BLOCK_TOP = 236;
const BLOCK_BOTTOM = 1316;

// Grid bottom to caption baseline, then caption baseline to footer baseline,
// then the footer's descenders.
const CAPTION_GAP = 76;
const CAPTION_CAP = 34;
const FOOTER_GAP = 50;
const FOOTER_TAIL = 10;

// The composer draws into a 136 by 160 viewBox. Kept exactly, because a plant
// squashed to fit a square stops looking like the plant in the plot.
const PLANT_RATIO = 160 / 136;
const PLANT_W = 164;

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
const FOOTER = 'Grown one memory at a time.';

const NOTE_WORKING = 'Getting your garden ready.';
const NOTE_SHARED = 'Sent. Your garden is on its way.';
const NOTE_CANCELLED = 'No problem. The picture stays here with you.';
const NOTE_DOWNLOADED = 'Saved to your downloads. It is yours to send to anyone you like.';
const NOTE_TROUBLE = 'The picture did not come out this time. Nothing is lost, try again in a moment.';
const NOTE_EMPTY = 'Plant one memory first, then there is a garden worth sending.';

/**
 * The caption under the plants. Counts what is actually there and says it
 * plainly, because a garden with two plants in it is still worth showing.
 * @param {number} count How many plants are on the card.
 * @returns {string}
 */
export function captionFor(count) {
  const whole = Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
  if (whole === 0) {
    return 'The soil is ready and waiting.';
  }
  if (whole === 1) {
    return 'One memory, planted and growing.';
  }
  return whole + ' memories, planted and growing.';
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

function wholeCount(value) {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

/**
 * Where the grid and the words sit for a garden of this size.
 *
 * The grid, the caption and the footer are one block, and the block is centred
 * in the space under the title. A full garden fills it and a garden of two sits
 * in the middle of the card with even paper above and below, which is the
 * difference between a card that looks composed and a card that looks like it
 * was waiting for more plants.
 *
 * @param {number} count Plants being drawn, 1 to 12.
 * @returns {{rows: number, gridTop: number, gridBottom: number,
 *   captionY: number, footerY: number}} All in card pixels.
 */
export function layoutFor(count) {
  const total = Math.min(wholeCount(count), MAX_PLANTS);
  const rows = total === 0 ? 1 : Math.ceil(total / COLUMNS);
  const gridH = rows * CELL_H + (rows - 1) * CELL_GAP;
  const blockH = gridH + CAPTION_GAP + CAPTION_CAP + FOOTER_GAP + FOOTER_TAIL;
  const room = BLOCK_BOTTOM - BLOCK_TOP;
  const slack = room - blockH;
  const gridTop = BLOCK_TOP + (slack > 0 ? Math.round(slack / 2) : 0);
  const gridBottom = gridTop + gridH;
  const captionY = gridBottom + CAPTION_GAP + CAPTION_CAP;
  return {
    rows: rows,
    gridTop: gridTop,
    gridBottom: gridBottom,
    captionY: captionY,
    footerY: captionY + FOOTER_GAP
  };
}

/**
 * Where one plant sits, by its position in the garden.
 *
 * Rows are centred across the card, including a last row that did not fill up,
 * so the shape of a small garden is deliberate rather than ragged.
 *
 * @param {number} index 0 based.
 * @param {number} [count=12] How many plants are on the card, which is what
 *   decides where the row it lives in starts.
 * @returns {{x: number, y: number, w: number, h: number}} The cell box.
 */
export function cellBox(index, count) {
  const total = Math.min(wholeCount(count) === 0 ? MAX_PLANTS : wholeCount(count), MAX_PLANTS);
  const at = Math.min(wholeCount(index), total - 1);
  const row = Math.floor(at / COLUMNS);
  const column = at % COLUMNS;
  const inThisRow = Math.min(total - row * COLUMNS, COLUMNS);
  const rowW = inThisRow * CELL_W + (inThisRow - 1) * CELL_GAP;
  return {
    x: Math.round((CARD_W - rowW) / 2) + column * (CELL_W + CELL_GAP),
    y: layoutFor(total).gridTop + row * (CELL_H + CELL_GAP),
    w: CELL_W,
    h: CELL_H
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

function drawPlot(ctx, pal, box) {
  ctx.fillStyle = pal.surface;
  roundedRect(ctx, box.x, box.y, box.w, box.h, 26);
  ctx.fill();
  ctx.strokeStyle = pal.border;
  ctx.lineWidth = 3;
  ctx.stroke();
}

function drawCaption(ctx, pal, count, layout) {
  ctx.textAlign = 'center';
  ctx.fillStyle = pal.text;
  ctx.font = font(46, '600');
  ctx.fillText(captionFor(count), CARD_W / 2, layout.captionY);

  ctx.fillStyle = pal.muted;
  ctx.font = font(34, '400');
  ctx.fillText(FOOTER, CARD_W / 2, layout.footerY);
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

  const height = PLANT_W * PLANT_RATIO;
  /* Every plant is rasterized before anything is drawn, so one slow drawing
     cannot leave a half painted card, and the plots underneath are laid down
     first either way. */
  const drawings = [];
  for (let i = 0; i < plants.length; i += 1) {
    const built = composeFor(plants[i]);
    const svg = built === null || typeof built !== 'object' ? '' : built.svg;
    drawings.push(await svgImage(svg, PLANT_W, height));
  }

  const layout = layoutFor(plants.length);
  for (let i = 0; i < plants.length; i += 1) {
    const box = cellBox(i, plants.length);
    drawPlot(ctx, pal, box);
    const img = drawings[i];
    if (img !== null) {
      ctx.drawImage(img, box.x + (box.w - PLANT_W) / 2, box.y + (box.h - height) / 2 + 6,
        PLANT_W, height);
    }
  }

  drawGardener(ctx, pal, await gardener);
  drawCaption(ctx, pal, plants.length, layout);

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

async function handOver(blob, filename) {
  const file = fileFrom(blob, filename);
  if (file !== null && canShareFile(file)) {
    try {
      await navigator.share({ files: [file], title: TITLE, text: FOOTER });
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
    const result = await handOver(blob, shareFilename(todayISO()));
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
