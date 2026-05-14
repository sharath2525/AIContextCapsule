// content/chatgpt.js — DOM scraper for chatgpt.com (Manifest V3 content script)
// Listens for CAPTURE message and returns [{role, text}] array.

(function () {
  'use strict';
  if (window.__aicChatGPTLoaded) return;
  window.__aicChatGPTLoaded = true;

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
    // Primary selector: elements with data-message-author-role attribute
    const allEls = Array.from(document.querySelectorAll('[data-message-author-role]'));
    // Deduplicate: remove any element that is a descendant of another matched element
    // to prevent double-capture if ChatGPT nests the attribute on inner containers.
    const elements = allEls.filter(el =>
      !allEls.some(other => other !== el && other.contains(el))
    );
    const messages = [];

    elements.forEach(el => {
      const role = el.getAttribute('data-message-author-role');
      if (role !== 'user' && role !== 'assistant') return;

      // Try the standard whitespace-pre-wrap inner container first
      const textEl = el.querySelector('.whitespace-pre-wrap')
                  || el.querySelector('[data-message-content]')
                  || el;

      // E1: Clone before reading innerText so UI chrome elements (Copy code
      // buttons, action toolbars) don't bleed into the captured text.
      const clone = textEl.cloneNode(true);
      clone.querySelectorAll('button, [role="button"]').forEach(b => b.remove());
      const text = clone.innerText?.trim();
      if (text) {
        messages.push({ role, text });
      }
    });

    return messages;
  }
})();
