// content/gemini.js — DOM scraper for gemini.google.com (Manifest V3 content script)
// Listens for CAPTURE message and returns [{role, text}] array.

(function () {
  'use strict';
  if (window.__aicGeminiLoaded) return;
  window.__aicGeminiLoaded = true;

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

    // Gemini uses Angular custom elements. NOTE: verify against gemini.google.com DOM before each release.

    // Strategy 1: Angular custom elements user-prompt / model-response (primary)
    const turns = document.querySelectorAll('user-prompt, model-response');
    if (turns.length > 0) {
      turns.forEach(el => {
        const isUser = el.tagName.toLowerCase() === 'user-prompt';
        const clone  = el.cloneNode(true);
        clone.querySelectorAll('button, [role="button"], mat-icon, .action-buttons, .buttons-container, .response-actions').forEach(b => b.remove());
        const text = clone.innerText?.trim();
        if (text) messages.push({ role: isUser ? 'user' : 'assistant', text });
      });
      return messages;
    }

    // Strategy 2: data-role attributes (some Gemini builds)
    const roleEls = document.querySelectorAll('[data-role="user"], [data-role="assistant"], [data-role="model"]');
    if (roleEls.length > 0) {
      roleEls.forEach(el => {
        const r    = el.getAttribute('data-role');
        const role = r === 'user' ? 'user' : 'assistant';
        const clone = el.cloneNode(true);
        clone.querySelectorAll('button, [role="button"], mat-icon').forEach(b => b.remove());
        const text = clone.innerText?.trim();
        if (text) messages.push({ role, text });
      });
      return messages;
    }

    // Strategy 3: class fragments .user-query / .model-response
    const s3arr = Array.from(document.querySelectorAll('[class*="user-query"], [class*="model-response"]'));
    const s3deduped = s3arr.filter(el => !s3arr.some(other => other !== el && other.contains(el)));
    s3deduped.forEach(el => {
      const cls    = el.className || '';
      const isUser = cls.includes('user-query');
      const clone  = el.cloneNode(true);
      clone.querySelectorAll('button, [role="button"]').forEach(b => b.remove());
      const text = clone.innerText?.trim();
      if (text) messages.push({ role: isUser ? 'user' : 'assistant', text });
    });

    return messages;
  }
})();
