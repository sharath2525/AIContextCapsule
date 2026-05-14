// utils/summarize.js — Universal OpenAI-compatible API caller
// Supports: NVIDIA Build, Groq, OpenRouter, Anthropic, OpenAI, Ollama

import { getSettings } from './storage.js';

// ── Summarization system prompt ───────────────────────────────────────────────
// Goal: produce a COMPLETE picture of the entire conversation so a new AI
// session can pick up with full context — covering every topic discussed,
// every decision made, and the final state, regardless of domain.

const SUMMARIZATION_SYSTEM_PROMPT = `You are a conversation summarizer. Your output will be pasted into a new AI chat so it can continue with full context — as if it had been present from the start.

YOUR JOB: Capture everything of substance that was discussed. Do not restrict yourself to technical topics — cover whatever was actually in the conversation: creative work, analysis, planning, debugging, writing, research, decisions, ideas, or any mix.

WHAT TO ALWAYS INCLUDE:
- Every distinct topic or question raised, even briefly
- The conclusion or answer for each topic (if one was reached)
- What was decided and why (the reasoning matters as much as the outcome)
- What was tried and didn't work, and why it was abandoned
- The state of things at the end: what is done, what is pending, what is unresolved
- Specific values that must not be paraphrased: names, numbers, URLs, file paths, version numbers, commands, variable names, API names

WHAT TO SKIP:
- Greetings, sign-offs, and filler ("sure!", "great question")
- Exact repetitions of a point already captured
- Abandoned tangents with no outcome

FORMAT RULES:
- Group output by topic — each topic gets its own short paragraph or bullet block
- Start each topic with a bold label on its own line: **Topic Name**
- Under it, state what was discussed and what was concluded
- If something is unresolved, note it explicitly: "(unresolved)"
- For code or commands: include exact names and what they do; include the full snippet only if it is under 8 lines
- No preamble, no "here is a summary" — begin immediately with the first topic
- Be thorough: a longer complete summary is far better than a short incomplete one

IMPORTANT: Cover ALL topics from the conversation, in the order they appeared. Do not skip any topic because it seems minor or off-topic. The person reading this summary was not in the original chat — they need the full picture.`;

// ── Adaptive token budget ─────────────────────────────────────────────────────
// Target ~60% of the input character count converted to tokens, clamped
// between 400 (floor for any real content) and 3000 (ceiling most APIs support).
// Previous ceiling of 1500 was too small for conversations with 5+ topics.
function adaptiveMaxTokens(rawText) {
  // ~3.5 chars per token on average
  const target = Math.floor((rawText.length * 0.60) / 3.5);
  return Math.max(400, Math.min(3000, target));
}

// ── Input truncation ──────────────────────────────────────────────────────────
// Most free-tier APIs cap context at ~8k tokens (~32k chars).
// Strategy: keep the full conversation when it fits. When truncation is
// needed, preserve a larger middle window by splitting into thirds rather
// than just start+end — the middle is where most of the actual work lives.
const MAX_INPUT_CHARS = 30_000;

function truncateConversation(text) {
  if (text.length <= MAX_INPUT_CHARS) return text;

  // Three-way split: keep first third, middle third, last third
  // so context from all parts of the conversation survives.
  const third = Math.floor(MAX_INPUT_CHARS / 3);
  const midStart = Math.floor(text.length / 2) - Math.floor(third / 2);

  return (
    text.slice(0, third) +
    '\n\n[… earlier portion condensed …]\n\n' +
    text.slice(midStart, midStart + third) +
    '\n\n[… later portion condensed …]\n\n' +
    text.slice(text.length - third)
  );
}

// ── Main summarizer ───────────────────────────────────────────────────────────
/**
 * Calls any OpenAI-compatible /v1/chat/completions endpoint.
 * @param {string} conversationText — Full raw conversation string
 * @returns {Promise<string>} AI-generated summary
 * @throws 'API_NOT_CONFIGURED' | 'API_AUTH_FAILED' | 'API_RATE_LIMITED' | 'API_TIMEOUT' | 'API_ERROR: ...'
 */
export async function summarizeConversation(conversationText) {
  const { apiUrl, apiKey, apiModel } = await getSettings();

  if (!apiUrl || !apiKey || !apiModel) {
    throw new Error('API_NOT_CONFIGURED');
  }

  const safeText = truncateConversation(conversationText);
  const endpoint = `${apiUrl.replace(/\/$/, '')}/chat/completions`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60_000); // 60s for longer outputs

  let response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: apiModel,
        max_tokens: adaptiveMaxTokens(safeText),
        messages: [
          { role: 'system', content: SUMMARIZATION_SYSTEM_PROMPT },
          { role: 'user',   content: `Summarize this conversation:\n\n${safeText}` }
        ]
      })
    });
  } catch (networkErr) {
    if (networkErr.name === 'AbortError') {
      throw new Error('API_TIMEOUT');
    }
    throw new Error(`API_ERROR: Network failure — ${networkErr.message}`);
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    let errBody = '';
    try { errBody = await response.text(); } catch (_) {}

    if (response.status === 401 || response.status === 403) throw new Error('API_AUTH_FAILED');
    if (response.status === 429) throw new Error('API_RATE_LIMITED');
    // Strip any credential patterns echoed back in error bodies.
    const safeBody = errBody.replace(/(authorization[^\n\r]*|bearer\s+\S+|api[-_]?key[^\n\r]*)/gi, '[redacted]');
    throw new Error(`API_ERROR: ${response.status} — ${safeBody.slice(0, 200)}`);
  }

  let data;
  try {
    data = await response.json();
  } catch (_) {
    throw new Error('API_ERROR: Could not parse response JSON');
  }

  const content = data?.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('API_ERROR: Empty response from API');
  }

  return content;
}

// ── Connection test ───────────────────────────────────────────────────────────
/**
 * Quick connectivity test — sends a minimal prompt.
 * Accepts optional (url, key, model) so the settings page can test
 * without first persisting values to storage.
 * Returns { ok: true } or { ok: false, error: string }
 */
export async function testConnection(url, key, model) {
  if (!url || !key || !model) {
    const stored = await getSettings();
    url   = url   || stored.apiUrl;
    key   = key   || stored.apiKey;
    model = model || stored.apiModel;
  }

  if (!url || !key || !model) {
    return { ok: false, error: 'Fill in all three fields first.' };
  }

  const endpoint = `${url.replace(/\/$/, '')}/chat/completions`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${key}`
      },
      body: JSON.stringify({
        model,
        max_tokens: 10,
        messages: [{ role: 'user', content: 'Say: OK' }]
      })
    });

    if (response.status === 401 || response.status === 403) {
      return { ok: false, error: 'Authentication failed — check your API key.' };
    }
    if (response.status === 429) {
      return { ok: false, error: 'Rate limit hit — API key works but is throttled.' };
    }
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      return { ok: false, error: `HTTP ${response.status}: ${body.slice(0, 120)}` };
    }

    const data = await response.json();
    if (data?.choices?.[0]?.message?.content) {
      return { ok: true };
    }
    return { ok: false, error: 'Unexpected response shape from API.' };
  } catch (err) {
    if (err.name === 'AbortError') {
      return { ok: false, error: 'Connection timed out — server did not respond.' };
    }
    return { ok: false, error: `Network error: ${err.message}` };
  } finally {
    clearTimeout(timer);
  }
}
