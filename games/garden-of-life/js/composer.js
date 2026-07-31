/*
  Garden of Life plant composer.

  DOM free on purpose: it builds an SVG string, so the same function runs in the
  browser and under plain node for the contact sheet. Deterministic by
  construction, every random choice comes from one seeded rng, so a saved memory
  regrows exactly as it first appeared.

  Traits carry the meaning. The heritage object picks the species silhouette, the
  feeling picks the palette, the who picks the blooms, the where picks the
  ornament. The rng only jitters.

  Selection data lives in content/plant-traits.json and arrives through
  loadTraits. Builder functions stay here. Nothing in this module throws: with no
  traits, or unusable ones, every call answers with the neutral sprout.
*/

import { hashString, makeRng } from '../../../shared/ai.js';

/* ---- geometry ----------------------------------------------------------- */

const BASE_X = 60;
const SOIL_Y = 128;

/* The ornaments are drawn around a local origin and reach a long way left of it,
   the seaside wave furthest at -19.5 before its tilt. An outermost svg clips at
   its own viewport, so the box starts left of every one of them and gains the
   same width back on the right, which keeps the plant centred on BASE_X. */
const VIEW_MIN_X = -8;
const VIEW_WIDTH = 136;
const VIEW_HEIGHT = 160;

const POT_BODY = '#8a5a3b';
const POT_RIM = '#6f472c';
const SOIL = '#4a3524';
const WOOD = '#6b4423';
const ROOF = '#8f3f1d';
const CREAM = '#f2e6d2';

/* Wilt has to read at plot size without one shaming mark: the plant sags and its
   colours go thirsty. SUNK is the surface a plot sits on. Every palette colour is
   muted, then pushed back over WILT_MIN_CONTRAST against that surface, so a dry
   plant is never a faint plant. CREAM and the pot browns are fixed chrome that
   always sits inside a dark stroke, so they stay as they are. */
const SUNK = '#f3ebde';
const WILT_TINT = '#6f6a4a';
const WILT_MIX = 0.45;
const WILT_MIN_CONTRAST = 3.2;
const WILT_LEAN = 10;
const WILT_SQUASH = 0.9;
/* Young growth sags harder. Ten degrees on a stage 0 sprout moves its tip about
   five units inside a 136 unit box, which is nothing at plot size, so the sprout
   gets its own droop and its own squash rather than the grown plant's. */
const WILT_SPROUT_LEAN = 19;
const WILT_SPROUT_SQUASH = 0.76;

const NEUTRAL_PAL = {
  label: 'green',
  bloom1: '#4a8f3e',
  bloom2: '#33501f',
  leaf: '#4a6b2f',
  leafDark: '#33501f',
  accent: '#3d5c26'
};

const MOTIFS = ['petals', 'layered', 'simple', 'dot', 'bell'];
const PLACEMENTS = ['single', 'pair', 'spread', 'cluster'];
const ORNAMENT_DRAWS = ['kampung', 'first-flat', 'kopitiam', 'market', 'seaside'];
const ARCHETYPES = ['leafy', 'fruiting', 'climbing', 'herb'];
const PRICE_TIERS = ['common', 'uncommon', 'rare'];
const CROP_FORMS = ['broad', 'arrow', 'heart', 'upright', 'pod', 'round', 'citrus', 'strap', 'rhizome'];

const GROWTH_WORDS = ['just sprouting', 'half grown', 'in full bloom'];
const CROP_GROWTH_WORDS = ['just sprouting', 'half grown', 'ready to pick'];
const THIRSTY = ', waiting for water';

/* ---- small maths -------------------------------------------------------- */

function r2(value) {
  return Math.round(value * 100) / 100;
}

function cubicAt(points, t) {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  return {
    x: a * points[0][0] + b * points[1][0] + c * points[2][0] + d * points[3][0],
    y: a * points[0][1] + b * points[1][1] + c * points[2][1] + d * points[3][1]
  };
}

function cubicAngle(points, t) {
  const step = t > 0.98 ? -0.02 : 0.02;
  const here = cubicAt(points, t);
  const there = cubicAt(points, t + step);
  const dx = (there.x - here.x) * (step > 0 ? 1 : -1);
  const dy = (there.y - here.y) * (step > 0 ? 1 : -1);
  return (Math.atan2(dy, dx) * 180) / Math.PI;
}

// A pointed leaf blade: two mirrored curves from the stalk out to a tip.
function blade(x, y, angleDeg, len, width) {
  const a = (angleDeg * Math.PI) / 180;
  const tipX = x + Math.cos(a) * len;
  const tipY = y + Math.sin(a) * len;
  const midX = x + Math.cos(a) * len * 0.5;
  const midY = y + Math.sin(a) * len * 0.5;
  const px = Math.cos(a + Math.PI / 2) * width;
  const py = Math.sin(a + Math.PI / 2) * width;
  return 'M' + r2(x) + ' ' + r2(y) +
    ' Q' + r2(midX + px) + ' ' + r2(midY + py) + ' ' + r2(tipX) + ' ' + r2(tipY) +
    ' Q' + r2(midX - px) + ' ' + r2(midY - py) + ' ' + r2(x) + ' ' + r2(y) + ' Z';
}

// A leaf with two shoulders at the stalk and a point at the far end. The stalk
// meets the notch between the shoulders, which is what makes it read as a heart.
function heartLeaf(x, y, angleDeg, len, halfWidth) {
  const a = (angleDeg * Math.PI) / 180;
  const dx = Math.cos(a);
  const dy = Math.sin(a);
  const nx = -dy;
  const ny = dx;
  const tipX = x + dx * len;
  const tipY = y + dy * len;
  return 'M' + r2(x) + ' ' + r2(y) +
    ' C' + r2(x + nx * halfWidth - dx * len * 0.12) + ' ' + r2(y + ny * halfWidth - dy * len * 0.12) +
    ' ' + r2(x + nx * halfWidth * 0.9 + dx * len * 0.62) + ' ' + r2(y + ny * halfWidth * 0.9 + dy * len * 0.62) +
    ' ' + r2(tipX) + ' ' + r2(tipY) +
    ' C' + r2(x - nx * halfWidth * 0.9 + dx * len * 0.62) + ' ' + r2(y - ny * halfWidth * 0.9 + dy * len * 0.62) +
    ' ' + r2(x - nx * halfWidth - dx * len * 0.12) + ' ' + r2(y - ny * halfWidth - dy * len * 0.12) +
    ' ' + r2(x) + ' ' + r2(y) + ' Z';
}

function jitter(rng, spread) {
  return (rng() - 0.5) * spread;
}

// Middle of a fan first, then alternating outward. One or two blooms then land in
// the centre of the plant instead of bunching on whichever arm was drawn first,
// which is what made low bloom counts look like they had slipped left.
function centerOutOrder(count) {
  const order = [];
  const mid = (count - 1) / 2;
  for (let i = 0; i < count; i += 1) {
    order.push(i);
  }
  order.sort(function (a, b) {
    const da = Math.abs(a - mid);
    const db = Math.abs(b - mid);
    return da === db ? a - b : da - db;
  });
  return order;
}

/* ---- colour ------------------------------------------------------------- */

function clampByte(value) {
  if (!Number.isFinite(value)) {
    return 0;
  }
  if (value < 0) {
    return 0;
  }
  if (value > 255) {
    return 255;
  }
  return Math.round(value);
}

function parseHex(value) {
  if (typeof value !== 'string') {
    return null;
  }
  const text = value.trim();
  if (!/^#[0-9a-fA-F]{6}$/.test(text)) {
    return null;
  }
  return {
    r: parseInt(text.slice(1, 3), 16),
    g: parseInt(text.slice(3, 5), 16),
    b: parseInt(text.slice(5, 7), 16)
  };
}

function toHex(rgb) {
  const parts = [clampByte(rgb.r), clampByte(rgb.g), clampByte(rgb.b)];
  let out = '#';
  for (let i = 0; i < parts.length; i += 1) {
    const piece = parts[i].toString(16);
    out += piece.length === 1 ? '0' + piece : piece;
  }
  return out;
}

function hexOr(value, fallback) {
  return parseHex(value) === null ? fallback : value.trim().toLowerCase();
}

function mixRgb(a, b, amount) {
  return {
    r: a.r * (1 - amount) + b.r * amount,
    g: a.g * (1 - amount) + b.g * amount,
    b: a.b * (1 - amount) + b.b * amount
  };
}

function channelLum(byte) {
  const c = byte / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function relLuminance(rgb) {
  return 0.2126 * channelLum(rgb.r) + 0.7152 * channelLum(rgb.g) + 0.0722 * channelLum(rgb.b);
}

function contrastRatio(a, b) {
  const la = relLuminance(a);
  const lb = relLuminance(b);
  const hi = la > lb ? la : lb;
  const lo = la > lb ? lb : la;
  return (hi + 0.05) / (lo + 0.05);
}

// Muting can push a colour towards the background. Darkening always walks away
// from a light surface, so the floor is reachable in a fixed number of steps.
function floorContrast(rgb, background, minRatio) {
  let current = { r: rgb.r, g: rgb.g, b: rgb.b };
  for (let i = 0; i < 24; i += 1) {
    if (contrastRatio(current, background) >= minRatio) {
      return current;
    }
    current = { r: current.r * 0.88, g: current.g * 0.88, b: current.b * 0.88 };
  }
  return current;
}

function thirstyHex(hex, background) {
  const rgb = parseHex(hex);
  if (rgb === null) {
    return NEUTRAL_PAL.leafDark;
  }
  const tint = parseHex(WILT_TINT);
  return toHex(floorContrast(mixRgb(rgb, tint, WILT_MIX), background, WILT_MIN_CONTRAST));
}

// Thirsty, not dead: colours dry towards a muted olive and never towards grey or
// red, and the palette keeps its own label so the plant is still "the amber one".
function thirstyPalette(pal) {
  const background = parseHex(SUNK);
  return {
    label: pal.label,
    bloom1: thirstyHex(pal.bloom1, background),
    bloom2: thirstyHex(pal.bloom2, background),
    leaf: thirstyHex(pal.leaf, background),
    leafDark: thirstyHex(pal.leafDark, background),
    accent: thirstyHex(pal.accent, background)
  };
}

/* ---- input guards ------------------------------------------------------- */

function esc(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function str(value, fallback) {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : fallback;
}

function num(value, fallback, min, max) {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  if (parsed < min) {
    return min;
  }
  if (parsed > max) {
    return max;
  }
  return parsed;
}

function pickFrom(value, allowed, fallback) {
  return typeof value === 'string' && allowed.indexOf(value) !== -1 ? value : fallback;
}

function stageIndex(value) {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    return 2;
  }
  const rounded = Math.round(parsed);
  if (rounded < 0) {
    return 0;
  }
  if (rounded > 2) {
    return 2;
  }
  return rounded;
}

function resolveSeed(given, key) {
  if (typeof given === 'number' && Number.isFinite(given)) {
    return given >>> 0;
  }
  if (typeof given === 'string' && given.trim() !== '') {
    return hashString(given);
  }
  return hashString(key);
}

/* ---- traits ------------------------------------------------------------- */

/* Null until the game injects content/plant-traits.json. Every map is built with
   a null prototype so a stray objectId like "constructor" can never resolve to
   something inherited. */
let traits = null;

function normalisePalette(entry) {
  const source = entry === null || typeof entry !== 'object' ? {} : entry;
  return {
    label: str(source.label, NEUTRAL_PAL.label),
    bloom1: hexOr(source.bloom1, NEUTRAL_PAL.bloom1),
    bloom2: hexOr(source.bloom2, NEUTRAL_PAL.bloom2),
    leaf: hexOr(source.leaf, NEUTRAL_PAL.leaf),
    leafDark: hexOr(source.leafDark, NEUTRAL_PAL.leafDark),
    accent: hexOr(source.accent, NEUTRAL_PAL.accent)
  };
}

function normaliseStages(value) {
  const list = Array.isArray(value) ? value : [];
  const fallbackScale = [0.45, 0.75, 1];
  const out = [];
  for (let i = 0; i < 3; i += 1) {
    const entry = list[i] === null || typeof list[i] !== 'object' ? {} : list[i];
    out.push({
      scale: num(entry.scale, fallbackScale[i], 0.15, 1.6),
      blooms: entry.blooms === undefined ? i === 2 : entry.blooms === true,
      ornament: entry.ornament === undefined ? i > 0 : entry.ornament === true,
      sprout: entry.sprout === undefined ? i === 0 : entry.sprout === true
    });
  }
  return out;
}

function normaliseBloom(entry) {
  const source = entry === null || typeof entry !== 'object' ? {} : entry;
  return {
    motif: pickFrom(source.motif, MOTIFS, 'simple'),
    count: Math.round(num(source.count, 1, 1, 12)),
    placement: pickFrom(source.placement, PLACEMENTS, 'spread'),
    size: num(source.size, 6, 1.5, 16)
  };
}

function normaliseCrop(entry) {
  const source = entry === null || typeof entry !== 'object' ? {} : entry;
  const archetype = pickFrom(source.archetype, ARCHETYPES, 'leafy');
  const defaultForm = { leafy: 'broad', fruiting: 'round', climbing: 'pod', herb: 'strap' };
  return {
    label: str(source.label, 'Crop'),
    archetype: archetype,
    form: pickFrom(source.form, CROP_FORMS, defaultForm[archetype]),
    palette: str(source.palette, ''),
    priceTier: pickFrom(source.price_tier, PRICE_TIERS, 'common'),
    stages: normaliseStages(source.stages)
  };
}

function firstKeyOr(map, wanted, keys) {
  return typeof wanted === 'string' && map[wanted] ? wanted : keys[0];
}

/**
 * Inject the parsed content/plant-traits.json. Until this lands, and after it is
 * handed anything unusable, every compose call answers with the neutral sprout
 * instead of throwing. Partial files are absorbed rather than rejected: a missing
 * object mapping or an unknown trait value falls back to the defaults block, and
 * only a file with no usable species, palettes, blooms or ornaments is refused.
 * @param {Object} data Parsed plant-traits.json.
 * @returns {boolean} True when the file was accepted and is now in use.
 */
export function loadTraits(data) {
  try {
    if (data === null || typeof data !== 'object') {
      traits = null;
      return false;
    }

    const species = Object.create(null);
    const rawSpecies = data.species === null || typeof data.species !== 'object' ? {} : data.species;
    const speciesIds = Object.keys(rawSpecies);
    for (let i = 0; i < speciesIds.length; i += 1) {
      const id = speciesIds[i];
      if (!SPECIES_BUILDERS[id]) {
        continue;
      }
      const entry = rawSpecies[id] === null || typeof rawSpecies[id] !== 'object' ? {} : rawSpecies[id];
      species[id] = { label: str(entry.label, id), stages: normaliseStages(entry.stages) };
    }

    const palettes = Object.create(null);
    const rawPalettes = data.palettes === null || typeof data.palettes !== 'object' ? {} : data.palettes;
    const paletteIds = Object.keys(rawPalettes);
    for (let i = 0; i < paletteIds.length; i += 1) {
      palettes[paletteIds[i]] = normalisePalette(rawPalettes[paletteIds[i]]);
    }

    const blooms = Object.create(null);
    const rawBlooms = data.blooms === null || typeof data.blooms !== 'object' ? {} : data.blooms;
    const bloomIds = Object.keys(rawBlooms);
    for (let i = 0; i < bloomIds.length; i += 1) {
      blooms[bloomIds[i]] = normaliseBloom(rawBlooms[bloomIds[i]]);
    }

    const ornaments = Object.create(null);
    const rawOrnaments = data.ornaments === null || typeof data.ornaments !== 'object' ? {} : data.ornaments;
    const ornamentIds = Object.keys(rawOrnaments);
    for (let i = 0; i < ornamentIds.length; i += 1) {
      const entry = rawOrnaments[ornamentIds[i]];
      const source = entry === null || typeof entry !== 'object' ? {} : entry;
      ornaments[ornamentIds[i]] = { draw: pickFrom(source.draw, ORNAMENT_DRAWS, 'kampung') };
    }

    const crops = Object.create(null);
    const rawCrops = data.crops === null || typeof data.crops !== 'object' ? {} : data.crops;
    const cropIds = Object.keys(rawCrops);
    for (let i = 0; i < cropIds.length; i += 1) {
      crops[cropIds[i]] = normaliseCrop(rawCrops[cropIds[i]]);
    }

    const speciesKeys = Object.keys(species);
    const paletteKeys = Object.keys(palettes);
    const bloomKeys = Object.keys(blooms);
    const ornamentKeys = Object.keys(ornaments);
    if (speciesKeys.length === 0 || paletteKeys.length === 0 ||
      bloomKeys.length === 0 || ornamentKeys.length === 0) {
      traits = null;
      return false;
    }

    const speciesByObject = Object.create(null);
    const rawMap = data.species_by_object === null || typeof data.species_by_object !== 'object'
      ? {} : data.species_by_object;
    const objectIds = Object.keys(rawMap);
    for (let i = 0; i < objectIds.length; i += 1) {
      const target = rawMap[objectIds[i]];
      if (typeof target === 'string' && species[target]) {
        speciesByObject[objectIds[i]] = target;
      }
    }

    const rawDefaults = data.defaults === null || typeof data.defaults !== 'object' ? {} : data.defaults;
    const cropKeys = Object.keys(crops);
    const defaults = {
      species: firstKeyOr(species, rawDefaults.species, speciesKeys),
      palette: firstKeyOr(palettes, rawDefaults.palette, paletteKeys),
      bloom: firstKeyOr(blooms, rawDefaults.bloom, bloomKeys),
      ornament: firstKeyOr(ornaments, rawDefaults.ornament, ornamentKeys),
      crop: cropKeys.length === 0 ? '' : firstKeyOr(crops, rawDefaults.crop, cropKeys)
    };

    traits = {
      speciesByObject: speciesByObject,
      species: species,
      palettes: palettes,
      blooms: blooms,
      ornaments: ornaments,
      crops: crops,
      defaults: defaults
    };
    return true;
  } catch (error) {
    traits = null;
    return false;
  }
}

/* ---- species silhouettes ------------------------------------------------ */
/* Each returns { stem, leaves, anchors, lean } and may add motif to override the
   bloom shape the trait would otherwise pick, or clusterScale to tighten a
   cluster. Anchors are candidate bloom points, best first, at least eight so
   seven scattered blooms always fit. An anchor that keeps a stem point hangs its
   bloom from a pedicel drawn back to it, which is what turns the wire lily into
   a spray of hanging bells. */

const VINE_A = [[60, 128], [38, 112], [84, 98], [62, 80]];
const VINE_B = [[62, 80], [42, 64], [80, 48], [58, 26]];

function vineAt(t) {
  return t <= 0.5 ? cubicAt(VINE_A, t * 2) : cubicAt(VINE_B, (t - 0.5) * 2);
}

function vineAngle(t) {
  return t <= 0.5 ? cubicAngle(VINE_A, t * 2) : cubicAngle(VINE_B, (t - 0.5) * 2);
}

function kopiVine(rng, pal) {
  const stem = '<path d="M60 128 C38 112 84 98 62 80 C42 64 80 48 58 26" fill="none" stroke="' +
    pal.leafDark + '" stroke-width="4.5" stroke-linecap="round"/>';

  const count = 5 + Math.floor(rng() * 3);
  const leaves = [];
  for (let i = 0; i < count; i += 1) {
    const t = 0.16 + (i / (count - 1)) * 0.74;
    const point = vineAt(t);
    const angle = vineAngle(t);
    const side = i % 2 === 0 ? 1 : -1;
    const normal = ((angle + 90 * side) * Math.PI) / 180;
    const cx = point.x + Math.cos(normal) * 9.5;
    const cy = point.y + Math.sin(normal) * 9.5;
    leaves.push('<ellipse cx="' + r2(cx) + '" cy="' + r2(cy) + '" rx="8.5" ry="6.6" fill="' +
      pal.leaf + '" transform="rotate(' + r2(angle + jitter(rng, 14)) + ' ' + r2(cx) + ' ' + r2(cy) + ')"/>');
  }

  const anchors = [];
  for (let i = 0; i < 8; i += 1) {
    const t = 1 - i * 0.075;
    const point = vineAt(t);
    const side = i % 2 === 0 ? 1 : -1;
    anchors.push({ x: point.x + side * 4.5, y: point.y - 1, stem: null });
  }

  return { stem: stem, leaves: leaves.join(''), anchors: anchors, lean: jitter(rng, 7) };
}

const ARCH = [[60, 128], [52, 92], [66, 50], [94, 46]];

function threadOrchid(rng, pal) {
  const stem = '<path d="M60 128 C52 92 66 50 94 46" fill="none" stroke="' + pal.leafDark +
    '" stroke-width="4" stroke-linecap="round"/>';

  const leaves = [];
  const angles = [-131, -107, -73, -49];
  for (let i = 0; i < angles.length; i += 1) {
    const len = 30 + rng() * 9;
    leaves.push('<path d="' + blade(BASE_X, SOIL_Y - 2, angles[i] + jitter(rng, 6), len, 4.6) +
      '" fill="' + pal.leaf + '"/>');
  }

  // Wide enough steps down the arch that seven small blooms never fuse.
  const anchors = [];
  for (let i = 0; i < 8; i += 1) {
    const t = 1 - i * 0.105;
    const point = cubicAt(ARCH, t);
    anchors.push({ x: point.x, y: point.y + 4, stem: null });
  }

  return { stem: stem, leaves: leaves.join(''), anchors: anchors, lean: jitter(rng, 5) };
}

function stackedBamboo(rng, pal) {
  const stalks = rng() < 0.5 ? 2 : 3;
  const stems = [];
  const leaves = [];
  const anchors = [];

  for (let i = 0; i < stalks; i += 1) {
    const x = BASE_X + (i - (stalks - 1) / 2) * 17;
    const top = 42 + i * 7 + jitter(rng, 6);
    stems.push('<path d="M' + r2(x) + ' 128 L' + r2(x) + ' ' + r2(top) + '" fill="none" stroke="' +
      pal.leafDark + '" stroke-width="7" stroke-linecap="round"/>');
    for (let y = 118; y > top + 6; y -= 15) {
      stems.push('<path d="M' + r2(x - 5) + ' ' + r2(y) + ' L' + r2(x + 5) + ' ' + r2(y) +
        '" stroke="' + pal.leaf + '" stroke-width="2.6" stroke-linecap="round"/>');
    }
    const side = i % 2 === 0 ? -1 : 1;
    leaves.push('<path d="' + blade(x, top + 20, side < 0 ? -155 : -25, 18 + rng() * 5, 4.4) +
      '" fill="' + pal.leaf + '"/>');
    leaves.push('<path d="' + blade(x, top + 38, side < 0 ? -25 : -155, 16 + rng() * 5, 4.2) +
      '" fill="' + pal.leaf + '"/>');
    for (let k = 0; k < 3; k += 1) {
      anchors.push({ x: x + (k % 2 === 0 ? 5 : -5), y: top + 3 + k * 9, stem: null });
    }
  }

  while (anchors.length < 8) {
    const source = anchors[anchors.length - 3];
    anchors.push({ x: source.x + 6, y: source.y + 9, stem: null });
  }

  return { stem: stems.join(''), leaves: leaves.join(''), anchors: anchors, lean: jitter(rng, 3) };
}

// One tall stem, one big face. The petal ring and disc live in the leaves layer
// so the trait blooms still land last, as inner dots on the face rather than a
// second ring of flowers fighting the first.
const SUNBURST_TOP = 46;
const SUNBURST_DISC = 15;

function sunburstBloom(rng, pal) {
  const stem = '<path d="M60 128 L60 ' + SUNBURST_TOP + '" fill="none" stroke="' + pal.leafDark +
    '" stroke-width="7" stroke-linecap="round"/>';

  const parts = [];
  // Lowest leaf goes right, so it does not sit on the ornament tucked left of the pot.
  const spots = [104, 88, 72];
  const leafCount = 2 + Math.floor(rng() * 2);
  for (let i = 0; i < leafCount; i += 1) {
    const side = i % 2 === 0 ? 1 : -1;
    const angle = (side < 0 ? -158 : -22) + jitter(rng, 9);
    const rad = (angle * Math.PI) / 180;
    const reach = 17 + rng() * 3;
    const lx = BASE_X + Math.cos(rad) * reach;
    const ly = spots[i] + Math.sin(rad) * reach;
    parts.push('<ellipse cx="' + r2(lx) + '" cy="' + r2(ly) + '" rx="15" ry="9.5" fill="' +
      (i % 2 === 0 ? pal.leaf : pal.leafDark) + '" transform="rotate(' + r2(angle) + ' ' +
      r2(lx) + ' ' + r2(ly) + ')"/>');
  }

  const petals = 11 + Math.floor(rng() * 3);
  const step = 360 / petals;
  for (let i = 0; i < petals; i += 1) {
    const angle = -90 + i * step + jitter(rng, 3);
    const rad = (angle * Math.PI) / 180;
    const px = BASE_X + Math.cos(rad) * 24;
    const py = SUNBURST_TOP + Math.sin(rad) * 24;
    parts.push('<ellipse cx="' + r2(px) + '" cy="' + r2(py) + '" rx="11" ry="5.2" fill="' +
      pal.bloom1 + '" transform="rotate(' + r2(angle) + ' ' + r2(px) + ' ' + r2(py) + ')"/>');
  }
  for (let i = 0; i < petals; i += 1) {
    const angle = -90 + (i + 0.5) * step;
    const rad = (angle * Math.PI) / 180;
    const px = BASE_X + Math.cos(rad) * 18;
    const py = SUNBURST_TOP + Math.sin(rad) * 18;
    parts.push('<ellipse cx="' + r2(px) + '" cy="' + r2(py) + '" rx="8" ry="4" fill="' +
      pal.bloom2 + '" transform="rotate(' + r2(angle) + ' ' + r2(px) + ' ' + r2(py) + ')"/>');
  }
  parts.push('<circle cx="' + BASE_X + '" cy="' + SUNBURST_TOP + '" r="' + SUNBURST_DISC +
    '" fill="' + CREAM + '" stroke="' + pal.accent + '" stroke-width="3"/>');

  const anchors = [{ x: BASE_X, y: SUNBURST_TOP, stem: null }];
  for (let i = 0; i < 7; i += 1) {
    const angle = ((-90 + i * (360 / 7)) * Math.PI) / 180;
    anchors.push({
      x: BASE_X + Math.cos(angle) * 9.5,
      y: SUNBURST_TOP + Math.sin(angle) * 9.5,
      stem: null
    });
  }

  // The face is the frame here, so a cluster tightens up to stay on the disc.
  return {
    stem: stem,
    leaves: parts.join(''),
    anchors: anchors,
    lean: jitter(rng, 4),
    clusterScale: 0.74
  };
}

/* The kampung house grows an attap fern: a steep thatched roof of two leaf slabs
   over a trunk that stands on stilts. One wide triangle on a narrow leg, which is
   a shape none of the other seven can be mistaken for. */
const ATTAP_APEX_Y = 44;
const ATTAP_EAVE_Y = 86;
const ATTAP_SPAN = 34;
const ATTAP_FLOOR_Y = 96;

function attapFern(rng, pal) {
  // The trunk runs the whole way into the apex and the floor beam carries the
  // eaves, otherwise the roof reads as a chevron hovering over a seedling.
  const stems = ['<path d="M60 128 L60 ' + (ATTAP_APEX_Y + 6) + '" fill="none" stroke="' +
    pal.leafDark + '" stroke-width="7" stroke-linecap="round"/>'];
  stems.push('<path d="M' + (BASE_X - 22) + ' ' + ATTAP_FLOOR_Y + ' H' + (BASE_X + 22) +
    '" stroke="' + pal.leafDark + '" stroke-width="5" stroke-linecap="round"/>');
  const splay = 15 + rng() * 3;
  stems.push('<path d="M' + (BASE_X - 12) + ' ' + ATTAP_FLOOR_Y + ' L' + r2(BASE_X - splay) +
    ' 128 M' + (BASE_X + 12) + ' ' + ATTAP_FLOOR_Y + ' L' + r2(BASE_X + splay) +
    ' 128" fill="none" stroke="' + pal.leafDark + '" stroke-width="4.2" stroke-linecap="round"/>');

  const leaves = [];
  const pitch = ATTAP_EAVE_Y - ATTAP_APEX_Y;
  for (let side = -1; side <= 1; side += 2) {
    const eaveX = BASE_X + side * ATTAP_SPAN;
    leaves.push('<path d="M' + BASE_X + ' ' + ATTAP_APEX_Y + ' L' + r2(eaveX) + ' ' + ATTAP_EAVE_Y +
      '" fill="none" stroke="' + pal.leaf + '" stroke-width="14" stroke-linecap="round"/>');
    // Thatch ribs run across the slab, which is what stops it reading as a bar.
    const spread = Math.sqrt(ATTAP_SPAN * ATTAP_SPAN + pitch * pitch);
    const ux = (side * ATTAP_SPAN) / spread;
    const uy = pitch / spread;
    const ribs = [0.28, 0.52, 0.76];
    for (let i = 0; i < ribs.length; i += 1) {
      const t = ribs[i] + jitter(rng, 0.05);
      const px = BASE_X + ux * spread * t;
      const py = ATTAP_APEX_Y + uy * spread * t;
      leaves.push('<path d="M' + r2(px - uy * 6.4) + ' ' + r2(py + ux * 6.4) + ' L' +
        r2(px + uy * 6.4) + ' ' + r2(py - ux * 6.4) + '" stroke="' + pal.leafDark +
        '" stroke-width="2.2" stroke-linecap="round"/>');
    }
    // A low frond either side of the doorway, the verandah greenery.
    leaves.push('<path d="' + blade(BASE_X + side * 7, 110, side < 0 ? -161 : -19, 18 + rng() * 4, 4.8) +
      '" fill="' + pal.leaf + '"/>');
  }
  leaves.push('<path d="M47 55 L60 41 L73 55" fill="none" stroke="' + pal.leafDark +
    '" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"/>');

  const anchors = [{ x: BASE_X, y: ATTAP_APEX_Y - 10, stem: null }];
  const along = [0.34, 0.62, 0.9];
  for (let i = 0; i < along.length; i += 1) {
    const t = along[i];
    const reach = ATTAP_SPAN * t;
    const drop = ATTAP_APEX_Y + pitch * t - 6.4;
    anchors.push({ x: BASE_X - reach - 7.8, y: drop, stem: null });
    anchors.push({ x: BASE_X + reach + 7.8, y: drop, stem: null });
  }
  anchors.push({ x: BASE_X, y: ATTAP_EAVE_Y - 8, stem: null });

  return { stem: stems.join(''), leaves: leaves.join(''), anchors: anchors, lean: jitter(rng, 3) };
}

/* The rediffusion set grows a wire lily: one upright stem, a ringed grille where
   the speaker sat, and a spray of wires arcing down and out with a bell hanging
   from each. The bloom trait keeps the count and the layout, the species claims
   the shape, so every wire lily rings. */
const WIRE_HUB_Y = 48;

function wireLily(rng, pal) {
  const stem = '<path d="M60 128 L60 ' + WIRE_HUB_Y + '" fill="none" stroke="' + pal.leafDark +
    '" stroke-width="5" stroke-linecap="round"/>';

  const parts = [];
  const spots = [112, 98, 84];
  for (let i = 0; i < spots.length; i += 1) {
    const side = i % 2 === 0 ? -1 : 1;
    parts.push('<path d="' + blade(BASE_X, spots[i], (side < 0 ? -158 : -22) + jitter(rng, 7),
      24 + rng() * 6, 4.2) + '" fill="' + (i % 2 === 0 ? pal.leaf : pal.leafDark) + '"/>');
  }
  parts.push('<circle cx="60" cy="' + WIRE_HUB_Y + '" r="11" fill="' + CREAM + '" stroke="' +
    pal.accent + '" stroke-width="3"/>');
  parts.push('<circle cx="60" cy="' + WIRE_HUB_Y + '" r="6.5" fill="none" stroke="' + pal.accent +
    '" stroke-width="2"/>');
  parts.push('<circle cx="60" cy="' + WIRE_HUB_Y + '" r="2.6" fill="' + pal.accent + '"/>');
  // The tuning knob touches the grille rim. Floating free it read as a stray dot.
  parts.push('<circle cx="70" cy="' + (WIRE_HUB_Y + 9) + '" r="4.2" fill="' + pal.leafDark + '"/>');

  const hub = [BASE_X, WIRE_HUB_Y];
  const anchors = [{ x: BASE_X, y: WIRE_HUB_Y + 26, stem: hub }];
  const fan = [];
  for (let i = 0; i < 8; i += 1) {
    const rad = ((158 - i * 19.4) * Math.PI) / 180;
    fan.push({
      x: BASE_X + Math.cos(rad) * 26,
      y: WIRE_HUB_Y + Math.sin(rad) * 26,
      stem: hub
    });
  }
  const order = centerOutOrder(fan.length);
  for (let i = 0; i < order.length; i += 1) {
    anchors.push(fan[order[i]]);
  }

  return {
    stem: stem,
    leaves: parts.join(''),
    anchors: anchors,
    lean: jitter(rng, 4),
    motif: 'bell'
  };
}

/* The provision shop grows a shelf jade: a trunk with three equal shelves of fat
   paddle leaves and an awning over the top one. Stacked horizontals inside a
   narrow upright box, so it never reads as the fern's triangle. */
const SHELF_TIERS = [60, 82, 104];
const SHELF_SPAN = 30;

function paddleLeaf(x, y, angle, fill) {
  return '<ellipse cx="' + r2(x) + '" cy="' + r2(y) + '" rx="11.5" ry="7.4" fill="' + fill +
    '" transform="rotate(' + r2(angle) + ' ' + r2(x) + ' ' + r2(y) + ')"/>';
}

function shelfJade(rng, pal) {
  const stems = ['<path d="M60 128 L60 46" fill="none" stroke="' + pal.leafDark +
    '" stroke-width="7" stroke-linecap="round"/>'];
  // Bars run wider than the paddles that sit on them, so the shelf ends show and
  // the tower reads as stacked horizontals rather than as one blob of leaves.
  for (let i = 0; i < SHELF_TIERS.length; i += 1) {
    stems.push('<path d="M' + (BASE_X - SHELF_SPAN) + ' ' + SHELF_TIERS[i] + ' H' +
      (BASE_X + SHELF_SPAN) + '" stroke="' + pal.leafDark +
      '" stroke-width="4" stroke-linecap="round"/>');
  }
  stems.push('<path d="M32 46 Q60 35 88 46" fill="none" stroke="' + pal.leafDark +
    '" stroke-width="3.4" stroke-linecap="round"/>');

  const leaves = [];
  for (let i = 0; i < SHELF_TIERS.length; i += 1) {
    const y = SHELF_TIERS[i];
    const tilt = jitter(rng, 7);
    leaves.push(paddleLeaf(BASE_X - SHELF_SPAN * 0.47, y - 7, -9 + tilt, pal.leaf));
    leaves.push(paddleLeaf(BASE_X + SHELF_SPAN * 0.47, y - 7, 9 + tilt, pal.leafDark));
    leaves.push(paddleLeaf(BASE_X, y - 9, tilt * 0.5, i % 2 === 0 ? pal.leafDark : pal.leaf));
  }
  const crown = [-142, -90, -38];
  for (let i = 0; i < crown.length; i += 1) {
    leaves.push('<path d="' + blade(BASE_X, 44, crown[i] + jitter(rng, 8), 13 + rng() * 4, 4) +
      '" fill="' + pal.leaf + '"/>');
  }

  const anchors = [{ x: BASE_X, y: 30, stem: null }];
  for (let i = 0; i < SHELF_TIERS.length; i += 1) {
    anchors.push({ x: BASE_X - 16, y: SHELF_TIERS[i] - 12, stem: null });
    anchors.push({ x: BASE_X + 16, y: SHELF_TIERS[i] - 12, stem: null });
  }
  anchors.push({ x: BASE_X, y: 70, stem: null });

  return { stem: stems.join(''), leaves: leaves.join(''), anchors: anchors, lean: jitter(rng, 3) };
}

/* The dragon playground grows a dragon tail: a humped spine climbing out of the
   pot, a crest of mosaic scales stepping along its outside, and a snout with two
   horns at the end. The crest is the read that keeps it clear of the kopi vine
   and the thread orchid, which are both smooth arcs. No face on it: the wilt
   render must never look like it is pulling one. */
const SPINE_A = [[60, 128], [34, 112], [30, 60], [60, 46]];
const SPINE_B = [[60, 46], [86, 36], [102, 46], [102, 70]];

function spineAt(t) {
  return t <= 0.5 ? cubicAt(SPINE_A, t * 2) : cubicAt(SPINE_B, (t - 0.5) * 2);
}

function spineAngle(t) {
  return t <= 0.5 ? cubicAngle(SPINE_A, t * 2) : cubicAngle(SPINE_B, (t - 0.5) * 2);
}

function dragonTail(rng, pal) {
  const stem = '<path d="M60 128 C34 112 30 60 60 46 C86 36 102 46 102 70" fill="none" stroke="' +
    pal.leafDark + '" stroke-width="7" stroke-linecap="round"/>';

  const parts = [];
  const scales = 9;
  for (let i = 0; i < scales; i += 1) {
    const t = 0.1 + (i / (scales - 1)) * 0.62;
    const point = spineAt(t);
    const angle = spineAngle(t) - 90;
    parts.push('<path d="' + blade(point.x, point.y, angle + jitter(rng, 6), 13 + rng() * 4, 5.2) +
      '" fill="' + (i % 2 === 0 ? pal.leaf : pal.leafDark) + '"/>');
  }
  parts.push('<path d="' + blade(BASE_X, SOIL_Y - 4, -150 + jitter(rng, 7), 22 + rng() * 4, 5) +
    '" fill="' + pal.leaf + '"/>');
  parts.push('<path d="' + blade(BASE_X, SOIL_Y - 7, -34 + jitter(rng, 7), 20 + rng() * 4, 4.6) +
    '" fill="' + pal.leaf + '"/>');

  const head = spineAt(1);
  parts.push('<ellipse cx="' + r2(head.x) + '" cy="' + r2(head.y) + '" rx="10.5" ry="8" fill="' +
    pal.leaf + '" stroke="' + pal.leafDark + '" stroke-width="2" transform="rotate(22 ' +
    r2(head.x) + ' ' + r2(head.y) + ')"/>');
  parts.push('<path d="' + blade(head.x - 3, head.y - 6, -112, 11, 3) + '" fill="' + pal.leafDark + '"/>');
  parts.push('<path d="' + blade(head.x + 4, head.y - 6, -72, 10, 2.8) + '" fill="' + pal.leafDark + '"/>');

  const anchors = [];
  const along = [0.46, 0.58, 0.34, 0.66, 0.24, 0.72, 0.16, 0.8];
  for (let i = 0; i < along.length; i += 1) {
    const point = spineAt(along[i]);
    const rad = ((spineAngle(along[i]) - 90) * Math.PI) / 180;
    anchors.push({ x: point.x + Math.cos(rad) * 9, y: point.y + Math.sin(rad) * 9, stem: null });
  }

  return { stem: stem, leaves: parts.join(''), anchors: anchors, lean: jitter(rng, 4) };
}

const SPECIES_BUILDERS = {
  'kopi-vine': kopiVine,
  'thread-orchid': threadOrchid,
  'stacked-bamboo': stackedBamboo,
  'sunburst-bloom': sunburstBloom,
  'attap-fern': attapFern,
  'wire-lily': wireLily,
  'shelf-jade': shelfJade,
  'dragon-tail': dragonTail
};

/* Where the ornament sits, per species. One fixed corner grazed the broad
   silhouettes, so each species names the spot beside its own outline. */
const ORNAMENT_ANCHORS = {
  'kopi-vine': [20, 126],
  'thread-orchid': [16, 133],
  'stacked-bamboo': [20, 126],
  'sunburst-bloom': [18, 132],
  'attap-fern': [15, 144],
  'wire-lily': [18, 130],
  'shelf-jade': [14, 146],
  'dragon-tail': [14, 146]
};

/* ---- blooms ------------------------------------------------------------- */

/* Cluster and pair spacing is deliberate, not decorative: five blooms have to
   still count as five at plot size, so the ring is wide enough to leave a gap
   between neighbours even when the size wobble runs against it, and the jitter
   afterwards is small enough that it never closes that gap. */

function placeBlooms(spec, anchors, rng, clusterScale) {
  const first = anchors[0];
  const hangs = Boolean(first.stem);
  const gap = spec.size * 2.9 * clusterScale;
  const points = [];

  if (spec.placement === 'single') {
    points.push({ x: first.x, y: first.y, stem: first.stem, scale: 1 });
  } else if (spec.placement === 'cluster' && hangs) {
    // A whorl of bells: one stem node, a fan of pedicels, a row hanging off it.
    for (let i = 0; i < spec.count; i += 1) {
      const offset = i - (spec.count - 1) / 2;
      points.push({
        x: first.stem[0] + offset * gap,
        y: first.stem[1] + 8 + Math.abs(offset) * 2.4,
        stem: first.stem,
        scale: 1
      });
    }
  } else if (spec.placement === 'cluster') {
    const radius = spec.size * 2.8 * clusterScale;
    for (let i = 0; i < spec.count; i += 1) {
      const angle = ((-90 + i * (360 / spec.count)) * Math.PI) / 180;
      points.push({
        x: first.x + Math.cos(angle) * radius,
        y: first.y + Math.sin(angle) * radius * 0.8,
        stem: first.stem,
        scale: 0.86 + rng() * 0.3
      });
    }
  } else if (spec.placement === 'pair' && hangs) {
    points.push({ x: first.stem[0] - gap * 0.5, y: first.stem[1] + 9, stem: first.stem, scale: 1 });
    points.push({ x: first.stem[0] + gap * 0.5, y: first.stem[1] + 9, stem: first.stem, scale: 1 });
  } else if (spec.placement === 'pair') {
    points.push({ x: first.x - spec.size * 1.25, y: first.y + 1, stem: first.stem, scale: 1 });
    points.push({ x: first.x + spec.size * 1.25, y: first.y - 1, stem: first.stem, scale: 1 });
  } else {
    for (let i = 0; i < spec.count; i += 1) {
      const anchor = anchors[i % anchors.length];
      points.push({ x: anchor.x, y: anchor.y, stem: anchor.stem, scale: 0.88 + rng() * 0.24 });
    }
  }

  const wobble = spec.placement === 'spread' ? 1.9 : 1.3;
  for (let i = 0; i < points.length; i += 1) {
    points[i].x += jitter(rng, wobble);
    points[i].y += jitter(rng, wobble);
  }
  return points;
}

// A bell hung from its shoulders: narrow where the pedicel meets it, flaring to a
// wide scalloped mouth that points down. Wider than it is tall on purpose, so the
// silhouette still says bell at a hundred pixels.
function bellPath(x, y, size) {
  const w0 = size * 0.38;
  const w1 = size * 1.05;
  const h = size * 1.7;
  return 'M' + r2(x - w0) + ' ' + r2(y) +
    ' C' + r2(x - w0 * 1.2) + ' ' + r2(y + h * 0.48) + ' ' + r2(x - w1) + ' ' + r2(y + h * 0.68) +
    ' ' + r2(x - w1) + ' ' + r2(y + h) +
    ' Q' + r2(x) + ' ' + r2(y + h * 1.34) + ' ' + r2(x + w1) + ' ' + r2(y + h) +
    ' C' + r2(x + w1) + ' ' + r2(y + h * 0.68) + ' ' + r2(x + w0 * 1.2) + ' ' + r2(y + h * 0.48) +
    ' ' + r2(x + w0) + ' ' + r2(y) + ' Z';
}

function bloomMotif(motif, x, y, size, pal, rng) {
  const cx = r2(x);
  const cy = r2(y);

  if (motif === 'bell') {
    return '<path class="bell" d="' + bellPath(x, y, size) + '" fill="' + pal.bloom1 + '"/>' +
      '<circle class="clapper" cx="' + cx + '" cy="' + r2(y + size * 2.02) + '" r="' +
      r2(size * 0.3) + '" fill="' + pal.bloom2 + '"/>';
  }

  if (motif === 'petals') {
    const parts = [];
    for (let i = 0; i < 5; i += 1) {
      const angle = -90 + i * 72 + jitter(rng, 6);
      const rad = (angle * Math.PI) / 180;
      const px = r2(x + Math.cos(rad) * size * 0.62);
      const py = r2(y + Math.sin(rad) * size * 0.62);
      parts.push('<ellipse cx="' + px + '" cy="' + py + '" rx="' + r2(size * 0.8) + '" ry="' +
        r2(size * 0.52) + '" fill="' + pal.bloom1 + '" transform="rotate(' + r2(angle) + ' ' +
        px + ' ' + py + ')"/>');
    }
    parts.push('<circle cx="' + cx + '" cy="' + cy + '" r="' + r2(size * 0.44) + '" fill="' + pal.bloom2 + '"/>');
    return parts.join('');
  }

  if (motif === 'layered') {
    return '<circle cx="' + cx + '" cy="' + cy + '" r="' + r2(size) + '" fill="' + pal.bloom1 + '"/>' +
      '<circle cx="' + cx + '" cy="' + cy + '" r="' + r2(size * 0.52) + '" fill="' + pal.bloom2 + '"/>';
  }

  if (motif === 'simple') {
    return '<circle cx="' + cx + '" cy="' + cy + '" r="' + r2(size) + '" fill="' + pal.bloom1 + '"/>' +
      '<circle cx="' + cx + '" cy="' + cy + '" r="' + r2(size * 0.36) + '" fill="' + pal.bloom2 + '"/>';
  }

  return '<circle cx="' + cx + '" cy="' + cy + '" r="' + r2(size) + '" fill="' + pal.bloom1 + '"/>';
}

// A pedicel that leaves the stem sideways then bends down, so the bloom on the
// end of it hangs rather than perches.
function pedicelPath(from, x, y) {
  const dx = x - from[0];
  const dy = y - from[1];
  return 'M' + r2(from[0]) + ' ' + r2(from[1]) +
    ' C' + r2(from[0] + dx * 0.55) + ' ' + r2(from[1] - 1) + ' ' + r2(x) + ' ' + r2(from[1] + dy * 0.32) +
    ' ' + r2(x) + ' ' + r2(y);
}

function renderBlooms(spec, anchors, pal, rng, clusterScale) {
  const points = placeBlooms(spec, anchors, rng, clusterScale);
  const parts = [];
  for (let i = 0; i < points.length; i += 1) {
    const point = points[i];
    const size = spec.size * point.scale;
    const group = [];
    if (point.stem) {
      group.push('<path class="pedicel" d="' + pedicelPath(point.stem, point.x, point.y) +
        '" stroke="' + pal.leafDark + '" stroke-width="2.2" fill="none" stroke-linecap="round"/>');
    }
    group.push(bloomMotif(spec.motif, point.x, point.y, size, pal, rng));
    parts.push('<g class="bloom">' + group.join('') + '</g>');
  }
  return parts.join('');
}

/* ---- ornaments ---------------------------------------------------------- */
/* Drawn around a local origin so the whole thing can be placed, scaled and
   tilted as one group, tucked beside the pot where it will not sit on the plant. */

function ornamentSvg(key, pal) {
  if (key === 'first-flat') {
    return '<rect x="-16" y="-32" width="24" height="24" rx="2" fill="' + CREAM + '" stroke="' + WOOD + '" stroke-width="3"/>' +
      '<path d="M-4 -32 V-8 M-16 -20 H8" stroke="' + WOOD + '" stroke-width="2.4"/>' +
      '<path d="M8 -28 L22 -25" stroke="' + WOOD + '" stroke-width="2.6" stroke-linecap="round"/>' +
      '<path d="M10 -26 h7 l1 8 h-9 z" fill="' + pal.bloom1 + '"/>' +
      '<path d="M18 -25 h6 l1 7 h-8 z" fill="' + pal.bloom2 + '"/>';
  }
  if (key === 'kopitiam') {
    return '<path d="M0 -42 L0 -27" stroke="' + WOOD + '" stroke-width="2.2" stroke-linecap="round"/>' +
      '<path d="M-8 -27 H8 L6 -14 Q0 -11 -6 -14 Z" fill="' + CREAM + '" stroke="' + WOOD + '" stroke-width="2.6" stroke-linejoin="round"/>' +
      '<path d="M8 -24 q5 1 3 6" fill="none" stroke="' + WOOD + '" stroke-width="2.4" stroke-linecap="round"/>' +
      '<ellipse cx="0" cy="-11" rx="11" ry="3" fill="' + pal.accent + '"/>';
  }
  if (key === 'market') {
    return '<path d="M-11 -26 a11 9 0 0 1 22 0" fill="none" stroke="' + WOOD + '" stroke-width="2.6"/>' +
      '<circle cx="-5" cy="-25" r="5" fill="' + pal.bloom1 + '"/>' +
      '<circle cx="5" cy="-24" r="4.4" fill="' + pal.bloom2 + '"/>' +
      '<path d="M-16 -22 H16 L12 -2 H-12 Z" fill="' + WOOD + '"/>' +
      '<path d="M-14 -15 H14 M-13 -9 H13" stroke="' + CREAM + '" stroke-width="2.2"/>';
  }
  if (key === 'seaside') {
    return '<path d="M-13 -4 A13 13 0 0 1 13 -4 Z" fill="' + CREAM + '" stroke="' + WOOD + '" stroke-width="2.6" stroke-linejoin="round"/>' +
      '<path d="M0 -17 V-4 M-7 -15 L-9 -4 M7 -15 L9 -4" stroke="' + WOOD + '" stroke-width="2"/>' +
      '<path d="M-18 -22 q5 -5 10 0 q5 5 10 0" fill="none" stroke="' + pal.accent + '" stroke-width="3" stroke-linecap="round"/>';
  }
  return '<path d="M-15 -14 H15 V0 H-15 Z" fill="' + WOOD + '"/>' +
    '<path d="M-18 -14 L0 -27 L18 -14 Z" fill="' + ROOF + '"/>' +
    '<rect x="-4" y="-10" width="8" height="10" fill="' + pal.accent + '"/>' +
    '<rect x="-12" y="-11" width="6" height="5" fill="' + CREAM + '"/>';
}

/* ---- pot and young growth ----------------------------------------------- */

function potSvg() {
  return '<path d="M34 133 H86 L81 152 A5 5 0 0 1 76 156 H44 A5 5 0 0 1 39 152 Z" fill="' + POT_BODY + '"/>' +
    '<rect x="29" y="123" width="62" height="11" rx="4" fill="' + POT_RIM + '"/>' +
    '<ellipse cx="60" cy="127" rx="25" ry="5" fill="' + SOIL + '"/>';
}

// Stage zero, and the answer when there are no traits to read: one shoot and two
// seed leaves, drawn big enough that the stage scale still leaves it visible over
// the pot rim. It carries the palette but none of the species shape, because a
// memory that has just been planted has not decided what it is yet.
//
// The four wobbles are drawn before the branch, in the order the healthy form
// used to draw them inline, so a thirsty sprout is the same sprout sagging and
// not a different one. A shared palette and shared jitter, different posture.
function sproutParts(rng, pal, wilted) {
  const top = 76 + jitter(rng, 5);
  const leftTurn = jitter(rng, 8);
  const leftLen = 25 + rng() * 4;
  const rightTurn = jitter(rng, 8);
  const rightLen = 23 + rng() * 4;

  /* A sprout carries a tenth of a grown plant's mass, so the group lean and
     squash that read clearly on a full silhouette vanish on this one at 106px.
     The seed leaves are re-angled below the horizontal and the shoot bows over
     its own tip, which is the part a player actually sees change. */
  if (wilted) {
    const tipX = BASE_X + 13;
    const tipY = top + 16;
    const droopStem = '<path d="M60 128 C57 116 65 108 ' + r2(tipX) + ' ' + r2(tipY) +
      '" fill="none" stroke="' + pal.leafDark + '" stroke-width="5.5" stroke-linecap="round"/>';
    const droopLeaves = [
      '<path d="' + blade(BASE_X - 1, 100, 145 + leftTurn, leftLen, 7.4) +
        '" fill="' + pal.leaf + '"/>',
      '<path d="' + blade(BASE_X + 1, 94, 35 + rightTurn, rightLen, 7) +
        '" fill="' + pal.leaf + '"/>',
      '<ellipse cx="' + r2(tipX) + '" cy="' + r2(tipY) + '" rx="5" ry="4.2" fill="' +
        pal.leaf + '"/>'
    ].join('');
    return { stem: droopStem, leaves: droopLeaves };
  }

  const stem = '<path d="M60 128 C57 112 63 98 60 ' + r2(top) +
    '" fill="none" stroke="' + pal.leafDark + '" stroke-width="5.5" stroke-linecap="round"/>';
  const leaves = [
    '<path d="' + blade(BASE_X, 98, -152 + leftTurn, leftLen, 8) +
      '" fill="' + pal.leaf + '"/>',
    '<path d="' + blade(BASE_X, 92, -28 + rightTurn, rightLen, 7.4) +
      '" fill="' + pal.leaf + '"/>',
    '<ellipse cx="60" cy="' + r2(top) + '" rx="5.2" ry="4.4" fill="' + pal.leaf + '"/>'
  ].join('');
  return { stem: stem, leaves: leaves };
}

/* ---- crop archetypes ---------------------------------------------------- */
/* Four builders cover the ten crops, each returning { stem, leaves, fruit }.
   Fruit is held back until the last stage, so a crop visibly finishes. The form
   value out of the traits file is what keeps two crops on one archetype apart:
   a chilli hangs pods where a tomato hangs round fruit. */

function cropLeafy(rng, pal, form) {
  const stem = '<ellipse cx="60" cy="126" rx="12" ry="5" fill="' + pal.leafDark + '"/>';
  const leaves = [];
  const fruit = [];

  if (form === 'upright') {
    const stalks = 5;
    for (let i = 0; i < stalks; i += 1) {
      const offset = i - (stalks - 1) / 2;
      const x = BASE_X + offset * 11 + jitter(rng, 2.5);
      const top = 64 + Math.abs(offset) * 10 + rng() * 6;
      leaves.push('<path d="M60 126 Q' + r2((BASE_X + x) / 2) + ' ' + r2((126 + top) / 2 + 6) +
        ' ' + r2(x) + ' ' + r2(top) + '" fill="none" stroke="' + pal.leafDark +
        '" stroke-width="3.4" stroke-linecap="round"/>');
      leaves.push('<path d="' + blade(x, top + 18, offset <= 0 ? -150 : -30, 20 + rng() * 5, 6.2) +
        '" fill="' + pal.leaf + '"/>');
      leaves.push('<path d="' + blade(x, top, -90 + jitter(rng, 22), 17 + rng() * 5, 6.6) +
        '" fill="' + (i % 2 === 0 ? pal.leaf : pal.leafDark) + '"/>');
      fruit.push('<circle cx="' + r2(x) + '" cy="' + r2(top - 13) + '" r="3.6" fill="' + pal.bloom2 + '"/>');
    }
    return { stem: stem, leaves: leaves.join(''), fruit: fruit.join('') };
  }

  const count = 7;
  for (let i = 0; i < count; i += 1) {
    const angle = -156 + (i / (count - 1)) * 132 + jitter(rng, 5);
    const rad = (angle * Math.PI) / 180;
    const len = 28 + rng() * 12;
    const tipX = BASE_X + Math.cos(rad) * len;
    const tipY = 124 + Math.sin(rad) * len;
    const fill = i % 2 === 0 ? pal.leaf : pal.leafDark;
    leaves.push('<path d="M60 124 L' + r2(tipX) + ' ' + r2(tipY) + '" stroke="' + pal.leafDark +
      '" stroke-width="2.8" stroke-linecap="round"/>');
    if (form === 'arrow') {
      leaves.push('<path d="' + blade(tipX, tipY, angle, 20 + rng() * 5, 5.4) + '" fill="' + fill + '"/>');
    } else if (form === 'heart') {
      leaves.push('<path d="' + heartLeaf(tipX, tipY, angle, 21 + rng() * 4, 11.5) + '" fill="' + fill + '"/>');
    } else {
      const cx = tipX + Math.cos(rad) * 9;
      const cy = tipY + Math.sin(rad) * 9;
      leaves.push('<ellipse cx="' + r2(cx) + '" cy="' + r2(cy) + '" rx="13" ry="9.5" fill="' + fill +
        '" transform="rotate(' + r2(angle) + ' ' + r2(cx) + ' ' + r2(cy) + ')"/>');
    }
  }

  return { stem: stem, leaves: leaves.join(''), fruit: '' };
}

function cropFruiting(rng, pal, form) {
  const stem = '<path d="M60 128 L60 56" fill="none" stroke="' + pal.leafDark +
    '" stroke-width="5.5" stroke-linecap="round"/>';
  const leaves = [];
  const fruit = [];
  const spots = [104, 90, 76, 63];

  for (let i = 0; i < spots.length; i += 1) {
    const side = i % 2 === 0 ? -1 : 1;
    const y = spots[i];
    const bx = BASE_X + side * (17 + rng() * 5);
    const by = y - 9 - rng() * 4;
    leaves.push('<path d="M60 ' + y + ' Q' + r2((BASE_X + bx) / 2) + ' ' + r2(y - 3) + ' ' +
      r2(bx) + ' ' + r2(by) + '" fill="none" stroke="' + pal.leafDark +
      '" stroke-width="3" stroke-linecap="round"/>');
    leaves.push('<path d="' + blade(bx, by, (side < 0 ? -148 : -32) + jitter(rng, 10), 18 + rng() * 5, 6.4) +
      '" fill="' + (i % 2 === 0 ? pal.leaf : pal.leafDark) + '"/>');

    if (form === 'pod') {
      const tipY = by + 20 + rng() * 4;
      fruit.push('<path d="M' + r2(bx - 4) + ' ' + r2(by + 2) + ' Q' + r2(bx - 5.5) + ' ' +
        r2(by + 13) + ' ' + r2(bx + 1) + ' ' + r2(tipY) + ' Q' + r2(bx + 4.6) + ' ' +
        r2(by + 12) + ' ' + r2(bx + 4) + ' ' + r2(by + 2) + ' Z" fill="' + pal.bloom1 + '"/>');
      fruit.push('<path d="M' + r2(bx - 4.6) + ' ' + r2(by + 2) + ' H' + r2(bx + 4.6) +
        '" stroke="' + pal.leafDark + '" stroke-width="3" stroke-linecap="round"/>');
    } else if (form === 'citrus') {
      fruit.push('<circle cx="' + r2(bx) + '" cy="' + r2(by + 9) + '" r="6.4" fill="' + pal.bloom1 + '"/>');
      fruit.push('<circle cx="' + r2(bx - 2) + '" cy="' + r2(by + 7) + '" r="2.2" fill="' + pal.bloom2 + '"/>');
    } else {
      fruit.push('<circle cx="' + r2(bx) + '" cy="' + r2(by + 10) + '" r="7.2" fill="' + pal.bloom1 + '"/>');
      fruit.push('<path d="M' + r2(bx - 5) + ' ' + r2(by + 4) + ' L' + r2(bx) + ' ' + r2(by + 8) +
        ' L' + r2(bx + 5) + ' ' + r2(by + 4) + '" fill="none" stroke="' + pal.leafDark +
        '" stroke-width="2.4" stroke-linejoin="round"/>');
    }
  }

  return { stem: stem, leaves: leaves.join(''), fruit: fruit.join('') };
}

function cropClimbing(rng, pal) {
  const stem = '<path d="M60 132 L60 42" stroke="' + WOOD + '" stroke-width="4.6" stroke-linecap="round"/>';
  const leaves = [];
  const fruit = [];

  // The vine twines: one wave per segment, alternating sides up the stake.
  const wraps = [];
  for (let y = 124; y > 48; y -= 13) {
    const side = ((124 - y) / 13) % 2 === 0 ? -1 : 1;
    wraps.push('Q' + r2(BASE_X + side * 11) + ' ' + r2(y - 6) + ' ' + BASE_X + ' ' + r2(y - 13));
  }
  leaves.push('<path d="M60 124 ' + wraps.join(' ') + '" fill="none" stroke="' + pal.leaf +
    '" stroke-width="3.4" stroke-linecap="round"/>');

  const spots = [112, 96, 80, 64];
  for (let i = 0; i < spots.length; i += 1) {
    const side = i % 2 === 0 ? -1 : 1;
    const y = spots[i];
    leaves.push('<path d="' + heartLeaf(BASE_X + side * 7, y, (side < 0 ? -160 : -20) + jitter(rng, 10),
      19 + rng() * 4, 10) + '" fill="' + (i % 2 === 0 ? pal.leaf : pal.leafDark) + '"/>');
    const px = BASE_X + side * (9 + rng() * 3);
    fruit.push('<path d="M' + r2(px) + ' ' + r2(y + 2) + ' C' + r2(px + side * 5) + ' ' +
      r2(y + 14) + ' ' + r2(px + side * 2) + ' ' + r2(y + 24) + ' ' + r2(px + side * 4) + ' ' +
      r2(y + 34) + '" fill="none" stroke="' + pal.leafDark + '" stroke-width="5" stroke-linecap="round"/>');
    fruit.push('<circle cx="' + r2(px) + '" cy="' + r2(y + 1) + '" r="3" fill="' + pal.bloom1 + '"/>');
  }

  return { stem: stem, leaves: leaves.join(''), fruit: fruit.join('') };
}

function cropHerb(rng, pal, form) {
  const leaves = [];

  if (form === 'rhizome') {
    // The rhizome clump reads as root only when it stays in the leaf family. On
    // the accent it came out as a stray coloured blob sitting on the soil.
    const stems = ['<ellipse cx="53" cy="125" rx="11" ry="6" fill="' + pal.leafDark + '"/>' +
      '<ellipse cx="67" cy="126" rx="9.5" ry="5.4" fill="' + pal.leafDark + '"/>' +
      '<ellipse cx="60" cy="122" rx="8" ry="5" fill="' + pal.leaf + '"/>'];
    const canes = 3;
    for (let i = 0; i < canes; i += 1) {
      const x = BASE_X + (i - (canes - 1) / 2) * 14;
      const top = 58 + i * 6 + jitter(rng, 5);
      stems.push('<path d="M' + r2(x) + ' 122 L' + r2(x) + ' ' + r2(top) + '" fill="none" stroke="' +
        pal.leafDark + '" stroke-width="4" stroke-linecap="round"/>');
      for (let k = 0; k < 4; k += 1) {
        const side = k % 2 === 0 ? -1 : 1;
        const y = top + 12 + k * 14;
        leaves.push('<path d="' + blade(x, y, (side < 0 ? -158 : -22) + jitter(rng, 8), 22 + rng() * 5, 5.2) +
          '" fill="' + (k % 2 === 0 ? pal.leaf : pal.leafDark) + '"/>');
      }
    }
    return { stem: stems.join(''), leaves: leaves.join(''), fruit: '' };
  }

  const stem = '<ellipse cx="60" cy="126" rx="11" ry="5" fill="' + pal.leafDark + '"/>';
  const count = 7;
  for (let i = 0; i < count; i += 1) {
    const angle = -148 + (i / (count - 1)) * 116 + jitter(rng, 4);
    const rad = (angle * Math.PI) / 180;
    const len = 58 + rng() * 18;
    leaves.push('<path d="' + blade(BASE_X, SOIL_Y - 4, angle, len, 4.4) + '" fill="' +
      (i % 2 === 0 ? pal.leaf : pal.leafDark) + '"/>');
    leaves.push('<path d="M60 ' + (SOIL_Y - 4) + ' L' + r2(BASE_X + Math.cos(rad) * len * 0.94) +
      ' ' + r2(SOIL_Y - 4 + Math.sin(rad) * len * 0.94) + '" stroke="' + pal.leafDark +
      '" stroke-width="1.6" stroke-linecap="round" opacity="0.75"/>');
  }

  return { stem: stem, leaves: leaves.join(''), fruit: '' };
}

const CROP_BUILDERS = {
  leafy: cropLeafy,
  fruiting: cropFruiting,
  climbing: cropClimbing,
  herb: cropHerb
};

/* ---- assembly ----------------------------------------------------------- */

/* Every layer is an outer group carrying the placement transform and an inner
   group carrying nothing, so the ceremony can animate a transform on the inner
   one without wiping out the lean, the stage scale or the ornament's own spot. */

function placementTransform(scale, lean, wilted, young) {
  // Wilt exaggerates the lean the plant already has and squashes it towards the
  // soil. Rotation is applied to the geometry first, the squash after, which
  // gives the sag a slight shear instead of a rigid tip. Young growth gets the
  // heavier pair of numbers, because a sprout is too small to show the light one.
  const droop = young ? WILT_SPROUT_LEAN : WILT_LEAN;
  const squash = young ? WILT_SPROUT_SQUASH : WILT_SQUASH;
  const turn = wilted ? (lean >= 0 ? lean + droop : lean - droop) : lean;
  const scaleY = wilted ? scale * squash : scale;
  return 'transform="translate(' + BASE_X + ' ' + SOIL_Y + ') scale(' + r2(scale) + ' ' +
    r2(scaleY) + ') translate(-' + BASE_X + ' -' + SOIL_Y + ') rotate(' + r2(turn) + ' ' +
    BASE_X + ' ' + SOIL_Y + ')"';
}

function dataAttrs(map) {
  const keys = Object.keys(map);
  let out = '';
  for (let i = 0; i < keys.length; i += 1) {
    out += ' ' + keys[i] + '="' + esc(map[keys[i]]) + '"';
  }
  return out;
}

function svgRoot(attrs, body) {
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + VIEW_MIN_X + ' 0 ' + VIEW_WIDTH +
    ' ' + VIEW_HEIGHT + '" role="img"' + attrs + ' class="plant">' + body + '</svg>';
}

function growthLabel(speciesLabel, paletteLabel, words, stage, wilted) {
  return 'A ' + speciesLabel + ', ' + paletteLabel + ' colours, ' + words[stage] +
    (wilted ? THIRSTY : '');
}

// The answer whenever there is nothing to read: never an error, never an empty
// plot, always something a player would recognise as a plant that has just gone in.
function neutralPlant(kind, stage, wilted, seedInput) {
  const seed = resolveSeed(seedInput, 'garden-of-life|sprout');
  const rng = makeRng(seed);
  const pal = wilted ? thirstyPalette(NEUTRAL_PAL) : NEUTRAL_PAL;
  const built = sproutParts(rng, pal, wilted);
  const place = placementTransform(0.62, 0, wilted, true);
  const attrs = dataAttrs({
    'aria-label': growthLabel('sprout', NEUTRAL_PAL.label, GROWTH_WORDS, stage, wilted),
    'data-kind': kind,
    'data-species': 'sprout',
    'data-palette': 'none',
    'data-bloom': 'none',
    'data-ornament': 'none',
    'data-stage': String(stage),
    'data-wilted': wilted ? 'true' : 'false',
    'data-seed': String(seed)
  });
  const svg = svgRoot(attrs,
    '<g class="layer-pot"><g>' + potSvg() + '</g></g>' +
    '<g class="layer-stem" ' + place + '><g>' + built.stem + '</g></g>' +
    '<g class="layer-leaves" ' + place + '><g>' + built.leaves + '</g></g>');

  return {
    svg: svg,
    signature: 'sprout|none|none|none',
    seed: seed,
    traits: {
      species: 'sprout',
      speciesLabel: 'sprout',
      palette: 'none',
      paletteLabel: NEUTRAL_PAL.label,
      bloom: 'none',
      ornament: 'none',
      stage: stage,
      wilted: wilted
    }
  };
}

/**
 * Compose a plant from a planted memory. Pure, deterministic and DOM free: the
 * same input returns a byte identical svg string on every call, in every session,
 * forever, so a saved memory regrows exactly as it first appeared.
 *
 * Every field is optional and every unusable value falls back rather than
 * throwing. Before loadTraits, or after it refused a file, the answer is the
 * neutral sprout.
 *
 * @param {Object} request
 * @param {string} [request.objectId] One of the eight heritage object ids. It
 *   resolves the species through species_by_object; an unknown id falls back to
 *   the defaults block.
 * @param {Object} [request.tags] Closed set trait VALUES, never chip ids.
 * @param {string} [request.tags.palette] warm, happy, wistful, calm or proud.
 * @param {string} [request.tags.bloom] one-big, pair, trio, cluster or many.
 * @param {string} [request.tags.ornament] kampung, first-flat, kopitiam, market
 *   or seaside.
 * @param {number} [request.stage=2] 0, 1 or 2. Drives scale, whether blooms and
 *   the ornament are drawn, and whether the young sprout form replaces the
 *   species silhouette.
 * @param {boolean} [request.wilted=false] Draws the thirsty state: a deeper lean,
 *   a squash towards the soil and muted colours that stay above 3:1 on the plot
 *   surface. No shame iconography of any kind.
 * @param {number|string} [request.seed] Overrides the default seed, which is
 *   hashString of objectId, palette, bloom and ornament joined by pipes.
 * @returns {{svg: string, signature: string, seed: number, traits: Object}}
 *   signature is species|palette|bloom|ornament and is stage independent, so it
 *   is the identity of the memory rather than of the picture.
 */
export function composePlant(request) {
  const input = request === null || typeof request !== 'object' ? {} : request;
  const stage = stageIndex(input.stage);
  const wilted = Boolean(input.wilted);

  try {
    if (traits === null) {
      return neutralPlant('memory', stage, wilted, input.seed);
    }

    const tags = input.tags === null || typeof input.tags !== 'object' ? {} : input.tags;
    const objectId = typeof input.objectId === 'string' ? input.objectId : '';
    const mapped = traits.speciesByObject[objectId];
    const known = typeof mapped === 'string' && Boolean(traits.species[mapped]);
    const species = known ? mapped : traits.defaults.species;
    const entry = traits.species[species];
    const palette = traits.palettes[tags.palette] ? tags.palette : traits.defaults.palette;
    const bloom = traits.blooms[tags.bloom] ? tags.bloom : traits.defaults.bloom;
    const ornament = traits.ornaments[tags.ornament] ? tags.ornament : traits.defaults.ornament;

    const basePal = traits.palettes[palette];
    const pal = wilted ? thirstyPalette(basePal) : basePal;
    const bloomSpec = traits.blooms[bloom];
    const stageData = entry.stages[stage];
    const seed = resolveSeed(input.seed,
      (known ? objectId : species) + '|' + palette + '|' + bloom + '|' + ornament);
    const rng = makeRng(seed);

    /* Everything is built at every stage, drawn or not, so the rng is consumed in
       the same order whatever the stage is. A watered plant is then visibly the
       same plant grown up, not a reroll of it. */
    const built = SPECIES_BUILDERS[species](rng, pal);
    // The species may claim the bloom shape, the trait always keeps count and layout.
    const spec = {
      motif: built.motif ? built.motif : bloomSpec.motif,
      count: bloomSpec.count,
      placement: bloomSpec.placement,
      size: bloomSpec.size
    };
    const blooms = renderBlooms(spec, built.anchors, pal, rng,
      built.clusterScale ? built.clusterScale : 1);
    const tilt = jitter(rng, 10);
    const young = sproutParts(rng, pal, wilted);

    const anchor = ORNAMENT_ANCHORS[species] ? ORNAMENT_ANCHORS[species] : [16, 136];
    const place = placementTransform(stageData.scale, built.lean, wilted, stageData.sprout);
    const layers = [
      '<g class="layer-pot"><g>' + potSvg() + '</g></g>',
      '<g class="layer-stem" ' + place + '><g>' +
        (stageData.sprout ? young.stem : built.stem) + '</g></g>',
      '<g class="layer-leaves" ' + place + '><g>' +
        (stageData.sprout ? young.leaves : built.leaves) + '</g></g>'
    ];
    if (stageData.blooms && !stageData.sprout) {
      layers.push('<g class="layer-blooms" ' + place + '><g>' + blooms + '</g></g>');
    }
    if (stageData.ornament) {
      layers.push('<g class="layer-ornament" transform="translate(' + anchor[0] + ' ' + anchor[1] +
        ') rotate(' + r2(tilt) + ') scale(' + r2(stageData.scale) + ')"><g>' +
        ornamentSvg(traits.ornaments[ornament].draw, pal) + '</g></g>');
    }

    const attrs = dataAttrs({
      'aria-label': growthLabel(entry.label, basePal.label, GROWTH_WORDS, stage, wilted),
      'data-kind': 'memory',
      'data-species': species,
      'data-palette': palette,
      'data-bloom': bloom,
      'data-ornament': ornament,
      'data-stage': String(stage),
      'data-wilted': wilted ? 'true' : 'false',
      'data-seed': String(seed)
    });

    return {
      svg: svgRoot(attrs, layers.join('')),
      signature: species + '|' + palette + '|' + bloom + '|' + ornament,
      seed: seed,
      traits: {
        species: species,
        speciesLabel: entry.label,
        palette: palette,
        paletteLabel: basePal.label,
        bloom: bloom,
        ornament: ornament,
        stage: stage,
        wilted: wilted
      }
    };
  } catch (error) {
    return neutralPlant('memory', stage, wilted, input.seed);
  }
}

/**
 * Compose a shop crop. Same guarantees as composePlant: pure, deterministic, DOM
 * free, never throws, and the neutral sprout whenever the traits file is absent
 * or the crop cannot be resolved. Four archetype builders cover the ten crops,
 * parameterized by the archetype and form fields in the traits file.
 *
 * @param {Object} request
 * @param {string} [request.cropId] One of the ten crop ids. An unknown id falls
 *   back to the crop named in the defaults block.
 * @param {number} [request.stage=2] 0, 1 or 2. Fruit only appears at the last
 *   stage, so a crop visibly finishes.
 * @param {boolean} [request.wilted=false] The same thirsty state as a memory
 *   plant, with the same contrast floor and the same absence of shame.
 * @param {number|string} [request.seed] Overrides the default seed, which is
 *   hashString of the crop id and its palette.
 * @returns {{svg: string, signature: string, seed: number, traits: Object}}
 *   signature is crop|palette|archetype|form. The svg root carries data-kind
 *   "crop" and repeats the crop id in data-species.
 */
export function composeCrop(request) {
  const input = request === null || typeof request !== 'object' ? {} : request;
  const stage = stageIndex(input.stage);
  const wilted = Boolean(input.wilted);

  try {
    if (traits === null) {
      return neutralPlant('crop', stage, wilted, input.seed);
    }

    const cropId = typeof input.cropId === 'string' ? input.cropId : '';
    const id = traits.crops[cropId] ? cropId : traits.defaults.crop;
    const crop = traits.crops[id];
    if (!crop) {
      return neutralPlant('crop', stage, wilted, input.seed);
    }

    const palette = traits.palettes[crop.palette] ? crop.palette : traits.defaults.palette;
    const basePal = traits.palettes[palette];
    const pal = wilted ? thirstyPalette(basePal) : basePal;
    const stageData = crop.stages[stage];
    const seed = resolveSeed(input.seed, 'crop|' + id + '|' + palette);
    const rng = makeRng(seed);

    const builder = CROP_BUILDERS[crop.archetype] ? CROP_BUILDERS[crop.archetype] : cropLeafy;
    const built = builder(rng, pal, crop.form);
    const young = sproutParts(rng, pal, wilted);

    const place = placementTransform(stageData.scale, 0, wilted, stageData.sprout);
    const layers = [
      '<g class="layer-pot"><g>' + potSvg() + '</g></g>',
      '<g class="layer-stem" ' + place + '><g>' +
        (stageData.sprout ? young.stem : built.stem) + '</g></g>',
      '<g class="layer-leaves" ' + place + '><g>' +
        (stageData.sprout ? young.leaves : built.leaves) + '</g></g>'
    ];
    if (stageData.blooms && !stageData.sprout && built.fruit !== '') {
      layers.push('<g class="layer-blooms" ' + place + '><g>' + built.fruit + '</g></g>');
    }

    const attrs = dataAttrs({
      'aria-label': growthLabel(crop.label, basePal.label, CROP_GROWTH_WORDS, stage, wilted),
      'data-kind': 'crop',
      'data-species': id,
      'data-palette': palette,
      'data-bloom': 'none',
      'data-ornament': 'none',
      'data-archetype': crop.archetype,
      'data-form': crop.form,
      'data-stage': String(stage),
      'data-wilted': wilted ? 'true' : 'false',
      'data-seed': String(seed)
    });

    return {
      svg: svgRoot(attrs, layers.join('')),
      signature: id + '|' + palette + '|' + crop.archetype + '|' + crop.form,
      seed: seed,
      traits: {
        species: id,
        speciesLabel: crop.label,
        crop: id,
        cropLabel: crop.label,
        archetype: crop.archetype,
        form: crop.form,
        palette: palette,
        paletteLabel: basePal.label,
        priceTier: crop.priceTier,
        stage: stage,
        wilted: wilted
      }
    };
  } catch (error) {
    return neutralPlant('crop', stage, wilted, input.seed);
  }
}
