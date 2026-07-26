/*
  Memory Garden plant composer.

  DOM free on purpose: it builds an SVG string, so the same function runs in the
  browser and under plain node for the contact sheet. Deterministic by
  construction, every random choice comes from one seeded rng, so a saved memory
  regrows exactly as it first appeared.

  Traits carry the meaning. Object picks the species silhouette, feeling picks the
  palette, who picks the blooms, where picks the ornament. The rng only jitters.
*/

import { hashString, makeRng } from '../../../shared/ai.js';

const BASE_X = 60;
const SOIL_Y = 128;

const POT_BODY = '#8a5a3b';
const POT_RIM = '#6f472c';
const SOIL = '#4a3524';
const WOOD = '#6b4423';
const ROOF = '#8f3f1d';
const CREAM = '#f2e6d2';

const SPECIES_BY_OBJECT = {
  'kopitiam-cup': 'kopi-vine',
  'sewing-machine': 'thread-orchid',
  'rotary-phone': 'bellflower',
  tingkat: 'stacked-bamboo',
  cassette: 'ribbon-fern',
  'five-stones': 'pebble-succulent'
};

const SPECIES_LABELS = {
  'kopi-vine': 'kopi vine',
  'thread-orchid': 'thread orchid',
  bellflower: 'bellflower',
  'stacked-bamboo': 'stacked bamboo',
  'ribbon-fern': 'ribbon fern',
  'pebble-succulent': 'pebble succulent'
};

const PALETTES = {
  warm: { label: 'amber', bloom1: '#a6600b', bloom2: '#9c3f1c', leaf: '#4a6b2f', leafDark: '#33501f', accent: '#7a3f06' },
  happy: { label: 'pink', bloom1: '#b02f66', bloom2: '#a86a00', leaf: '#3f7a45', leafDark: '#2b5730', accent: '#8a2f52' },
  wistful: { label: 'violet', bloom1: '#6b3fa0', bloom2: '#2f4b7c', leaf: '#41706a', leafDark: '#2d514d', accent: '#4a3f80' },
  calm: { label: 'teal', bloom1: '#0f6b63', bloom2: '#4a7a52', leaf: '#2f6b5a', leafDark: '#204d40', accent: '#175f57' },
  proud: { label: 'deep red', bloom1: '#96201f', bloom2: '#8a6a10', leaf: '#4d6b2a', leafDark: '#37501c', accent: '#7a1a19' }
};

const BLOOMS = {
  'my-mother': { motif: 'layered', count: 3, placement: 'spread', size: 7 },
  'my-father': { motif: 'petals', count: 1, placement: 'single', size: 11 },
  'my-grandmother': { motif: 'simple', count: 5, placement: 'cluster', size: 4.6 },
  'my-friends': { motif: 'dot', count: 7, placement: 'spread', size: 3.2 },
  'my-siblings': { motif: 'layered', count: 2, placement: 'pair', size: 7.5 }
};

const ORNAMENTS = ['kampung', 'first-flat', 'kopitiam', 'market', 'seaside'];

const FALLBACK = {
  object: 'kopitiam-cup',
  who: 'my-mother',
  where: 'kampung',
  feeling: 'warm'
};

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

function jitter(rng, spread) {
  return (rng() - 0.5) * spread;
}

/* ---- species silhouettes ------------------------------------------------ */
/* Each returns { stem, leaves, anchors, lean }. Anchors are candidate bloom
   points, best first, at least eight so seven scattered blooms always fit. */

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
    anchors.push({ x: point.x + side * 4.5, y: point.y - 1, pedicel: null });
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

  const anchors = [];
  for (let i = 0; i < 8; i += 1) {
    const t = 1 - i * 0.07;
    const point = cubicAt(ARCH, t);
    anchors.push({ x: point.x, y: point.y + 4, pedicel: null });
  }

  return { stem: stem, leaves: leaves.join(''), anchors: anchors, lean: jitter(rng, 5) };
}

function bellflower(rng, pal) {
  const stem = '<path d="M60 128 L60 32" fill="none" stroke="' + pal.leafDark +
    '" stroke-width="4.5" stroke-linecap="round"/>';

  const leaves = [];
  const spots = [104, 92, 80, 68];
  for (let i = 0; i < spots.length; i += 1) {
    const side = i % 2 === 0 ? -1 : 1;
    const angle = side < 0 ? -148 : -32;
    leaves.push('<path d="' + blade(BASE_X, spots[i], angle + jitter(rng, 8), 23 + rng() * 5, 5.4) +
      '" fill="' + pal.leaf + '"/>');
  }

  const anchors = [];
  for (let i = 0; i < 8; i += 1) {
    const y = 38 + i * 7.5;
    const side = i % 2 === 0 ? -1 : 1;
    const x = BASE_X + side * 9.5;
    anchors.push({ x: x, y: y + 11, pedicel: [BASE_X, y, x, y + 11] });
  }

  return { stem: stem, leaves: leaves.join(''), anchors: anchors, lean: jitter(rng, 4) };
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
      anchors.push({ x: x + (k % 2 === 0 ? 5 : -5), y: top + 3 + k * 9, pedicel: null });
    }
  }

  while (anchors.length < 8) {
    const source = anchors[anchors.length - 3];
    anchors.push({ x: source.x + 6, y: source.y + 9, pedicel: null });
  }

  return { stem: stems.join(''), leaves: leaves.join(''), anchors: anchors, lean: jitter(rng, 3) };
}

function ribbonFern(rng, pal) {
  // No tall stem, just a low sheath the fronds fan out of.
  const stem = '<ellipse cx="60" cy="126" rx="10" ry="5" fill="' + pal.leafDark + '"/>';

  const count = 5 + Math.floor(rng() * 3);
  const leaves = [];
  const anchors = [];
  for (let i = 0; i < count; i += 1) {
    const angle = (-142 + (i / (count - 1)) * 104 + jitter(rng, 5)) * (Math.PI / 180);
    const len = 54 + rng() * 16;
    const wave = i % 2 === 0 ? 8 : -8;
    const nx = Math.cos(angle + Math.PI / 2);
    const ny = Math.sin(angle + Math.PI / 2);
    const tipX = BASE_X + Math.cos(angle) * len;
    const tipY = SOIL_Y - 4 + Math.sin(angle) * len;
    const c1x = BASE_X + Math.cos(angle) * len * 0.34 + nx * wave;
    const c1y = SOIL_Y - 4 + Math.sin(angle) * len * 0.34 + ny * wave;
    const c2x = BASE_X + Math.cos(angle) * len * 0.68 - nx * wave;
    const c2y = SOIL_Y - 4 + Math.sin(angle) * len * 0.68 - ny * wave;
    leaves.push('<path d="M60 ' + r2(SOIL_Y - 4) + ' C' + r2(c1x) + ' ' + r2(c1y) + ' ' +
      r2(c2x) + ' ' + r2(c2y) + ' ' + r2(tipX) + ' ' + r2(tipY) + '" fill="none" stroke="' +
      pal.leaf + '" stroke-width="5.5" stroke-linecap="round"/>');
    anchors.push({ x: tipX, y: tipY, pedicel: null });
  }

  let pad = 0;
  while (anchors.length < 8) {
    const source = anchors[pad % count];
    anchors.push({ x: source.x * 0.72 + BASE_X * 0.28, y: source.y * 0.72 + (SOIL_Y - 4) * 0.28, pedicel: null });
    pad += 1;
  }

  return { stem: stem, leaves: leaves.join(''), anchors: anchors, lean: jitter(rng, 3) };
}

function pebbleSucculent(rng, pal) {
  const cx = BASE_X;
  const cy = 110;
  const stem = '<ellipse cx="60" cy="124" rx="9" ry="5" fill="' + pal.leafDark + '"/>';

  const leaves = [];
  for (let i = 0; i < 9; i += 1) {
    const angle = -172 + (i / 8) * 164 + jitter(rng, 5);
    const rad = (angle * Math.PI) / 180;
    const lx = cx + Math.cos(rad) * 15;
    const ly = cy + Math.sin(rad) * 11;
    leaves.push('<ellipse cx="' + r2(lx) + '" cy="' + r2(ly) + '" rx="13" ry="8" fill="' +
      (i % 2 === 0 ? pal.leaf : pal.leafDark) + '" transform="rotate(' + r2(angle) + ' ' +
      r2(lx) + ' ' + r2(ly) + ')"/>');
  }
  leaves.push('<ellipse cx="' + cx + '" cy="' + (cy - 1) + '" rx="9.5" ry="7" fill="' + pal.leaf + '"/>');

  const anchors = [];
  for (let i = 0; i < 8; i += 1) {
    const angle = (-160 + i * 20) * (Math.PI / 180);
    anchors.push({ x: cx + Math.cos(angle) * 9, y: cy - 3 + Math.sin(angle) * 6, pedicel: null });
  }

  return { stem: stem, leaves: leaves.join(''), anchors: anchors, lean: jitter(rng, 2) };
}

const SPECIES_BUILDERS = {
  'kopi-vine': kopiVine,
  'thread-orchid': threadOrchid,
  bellflower: bellflower,
  'stacked-bamboo': stackedBamboo,
  'ribbon-fern': ribbonFern,
  'pebble-succulent': pebbleSucculent
};

/* ---- blooms ------------------------------------------------------------- */

function placeBlooms(spec, anchors, rng) {
  const first = anchors[0];
  const points = [];

  if (spec.placement === 'single') {
    points.push({ x: first.x, y: first.y, pedicel: first.pedicel });
  } else if (spec.placement === 'cluster') {
    for (let i = 0; i < spec.count; i += 1) {
      const angle = ((-90 + i * (360 / spec.count)) * Math.PI) / 180;
      points.push({
        x: first.x + Math.cos(angle) * 6.6,
        y: first.y + Math.sin(angle) * 6,
        pedicel: i === 0 ? first.pedicel : null
      });
    }
  } else if (spec.placement === 'pair') {
    points.push({ x: first.x - 7.5, y: first.y + 1, pedicel: first.pedicel });
    points.push({ x: first.x + 7.5, y: first.y - 1, pedicel: null });
  } else {
    for (let i = 0; i < spec.count; i += 1) {
      const anchor = anchors[i % anchors.length];
      points.push({ x: anchor.x, y: anchor.y, pedicel: anchor.pedicel });
    }
  }

  for (let i = 0; i < points.length; i += 1) {
    points[i].x += jitter(rng, 2.6);
    points[i].y += jitter(rng, 2.6);
  }
  return points;
}

function bloomMotif(motif, x, y, size, pal, rng) {
  const cx = r2(x);
  const cy = r2(y);

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

function renderBlooms(spec, anchors, pal, rng) {
  const points = placeBlooms(spec, anchors, rng);
  const parts = [];
  for (let i = 0; i < points.length; i += 1) {
    const point = points[i];
    if (point.pedicel) {
      parts.push('<path d="M' + r2(point.pedicel[0]) + ' ' + r2(point.pedicel[1]) + ' L' +
        r2(point.x) + ' ' + r2(point.y - spec.size * 0.6) + '" stroke="' + pal.leafDark +
        '" stroke-width="2.2" fill="none" stroke-linecap="round"/>');
    }
    parts.push(bloomMotif(spec.motif, point.x, point.y, spec.size, pal, rng));
  }
  return parts.join('');
}

/* ---- ornaments ---------------------------------------------------------- */
/* Drawn around a local origin so the whole thing can be placed and tilted as
   one group, tucked beside the pot where it will not sit on top of the plant. */

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

/* ---- pot ---------------------------------------------------------------- */

function potSvg() {
  return '<path d="M34 133 H86 L81 152 A5 5 0 0 1 76 156 H44 A5 5 0 0 1 39 152 Z" fill="' + POT_BODY + '"/>' +
    '<rect x="29" y="123" width="62" height="11" rx="4" fill="' + POT_RIM + '"/>' +
    '<ellipse cx="60" cy="127" rx="25" ry="5" fill="' + SOIL + '"/>';
}

/* ---- the one exported call --------------------------------------------- */

/**
 * Compose a plant from a memory. Pure, deterministic, DOM free.
 * @param {{objectId: string, answers: {who: string, where: string, feeling: string}}} memory
 * @returns {{svg: string, signature: string, seed: number, traits: Object}}
 */
export function composePlant(memory) {
  const input = memory === null || typeof memory !== 'object' ? {} : memory;
  const answers = input.answers === null || typeof input.answers !== 'object' ? {} : input.answers;

  const objectId = SPECIES_BY_OBJECT[input.objectId] ? input.objectId : FALLBACK.object;
  const who = BLOOMS[answers.who] ? answers.who : FALLBACK.who;
  const where = ORNAMENTS.indexOf(answers.where) === -1 ? FALLBACK.where : answers.where;
  const feeling = PALETTES[answers.feeling] ? answers.feeling : FALLBACK.feeling;

  const seed = hashString(objectId + '|' + who + '|' + where + '|' + feeling);
  const rng = makeRng(seed);

  const species = SPECIES_BY_OBJECT[objectId];
  const pal = PALETTES[feeling];
  const bloomSpec = BLOOMS[who];

  const built = SPECIES_BUILDERS[species](rng, pal);
  const blooms = renderBlooms(bloomSpec, built.anchors, pal, rng);
  const tilt = jitter(rng, 10);
  const lean = 'transform="rotate(' + r2(built.lean) + ' ' + BASE_X + ' ' + SOIL_Y + ')"';

  const label = 'A ' + SPECIES_LABELS[species] + ' plant with ' + pal.label + ' blooms';

  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 160" role="img"' +
    ' aria-label="' + label + '"' +
    ' data-species="' + species + '"' +
    ' data-palette="' + feeling + '"' +
    ' data-bloom="' + who + '"' +
    ' data-ornament="' + where + '"' +
    ' data-seed="' + seed + '"' +
    ' class="plant">' +
    '<g class="layer-pot">' + potSvg() + '</g>' +
    '<g class="layer-stem" ' + lean + '>' + built.stem + '</g>' +
    '<g class="layer-leaves" ' + lean + '>' + built.leaves + '</g>' +
    '<g class="layer-blooms" ' + lean + '>' + blooms + '</g>' +
    '<g class="layer-ornament" transform="translate(20 124) rotate(' + r2(tilt) + ')">' +
    ornamentSvg(where, pal) + '</g>' +
    '</svg>';

  return {
    svg: svg,
    signature: species + '|' + feeling + '|' + who + '|' + where,
    seed: seed,
    traits: {
      species: species,
      speciesLabel: SPECIES_LABELS[species],
      palette: feeling,
      paletteLabel: pal.label,
      bloom: who,
      ornament: where
    }
  };
}
