// popup/popup.js — AIContext Saver
import { summarizeConversation } from '../utils/summarize.js';
import { createCapsulePair, autoName, getRawText } from '../utils/capsule.js';
import { isStorageNearFull, getStorageSize, getSettings } from '../utils/storage.js';

// ── DOM refs ────────────────────────────────────────────────────────────────
const capsuleNameInput = document.getElementById('capsuleName');
const saveBtn          = document.getElementById('saveBtn');
const saveBtnText      = document.getElementById('saveBtnText');
const saveBtnSpinner   = document.getElementById('saveBtnSpinner');
const statusMsg        = document.getElementById('statusMsg');
const saveProgress     = document.getElementById('saveProgress');
const sp1El            = document.getElementById('sp1');
const sp2El            = document.getElementById('sp2');
const sp3El            = document.getElementById('sp3');
const searchInput      = document.getElementById('searchInput');
const capsuleList      = document.getElementById('capsuleList');
const emptyState       = document.getElementById('emptyState');
const storageWarn      = document.getElementById('storageWarn');
const storageBarFill   = document.getElementById('storageBarFill');
const storageBarWrap   = document.getElementById('storageBarWrap');
const settingsBtn      = document.getElementById('settingsBtn');
const animLayer        = document.getElementById('animLayer');
const themeToggleEl    = document.getElementById('themeToggle');

// ── Supported AI platforms ────────────────────────────────────────────────────
// To add a new platform: add an entry here + manifest.json + content/<name>.js
const SITE_MAP = [
  { match: 'chatgpt.com',           source: 'chatgpt',    label: 'ChatGPT',    files: ['content/chatgpt.js',    'content/widget.js'] },
  { match: 'claude.ai',             source: 'claude',     label: 'Claude',     files: ['content/claude.js',     'content/widget.js'] },
  { match: 'gemini.google.com',     source: 'gemini',     label: 'Gemini',     files: ['content/gemini.js',     'content/widget.js'] },
  { match: 'grok.com',              source: 'grok',       label: 'Grok',       files: ['content/grok.js',       'content/widget.js'] },
  { match: 'copilot.microsoft.com', source: 'copilot',    label: 'Copilot',    files: ['content/copilot.js',    'content/widget.js'] },
  { match: 'perplexity.ai',         source: 'perplexity', label: 'Perplexity', files: ['content/perplexity.js', 'content/widget.js'] },
  { match: 'chat.deepseek.com',     source: 'deepseek',   label: 'DeepSeek',   files: ['content/deepseek.js',   'content/widget.js'] },
  { match: 'chat.mistral.ai',       source: 'mistral',    label: 'Mistral',    files: ['content/mistral.js',    'content/widget.js'] },
  { match: 'meta.ai',               source: 'meta',       label: 'Meta AI',    files: ['content/meta.js',       'content/widget.js'] },
];

function getSiteInfo(url) {
  return SITE_MAP.find(s => url.includes(s.match)) || null;
}

function getSrcLabel(source) {
  return SITE_MAP.find(s => s.source === source)?.label || source || 'Unknown';
}

let allCapsules = [];
let saving = false;

// ── Global export dropdown portal ─────────────────────────────────────────────
// A single dropdown element appended to document.body so it is never a child
// of a .capsule-card element. .capsule-card:hover applies transform:translateY(-1px)
// which creates a new CSS containing block — any position:fixed child of the card
// would be positioned relative to that transform, not the viewport.
// Portaling to body avoids this entirely.
let _exportPortal = null;

function _getExportPortal() {
  if (_exportPortal) return _exportPortal;
  _exportPortal = document.createElement('div');
  _exportPortal.id = 'aic-export-portal';
  _exportPortal.className = 'export-row hidden';
  _exportPortal.style.position = 'fixed';
  _exportPortal.style.zIndex   = '2147483600';
  document.body.appendChild(_exportPortal);
  // Close when clicking anywhere outside the portal
  document.addEventListener('click', e => {
    if (_exportPortal && !_exportPortal.contains(e.target)) {
      _closeExportPortal();
    }
  });
  return _exportPortal;
}

function _closeExportPortal() {
  if (!_exportPortal) return;
  _exportPortal.classList.add('hidden');
  _exportPortal.innerHTML = '';
  // Reset active state on whichever toggle opened it
  document.querySelectorAll('.btn-export-toggle.active').forEach(b => b.classList.remove('active'));
}

function _openExportPortal(toggleEl, cap, feedbackEl) {
  const portal = _getExportPortal();
  const isOpen = !portal.classList.contains('hidden') &&
                 portal.dataset.capId === cap.id;
  _closeExportPortal();
  if (isOpen) return; // second click on same toggle closes it

  portal.dataset.capId = cap.id;

  // Build the three buttons fresh each time so closures reference the current cap
  portal.innerHTML = `
    <button class="btn-export" id="_epMd">Markdown</button>
    <button class="btn-export" id="_epPdf">PDF</button>
    <button class="btn-export" id="_epSum">Summary PDF</button>
  `;
  portal.querySelector('#_epMd').addEventListener('click', () => {
    _closeExportPortal();
    exportMarkdown(cap);
    showFeedback(feedbackEl, 'Markdown downloaded.', true);
  });
  portal.querySelector('#_epPdf').addEventListener('click', async () => {
    _closeExportPortal();
    try {
      await exportPDF(cap, 'both');
      showFeedback(feedbackEl, 'PDF export tab opened.', true);
    } catch (err) {
      showFeedback(feedbackEl, `Export failed: ${err.message}`, false);
    }
  });
  portal.querySelector('#_epSum').addEventListener('click', async () => {
    _closeExportPortal();
    try {
      await exportPDF(cap, 'smart');
      showFeedback(feedbackEl, 'Summary PDF tab opened.', true);
    } catch (err) {
      showFeedback(feedbackEl, `Export failed: ${err.message}`, false);
    }
  });

  // Position: align left edge of portal with toggle, open upward when near bottom
  const tr = toggleEl.getBoundingClientRect();
  portal.style.left   = tr.left + 'px';
  portal.style.right  = 'auto';
  portal.classList.remove('hidden');

  // Measure portal height after making it visible, then decide direction
  const ph = portal.offsetHeight;
  if (tr.bottom + ph + 4 > window.innerHeight) {
    portal.style.top    = 'auto';
    portal.style.bottom = (window.innerHeight - tr.top + 4) + 'px';
  } else {
    portal.style.top    = (tr.bottom + 4) + 'px';
    portal.style.bottom = 'auto';
  }

  toggleEl.classList.add('active');
}


// ── Theme ────────────────────────────────────────────────────────────────────
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  themeToggleEl.querySelectorAll('.theme-opt').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.theme === theme);
  });
  try { localStorage.setItem('capsule-theme', theme); } catch(e) {}
}

// ── Init ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  const savedTheme = (() => {
    try { return localStorage.getItem('capsule-theme'); } catch(e) { return null; }
  })() || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  applyTheme(savedTheme);

  themeToggleEl.querySelectorAll('.theme-opt').forEach(btn => {
    btn.addEventListener('click', () => applyTheme(btn.dataset.theme));
  });

  settingsBtn.addEventListener('click', () => chrome.runtime.openOptionsPage());
  saveBtn.addEventListener('click', onSave);

  // P2: debounced search — avoids hammering querySelectorAll on every keystroke
  let searchTimer;
  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => renderList(searchInput.value.trim()), 150);
  });

  await loadCapsules();
  await checkStorageWarn();
  await checkApiStatus();
});

async function checkApiStatus() {
  try {
    const settings = await getSettings();
    if (settings._keyDecryptFailed) {
      showStatus('Your saved API key could not be read — this can happen after an extension update. Please re-enter it in Settings once to restore it.', 'warning');
      return;
    }
    if (!settings.apiUrl || !settings.apiKey || !settings.apiModel) {
      // Update the empty-state hint to guide first-time users
      const sub = emptyState.querySelector('.empty-sub');
      if (sub) sub.innerHTML = 'Open a supported AI chat and click Save.<br><a href="#" id="apiSetupLink" style="color:var(--blue,#3B82F6);font-weight:700;">Configure API first →</a>';
      document.getElementById('apiSetupLink')?.addEventListener('click', e => {
        e.preventDefault();
        chrome.runtime.openOptionsPage();
      });
    }
  } catch (err) {
    console.warn('[CapsuleHub] checkApiStatus error:', err);
  }
}

// ── Load & render ─────────────────────────────────────────────────────────────
async function loadCapsules() {
  try {
    const resp = await msgBackground({ action: 'GET_CAPSULES' });
    allCapsules = (resp?.capsules || []).sort((a, b) => b.created_at - a.created_at);
    renderList(searchInput.value.trim());
  } catch (err) {
    showStatus(`Could not load capsules: ${err.message}`, 'error');
  }
}

async function checkStorageWarn() {
  try {
    const [near, bytes] = await Promise.all([isStorageNearFull(), getStorageSize()]);
    storageWarn.classList.toggle('hidden', !near);

    const MAX_BYTES = 4.8 * 1024 * 1024;
    const pct = Math.min(100, (bytes / MAX_BYTES) * 100);
    storageBarFill.style.width = pct + '%';
    storageBarFill.classList.remove('warn', 'danger');
    if (pct > 90) storageBarFill.classList.add('danger');
    else if (pct > 70) storageBarFill.classList.add('warn');

    const mb = (bytes / 1024 / 1024).toFixed(1);
    storageBarWrap.title = `Storage: ${mb} MB / 5 MB`;
  } catch (_) {}
}

// ── Render list ───────────────────────────────────────────────────────────────
function renderList(query = '') {
  const q = query.toLowerCase();

  if (q) {
    let visible = 0;
    capsuleList.querySelectorAll('.capsule-card').forEach(card => {
      const show =
        card.dataset.searchName.includes(q) ||
        card.dataset.searchSmart.includes(q) ||
        card.dataset.searchTags.includes(q);
      card.classList.toggle('hidden', !show);
      if (show) visible++;
    });
    emptyState.classList.toggle('hidden', visible > 0);
    return;
  }

  Array.from(capsuleList.children).forEach(el => {
    if (el.id !== 'emptyState') el.remove();
  });
  if (allCapsules.length === 0) {
    emptyState.classList.remove('hidden');
    return;
  }
  emptyState.classList.add('hidden');
  allCapsules.forEach((cap, i) => capsuleList.appendChild(buildCard(cap, i === 0)));
}

// ── Build card ────────────────────────────────────────────────────────────────
function buildCard(cap, isFirst = false) {
  const card = document.createElement('div');
  card.className = `capsule-card${cap.source === 'claude' ? ' src-claude' : ''}`;
  card.dataset.id          = cap.id;
  card.dataset.source      = cap.source;
  card.dataset.searchName  = cap.name.toLowerCase();
  // P3: truncate search data-attribute — full text in DOM wastes memory with many sessions
  card.dataset.searchSmart = (cap.smart?.text || '').toLowerCase().slice(0, 500);
  card.dataset.searchTags  = (cap.tags || []).join(' ').toLowerCase();

  const dateStr  = formatDate(cap.created_at);
  const srcLabel = getSrcLabel(cap.source);
  const srcClass = `badge-${cap.source || 'chatgpt'}`;

  const rawChars   = fmtNum(cap.raw?.char_count  || cap.raw?.text?.length  || 0);
  const smartChars = fmtNum(cap.smart?.char_count || cap.smart?.text?.length || 0);

  card.innerHTML = `
    <div class="card-header">
      <div class="capsule-name" title="${esc(cap.name)}">${esc(cap.name)}</div>
      <div class="badges-row">
        <span class="badge ${srcClass}">${srcLabel}</span>
        <span class="badge badge-date">${dateStr}</span>
        ${isFirst && allCapsules.length > 1 ? '<span class="badge badge-new">Last Saved</span>' : ''}
      </div>
    </div>

    <div class="card-actions">
      <button class="btn-cap-raw"   data-type="raw"   title="${rawChars} chars">Raw</button>
      <button class="btn-cap-smart" data-type="smart" title="${smartChars} chars">Smart</button>
      <span class="card-divider"></span>
      <button class="btn-card-action btn-send"    title="Send capsule to page widget">Send</button>
      <button class="btn-card-action btn-preview" title="Preview smart summary">Preview</button>
      <div class="export-wrapper">
        <button class="btn-card-action btn-export-toggle" title="Export options">Export</button>
      </div>
      <button class="btn-card-action btn-danger btn-delete" title="Delete capsule">Delete</button>
    </div>

    <div class="cap-pills-hint">Raw = full conversation &nbsp;&middot;&nbsp; Smart = short summary</div>

    <div class="inject-feedback"></div>

    <div class="delete-confirm">
      <span class="confirm-label">Delete this capsule?</span>
      <button class="btn-confirm-yes confirm-yes">Delete</button>
      <button class="btn-ghost confirm-no">Cancel</button>
    </div>

    <div class="summary-preview">
      <div class="summary-label">Smart Summary</div>
      <div class="summary-body"></div>
    </div>
  `;

  const feedbackEl   = card.querySelector('.inject-feedback');
  const previewBtn   = card.querySelector('.btn-preview');
  const previewPane  = card.querySelector('.summary-preview');
  const summaryBody  = card.querySelector('.summary-body');
  const deleteBtn    = card.querySelector('.btn-delete');
  const confirmRow   = card.querySelector('.delete-confirm');
  const exportToggle = card.querySelector('.btn-export-toggle');

  // ── Inject capsule pills ────────────────────────────────────────────────
  card.querySelector('[data-type="raw"]').addEventListener('click', e =>
    onInject(cap, 'raw', card, e.currentTarget)
  );
  card.querySelector('[data-type="smart"]').addEventListener('click', e =>
    onInject(cap, 'smart', card, e.currentTarget)
  );

  // ── Send to widget ──────────────────────────────────────────────────────
  card.querySelector('.btn-send').addEventListener('click', () => onActivate(cap, card));

  // ── Preview ─────────────────────────────────────────────────────────────
  previewBtn.addEventListener('click', () => {
    // E3: close delete confirm if open when preview opens
    if (confirmRow.classList.contains('show')) {
      cancelDelete();
    }
    const open = previewPane.classList.toggle('open');
    previewBtn.classList.toggle('active', open);
    if (open && !summaryBody.dataset.rendered) {
      summaryBody.innerHTML = renderSmartSummary(cap.smart?.text);
      summaryBody.dataset.rendered = '1';
    }
  });

  // ── Export dropdown — uses global portal (see _openExportPortal) ───────────
  // The portal lives on document.body, outside any .capsule-card element, so
  // the card's hover transform never affects the dropdown's position.
  exportToggle.addEventListener('click', e => {
    e.stopPropagation();
    _openExportPortal(exportToggle, cap, feedbackEl);
  });

  // ── Delete (with Escape key + mutual exclusion with preview) ────────────
  let escapeHandler = null;

  function cancelDelete() {
    confirmRow.classList.remove('show');
    deleteBtn.style.display = '';
    if (escapeHandler) {
      document.removeEventListener('keydown', escapeHandler);
      escapeHandler = null;
    }
  }

  deleteBtn.addEventListener('click', () => {
    // E3: close preview if open when delete confirm opens
    previewPane.classList.remove('open');
    previewBtn.classList.remove('active');

    confirmRow.classList.add('show');
    deleteBtn.style.display = 'none';

    // E2: Escape key dismisses delete confirm
    escapeHandler = e => { if (e.key === 'Escape') cancelDelete(); };
    document.addEventListener('keydown', escapeHandler);
  });

  card.querySelector('.confirm-no').addEventListener('click', cancelDelete);
  card.querySelector('.confirm-yes').addEventListener('click', () => { cancelDelete(); onDelete(cap.id, card); });

  return card;
}

// ── Activate → page widget ────────────────────────────────────────────────────
async function onActivate(cap, card) {
  const feedbackEl = card.querySelector('.inject-feedback');
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) throw new Error('No active tab');
    const url = tab.url || '';
    if (!getSiteInfo(url)) {
      showFeedback(feedbackEl, 'Open a supported AI chat first.', false);
      return;
    }
    const payload = { raw: getRawText(cap), smart: cap.smart?.text || '', targetTabId: tab.id };
    await new Promise((res, rej) =>
      chrome.storage.local.set({ activeCapsule: payload }, () =>
        chrome.runtime.lastError ? rej(new Error(chrome.runtime.lastError.message)) : res()
      )
    );
    // storage.onChanged in widget.js shows the widget only on the target tab.
    showFeedback(feedbackEl, 'Widget sent to page.', true);
  } catch (err) {
    showFeedback(feedbackEl, err.message, false);
  }
}

// ── Export: Markdown ──────────────────────────────────────────────────────────
function exportMarkdown(cap) {
  const src  = getSrcLabel(cap.source);
  const date = new Date(cap.created_at).toLocaleString();
  const lines = [
    `# ${cap.name}`, ``,
    `**Source:** ${src}  `, `**Date:** ${date}  `, `**URL:** ${cap.url || 'Unknown'}  `,
    ``, `---`, ``, `## Smart Summary`, ``,
    cap.smart?.text || '_No smart summary available._',
    ``, `---`, ``, `## Full Conversation`, ``
  ];
  if (cap.raw?.messages?.length) {
    cap.raw.messages.forEach(m => {
      lines.push(`### ${m.role === 'user' ? 'You' : 'Assistant'}`);
      lines.push(m.text || '');
      lines.push('');
    });
  } else {
    lines.push(cap.raw?.text || '_No conversation captured._');
  }
  lines.push('---', '_Exported by AIContext Saver_');
  const filename = (cap.name || 'capsule').replace(/[^a-z0-9]/gi, '_').toLowerCase() + '.md';
  downloadBlob(lines.join('\n'), filename, 'text/markdown;charset=utf-8');
}

// ── Export: PDF ───────────────────────────────────────────────────────────────
async function exportPDF(cap, type = 'both') {
  // Use a unique storage key per export so rapid double-clicks on different
  // capsules don't overwrite each other before the export tab reads the data.
  const exportKey = `exportData_${cap.id}_${Date.now()}`;
  await new Promise((res, rej) =>
    chrome.storage.local.set({ [exportKey]: { cap, type } }, () =>
      chrome.runtime.lastError ? rej(new Error(chrome.runtime.lastError.message)) : res()
    )
  );
  chrome.tabs.create({ url: chrome.runtime.getURL('export/export.html') + '?key=' + encodeURIComponent(exportKey) });
}

function downloadBlob(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// ── Inject flow ───────────────────────────────────────────────────────────────
async function onInject(cap, type, card, btnEl) {
  const feedbackEl = card.querySelector('.inject-feedback');
  feedbackEl.className = 'inject-feedback';

  const text = type === 'raw' ? getRawText(cap) : cap.smart?.text;
  if (!text) { showFeedback(feedbackEl, 'No content to inject.', false); return; }

  triggerDropAnim(btnEl, type);

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) throw new Error('No active tab');

    const url = tab.url || '';
    if (!getSiteInfo(url)) {
      showFeedback(feedbackEl, 'Open a supported AI chat first.', false);
      return;
    }

    // C1: show neutral "sending" state immediately — the fly animation takes
    // ~1.5 s before doInject runs. The real success/failure comes back via
    // the callback chain now that the message channel stays open.
    feedbackEl.textContent = 'Sending to chat…';
    feedbackEl.className   = 'inject-feedback show ok';

    const resp = await msgTab(tab.id, { action: 'INJECT_WITH_ANIM', text, type });
    if (resp?.success) {
      fireSuccessBurst(btnEl);
      showFeedback(feedbackEl, `${type === 'raw' ? 'Raw' : 'Smart'} capsule injected.`, true);
    } else {
      showFeedback(feedbackEl, resp?.error || 'Injection failed.', false);
    }
  } catch (err) {
    showFeedback(feedbackEl, err.message, false);
  }
}

// ── Animations ────────────────────────────────────────────────────────────────
function triggerDropAnim(btnEl, type) {
  const rect = btnEl.getBoundingClientRect();
  const pill = document.createElement('div');
  pill.className = `drop-pill is-${type}`;
  pill.textContent = type === 'raw' ? '\u{1F48A}' : '\u{1FAB7}';
  pill.style.cssText = `left:${rect.left + rect.width/2 - 16}px;top:${rect.top + rect.height/2 - 16}px`;
  animLayer.appendChild(pill);
  pill.getBoundingClientRect();
  pill.classList.add('drop-go');
  pill.addEventListener('animationend', () => pill.remove(), { once: true });
}

function fireSuccessBurst(btnEl) {
  const rect  = btnEl.getBoundingClientRect();
  const burst = document.createElement('div');
  burst.className = 'success-burst';
  burst.textContent = '✨';
  burst.style.cssText = `left:${rect.left + rect.width/2 - 10}px;top:${rect.top - 8}px`;
  animLayer.appendChild(burst);
  burst.addEventListener('animationend', () => burst.remove(), { once: true });
}

// ── Smart summary renderer ────────────────────────────────────────────────────
// Handles the new **Bold Topic** format from the updated prompt.
// Also still renders the old numbered ALL-CAPS format for existing capsules.

function renderSmartSummary(text) {
  if (!text || !text.trim()) {
    return `<div class="ss-empty">No smart summary — API may not have been configured when this was saved.</div>`;
  }
  if (text.startsWith('[Smart summary failed')) {
    return `<div class="ss-empty">${esc(text)}</div>`;
  }

  const sections = parseStructuredSummary(text);
  if (sections.length >= 2) {
    return sections.map(s => {
      if (!s.title) {
        // Body-only block (prose between headers)
        return `<div class="ss-raw" style="margin-bottom:5px">${escLines(s.body)}</div>`;
      }
      return `<div class="ss-section">
        <div class="ss-title">${esc(s.title)}</div>
        <div class="ss-body">${escLines(s.body)}</div>
      </div>`;
    }).join('');
  }
  // Fallback: render as-is with line breaks preserved
  return `<div class="ss-raw">${escLines(text)}</div>`;
}

// Escape and convert newlines → <br> so body text wraps naturally in the card.
function escLines(str) {
  return esc(str).replace(/\n/g, '<br>');
}

function parseStructuredSummary(text) {
  const sections = [];
  const lines    = text.split('\n');
  let current    = null;

  // Match either:
  //   **Topic Name**          — new format from updated prompt
  //   1. TOPIC — body start   — old numbered ALL-CAPS format
  const BOLD_HEADER = /^\*\*(.+?)\*\*\s*$/;
  const NUM_HEADER  = /^(\d+)\.?\s{1,3}([A-Z][A-Z &\-\/]+?)\s*[—–\-]{1,3}\s*(.*)/;

  for (const line of lines) {
    const bold = line.match(BOLD_HEADER);
    const num  = line.match(NUM_HEADER);

    if (bold) {
      if (current) sections.push(current);
      current = { title: bold[1].trim(), body: '' };
    } else if (num) {
      if (current) sections.push(current);
      current = { title: `${num[1]}. ${num[2].trim()}`, body: num[3].trim() };
    } else if (current) {
      // Accumulate body lines; preserve blank lines as a single newline break.
      const t = line.trimEnd();
      current.body += (current.body ? '\n' : '') + t;
    } else {
      const t = line.trim();
      if (t) sections.push({ title: null, body: t });
    }
  }
  if (current) sections.push(current);

  // Trim trailing blank lines from each section body
  sections.forEach(s => { s.body = s.body.replace(/\n+$/, '').trim(); });
  return sections;
}

// ── Auto-name from first bold header or first sentence ────────────────────────
function parseGoalFromSummary(text) {
  if (!text) return null;
  // Try new **Topic** format first
  const bold = text.match(/^\*\*(.+?)\*\*/m);
  if (bold) return bold[1].trim().slice(0, 65);
  // Fallback: old numbered format
  const num = text.match(/\d+\.?\s{1,3}GOAL\s*[—–\-]{1,3}\s*(.+)/i);
  if (num) return num[1].trim().slice(0, 65);
  // Last resort: first non-empty line
  const first = text.split('\n').find(l => l.trim().length > 8);
  return first ? first.trim().replace(/^\*+|\*+$/g, '').slice(0, 65) : null;
}

// ── Save flow ─────────────────────────────────────────────────────────────────
async function onSave() {
  if (saving) return;
  saving = true;
  clearStatus();
  setSaving(true);
  showProgress(1);

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) throw new Error('NO_TAB');
    const url      = tab.url || '';
    const siteInfo = getSiteInfo(url);
    if (!siteInfo) throw new Error('WRONG_SITE');
    const source = siteInfo.source;

    const captureResp = await msgTab(tab.id, { action: 'CAPTURE' });
    if (captureResp?.error) {
      // Actual DOM exception — selectors may be broken. Badge to warn user.
      chrome.runtime.sendMessage({ action: 'SELECTOR_WARN', source });
      throw new Error('CAPTURE_FAILED:' + captureResp.error);
    }

    const messages = captureResp?.messages || [];
    if (messages.length === 0) {
      // Empty chat — selectors may be fine, conversation just hasn't started.
      // Only badge if the content script itself threw (which goes via CAPTURE_FAILED).
      throw new Error('NO_MESSAGES');
    }
    // Selectors confirmed working — clear any previous badge warning.
    chrome.runtime.sendMessage({ action: 'SELECTOR_OK' });

    const rawText = messages.map(m => `${m.role.toUpperCase()}: ${m.text}`).join('\n\n');

    showProgress(2);

    let smartSummary = '', smartFailed = false, smartError = '';
    try {
      smartSummary = await summarizeConversation(rawText);
    } catch (err) {
      smartFailed = true;
      smartError  = friendlyApiError(err.message);
    }

    const userInput = capsuleNameInput.value.trim();
    let name = userInput;
    if (!name && !smartFailed && smartSummary) name = parseGoalFromSummary(smartSummary) || '';
    name = name || autoName(source, Date.now());

    showProgress(3);

    const pair = createCapsulePair({
      name, source, url: tab.url, messages,
      smartSummary: smartFailed ? `[Smart summary failed: ${smartError}]` : smartSummary
    });

    // Retry up to 3 times — service worker may have restarted mid-save
    let saveResp;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        saveResp = await msgBackground({ action: 'SAVE_CAPSULE', capsulePair: pair });
        if (saveResp?.success === true) break;
        if (attempt < 3) {
          showProgress(3, `Saving… (retry ${attempt}/3)`);
          await new Promise(r => setTimeout(r, 500));
        }
      } catch (err) {
        if (attempt === 3) throw err;
        showProgress(3, `Saving… (retry ${attempt}/3)`);
        await new Promise(r => setTimeout(r, 500));
      }
    }
    if (saveResp?.success === false) {
      throw new Error(saveResp.error || 'SAVE_FAILED');
    }

    capsuleNameInput.value = '';
    hideProgress();

    // Prepend the new capsule without a full DOM rebuild for O(1) cost.
    allCapsules.unshift(pair);
    emptyState.classList.add('hidden');

    // Remove "Last Saved" badge from the previous first card if any.
    capsuleList.querySelector('.badge-new')?.remove();

    const newCard = buildCard(pair, true);
    newCard.classList.add('card-fresh');
    // If a search is active, hide the new card if it doesn't match the query.
    const activeQuery = searchInput.value.trim().toLowerCase();
    if (activeQuery) {
      const matches =
        newCard.dataset.searchName.includes(activeQuery) ||
        newCard.dataset.searchSmart.includes(activeQuery) ||
        newCard.dataset.searchTags.includes(activeQuery);
      if (!matches) newCard.classList.add('hidden');
    }
    const firstExisting = capsuleList.querySelector('.capsule-card');
    if (firstExisting) capsuleList.insertBefore(newCard, firstExisting);
    else capsuleList.appendChild(newCard);
    capsuleList.scrollTop = 0;

    if (!smartFailed) {
      const previewBtn  = newCard.querySelector('.btn-preview');
      const previewPane = newCard.querySelector('.summary-preview');
      const summaryBody = newCard.querySelector('.summary-body');
      if (previewBtn && previewPane && summaryBody) {
        previewPane.classList.add('open');
        previewBtn.classList.add('active');
        summaryBody.innerHTML = renderSmartSummary(pair.smart?.text);
        summaryBody.dataset.rendered = '1';
      }
    }
    setTimeout(() => newCard.classList.remove('card-fresh'), 4000);

    await checkStorageWarn();

    showStatus(
      smartFailed ? `Saved (smart summary failed: ${smartError})` : 'Both capsules saved.',
      smartFailed ? 'warning' : 'success'
    );
  } catch (err) {
    hideProgress();
    showStatus(friendlySaveError(err.message), 'error');
  } finally {
    saving = false;
    setSaving(false);
  }
}

// ── Delete flow ───────────────────────────────────────────────────────────────
async function onDelete(id, card) {
  try {
    const resp = await msgBackground({ action: 'DELETE_CAPSULE', id });
    if (resp?.success === false) { showStatus(`Delete failed: ${resp.error}`, 'error'); return; }
    allCapsules = allCapsules.filter(c => c.id !== id);
    card.style.transition = 'opacity 0.18s, transform 0.18s';
    card.style.opacity    = '0';
    card.style.transform  = 'scale(0.97)';
    setTimeout(() => {
      card.remove();
      const q = searchInput.value.trim();
      const visibleCount = capsuleList.querySelectorAll('.capsule-card:not(.hidden)').length;
      if (allCapsules.length === 0 || (q && visibleCount === 0)) {
        emptyState.classList.remove('hidden');
      }
    }, 180);
  } catch (err) {
    showStatus(`Delete failed: ${err.message}`, 'error');
  }
}

// ── UI helpers ────────────────────────────────────────────────────────────────
function setSaving(on) {
  saveBtn.disabled = on;
  saveBtnText.classList.toggle('hidden', on);
  saveBtnSpinner.classList.toggle('hidden', !on);
}

function showProgress(activeStep, overrideLabel = '') {
  saveProgress.classList.remove('hidden');
  statusMsg.className = 'status-msg hidden';
  [sp1El, sp2El, sp3El].forEach((el, i) => {
    const step = i + 1;
    const label = (step === activeStep && overrideLabel) ? overrideLabel : el.dataset.label;
    if (step < activeStep)       { el.textContent = `✓ ${el.dataset.label}`; el.className = 'sp-step done'; }
    else if (step === activeStep) { el.textContent = `● ${label}`;            el.className = 'sp-step active'; }
    else                          { el.textContent = `○ ${el.dataset.label}`; el.className = 'sp-step'; }
  });
}

function hideProgress() {
  saveProgress.classList.add('hidden');
  [sp1El, sp2El, sp3El].forEach(el => {
    el.textContent = `○ ${el.dataset.label}`;
    el.className   = 'sp-step';
  });
}

function showStatus(msg, type = 'error') {
  statusMsg.textContent = msg;
  statusMsg.className   = `status-msg ${type}`;
}

function clearStatus() {
  statusMsg.className   = 'status-msg hidden';
  statusMsg.textContent = '';
}

function showFeedback(el, msg, ok) {
  el.textContent = msg;
  el.className   = `inject-feedback show ${ok ? 'ok' : 'err'}`;
  setTimeout(() => { el.className = 'inject-feedback'; el.textContent = ''; }, 3500);
}

function formatDate(ts) {
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtNum(n) { return Number(n).toLocaleString(); }

function esc(str) {
  return String(str || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function friendlySaveError(code) {
  if (code === 'WRONG_SITE')      return 'Open a supported AI chat (ChatGPT, Claude, Gemini, Grok, Copilot, Perplexity, DeepSeek, Mistral, or Meta AI), then Save.';
  if (code === 'NO_MESSAGES')     return 'Nothing to capture. Start a conversation first.';
  if (code === 'NO_TAB')          return 'Could not detect the active tab.';
  if (code === 'STORAGE_FULL')    return 'Storage full. Delete old capsules.';
  if (code?.toLowerCase().includes('quota'))     return 'Storage full. Delete old capsules.';
  if (code === 'SAVE_FAILED')     return 'Save failed — storage may be unavailable. Try again.';
  if (code?.startsWith('CAPTURE_FAILED:')) return code.replace('CAPTURE_FAILED:', '').trim();
  return code || 'Unknown error.';
}

function friendlyApiError(code) {
  if (code === 'API_NOT_CONFIGURED') return 'API not set — open Settings.';
  if (code === 'API_AUTH_FAILED')    return 'Invalid API key.';
  if (code === 'API_RATE_LIMITED')   return 'Rate limited — retry shortly.';
  if (code === 'API_TIMEOUT')        return 'API timed out — check your provider.';
  if (code?.startsWith('API_ERROR:'))return code.replace('API_ERROR:', '').trim();
  return code;
}

// ── Messaging ─────────────────────────────────────────────────────────────────
function msgBackground(msg) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(msg, resp => {
      chrome.runtime.lastError
        ? reject(new Error(chrome.runtime.lastError.message))
        : resolve(resp);
    });
  });
}

async function msgTab(tabId, msg) {
  try {
    return await _sendToTab(tabId, msg);
  } catch (_) {
    try {
      const tab = await chrome.tabs.get(tabId);
      await _injectScriptsForTab(tab);
      await new Promise(r => setTimeout(r, 650));
      return await _sendToTab(tabId, msg);
    } catch (_2) {
      throw new Error('Could not reach the page — please try again.');
    }
  }
}

function _sendToTab(tabId, msg) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, msg, resp => {
      chrome.runtime.lastError
        ? reject(new Error(chrome.runtime.lastError.message))
        : resolve(resp);
    });
  });
}

async function _injectScriptsForTab(tab) {
  const site = getSiteInfo(tab.url || '');
  if (!site) return;
  await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: site.files });
}
