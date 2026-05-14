// content/mistral.js — DOM scraper for chat.mistral.ai (Manifest V3 content script)
// Listens for CAPTURE message and returns [{role, text}] array.

(function () {
  'use strict';
  if (window.__aicMistralLoaded) return;
  window.__aicMistralLoaded = true;

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

    // Mistral Le Chat (chat.mistral.ai) — React SPA.
    // NOTE: verify selectors against chat.mistral.ai DOM before each release.

    // Strategy 1: data-role or data-message-author-role
    // Only push elements whose role attribute is explicitly "user", "human", or "assistant"
    // so we don't capture navigation landmarks (data-role="navigation" etc.).
    let turns = document.querySelectorAll('[data-message-author-role], [data-role], [data-author]');
    if (turns.length > 0) {
      turns.forEach(el => {
        const raw  = el.getAttribute('data-message-author-role') || el.getAttribute('data-role') || el.getAttribute('data-author') || '';
        const isKnownRole = /^(user|human|assistant|bot)$/i.test(raw);
        if (!isKnownRole) return;
        const role = /^user$|^human$/i.test(raw) ? 'user' : 'assistant';
        const clone = el.cloneNode(true);
        clone.querySelectorAll('button, [role="button"], svg').forEach(b => b.remove());
        const text = clone.innerText?.trim();
        if (text) messages.push({ role, text });
      });
      if (messages.length > 0) return messages;
    }

    // Strategy 2: class-based UserMessage / AssistantMessage
    turns = document.querySelectorAll('[class*="UserMessage"], [class*="userMessage"], [class*="user-message"], [class*="AssistantMessage"], [class*="assistantMessage"], [class*="assistant-message"]');
    if (turns.length > 0) {
      turns.forEach(el => {
        const cls    = el.className.toLowerCase();
        const isUser = /user/.test(cls) && !/assistant/.test(cls);
        const clone  = el.cloneNode(true);
        clone.querySelectorAll('button, [role="button"], svg').forEach(b => b.remove());
        const text = clone.innerText?.trim();
        if (text) messages.push({ role: isUser ? 'user' : 'assistant', text });
      });
      if (messages.length > 0) return messages;
    }

    // Strategy 3: generic message containers in conversation wrapper
    const container = document.querySelector('[class*="conversation"], [class*="messages"], [class*="chat-thread"], main');
    if (container) {
      container.querySelectorAll('[class*="message"], [class*="Message"]').forEach(el => {
        const cls    = (el.className + ' ' + (el.parentElement?.className || '')).toLowerCase();
        const isUser = /\buser\b/.test(cls) && !/assistant/.test(cls);
        const clone  = el.cloneNode(true);
        clone.querySelectorAll('button, [role="button"], svg').forEach(b => b.remove());
        const text = clone.innerText?.trim();
        if (text && text.length > 2) messages.push({ role: isUser ? 'user' : 'assistant', text });
      });
    }

    return messages;
  }
})();
