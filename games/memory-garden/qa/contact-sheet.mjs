#!/usr/bin/env node
/*
  Composes a matrix of plants and writes one self contained HTML sheet so a human
  can judge at a glance whether the eight species read differently and whether the
  trait axes actually change the picture. Node only, no browser, no server.
*/

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { composePlant } from '../js/composer.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../..');
const outDir = path.join(repoRoot, 'tools', 'qa', 'output');
const outFile = path.join(outDir, 'mg-contact-sheet.html');

const OBJECT_IDS = ['kopitiam-cup', 'sewing-machine', 'rotary-phone', 'tingkat', 'cassette',
  'five-stones', 'setron-tv', 'rattan-chair'];
const FEELINGS = ['warm', 'happy', 'wistful', 'calm', 'proud'];
const WHOS = ['my-mother', 'my-father', 'my-grandmother', 'my-friends', 'my-siblings'];
const WHERES = ['kampung', 'first-flat', 'kopitiam', 'market', 'seaside'];

const BASE = { who: 'my-mother', where: 'kampung', feeling: 'warm' };

function cell(objectId, answers, label) {
  const built = composePlant({ objectId: objectId, answers: answers });
  return '<figure class="cell">' + built.svg +
    '<figcaption>' + label + '<br>' + built.traits.species + '</figcaption></figure>';
}

// The same plant at the size a garden plot actually gives it. Distinctness that
// only survives on the ceremony stage is not distinctness.
function plotCell(objectId, answers, label) {
  const built = composePlant({ objectId: objectId, answers: answers });
  return '<figure class="cell cell-plot">' + built.svg +
    '<figcaption>' + label + '</figcaption></figure>';
}

function row(title, note, cells, gridClass) {
  return '<section><h2>' + title + '</h2><p>' + note + '</p><div class="grid' +
    (gridClass ? ' ' + gridClass : '') + '">' + cells.join('') + '</div></section>';
}

function build() {
  const rows = [];

  rows.push(row(
    'Row 1: eight objects, same answers',
    'Same who, where and feeling every time. Only the object changes, so every silhouette here must be tellable apart from across the room.',
    OBJECT_IDS.map(function (id) { return cell(id, BASE, id); })
  ));

  rows.push(row(
    'Row 2: one object, five feelings',
    'Kopitiam cup throughout. Feeling drives the palette.',
    FEELINGS.map(function (feeling) {
      return cell('kopitiam-cup', { who: BASE.who, where: BASE.where, feeling: feeling }, feeling);
    })
  ));

  rows.push(row(
    'Row 3: one object, five people',
    'Kopitiam cup throughout. Who drives bloom count and arrangement.',
    WHOS.map(function (who) {
      return cell('kopitiam-cup', { who: who, where: BASE.where, feeling: BASE.feeling }, who);
    })
  ));

  rows.push(row(
    'Row 4: one object, five places',
    'Kopitiam cup throughout. Where drives the ornament tucked beside the pot.',
    WHERES.map(function (where) {
      return cell('kopitiam-cup', { who: BASE.who, where: where, feeling: BASE.feeling }, where);
    })
  ));

  rows.push(row(
    'Row 5: the same eight, at plot size',
    'Row 1 again at about 100px, the size a plot in the garden grid really gives a plant. This is the row that decides whether the silhouettes work.',
    OBJECT_IDS.map(function (id) { return plotCell(id, BASE, id); }),
    'grid-plot'
  ));

  rows.push(row(
    'Row 6: the pairs that have to separate, at plot size',
    'Happy against proud, then five blooms against seven, on the kopi vine and on the succulent rosette. Each pair has to be tellable apart at a glance.',
    [
      plotCell('kopitiam-cup', { who: BASE.who, where: BASE.where, feeling: 'happy' }, 'happy'),
      plotCell('kopitiam-cup', { who: BASE.who, where: BASE.where, feeling: 'proud' }, 'proud'),
      plotCell('kopitiam-cup', { who: 'my-grandmother', where: BASE.where, feeling: BASE.feeling }, 'vine, 5'),
      plotCell('kopitiam-cup', { who: 'my-friends', where: BASE.where, feeling: BASE.feeling }, 'vine, 7'),
      plotCell('five-stones', { who: 'my-grandmother', where: BASE.where, feeling: BASE.feeling }, 'rosette, 5'),
      plotCell('five-stones', { who: 'my-friends', where: BASE.where, feeling: BASE.feeling }, 'rosette, 7')
    ],
    'grid-plot'
  ));

  return '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
    '<title>Memory Garden contact sheet</title>\n<style>\n' +
    'body { margin: 0; padding: 24px; background: #ffffff; color: #1c1c1c;' +
    ' font-family: system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif; font-size: 28px; }\n' +
    'h1 { font-size: 40px; margin: 0 0 24px; }\n' +
    'h2 { font-size: 32px; margin: 32px 0 8px; }\n' +
    'p { margin: 0 0 16px; }\n' +
    '.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 16px; }\n' +
    /* The plant shrinks to plot size, the caption does not: 28px is the floor
       for anything a human reads, including a QA sheet. */
    '.grid-plot { grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); }\n' +
    '.cell { margin: 0; padding: 12px; border: 2px solid #c9c1b4; border-radius: 12px; background: #fffcf7; }\n' +
    '.cell svg { width: 140px; max-width: 100%; height: auto; display: block; margin: 0 auto; }\n' +
    '.cell-plot { padding: 8px; }\n' +
    '.cell-plot svg { width: 100px; }\n' +
    'figcaption { margin-top: 12px; text-align: center; font-size: 28px; overflow-wrap: break-word; }\n' +
    '</style>\n</head>\n<body>\n<h1>Memory Garden contact sheet</h1>\n' +
    rows.join('\n') + '\n</body>\n</html>\n';
}

async function main() {
  await mkdir(outDir, { recursive: true });
  await writeFile(outFile, build());
  process.stdout.write('contact sheet written to ' + outFile + '\n');
  process.stdout.write('cells: ' +
    (OBJECT_IDS.length * 2 + FEELINGS.length + WHOS.length + WHERES.length + 6) +
    ' (6 rows, the last two at plot size)\n');
}

main().catch(function (error) {
  process.stderr.write(String(error && error.stack ? error.stack : error) + '\n');
  process.exit(1);
});
