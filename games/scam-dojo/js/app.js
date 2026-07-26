/*
  Boot, screen state machine and storage for Scam Dojo.

  Four screens live in the page at once; exactly one is ever without [hidden].
  Nothing advances on a clock. Every move between screens, and every line of the
  call, is a tap the player chose to make.
*/

import { loadState, saveState } from '/shared/storage.js';
import { aiGenerate } from '/shared/ai.js';
import { buildRound, loadContent, tellLabel } from '/games/scam-dojo/js/rounds.js';
import {
  renderStreak,
  renderRing,
  buildBubble,
  buildCaughtLabel,
  buildTapNote,
  buildListenControl,
  buildChoiceControl,
  buildWalkthrough,
  buildWalkthroughIntro,
  buildWalkthroughStep,
  buildRecapItem,
  replayCeremony,
  clear,
  WALKTHROUGH_NEXT,
  WALKTHROUGH_END
} from '/games/scam-dojo/js/ui.js';

const GAME = 'scam-dojo';
const NS = 'scam-dojo';
const RECENT_LIMIT = 2;

// A tap that lands within this window of a control appearing is the tail of a
// double tap aimed at whatever used to sit there. Seniors tap twice when they
// think the first one missed, so the second one has to cost nothing.
const INPUT_GUARD_MS = 350;

const HINT_CALL = 'Tap any line that feels off';
const HINT_WALKTHROUGH = 'Here is what would have happened';
const HINT_ENDED = 'That call is over';
const LOAD_FAILED = 'The call could not load. Please try again.';

const state = normalizeState(loadState(NS, null));

const screens = {};
const refs = {};

let round = null;
let revealed = 0;
let choiceMade = false;
let choiceShownAt = 0;

let walkthroughSteps = [];
let walkthroughIndex = 0;
let walkthroughBusy = false;
let walkthroughStepAt = 0;
const walkthroughRefs = { steps: null, button: null };

function normalizeState(raw) {
  const source = raw !== null && typeof raw === 'object' ? raw : {};
  return {
    streak: wholeNumber(source.streak),
    roundsPlayed: wholeNumber(source.roundsPlayed),
    recentFamilies: Array.isArray(source.recentFamilies)
      ? source.recentFamilies.filter(function (item) {
          return typeof item === 'string' && item !== '';
        }).slice(-RECENT_LIMIT)
      : []
  };
}

function wholeNumber(value) {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

/* ---- Screens ------------------------------------------------------------- */

function showScreen(name) {
  const keys = Object.keys(screens);
  for (let i = 0; i < keys.length; i += 1) {
    const key = keys[i];
    if (key === name) {
      screens[key].removeAttribute('hidden');
    } else {
      screens[key].setAttribute('hidden', '');
    }
  }
  window.scrollTo(0, 0);
  screens[name].focus({ preventScroll: true });
}

function setBusy(node, busy) {
  if (busy) {
    node.setAttribute('aria-disabled', 'true');
  } else {
    node.removeAttribute('aria-disabled');
  }
}

function withinGuard(stamp) {
  return Date.now() - stamp < INPUT_GUARD_MS;
}

/* ---- Home ---------------------------------------------------------------- */

function renderHome() {
  renderStreak(refs.homeStreak, state.streak);
}

// The note is a live region that renders empty, so the sentence is announced the
// moment it is set. Empty means no box at all, see .load-note:empty in app.css.
function setLoadNote(text) {
  refs.loadNote.textContent = text;
}

async function onAnswerCall() {
  setBusy(refs.answerCall, true);
  try {
    round = await buildRound(state);
  } catch (error) {
    // Content did not arrive. Say so in one plain line and leave the button
    // live, so the next tap is a retry rather than a guess about whether the
    // first tap registered at all.
    setLoadNote(LOAD_FAILED);
    setBusy(refs.answerCall, false);
    return;
  }
  setLoadNote('');
  renderRing({ name: refs.ringName, number: refs.ringNumber }, round);
  showScreen('ring');
  setBusy(refs.answerCall, false);
}

/* ---- Call ---------------------------------------------------------------- */

function onAnswer() {
  startCall();
  showScreen('call');
}

function startCall() {
  revealed = 0;
  choiceMade = false;
  resetWalkthrough();
  screens.call.dataset.family = round.family;
  screens.call.dataset.script = round.id;
  screens.call.dataset.phase = 'call';
  screens.call.style.removeProperty('--walkthrough-tail');
  refs.callCaller.textContent = round.callerName;
  refs.callHint.textContent = HINT_CALL;
  clear(refs.transcript);
  renderListenControl();

  // Answering opens on the caller's first words, the way a real call does.
  // Everything after it is still a tap the player chose to make.
  revealNextLine();
  if (revealed === 0) {
    // A script with no lines at all still reaches the choice rather than
    // stranding the player on a Listen button that can never fire.
    renderChoiceControl();
  }
}

function renderListenControl() {
  clear(refs.dockInner);
  const listen = buildListenControl();
  listen.addEventListener('click', revealNextLine);
  refs.dockInner.appendChild(listen);
  refs.dock.removeAttribute('hidden');
}

// The dock swaps under the player's thumb the instant the last line lands, so
// the moment of the swap is recorded and both choices ignore anything that
// arrives inside the guard window. Hang up also takes the slot Listen vacated,
// so a tap that arrives after the window lands on the safe action.
function renderChoiceControl() {
  clear(refs.dockInner);
  const controls = buildChoiceControl();
  refs.dockInner.appendChild(controls);
  choiceShownAt = Date.now();
  refs.dockInner.querySelector('#hangup-btn').addEventListener('click', onHangUp);
  refs.dockInner.querySelector('#comply-btn').addEventListener('click', onComply);
}

function revealNextLine() {
  if (round === null || revealed >= round.lines.length) {
    return;
  }
  const bubble = buildBubble(round.lines[revealed]);
  refs.transcript.appendChild(bubble);
  revealed += 1;
  if (revealed >= round.lines.length) {
    renderChoiceControl();
  }
  scrollToLatest();
}

function scrollToLatest() {
  window.scrollTo(0, document.documentElement.scrollHeight);
}

function stickyOffset() {
  return refs.callHeader === undefined ? 0 : Math.round(refs.callHeader.getBoundingClientRect().height);
}

// The header floats over the top of the transcript and its height changes with
// the caller name, so the measured height goes back into the stylesheet as the
// scroll margin a card is anchored by.
function syncStickyOffset() {
  screens.call.style.setProperty('--sticky-offset', stickyOffset() + 'px');
}

// scrollIntoView can only scroll as far as the document allows, and a tall card
// appended at the foot of the page has nothing underneath it to scroll into. The
// reserve below the walkthrough grows by exactly what this card needs, no more.
function reserveTail(card) {
  screens.call.style.setProperty('--walkthrough-tail', '0px');
  const cardTop = window.scrollY + card.getBoundingClientRect().top;
  const below = document.documentElement.scrollHeight - cardTop;
  const room = window.innerHeight - stickyOffset();
  screens.call.style.setProperty('--walkthrough-tail', (below >= room ? 0 : Math.ceil(room - below)) + 'px');
}

// A new step lands with its own top on screen, under the header. Scrolling to
// the page bottom instead would drop the player into the middle of a sentence.
function anchorStep(card) {
  syncStickyOffset();
  reserveTail(card);
  card.scrollIntoView({ block: 'start', behavior: 'auto' });
}

// The dock is fixed over the foot of the page, so the sentence that does the
// teaching has to be pulled clear of it. .tap-note carries the scroll margins
// that keep it above the dock.
function revealNote(bubble, note) {
  bubble.insertAdjacentElement('afterend', note);
  note.scrollIntoView({ block: 'nearest', behavior: 'auto' });
}

async function onTranscriptClick(event) {
  const bubble = event.target.closest('.bubble');
  if (bubble === null || choiceMade) {
    return;
  }
  const line = round === null ? null : round.lines[Number(bubble.dataset.lineIndex)];
  if (line === null || line === undefined || line.tapped) {
    return;
  }
  line.tapped = true;
  bubble.setAttribute('aria-pressed', 'true');

  if (line.tell !== null) {
    line.caught = true;
    bubble.classList.add('is-caught');
    bubble.appendChild(buildCaughtLabel(tellLabel(round.tellLabels, line.tell)));
    const affirm = await aiGenerate({ game: GAME, event: 'affirm_catch', context: round.context });
    revealNote(bubble, buildTapNote('catch', affirm.text));
    return;
  }

  bubble.classList.add('is-checked');
  const note = await aiGenerate({
    game: GAME,
    event: 'benign_' + line.benign,
    context: round.context
  });
  revealNote(bubble, buildTapNote('benign', note.text));
}

// Once a choice is made the transcript is a record, not a control. Left live it
// would answer a tap with pressed feedback and then do nothing at all.
function freezeTranscript() {
  const bubbles = refs.transcript.querySelectorAll('.bubble');
  for (let i = 0; i < bubbles.length; i += 1) {
    bubbles[i].disabled = true;
  }
}

async function onHangUp() {
  if (choiceMade || withinGuard(choiceShownAt)) {
    return;
  }
  choiceMade = true;
  freezeTranscript();
  refs.callHint.textContent = HINT_ENDED;
  clear(refs.dockInner);
  refs.dock.setAttribute('hidden', '');
  await finishRound();
}

/* ---- Walkthrough --------------------------------------------------------- */

/*
  Going along with the caller opens a story, not a verdict. One tap per pressure
  the caller actually used, in the order they used it, each one saying what would
  have happened next. The same shield is waiting at the end of it.
*/

function resetWalkthrough() {
  walkthroughSteps = [];
  walkthroughIndex = 0;
  walkthroughBusy = false;
  walkthroughStepAt = 0;
  walkthroughRefs.steps = null;
  walkthroughRefs.button = null;
}

async function onComply() {
  if (choiceMade || withinGuard(choiceShownAt)) {
    return;
  }
  choiceMade = true;
  freezeTranscript();
  refs.callHint.textContent = HINT_WALKTHROUGH;
  clear(refs.dockInner);
  refs.dock.setAttribute('hidden', '');
  screens.call.dataset.phase = 'walkthrough';

  walkthroughSteps = round.lines.filter(function (line) {
    return line.tell !== null;
  });
  walkthroughIndex = 0;

  const shell = buildWalkthrough();
  refs.transcript.appendChild(shell);
  walkthroughRefs.steps = shell.querySelector('#walkthrough-steps');
  walkthroughRefs.button = shell.querySelector('#walkthrough-continue');
  walkthroughRefs.button.addEventListener('click', onWalkthroughContinue);

  const intro = await aiGenerate({ game: GAME, event: 'walkthrough_intro', context: round.context });
  walkthroughRefs.steps.appendChild(buildWalkthroughIntro(intro.text));
  syncWalkthroughButton();
  // The continue button is new and sits low on the page, near where the comply
  // button was. It waits out the same guard window before it will answer.
  walkthroughStepAt = Date.now();
  scrollToLatest();
}

function syncWalkthroughButton() {
  const remaining = walkthroughIndex < walkthroughSteps.length;
  walkthroughRefs.button.textContent = remaining ? WALKTHROUGH_NEXT : WALKTHROUGH_END;
}

// The continue control lives on through the whole walkthrough, so unlike the
// dock buttons it is still there to be tapped twice. The flag stops a double tap
// from banking the round twice, and the guard window stops the second tap of a
// double tap from skipping the card that just appeared.
async function onWalkthroughContinue() {
  if (walkthroughBusy || withinGuard(walkthroughStepAt)) {
    return;
  }
  walkthroughBusy = true;

  if (walkthroughIndex >= walkthroughSteps.length) {
    // Stays busy on purpose: the round is over and startCall resets it.
    await finishRound();
    return;
  }

  const line = walkthroughSteps[walkthroughIndex];
  // The round's own rolled slots, so the consequence names the same grandchild,
  // the same amount and the same place the caller just used.
  const consequence = await explainTell('walkthrough_step_', line);

  walkthroughIndex += 1;
  const card = buildWalkthroughStep({
    position: walkthroughIndex,
    total: walkthroughSteps.length,
    tell: line.tell,
    quote: line.text,
    label: tellLabel(round.tellLabels, line.tell),
    consequence: consequence.text
  });
  walkthroughRefs.steps.appendChild(card);

  syncWalkthroughButton();
  walkthroughStepAt = Date.now();
  walkthroughBusy = false;
  anchorStep(card);
}

// Some tells split into mechanisms that are different scams underneath: a
// voucher ask and a courier at the door are not the same warning. When a line
// carries one, its explanation comes from the pool that speaks only about that
// mechanism, and the base pool is the fallback when no such pool exists.
async function explainTell(prefix, line) {
  const base = prefix + line.tell;
  if (typeof line.mechanism === 'string' && line.mechanism !== '') {
    const keyed = await aiGenerate({
      game: GAME,
      event: base + '_' + line.mechanism,
      context: round.context
    });
    if (keyed.meta.source !== 'fallback') {
      return keyed;
    }
  }
  return aiGenerate({ game: GAME, event: base, context: round.context });
}

/* ---- Recap --------------------------------------------------------------- */

// The shield is banked before a single recap element exists, so a reload during
// the recap can never cost the player the round they just finished.
async function finishRound() {
  state.roundsPlayed += 1;
  state.streak += 1;
  state.recentFamilies.push(round.family);
  while (state.recentFamilies.length > RECENT_LIMIT) {
    state.recentFamilies.shift();
  }
  saveState(NS, state);
  renderHome();

  await renderRecap();
  showScreen('recap');
}

async function renderRecap() {
  clear(refs.recapList);
  for (let i = 0; i < round.lines.length; i += 1) {
    const line = round.lines[i];
    if (line.tell === null) {
      continue;
    }
    const why = await explainTell('recap_', line);
    refs.recapList.appendChild(buildRecapItem({
      text: line.text,
      label: tellLabel(round.tellLabels, line.tell),
      caught: line.caught,
      why: why.text
    }));
  }

  const ceremony = await aiGenerate({ game: GAME, event: 'shield_earned', context: round.context });
  refs.ceremonyLine.textContent = ceremony.text;
  renderStreak(refs.streakCount, state.streak);
  replayCeremony(refs.ceremony);
}

function onBackHome() {
  round = null;
  renderHome();
  showScreen('home');
}

/* ---- Boot ---------------------------------------------------------------- */

function boot() {
  screens.home = document.querySelector('[data-screen="home"]');
  screens.ring = document.querySelector('[data-screen="ring"]');
  screens.call = document.querySelector('[data-screen="call"]');
  screens.recap = document.querySelector('[data-screen="recap"]');

  refs.homeStreak = document.getElementById('home-streak');
  refs.answerCall = document.getElementById('answer-call');
  refs.loadNote = document.getElementById('load-note');
  refs.ringName = document.getElementById('ring-name');
  refs.ringNumber = document.getElementById('ring-number');
  refs.answerBtn = document.getElementById('answer-btn');
  refs.callHeader = document.getElementById('call-header');
  refs.callCaller = document.getElementById('call-caller');
  refs.callHint = document.getElementById('call-hint');
  refs.transcript = document.getElementById('transcript');
  refs.dock = document.getElementById('call-dock');
  refs.dockInner = document.getElementById('call-dock-inner');
  refs.recapList = document.getElementById('recap-list');
  refs.ceremony = document.getElementById('shield-ceremony');
  refs.ceremonyLine = document.getElementById('ceremony-line');
  refs.streakCount = document.getElementById('streak-count');
  refs.backHome = document.getElementById('back-home-btn');

  refs.answerCall.addEventListener('click', onAnswerCall);
  refs.answerBtn.addEventListener('click', onAnswer);
  refs.transcript.addEventListener('click', onTranscriptClick);
  refs.backHome.addEventListener('click', onBackHome);

  renderHome();
  showScreen('home');

  // Warm the content so the first Answer tap opens the ring with no wait.
  loadContent().catch(function () {});
}

boot();
