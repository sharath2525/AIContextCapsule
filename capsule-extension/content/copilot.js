// content/copilot.js — DOM scraper for copilot.microsoft.com (Manifest V3 content script)
// Listens for CAPTURE message and returns [{role, text}] array.
// NOTE: Copilot uses some web components with shadow DOM which cannot be traversed
// by content scripts. Light-DOM selectors below cover most chat content.

(function () {
  'use strict';
  if (window.__aicCopilotLoaded) return;
  window.__aicCopilotLoaded = true;

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

    // Microsoft Copilot uses deep shadow DOM for its core chat UI. Content
    // scripts cannot traverse shadow roots, so selectors below only reach
    // light-DOM elements. If capture returns empty, throw a descriptive error
    // so the popup can surface it to the user instead of showing a generic
    // "nothing to capture" message.

    // Microsoft Copilot — React SPA. NOTE: verify selectors before each release.

    // Strategy 1: data-author-role or data-message-author-role
    let turns = document.querySelectorAll('[data-author-role], [data-message-author-role]');
    if (turns.length > 0) {
      turns.forEach(el => {
        const raw  = el.getAttribute('data-author-role') || el.getAttribute('data-message-author-role') || '';
        const role = /^user$|^human$/i.test(raw) ? 'user' : 'assistant';
        const clone = el.cloneNode(true);
        clone.querySelectorAll('button, [role="button"], svg, .feedback-container, .reaction-bar').forEach(b => b.remove());
        const text = clone.innerText?.trim();
        if (text) messages.push({ role, text });
      });
      if (messages.length > 0) return messages;
    }

    // Strategy 2: aria-label "You said" / "Copilot said"
    turns = document.querySelectorAll('[aria-label*="You said"], [aria-label*="Copilot said"], [aria-label*="User"], [aria-label*="Assistant"]');
    if (turns.length > 0) {
      turns.forEach(el => {
        const lbl    = (el.getAttribute('aria-label') || '').toLowerCase();
        const isUser = lbl.includes('you said') || /\buser\b/.test(lbl);
        const clone  = el.cloneNode(true);
        clone.querySelectorAll('button, [role="button"]').forEach(b => b.remove());
        const text = clone.innerText?.trim();
        if (text) messages.push({ role: isUser ? 'user' : 'assistant', text });
      });
      if (messages.length > 0) return messages;
    }

    // Strategy 3: class name fragments user/bot
    turns = document.querySelectorAll('[class*="userMessage"], [class*="UserMessage"], [class*="botMessage"], [class*="BotMessage"], [class*="user-turn"], [class*="bot-turn"]');
    if (turns.length > 0) {
      turns.forEach(el => {
        const cls    = el.className || '';
        const isUser = /user/i.test(cls) && !/bot|assistant|copilot/i.test(cls);
        const clone  = el.cloneNode(true);
        clone.querySelectorAll('button, [role="button"], svg').forEach(b => b.remove());
        const text = clone.innerText?.trim();
        if (text) messages.push({ role: isUser ? 'user' : 'assistant', text });
      });
    }

    if (messages.length === 0) {
      throw new Error(
        'Copilot conversations cannot be captured — Microsoft Copilot uses shadow DOM that browser security prevents content scripts from reading. Try ChatGPT, Claude, Gemini, or another supported platform.'
      );
    }

    return messages;
  }
})();
