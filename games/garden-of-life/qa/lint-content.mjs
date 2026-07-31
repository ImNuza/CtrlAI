/*
  Garden of Life content linter.

  Validates every content bank against content/SCHEMAS.md. Plain node, no
  dependencies, nothing but node:fs and node:path. Run it from the repo root:

      node games/garden-of-life/qa/lint-content.mjs

  Exit code 1 on any violation, 0 when clean. Warnings are printed but never
  fail the run, so a bank that has not landed yet does not block the build.

  Every violation prints as three columns: file, path inside the file, rule.
  Output goes through process.stdout so this stays clear of the no-console
  house rule: printing is the whole product here.
*/

import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const HERE = path.dirname(decodeURIComponent(new URL(import.meta.url).pathname));
const GAME_DIR = path.resolve(HERE, '..');
const CONTENT_DIR = path.join(GAME_DIR, 'content');
const REPO_ROOT = path.resolve(GAME_DIR, '..', '..');

/* ---- closed vocabularies, straight from SCHEMAS.md ---------------------- */

const OBJECT_IDS = [
  'kopitiam-cup', 'setron-tv', 'sewing-machine', 'kampung-house',
  'rediffusion-set', 'provision-shop', 'dragon-playground', 'tingkat'
];

const AXES = ['who', 'where', 'feeling'];
const AXIS_PREFIX = { who: 'bloom', where: 'ornament', feeling: 'palette' };

const PALETTES = ['warm', 'happy', 'wistful', 'calm', 'proud'];
const BLOOMS = ['one-big', 'pair', 'trio', 'cluster', 'many'];
const ORNAMENTS = ['kampung', 'first-flat', 'kopitiam', 'market', 'seaside'];
const AXIS_VALUES = { who: BLOOMS, where: ORNAMENTS, feeling: PALETTES };

const CROPS = [
  'bayam', 'kangkung', 'chye-sim', 'chilli', 'tomato',
  'calamansi', 'pandan', 'ginger', 'long-bean', 'sweet-potato-leaf'
];

const EVENT_KEYS = [
  'first_visit', 'return_visit', 'return_after_absence', 'planting',
  'plant_comment', 'watering', 'wilt_notice', 'harvest', 'meal_unlock',
  'photo_result', 'story_retell'
];

const BASE_SLOTS = ['name', 'plant', 'memory_hint'];
const RETELL_SLOTS = ['object_phrase', 'who_phrase', 'where_phrase', 'feeling_phrase'];

const BANNED_SUBSTRINGS = [
  'prevent', 'cure', 'dementia', 'memory loss', 'disease',
  'doctor', 'medicine', 'blood pressure', 'cholesterol', 'diabetes'
];

const ARCHETYPES = ['leafy', 'fruiting', 'climbing', 'herb'];
const PRICE_TIERS = ['common', 'uncommon', 'rare'];

const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const SLOT_PATTERN = /\{([a-zA-Z0-9_]+)\}/g;

/* ---- collectors --------------------------------------------------------- */

const violations = [];
const warnings = [];
const notes = [];

function fail(file, at, rule) {
  violations.push({ file: rel(file), at: at, rule: rule });
}

function warn(message) {
  warnings.push(message);
}

function note(message) {
  notes.push(message);
}

function rel(file) {
  const relative = path.relative(REPO_ROOT, file);
  return relative === '' ? file : relative;
}

/* ---- small helpers ------------------------------------------------------ */

function wordCount(value) {
  const trimmed = String(value).trim();
  if (trimmed === '') {
    return 0;
  }
  return trimmed.split(/\s+/).length;
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function slotsIn(text) {
  const found = [];
  let match = SLOT_PATTERN.exec(text);
  while (match !== null) {
    if (found.indexOf(match[1]) === -1) {
      found.push(match[1]);
    }
    match = SLOT_PATTERN.exec(text);
  }
  SLOT_PATTERN.lastIndex = 0;
  return found;
}

// Mirrors tidy() in shared/ai.js so the slot safety check sees what the player
// would actually read when a slot has no value.
function tidy(text) {
  return text
    .replace(/\s+([,.!?;:])/g, '$1')
    .replace(/\(\s*\)/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function dropSlots(text, slots) {
  let out = text;
  for (let i = 0; i < slots.length; i += 1) {
    out = out.split('{' + slots[i] + '}').join('');
  }
  return tidy(out);
}

function brokenShape(text) {
  if (/^\s*[,;:]/.test(text)) {
    return 'leading comma';
  }
  if (/,\s*[!?.]/.test(text)) {
    return 'comma against end punctuation';
  }
  if (/,\s*,/.test(text)) {
    return 'double comma';
  }
  if (/,\s*$/.test(text)) {
    return 'trailing comma';
  }
  return '';
}

/* ---- file loading and global scans -------------------------------------- */

function loadBank(name) {
  const file = path.join(CONTENT_DIR, name);
  if (!existsSync(file)) {
    return { file: file, present: false, data: null };
  }
  const raw = readFileSync(file, 'utf8');
  scanCharacters(file, raw);
  let data = null;
  try {
    data = JSON.parse(raw);
  } catch (error) {
    fail(file, '(whole file)', 'invalid JSON: ' + error.message);
    return { file: file, present: true, data: null };
  }
  return { file: file, present: true, data: data };
}

// Em dashes and emoji are banned everywhere, including inside JSON strings.
// Reported once per distinct character per file so one stray glyph does not
// bury the rest of the report.
function scanCharacters(file, raw) {
  const lines = raw.split('\n');
  const seen = new Set();
  for (let i = 0; i < lines.length; i += 1) {
    for (const ch of lines[i]) {
      const cp = ch.codePointAt(0);
      if (cp === 0x09 || (cp >= 0x20 && cp <= 0x7e)) {
        continue;
      }
      if (cp >= 0x00c0 && cp <= 0x00ff) {
        continue;
      }
      const hex = 'U+' + cp.toString(16).toUpperCase().padStart(4, '0');
      if (seen.has(hex)) {
        continue;
      }
      seen.add(hex);
      const where = 'line ' + (i + 1);
      if (cp === 0x2014 || cp === 0x2015) {
        fail(file, where, 'em dash ' + hex + ' is banned in every written output');
      } else {
        fail(file, where, 'non-ascii character ' + hex + ' (emoji or unsupported glyph)');
      }
    }
  }
}

/* ---- memory-prompts.json ------------------------------------------------ */

function lintMemoryPrompts(bank) {
  const file = bank.file;
  const data = bank.data;
  if (data === null) {
    return;
  }
  if (!isPlainObject(data) || !Array.isArray(data.objects)) {
    fail(file, 'objects', 'missing objects array');
    return;
  }

  const objects = data.objects;
  if (objects.length !== OBJECT_IDS.length) {
    fail(file, 'objects', 'expected exactly ' + OBJECT_IDS.length + ' objects, found ' + objects.length);
  }

  const seenQuestions = new Map();

  for (let i = 0; i < objects.length; i += 1) {
    const object = objects[i];
    const base = 'objects[' + i + ']';
    if (!isPlainObject(object)) {
      fail(file, base, 'object entry is not an object');
      continue;
    }

    const expectedId = OBJECT_IDS[i];
    if (object.id !== expectedId) {
      fail(file, base + '.id', 'expected id "' + expectedId + '" at this position, found "' + object.id + '"');
    }
    if (typeof object.label !== 'string' || object.label.trim() === '') {
      fail(file, base + '.label', 'label is required');
    } else if (wordCount(object.label) > 3) {
      fail(file, base + '.label', 'label has ' + wordCount(object.label) + ' words, max 3');
    }
    if (typeof object.phrase !== 'string' || object.phrase.trim() === '') {
      fail(file, base + '.phrase', 'phrase is required');
    }
    if (typeof object.blurb !== 'string' || object.blurb.trim() === '') {
      fail(file, base + '.blurb', 'blurb is required');
    } else if (wordCount(object.blurb) > 10) {
      fail(file, base + '.blurb', 'blurb has ' + wordCount(object.blurb) + ' words, max 10');
    }

    if (!Array.isArray(object.prompts)) {
      fail(file, base + '.prompts', 'missing prompts array');
      continue;
    }
    if (object.prompts.length !== 3) {
      fail(file, base + '.prompts', 'expected exactly 3 prompts, found ' + object.prompts.length);
    }

    let freeTextCount = 0;

    for (let j = 0; j < object.prompts.length; j += 1) {
      const prompt = object.prompts[j];
      const at = base + '.prompts[' + j + ']';
      if (!isPlainObject(prompt)) {
        fail(file, at, 'prompt entry is not an object');
        continue;
      }

      const expectedAxis = AXES[j];
      if (prompt.axis !== expectedAxis) {
        fail(file, at + '.axis', 'expected axis "' + expectedAxis + '" at this position, found "' + prompt.axis + '"');
      }

      if (typeof prompt.q !== 'string' || prompt.q.trim() === '') {
        fail(file, at + '.q', 'q is required');
      } else {
        if (wordCount(prompt.q) > 10) {
          fail(file, at + '.q', 'q has ' + wordCount(prompt.q) + ' words, max 10');
        }
        if (!prompt.q.trim().endsWith('?')) {
          fail(file, at + '.q', 'q must end with a question mark');
        }
        const key = prompt.q.trim().toLowerCase();
        if (seenQuestions.has(key)) {
          fail(file, at + '.q', 'question wording repeats ' + seenQuestions.get(key) + ', that reads as a survey');
        } else {
          seenQuestions.set(key, at + '.q');
        }
      }

      if (typeof prompt.free_text !== 'boolean') {
        fail(file, at + '.free_text', 'free_text must be true or false');
      } else if (prompt.free_text === true) {
        freeTextCount += 1;
      }

      if (!Array.isArray(prompt.chips)) {
        fail(file, at + '.chips', 'missing chips array');
        continue;
      }
      if (prompt.chips.length !== 4) {
        fail(file, at + '.chips', 'expected exactly 4 chips, found ' + prompt.chips.length);
      }

      const axis = AXES.indexOf(prompt.axis) === -1 ? expectedAxis : prompt.axis;
      const prefix = AXIS_PREFIX[axis];
      const allowed = AXIS_VALUES[axis] || [];
      const traitValues = [];
      const chipIds = new Set();

      for (let k = 0; k < prompt.chips.length; k += 1) {
        const chip = prompt.chips[k];
        const chipAt = at + '.chips[' + k + ']';
        if (!isPlainObject(chip)) {
          fail(file, chipAt, 'chip entry is not an object');
          continue;
        }

        if (typeof chip.id !== 'string' || !KEBAB.test(chip.id)) {
          fail(file, chipAt + '.id', 'chip id must be kebab-case, found "' + chip.id + '"');
        } else if (chipIds.has(chip.id)) {
          fail(file, chipAt + '.id', 'duplicate chip id "' + chip.id + '" inside this prompt');
        } else {
          chipIds.add(chip.id);
        }

        if (typeof chip.label !== 'string' || chip.label.trim() === '') {
          fail(file, chipAt + '.label', 'chip label is required');
        } else if (wordCount(chip.label) > 4) {
          fail(file, chipAt + '.label', 'chip label has ' + wordCount(chip.label) + ' words, max 4');
        }

        if (typeof chip.phrase !== 'string' || chip.phrase.trim() === '') {
          fail(file, chipAt + '.phrase', 'chip phrase is required');
        } else {
          const phrase = chip.phrase;
          const first = phrase.charAt(0);
          if (first !== first.toLowerCase()) {
            fail(file, chipAt + '.phrase', 'phrase must start lowercase, it reads inside a sentence');
          }
          if (phrase.trim().endsWith('.')) {
            fail(file, chipAt + '.phrase', 'phrase must not end with a period');
          }
        }

        if (!Array.isArray(chip.tags)) {
          fail(file, chipAt + '.tags', 'missing tags array');
          continue;
        }
        const axisTags = chip.tags.filter(function (tag) {
          return typeof tag === 'string' && tag.indexOf(prefix + ':') === 0;
        });
        if (axisTags.length !== 1) {
          fail(file, chipAt + '.tags', 'expected exactly one ' + prefix + ':* tag for a ' + axis + ' chip, found ' + axisTags.length);
          continue;
        }
        const value = axisTags[0].slice(prefix.length + 1);
        if (allowed.indexOf(value) === -1) {
          fail(file, chipAt + '.tags', prefix + ' value "' + value + '" is outside the closed set (' + allowed.join(', ') + ')');
          continue;
        }
        traitValues.push(value);
      }

      const distinct = new Set(traitValues);
      if (traitValues.length === prompt.chips.length && distinct.size < 3) {
        fail(file, at + '.chips', 'only ' + distinct.size + ' distinct ' + prefix + ' values, need at least 3 or the answers stop mattering');
      }
    }

    if (freeTextCount > 1) {
      fail(file, base + '.prompts', freeTextCount + ' prompts set free_text, at most 1 per object');
    }
  }

  note('memory-prompts.json: ' + objects.length + ' objects, ' + (objects.length * 3) + ' prompts checked');
}

/* ---- gardener-lines.json ------------------------------------------------ */

function lintGardenerLines(bank) {
  const file = bank.file;
  const data = bank.data;
  if (data === null) {
    return;
  }
  if (!isPlainObject(data) || !isPlainObject(data.events)) {
    fail(file, 'events', 'missing events object');
    return;
  }

  const events = data.events;
  let coreTotal = 0;
  let lineTotal = 0;

  const present = Object.keys(events);
  for (let i = 0; i < present.length; i += 1) {
    if (EVENT_KEYS.indexOf(present[i]) === -1) {
      fail(file, 'events.' + present[i], 'unknown event key, the schema fixes all 11');
    }
  }

  for (let i = 0; i < EVENT_KEYS.length; i += 1) {
    const key = EVENT_KEYS[i];
    const lines = events[key];
    if (!Array.isArray(lines)) {
      fail(file, 'events.' + key, 'missing event key, all 11 are required');
      continue;
    }
    if (lines.length < 5) {
      fail(file, 'events.' + key, 'only ' + lines.length + ' lines, minimum 5');
    }
    lineTotal += lines.length;
    if (i < 10) {
      coreTotal += lines.length;
    }

    const allowedSlots = key === 'story_retell' ? BASE_SLOTS.concat(RETELL_SLOTS) : BASE_SLOTS;
    const seenText = new Set();

    for (let j = 0; j < lines.length; j += 1) {
      const line = lines[j];
      const at = 'events.' + key + '[' + j + ']';
      if (!isPlainObject(line)) {
        fail(file, at, 'line entry is not an object');
        continue;
      }

      if (typeof line.text !== 'string' || line.text.trim() === '') {
        fail(file, at + '.text', 'text is required');
      } else {
        const text = line.text;
        if (wordCount(text) > 12) {
          fail(file, at + '.text', 'text has ' + wordCount(text) + ' words, max 12');
        }
        const key2 = text.trim().toLowerCase();
        if (seenText.has(key2)) {
          fail(file, at + '.text', 'duplicate line inside this event');
        } else {
          seenText.add(key2);
        }

        const used = slotsIn(text);
        for (let s = 0; s < used.length; s += 1) {
          if (allowedSlots.indexOf(used[s]) === -1) {
            fail(file, at + '.text', 'slot {' + used[s] + '} is not allowed here, allowed: ' + allowedSlots.map(function (n) { return '{' + n + '}'; }).join(' '));
          }
        }

        // Slot safety: shared/ai.js drops a missing slot and tidies, so a line
        // that only works with the slot filled breaks in front of the player.
        for (let s = 0; s < used.length; s += 1) {
          const dropped = dropSlots(text, [used[s]]);
          const problem = brokenShape(dropped);
          if (problem !== '') {
            fail(file, at + '.text', 'slot safety: dropping {' + used[s] + '} leaves ' + problem + ' in "' + dropped + '"');
          }
        }
        if (used.length > 1) {
          const dropped = dropSlots(text, used);
          const problem = brokenShape(dropped);
          if (problem !== '') {
            fail(file, at + '.text', 'slot safety: dropping every slot leaves ' + problem + ' in "' + dropped + '"');
          }
        }
      }

      if (!Array.isArray(line.replies)) {
        fail(file, at + '.replies', 'missing replies array');
        continue;
      }
      if (line.replies.length < 2 || line.replies.length > 3) {
        fail(file, at + '.replies', 'expected 2 or 3 replies, found ' + line.replies.length);
      }
      for (let r = 0; r < line.replies.length; r += 1) {
        const reply = line.replies[r];
        if (typeof reply !== 'string' || reply.trim() === '') {
          fail(file, at + '.replies[' + r + ']', 'reply must be a non-empty string');
        } else if (wordCount(reply) > 4) {
          fail(file, at + '.replies[' + r + ']', 'reply has ' + wordCount(reply) + ' words, max 4');
        }
      }
    }
  }

  if (coreTotal < 50) {
    fail(file, 'events', 'only ' + coreTotal + ' lines across the first 10 keys, minimum 50');
  }

  if (Array.isArray(events.story_retell)) {
    const wanted = RETELL_SLOTS.slice();
    const usedAnywhere = new Set();
    for (let j = 0; j < events.story_retell.length; j += 1) {
      const line = events.story_retell[j];
      if (isPlainObject(line) && typeof line.text === 'string') {
        slotsIn(line.text).forEach(function (slot) { usedAnywhere.add(slot); });
      }
    }
    const unused = wanted.filter(function (slot) { return !usedAnywhere.has(slot); });
    if (unused.length > 0) {
      warn('gardener-lines.json: story_retell never uses ' + unused.map(function (n) { return '{' + n + '}'; }).join(' ') + ', the schema says it should use them');
    }
  }

  note('gardener-lines.json: ' + lineTotal + ' lines across ' + EVENT_KEYS.length + ' keys, ' + coreTotal + ' in the first 10');
}

/* ---- meal-cards.json ---------------------------------------------------- */

function lintMealCards(bank) {
  const file = bank.file;
  const data = bank.data;
  if (data === null) {
    return;
  }
  if (!isPlainObject(data) || !Array.isArray(data.dishes)) {
    fail(file, 'dishes', 'missing dishes array');
    return;
  }

  const dishes = data.dishes;
  if (dishes.length !== 6) {
    fail(file, 'dishes', 'expected exactly 6 dishes, found ' + dishes.length);
  }

  const seenIds = new Set();
  const seenCropSets = new Map();
  const covered = new Set();

  for (let i = 0; i < dishes.length; i += 1) {
    const dish = dishes[i];
    const at = 'dishes[' + i + ']';
    if (!isPlainObject(dish)) {
      fail(file, at, 'dish entry is not an object');
      continue;
    }

    if (typeof dish.id !== 'string' || !KEBAB.test(dish.id)) {
      fail(file, at + '.id', 'dish id must be kebab-case, found "' + dish.id + '"');
    } else if (seenIds.has(dish.id)) {
      fail(file, at + '.id', 'duplicate dish id "' + dish.id + '"');
    } else {
      seenIds.add(dish.id);
    }

    if (typeof dish.name !== 'string' || dish.name.trim() === '') {
      fail(file, at + '.name', 'name is required');
    }

    if (!Array.isArray(dish.crops)) {
      fail(file, at + '.crops', 'missing crops array');
    } else {
      if (dish.crops.length < 2 || dish.crops.length > 3) {
        fail(file, at + '.crops', 'expected 2 or 3 crops, found ' + dish.crops.length);
      }
      const inThisDish = new Set();
      for (let c = 0; c < dish.crops.length; c += 1) {
        const crop = dish.crops[c];
        if (CROPS.indexOf(crop) === -1) {
          fail(file, at + '.crops[' + c + ']', 'crop "' + crop + '" is outside the closed crop set');
          continue;
        }
        if (inThisDish.has(crop)) {
          fail(file, at + '.crops[' + c + ']', 'crop "' + crop + '" listed twice in one dish');
        }
        inThisDish.add(crop);
        covered.add(crop);
      }
      const setKey = dish.crops.slice().sort().join('+');
      if (seenCropSets.has(setKey)) {
        fail(file, at + '.crops', 'identical crop set to ' + seenCropSets.get(setKey));
      } else {
        seenCropSets.set(setKey, at);
      }
    }

    checkBanned(file, at + '.benefit', dish.benefit, true);
    checkBanned(file, at + '.line', dish.line, false);

    if (typeof dish.line === 'string' && dish.line.trim() !== '' && wordCount(dish.line) > 12) {
      fail(file, at + '.line', 'line has ' + wordCount(dish.line) + ' words, max 12');
    }
  }

  const missing = CROPS.filter(function (crop) { return !covered.has(crop); });
  if (missing.length > 0) {
    fail(file, 'dishes', 'crops never used in any dish, so growing them dead-ends: ' + missing.join(', '));
  }

  note('meal-cards.json: ' + dishes.length + ' dishes, ' + covered.size + ' of ' + CROPS.length + ' crops covered');
}

function checkBanned(file, at, value, required) {
  if (typeof value !== 'string' || value.trim() === '') {
    if (required) {
      fail(file, at, 'field is required');
    }
    return;
  }
  const lower = value.toLowerCase();
  for (let i = 0; i < BANNED_SUBSTRINGS.length; i += 1) {
    const banned = BANNED_SUBSTRINGS[i];
    if (lower.indexOf(banned) !== -1) {
      fail(file, at, 'banned medical wording "' + banned + '" in "' + value + '"');
    }
  }
}

/* ---- plant-traits.json, optional ---------------------------------------- */

function lintPlantTraits(bank) {
  const file = bank.file;
  const data = bank.data;
  if (data === null) {
    return;
  }
  if (!isPlainObject(data)) {
    fail(file, '(whole file)', 'root must be an object');
    return;
  }

  const speciesByObject = isPlainObject(data.species_by_object) ? data.species_by_object : null;
  const species = isPlainObject(data.species) ? data.species : null;

  if (speciesByObject === null) {
    fail(file, 'species_by_object', 'missing species_by_object map');
  } else {
    for (let i = 0; i < OBJECT_IDS.length; i += 1) {
      const objectId = OBJECT_IDS[i];
      const speciesId = speciesByObject[objectId];
      if (typeof speciesId !== 'string' || speciesId.trim() === '') {
        fail(file, 'species_by_object.' + objectId, 'object is not mapped to a species');
      } else if (species !== null && !Object.prototype.hasOwnProperty.call(species, speciesId)) {
        fail(file, 'species_by_object.' + objectId, 'maps to species "' + speciesId + '" which is not defined');
      }
    }
  }

  if (species === null) {
    fail(file, 'species', 'missing species map');
  } else {
    const ids = Object.keys(species);
    if (ids.length < 8) {
      fail(file, 'species', 'only ' + ids.length + ' species, minimum 8');
    }
    for (let i = 0; i < ids.length; i += 1) {
      const id = ids[i];
      const entry = species[id];
      if (!isPlainObject(entry)) {
        fail(file, 'species.' + id, 'species entry is not an object');
        continue;
      }
      if (!Array.isArray(entry.stages) || entry.stages.length !== 3) {
        const found = Array.isArray(entry.stages) ? entry.stages.length : 'none';
        fail(file, 'species.' + id + '.stages', 'expected exactly 3 stages, found ' + found);
      }
    }
  }

  checkClosedMap(file, 'palettes', data.palettes, PALETTES);
  checkClosedMap(file, 'blooms', data.blooms, BLOOMS);
  checkClosedMap(file, 'ornaments', data.ornaments, ORNAMENTS);

  if (!isPlainObject(data.crops)) {
    fail(file, 'crops', 'missing crops map');
  } else {
    for (let i = 0; i < CROPS.length; i += 1) {
      const cropId = CROPS[i];
      const crop = data.crops[cropId];
      if (!isPlainObject(crop)) {
        fail(file, 'crops.' + cropId, 'crop is missing from plant-traits');
        continue;
      }
      if (ARCHETYPES.indexOf(crop.archetype) === -1) {
        fail(file, 'crops.' + cropId + '.archetype', 'archetype must be one of ' + ARCHETYPES.join(', ') + ', found "' + crop.archetype + '"');
      }
      if (PRICE_TIERS.indexOf(crop.price_tier) === -1) {
        fail(file, 'crops.' + cropId + '.price_tier', 'price_tier must be one of ' + PRICE_TIERS.join(', ') + ', found "' + crop.price_tier + '"');
      }
    }
  }

  note('plant-traits.json: checked');
}

function checkClosedMap(file, field, value, required) {
  if (!isPlainObject(value)) {
    fail(file, field, 'missing ' + field + ' map');
    return;
  }
  for (let i = 0; i < required.length; i += 1) {
    if (!Object.prototype.hasOwnProperty.call(value, required[i])) {
      fail(file, field + '.' + required[i], 'required ' + field.replace(/s$/, '') + ' is missing');
    }
  }
}

/* ---- run ---------------------------------------------------------------- */

function out(text) {
  process.stdout.write(text + '\n');
}

function main() {
  const memoryPrompts = loadBank('memory-prompts.json');
  const gardenerLines = loadBank('gardener-lines.json');
  const mealCards = loadBank('meal-cards.json');
  const plantTraits = loadBank('plant-traits.json');

  if (!memoryPrompts.present) {
    fail(path.join(CONTENT_DIR, 'memory-prompts.json'), '(whole file)', 'bank file is missing');
  } else {
    lintMemoryPrompts(memoryPrompts);
  }

  if (!gardenerLines.present) {
    fail(path.join(CONTENT_DIR, 'gardener-lines.json'), '(whole file)', 'bank file is missing');
  } else {
    lintGardenerLines(gardenerLines);
  }

  if (!mealCards.present) {
    fail(path.join(CONTENT_DIR, 'meal-cards.json'), '(whole file)', 'bank file is missing');
  } else {
    lintMealCards(mealCards);
  }

  if (!plantTraits.present) {
    warn('plant-traits.json not written yet, skipping its checks. The U1 coder owns that file.');
  } else {
    lintPlantTraits(plantTraits);
  }

  out('');
  out('Garden of Life content lint');
  out('===========================');

  for (let i = 0; i < notes.length; i += 1) {
    out('  ok    ' + notes[i]);
  }
  for (let i = 0; i < warnings.length; i += 1) {
    out('  warn  ' + warnings[i]);
  }

  if (violations.length === 0) {
    out('');
    out('CLEAN. 0 violations, ' + warnings.length + ' warning' + (warnings.length === 1 ? '' : 's') + '.');
    process.exit(0);
  }

  const fileWidth = Math.max.apply(null, violations.map(function (v) { return v.file.length; }));
  const atWidth = Math.max.apply(null, violations.map(function (v) { return v.at.length; }));

  out('');
  out(violations.length + ' violation' + (violations.length === 1 ? '' : 's') + ':');
  out('');
  for (let i = 0; i < violations.length; i += 1) {
    const v = violations[i];
    out('  ' + v.file.padEnd(fileWidth) + '  ' + v.at.padEnd(atWidth) + '  ' + v.rule);
  }
  out('');
  process.exit(1);
}

main();
