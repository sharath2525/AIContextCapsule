// settings/settings.js
import { getSettings, saveSettings } from '../utils/storage.js';
import { testConnection } from '../utils/summarize.js';

let _prevKeyDecryptFailed = false;

const apiUrlInput   = document.getElementById('apiUrl');
const apiKeyInput   = document.getElementById('apiKey');
const apiModelInput = document.getElementById('apiModel');
const toggleKeyBtn  = document.getElementById('toggleKey');
const testBtn       = document.getElementById('testBtn');
const saveBtn       = document.getElementById('saveBtn');
const testResult    = document.getElementById('testResult');
const saveResult    = document.getElementById('saveResult');
const themeToggleEl = document.getElementById('themeToggle');
const guideToggle   = document.getElementById('guideToggle');
const guideBody     = document.getElementById('guideBody');

// ── Theme (shared with popup via localStorage) ────────────────────────────
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  themeToggleEl.querySelectorAll('.theme-opt').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.theme === theme);
  });
  try { localStorage.setItem('capsule-theme', theme); } catch(e) {}
}

document.addEventListener('DOMContentLoaded', async () => {
  // Theme
  const savedTheme = (() => {
    try { return localStorage.getItem('capsule-theme'); } catch(e) { return null; }
  })() || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  applyTheme(savedTheme);

  themeToggleEl.querySelectorAll('.theme-opt').forEach(btn => {
    btn.addEventListener('click', () => applyTheme(btn.dataset.theme));
  });

  // Load saved settings
  const settings = await getSettings();
  if (settings.apiUrl)   apiUrlInput.value   = settings.apiUrl;
  if (settings.apiKey)   apiKeyInput.value   = settings.apiKey;
  if (settings.apiModel) apiModelInput.value = settings.apiModel;
  _prevKeyDecryptFailed = !!settings._keyDecryptFailed;

  // Toggle key visibility
  toggleKeyBtn.addEventListener('click', () => {
    const hidden = apiKeyInput.type === 'password';
    apiKeyInput.type = hidden ? 'text' : 'password';
    toggleKeyBtn.textContent = hidden ? '\u{1F648}' : '\u{1F441}';
  });

  // Quick-fill presets
  document.querySelectorAll('.s-preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      apiUrlInput.value   = btn.dataset.url   || '';
      apiModelInput.value = btn.dataset.model || '';
      if (btn.dataset.key) apiKeyInput.value = btn.dataset.key;
      hideResult(saveResult);
      hideResult(testResult);
    });
  });

  // Test connection
  testBtn.addEventListener('click', onTest);

  // Save
  saveBtn.addEventListener('click', onSave);

  // Guide collapsible
  if (guideToggle && guideBody) {
    guideToggle.addEventListener('click', () => {
      const expanded = guideToggle.getAttribute('aria-expanded') === 'true';
      guideToggle.setAttribute('aria-expanded', String(!expanded));
      guideBody.hidden = expanded;
    });
  }
});

async function onTest() {
  const url   = apiUrlInput.value.trim();
  const key   = apiKeyInput.value.trim();
  const model = apiModelInput.value.trim();

  if (!url || !key || !model) {
    showResult(testResult, 'Fill in all three fields first.', false);
    return;
  }

  testBtn.disabled = true;
  testBtn.textContent = 'Testing…';
  hideResult(testResult);

  try {
    const result = await testConnection(url, key, model);
    showResult(testResult, result.ok ? 'Connection successful.' : result.error, result.ok);
  } finally {
    testBtn.disabled = false;
    testBtn.textContent = 'Test Connection';
  }
}

async function onSave() {
  const apiUrl   = apiUrlInput.value.trim();
  const apiKey   = apiKeyInput.value.trim();
  const apiModel = apiModelInput.value.trim();

  // If the key field is blank and the previous key only failed to decrypt
  // (e.g., after an extension update), don't wipe the stored encrypted blob —
  // require the user to explicitly enter the key.
  if (!apiKey && _prevKeyDecryptFailed) {
    showResult(saveResult, 'Please enter your API key. The previously saved key could not be read after the extension update — re-entering it once will restore it.', false);
    return;
  }

  if (!apiUrl || !apiKey || !apiModel) {
    showResult(saveResult, 'Fill in all three fields before saving.', false);
    return;
  }

  saveBtn.disabled = true;
  try {
    await saveSettings({ apiUrl, apiKey, apiModel });
    _prevKeyDecryptFailed = false;
    const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(apiUrl);
    if (!apiUrl.startsWith('https://') && !isLocal) {
      showResult(saveResult, 'Settings saved. Warning: non-HTTPS URL — API key and conversations travel unencrypted over the network. Use HTTPS for remote endpoints.', false);
    } else {
      showResult(saveResult, 'Settings saved.', true);
    }
  } catch (err) {
    showResult(saveResult, `Save failed: ${err.message}`, false);
  } finally {
    saveBtn.disabled = false;
  }
}

function showResult(el, msg, ok) {
  el.textContent = msg;
  el.className   = `s-result ${ok ? 'ok' : 'err'}`;
}

function hideResult(el) {
  el.className   = 's-result hidden';
  el.textContent = '';
}
