/*
  Memory Garden content data: the six heritage objects and the three prompts.
  Art is inline SVG so there is nothing to download and nothing to break offline.
  Four object colours only, all dark enough to read on --color-surface.
*/

const INK = '#2f2a24';
const CLAY = '#a3542b';
const CREAM = '#f0e4cf';
const JADE = '#1b5e38';

function art(body) {
  return '<svg class="object-art" viewBox="0 0 96 96" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg">' + body + '</svg>';
}

const KOPITIAM_CUP = art(
  '<ellipse cx="48" cy="78" rx="34" ry="7" fill="' + CLAY + '"/>' +
  '<path d="M24 42 H72 L65 71 Q48 77 31 71 Z" fill="' + CREAM + '" stroke="' + INK + '" stroke-width="4" stroke-linejoin="round"/>' +
  '<path d="M72 48 q13 3 9 14 q-3 7 -11 5" fill="none" stroke="' + INK + '" stroke-width="4" stroke-linecap="round"/>' +
  '<path d="M40 34 q7 -6 0 -12 q-7 -6 0 -12" fill="none" stroke="' + CLAY + '" stroke-width="4" stroke-linecap="round"/>' +
  '<path d="M56 32 q6 -5 0 -10" fill="none" stroke="' + CLAY + '" stroke-width="4" stroke-linecap="round"/>'
);

const SEWING_MACHINE = art(
  '<rect x="8" y="64" width="80" height="15" rx="4" fill="' + INK + '"/>' +
  '<rect x="57" y="17" width="23" height="48" rx="5" fill="' + INK + '"/>' +
  '<rect x="19" y="17" width="61" height="15" rx="5" fill="' + INK + '"/>' +
  '<rect x="24" y="32" width="6" height="26" rx="3" fill="' + CLAY + '"/>' +
  '<rect x="19" y="57" width="16" height="7" rx="3" fill="' + CLAY + '"/>' +
  '<circle cx="82" cy="45" r="11" fill="' + CREAM + '" stroke="' + INK + '" stroke-width="4"/>' +
  '<circle cx="82" cy="45" r="3" fill="' + INK + '"/>'
);

const ROTARY_PHONE = art(
  '<rect x="10" y="52" width="76" height="27" rx="7" fill="' + INK + '"/>' +
  '<circle cx="48" cy="64" r="15" fill="' + CREAM + '"/>' +
  '<circle cx="48" cy="64" r="5" fill="' + CLAY + '"/>' +
  '<circle cx="48" cy="55" r="2.6" fill="' + INK + '"/>' +
  '<circle cx="57" cy="59" r="2.6" fill="' + INK + '"/>' +
  '<circle cx="58" cy="69" r="2.6" fill="' + INK + '"/>' +
  '<circle cx="48" cy="73" r="2.6" fill="' + INK + '"/>' +
  '<circle cx="38" cy="69" r="2.6" fill="' + INK + '"/>' +
  '<circle cx="39" cy="59" r="2.6" fill="' + INK + '"/>' +
  '<rect x="16" y="26" width="64" height="14" rx="7" fill="' + INK + '"/>' +
  '<path d="M14 28 h12 l-3 13 h-12 z" fill="' + INK + '"/>' +
  '<path d="M82 28 h-12 l3 13 h12 z" fill="' + INK + '"/>' +
  '<rect x="8" y="38" width="18" height="9" rx="4" fill="' + INK + '"/>' +
  '<rect x="70" y="38" width="18" height="9" rx="4" fill="' + INK + '"/>'
);

const TINGKAT = art(
  '<path d="M30 36 V25 a18 18 0 0 1 36 0 V36" fill="none" stroke="' + INK + '" stroke-width="5" stroke-linecap="round"/>' +
  '<rect x="21" y="34" width="54" height="11" rx="3" fill="' + INK + '"/>' +
  '<rect x="24" y="45" width="48" height="15" rx="3" fill="' + CLAY + '" stroke="' + INK + '" stroke-width="3"/>' +
  '<rect x="24" y="60" width="48" height="15" rx="3" fill="' + CREAM + '" stroke="' + INK + '" stroke-width="3"/>' +
  '<rect x="24" y="75" width="48" height="15" rx="3" fill="' + CLAY + '" stroke="' + INK + '" stroke-width="3"/>'
);

const CASSETTE = art(
  '<rect x="7" y="23" width="82" height="51" rx="7" fill="' + INK + '"/>' +
  '<rect x="14" y="29" width="68" height="17" rx="3" fill="' + CREAM + '"/>' +
  '<rect x="20" y="50" width="56" height="19" rx="4" fill="' + CREAM + '"/>' +
  '<circle cx="35" cy="59" r="7.5" fill="' + CLAY + '" stroke="' + INK + '" stroke-width="3"/>' +
  '<circle cx="61" cy="59" r="7.5" fill="' + CLAY + '" stroke="' + INK + '" stroke-width="3"/>' +
  '<circle cx="35" cy="59" r="2.4" fill="' + INK + '"/>' +
  '<circle cx="61" cy="59" r="2.4" fill="' + INK + '"/>'
);

const FIVE_STONES = art(
  '<ellipse cx="33" cy="30" rx="8" ry="6" fill="' + CREAM + '" stroke="' + INK + '" stroke-width="2.6"/>' +
  '<ellipse cx="48" cy="22" rx="8" ry="6" fill="' + JADE + '"/>' +
  '<ellipse cx="63" cy="30" rx="8" ry="6" fill="' + CREAM + '" stroke="' + INK + '" stroke-width="2.6"/>' +
  '<ellipse cx="40" cy="39" rx="8" ry="6" fill="' + JADE + '"/>' +
  '<ellipse cx="56" cy="39" rx="8" ry="6" fill="' + CREAM + '" stroke="' + INK + '" stroke-width="2.6"/>' +
  '<path d="M25 54 C25 44 71 44 71 54 L75 74 A9 9 0 0 1 66 84 H30 A9 9 0 0 1 21 74 Z" fill="' + CLAY + '" stroke="' + INK + '" stroke-width="3"/>' +
  '<rect x="29" y="49" width="38" height="9" rx="4.5" fill="' + INK + '"/>' +
  '<path d="M62 53 q9 -4 13 2" fill="none" stroke="' + INK + '" stroke-width="3" stroke-linecap="round"/>'
);

export const OBJECTS = [
  {
    id: 'kopitiam-cup',
    name: 'Kopitiam cup',
    blurb: 'Thick white cup, kopi o kosong, morning talk.',
    art: KOPITIAM_CUP
  },
  {
    id: 'sewing-machine',
    name: 'Sewing machine',
    blurb: 'That foot pedal humming late into the night.',
    art: SEWING_MACHINE
  },
  {
    id: 'rotary-phone',
    name: 'Rotary dial phone',
    blurb: 'One number, dialled slow, remembered for life.',
    art: ROTARY_PHONE
  },
  {
    id: 'tingkat',
    name: 'Tingkat carrier',
    blurb: 'Lunch carried home, four tiers, still warm.',
    art: TINGKAT
  },
  {
    id: 'cassette',
    name: 'Cassette player',
    blurb: 'One tape, played until the ribbon went soft.',
    art: CASSETTE
  },
  {
    id: 'five-stones',
    name: 'Five stones bag',
    blurb: 'Small cloth bags, quick hands, void deck afternoons.',
    art: FIVE_STONES
  }
];

export const PROMPTS = [
  {
    id: 'who',
    question: 'Who is in this memory with you?',
    options: [
      { id: 'my-mother', label: 'My mother' },
      { id: 'my-father', label: 'My father' },
      { id: 'my-grandmother', label: 'My grandmother' },
      { id: 'my-friends', label: 'My good friends' },
      { id: 'my-siblings', label: 'My brothers and sisters' }
    ]
  },
  {
    id: 'where',
    question: 'Where does this memory live?',
    options: [
      { id: 'kampung', label: 'The old kampung' },
      { id: 'first-flat', label: 'Our first flat' },
      { id: 'kopitiam', label: 'The kopitiam downstairs' },
      { id: 'market', label: 'The wet market' },
      { id: 'seaside', label: 'By the seaside' }
    ]
  },
  {
    id: 'feeling',
    question: 'How does it feel to remember this?',
    options: [
      { id: 'warm', label: 'Warm and cosy' },
      { id: 'happy', label: 'Happy and light' },
      { id: 'wistful', label: 'A little wistful' },
      { id: 'calm', label: 'Calm and peaceful' },
      { id: 'proud', label: 'Proud' }
    ]
  }
];
