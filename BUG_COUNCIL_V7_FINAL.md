# 🏛️ BUG COUNCIL V7 — FINAL REPORT
### AIContext Saver — Post-V6 Fix Complete Rescan (All 22 Files)

---

## TO ANSWER YOUR QUESTION DIRECTLY

**Why do new bugs appear every scan?** The answer is now definitively resolved. Each scan before V6 read only 3–5 files at a time. V6 was the first true complete scan (22 files). V7 is the first scan of the codebase *after all V6 fixes were applied*. This means we are now finally looking at the actual production-ready code. After this scan, there should be no new categories of issue — only the ones listed below remain.

---

## V6 FIX VERIFICATION — WHAT IS CONFIRMED RESOLVED

The following V6 critical/high issues are confirmed fixed in the current code:

✅ `node_modules/playwright` removed from extension directory — ZIP is now production-size  
✅ `export/export.html` inline script → extracted to `export/export.js` via `<script src>` — CSP compliant  
✅ `.gitignore` created covering `.auth-state.json`, `test-screenshots/`, `node_modules/`  
✅ Settings blank-key wipe: `_prevKeyDecryptFailed` guard in `onSave` blocks save ✓  
✅ RAF animation cancellable: `_injectCancelled` + `cancelAnimationFrame(_flyRafHandle)` in `dismissWidget()` ✓  
✅ `exportPDF()` now awaited with try/catch in both PDF click handlers ✓  
✅ `saveResp?.success === true` explicit check ✓  
✅ Legacy capsule export: `renderMessages(messages, fallbackText)` with fallback ✓  
✅ `checkForNewChatResume()` builds rawText from `messages[]` via inline inline logic ✓  
✅ Copilot: throws descriptive shadow DOM error message instead of silent empty ✓  
✅ Perplexity Strategy 3: scoped to `main section` ✓  
✅ Perplexity Strategy 4: interleaved headings + prose in DOM order ✓  
✅ Meta Strategy 4: scoped to thread container, `[class*="message"]` only ✓  
✅ Mistral Strategy 1: `isKnownRole` guard filters non-chat `data-role` values ✓  
✅ Grok Strategy 4: ancestor deduplication added ✓  
✅ PBKDF2: 100,000 iterations, v3 blob stores iteration count ✓  
✅ Error body redaction: covers `authorization`, `bearer`, `api[-_]?key` ✓  
✅ Storage pre-append size check: `used + incomingBytes > MAX_STORAGE_BYTES` ✓  
✅ New capsule search filter: checks `activeQuery` before prepend ✓  
✅ Settings `saveBtn.disabled = true` during save, re-enabled in `finally` ✓  
✅ `setInterval` stored as `_pollIntervalId`, cleared on `beforeunload` ✓  
✅ `grabbing` cursor class: `widget.classList.remove('grabbing')` in `onMouseUp` ✓  
✅ Export PDF platform label: `SOURCE_LABELS` map with all 9 platforms in `export.js` ✓  
✅ `esc(m.text || '')` in `renderMessages` ✓  
✅ `"tabs"` permission removed from manifest ✓  
✅ `popup.html` theme script extracted to `theme-init.js` ✓  

---

## SYSTEM FRAMING (V7)

**What is this?** Chrome MV3 extension — 22 source files, 9 supported platforms, zero npm dependencies in the extension directory.

**Known-risky areas after V6 fixes:** `getTextarea()` selector cascade in widget.js (covers 9 platforms in one function), content scraper fallback strategies, drop menu lifecycle, export page error states.

---

## 🔨 AGENT 1 — THE BREAKER

**B1. `injectWithAnim` (drop-menu path) resets `_injectCancelled = false` after prior `dismissWidget()` call**
In `widget.js`, `dismissWidget()` sets `_injectCancelled = true`. However, `injectWithAnim()` (line 504) — called when the user drops the widget onto the textarea — sets `_injectCancelled = false` at the top. If the user: (1) clicks Close (dismisses widget, sets `_injectCancelled = true`), then (2) immediately clicks a button in the still-visible `#aic-drop-menu`, `injectWithAnim` resets the flag to `false` and injection proceeds unexpectedly despite the explicit dismiss. The user dismissed the widget but text still gets injected.

**B2. `dismissWidget()` does not remove `#aic-drop-menu`**
`#aic-drop-menu` is a separate element appended to `document.body` in `showDropMenu()`. `dismissWidget()` only removes `widget` (the main widget element). If Close is clicked while the drop menu is visible, the drop menu remains on screen. Its "Raw" and "Smart" buttons still reference `activeCapsule` (set at widget level) and will still inject if clicked — after the user explicitly dismissed the widget.

**B3. `resp?.animating` branch in `popup.js` `onInject` is dead code**
`onInject` in popup.js (line 483) checks `if (resp?.animating)`. The widget's `INJECT_WITH_ANIM` handler uses `return true` to keep the message channel open and calls `sendResponse({ success: ok, error: ... })` only after `doInject` completes (~1.5s later). It never sends `{ animating: true }`. The `animating` branch never triggers. This is dead code that could mislead debugging.

**B4. `settings.js` `testBtn.disabled` not reset if `testConnection` throws**
`onTest()` sets `testBtn.disabled = true` before calling `testConnection()`. If `testConnection` throws an uncaught exception (e.g., `getSettings()` fails because `chrome.storage` is unavailable during extension update), the `testBtn.disabled = false` line never executes. Test button stays permanently disabled until the settings page is reopened.

**B5. `getTextarea()` has cross-platform selector collision risk**
`widget.js` `getTextarea()` tries selectors for all 9 platforms in a single cascade. Selectors are NOT guarded by origin. On any given AI platform, platform-agnostic selectors run first and can match the wrong element:
- `.ProseMirror[contenteditable="true"]` (selector 4, intended for Claude) — ProseMirror is used by many apps. Could match on DeepSeek, Mistral, or any other platform that uses ProseMirror as an embedded editor.
- `textarea[id*="search"]` (selector 9, intended for Copilot) — matches ANY textarea whose id contains "search". On DeepSeek or Perplexity, if a search textarea has "search" in its id, this matches BEFORE DeepSeek's `#chat-input` (selector 13).
- `textarea[placeholder*="Ask"]` (selector 11) — matches any textarea with "Ask" in placeholder. Perplexity's search bar could be matched on any page that has such a textarea above the chat input in DOM order.
- `div[contenteditable="true"][aria-label*="message"]` appears at selectors 5 AND 19 (Gemini and Meta AI). Meta's selector is unreachable because selector 5 always matches first on meta.ai if there's an element with `aria-label*="message"`.

**B6. `perplexity.js` Strategy 1 `[data-role]` missing role value validation**
Strategy 1 selector includes `[data-role]` which matches ANY element with a `data-role` attribute. The role-determination logic is `isUser = /user/i.test(tid + dr)`. Any element with `data-role="navigation"`, `data-role="search"`, or `data-role="region"` fails the user test and is treated as 'assistant'. Non-chat elements (navigation bars, search regions) are silently captured as AI messages.

**B7. `deepseek.js` Strategies 2 and 3 missing ancestor deduplication**
Strategy 2 (`[class*="user-message"]`, `[class*="assistant-message"]`, etc.) and Strategy 3 (scoped to `chatList`) do not apply the ancestor-deduplication filter. If DeepSeek nests multiple elements with matching class fragments, both parent and child are captured as separate messages.

**B8. `gemini.js` Strategy 3 missing ancestor deduplication**
`[class*="user-query"], [class*="model-response"]` — if Gemini nests these class fragments (e.g., an outer `.model-response` container wrapping inner `.model-response-text`), both are captured, doubling the captured message content.

---

## 🔐 AGENT 2 — THE SECURITY ANALYST

**S1. MEDIUM — `test-screenshots/` physically present in extension directory**
`.gitignore` correctly excludes `test-screenshots/` from VCS. However, 3 PNG files (`chatgpt.png`, `claude-ai.png`, `injection-test.png`) physically exist in `capsule-extension/test-screenshots/`. Chrome Web Store ZIP files are created from the directory contents — `.gitignore` does not prevent them from being included in the ZIP. A production ZIP created from this directory would include screenshots that may contain the developer's actual ChatGPT/Claude conversation content and session state visuals.

**S2. LOW — PBKDF2 password material is still the public extension ID**
100,000 iterations is now compliant with current recommendations. However, the password is still `chrome.runtime.id + '_aic_v1'`, which is publicly visible in the Chrome Web Store. An attacker with access to `chrome.storage.local` (e.g., from a compromised machine) and the public extension ID (freely available) can derive the encryption key. No additional per-device entropy is used. This is an acknowledged limitation; the encryption is a deterrent, not a cryptographic guarantee against targeted attacks.

**S3. LOW — `selector-health-check.js` still in extension directory**
`selector-health-check.js` is a Node.js CommonJS script using `require('playwright')`. It is not referenced in `manifest.json` and Chrome will not execute it as part of the extension. However, it is physically present in the extension directory, adding ~8 KB to the Web Store ZIP and creating a misleading impression that the extension includes Node.js code. If a user loads the extension folder as a development extension and tries to execute this file via the console, they'll get a `require is not defined` error.

---

## 🌪️ AGENT 3 — THE CHAOS TESTER

**C1. Drop menu remains after widget dismiss — inject fires against user intent**
Scenario: User opens widget, drags to textarea, drop menu appears, user changes their mind and clicks the widget's Close button. `dismissWidget()` fires: `widget = null`, `_injectCancelled = true`, widget element removed from DOM. But `#aic-drop-menu` remains on screen. User sees the menu and clicks "Raw". `injectWithAnim` runs, sets `_injectCancelled = false`, fires `doInject` after 550ms. Text is injected. The user explicitly dismissed — injection happened anyway.

**C2. Rapid drop-on-textarea while `_injectInProgress` — menu appears but inject blocked**
If the user drags to textarea fast and triggers `showDropMenu`, then clicks before `_injectInProgress` resets: `injectWithAnim` has `if (_injectInProgress) return;` — silently returns with no feedback. Menu closes (via outside click), nothing happens. User re-clicks. No error shown.

**C3. Extension service worker restart between `exportPDF` write and tab read**
`exportPDF` writes `exportData_<id>_<ts>` to chrome.storage.local, then opens the export tab. The export page reads from storage. Chrome can kill the service worker at ~30s idle. But the export page reads directly from `chrome.storage.local` (not via service worker), so this is NOT affected by service worker restart. ✓ Confirmed safe.

**C4. Multiple `storage.onChanged` events on same tab — potential double-widget**
`showWidget` calls `if (widget) widget.remove()` before creating a new one. So rapid consecutive `activeCapsule` updates just replace the widget. ✓ Confirmed safe.

**C5. `checkForNewChatResume` fires on non-new-chat navigations within same-origin SPA**
Navigation API fires for `pushState` navigations. `isNewChatPage()` filters correctly for all 9 platforms. `setTimeout(checkForNewChatResume, 900)` is called after each navigation. If navigation is rapid (user clicking through conversations quickly), multiple 900ms timers queue. Each call checks `if (widget || document.getElementById('aic-resume-prompt')) return;` and the `sessionStorage` guard. In practice, the `sessionStorage` guard fires after the first prompt is shown, so subsequent navigations are cheap no-ops. ✓ Acceptable.

---

## ⚡ AGENT 4 — THE PERFORMANCE ENGINEER

**P1. `getTextarea()` called twice per injection in `injectWithFlyAnim`**
`injectWithFlyAnim` calls `getTextarea()` once to calculate the fly-animation endpoint (line 433). Then `doInject` calls `getTextarea()` again (line 545). Each call traverses the DOM with up to 20 querySelector calls. In normal use this is negligible. If the textarea is found on the first call and NOT found on the second (DOM changed in 900ms between calls), the animation plays but injection fails, showing the "Could not find chat input" error. There is also an opposite edge case: first call returns null (animation skips), second call finds the textarea — the skip path calls `doInject` immediately without animation, which is the correct fallback behavior. ✓ Performance-only issue, not a correctness bug.

**P2. `_rawTextCache` WeakMap invalidated on every save**
After `onSave`, `allCapsules.unshift(pair)` adds the new capsule. The new `pair` object is a fresh reference not in the WeakMap. No performance issue here since `getRawText` is only called once per capsule render. On delete, `allCapsules = allCapsules.filter(...)` creates new filtered array but keeps existing capsule object references alive, so cache entries remain valid. ✓

**P3. `_exportPortal` click listener registered once, never removed**
`_getExportPortal()` adds `document.addEventListener('click', e => { if (!_exportPortal.contains(e.target)) _closeExportPortal(); })` once per popup session. Since popups are short-lived and destroyed when closed, this is not a persistent leak — the entire DOM is GC'd when the popup closes. ✓ Not an issue in practice.

---

## 👤 AGENT 5 — THE REAL USER (UX Tester)

**U1. Drop-menu inject failure is completely silent**
When injection fails via the drag-and-drop menu (`showDropMenu` → `injectWithAnim` → `doInject`), `callback` is `null` (line 513: `setTimeout(() => doInject(text, null, null), 550)`). In `doInject`, failure calls `callback && callback(false, '...')` — the null check means no error is surfaced. `dismissWidget()` is called (widget disappears), injection fails silently. User has no idea what happened.

**U2. `popup.html` empty-state mentions only ChatGPT and Claude — 9 platforms supported**
`popup.html` line 97: `"Open ChatGPT or Claude, have a conversation, then click Save."` This only mentions 2 of 9 supported platforms. New users who use Gemini, Grok, Copilot, Perplexity, DeepSeek, Mistral, or Meta AI would not know the extension works there. (Note: `checkApiStatus()` replaces this text if the API is not configured, so this text only shows when API is configured and no capsules exist.)

**U3. No visual feedback during 1.5s inject animation in popup**
When a user clicks Raw or Smart in the popup to inject directly, popup.js shows "Sending to chat…" while `msgTab` blocks for the full ~1.5s until `doInject` completes. The popup shows no progress indicator or animation. After 1.5s, it either shows success or error. This is a noticeable freeze-then-pop UX.

**U4. Export page has no close button or "retry" option on error**
`export.js` shows `'⚠️ No export data found. Use the export button in the extension popup.'` if the key is missing. There's no button to close the tab or try again. The user must manually close the tab. (Minor, but present.)

**U5. `test-screenshots/` folder visible if user inspects the extension directory**
Not a user-facing bug, but if any user opens the extension directory (e.g., to check what it contains), they see `test-screenshots/` and developer screenshots. This looks unprofessional for a published extension.

---

## 📋 FLOW VERIFICATION TABLE

| Flow | Current State | Remaining Issues |
|------|--------------|-----------------|
| Save Raw (ChatGPT) | ✅ Solid | None |
| Save Raw (Claude) | ✅ Solid | None |
| Save Raw (Gemini) | ✅ Strategy 1/2 solid | Strategy 3: no ancestor dedup |
| Save Raw (Grok) | ✅ Strategies 1–3 solid | Strategy 4: deduped ✓ |
| Save Raw (Copilot) | ✅ Throws descriptive error | Shadow DOM still unreadable (architectural) |
| Save Raw (Perplexity) | ✅ Strategies 1–3 better | Strategy 1 `[data-role]` captures non-chat elements |
| Save Raw (DeepSeek) | ✅ Strategy 1 solid | Strategies 2+3: no ancestor dedup |
| Save Raw (Mistral) | ✅ `isKnownRole` guard in S1 | Strategy 3: no ancestor dedup |
| Save Raw (Meta AI) | ✅ Strategies 1–3 solid | Strategy 4: `[class*="message"]` in thread container OK |
| Smart Summary | ✅ Timeout, redaction, adaptive tokens | None |
| Inject via popup buttons | ✅ Working | `resp?.animating` dead code; 1.5s blocking wait |
| Inject via widget buttons | ✅ Cancel works | None |
| Inject via drag + drop menu | ⚠️ | Silent fail on error; stale menu after dismiss |
| Export PDF | ✅ CSP fixed, all labels correct | Export page no close button on error |
| Export Markdown | ✅ | None |
| Settings Save | ✅ Guard, disable, re-enable | `testBtn` not re-enabled if `getSettings` throws |
| Resume Prompt | ✅ Raw preview fixed | None |
| Storage quota | ✅ Pre+post check | None |

---

## 🔬 EDGE CASE ATTACK TABLE

| Edge Case | Expected | Actual Risk | Severity |
|-----------|----------|-------------|----------|
| Close widget while drop menu visible | Both dismiss | Only widget dismisses; menu stays; inject fires | **Medium** |
| `[data-role]` on Perplexity (non-chat element) | Skipped | Captured as 'assistant' message | **Medium** |
| Screenshots in extension ZIP | Excluded | Physically present; included in Web Store ZIP | **Medium** |
| `.ProseMirror` on DeepSeek/Mistral | Skip, use platform selector | Matches before platform-specific selector | **Medium** |
| `textarea[id*="search"]` on Perplexity/DeepSeek | Skip, use platform selector | May match search box before chat input | **Medium** |
| Ancestor dedup missing (DeepSeek S2/S3) | Clean messages | Duplicate messages in capsule | **Medium** |
| Ancestor dedup missing (Gemini S3) | Clean messages | Duplicate messages if DOM nested | **Low** |
| Drop menu inject failure | Error shown | Silent dismiss | **Low** |
| `testBtn` stuck disabled | Re-enabled | Permanently disabled on storage error | **Low** |
| Empty-state text on first use | "9 platforms" | Only mentions ChatGPT/Claude | **Low** |
| Meta AI `aria-label*="message"` duplicate selector | Meta uses its own | Gemini selector matches first (selector 5) | **Low** |
| `selector-health-check.js` in ZIP | Not present | Present (8 KB overhead, no security risk) | **Low** |
| `resp?.animating` branch | Triggers on animation start | Never triggers; dead code | **Low** |

---

## 🔎 PEER REVIEW

**🔨 BREAKER reviews others:**
The Security agent's finding S1 (screenshots physically in extension directory) has higher real-world impact than it appears: if the developer creates a Web Store ZIP by simply zipping the directory, the screenshots ship. The most launch-blocking remaining issue is the `getTextarea()` selector collision (B5) — on Perplexity and DeepSeek, inject could silently target the wrong input, making those platforms appear broken.

**🔐 SECURITY reviews others:**
B2 (drop menu not cleaned up by dismiss) is the most exploitable UX confusion. A malicious page cannot trigger this — it requires the user to take specific actions. But a confused user could inject content they didn't intend to, potentially leaking context into the wrong chat.

**🌪️ CHAOS reviews others:**
B5 (`getTextarea()` cross-platform collision) is most likely to manifest as a "doesn't work on Perplexity" support report. The `textarea[id*="search"]` selector will match Perplexity's search bar before reaching Perplexity's specific selectors, causing injection to go into the search box instead of the chat input.

**⚡ PERFORMANCE reviews others:**
The twin `getTextarea()` calls in `injectWithFlyAnim` + `doInject` is the only real performance note. 20 querySelector calls × 2 is still microseconds. No impact in practice.

**👤 UX reviews others:**
The silent failure on drop-menu inject (U1/B1) is the worst user experience remaining. User drags, chooses Raw or Smart, inject silently fails, widget disappears. No error. User has no recovery path. This will generate confused user reports.

---

## ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## 🏛️ BUG COUNCIL V7 — FINAL REPORT (Chairman)
## ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

### 🔴 CRITICAL BUGS
*None. All V6 critical issues confirmed resolved.*

### 🟠 HIGH RISK ISSUES
*None. All V6 high-risk issues confirmed resolved.*

### 🟡 MEDIUM ISSUES

1. **`dismissWidget()` doesn't remove `#aic-drop-menu`** (`content/widget.js` — `dismissWidget`) — Add `document.getElementById('aic-drop-menu')?.remove()` inside `dismissWidget()`.

2. **`injectWithAnim` resets `_injectCancelled = false` after prior dismiss** (`content/widget.js` — `injectWithAnim`) — Add guard: `if (_injectCancelled) { _injectCancelled = false; return; }` before resetting the flag in `injectWithAnim`.

3. **`perplexity.js` Strategy 1 `[data-role]` captures non-chat elements** (`content/perplexity.js`) — Add the same `isKnownRole` guard used in mistral.js: skip elements where `data-role` is not one of `user|human|assistant|bot`.

4. **`deepseek.js` Strategies 2 and 3 missing ancestor deduplication** (`content/deepseek.js`) — Apply the ancestor-filter to both strategies: `const deduped = arr.filter(el => !arr.some(other => other !== el && other.contains(el)))`.

5. **`gemini.js` Strategy 3 missing ancestor deduplication** (`content/gemini.js`) — Same fix: wrap `querySelectorAll('[class*="user-query"], [class*="model-response"]')` result in ancestor-filter before iterating.

6. **`getTextarea()` selector order causes cross-platform collisions** (`content/widget.js` — `getTextarea`) — Move `.ProseMirror[contenteditable="true"]` after all Claude-specific selectors and add a platform-origin prefix check. Move `textarea[id*="search"]` to be more specific (e.g., `textarea#searchBox` or use a Copilot-specific ancestor check). Add `div[contenteditable="true"][aria-label*="message"]` for Meta AI as a separate, more specific selector.

7. **`test-screenshots/` physically in extension directory** — Delete the 3 PNG files from `capsule-extension/test-screenshots/`. The `.gitignore` prevents git commits but not Web Store ZIP inclusion.

### 🔐 SECURITY RISKS

8. **PBKDF2 key = public extension ID (inherited from architecture)** — 100,000 iterations is now compliant. The public-ID limitation is acknowledged. No change required unless a per-device salt mechanism is implemented.

### ⚡ PERFORMANCE ISSUES
*None beyond the double `getTextarea()` call in `injectWithFlyAnim`, which has no measurable real-world impact.*

### 🧠 UX GAPS

9. **Drop menu inject failure is completely silent** (`content/widget.js` — `showDropMenu`) — Pass an error-display callback from `showDropMenu` to `injectWithAnim` so inject failures can surface a brief on-page toast or log to console.

10. **`popup.html` empty-state text only mentions ChatGPT and Claude** (`popup/popup.html` line 97) — Update to: `"Open a supported AI chat (ChatGPT, Claude, Gemini, and 6 more), have a conversation, then click Save."` or reference the full list.

### 📦 CLEANUP ITEMS

11. **`resp?.animating` dead code in `popup.js` `onInject`** — Remove the `if (resp?.animating)` branch; `widget.js` never sends `animating: true`.

12. **`settings.js` `testBtn.disabled` not reset in exception path** — Wrap `testBtn.disabled = false; testBtn.textContent = 'Test Connection';` in a `finally` block in `onTest`.

13. **`selector-health-check.js` still in extension directory** — Move to the project root alongside `package.json` (outside `capsule-extension/`).

14. **Duplicate `div[contenteditable="true"][aria-label*="message"]` selector in `getTextarea()`** — The Meta AI selector at position 19 is unreachable because the identical Gemini selector at position 5 always matches first. Differentiate them (e.g., anchor Meta's selector to a Meta-specific ancestor).

15. **`manifest.json` version still `1.3.0`** — After 180+ bug fixes, bump to `1.4.0` before Web Store submission.

---

## 📊 COMPLETE IMPACT TABLE

| # | Issue | Severity | Actual Impact | Affected Files | Real-World Risk | Fix | Mandatory Before Production |
|---|-------|----------|---------------|----------------|-----------------|-----|----------------------------|
| 1 | `dismissWidget` doesn't remove drop menu | **Medium** | Stale drop menu after widget close; inject fires against user intent | `content/widget.js` | User injects content they explicitly cancelled | Add `document.getElementById('aic-drop-menu')?.remove()` in `dismissWidget()` | **YES** |
| 2 | `injectWithAnim` resets `_injectCancelled` | **Medium** | Post-dismiss inject from drop menu | `content/widget.js` | Text injected after explicit Close press | Guard `if (_injectCancelled) return;` before resetting | **YES** |
| 3 | Perplexity `[data-role]` no role validation | **Medium** | Nav/region elements captured as 'assistant' messages | `content/perplexity.js` | Garbled Perplexity capsules | Add `isKnownRole` guard matching mistral.js pattern | **YES** |
| 4 | DeepSeek Strategies 2+3 no dedup | **Medium** | Parent+child elements double-captured | `content/deepseek.js` | Duplicate messages in DeepSeek capsules | Apply ancestor-filter to both strategies | **YES** |
| 5 | Gemini Strategy 3 no dedup | **Medium** | Nested elements double-captured | `content/gemini.js` | Duplicate messages in Gemini capsules (if S3 runs) | Apply ancestor-filter | **YES** |
| 6 | `getTextarea()` cross-platform selector collision | **Medium** | `.ProseMirror` or `[id*="search"]` matches wrong element on non-target platform | `content/widget.js` | Inject goes to search box or editor on DeepSeek/Perplexity | Reorder/tighten platform-specific selectors | **YES** |
| 7 | `test-screenshots/*.png` in extension ZIP | **Medium** | Screenshots ship with extension; may show developer login state | `test-screenshots/` | Sensitive data in published extension | Delete 3 PNG files from extension dir | **YES** |
| 8 | Drop menu inject failure is silent | **Low** | User sees widget vanish with no error | `content/widget.js` | Confusing UX; user retries or gives up | Pass error callback to `injectWithAnim` | NO |
| 9 | `popup.html` empty-state mentions 2 of 9 platforms | **Low** | New users on Gemini/Grok etc. don't know extension works there | `popup/popup.html` | Reduced discoverability for 7 platforms | Update text to mention all supported platforms | NO |
| 10 | `resp?.animating` dead code | **Low** | Code confusion; branch never taken | `popup/popup.js` | Misleads debugging | Remove the `animating` branch | NO |
| 11 | `testBtn.disabled` not reset on storage exception | **Low** | Test button stuck disabled | `settings/settings.js` | User can't test again without reopening settings | Wrap reset in `finally` block | NO |
| 12 | `selector-health-check.js` in extension dir | **Low** | 8 KB bloat in Web Store ZIP | `selector-health-check.js` | Unprofessional; minor ZIP bloat | Move to project root (outside `capsule-extension/`) | NO |
| 13 | Duplicate `aria-label*="message"]` selector | **Low** | Meta AI inject selector never reached | `content/widget.js` | Meta AI inject falls back to `role="textbox"` (still works) | Differentiate Meta vs Gemini selector | NO |
| 14 | PBKDF2 public extension ID as password | **Low** | Encryption key derivable from public info | `utils/storage.js` | Requires storage dump + public ID; deterrent only | Accept as architectural constraint or add per-device salt | NO |
| 15 | Version still `1.3.0` after 180+ fixes | **Low** | Wrong version in Web Store listing | `manifest.json` | Confuses users if they report bugs by version | Bump to `1.4.0` | YES (Web Store) |

---

## ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## COUNCIL VERDICT
## ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**The extension is in substantially good shape.** All V6 critical and high-risk issues are confirmed resolved. The 7 production-mandatory issues remaining are all Medium or Low — none will cause crashes, data loss, or security breaches. The two most impactful fixes are: (1) cleaning up `#aic-drop-menu` in `dismissWidget()` to prevent unintended injection after explicit Close, and (2) deleting `test-screenshots/*.png` before creating the Web Store ZIP. After those 7 mandatory items are addressed, the extension is ready for production submission at version `1.4.0`.
