// utils/storage.js — chrome.storage.local helpers
// All functions return Promises.

const MAX_STORAGE_BYTES  = 4_800_000;
const WARN_STORAGE_BYTES = 4_500_000;

// ── API key encryption (AES-256-GCM) ─────────────────────────────────────────
// The key is derived from the extension ID using PBKDF2 so the encrypted blob
// is unreadable without the same extension installation. This protects against
// plain-text LevelDB reads on compromised machines.

const _PBKDF2_ITERS = 100_000;

async function _deriveKey(salt, iterations) {
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(chrome.runtime.id + '_aic_v1'),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: new Uint8Array(salt), iterations, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

async function _encryptApiKey(plaintext) {
  const salt = Array.from(crypto.getRandomValues(new Uint8Array(16)));
  const iv   = Array.from(crypto.getRandomValues(new Uint8Array(12)));
  const key  = await _deriveKey(salt, _PBKDF2_ITERS);
  const enc  = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: new Uint8Array(iv) },
    key,
    new TextEncoder().encode(plaintext)
  );
  // v3 blobs store the iteration count so future code changes never break decryption.
  return { v: 3, iters: _PBKDF2_ITERS, salt, iv, data: Array.from(new Uint8Array(enc)) };
}

async function _decryptApiKey(stored) {
  if (!stored || typeof stored !== 'object') return stored;

  // v3: iteration count is in the blob — safe to bump in future without migration pain.
  if (stored.v === 3) {
    try {
      const key = await _deriveKey(stored.salt, stored.iters);
      const dec = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: new Uint8Array(stored.iv) },
        key,
        new Uint8Array(stored.data)
      );
      return new TextDecoder().decode(dec);
    } catch (_) {
      return '__DECRYPT_FAILED__';
    }
  }

  // v2: iteration count was never stored. Try 100k (keys encrypted by recent code)
  // then 10k (keys encrypted by the original release) so neither cohort loses access.
  if (stored.v === 2) {
    for (const iters of [100_000, 10_000]) {
      try {
        const key = await _deriveKey(stored.salt, iters);
        const dec = await crypto.subtle.decrypt(
          { name: 'AES-GCM', iv: new Uint8Array(stored.iv) },
          key,
          new Uint8Array(stored.data)
        );
        // Signal caller to silently re-encrypt with v3 so this migration only runs once.
        return { _plaintext: new TextDecoder().decode(dec), _needsReencrypt: true };
      } catch (_) { /* try next */ }
    }
    return '__DECRYPT_FAILED__';
  }

  // Pre-v2 plain-string storage — return as-is.
  return stored;
}

/** @returns {Promise<CapsulePair[]>} */
export async function getCapsules() {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(['capsules'], (result) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      const raw = result.capsules || [];
      // Migrate pre-v1 capsules that are missing schema_version
      const migrated = raw.map(c => c.schema_version ? c : { ...c, schema_version: 1, tags: c.tags || [] });
      resolve(migrated);
    });
  });
}

/** @returns {Promise<void>} */
export async function saveCapsule(pair) {
  // Check storage size before saving
  const used = await getStorageSize();
  if (used > MAX_STORAGE_BYTES) {
    throw new Error('STORAGE_FULL');
  }
  if (used > WARN_STORAGE_BYTES) {
    // We still save but return a soft warning — caller can check
    console.warn('[CapsuleHub] Storage nearly full. Delete old capsules to continue saving.');
  }

  const capsules = await getCapsules();
  if (capsules.some(c => c.id === pair.id)) return; // dedup: already written on a previous retry
  const incomingBytes = JSON.stringify(pair).length * 2;
  if (used + incomingBytes > MAX_STORAGE_BYTES) {
    throw new Error('STORAGE_FULL');
  }
  capsules.push(pair);
  return new Promise((resolve, reject) => {
    chrome.storage.local.set({ capsules }, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve();
      }
    });
  });
}

/** @returns {Promise<void>} */
export async function deleteCapsule(id) {
  const capsules = await getCapsules();
  const filtered = capsules.filter(c => c.id !== id);
  return new Promise((resolve, reject) => {
    chrome.storage.local.set({ capsules: filtered }, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve();
      }
    });
  });
}

/** @returns {Promise<{apiUrl: string, apiKey: string, apiModel: string}>} */
export async function getSettings() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['apiUrl', 'apiKey', 'apiModel'], (result) => {
      const rawKey = result.apiKey || '';
      const decryptPromise = (rawKey && typeof rawKey === 'object' && (rawKey.v === 2 || rawKey.v === 3))
        ? _decryptApiKey(rawKey)
        : Promise.resolve(rawKey);
      decryptPromise.then(apiKey => {
        // Handle v2 → v3 migration: re-encrypt in background so it only happens once.
        let plaintext = apiKey;
        if (apiKey && typeof apiKey === 'object' && apiKey._needsReencrypt) {
          plaintext = apiKey._plaintext;
          _encryptApiKey(plaintext)
            .then(newBlob => chrome.storage.local.set({ apiKey: newBlob }))
            .catch(() => {});
        }
        const decryptFailed = plaintext === '__DECRYPT_FAILED__';
        resolve({
          apiUrl:          result.apiUrl   || '',
          apiKey:          decryptFailed ? '' : (plaintext || ''),
          apiModel:        result.apiModel || '',
          _keyDecryptFailed: decryptFailed
        });
      });
    });
  });
}

/** @returns {Promise<void>} */
export async function saveSettings({ apiUrl, apiKey, apiModel }) {
  const storedKey = apiKey ? await _encryptApiKey(apiKey) : apiKey;
  return new Promise((resolve, reject) => {
    chrome.storage.local.set({ apiUrl, apiKey: storedKey, apiModel }, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve();
      }
    });
  });
}

/** @returns {Promise<number>} bytes currently used */
export async function getStorageSize() {
  return new Promise((resolve) => {
    chrome.storage.local.getBytesInUse(null, resolve);
  });
}

/** @returns {Promise<boolean>} true if approaching limit */
export async function isStorageNearFull() {
  const used = await getStorageSize();
  return used > WARN_STORAGE_BYTES;
}
