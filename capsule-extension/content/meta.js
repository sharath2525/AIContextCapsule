// content/meta.js — DOM scraper for meta.ai (Manifest V3 content script)
// Listens for CAPTURE message and returns [{role, text}] array.

(function () {
  'use strict';
  if (window.__aicMetaLoaded) return;
  window.__aicMetaLoaded = true;

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

    // Meta AI (meta.ai) — React SPA.
    // NOTE: verify selectors against meta.ai DOM before each release.

    // Strategy 1: aria-label "You" / "Meta AI"
    let turns = document.querySelectorAll('[aria-label="You"], [aria-label="Meta AI"], [aria-label="Assistant"]');
    if (turns.length > 0) {
      turns.forEach(el => {
        const lbl    = el.getAttribute('aria-label');
        const isUser = lbl === 'You';
        const clone  = el.cloneNode(true);
        clone.querySelectorAll('button, [role="button"], svg').forEach(b => b.remove());
        const text = clone.innerText?.trim();
        if (text) messages.push({ role: isUser ? 'user' : 'assistant', text });
      });
      return messages;
    }

    // Strategy 2: data-message-author-role
    turns = document.querySelectorAll('[data-message-author-role]');
    if (turns.length > 0) {
      turns.forEach(el => {
        const role = el.getAttribute('data-message-author-role');
        if (role !== 'user' && role !== 'assistant') return;
        const clone = el.cloneNode(true);
        clone.querySelectorAll('button, [role="button"], svg').forEach(b => b.remove());
        const text = clone.innerText?.trim();
        if (text) messages.push({ role, text });
      });
      return messages;
    }

    // Strategy 3: class fragments
    turns = document.querySelectorAll('[class*="UserMessage"], [class*="userMessage"], [class*="user-message"], [class*="AssistantMessage"], [class*="aiMessage"], [class*="ai-message"]');
    if (turns.length > 0) {
      turns.forEach(el => {
        const cls    = el.className.toLowerCase();
        const isUser = /\buser\b/.test(cls) && !/assistant|ai-/.test(cls);
        const clone  = el.cloneNode(true);
        clone.querySelectorAll('button, [role="button"], svg').forEach(b => b.remove());
        const text = clone.innerText?.trim();
        if (text && text.length > 2) messages.push({ role: isUser ? 'user' : 'assistant', text });
      });
      if (messages.length > 0) return messages;
    }

    // Strategy 4: generic chat thread with alternating blocks.
    // Avoid [class*="bubble"] at the top level — it matches tooltips and badges.
    // Scope to a known conversation container first.
    const thread = document.querySelector('[class*="thread"], [class*="conversation"], [class*="chat"], main');
    if (thread) {
      thread.querySelectorAll('[class*="message"], [class*="Message"]').forEach(el => {
        const cls    = (el.className + ' ' + (el.getAttribute('data-testid') || '')).toLowerCase();
        const isUser = /\buser\b|\byou\b|\bme\b/.test(cls);
        const clone  = el.cloneNode(true);
        clone.querySelectorAll('button, [role="button"], svg').forEach(b => b.remove());
        const text = clone.innerText?.trim();
        if (text && text.length > 2) messages.push({ role: isUser ? 'user' : 'assistant', text });
      });
    }

    return messages;
  }
})();
