/*
  Mahjong Kakis tile catalog and wall builder.

  Twelve identities: dots 1 to 4, bamboo 1 to 4, and the four winds. Faces are
  plain SVG shapes sized for a 64px tile, drawn in a near square 60 by 66 box so
  they scale with the tile. Colours come from existing tokens only.
*/

import { makeRng } from '/shared/ai.js';

const FACE_BOX = '0 0 60 66';

const DOT_LAYOUT = {
  1: [[30, 33, 17]],
  2: [[30, 18, 12], [30, 48, 12]],
  3: [[16, 17, 10], [30, 33, 10], [44, 49, 10]],
  4: [[18, 19, 11], [42, 19, 11], [18, 47, 11], [42, 47, 11]]
};

const BAMBOO_LAYOUT = {
  1: [[22, 16]],
  2: [[13, 13], [34, 13]],
  3: [[6, 11], [24.5, 11], [43, 11]],
  4: [[6, 9], [19, 9], [32, 9], [45, 9]]
};

const WINDS = [
  { key: 'east', glyph: '東', label: 'East wind' },
  { key: 'south', glyph: '南', label: 'South wind' },
  { key: 'west', glyph: '西', label: 'West wind' },
  { key: 'north', glyph: '北', label: 'North wind' }
];

const COUNT_WORD = ['Zero', 'One', 'Two', 'Three', 'Four'];

function face(inner) {
  return '<svg viewBox="' + FACE_BOX + '" aria-hidden="true" focusable="false">' + inner + '</svg>';
}

function dotsFace(rank) {
  const marks = DOT_LAYOUT[rank].map(function (spot) {
    const cx = spot[0];
    const cy = spot[1];
    const r = spot[2];
    return '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="var(--accent-dojo)"></circle>' +
      '<circle cx="' + cx + '" cy="' + cy + '" r="' + (r * 0.4).toFixed(1) + '" fill="var(--color-surface)"></circle>';
  }).join('');
  return face(marks);
}

function bambooFace(rank) {
  const sticks = BAMBOO_LAYOUT[rank].map(function (stick) {
    const x = stick[0];
    const w = stick[1];
    return '<rect x="' + x + '" y="10" width="' + w + '" height="46" rx="' + (w / 2) + '" fill="var(--accent-garden)"></rect>';
  }).join('');
  return face(sticks);
}

function windFace(glyph) {
  return face(
    '<text x="30" y="34" text-anchor="middle" dominant-baseline="central" ' +
    'font-size="42" font-weight="700" fill="var(--color-danger)">' + glyph + '</text>'
  );
}

function makeIdentity(id, label, suit, rank, draw) {
  return {
    id: id,
    label: label,
    suit: suit,
    rank: rank,
    svg: function () {
      return draw;
    }
  };
}

function buildSet() {
  const set = [];
  for (let rank = 1; rank <= 4; rank += 1) {
    set.push(makeIdentity(
      'dots-' + rank,
      COUNT_WORD[rank] + (rank === 1 ? ' dot' : ' dots'),
      'dots',
      rank,
      dotsFace(rank)
    ));
  }
  for (let rank = 1; rank <= 4; rank += 1) {
    set.push(makeIdentity(
      'bamboo-' + rank,
      COUNT_WORD[rank] + ' bamboo',
      'bamboo',
      rank,
      bambooFace(rank)
    ));
  }
  for (let i = 0; i < WINDS.length; i += 1) {
    set.push(makeIdentity(
      'wind-' + WINDS[i].key,
      WINDS[i].label,
      'winds',
      null,
      windFace(WINDS[i].glyph)
    ));
  }
  return set;
}

export const TILE_SET = buildSet();

const BY_ID = new Map(TILE_SET.map(function (tile) {
  return [tile.id, tile];
}));

/**
 * Build a shuffled wall of face up tiles.
 * @param {{tileCount: number, lookalike: number, seed: (number|string)}} options
 *   lookalike 0 to 1 is the share of chosen identities that should sit next to a
 *   same suit neighbour rank, which is what makes two tiles easy to mix up.
 *   Neighbours arrive in couples, so the count is floored: 0.75 of eight
 *   identities is three couples, six of the eight.
 * @returns {Array<Object>} tileCount entries, every identity appearing twice.
 */
export function buildWall(options) {
  const opts = options === null || typeof options !== 'object' ? {} : options;
  const maxTiles = TILE_SET.length * 2;
  const asked = Number.isFinite(opts.tileCount) ? Math.floor(opts.tileCount) : 8;
  const tileCount = Math.max(2, Math.min(maxTiles, asked - (asked % 2)));
  const pairCount = tileCount / 2;

  const asksLookalike = Number.isFinite(opts.lookalike) ? opts.lookalike : 0;
  const lookalike = Math.max(0, Math.min(1, asksLookalike));
  const couplesWanted = Math.floor((pairCount * lookalike) / 2);

  const rng = makeRng(opts.seed);

  const couples = [];
  ['dots', 'bamboo'].forEach(function (suit) {
    for (let rank = 1; rank <= 3; rank += 1) {
      couples.push([suit + '-' + rank, suit + '-' + (rank + 1)]);
    }
  });
  shuffle(couples, rng);

  const chosen = [];
  const used = new Set();

  for (let i = 0; i < couples.length; i += 1) {
    if (chosen.length / 2 >= couplesWanted || chosen.length + 2 > pairCount) {
      break;
    }
    const pair = couples[i];
    if (used.has(pair[0]) || used.has(pair[1])) {
      continue;
    }
    chosen.push(pair[0], pair[1]);
    used.add(pair[0]);
    used.add(pair[1]);
  }

  const rest = TILE_SET
    .map(function (tile) {
      return tile.id;
    })
    .filter(function (id) {
      return !used.has(id);
    });
  shuffle(rest, rng);

  while (chosen.length < pairCount && rest.length > 0) {
    let pick = rest.findIndex(function (id) {
      return !touchesUsed(id, used);
    });
    if (pick === -1) {
      pick = 0;
    }
    const id = rest.splice(pick, 1)[0];
    chosen.push(id);
    used.add(id);
  }

  const wall = [];
  for (let i = 0; i < chosen.length; i += 1) {
    const tile = BY_ID.get(chosen[i]);
    wall.push(tile, tile);
  }
  return shuffle(wall, rng);
}

/* ---- internals ---------------------------------------------------------- */

function touchesUsed(id, used) {
  const tile = BY_ID.get(id);
  if (!tile || tile.rank === null) {
    return false;
  }
  return used.has(tile.suit + '-' + (tile.rank - 1)) || used.has(tile.suit + '-' + (tile.rank + 1));
}

function shuffle(list, rng) {
  for (let i = list.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const swap = list[i];
    list[i] = list[j];
    list[j] = swap;
  }
  return list;
}
