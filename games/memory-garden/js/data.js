/*
  Memory Garden content data: the eight heritage objects and the three prompts.
  Art is inline SVG so there is nothing to download and nothing to break offline.
  Four object colours only, all dark enough to read on --color-surface.

  Every object and every option carries a phrase, the form that reads well inside
  a sentence. One source, so no caller has to invent articles of its own.
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

// Boxy set, bulged screen, two dials on the side panel, stubby legs and rabbit
// ears. Read at a glance as the television that sat in every hall.
const SETRON_TV = art(
  '<path d="M40 28 L27 8 M56 28 L71 6" fill="none" stroke="' + INK + '" stroke-width="4" stroke-linecap="round"/>' +
  '<circle cx="27" cy="8" r="3.4" fill="' + CLAY + '"/>' +
  '<circle cx="71" cy="6" r="3.4" fill="' + CLAY + '"/>' +
  '<path d="M22 78 L15 91 M74 78 L81 91" fill="none" stroke="' + INK + '" stroke-width="5" stroke-linecap="round"/>' +
  '<rect x="7" y="26" width="82" height="54" rx="9" fill="' + INK + '"/>' +
  '<path d="M19 35 Q40 31 61 35 Q65 53 61 71 Q40 75 19 71 Q15 53 19 35 Z" fill="' + CREAM + '" stroke="' + CLAY + '" stroke-width="3"/>' +
  '<circle cx="75" cy="43" r="6" fill="' + CREAM + '"/>' +
  '<circle cx="75" cy="43" r="2" fill="' + INK + '"/>' +
  '<circle cx="75" cy="62" r="6" fill="' + CREAM + '"/>' +
  '<circle cx="75" cy="62" r="2" fill="' + INK + '"/>'
);

// High rounded back with the weave showing through, one solid seat, splayed legs.
const RATTAN_CHAIR = art(
  '<path d="M27 71 L21 90 M69 71 L75 90" fill="none" stroke="' + INK + '" stroke-width="5" stroke-linecap="round"/>' +
  '<path d="M24 64 V38 a24 26 0 0 1 48 0 V64 Z" fill="' + CLAY + '" stroke="' + INK + '" stroke-width="4" stroke-linejoin="round"/>' +
  '<path d="M32 30 V60 M40 25 V60 M48 23 V60 M56 25 V60 M64 30 V60" stroke="' + CREAM + '" stroke-width="2.6"/>' +
  '<path d="M28 34 H68 M26 44 H70 M26 54 H70" stroke="' + CREAM + '" stroke-width="2.6"/>' +
  '<rect x="17" y="60" width="62" height="12" rx="6" fill="' + INK + '"/>'
);

export const OBJECTS = [
  {
    id: 'kopitiam-cup',
    name: 'Kopitiam cup',
    phrase: 'the kopitiam cup',
    blurb: 'Thick white cup, kopi o kosong, morning talk.',
    art: KOPITIAM_CUP
  },
  {
    id: 'sewing-machine',
    name: 'Sewing machine',
    phrase: 'the sewing machine',
    blurb: 'That foot pedal humming late into the night.',
    art: SEWING_MACHINE
  },
  {
    id: 'rotary-phone',
    name: 'Rotary dial phone',
    phrase: 'the rotary dial phone',
    blurb: 'One number, dialled slow, remembered for life.',
    art: ROTARY_PHONE
  },
  {
    id: 'tingkat',
    name: 'Tingkat carrier',
    phrase: 'the tingkat carrier',
    blurb: 'Lunch carried home, four tiers, still warm.',
    art: TINGKAT
  },
  {
    id: 'cassette',
    name: 'Cassette player',
    phrase: 'the cassette player',
    blurb: 'One tape, played until the ribbon went soft.',
    art: CASSETTE
  },
  {
    id: 'five-stones',
    name: 'Five stones bag',
    phrase: 'the bag of five stones',
    blurb: 'Small cloth bags, quick hands, void deck afternoons.',
    art: FIVE_STONES
  },
  {
    id: 'setron-tv',
    name: 'Setron TV',
    phrase: 'the old Setron TV',
    blurb: 'Rabbit ears, one channel worth watching, whole family in front.',
    art: SETRON_TV
  },
  {
    id: 'rattan-chair',
    name: 'Rattan chair',
    phrase: 'the rattan chair',
    blurb: 'Woven back, cool on a hot day, always somebody in it.',
    art: RATTAN_CHAIR
  }
];

export const PROMPTS = [
  {
    id: 'who',
    question: 'Who is in this memory with you?',
    options: [
      { id: 'my-mother', label: 'My mother', phrase: 'my mother' },
      { id: 'my-father', label: 'My father', phrase: 'my father' },
      { id: 'my-grandmother', label: 'My grandmother', phrase: 'my grandmother' },
      { id: 'my-friends', label: 'My good friends', phrase: 'my good friends' },
      { id: 'my-siblings', label: 'My brothers and sisters', phrase: 'my brothers and sisters' }
    ]
  },
  {
    id: 'where',
    question: 'Where does this memory live?',
    options: [
      { id: 'kampung', label: 'The old kampung', phrase: 'in the old kampung' },
      { id: 'first-flat', label: 'Our first flat', phrase: 'in our first flat' },
      { id: 'kopitiam', label: 'The kopitiam downstairs', phrase: 'at the kopitiam downstairs' },
      { id: 'market', label: 'The wet market', phrase: 'at the wet market' },
      { id: 'seaside', label: 'By the seaside', phrase: 'by the seaside' }
    ]
  },
  {
    id: 'feeling',
    question: 'How does it feel to remember this?',
    options: [
      { id: 'warm', label: 'Warm and cosy', phrase: 'warm and cosy' },
      { id: 'happy', label: 'Happy and light', phrase: 'happy and light' },
      { id: 'wistful', label: 'A little wistful', phrase: 'a little wistful' },
      { id: 'calm', label: 'Calm and peaceful', phrase: 'calm and peaceful' },
      { id: 'proud', label: 'Proud', phrase: 'proud' }
    ]
  }
];
