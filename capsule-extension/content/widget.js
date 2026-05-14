// content/widget.js — AIContext Saver · Floating draggable capsule widget
// Injected on all 9 supported AI platforms via content_scripts in manifest.json.
// Shows when a capsule is "activated" from the popup.

(function () {
  'use strict';
  if (window.__aiContextWidgetLoaded) return;
  window.__aiContextWidgetLoaded = true;

  let widget = null;
  let drag   = { active: false, ox: 0, oy: 0, moved: false };
  let activeCapsule = null;
  let _myTabId = null;
  // Holds a capsule that arrived via storage.onChanged before GET_MY_TAB_ID responded.
  let _pendingCapsule = null;

  // Injection cancellation and in-progress guard
  let _injectCancelled  = false;
  let _injectInProgress = false;
  let _flyRafHandle     = null;

  // Fetch this tab's ID once so storage.onChanged can scope activeCapsule to
  // only the target tab — prevents the widget from appearing on all open AI tabs.
  chrome.runtime.sendMessage({ action: 'GET_MY_TAB_ID' }, tabId => {
    _myTabId = tabId;
    // Process any capsule that arrived in the race window before we had our ID.
    const pending = _pendingCapsule;
    _pendingCapsule = null;
    chrome.storage.local.get(['activeCapsule'], res => {
      // Prefer the freshest storage value; pending may be stale if a newer capsule
      // was activated while waiting for GET_MY_TAB_ID to respond.
      const val = res.activeCapsule || pending;
      if (val && (!val.targetTabId || val.targetTabId === _myTabId)) showWidget(val);
    });
  });

  // ── Inject widget styles once ─────────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById('aic-widget-styles')) return;
    const s = document.createElement('style');
    s.id = 'aic-widget-styles';
    s.textContent = `
      /* ── Base widget — Classic Royal ──────────────────────────── */
      #aic-widget {
        position: fixed;
        bottom: 88px;
        right: 20px;
        z-index: 2147483640;
        background: #FFFFFF;
        border: 1px solid #DEE1E6;
        box-shadow: 0 4px 14px rgba(0,0,0,0.10), 0 10px 28px rgba(0,0,0,0.07);
        cursor: pointer;
        user-select: none;
        font-family: 'Segoe UI Variable', 'Segoe UI', system-ui, -apple-system, sans-serif;
        touch-action: none;
        transition: border-radius 0.25s ease, padding 0.25s ease, width 0.25s cubic-bezier(0.34,1.56,0.64,1);
      }

      /* ── Collapsed: 52px circle bubble ───────────────────────── */
      #aic-widget.aic-collapsed {
        width: 52px;
        height: 52px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0;
        background: linear-gradient(135deg, #1A3A6C, #2654A0);
        border: none;
        box-shadow: 0 4px 14px rgba(26,58,108,0.4), 0 2px 6px rgba(26,58,108,0.28);
        animation: aicBubbleIn 0.45s cubic-bezier(0.34,1.56,0.64,1) both;
      }
      #aic-widget.aic-collapsed:hover {
        transform: scale(1.08);
        box-shadow: 0 6px 20px rgba(26,58,108,0.5), 0 3px 8px rgba(26,58,108,0.35);
      }

      @keyframes aicBubbleIn {
        from { transform: scale(0.4) translateX(40px); opacity: 0; }
        to   { transform: scale(1)   translateX(0);    opacity: 1; }
      }

      .aic-bubble-icon {
        font-size: 22px;
        line-height: 1;
        display: block;
        color: rgba(255,255,255,0.9);
        transition: transform 0.15s ease;
        font-weight: 700;
        letter-spacing: -1px;
      }
      #aic-widget.aic-collapsed:hover .aic-bubble-icon {
        transform: scale(1.12);
      }

      /* ── Expanded: full panel ─────────────────────────────────── */
      #aic-widget.aic-expanded {
        width: 160px;
        height: auto;
        border-radius: 16px;
        padding: 11px 13px 10px;
        display: flex;
        flex-direction: column;
        gap: 7px;
        cursor: default;
        animation: aicExpandIn 0.3s cubic-bezier(0.34,1.56,0.64,1) both;
      }
      @keyframes aicExpandIn {
        from { transform: scale(0.85); opacity: 0.5; }
        to   { transform: scale(1);    opacity: 1; }
      }

      /* Hide content when collapsed, show when expanded */
      #aic-widget.aic-collapsed .aic-content { display: none; }
      #aic-widget.aic-expanded  .aic-bubble-icon { display: none; }
      #aic-widget.aic-expanded  .aic-content {
        display: flex;
        flex-direction: column;
        gap: 7px;
        width: 100%;
      }

      @keyframes aicSlideOut {
        from { transform: translateX(0) scale(1); opacity: 1; }
        to   { transform: translateX(80px) scale(0.7); opacity: 0; }
      }

      .aic-label {
        font-size: 10.5px;
        font-weight: 700;
        color: #0D1117;
        text-align: center;
        letter-spacing: 0.2px;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 5px;
      }

      .aic-hint {
        font-size: 9.5px;
        color: #6E7787;
        text-align: center;
        font-weight: 500;
        margin-top: -3px;
      }

      .aic-btn {
        border-radius: 8px;
        padding: 7px 12px;
        font-size: 12px;
        font-weight: 700;
        color: #fff;
        cursor: pointer;
        transition: opacity .12s, transform .08s;
        display: flex;
        align-items: center;
        gap: 5px;
        width: 100%;
        justify-content: center;
        font-family: inherit;
        border: none;
      }
      .aic-raw   { background: linear-gradient(135deg, #B45309, #D97706); box-shadow: 0 2px 6px rgba(180,83,9,0.3); }
      .aic-smart { background: linear-gradient(135deg, #1D4ED8, #3B82F6); box-shadow: 0 2px 6px rgba(29,78,216,0.3); }
      .aic-btn:hover  { opacity: 0.88; transform: translateY(-1px); }
      .aic-btn:active { transform: translateY(0); }

      .aic-close {
        position: absolute;
        top: -8px; right: -8px;
        width: 20px; height: 20px;
        background: #B91C1C;
        border: 1.5px solid rgba(185,28,28,0.3);
        border-radius: 50%;
        color: #fff;
        font-size: 10px;
        font-weight: 700;
        cursor: pointer;
        display: flex; align-items: center; justify-content: center;
        line-height: 1;
        box-shadow: 0 2px 4px rgba(185,28,28,0.3);
        z-index: 2;
        padding: 0;
        transition: opacity .12s, transform .08s;
        font-family: inherit;
      }
      .aic-close:hover  { opacity: 0.85; transform: scale(1.1); }
      .aic-close:active { transform: scale(0.95); }

      .aic-divider {
        border: none;
        border-top: 1px solid #EAECF0;
        margin: 0;
      }

      /* ── Flying capsule animation ──────────────────────────────── */
      #aic-fly-capsule {
        position: fixed;
        z-index: 2147483645;
        pointer-events: none;
        display: flex;
        flex-direction: column;
        align-items: center;
        width: 44px;
        filter: drop-shadow(2px 3px 4px rgba(0,0,0,0.35));
      }
      .aic-fly-top, .aic-fly-bot {
        width: 40px;
        height: 18px;
        border: 2.5px solid #1A1527;
      }
      .aic-fly-top {
        border-radius: 24px 24px 0 0;
        border-bottom: none;
      }
      .aic-fly-bot {
        border-radius: 0 0 24px 24px;
        border-top: 1.5px solid rgba(0,0,0,0.15);
      }
      .aic-fly-raw-top   { background: #F97316; }
      .aic-fly-raw-bot   { background: #22C55E; }
      .aic-fly-smart-top { background: #3B82F6; }
      .aic-fly-smart-bot { background: #8B5CF6; }

      /* Landing ring flash */
      #aic-land-ring {
        position: fixed;
        z-index: 2147483644;
        pointer-events: none;
        border-radius: 50%;
        border: 3px solid #22C55E;
        animation: aicRingPop 0.5s ease-out forwards;
      }
      @keyframes aicRingPop {
        0%   { width: 10px; height: 10px; opacity: 1; transform: translate(-50%,-50%) scale(0.5); }
        100% { width: 60px; height: 60px; opacity: 0; transform: translate(-50%,-50%) scale(1);   }
      }

      /* ── Drop-zone highlight ────────────────────────────────────── */
      .aic-drop-highlight {
        outline: 3px dashed #22C55E !important;
        outline-offset: 3px !important;
        background: rgba(34,197,94,0.06) !important;
        transition: outline 0.15s, background 0.15s;
      }

      /* ── Drop choice popover ────────────────────────────────────── */
      #aic-drop-menu {
        position: fixed;
        z-index: 2147483641;
        background: #fff;
        border: 1px solid #DEE1E6;
        border-radius: 12px;
        box-shadow: 0 4px 14px rgba(0,0,0,0.10), 0 10px 28px rgba(0,0,0,0.07);
        padding: 10px;
        display: flex;
        flex-direction: column;
        gap: 6px;
        font-family: 'Segoe UI Variable', 'Segoe UI', system-ui, sans-serif;
        animation: aicPopIn 0.3s cubic-bezier(0.34,1.56,0.64,1) both;
      }
      @keyframes aicPopIn {
        from { transform: scale(0.7); opacity: 0; }
        to   { transform: scale(1);   opacity: 1; }
      }
      .aic-drop-label {
        font-size: 10px;
        font-weight: 800;
        color: #6E7787;
        text-align: center;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }

      /* ── Capsule-open burst animation ───────────────────────────── */
      #aic-burst {
        position: fixed;
        z-index: 2147483642;
        pointer-events: none;
        display: flex;
        flex-direction: column;
        align-items: center;
        width: 60px;
      }
      .aic-cap-top {
        width: 54px; height: 20px;
        border-radius: 30px 30px 0 0;
        border: 2.5px solid #1A1527;
        background: #F97316;
        animation: capTopFly 0.65s cubic-bezier(0.36,.07,.19,.97) forwards;
      }
      .aic-cap-bot {
        width: 54px; height: 20px;
        border-radius: 0 0 30px 30px;
        border: 2.5px solid #1A1527;
        border-top: none;
        background: #22C55E;
        animation: capBotFly 0.65s cubic-bezier(0.36,.07,.19,.97) forwards;
      }
      .aic-smart-cap-top { background: #3B82F6 !important; }
      .aic-smart-cap-bot { background: #8B5CF6 !important; }
      .aic-sparkle {
        position: absolute;
        top: 50%; left: 50%;
        transform: translate(-50%,-50%);
        font-size: 22px;
        animation: sparkleOut 0.55s 0.15s ease forwards;
        opacity: 0;
      }
      @keyframes capTopFly {
        0%   { transform: translateY(0)    rotate(0);     opacity: 1; }
        40%  { transform: translateY(-18px) rotate(-12deg); opacity: 1; }
        100% { transform: translateY(-44px) rotate(-28deg); opacity: 0; }
      }
      @keyframes capBotFly {
        0%   { transform: translateY(0)   rotate(0);    opacity: 1; }
        100% { transform: translateY(22px) rotate(15deg); opacity: 0; }
      }
      @keyframes sparkleOut {
        0%   { opacity: 0;   transform: translate(-50%,-50%) scale(0.5); }
        50%  { opacity: 1;   transform: translate(-50%,-50%) scale(1.4); }
        100% { opacity: 0;   transform: translate(-50%,-50%) scale(2);   }
      }

      /* ── Dark mode support (via prefers-color-scheme) ──────────── */
      @media (prefers-color-scheme: dark) {
        #aic-widget.aic-expanded {
          background: #161B24;
          border-color: #2D3748;
          box-shadow: 0 4px 14px rgba(0,0,0,0.5), 0 10px 28px rgba(0,0,0,0.38);
        }
        .aic-label      { color: #E8EDF5; }
        .aic-hint       { color: #4A5568; }
        .aic-divider    { border-color: #2D3748; }
        #aic-drop-menu  {
          background: #161B24;
          border-color: #2D3748;
          box-shadow: 0 4px 14px rgba(0,0,0,0.5);
        }
        .aic-drop-label { color: #8899AA; }
        .aic-close      { background: #FC8181; }
      }
    `;
    document.head.appendChild(s);
  }

  // ── Show widget (collapsed bubble by default) ─────────────────────────────
  function showWidget(cap) {
    activeCapsule = cap;
    injectStyles();
    if (widget) widget.remove();

    widget = document.createElement('div');
    widget.id = 'aic-widget';
    widget.className = 'aic-collapsed';
    widget.innerHTML = `
      <span class="aic-bubble-icon" title="Capsule Ready — click to expand">C</span>
      <div class="aic-content">
        <button class="aic-close" id="aicClose" title="Dismiss">&#10005;</button>
        <div class="aic-label">Capsule Ready</div>
        <div class="aic-hint">Click or drag to inject</div>
        <hr class="aic-divider"/>
        <button class="aic-btn aic-raw"   id="aicRaw">Inject Raw</button>
        <button class="aic-btn aic-smart" id="aicSmart">Inject Smart</button>
      </div>
    `;
    document.body.appendChild(widget);

    // Expansion on click is handled in onMouseUp (after drag check).

    const rawBtn   = widget.querySelector('#aicRaw');
    const smartBtn = widget.querySelector('#aicSmart');

    if (!cap.raw) {
      rawBtn.disabled = true;
      rawBtn.title    = 'No raw conversation captured';
      rawBtn.style.opacity = '0.45';
    } else {
      rawBtn.addEventListener('click', e => {
        e.stopPropagation();
        injectWithAnim(cap.raw, 'raw', widget);
      });
    }

    if (!cap.smart) {
      smartBtn.disabled = true;
      smartBtn.title    = 'No smart summary — save with API configured to generate one';
      smartBtn.style.opacity = '0.45';
    } else {
      smartBtn.addEventListener('click', e => {
        e.stopPropagation();
        injectWithAnim(cap.smart, 'smart', widget);
      });
    }

    widget.querySelector('#aicClose').addEventListener('click', e => {
      e.stopPropagation();
      dismissWidget();
      chrome.storage.local.remove(['activeCapsule']);
    });

    widget.addEventListener('mousedown', onMouseDown);
  }

  function dismissWidget() {
    if (!widget) return;
    // Cancel any in-flight inject animation so doInject does not fire after dismiss.
    _injectCancelled = true;
    if (_flyRafHandle !== null) {
      cancelAnimationFrame(_flyRafHandle);
      _flyRafHandle = null;
    }
    _injectInProgress = false;
    const target = widget;
    widget = null;
    target.style.animation = 'aicSlideOut 0.3s ease forwards';
    setTimeout(() => target.remove(), 310);
    // Remove drop menu if it was open when the user dismissed the widget.
    document.getElementById('aic-drop-menu')?.remove();
  }

  // ── Cross-window capsule fly animation (INJECT_WITH_ANIM) ────────────────
  function injectWithFlyAnim(text, type, callback) {
    if (!text) return;
    if (_injectInProgress) return; // prevent rapid double-inject
    _injectInProgress = true;
    _injectCancelled  = false;
    injectStyles();

    // Capture the current URL so we can abort if the user navigates
    // to a different conversation during the 1.5 s animation window.
    const originalHref = location.href;

    const ta = getTextarea();
    if (!ta) { doInject(text, originalHref, callback); return; }

    const taRect = ta.getBoundingClientRect();
    const endX   = taRect.left + taRect.width  * 0.35;
    const endY   = taRect.top  + taRect.height * 0.5;

    const startX = window.innerWidth  - 60;
    const startY = 18;

    const ctrlX  = startX * 0.6 + endX * 0.4;
    const ctrlY  = Math.min(startY, endY) - Math.max(80, Math.abs(endX - startX) * 0.4);

    const cap   = document.createElement('div');
    cap.id      = 'aic-fly-capsule';
    const smart = type === 'smart';
    cap.innerHTML = `
      <div class="aic-fly-top ${smart ? 'aic-fly-smart-top' : 'aic-fly-raw-top'}"></div>
      <div class="aic-fly-bot ${smart ? 'aic-fly-smart-bot' : 'aic-fly-raw-bot'}"></div>
    `;
    document.body.appendChild(cap);

    const DURATION  = 900;
    const startTime = performance.now();

    function qBez(p0, p1, p2, t) {
      const mt = 1 - t;
      return mt * mt * p0 + 2 * mt * t * p1 + t * t * p2;
    }

    function easeInOut(t) {
      return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
    }

    function tick(now) {
      const raw  = Math.min((now - startTime) / DURATION, 1);
      const ease = easeInOut(raw);

      const x   = qBez(startX, ctrlX, endX, ease);
      const y   = qBez(startY, ctrlY, endY, ease);
      const rot = Math.sin(ease * Math.PI * 2.5) * 22 * (1 - ease);
      const sc  = 1.15 - 0.25 * ease;

      cap.style.left      = x + 'px';
      cap.style.top       = y + 'px';
      cap.style.transform = `scale(${sc}) rotate(${rot}deg)`;

      if (raw < 1) {
        _flyRafHandle = requestAnimationFrame(tick);
      } else {
        _flyRafHandle = null;
        cap.remove();
        showLandRing(endX, endY);
        showBurst(endX - 30, endY - 15, type);
        setTimeout(() => doInject(text, originalHref, callback), 620);
      }
    }

    _flyRafHandle = requestAnimationFrame(tick);
  }

  function showLandRing(x, y) {
    const r    = document.createElement('div');
    r.id       = 'aic-land-ring';
    r.style.left = x + 'px';
    r.style.top  = y + 'px';
    document.body.appendChild(r);
    setTimeout(() => r.remove(), 520);
  }

  // ── Capsule-open animation + inject (from expanded widget buttons) ────────
  function injectWithAnim(text, type, anchorEl) {
    if (!text) return;
    if (_injectInProgress) return; // prevent rapid double-inject
    // If widget was dismissed while the drop menu was still open, abort.
    if (_injectCancelled) { _injectCancelled = false; return; }
    _injectInProgress = true;
    _injectCancelled  = false;
    const rect = anchorEl.getBoundingClientRect();
    showBurst(rect.left + rect.width / 2 - 30, rect.top - 15, type);
    // No originalHref check here — this path is user-initiated from the widget
    // on the current page, so navigation mid-click is not a meaningful risk.
    setTimeout(() => doInject(text, null, null), 550);
  }

  function showBurst(x, y, type) {
    const b = document.createElement('div');
    b.id = 'aic-burst';
    b.style.left = x + 'px';
    b.style.top  = y + 'px';
    const smart = type === 'smart';
    b.innerHTML = `
      <div class="aic-cap-top ${smart ? 'aic-smart-cap-top' : ''}"></div>
      <div class="aic-cap-bot ${smart ? 'aic-smart-cap-bot' : ''}"></div>
      <span class="aic-sparkle">✨</span>
    `;
    document.body.appendChild(b);
    setTimeout(() => b.remove(), 800);
  }

  function doInject(text, originalHref, callback) {
    _injectInProgress = false;
    // User dismissed the widget (or navigated away) — do not inject.
    if (_injectCancelled) {
      callback && callback(false, 'Injection cancelled.');
      return;
    }
    if (originalHref && location.href !== originalHref) {
      dismissWidget();
      chrome.storage.local.remove(['activeCapsule']);
      callback && callback(false, 'Page changed — injection cancelled.');
      return;
    }

    const ta = getTextarea();
    if (!ta) {
      dismissWidget();
      chrome.storage.local.remove(['activeCapsule']);
      callback && callback(false, 'Could not find chat input on this page.');
      return;
    }

    ta.focus();

    if (ta.tagName === 'TEXTAREA') {
      // Save existing content so we can restore on failure (Bug 2).
      const prevValue = ta.value;

      // Use React's native prototype setter so React's onChange fires correctly.
      // Direct ta.value = '...' is trapped by React's synthetic event system
      // and leaves React's internal state stale (send button stays disabled).
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
      if (nativeSetter) {
        nativeSetter.call(ta, text);
        ta.dispatchEvent(new Event('input', { bubbles: true }));
        ta.dispatchEvent(new Event('change', { bubbles: true }));
      } else {
        ta.value = '';
        if (!document.execCommand('insertText', false, text)) {
          ta.value = text;
        }
        ta.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true, data: text }));
        ta.dispatchEvent(new Event('change', { bubbles: true }));
      }

      // Verify something landed; restore previous text and report failure if empty
      if (!ta.value.trim()) {
        const restoreSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
        if (restoreSetter) restoreSetter.call(ta, prevValue);
        else ta.value = prevValue;
        ta.dispatchEvent(new Event('input', { bubbles: true }));
        dismissWidget();
        chrome.storage.local.remove(['activeCapsule']);
        callback && callback(false, 'Injection failed — your previous text has been restored.');
        return;
      }
    } else {
      // contenteditable (ProseMirror / Lexical): simulate a paste via DataTransfer.
      // Editor frameworks listen for the paste event and handle it natively,
      // updating internal state correctly. This replaces the deprecated execCommand.
      const sel = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(ta);
      sel.removeAllRanges();
      sel.addRange(range);

      const prevContent = ta.innerHTML;
      const dt = new DataTransfer();
      dt.setData('text/plain', text);
      ta.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));

      // Defer callback and dismiss until we can verify the paste landed.
      // This prevents reporting success before the 60ms fallback fires.
      setTimeout(() => {
        if (!ta.textContent.trim()) {
          // Paste event was not consumed — apply fallback without destroying existing content.
          ta.innerHTML = '';
          if (!document.execCommand('insertText', false, text)) {
            ta.innerText = text;
          }
          ta.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true, data: text }));
          ta.dispatchEvent(new Event('change', { bubbles: true }));
          // If fallback also failed, restore original content and report error.
          if (!ta.textContent.trim()) {
            ta.innerHTML = prevContent;
            ta.dispatchEvent(new Event('input', { bubbles: true }));
            dismissWidget();
            chrome.storage.local.remove(['activeCapsule']);
            callback && callback(false, 'Injection failed — editor did not accept the paste.');
            return;
          }
        }
        ta.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'a' }));
        ta.dispatchEvent(new KeyboardEvent('keyup',   { bubbles: true, cancelable: true, key: 'a' }));
        dismissWidget();
        chrome.storage.local.remove(['activeCapsule']);
        callback && callback(true);
      }, 60);
      return; // callback deferred; don't fall through to the synchronous dismiss below
    }

    ta.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'a' }));
    ta.dispatchEvent(new KeyboardEvent('keyup',   { bubbles: true, cancelable: true, key: 'a' }));

    dismissWidget();
    chrome.storage.local.remove(['activeCapsule']);
    callback && callback(true);
  }

  // Selectors scoped by hostname to prevent cross-platform collisions.
  // NOTE: verify against live DOM before each release as AI sites update frequently.
  function getTextarea() {
    const host = location.hostname;
    if (host.includes('chatgpt.com')) {
      return (
        document.querySelector('#prompt-textarea') ||
        document.querySelector('div[contenteditable="true"][data-lexical-editor]')
      );
    }
    if (host.includes('claude.ai')) {
      return (
        document.querySelector('[data-testid="composer-input"] div[contenteditable="true"]') ||
        document.querySelector('.ProseMirror[contenteditable="true"]')
      );
    }
    if (host.includes('gemini.google.com')) {
      return (
        document.querySelector('rich-textarea div[contenteditable="true"]') ||
        document.querySelector('div[contenteditable="true"][aria-label*="message"]')
      );
    }
    if (host.includes('grok.com')) {
      return (
        document.querySelector('textarea[data-testid="ask-grok"]') ||
        document.querySelector('div[contenteditable="true"][aria-label*="Grok"]')
      );
    }
    if (host.includes('copilot.microsoft.com')) {
      return (
        document.querySelector('textarea[id*="search"]') ||
        document.querySelector('div[contenteditable="true"][aria-label*="chat"]')
      );
    }
    if (host.includes('perplexity.ai')) {
      return (
        document.querySelector('textarea[placeholder*="Ask"]') ||
        document.querySelector('div[contenteditable="true"][aria-label*="Ask"]')
      );
    }
    if (host.includes('deepseek.com')) {
      return (
        document.querySelector('#chat-input') ||
        document.querySelector('textarea[placeholder*="Message"]')
      );
    }
    if (host.includes('mistral.ai')) {
      return (
        document.querySelector('textarea[data-testid="chat-input"]') ||
        document.querySelector('div[contenteditable="true"][aria-label*="Message"]')
      );
    }
    if (host.includes('meta.ai')) {
      return (
        document.querySelector('div[contenteditable="true"][aria-label*="message"][role="textbox"]') ||
        document.querySelector('div[contenteditable="true"][role="textbox"]')
      );
    }
    // Generic fallback for any unlisted host.
    return document.querySelector('div[contenteditable="true"][role="textbox"]');
  }

  // ── Drag logic (active in both collapsed and expanded states) ───────────────
  // Collapsed: any mousedown starts drag so the bubble can be repositioned away
  // from site controls (e.g. ChatGPT's scroll-to-bottom button).
  function onMouseDown(e) {
    if (e.target.closest('button')) return;
    e.preventDefault();
    drag.active = true;
    const r = widget.getBoundingClientRect();
    drag.ox = e.clientX - r.left;
    drag.oy = e.clientY - r.top;
    widget.classList.add('grabbing');
    widget.style.cursor = 'grabbing';

    widget.style.bottom = 'auto';
    widget.style.right  = 'auto';
    widget.style.left   = r.left + 'px';
    widget.style.top    = r.top  + 'px';

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup',   onMouseUp);
  }

  function onMouseMove(e) {
    if (!drag.active || !widget) return;
    drag.moved = true;
    const x = e.clientX - drag.ox;
    const y = e.clientY - drag.oy;
    const maxX = window.innerWidth  - widget.offsetWidth;
    const maxY = window.innerHeight - widget.offsetHeight;
    widget.style.left = Math.max(0, Math.min(maxX, x)) + 'px';
    widget.style.top  = Math.max(0, Math.min(maxY, y)) + 'px';

    const ta  = getTextarea();
    const el  = document.elementFromPoint(e.clientX, e.clientY);
    const hit = ta && (el === ta || ta.contains(el));
    ta && ta.classList.toggle('aic-drop-highlight', hit);
  }

  function onMouseUp(e) {
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup',   onMouseUp);
    if (!widget) return;
    widget.style.cursor = '';
    widget.classList.remove('grabbing');
    const wasDragging = drag.moved;
    drag.active = false;
    drag.moved  = false;

    const ta = getTextarea();
    ta && ta.classList.remove('aic-drop-highlight');

    if (!wasDragging && widget.classList.contains('aic-collapsed')) {
      // Treat as a click — expand the bubble
      widget.classList.replace('aic-collapsed', 'aic-expanded');
      return;
    }

    const el  = document.elementFromPoint(e.clientX, e.clientY);
    const hit = ta && (el === ta || ta.contains(el));
    if (hit) showDropMenu(e.clientX, e.clientY);
  }

  // ── Drop choice popover ───────────────────────────────────────────────────
  function showDropMenu(mx, my) {
    const old = document.getElementById('aic-drop-menu');
    if (old) old.remove();

    const menu = document.createElement('div');
    menu.id = 'aic-drop-menu';
    menu.style.left = Math.max(8, mx - 90) + 'px';
    menu.style.top  = Math.max(8, my - 80) + 'px';
    menu.innerHTML = `
      <div class="aic-drop-label">Inject as</div>
      <button class="aic-btn aic-raw"   id="dropRaw">Raw</button>
      <button class="aic-btn aic-smart" id="dropSmart">Smart</button>
    `;
    document.body.appendChild(menu);
    // Clamp to viewport bottom so the Smart button is always reachable.
    const mRect = menu.getBoundingClientRect();
    if (mRect.bottom > window.innerHeight - 8) {
      menu.style.top = Math.max(8, window.innerHeight - mRect.height - 8) + 'px';
    }

    menu.querySelector('#dropRaw').addEventListener('click', () => {
      const savedRect = menu.getBoundingClientRect();
      menu.remove();
      injectWithAnim(activeCapsule?.raw,   'raw',   { getBoundingClientRect: () => savedRect });
    });
    menu.querySelector('#dropSmart').addEventListener('click', () => {
      const savedRect = menu.getBoundingClientRect();
      menu.remove();
      injectWithAnim(activeCapsule?.smart, 'smart', { getBoundingClientRect: () => savedRect });
    });

    const outside = e => {
      if (!menu.contains(e.target)) {
        clearTimeout(autoTimer);
        menu.remove();
        document.removeEventListener('click', outside);
      }
    };
    const autoTimer = setTimeout(() => {
      document.removeEventListener('click', outside);
      menu.remove();
    }, 4000);
    setTimeout(() => document.addEventListener('click', outside), 100);
  }

  // ── Storage listener — show/hide widget only on the target tab ───────────────
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.activeCapsule) {
      const val = changes.activeCapsule.newValue;
      if (val) {
        // Only show on the tab the user explicitly sent the capsule to.
        if (_myTabId === null) {
          // GET_MY_TAB_ID not yet responded — queue for processing once it resolves.
          _pendingCapsule = val;
        } else if (!val.targetTabId || val.targetTabId === _myTabId) {
          showWidget(val);
        }
      } else {
        dismissWidget();
      }
    }
  });

  // ── Proactive new-chat resume prompt ───────────────────────────────────────
  function escHtml(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function isNewChatPage() {
    const url = location.href;
    if (url.includes('chatgpt.com'))          return /^https:\/\/chatgpt\.com\/?(\?[^#]*)?$/.test(url);
    if (url.includes('claude.ai'))            return /claude\.ai\/(new|chats?\/?$)/.test(url) || url === 'https://claude.ai/';
    if (url.includes('gemini.google.com'))    return /gemini\.google\.com\/(app\/?)?$/.test(url);
    if (url.includes('grok.com'))             return /grok\.com\/?$/.test(url) || /grok\.com\/chat\/?$/.test(url);
    if (url.includes('copilot.microsoft.com'))return /copilot\.microsoft\.com\/?$/.test(url);
    if (url.includes('perplexity.ai'))        return /perplexity\.ai\/?$/.test(url);
    if (url.includes('chat.deepseek.com'))    return /chat\.deepseek\.com\/?$/.test(url);
    if (url.includes('chat.mistral.ai'))      return /chat\.mistral\.ai\/?$/.test(url);
    if (url.includes('meta.ai'))              return /meta\.ai\/?$/.test(url);
    return false;
  }

  function showResumePrompt(capsulePayload, capName) {
    if (widget) return;
    if (document.getElementById('aic-resume-prompt')) return;
    // Show at most once per tab per browser session so it doesn't nag on every
    // new chat visit. The user can still access capsules via the popup icon.
    if (sessionStorage.getItem('aic-resume-shown')) return;
    sessionStorage.setItem('aic-resume-shown', '1');
    injectStyles();

    const shortName = escHtml((capName || 'Previous context').slice(0, 40));
    const prompt = document.createElement('div');
    prompt.id = 'aic-resume-prompt';
    prompt.style.cssText = [
      'position:fixed', 'bottom:24px', 'right:20px', 'z-index:2147483639',
      'background:#fff', 'border:1px solid #DEE1E6', 'border-radius:14px',
      'box-shadow:0 4px 16px rgba(0,0,0,0.13),0 8px 24px rgba(0,0,0,0.08)',
      'padding:12px 14px', 'width:210px',
      "font-family:'Segoe UI Variable','Segoe UI',system-ui,sans-serif",
      'animation:aicPopIn 0.35s cubic-bezier(0.34,1.56,0.64,1) both'
    ].join(';');
    prompt.innerHTML = `
      <div style="font-size:11px;font-weight:800;color:#0D1117;margin-bottom:3px;">&#x1F4E5; Load previous context?</div>
      <div style="font-size:10px;color:#6E7787;margin-bottom:9px;line-height:1.4;">${shortName}</div>
      <div style="display:flex;gap:6px;">
        <button id="aicResumeLoad" style="flex:1;padding:6px 8px;background:linear-gradient(135deg,#1D4ED8,#3B82F6);color:#fff;border:none;border-radius:7px;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit;">Load</button>
        <button id="aicResumeDismiss" style="padding:6px 10px;background:#F3F4F6;color:#374151;border:none;border-radius:7px;font-size:11px;font-weight:600;cursor:pointer;font-family:inherit;">&#10005;</button>
      </div>
    `;
    document.body.appendChild(prompt);

    const autoTimer = setTimeout(() => prompt.remove(), 8000);

    prompt.querySelector('#aicResumeLoad').addEventListener('click', () => {
      clearTimeout(autoTimer);
      prompt.remove();
      showWidget(capsulePayload);
      if (widget) widget.classList.replace('aic-collapsed', 'aic-expanded');
    });
    prompt.querySelector('#aicResumeDismiss').addEventListener('click', () => {
      clearTimeout(autoTimer);
      prompt.remove();
    });
  }

  function checkForNewChatResume() {
    if (!isNewChatPage()) return;
    if (widget || document.getElementById('aic-resume-prompt')) return;
    chrome.storage.local.get(['capsules', 'activeCapsule'], res => {
      if (res.activeCapsule) return; // widget already managing a capsule
      const capsules = res.capsules || [];
      if (capsules.length === 0) return;
      const latest = capsules.slice().sort((a, b) => b.created_at - a.created_at)[0];
      if (!latest) return;
      const rawText = latest.raw?.text ||
        (latest.raw?.messages?.length
          ? latest.raw.messages.map(m => `${m.role.toUpperCase()}: ${m.text}`).join('\n\n')
          : '');
      const payload = { raw: rawText, smart: latest.smart?.text || '' };
      setTimeout(() => showResumePrompt(payload, latest.name), 1500);
    });
  }

  // Run on initial load
  checkForNewChatResume();

  // Monitor SPA URL changes — use Navigation API (Chrome 102+) when available
  // to avoid polling. Falls back to a 1200ms interval for older builds.
  if (typeof navigation !== 'undefined' && navigation.addEventListener) {
    navigation.addEventListener('navigate', () => {
      setTimeout(checkForNewChatResume, 900);
    });
  } else {
    let _resumeLastUrl = location.href;
    const _pollIntervalId = setInterval(() => {
      if (location.href !== _resumeLastUrl) {
        _resumeLastUrl = location.href;
        setTimeout(checkForNewChatResume, 900);
      }
    }, 1200);
    window.addEventListener('beforeunload', () => clearInterval(_pollIntervalId), { once: true });
  }

  // ── Handle messages from popup ────────────────────────────────────────────
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (sender.id !== chrome.runtime.id) return;
    if (msg.action === 'SHOW_WIDGET') {
      showWidget(msg.capsule);
      return false;
    }
    if (msg.action === 'HIDE_WIDGET') {
      dismissWidget();
      chrome.storage.local.remove(['activeCapsule']);
      return false;
    }
    if (msg.action === 'INJECT_WITH_ANIM') {
      injectWithFlyAnim(msg.text, msg.type, (ok, err) => {
        sendResponse({ success: ok, error: err || undefined });
      });
      return true; // keep channel open until callback fires after animation
    }
    return false;
  });
})();
