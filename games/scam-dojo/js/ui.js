/*
  DOM builders for the four screens. Every string that comes out of content or
  the AI seam is written with textContent, so nothing from a bank can ever be
  parsed as markup.
*/

function el(tag, className) {
  const node = document.createElement(tag);
  if (className) {
    node.className = className;
  }
  return node;
}

function para(className, text) {
  const node = el('p', className);
  node.textContent = text;
  return node;
}

function button(id, className, text) {
  const node = el('button', className);
  node.type = 'button';
  node.id = id;
  node.textContent = text;
  return node;
}

/* ---- Home ---------------------------------------------------------------- */

/**
 * @param {HTMLElement} target Streak figure element.
 * @param {number} streak
 */
export function renderStreak(target, streak) {
  target.textContent = String(streak);
}

/* ---- Ring ---------------------------------------------------------------- */

/**
 * @param {{name: HTMLElement, number: HTMLElement}} refs
 * @param {{callerName: string, callerNumber: string}} round
 */
export function renderRing(refs, round) {
  refs.name.textContent = round.callerName;
  refs.number.textContent = round.callerNumber;
}

/* ---- Call ---------------------------------------------------------------- */

/**
 * A scammer line as a real button, so it is tappable, focusable and announced.
 * @param {{index: number, text: string, tell: (string|null)}} line
 * @returns {HTMLButtonElement}
 */
export function buildBubble(line) {
  const node = el('button', 'bubble');
  node.type = 'button';
  node.dataset.lineIndex = String(line.index);
  node.dataset.tell = line.tell === null ? '' : line.tell;
  node.setAttribute('aria-pressed', 'false');

  const body = el('span', 'bubble-text');
  body.textContent = line.text;
  node.appendChild(body);
  return node;
}

/**
 * The static "Caught: ..." stamp appended inside a caught bubble.
 * @param {string} label
 * @returns {HTMLSpanElement}
 */
export function buildCaughtLabel(label) {
  const node = el('span', 'bubble-caught');
  node.textContent = 'Caught: ' + label;
  return node;
}

/**
 * @param {string} kind "catch" or "benign".
 * @param {string} text
 * @returns {HTMLParagraphElement}
 */
export function buildTapNote(kind, text) {
  const node = para('tap-note', text);
  node.dataset.kind = kind;
  return node;
}

/**
 * @returns {HTMLButtonElement}
 */
export function buildListenControl() {
  return button('listen-btn', 'btn', 'Listen');
}

/**
 * Hang up is the filled primary and comply is the plain secondary. The safe
 * action carries the visual weight without the other one being hidden.
 *
 * Hang up goes last in the fragment on purpose: the dock is fixed to the bottom,
 * so the last button lands on the pixels the Listen button just left. A stray
 * second tap therefore hits the safe action rather than the one with no way back.
 * @returns {DocumentFragment}
 */
export function buildChoiceControl() {
  const frag = document.createDocumentFragment();
  frag.appendChild(button('comply-btn', 'btn btn-plain', 'Do what they say'));
  frag.appendChild(button('hangup-btn', 'btn', 'Hang up'));
  return frag;
}

export const WALKTHROUGH_NEXT = 'Show me what happens next';
export const WALKTHROUGH_END = 'See the recap';

/**
 * The comply path shell. Steps land inside it one tap at a time and the single
 * continue control stays put underneath them, so focus is never thrown away.
 * @returns {HTMLElement}
 */
export function buildWalkthrough() {
  const wrap = el('section', 'walkthrough');
  wrap.id = 'walkthrough';
  wrap.setAttribute('aria-label', 'What would have happened');

  const steps = el('div', 'walkthrough-steps');
  steps.id = 'walkthrough-steps';
  steps.setAttribute('aria-live', 'polite');
  wrap.appendChild(steps);

  wrap.appendChild(button('walkthrough-continue', 'btn', WALKTHROUGH_NEXT));
  return wrap;
}

/**
 * Step 0. Sets the framing before a single consequence is named: this is a
 * look at what the caller was steering towards, not a verdict on the player.
 * @param {string} text
 * @returns {HTMLElement}
 */
export function buildWalkthroughIntro(text) {
  const card = el('article', 'walkthrough-step walkthrough-step-intro');
  card.appendChild(para('walkthrough-title', 'Let us see what would have happened'));
  card.appendChild(para('walkthrough-lead', text));
  return card;
}

/**
 * One step per pressure the caller used, in the order they used it.
 * @param {{position: number, total: number, tell: string, quote: string, label: string, consequence: string}} step
 * @returns {HTMLElement}
 */
export function buildWalkthroughStep(step) {
  const card = el('article', 'walkthrough-step');
  card.dataset.tell = step.tell;
  card.appendChild(para('walkthrough-count', 'Step ' + step.position + ' of ' + step.total));
  card.appendChild(para('walkthrough-quote', '"' + step.quote + '"'));
  card.appendChild(para('walkthrough-tell', 'What they were doing: ' + step.label));
  card.appendChild(para('walkthrough-line', step.consequence));
  return card;
}

/* ---- Recap --------------------------------------------------------------- */

/**
 * @param {{text: string, label: string, caught: boolean, why: string}} item
 * @returns {HTMLElement}
 */
export function buildRecapItem(item) {
  const card = el('article', 'recap-item');
  card.dataset.caught = item.caught ? 'true' : 'false';
  card.appendChild(para('recap-line', '"' + item.text + '"'));
  card.appendChild(para('recap-tell', item.label));
  card.appendChild(para('recap-status', item.caught ? 'You caught this' : 'This one slipped past'));
  card.appendChild(para('recap-why', item.why));
  return card;
}

let ceremonyWatcher = null;

/**
 * Restart the shield entrance so the ceremony plays on every round, not only
 * the first time the element is created. It sits under the tell cards, so on a
 * long recap it would otherwise play to an empty screen while the player is
 * still reading. Hold it until it is actually in front of them.
 *
 * Without IntersectionObserver the class goes on straight away: the ceremony
 * loses its timing, never its content.
 * @param {HTMLElement} ceremony
 */
export function replayCeremony(ceremony) {
  ceremony.classList.remove('is-in');
  void ceremony.offsetWidth;

  if (ceremonyWatcher !== null) {
    ceremonyWatcher.disconnect();
    ceremonyWatcher = null;
  }
  if (typeof IntersectionObserver !== 'function') {
    ceremony.classList.add('is-in');
    return;
  }

  ceremonyWatcher = new IntersectionObserver(function (entries, observer) {
    for (let i = 0; i < entries.length; i += 1) {
      if (entries[i].isIntersecting) {
        entries[i].target.classList.add('is-in');
        observer.disconnect();
        ceremonyWatcher = null;
        return;
      }
    }
  }, { threshold: 0.4 });
  ceremonyWatcher.observe(ceremony);
}

/**
 * @param {HTMLElement} node
 */
export function clear(node) {
  node.replaceChildren();
}
