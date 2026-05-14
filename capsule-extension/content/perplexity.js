// content/perplexity.js — DOM scraper for perplexity.ai (Manifest V3 content script)
// Listens for CAPTURE message and returns [{role, text}] array.

(function () {
  'use strict';
  if (window.__aicPerplexityLoaded) return;
  window.__aicPerplexityLoaded = true;

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

    // Perplexity.ai — React SPA with a Q&A thread structure.
    // NOTE: verify selectors against perplexity.ai DOM before each release.

    // Strategy 1: data-testid or data-role attributes
    let turns = document.querySelectorAll('[data-testid*="user-message"], [data-testid*="answer"], [data-role]');
    if (turns.length > 0) {
      turns.forEach(el => {
        const tid  = el.getAttribute('data-testid') || '';
        const dr   = el.getAttribute('data-role')   || '';
        // Skip non-chat elements (navigation, search regions, etc.)
        if (dr && !/^(user|human|assistant|bot|ai)$/i.test(dr)) return;
        const isUser = /user|human/i.test(tid + dr);
        const clone  = el.cloneNode(true);
        clone.querySelectorAll('button, [role="button"], svg, .feedback-row, .copy-button').forEach(b => b.remove());
        const text = clone.innerText?.trim();
        if (text && text.length > 2) messages.push({ role: isUser ? 'user' : 'assistant', text });
      });
      if (messages.length > 0) return messages;
    }

    // Strategy 2: class-based UserMessage / AnswerText fragments
    turns = document.querySelectorAll('[class*="UserMessage"], [class*="userMessage"], [class*="AnswerText"], [class*="answerText"], [class*="BotMessage"]');
    if (turns.length > 0) {
      turns.forEach(el => {
        const cls    = el.className.toLowerCase();
        const isUser = /user/.test(cls) && !/answer|bot|assistant/.test(cls);
        const clone  = el.cloneNode(true);
        clone.querySelectorAll('button, [role="button"], svg').forEach(b => b.remove());
        const text = clone.innerText?.trim();
        if (text && text.length > 2) messages.push({ role: isUser ? 'user' : 'assistant', text });
      });
      if (messages.length > 0) return messages;
    }

    // Strategy 3: Perplexity's thread sections — each turn is a query + answer block
    // User queries often appear as headings; AI answers use .prose
    // Scope to main to avoid matching nav/header/footer <section> elements.
    const threadSections = document.querySelectorAll('[class*="ThreadItem"], [class*="turn"], main section');
    if (threadSections.length > 0) {
      threadSections.forEach(section => {
        const queryEl  = section.querySelector('[class*="query"], [class*="Query"], h1, h2');
        const answerEl = section.querySelector('.prose, [class*="prose"], [class*="Answer"]');
        if (queryEl) {
          const text = queryEl.innerText?.trim();
          if (text) messages.push({ role: 'user', text });
        }
        if (answerEl) {
          const clone = answerEl.cloneNode(true);
          clone.querySelectorAll('button, [role="button"], svg').forEach(b => b.remove());
          const text = clone.innerText?.trim();
          if (text) messages.push({ role: 'assistant', text });
        }
      });
      if (messages.length > 0) return messages;
    }

    // Strategy 4: Last-resort fallback — interleave heading-based user questions
    // with .prose answer blocks. Both are scoped to <main> to avoid page chrome.
    const main4 = document.querySelector('main') || document.body;
    const userHeadings = Array.from(main4.querySelectorAll('h1, h2, [class*="query"], [class*="Query"]'));
    const proseBlocks  = Array.from(main4.querySelectorAll('.prose, [class*="prose"]'));
    // Interleave in DOM order so the capsule preserves the Q-A sequence.
    const combined = [...userHeadings.map(el => ({ role: 'user', el })),
                      ...proseBlocks.map(el  => ({ role: 'assistant', el }))]
      .sort((a, b) => a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1);
    combined.forEach(({ role, el }) => {
      const clone = el.cloneNode(true);
      clone.querySelectorAll('button, [role="button"]').forEach(b => b.remove());
      const text = clone.innerText?.trim();
      if (text && text.length > 10) messages.push({ role, text });
    });

    return messages;
  }
})();
