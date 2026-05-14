// content/claude.js — DOM scraper for claude.ai (Manifest V3 content script)
// Listens for CAPTURE message and returns [{role, text}] array.

(function () {
  'use strict';
  if (window.__aicClaudeLoaded) return;
  window.__aicClaudeLoaded = true;

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (sender.id !== chrome.runtime.id) return;
    if (message.action === 'CAPTURE') {
      try {
        const messages = captureMessages();
        sendResponse({ messages });
      } catch (err) {
        sendResponse({
          messages: [],
          error: `Capture failed — the AI site may have updated. Try refreshing. (${err.message})`
        });
      }
      return true;
    }
  });

  function captureMessages() {
    const messages = [];

    // H3: '.font-claude-response' is a Tailwind JIT class that can change
    // between Anthropic deploys. '[class*="claude-response"]' catches renames.
    // NOTE: verify these selectors against claude.ai DOM before each release.
    const combined = document.querySelectorAll(
      '[data-testid="user-message"], .font-claude-response, [class*="claude-response"]'
    );

    // Deduplicate: remove any element that is a descendant of another matched element
    // to prevent double-capture when broad selectors match nested nodes.
    const allEls = Array.from(combined);
    const dedupedEls = allEls.filter(el =>
      !allEls.some(other => other !== el && other.contains(el))
    );

    dedupedEls.forEach(el => {
      const isUser = el.hasAttribute('data-testid') && el.getAttribute('data-testid') === 'user-message';
      const role = isUser ? 'user' : 'assistant';
      const text = el.innerText?.trim();
      if (text) {
        messages.push({ role, text });
      }
    });

    // Fallback: if no AI messages were found, try scoped .prose inside the
    // conversation turn container only (avoids capturing sidebar / UI chrome).
    const hasAssistant = messages.some(m => m.role === 'assistant');
    if (!hasAssistant) {
      const allProseEls = Array.from(document.querySelectorAll(
        '[data-testid^="conversation-turn"] .prose, ' +
        '.font-claude-response .prose'
      ));
      // Keep only outermost .prose elements — a single turn may contain nested
      // .prose children (code blocks, inline code) which would each be captured
      // as separate messages without this guard.
      const outerProseEls = allProseEls.filter(el =>
        !allProseEls.some(other => other !== el && other.contains(el))
      );
      outerProseEls.forEach(el => {
        const text = el.innerText?.trim();
        if (text) messages.push({ role: 'assistant', text });
      });
    }

    return messages;
  }
})();
