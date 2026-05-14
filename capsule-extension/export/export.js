// export/export.js — PDF export renderer for AIContext Saver

const ICONS = ['🎯','✅','❌','🔒','🛠️','📊','✍️','💭','📦','❓','➡️'];

// All 9 supported platforms — mirrors SOURCE_LABELS in capsule.js
const SOURCE_LABELS = {
  chatgpt:    { label: 'ChatGPT',    badgeClass: 'badge-gpt'  },
  claude:     { label: 'Claude',     badgeClass: 'badge-claude' },
  gemini:     { label: 'Gemini',     badgeClass: 'badge-gemini' },
  grok:       { label: 'Grok',       badgeClass: 'badge-grok'  },
  copilot:    { label: 'Copilot',    badgeClass: 'badge-copilot' },
  perplexity: { label: 'Perplexity', badgeClass: 'badge-perplexity' },
  deepseek:   { label: 'DeepSeek',   badgeClass: 'badge-deepseek' },
  mistral:    { label: 'Mistral',    badgeClass: 'badge-mistral' },
  meta:       { label: 'Meta AI',    badgeClass: 'badge-meta'  },
};

function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function parseStructured(text) {
  const lines = text.split('\n');
  const sections = [];
  let cur = null;
  // Handles both new **Bold Topic** format and old numbered ALL-CAPS format
  const BOLD = /^\*\*(.+?)\*\*\s*$/;
  const NUM  = /^(\d+)\.?\s{1,3}([A-Z][A-Z &\-\/]+?)\s*[—–\-]{1,3}\s*(.*)/;
  for (const l of lines) {
    const bold = l.match(BOLD);
    const num  = l.match(NUM);
    if (bold) {
      if (cur) sections.push(cur);
      cur = { title: bold[1].trim(), body: '' };
    } else if (num) {
      if (cur) sections.push(cur);
      cur = { title: `${num[1]}. ${num[2].trim()}`, body: num[3].trim() };
    } else if (cur) {
      const t = l.trimEnd();
      cur.body += (cur.body ? '\n' : '') + t;
    }
  }
  if (cur) sections.push(cur);
  sections.forEach(s => { s.body = (s.body || '').replace(/\n+$/, '').trim(); });
  return sections;
}

function renderSmart(text) {
  if (!text || text.startsWith('[Smart summary failed')) {
    return `<div class="section-body">${esc(text || 'No smart summary.')}</div>`;
  }
  const sections = parseStructured(text);
  if (sections.length >= 2) {
    return '<div style="padding:14px 16px">' +
      sections.map((s, i) => {
        const icon = ICONS[i] || '•';
        return `<div class="ss-item">
          <div class="ss-item-title">${icon} ${esc(s.title)}</div>
          <div class="ss-item-body" style="white-space:pre-wrap">${esc(s.body)}</div>
        </div>`;
      }).join('') + '</div>';
  }
  return `<div class="section-body" style="white-space:pre-wrap">${esc(text)}</div>`;
}

// Renders the raw conversation. Falls back to raw.text for legacy capsules
// that were saved before the v3 schema change (messages[] did not exist yet).
function renderMessages(messages, fallbackText) {
  if (messages && messages.length > 0) {
    return '<div style="padding:14px 16px">' +
      messages.map((m, i) => {
        const roleClass = m.role === 'user' ? 'role-user' : 'role-assistant';
        const roleIcon  = m.role === 'user' ? '👤' : '🤖';
        const roleLabel = m.role === 'user' ? 'You' : 'Assistant';
        return `<div class="msg">
          <div class="msg-role ${roleClass}">${roleIcon} ${roleLabel}</div>
          <div class="msg-text">${esc(m.text || '')}</div>
          ${i < messages.length - 1 ? '<hr class="msg-divider">' : ''}
        </div>`;
      }).join('') + '</div>';
  }
  // Legacy capsule: raw.text is a pre-joined string, no messages array.
  if (fallbackText) {
    return `<div class="section-body" style="white-space:pre-wrap">${esc(fallbackText)}</div>`;
  }
  return '<div class="section-body">No messages captured.</div>';
}

function renderDoc(cap, type) {
  const srcInfo = SOURCE_LABELS[cap.source] || { label: cap.source || 'Unknown', badgeClass: 'badge-gpt' };
  const date   = new Date(cap.created_at).toLocaleString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit'
  });
  const rawChars   = (cap.raw?.char_count  || cap.raw?.text?.length  || 0).toLocaleString();
  const smartChars = (cap.smart?.char_count || cap.smart?.text?.length || 0).toLocaleString();

  const smartSection = type !== 'raw' ? `
    <div class="section">
      <div class="section-head smart">🔵 Smart Summary <span style="font-weight:400;font-size:11px;margin-left:auto;color:#6b6b8a">${smartChars} chars</span></div>
      ${renderSmart(cap.smart?.text)}
    </div>` : '';

  const rawSection = type !== 'smart' ? `
    <div class="section">
      <div class="section-head raw">🔴 Full Conversation <span style="font-weight:400;font-size:11px;margin-left:auto;color:#6b6b8a">${rawChars} chars</span></div>
      ${renderMessages(cap.raw?.messages, cap.raw?.text)}
    </div>` : '';

  return `
    <div class="doc-header">
      <div class="doc-logo">
        <div class="logo-box"><img src="../icons/icon48.png" width="28" height="28" style="border-radius:5px;display:block" onerror="this.outerHTML='🫧'"/></div>
        <div>
          <div class="logo-text">AIContext Saver</div>
          <div class="logo-sub">Capsule Export</div>
        </div>
      </div>
      <div class="doc-title">${esc(cap.name)}</div>
      <div class="meta-grid">
        <span class="meta-badge ${srcInfo.badgeClass}">${srcInfo.label}</span>
        <span class="meta-badge badge-date">📅 ${esc(date)}</span>
        <span class="meta-badge badge-chars">📊 ${rawChars} raw chars</span>
      </div>
    </div>

    ${smartSection}
    ${rawSection}

    <div class="doc-footer">
      Exported by AIContext Saver · ${new Date().toLocaleDateString()}
      ${cap.url ? ' · ' + esc(cap.url) : ''}
    </div>
  `;
}

// ── Load data from storage ──────────────────────────────────────────────────
// Supports unique per-export keys (exportData_<id>_<ts>) via ?key= param
// so rapid double-clicks on different capsules don't overwrite each other.
document.addEventListener('DOMContentLoaded', () => {
  if (typeof chrome === 'undefined' || !chrome.storage) {
    document.getElementById('loading').textContent = '⚠️ No extension context — open this page from the extension.';
    return;
  }
  const urlKey = new URLSearchParams(location.search).get('key') || 'exportData';
  chrome.storage.local.get([urlKey], (res) => {
    const { cap, type } = res[urlKey] || {};
    // Clean up immediately — storage is not a temp file system
    chrome.storage.local.remove([urlKey]);
    if (!cap) {
      document.getElementById('loading').textContent = '⚠️ No export data found. Use the export button in the extension popup.';
      return;
    }
    document.getElementById('loading').style.display = 'none';
    const el = document.getElementById('content');
    el.style.display = 'block';
    el.innerHTML = renderDoc(cap, type || 'both');
    document.title = `${cap.name} — AIContext Saver`;
  });
});
