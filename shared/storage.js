/*
  shared/storage.js
  localStorage helpers for all three games.

  Two promises: it never throws, and it imports under plain node. When there is
  no localStorage (node, or a browser with storage blocked) an in-module Map
  stands in, so calling code and tests never branch on the environment. Data in
  the shim dies with the process, which is fine, nothing here is precious.
*/

const PREFIX = 'ctrlai:';
const shim = new Map();

function backend() {
  try {
    if (typeof localStorage !== 'undefined' && localStorage !== null) {
      return localStorage;
    }
  } catch (err) {
    // Sandboxed frames and locked down browsers throw on the access itself.
  }
  return null;
}

function keyFor(ns) {
  return PREFIX + String(ns);
}

/**
 * Read a namespace back as a value.
 * @param {string} ns  Namespace, for example "memory-garden".
 * @param {*} fallback Returned when nothing is stored or the data is unreadable.
 * @returns {*}
 */
export function loadState(ns, fallback) {
  const key = keyFor(ns);
  try {
    const store = backend();
    let raw;
    if (store) {
      raw = store.getItem(key);
    } else {
      raw = shim.has(key) ? shim.get(key) : null;
    }
    if (raw === null || raw === undefined) {
      return fallback;
    }
    return JSON.parse(raw);
  } catch (err) {
    return fallback;
  }
}

/**
 * Write a value to a namespace.
 * @param {string} ns
 * @param {*} value  Anything JSON can round trip.
 * @returns {boolean} True when it was stored.
 */
export function saveState(ns, value) {
  const key = keyFor(ns);
  try {
    const raw = JSON.stringify(value);
    if (raw === undefined) {
      return false;
    }
    const store = backend();
    if (store) {
      store.setItem(key, raw);
    } else {
      shim.set(key, raw);
    }
    return true;
  } catch (err) {
    return false;
  }
}

/**
 * Forget a namespace.
 * @param {string} ns
 * @returns {boolean} True when the key is gone afterwards.
 */
export function clearState(ns) {
  const key = keyFor(ns);
  try {
    const store = backend();
    if (store) {
      store.removeItem(key);
    } else {
      shim.delete(key);
    }
    return true;
  } catch (err) {
    return false;
  }
}
