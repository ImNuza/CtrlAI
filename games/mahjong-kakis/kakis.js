/*
  The three kakis: portraits, voices, and the one bubble they share.

  Only one of them talks at a time. Affinity decides who owns a moment (Lily
  softens a near miss, Beng crows over a win, Rose nudges), everything else
  rotates, and nobody speaks twice in a row. The bubble is a button so a tap
  puts it away; it also fades itself after four seconds. Nothing in the game
  waits on that timeout, it is only a convenience.

  The rotation starts wherever seat() puts it. game.js seats it from the number
  of visits, so the kaki who says hello changes from one visit to the next
  instead of Lily opening the door every single time.
*/

import { aiGenerate } from '/shared/ai.js';

const GAME = 'mahjong-kakis';
const DISMISS_MS = 4000;

const ARROW_X = ['16.6%', '50%', '83.4%'];

// A moment inside a round belongs to whoever suits it. The hello at the door is
// deliberately not on this list: it belongs to the seated rotation, so a
// returning player is met by a different face each time they come back.
const AFFINITY = {
  near_miss: 'lily',
  round_win: 'beng',
  idle_nudge: 'rose'
};

export const KAKIS = [
  { id: 'lily', name: 'Auntie Lily', portrait: lilyPortrait },
  { id: 'beng', name: 'Uncle Beng', portrait: bengPortrait },
  { id: 'rose', name: 'Auntie Rose', portrait: rosePortrait }
];

/**
 * Paint the three portraits into their slots. Decorative, aria hidden.
 * @param {ParentNode} root
 */
export function renderPortraits(root) {
  const scope = root || document;
  for (let i = 0; i < KAKIS.length; i += 1) {
    const slot = scope.querySelector('[data-portrait="' + KAKIS[i].id + '"]');
    if (slot) {
      slot.innerHTML = KAKIS[i].portrait();
    }
  }
}

/**
 * Wire the shared bubble.
 * @param {ParentNode} root
 * @param {{onChange?: Function}} [options]  onChange runs after the bubble is
 *   painted and after it is put away, for anything measuring the slot.
 * @returns {{speak: Function, dismiss: Function, seat: Function}}
 */
export function createBanter(root, options) {
  const scope = root || document;
  const settings = options === null || typeof options !== 'object' ? {} : options;
  const onChange = typeof settings.onChange === 'function' ? settings.onChange : null;
  const bubble = scope.querySelector('[data-bubble]');
  const nameEl = scope.querySelector('[data-bubble-name]');
  const textEl = scope.querySelector('[data-bubble-text]');

  let lastId = null;
  let rotation = -1;
  let turn = 0;
  let timer = 0;

  if (bubble) {
    bubble.addEventListener('click', function () {
      dismiss();
    });
  }

  /**
   * Choose which chair the rotation starts from.
   * @param {number} visits  How many times this player has opened the game.
   */
  function seat(visits) {
    const whole = Number.isFinite(visits) ? Math.floor(visits) : 0;
    rotation = ((whole % KAKIS.length) + KAKIS.length) % KAKIS.length;
    lastId = null;
  }

  function pick(event) {
    const preferred = AFFINITY[event];
    if (preferred && preferred !== lastId) {
      return KAKIS[indexOfKaki(preferred)];
    }
    for (let i = 0; i < KAKIS.length; i += 1) {
      rotation = (rotation + 1) % KAKIS.length;
      if (KAKIS[rotation].id !== lastId) {
        return KAKIS[rotation];
      }
    }
    return KAKIS[Math.max(0, rotation)];
  }

  function show(kaki, event, text) {
    const index = indexOfKaki(kaki.id);
    lastId = kaki.id;

    for (let i = 0; i < KAKIS.length; i += 1) {
      const slot = scope.querySelector('[data-kaki-slot="' + KAKIS[i].id + '"]');
      if (slot) {
        slot.classList.toggle('is-speaking', KAKIS[i].id === kaki.id);
      }
    }

    if (!bubble || !nameEl || !textEl) {
      return;
    }
    nameEl.textContent = kaki.name;
    textEl.textContent = text;
    bubble.style.setProperty('--mk-arrow-x', ARROW_X[index] || '50%');
    bubble.dataset.event = event;
    bubble.dataset.kaki = kaki.id;
    bubble.disabled = false;

    window.clearTimeout(timer);
    timer = window.setTimeout(dismiss, DISMISS_MS);

    if (onChange) {
      onChange();
    }
  }

  function dismiss() {
    window.clearTimeout(timer);
    if (bubble) {
      delete bubble.dataset.event;
      delete bubble.dataset.kaki;
      bubble.disabled = true;
    }
    if (nameEl) {
      nameEl.textContent = '';
    }
    if (textEl) {
      textEl.textContent = '';
    }
    for (let i = 0; i < KAKIS.length; i += 1) {
      const slot = scope.querySelector('[data-kaki-slot="' + KAKIS[i].id + '"]');
      if (slot) {
        slot.classList.remove('is-speaking');
      }
    }

    if (onChange) {
      onChange();
    }
  }

  /**
   * Say one line for a moment in the round.
   * @param {string} event  Base event name, for example "near_miss".
   * @param {Object} context  Slot values, {name} in this milestone.
   */
  async function speak(event, context) {
    const kaki = pick(event);
    const mine = turn + 1;
    turn = mine;
    const line = await aiGenerate({
      game: GAME,
      event: event + '__' + kaki.id,
      context: context || {}
    });
    if (mine !== turn) {
      return null;
    }
    show(kaki, event, line.text);
    return { kaki: kaki.id, text: line.text };
  }

  return { speak: speak, dismiss: dismiss, seat: seat };
}

/* ---- internals ---------------------------------------------------------- */

function indexOfKaki(id) {
  for (let i = 0; i < KAKIS.length; i += 1) {
    if (KAKIS[i].id === id) {
      return i;
    }
  }
  return 0;
}

function portrait(inner) {
  return '<svg viewBox="0 0 100 100" aria-hidden="true" focusable="false">' +
    '<circle cx="50" cy="50" r="50" fill="var(--accent-tint)"></circle>' +
    inner +
    '</svg>';
}

// Auntie Lily: flower tucked in her hair, floral collar, big warm smile.
function lilyPortrait() {
  const petals = [[0, -9], [8.6, -2.8], [5.3, 7.3], [-5.3, 7.3], [-8.6, -2.8]]
    .map(function (offset) {
      return '<circle cx="' + (75 + offset[0]) + '" cy="' + (30 + offset[1]) +
        '" r="5.6" fill="var(--mk-lily-flower)"></circle>';
    }).join('');
  return portrait(
    '<path d="M12 100 C12 79 29 69 50 69 C71 69 88 79 88 100 Z" fill="var(--mk-lily-shirt)" stroke="var(--color-border)" stroke-width="2"></path>' +
    '<circle cx="38" cy="80" r="4" fill="var(--mk-lily-flower)"></circle>' +
    '<circle cx="50" cy="84" r="4" fill="var(--mk-lily-flower)"></circle>' +
    '<circle cx="62" cy="80" r="4" fill="var(--mk-lily-flower)"></circle>' +
    '<circle cx="50" cy="46" r="24" fill="var(--mk-skin)" stroke="var(--color-border)" stroke-width="2"></circle>' +
    '<path d="M25 46 C25 26 37 17 50 17 C63 17 75 26 75 46 C70 36 62 31 50 31 C38 31 30 36 25 46 Z" fill="var(--mk-hair-dark)"></path>' +
    petals +
    '<circle cx="75" cy="30" r="4.4" fill="var(--mk-flower-heart)"></circle>' +
    '<circle cx="41" cy="46" r="3" fill="var(--mk-hair-dark)"></circle>' +
    '<circle cx="59" cy="46" r="3" fill="var(--mk-hair-dark)"></circle>' +
    '<path d="M39 55 Q50 65 61 55" fill="none" stroke="var(--mk-hair-dark)" stroke-width="3" stroke-linecap="round"></path>'
  );
}

// Uncle Beng: cap with a brim, singlet, kopi in hand.
function bengPortrait() {
  return portrait(
    '<path d="M14 100 C14 80 31 70 50 70 C69 70 86 80 86 100 Z" fill="var(--mk-skin)" stroke="var(--color-border)" stroke-width="2"></path>' +
    '<path d="M39 70 L45 70 L45 84 L39 84 Z" fill="var(--color-surface)" stroke="var(--color-border)" stroke-width="2"></path>' +
    '<path d="M55 70 L61 70 L61 84 L55 84 Z" fill="var(--color-surface)" stroke="var(--color-border)" stroke-width="2"></path>' +
    '<path d="M36 100 L36 82 Q50 78 64 82 L64 100 Z" fill="var(--color-surface)" stroke="var(--color-border)" stroke-width="2"></path>' +
    '<circle cx="50" cy="48" r="24" fill="var(--mk-skin)" stroke="var(--color-border)" stroke-width="2"></circle>' +
    '<path d="M27 42 C27 26 38 18 50 18 C62 18 73 26 73 42 Z" fill="var(--mk-beng-cap)"></path>' +
    '<rect x="21" y="39" width="58" height="7" rx="3.5" fill="var(--mk-beng-cap)"></rect>' +
    '<circle cx="42" cy="54" r="3" fill="var(--mk-hair-dark)"></circle>' +
    '<circle cx="60" cy="54" r="3" fill="var(--mk-hair-dark)"></circle>' +
    '<path d="M40 62 Q51 71 62 60" fill="none" stroke="var(--mk-hair-dark)" stroke-width="3" stroke-linecap="round"></path>' +
    '<path d="M66 76 L82 76 L79 89 L69 89 Z" fill="var(--mk-beng-cup)" stroke="var(--color-border)" stroke-width="2"></path>' +
    '<ellipse cx="74" cy="76" rx="8" ry="3" fill="var(--accent-kopitiam)"></ellipse>'
  );
}

// Auntie Rose: grey bun, round glasses, yarn and needles resting on her lap.
function rosePortrait() {
  return portrait(
    '<path d="M13 100 C13 80 30 70 50 70 C70 70 87 80 87 100 Z" fill="var(--mk-rose-shirt)" stroke="var(--color-border)" stroke-width="2"></path>' +
    '<circle cx="50" cy="16" r="11" fill="var(--mk-hair-grey)" stroke="var(--color-border)" stroke-width="2"></circle>' +
    '<circle cx="50" cy="48" r="24" fill="var(--mk-skin)" stroke="var(--color-border)" stroke-width="2"></circle>' +
    '<path d="M26 48 C26 30 37 22 50 22 C63 22 74 30 74 48 C69 40 61 36 50 36 C39 36 31 40 26 48 Z" fill="var(--mk-hair-grey)"></path>' +
    '<circle cx="39" cy="50" r="9.5" fill="none" stroke="var(--mk-hair-dark)" stroke-width="2.6"></circle>' +
    '<circle cx="61" cy="50" r="9.5" fill="none" stroke="var(--mk-hair-dark)" stroke-width="2.6"></circle>' +
    '<path d="M48.5 50 L51.5 50" stroke="var(--mk-hair-dark)" stroke-width="2.6" stroke-linecap="round"></path>' +
    '<circle cx="39" cy="50" r="2.6" fill="var(--mk-hair-dark)"></circle>' +
    '<circle cx="61" cy="50" r="2.6" fill="var(--mk-hair-dark)"></circle>' +
    '<path d="M42 62 Q50 68 58 62" fill="none" stroke="var(--mk-hair-dark)" stroke-width="3" stroke-linecap="round"></path>' +
    '<path d="M17 87 L36 71" stroke="var(--color-text-muted)" stroke-width="3" stroke-linecap="round"></path>' +
    '<path d="M19 71 L36 87" stroke="var(--color-text-muted)" stroke-width="3" stroke-linecap="round"></path>' +
    '<circle cx="25" cy="84" r="8" fill="var(--mk-lily-shirt)" stroke="var(--color-border)" stroke-width="2"></circle>'
  );
}
