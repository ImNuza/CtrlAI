#!/usr/bin/env node
/*
  Composer check for Garden of Life. Node only, no browser, no server, no
  playwright. It loads the real content/plant-traits.json off disk, proves the
  composer is deterministic and total, and writes qa/contact-sheet.html so a human
  can judge the eight silhouettes and the ten crops at a glance.

  Run: node games/garden-of-life/qa/composer-check.mjs
  Exits nonzero if any check fails.
*/

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadTraits, composePlant, composeCrop } from '../js/composer.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const traitsPath = path.join(here, '..', 'content', 'plant-traits.json');
const sheetPath = path.join(here, 'contact-sheet.html');

/* The closed sets out of content/SCHEMAS.md, repeated here on purpose: a check
   that imports its expectations from the thing it is checking proves nothing. */
const OBJECT_IDS = ['kopitiam-cup', 'setron-tv', 'sewing-machine', 'kampung-house',
  'rediffusion-set', 'provision-shop', 'dragon-playground', 'tingkat'];
const PALETTES = ['warm', 'happy', 'wistful', 'calm', 'proud'];
const BLOOMS = ['one-big', 'pair', 'trio', 'cluster', 'many'];
const ORNAMENTS = ['kampung', 'first-flat', 'kopitiam', 'market', 'seaside'];
const CROPS = ['bayam', 'kangkung', 'chye-sim', 'chilli', 'tomato', 'calamansi', 'pandan',
  'ginger', 'long-bean', 'sweet-potato-leaf'];
const ARCHETYPES = ['leafy', 'fruiting', 'climbing', 'herb'];
const PRICE_TIERS = ['common', 'uncommon', 'rare'];
const STAGES = [0, 1, 2];

const REQUIRED_ATTRS = ['data-species', 'data-palette', 'data-bloom', 'data-ornament',
  'data-stage', 'data-wilted', 'data-seed', 'aria-label'];

/* Fixed chrome: the pot, the wood and the cream fills the ornaments use. They are
   not palette colours and every one of them sits inside a dark stroke, so they are
   out of scope for the wilt contrast floor, which is about the plant not fading
   into the plot behind it. */
const CHROME = ['#8a5a3b', '#6f472c', '#4a3524', '#6b4423', '#8f3f1d', '#f2e6d2'];
const SUNK = '#f3ebde';
const WILT_FLOOR = 3;

let failures = 0;

function check(name, ok, detail) {
  process.stdout.write((ok ? 'PASS  ' : 'FAIL  ') + name + (detail ? '  ' + detail : '') + '\n');
  if (!ok) {
    failures += 1;
  }
}

function tagsFor(index) {
  return {
    palette: PALETTES[index % PALETTES.length],
    bloom: BLOOMS[index % BLOOMS.length],
    ornament: ORNAMENTS[index % ORNAMENTS.length]
  };
}

function badMarkup(svg) {
  if (typeof svg !== 'string' || svg === '') {
    return 'empty';
  }
  if (svg.indexOf('NaN') !== -1) {
    return 'NaN';
  }
  if (svg.indexOf('undefined') !== -1) {
    return 'undefined';
  }
  if (svg.indexOf('null') !== -1) {
    return 'null';
  }
  return '';
}

function missingAttrs(svg) {
  const missing = [];
  for (let i = 0; i < REQUIRED_ATTRS.length; i += 1) {
    if (svg.indexOf(' ' + REQUIRED_ATTRS[i] + '="') === -1) {
      missing.push(REQUIRED_ATTRS[i]);
    }
  }
  return missing;
}

/* Contrast, reimplemented rather than imported, for the same reason as the closed
   sets above. WCAG 2.x relative luminance. */
function toRgb(hex) {
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16)
  };
}

function channel(byte) {
  const c = byte / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function luminance(hex) {
  const rgb = toRgb(hex);
  return 0.2126 * channel(rgb.r) + 0.7152 * channel(rgb.g) + 0.0722 * channel(rgb.b);
}

function ratio(a, b) {
  const la = luminance(a);
  const lb = luminance(b);
  const hi = la > lb ? la : lb;
  const lo = la > lb ? lb : la;
  return (hi + 0.05) / (lo + 0.05);
}

function hexesIn(svg) {
  const found = svg.match(/#[0-9a-f]{6}/g);
  return found === null ? [] : found;
}

/* ---- the checks --------------------------------------------------------- */

async function runChecks() {
  // Before any traits land the module must still answer, so the shell can render
  // a garden while content is still in flight.
  const bare = composePlant({ objectId: 'kopitiam-cup', tags: { palette: 'warm' } });
  const bareCrop = composeCrop({ cropId: 'bayam' });
  check('no traits: composePlant returns the neutral sprout',
    bare.svg.indexOf('data-species="sprout"') !== -1 && badMarkup(bare.svg) === '');
  check('no traits: composeCrop returns the neutral sprout',
    bareCrop.svg.indexOf('data-species="sprout"') !== -1 && badMarkup(bareCrop.svg) === '');

  const junk = [null, undefined, 42, 'traits', {}, { species: {}, palettes: {} }];
  let refused = 0;
  for (let i = 0; i < junk.length; i += 1) {
    if (loadTraits(junk[i]) === false) {
      refused += 1;
    }
  }
  check('loadTraits refuses unusable data', refused === junk.length,
    refused + ' of ' + junk.length + ' refused');
  check('after refusing, compose still answers',
    composePlant({ objectId: 'tingkat' }).svg.indexOf('data-species="sprout"') !== -1);

  let parsed = null;
  let parseError = '';
  try {
    parsed = JSON.parse(await readFile(traitsPath, 'utf8'));
  } catch (error) {
    parseError = String(error && error.message ? error.message : error);
  }
  check('plant-traits.json parses', parsed !== null, parseError);
  if (parsed === null) {
    return;
  }

  // Coverage of every closed set in SCHEMAS.md.
  const mapped = parsed.species_by_object === null || typeof parsed.species_by_object !== 'object'
    ? {} : parsed.species_by_object;
  const missingObjects = OBJECT_IDS.filter(function (id) {
    return typeof mapped[id] !== 'string' || !parsed.species[mapped[id]];
  });
  check('all 8 objects map to a declared species', missingObjects.length === 0,
    missingObjects.join(', '));

  const speciesIds = Object.keys(parsed.species || {});
  const badStages = speciesIds.filter(function (id) {
    const stages = parsed.species[id].stages;
    if (!Array.isArray(stages) || stages.length !== 3) {
      return true;
    }
    return stages.some(function (stage) {
      return typeof stage.scale !== 'number' || !Number.isFinite(stage.scale) ||
        typeof stage.blooms !== 'boolean' || typeof stage.ornament !== 'boolean' ||
        typeof stage.sprout !== 'boolean';
    });
  });
  check('8 species, 3 well formed stages each',
    speciesIds.length === 8 && badStages.length === 0, badStages.join(', '));

  const paletteMisses = PALETTES.filter(function (key) {
    const entry = (parsed.palettes || {})[key];
    if (entry === undefined || entry === null) {
      return true;
    }
    return ['bloom1', 'bloom2', 'leaf', 'leafDark', 'accent'].some(function (field) {
      return !/^#[0-9a-fA-F]{6}$/.test(String(entry[field]));
    }) || typeof entry.label !== 'string' || entry.label === '';
  });
  check('all 5 palettes present with 5 valid hexes and a label',
    paletteMisses.length === 0, paletteMisses.join(', '));

  const bloomMisses = BLOOMS.filter(function (key) {
    const entry = (parsed.blooms || {})[key];
    return entry === undefined || entry === null || typeof entry.motif !== 'string' ||
      typeof entry.count !== 'number' || typeof entry.placement !== 'string' ||
      typeof entry.size !== 'number';
  });
  check('all 5 blooms present with motif, count, placement and size',
    bloomMisses.length === 0, bloomMisses.join(', '));

  const ornamentMisses = ORNAMENTS.filter(function (key) {
    const entry = (parsed.ornaments || {})[key];
    return entry === undefined || entry === null || typeof entry.draw !== 'string';
  });
  check('all 5 ornaments present with a draw key', ornamentMisses.length === 0,
    ornamentMisses.join(', '));

  const cropMisses = CROPS.filter(function (id) {
    const entry = (parsed.crops || {})[id];
    if (entry === undefined || entry === null) {
      return true;
    }
    return ARCHETYPES.indexOf(entry.archetype) === -1 ||
      PRICE_TIERS.indexOf(entry.price_tier) === -1 ||
      typeof entry.label !== 'string' || entry.label === '' ||
      PALETTES.indexOf(entry.palette) === -1 ||
      !Array.isArray(entry.stages) || entry.stages.length !== 3;
  });
  check('all 10 crops present with valid archetype, price tier, palette and stages',
    cropMisses.length === 0 && Object.keys(parsed.crops || {}).length === 10,
    cropMisses.join(', '));

  const defaults = parsed.defaults === null || typeof parsed.defaults !== 'object'
    ? {} : parsed.defaults;
  check('defaults block resolves',
    Boolean((parsed.species || {})[defaults.species]) &&
    PALETTES.indexOf(defaults.palette) !== -1 &&
    BLOOMS.indexOf(defaults.bloom) !== -1 &&
    ORNAMENTS.indexOf(defaults.ornament) !== -1);

  check('loadTraits accepts the real file', loadTraits(parsed) === true);

  // Determinism, markup health and attributes across the whole matrix.
  let unstable = [];
  let dirty = [];
  let attrGaps = [];
  for (let i = 0; i < OBJECT_IDS.length; i += 1) {
    for (let s = 0; s < STAGES.length; s += 1) {
      for (let w = 0; w < 2; w += 1) {
        const request = {
          objectId: OBJECT_IDS[i],
          tags: tagsFor(i),
          stage: STAGES[s],
          wilted: w === 1
        };
        const first = composePlant(request);
        const second = composePlant({
          objectId: request.objectId,
          tags: tagsFor(i),
          stage: request.stage,
          wilted: request.wilted
        });
        const where = OBJECT_IDS[i] + ' stage ' + STAGES[s] + (w === 1 ? ' wilted' : '');
        if (first.svg !== second.svg || first.seed !== second.seed) {
          unstable.push(where);
        }
        const bad = badMarkup(first.svg);
        if (bad !== '') {
          dirty.push(where + ' (' + bad + ')');
        }
        const gaps = missingAttrs(first.svg);
        if (gaps.length > 0) {
          attrGaps.push(where + ' (' + gaps.join(' ') + ')');
        }
      }
    }
  }
  check('identical input gives a byte identical svg, 8 objects x 3 stages x 2 wilt states',
    unstable.length === 0, unstable.join(', '));
  check('no NaN, undefined or null in any plant svg', dirty.length === 0, dirty.join(', '));
  check('every plant svg carries the full data attribute set', attrGaps.length === 0,
    attrGaps.join(', '));

  // Distinctness: same tags for everyone, so only the object is talking.
  const flat = { palette: 'warm', bloom: 'one-big', ornament: 'kampung' };
  const sameTagSignatures = {};
  const speciesSeen = {};
  for (let i = 0; i < OBJECT_IDS.length; i += 1) {
    const built = composePlant({ objectId: OBJECT_IDS[i], tags: flat });
    sameTagSignatures[built.signature] = true;
    speciesSeen[built.traits.species] = true;
  }
  check('8 objects, 8 distinct signatures on identical tags',
    Object.keys(sameTagSignatures).length === 8,
    Object.keys(sameTagSignatures).length + ' distinct');
  check('8 objects, 8 distinct data-species', Object.keys(speciesSeen).length === 8,
    Object.keys(speciesSeen).join(' '));

  const variedSignatures = {};
  const variedSeeds = {};
  for (let i = 0; i < OBJECT_IDS.length; i += 1) {
    const built = composePlant({ objectId: OBJECT_IDS[i], tags: tagsFor(i) });
    variedSignatures[built.signature] = true;
    variedSeeds[built.seed] = true;
  }
  check('8 objects with differing tags, 8 distinct signatures and 8 distinct seeds',
    Object.keys(variedSignatures).length === 8 && Object.keys(variedSeeds).length === 8);

  // The signature is the memory, not the picture, so growing must not change it.
  const grown = composePlant({ objectId: 'kampung-house', tags: tagsFor(3), stage: 0 });
  const bloomed = composePlant({ objectId: 'kampung-house', tags: tagsFor(3), stage: 2 });
  check('signature and seed are stage independent',
    grown.signature === bloomed.signature && grown.seed === bloomed.seed);
  check('stages actually differ', grown.svg !== bloomed.svg);

  const unknown = composePlant({ objectId: 'not-a-real-object', tags: { palette: 'nope' } });
  check('unknown object and unknown tags fall back without throwing',
    badMarkup(unknown.svg) === '' && unknown.traits.species === defaults.species &&
    unknown.traits.palette === defaults.palette);

  // Crops.
  let cropDirty = [];
  let cropUnstable = [];
  const cropSignatures = {};
  for (let i = 0; i < CROPS.length; i += 1) {
    cropSignatures[composeCrop({ cropId: CROPS[i] }).signature] = true;
    for (let s = 0; s < STAGES.length; s += 1) {
      const first = composeCrop({ cropId: CROPS[i], stage: STAGES[s] });
      const second = composeCrop({ cropId: CROPS[i], stage: STAGES[s] });
      const where = CROPS[i] + ' stage ' + STAGES[s];
      if (first.svg !== second.svg) {
        cropUnstable.push(where);
      }
      const bad = badMarkup(first.svg);
      if (bad !== '' || first.svg.indexOf('data-kind="crop"') === -1 ||
        missingAttrs(first.svg).length > 0) {
        cropDirty.push(where + (bad === '' ? ' (attributes)' : ' (' + bad + ')'));
      }
    }
    const wilt = composeCrop({ cropId: CROPS[i], stage: 2, wilted: true });
    if (badMarkup(wilt.svg) !== '') {
      cropDirty.push(CROPS[i] + ' wilted');
    }
  }
  check('all 10 crops render at 3 stages, byte identical on repeat',
    cropUnstable.length === 0, cropUnstable.join(', '));
  check('no NaN, undefined or null in any crop svg, all tagged data-kind crop',
    cropDirty.length === 0, cropDirty.join(', '));
  check('10 crops, 10 distinct signatures', Object.keys(cropSignatures).length === 10);

  // Wilt: visible, and never a plant that has faded into the plot behind it.
  let faint = [];
  let unchanged = [];
  for (let i = 0; i < OBJECT_IDS.length; i += 1) {
    const healthy = composePlant({ objectId: OBJECT_IDS[i], tags: tagsFor(i), stage: 2 });
    const thirsty = composePlant({
      objectId: OBJECT_IDS[i], tags: tagsFor(i), stage: 2, wilted: true
    });
    if (healthy.svg === thirsty.svg) {
      unchanged.push(OBJECT_IDS[i]);
    }
    if (thirsty.svg.indexOf('data-wilted="true"') === -1) {
      unchanged.push(OBJECT_IDS[i] + ' attribute');
    }
    const hexes = hexesIn(thirsty.svg);
    for (let h = 0; h < hexes.length; h += 1) {
      if (CHROME.indexOf(hexes[h]) !== -1) {
        continue;
      }
      if (ratio(hexes[h], SUNK) < WILT_FLOOR) {
        faint.push(OBJECT_IDS[i] + ' ' + hexes[h] + ' at ' + ratio(hexes[h], SUNK).toFixed(2));
      }
    }
  }
  check('wilt changes every species and sets data-wilted', unchanged.length === 0,
    unchanged.join(', '));
  check('every wilted plant colour stays at or above 3:1 on the plot surface',
    faint.length === 0, faint.join(', '));

  // No shame iconography can be proved by machine, but the palette can: nothing
  // in a wilt render may turn grey or red, which is the whole vocabulary of
  // failure art. Muting runs towards olive, so hue stays green or warm.
  let shamed = [];
  const shameHexes = ['#ff0000', '#cc0000', '#888888', '#999999', '#666666'];
  for (let i = 0; i < OBJECT_IDS.length; i += 1) {
    const thirsty = composePlant({ objectId: OBJECT_IDS[i], tags: tagsFor(i), stage: 2, wilted: true });
    for (let h = 0; h < shameHexes.length; h += 1) {
      if (thirsty.svg.indexOf(shameHexes[h]) !== -1) {
        shamed.push(OBJECT_IDS[i] + ' ' + shameHexes[h]);
      }
    }
    // Escaped rather than literal so no glyph ever lands in a source file here.
    if (/<text|\u2715|\u2716|\u274c/.test(thirsty.svg)) {
      shamed.push(OBJECT_IDS[i] + ' text mark');
    }
  }
  check('no death grey, no alarm red and no text marks in any wilt render',
    shamed.length === 0, shamed.join(', '));
}

/* ---- contact sheet ------------------------------------------------------ */

function cell(svg, label, small) {
  return '<figure class="cell' + (small ? ' cell-plot' : '') + '">' + svg +
    '<figcaption>' + label + '</figcaption></figure>';
}

function section(title, note, cells, gridClass) {
  return '<section><h2>' + title + '</h2><p>' + note + '</p><div class="grid' +
    (gridClass ? ' ' + gridClass : '') + '">' + cells.join('') + '</div></section>';
}

function buildSheet() {
  const parts = [];

  const speciesCells = [];
  const plotCells = [];
  for (let i = 0; i < OBJECT_IDS.length; i += 1) {
    const id = OBJECT_IDS[i];
    const tags = tagsFor(i);
    for (let s = 0; s < STAGES.length; s += 1) {
      const built = composePlant({ objectId: id, tags: tags, stage: STAGES[s] });
      speciesCells.push(cell(built.svg, built.traits.speciesLabel + '<br>stage ' + STAGES[s]));
    }
    const thirsty = composePlant({ objectId: id, tags: tags, stage: 2, wilted: true });
    speciesCells.push(cell(thirsty.svg, thirsty.traits.speciesLabel + '<br>wilted'));

    plotCells.push(cell(composePlant({ objectId: id, tags: tags, stage: 2 }).svg, id, true));
  }
  parts.push(section('Eight species, three stages and a wilt',
    'One row of four per species: stage 0 sprout, stage 1, stage 2 full bloom, then stage 2 thirsty. Tags rotate per object so palette, bloom and ornament all get an airing.',
    speciesCells));
  parts.push(section('The same eight at plot size',
    'About 106px, the size a plot in the garden grid really gives a plant. This is the row that decides whether the silhouettes work.',
    plotCells, 'grid-plot'));

  const paletteCells = PALETTES.map(function (palette) {
    return cell(composePlant({
      objectId: 'kopitiam-cup',
      tags: { palette: palette, bloom: 'trio', ornament: 'kampung' }
    }).svg, palette);
  });
  parts.push(section('One species, five palettes', 'Kopi vine throughout. The feeling drives the palette.', paletteCells));

  const bloomCells = BLOOMS.map(function (bloom) {
    return cell(composePlant({
      objectId: 'kopitiam-cup',
      tags: { palette: 'warm', bloom: bloom, ornament: 'kampung' }
    }).svg, bloom);
  });
  parts.push(section('One species, five blooms', 'Kopi vine throughout. The who drives bloom count and arrangement.', bloomCells));

  const bellCells = BLOOMS.map(function (bloom) {
    return cell(composePlant({
      objectId: 'rediffusion-set',
      tags: { palette: 'wistful', bloom: bloom, ornament: 'first-flat' }
    }).svg, 'wire lily, ' + bloom);
  });
  parts.push(section('The species that claims its own motif',
    'The wire lily rings whatever the who says, so the bloom trait only moves count and layout. Hanging pedicels are the same machinery the bells use.',
    bellCells));

  const ornamentCells = ORNAMENTS.map(function (ornament) {
    return cell(composePlant({
      objectId: 'dragon-playground',
      tags: { palette: 'proud', bloom: 'cluster', ornament: ornament }
    }).svg, ornament);
  });
  parts.push(section('One species, five ornaments', 'Dragon tail throughout. The where drives the ornament tucked beside the pot.', ornamentCells));

  const cropCells = [];
  for (let i = 0; i < CROPS.length; i += 1) {
    for (let s = 0; s < STAGES.length; s += 1) {
      const built = composeCrop({ cropId: CROPS[i], stage: STAGES[s] });
      cropCells.push(cell(built.svg, built.traits.cropLabel + '<br>stage ' + STAGES[s] +
        ' (' + built.traits.archetype + ', ' + built.traits.form + ')'));
    }
  }
  parts.push(section('Ten crops, three stages', 'Four archetype builders, parameterized per crop. Fruit is held back until the last stage so a crop visibly finishes.', cropCells));

  return '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
    '<title>Garden of Life contact sheet</title>\n<style>\n' +
    'body { margin: 0; padding: 24px; background: #ffffff; color: #1c1c1c;' +
    ' font-family: system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif; font-size: 28px; }\n' +
    'h1 { font-size: 40px; margin: 0 0 8px; }\n' +
    'h2 { font-size: 32px; margin: 32px 0 8px; }\n' +
    'p { margin: 0 0 16px; }\n' +
    '.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 16px; }\n' +
    /* The plant shrinks to plot size, the caption does not: 28px is the floor for
       anything a human reads, a QA sheet included. */
    '.grid-plot { grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); }\n' +
    '.cell { margin: 0; padding: 12px; border: 2px solid #c9c1b4; border-radius: 12px;' +
    ' background: #f3ebde; }\n' +
    '.cell svg { width: 150px; max-width: 100%; height: auto; display: block; margin: 0 auto; }\n' +
    '.cell-plot { padding: 8px; }\n' +
    '.cell-plot svg { width: 106px; }\n' +
    'figcaption { margin-top: 12px; text-align: center; font-size: 28px; overflow-wrap: break-word; }\n' +
    '</style>\n</head>\n<body>\n<h1>Garden of Life contact sheet</h1>\n' +
    '<p>Cells sit on the plot surface colour, so anything that fades here fades in the garden.</p>\n' +
    parts.join('\n') + '\n</body>\n</html>\n';
}

async function main() {
  await runChecks();
  await writeFile(sheetPath, buildSheet());
  process.stdout.write('\ncontact sheet written to ' + sheetPath + '\n');
  process.stdout.write(failures === 0
    ? 'all checks passed\n'
    : failures + ' check(s) failed\n');
  if (failures > 0) {
    process.exit(1);
  }
}

main().catch(function (error) {
  process.stderr.write(String(error && error.stack ? error.stack : error) + '\n');
  process.exit(1);
});
