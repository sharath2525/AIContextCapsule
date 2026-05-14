// utils/capsule.js — CapsulePair data model factory

/**
 * Creates a CapsulePair: one raw (red) + one smart (blue) capsule.
 * @param {object} opts
 * @param {string} opts.name        — User-given or auto-generated name
 * @param {string} opts.source      — 'chatgpt' | 'claude'
 * @param {string} opts.url         — Page URL at time of capture
 * @param {Array}  opts.messages    — [{role: 'user'|'assistant', text: '...'}]
 * @param {string} opts.smartSummary — AI-generated structured brief
 * @returns {CapsulePair}
 */
/**
 * Compute raw conversation text from a capsule.
 * New capsules store only messages[]; old capsules have raw.text.
 * @param {CapsulePair} cap
 * @returns {string}
 */
const _rawTextCache = new WeakMap();
export function getRawText(cap) {
  if (!cap) return '';
  if (_rawTextCache.has(cap)) return _rawTextCache.get(cap);
  let result = '';
  if (cap?.raw?.text) result = cap.raw.text;
  else if (cap?.raw?.messages?.length) result = cap.raw.messages.map(m => `${m.role.toUpperCase()}: ${m.text}`).join('\n\n');
  _rawTextCache.set(cap, result);
  return result;
}

export function createCapsulePair({ name, source, url, messages, smartSummary }) {
  const id = `cap_${Date.now()}_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
  const rawText = messages
    .map(m => `${m.role.toUpperCase()}: ${m.text}`)
    .join('\n\n');

  const base = {
    id,
    name,
    source,
    url,
    created_at: Date.now(),
    schema_version: 1
  };

  return {
    ...base,
    raw: {
      type: 'raw',
      color: 'red',
      messages: messages,
      // text is intentionally omitted — computed from messages via getRawText()
      // to halve storage footprint (previously stored both messages[] and rawText).
      char_count: rawText.length
    },
    smart: {
      type: 'smart',
      color: 'blue',
      text: smartSummary,
      char_count: (smartSummary && !smartSummary.startsWith('[Smart summary failed')) ? smartSummary.length : 0
    },
    tags: []
  };
}

/**
 * Auto-generate a capsule name from source + timestamp.
 * Example: "ChatGPT Capsule — May 3 2026, 10:42am"
 */
const SOURCE_LABELS = {
  chatgpt:    'ChatGPT',
  claude:     'Claude',
  gemini:     'Gemini',
  grok:       'Grok',
  copilot:    'Copilot',
  perplexity: 'Perplexity',
  deepseek:   'DeepSeek',
  mistral:    'Mistral',
  meta:       'Meta AI',
};

export function autoName(source, timestamp = Date.now()) {
  const site = SOURCE_LABELS[source] || source || 'AI';
  const d = new Date(timestamp);
  const dateStr = d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
  const timeStr = d.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit'
  }).toLowerCase();
  return `${site} Capsule — ${dateStr}, ${timeStr}`;
}
