/*
  Garden of Life sound.

  Four small cues, synthesised in the page. No audio files, no fetches, no
  library, and nothing that could arrive late or not at all: the whole sound
  design is a handful of sine tones with soft envelopes, which is also why it
  can stay well under a tenth of a second of work per tap.

  Two rules shape every line in here.

  The first is that nobody gets startled. Master gain sits at 0.15, every tone
  fades in over a few milliseconds and decays rather than stopping, and the
  loudest cue in the set is still quieter than a phone keyboard click. A senior
  holding the phone near their ear must never regret turning sound on.

  The second is that sound is never the only signal. Every cue here accompanies
  something the player can already see: water darkening the soil, a pair
  settling, a plant arriving, a meal card turning over. Muted, the game loses
  nothing it needed to be understood, which is why muted can be a complete no
  op rather than a silent version of the same work.

  The AudioContext is created lazily inside the first play that runs while the
  sound is on, never at import and never at init. Browsers refuse a context
  created outside a gesture, and a game that asks for one on boot gets a console
  warning on every load and, on some phones, a context stuck in suspended that
  never recovers. Muted from a fresh load, no context is ever created at all.

  Nothing in here is persisted. The glue passes the saved setting to initAudio
  and calls setMuted when the toggle moves; state owns the save.
*/

/* ---- the mixer -----------------------------------------------------------
   One master gain for the whole game. Quiet on purpose, and the number is the
   ceiling rather than a starting point: individual cues scale down from it and
   nothing scales up. */

const MASTER_GAIN = 0.15;

// Fade the master rather than cutting it, so muting mid cue does not click.
const MUTE_FADE = 0.06;

/* Envelope shape shared by every tone. The attack is long enough that no
   speaker has to move from a standing start, which is the whole difference
   between a note and a click. */
const ATTACK = 0.012;
const TAIL = 0.02;
const FLOOR = 0.0001;

/* ---- the four cues -------------------------------------------------------
   Fixed frequencies and fixed timings. No randomness of any kind: two waterings
   a second apart have to sound like the same watering, and a cue that wobbles
   reads as a fault rather than as life.

   water        one drop, falling. A sine sliding down from 440 to 180 with a
                fast decay, which is the shape of something small landing in
                soil rather than in a glass.
   match        the quietest thing in the game. A short high tick, half the
                level of everything else, because it fires eight times a round.
   planting     a warm two note rise, a fifth, in the register a voice would
                hum it.
   meal_unlock  the same idea a sixth wider and higher, so the two chimes are
                telling different news even to somebody not looking at the
                screen. */

const CUES = {
  water: [
    { at: 0, type: 'sine', from: 440, to: 180, hold: 0.22, peak: 0.9 }
  ],
  match: [
    { at: 0, type: 'sine', from: 1180, to: 1180, hold: 0.07, peak: 0.42 }
  ],
  planting: [
    { at: 0, type: 'sine', from: 392, to: 392, hold: 0.2, peak: 0.75 },
    { at: 0.13, type: 'sine', from: 587.33, to: 587.33, hold: 0.32, peak: 0.7 }
  ],
  meal_unlock: [
    { at: 0, type: 'sine', from: 523.25, to: 523.25, hold: 0.22, peak: 0.75 },
    { at: 0.16, type: 'sine', from: 880, to: 880, hold: 0.42, peak: 0.68 }
  ]
};

const CUE_NAMES = ['water', 'match', 'planting', 'meal_unlock'];

/* ---- module state -------------------------------------------------------- */

let ctx = null;
let master = null;

// Default is sound on but quiet. The glue overrides this at init with whatever
// the player last chose.
let muted = false;

/* ---- the context ---------------------------------------------------------
   Everything below answers rather than throws. A browser with no Web Audio, a
   context the autoplay policy refuses, a device that has run out of them: all
   the same answer, which is that the game carries on without sound. */

function contextClass() {
  if (typeof window === 'undefined' || window === null) {
    return null;
  }
  if (typeof window.AudioContext === 'function') {
    return window.AudioContext;
  }
  if (typeof window.webkitAudioContext === 'function') {
    return window.webkitAudioContext;
  }
  return null;
}

// Called from inside a tap, never anywhere else. A refusal leaves ctx null, so
// the game stays unstarted and the next tap is free to try again.
function ensureContext() {
  if (ctx !== null) {
    return ctx;
  }
  const Ctor = contextClass();
  if (Ctor === null) {
    return null;
  }
  try {
    const audio = new Ctor();
    const gain = audio.createGain();
    gain.gain.setValueAtTime(muted ? 0 : MASTER_GAIN, audio.currentTime);
    gain.connect(audio.destination);
    ctx = audio;
    master = gain;
    return ctx;
  } catch (error) {
    ctx = null;
    master = null;
    return null;
  }
}

// A context created inside a gesture can still arrive suspended on iOS. Asking
// it to resume is free when it is already running, and the answer is ignored
// because a refusal here just means this one cue is silent.
function nudgeRunning(audio) {
  try {
    if (audio.state === 'suspended' && typeof audio.resume === 'function') {
      const resumed = audio.resume();
      if (resumed !== null && resumed !== undefined && typeof resumed.catch === 'function') {
        resumed.catch(function () {});
      }
    }
  } catch (error) {
    // Silent is an acceptable outcome. Broken is not, so nothing rethrows.
  }
}

/* ---- one tone ------------------------------------------------------------
   Attack to the peak, then an exponential decay to a floor and a stop. The
   floor exists because an exponential ramp cannot reach zero, and the extra
   tail after it is there so the node is torn down after the sound has finished
   rather than during it. */

function tone(audio, note, startAt) {
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  const begin = startAt + note.at;
  const end = begin + note.hold;

  osc.type = note.type;
  osc.frequency.setValueAtTime(note.from, begin);
  if (note.to !== note.from) {
    // Exponential, because pitch is heard that way: a linear slide from 440 to
    // 180 spends most of its time in the top half of the drop.
    osc.frequency.exponentialRampToValueAtTime(note.to, end);
  }

  gain.gain.setValueAtTime(FLOOR, begin);
  gain.gain.linearRampToValueAtTime(note.peak, begin + ATTACK);
  gain.gain.exponentialRampToValueAtTime(FLOOR, end);

  osc.connect(gain);
  gain.connect(master);
  osc.start(begin);
  osc.stop(end + TAIL);
}

/* ---- exports ------------------------------------------------------------- */

/**
 * Set the sound up.
 *
 * Creates nothing. No AudioContext exists after this call, whatever the setting
 * is, because a context asked for outside a user gesture is refused by every
 * current browser and a refused context is worse than none. The first cue after
 * a tap builds it.
 *
 * Only the boolean true silences the game. A save that came back holding
 * anything else reads as the default, which is sound on and quiet, and the same
 * rule applies in setMuted so the two can never disagree about what a broken
 * setting means.
 *
 * @param {Object} [options]
 * @param {boolean} [options.muted=false] The player's saved choice, from state.
 * @returns {boolean} The muted setting now in effect.
 */
export function initAudio(options) {
  const config = options === null || typeof options !== 'object' ? {} : options;
  muted = config.muted === true;
  return muted;
}

/**
 * Turn the sound on or off.
 *
 * Muting fades the master down rather than cutting it, so a cue that is halfway
 * through finishes quietly instead of stopping dead, and then suspends the
 * context so nothing is running in the background. Unmuting restores the level;
 * the context is left asleep until the next cue, which by then is inside a tap
 * again.
 *
 * @param {boolean} value True to silence the game. Anything that is not the
 *   boolean true turns the sound on, matching initAudio.
 * @returns {boolean} The muted setting now in effect.
 */
export function setMuted(value) {
  muted = value === true;
  if (ctx === null || master === null) {
    return muted;
  }
  try {
    const now = ctx.currentTime;
    master.gain.cancelScheduledValues(now);
    master.gain.setValueAtTime(master.gain.value, now);
    master.gain.linearRampToValueAtTime(muted ? 0 : MASTER_GAIN, now + MUTE_FADE);
    if (muted && typeof ctx.suspend === 'function') {
      const suspended = ctx.suspend();
      if (suspended !== null && suspended !== undefined && typeof suspended.catch === 'function') {
        suspended.catch(function () {});
      }
    }
  } catch (error) {
    // The setting is what matters and it is already set. A mixer that refused
    // to move is not worth taking the game down for.
  }
  return muted;
}

/**
 * @returns {boolean} True when the game is silent.
 */
export function isMuted() {
  return muted;
}

/**
 * Whether any audio machinery exists yet.
 *
 * The QA seam for the no autoplay rule: this must be false on a fresh load and
 * after every tap that happens while muted, and true only once a cue has
 * actually run with the sound on.
 *
 * @returns {boolean}
 */
export function isStarted() {
  return ctx !== null;
}

/**
 * Play one cue.
 *
 * Call it from inside the tap that caused the thing it is describing, and only
 * alongside a change the player can already see. Muted, it does nothing at all
 * and builds nothing.
 *
 * @param {string} name water, match, planting or meal_unlock.
 * @returns {boolean} True when the cue was scheduled. False covers muted, an
 *   unknown name, and a browser that will not give the game a context, none of
 *   which is an error worth telling anybody about.
 */
export function play(name) {
  if (muted) {
    return false;
  }
  const notes = CUE_NAMES.indexOf(name) === -1 ? null : CUES[name];
  if (notes === null || notes === undefined) {
    return false;
  }
  const audio = ensureContext();
  if (audio === null || master === null) {
    return false;
  }
  try {
    nudgeRunning(audio);
    const now = audio.currentTime;
    for (let i = 0; i < notes.length; i += 1) {
      tone(audio, notes[i], now);
    }
    return true;
  } catch (error) {
    return false;
  }
}
