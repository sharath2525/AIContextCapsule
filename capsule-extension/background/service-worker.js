// background/service-worker.js — Message router + storage bridge (MV3)
import {
  getCapsules,
  saveCapsule,
  deleteCapsule
} from '../utils/storage.js';

// E6: clear transient storage keys on install/update so stale widget state
// or orphaned export data from a previous session does not persist.
function _clearTransientKeys() {
  chrome.storage.local.get(null, items => {
    const staleKeys = ['activeCapsule', 'exportData',
      ...Object.keys(items).filter(k => k.startsWith('exportData_'))
    ];
    chrome.storage.local.remove(staleKeys);
  });
}

chrome.runtime.onInstalled.addListener(() => {
  _clearTransientKeys();
  chrome.action.setBadgeText({ text: '' });
});

// activeCapsule is session-scoped; clear any stale value on browser startup.
chrome.runtime.onStartup.addListener(_clearTransientKeys);

// ── DOM health badge helpers ─────────────────────────────────────────────────
// If capture fails with NO_MESSAGES on a supported site, popup.js sends
// SELECTOR_WARN so users see an orange "!" on the extension icon — meaning
// the site updated its DOM and scraping is broken. SELECTOR_OK clears it.
function setBadgeWarn() {
  chrome.action.setBadgeText({ text: '!' });
  chrome.action.setBadgeBackgroundColor({ color: '#F97316' });
  chrome.action.setTitle({ title: 'AIContext Saver — ⚠ Site layout may have changed. Capture failed.' });
}
function clearBadge() {
  chrome.action.setBadgeText({ text: '' });
  chrome.action.setTitle({ title: 'AIContext Saver' });
}

// ── In-memory write serialization queue ──────────────────────────────────────
// Uses a promise chain so concurrent SAVE/DELETE messages are serialized without
// a race condition. Chrome keeps the service worker alive for the lifetime of an
// active message handler, so in-memory state is safe during message processing.
// If the SW is restarted there are no in-flight operations (Chrome only kills an
// idle SW), so the queue resets cleanly.
let _writeQueue = Promise.resolve();

function withWriteLock(fn) {
  const next = _writeQueue.then(() => fn(), () => fn());
  // Reset the chain to prevent unbounded growth; errors are propagated via `next`.
  _writeQueue = next.then(() => {}, () => {});
  return next;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const { action } = message;

  // ── GET_CAPSULES ────────────────────────────────────────────────────────────
  if (action === 'GET_CAPSULES') {
    getCapsules()
      .then(capsules => sendResponse({ capsules }))
      .catch(err => sendResponse({ capsules: [], error: err.message }));
    return true;
  }

  // ── GET_MY_TAB_ID ───────────────────────────────────────────────────────────
  // Content scripts use this to discover their own tab ID so activeCapsule
  // can be scoped to the target tab only.
  if (action === 'GET_MY_TAB_ID') {
    sendResponse(sender.tab?.id ?? null);
    return false;
  }

  // ── SAVE_CAPSULE ────────────────────────────────────────────────────────────
  if (action === 'SAVE_CAPSULE') {
    const { capsulePair } = message;
    withWriteLock(() => saveCapsule(capsulePair))
      .then(() => sendResponse({ success: true }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  // ── DELETE_CAPSULE ──────────────────────────────────────────────────────────
  if (action === 'DELETE_CAPSULE') {
    withWriteLock(() => deleteCapsule(message.id))
      .then(() => sendResponse({ success: true }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  // ── DOM health badge ────────────────────────────────────────────────────────
  // SELECTOR_WARN: capture returned 0 messages on a supported site — selectors
  // may be broken because the AI site updated its DOM structure.
  if (action === 'SELECTOR_WARN') {
    setBadgeWarn();
    sendResponse({});
    return false;
  }

  // SELECTOR_OK: capture succeeded — clear any previous warning badge.
  if (action === 'SELECTOR_OK') {
    clearBadge();
    sendResponse({});
    return false;
  }

  return false;
});
