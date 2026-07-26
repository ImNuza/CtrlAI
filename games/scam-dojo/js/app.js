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

const state = normalizeState(loadState(NS, null));

const screens = {};
const refs = {};

let round = null;
let revealed = 0;
let choiceMade = false;

let walkthroughSteps = [];
let walkthroughIndex = 0;
let walkthroughBusy = false;
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

/* ---- Home ---------------------------------------------------------------- */

function renderHome() {
  renderStreak(refs.homeStreak, state.streak);
}

async function onAnswerCall() {
  setBusy(refs.answerCall, true);
  try {
    round = await buildRound(state);
  } catch (error) {
    setBusy(refs.answerCall, false);
    return;
  }
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
  refs.callCaller.textContent = round.callerName;
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

function renderChoiceControl() {
  clear(refs.dockInner);
  const controls = buildChoiceControl();
  refs.dockInner.appendChild(controls);
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
    bubble.insertAdjacentElement('afterend', buildTapNote('catch', affirm.text));
    return;
  }

  bubble.classList.add('is-checked');
  const note = await aiGenerate({
    game: GAME,
    event: 'benign_' + line.benign,
    context: round.context
  });
  bubble.insertAdjacentElement('afterend', buildTapNote('benign', note.text));
}

async function onHangUp() {
  choiceMade = true;
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
  walkthroughRefs.steps = null;
  walkthroughRefs.button = null;
}

async function onComply() {
  choiceMade = true;
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
  scrollToLatest();
}

function syncWalkthroughButton() {
  const remaining = walkthroughIndex < walkthroughSteps.length;
  walkthroughRefs.button.textContent = remaining ? WALKTHROUGH_NEXT : WALKTHROUGH_END;
}

// The continue control lives on through the whole walkthrough, so unlike the
// dock buttons it is still there to be tapped twice. The flag is what stops a
// double tap on the last step from banking the round twice.
async function onWalkthroughContinue() {
  if (walkthroughBusy) {
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
  const consequence = await aiGenerate({
    game: GAME,
    event: 'walkthrough_step_' + line.tell,
    context: round.context
  });

  walkthroughIndex += 1;
  walkthroughRefs.steps.appendChild(buildWalkthroughStep({
    position: walkthroughIndex,
    total: walkthroughSteps.length,
    tell: line.tell,
    quote: line.text,
    label: tellLabel(round.tellLabels, line.tell),
    consequence: consequence.text
  }));

  syncWalkthroughButton();
  walkthroughBusy = false;
  scrollToLatest();
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
    const why = await aiGenerate({
      game: GAME,
      event: 'recap_' + line.tell,
      context: round.context
    });
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
  refs.ringName = document.getElementById('ring-name');
  refs.ringNumber = document.getElementById('ring-number');
  refs.answerBtn = document.getElementById('answer-btn');
  refs.callCaller = document.getElementById('call-caller');
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
