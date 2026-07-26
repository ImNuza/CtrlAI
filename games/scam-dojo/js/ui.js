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
 * @returns {DocumentFragment}
 */
export function buildChoiceControl() {
  const frag = document.createDocumentFragment();
  frag.appendChild(button('hangup-btn', 'btn', 'Hang up'));
  frag.appendChild(button('comply-btn', 'btn btn-plain', 'Do what they say'));
  return frag;
}

/**
 * The comply path interstitial. Kind, never a scolding.
 * @param {string} text
 * @returns {HTMLDivElement}
 */
export function buildWalkthrough(text) {
  const card = el('div', 'walkthrough');
  card.appendChild(para('walkthrough-line', text));
  card.appendChild(button('walkthrough-continue', 'btn', 'Continue'));
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

/**
 * Restart the shield entrance so the ceremony plays on every round, not only
 * the first time the element is created.
 * @param {HTMLElement} ceremony
 */
export function replayCeremony(ceremony) {
  ceremony.classList.remove('is-in');
  void ceremony.offsetWidth;
  ceremony.classList.add('is-in');
}

/**
 * @param {HTMLElement} node
 */
export function clear(node) {
  node.replaceChildren();
}
