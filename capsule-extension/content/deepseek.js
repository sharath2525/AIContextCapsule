// content/deepseek.js — DOM scraper for chat.deepseek.com (Manifest V3 content script)
// Listens for CAPTURE message and returns [{role, text}] array.

(function () {
  'use strict';
  if (window.__aicDeepSeekLoaded) return;
  window.__aicDeepSeekLoaded = true;

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

    // DeepSeek Chat (chat.deepseek.com) — React SPA.
    // NOTE: verify selectors against chat.deepseek.com DOM before each release.

    // Strategy 1: data-message-author-role (OpenAI-compatible)
    let turns = document.querySelectorAll('[data-message-author-role]');
    if (turns.length > 0) {
      turns.forEach(el => {
        const role = el.getAttribute('data-message-author-role');
        if (role !== 'user' && role !== 'assistant') return;
        const clone = el.cloneNode(true);
        clone.querySelectorAll('button, [role="button"], svg, .copy-btn, .action-bar').forEach(b => b.remove());
        const text = clone.innerText?.trim();
        if (text) messages.push({ role, text });
      });
      return messages;
    }

    // Strategy 2: DeepSeek class-name fragments
    // DeepSeek has been observed using classes like "fkk..." (hashed) but also
    // readable names in some builds.
    turns = document.querySelectorAll('[class*="user-message"], [class*="UserMessage"], [class*="human-message"], [class*="HumanMessage"], [class*="assistant-message"], [class*="AssistantMessage"], [class*="ai-message"]');
    if (turns.length > 0) {
      const arr = Array.from(turns);
      const deduped = arr.filter(el => !arr.some(other => other !== el && other.contains(el)));
      deduped.forEach(el => {
        const cls    = el.className.toLowerCase();
        const isUser = /\buser\b|\bhuman\b/.test(cls) && !/assistant|ai-/.test(cls);
        const clone  = el.cloneNode(true);
        clone.querySelectorAll('button, [role="button"], svg, .copy-btn').forEach(b => b.remove());
        const text = clone.innerText?.trim();
        if (text) messages.push({ role: isUser ? 'user' : 'assistant', text });
      });
      if (messages.length > 0) return messages;
    }

    // Strategy 3: role="listitem" in message list with positional class indicators
    const chatList = document.querySelector('[class*="chat-list"], [class*="message-list"], [class*="conversation"]');
    if (chatList) {
      const arr = Array.from(chatList.querySelectorAll('[class*="message"], [class*="Message"]'));
      const deduped = arr.filter(el => !arr.some(other => other !== el && other.contains(el)));
      deduped.forEach(el => {
        const cls    = (el.className + ' ' + (el.getAttribute('data-testid') || '')).toLowerCase();
        const isUser = /\buser\b|\bhuman\b|\bquestion\b/.test(cls);
        const clone  = el.cloneNode(true);
        clone.querySelectorAll('button, [role="button"], svg').forEach(b => b.remove());
        const text = clone.innerText?.trim();
        if (text && text.length > 2) messages.push({ role: isUser ? 'user' : 'assistant', text });
      });
    }

    return messages;
  }
})();
