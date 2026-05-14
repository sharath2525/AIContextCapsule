// content/grok.js — DOM scraper for grok.com (Manifest V3 content script)
// Listens for CAPTURE message and returns [{role, text}] array.

(function () {
  'use strict';
  if (window.__aicGrokLoaded) return;
  window.__aicGrokLoaded = true;

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

    // Grok (grok.com) — React SPA. NOTE: verify selectors before each release.

    // Strategy 1: data-message-author-role (OpenAI-compatible attribute)
    let turns = document.querySelectorAll('[data-message-author-role]');
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

    // Strategy 2: aria-label "You" / "Grok"
    turns = document.querySelectorAll('[aria-label="You"], [aria-label="Grok"], [aria-label="Assistant"]');
    if (turns.length > 0) {
      turns.forEach(el => {
        const lbl  = el.getAttribute('aria-label');
        const role = lbl === 'You' ? 'user' : 'assistant';
        const clone = el.cloneNode(true);
        clone.querySelectorAll('button, [role="button"], svg').forEach(b => b.remove());
        const text = clone.innerText?.trim();
        if (text) messages.push({ role, text });
      });
      return messages;
    }

    // Strategy 3: class-based — look for human/bot fragments in class names
    turns = document.querySelectorAll('[class*="message-bubble"], [class*="UserMessage"], [class*="HumanMessage"], [class*="AssistantMessage"], [class*="BotMessage"]');
    if (turns.length > 0) {
      turns.forEach(el => {
        const cls    = (el.className + ' ' + (el.parentElement?.className || '')).toLowerCase();
        const isUser = /\bhuman\b|\buser\b|\bmine\b|\boutgoing\b/.test(cls);
        const clone  = el.cloneNode(true);
        clone.querySelectorAll('button, [role="button"], svg').forEach(b => b.remove());
        const text = clone.innerText?.trim();
        if (text) messages.push({ role: isUser ? 'user' : 'assistant', text });
      });
      return messages;
    }

    // Strategy 4: generic message containers inside main content.
    // Deduplicate by skipping any element that is a descendant of another matched
    // element — prevents parent+child double-capture when both share "message" in their class.
    const main = document.querySelector('main, [role="main"]');
    if (main) {
      const candidates = Array.from(main.querySelectorAll('[class*="message"], [class*="Message"]'));
      const deduped = candidates.filter(el =>
        !candidates.some(other => other !== el && other.contains(el))
      );
      deduped.forEach(el => {
        const cls    = (el.className + ' ' + (el.getAttribute('data-testid') || '')).toLowerCase();
        const isUser = /\buser\b|\bhuman\b|\bme\b/.test(cls);
        const clone  = el.cloneNode(true);
        clone.querySelectorAll('button, [role="button"], svg').forEach(b => b.remove());
        const text = clone.innerText?.trim();
        if (text && text.length > 2) messages.push({ role: isUser ? 'user' : 'assistant', text });
      });
    }

    return messages;
  }
})();
