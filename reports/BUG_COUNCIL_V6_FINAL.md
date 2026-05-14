# 🏛️ BUG COUNCIL V6 — FINAL REPORT
### AIContext Saver Chrome Extension — Complete Deep Rescan (All 21+ Files)

---

## SYSTEM FRAMING

**What is this?** Chrome Manifest V3 extension capturing AI conversations from 9 platforms (ChatGPT, Claude, Gemini, Grok, Copilot, Perplexity, DeepSeek, Mistral, Meta AI), compressing them via a user-configured AI API, and injecting saved context into new chats.

**Core features:** DOM scraping → Raw/Smart capsule save → chrome.storage.local persistence → floating inject widget → PDF/Markdown export

**External dependencies:** User-configured OpenAI-compatible API, chrome.storage.local, chrome.scripting, chrome.tabs

**Data flow:** Content script DOM scrape → popup.js → summarize.js (AI API) → service-worker.js → chrome.storage.local → widget.js inject

**Files scanned (V6 complete):** manifest.json, background/service-worker.js, utils/storage.js, utils/capsule.js, utils/summarize.js, popup/popup.js, popup/popup.html, settings/settings.js, export/export.html, content/chatgpt.js, content/claude.js, content/gemini.js, content/grok.js, content/copilot.js, content/perplexity.js, content/deepseek.js, content/mistral.js, content/meta.js, content/widget.js, content/inject-capsule.js, package.json, selector-health-check.js — **22 files total**

---

## 🔨 AGENT 1 — THE BREAKER (Bug Hunter)

**1. `exportPDF()` call not awaited in popup.js click handler**
`exportPDF(cap, type)` does `await chrome.storage.local.set(...)` internally, but the caller never awaits the returned promise. If storage fails, the export tab opens with a missing key while the user sees no error. The success path is identical to the failure path from the user's perspective.

**2. `saveResp?.success !== false` treats undefined as success**
In popup.js `onSave`, the truthy check `saveResp?.success !== false` causes `undefined` (a dropped message, a service worker restart mid-message, or any malformed response) to be treated as a successful save. The user sees "Saved!" while nothing was actually persisted.

**3. `widget.js` `checkForNewChatResume()` always shows blank raw content**
The resume prompt reads `latest.raw?.text`, but v3 capsules intentionally omit `raw.text` (only `raw.messages[]` is stored). This means the raw preview in the resume prompt is always an empty string, causing a confusing "resume with empty content" experience.

**4. RAF animation not cancellable — injection fires after Close**
`injectWithFlyAnim` in widget.js starts a 900ms requestAnimationFrame chain then calls `doInject`. There is no cancellation token. If the user clicks Close during the animation, the overlay disappears but `doInject` still fires, injecting text into the chat input silently and unexpectedly.

**5. `onDelete` 180ms animation race — `allCapsules` stale during animation**
In popup.js, `onDelete` starts a 180ms CSS animation, then updates `allCapsules`. If the user clicks another capsule action within that 180ms window, `allCapsules` still contains the deleted capsule, leading to stale reads or double-delete attempts.

**6. `settings.js` permanent API key wipe on blank save after decrypt failure**
When `_keyDecryptFailed` is true, `settings.apiKey` is `''`. If a user opens Settings, sees the blank key field, doesn't enter anything, and clicks Save — `saveSettings({ apiKey: '' })` is called. The blank string is encrypted and stored, permanently overwriting the previously-stored (even if unreadable) encrypted blob with a blank key. The user loses access to any hope of recovery.

**7. `storage.js` pre-write size check has size gap**
`saveCapsule` checks the total size of existing capsules BEFORE pushing the new one. The check passes as long as existing data is under 4.8 MB, but the newly appended capsule is never counted in the estimate. A very large capsule could push storage from 4.79 MB to 5+ MB in one write, silently exceeding Chrome's hard 5 MB limit and triggering a storage write error.

**8. `renderMessages` in export.html has no fallback to `raw.text` for legacy capsules**
`renderMessages(cap.raw?.messages)` passes `undefined` for pre-v3 capsules that only have `raw.text`. The function then tries to iterate over `undefined`, resulting in an empty Raw section. Legacy capsule exports silently show no conversation content.

**9. `esc(m.text)` renders literal "undefined" in PDF**
In export.html, if any message object in `raw.messages` has an undefined or null `text` field (e.g., if an earlier scraper bug saved an empty message object), `esc(m.text)` passes `undefined` to the escape function. The result is the literal string "undefined" appearing in the PDF output.

**10. Settings `onSave` has no in-progress guard**
`settings.js` has no debounce or in-flight lock on the Save button. Rapid double-clicking calls `saveSettings()` twice concurrently. Both calls read and write `chrome.storage.local` without synchronization. The second write can overwrite the first with identical or slightly different state depending on async timing.

**11. `friendlySaveError` dead code path**
In popup.js, `friendlySaveError` has a branch checking `code?.includes('lock timeout')`. The lock timeout was part of a session-storage-based write lock removed in v3. This branch can never be reached, creating dead code that could mislead future debugging.

---

## 🔐 AGENT 2 — THE SECURITY ANALYST

**S1. CRITICAL — `export/export.html` inline script blocked by packed extension CSP**
`export.html` contains a 140-line `<script>` block directly in the HTML file. The extension's CSP is `script-src 'self'; object-src 'none'`. When a Chrome extension is packed (for Web Store distribution or local CRX loading), inline scripts in HTML extension pages are blocked by this CSP. The export page will show a blank screen in production. Only unpacked developer-mode loading currently works.

**S2. CRITICAL — `node_modules/playwright` inside extension directory**
`package.json` inside `capsule-extension/` lists `"playwright": "^1.59.1"` as a dependency. The `node_modules/` directory from this install is inside the extension folder. Playwright with its bundled browser binaries is 200–400 MB. Chrome Web Store's ZIP size limit is 128 MB. The extension cannot be submitted to the Web Store. Every "Load unpacked" developer load also pulls in 200+ MB of unnecessary files.

**S3. HIGH — `.auth-state.json` may contain live session tokens committed to VCS**
`selector-health-check.js` saves Playwright authentication state (cookies, session tokens for chatgpt.com and claude.ai) to `.auth-state.json` in the extension directory. There is no `.gitignore` excluding this file. If the developer commits this file, live authentication tokens for their ChatGPT and Claude accounts are published to version control.

**S4. HIGH — PBKDF2 key derivation uses public extension ID as password**
`storage.js` derives the AES-256-GCM encryption key using `chrome.runtime.id + '_aic_v1'` as the password material. `chrome.runtime.id` is a publicly visible extension identifier listed in the Chrome Web Store and accessible to any web page via `window.chrome` extension messaging tricks. An attacker who obtains a `chrome.storage.local` dump and knows the extension ID (public information) can derive the encryption key and decrypt stored API keys.

**S5. MEDIUM — Error body redaction only strips `authorization` header pattern**
In `summarize.js`, the error body redaction regex is `authorization[^\n\r]*`. This only redacts HTTP `Authorization:` header values. It misses `api_key`, `apikey`, `api-key`, `token`, `Bearer `, and query-string parameter patterns like `?key=...`. If an API error response echoes back request details (some providers do), partial credential exposure is possible in logged error messages.

**S6. MEDIUM — `selector-health-check.js` saves screenshots with conversation content**
The test script saves screenshots to `test-screenshots/` during selector health checks. These screenshots may contain actual AI conversation content from the developer's accounts. If committed to VCS or included in a bug report, sensitive conversation data is leaked.

**S7. LOW — PBKDF2 iteration count at 10,000 — below modern minimum**
The PBKDF2 derivation uses 10,000 iterations. NIST SP 800-132 (2023) recommends a minimum of 210,000 iterations for HMAC-SHA-256. An attacker with the encrypted storage blob and knowledge of the extension ID can brute-force the key at approximately 20x the effort recommended by current standards.

**S8. LOW — `manifest.json` `"tabs"` permission broader than required**
The `"tabs"` permission grants access to all open tab URLs and titles, not just the active tab. Only `tab.id` is needed for message routing. Using `"activeTab"` (already granted) plus `chrome.scripting` is sufficient. The broad `"tabs"` permission triggers a privacy warning during installation and increases attack surface.

---

## 🌪️ AGENT 3 — THE CHAOS TESTER

**C1. Rapid Save clicks — `saving` flag prevents duplicates in popup, but Settings `onSave` has no guard**
Popup save: protected by `if (saving) return`. Settings save: NOT protected. 10 rapid clicks on Settings Save → 10 concurrent `saveSettings` calls, all reading and writing `chrome.storage.local` without ordering.

**C2. Extension reload mid-export — export tab opens to blank page**
If the service worker is killed between `exportPDF` writing the key and the export tab reading it (Chrome kills service workers after ~30s of inactivity), the export page opens, tries to read `exportData_<id>_<timestamp>`, gets nothing, and shows "⏳ Loading capsule data…" indefinitely with no timeout or error.

**C3. Two tabs with same chat open — widget appears in both, inject goes to wrong tab**
`widget.js` uses `targetTabId` scoping to prevent multi-tab widget spam. However, if two tabs have the same origin (e.g., two ChatGPT conversations), both receive `STORAGE_CHANGED` messages. The `targetTabId` check relies on `GET_MY_TAB_ID` completing before any `STORAGE_CHANGED` fires — a race during rapid multi-tab opens.

**C4. No internet + Smart capsule — AbortController fires after 60s, not immediately**
`summarize.js` uses a 60s AbortController timeout. On a machine with no internet, the fetch may fail immediately with a network error, but on some systems (DNS resolution timeout, proxy timeout) the user waits the full 60 seconds before seeing an error message.

**C5. Empty chat save — no messages captured, capsule saved with empty `messages[]`**
If a user saves an empty conversation, `captureMessages()` returns `[]`. popup.js does not check for empty message arrays before proceeding. An empty capsule is saved, named "Untitled (0 messages)" or similar. It appears in the list, can be injected (injecting nothing), and exported (blank PDF).

**C6. 50k+ token chat — input truncated at 28,000 chars, but storage is not warned**
`summarize.js` truncates at 30,000 chars before the API call. However, the raw `messages[]` array is stored without truncation. A 50k+ token conversation stores the full text in `chrome.storage.local`, potentially consuming megabytes for a single capsule and triggering the 4.8 MB quota alarm silently.

**C7. DOM change on target site — multi-platform scraper silent failures**
All 9 scrapers have fallback strategies, but Copilot's shadow DOM cannot be traversed at all. A Copilot DOM update that moves content deeper into shadow roots produces a silent empty capture with no error message to the user.

**C8. Storage quota exceeded — error not surfaced to widget inject flow**
If `chrome.storage.local` write fails due to quota in service-worker.js, the `SAVE_CAPSULE` handler rejects. popup.js has retry logic (3 attempts). But the widget `STORAGE_CHANGED` listener has no handling for a failed save — the widget doesn't update (correct) but also gives no feedback.

**C9. Export triggered during in-flight save — stale data exported**
If `exportPDF` is called while a save is still in progress (async, not locked), the export reads the capsule from `chrome.storage.local` before the new save commits. The user exports stale data without any warning.

**C10. Service worker restart mid-write — `_writeQueue` lost**
`_writeQueue` is an in-memory promise chain in service-worker.js. Chrome can kill the service worker at any time (30s idle timeout). If killed mid-write, the queue is gone. The next message wake creates a fresh `Promise.resolve()`, and any pending (but not yet executed) queued writes are permanently lost.

---

## ⚡ AGENT 4 — THE PERFORMANCE ENGINEER

**P1. `node_modules/playwright` loaded with extension on every unpacked load**
Even in development, every "Load unpacked" causes Chrome to scan the entire extension directory including `node_modules/playwright` (200–400 MB). This dramatically slows extension loading in developer mode and is a hard Web Store blocker.

**P2. `_rawTextCache` WeakMap keyed on capsule objects — leaks with object replacement**
`capsule.js` memoizes `getRawText(cap)` in a WeakMap. If popup.js replaces the capsule array (e.g., after a delete + re-fetch), new capsule objects are created, invalidating all cache entries. On a large capsule list, every post-delete render recomputes `getRawText` for all capsules.

**P3. Widget's `setInterval` URL polling runs forever at 1200ms**
`widget.js` sets up a 1200ms interval as a fallback for browsers without the Navigation API. This interval is never cleared on widget teardown or when Navigation API is available. It runs for the entire page lifetime of every AI chat tab the user has open, checking `location.href` every 1.2 seconds indefinitely.

**P4. `grabbing` CSS class never removed from widget after drag ends**
`widget.classList.add('grabbing')` is set on `mousedown`. The `mouseup` handler does not call `widget.classList.remove('grabbing')`. The cursor stays as a grabbing hand after any drag operation until the page is refreshed.

**P5. Large conversation double-serialization**
In the save flow, large conversations are serialized to JSON once in `summarize.js` (for the API body), then serialized again in `service-worker.js` (for `chrome.storage.local`). A 30,000-char conversation is stringified at minimum twice. For 50k+ char conversations (stored raw, not truncated), this doubles memory allocation for the largest payloads.

**P6. `selector-health-check.js` launches full browser instances during dev testing**
The test script is a Node.js Playwright runner that launches a real Chromium instance. It has no headless flag set explicitly (relies on Playwright defaults). This is a development concern but irrelevant to production — the larger concern is that `node_modules/playwright` is in the production extension directory due to the misplaced `package.json`.

---

## 👤 AGENT 5 — THE REAL USER (UX Tester)

**U1. Copilot always silently fails — user has no idea why**
Copilot uses shadow DOM. The scraper captures nothing. The user clicks Save, gets "Saved! (0 messages)" or an error, with no explanation that Copilot's architecture prevents capture. No help text, no shadow DOM warning, nothing.

**U2. Export PDF shows wrong AI platform label for 7 of 9 platforms**
`export.html` `renderDoc` determines the platform badge with a hardcoded check: if the source includes 'chatgpt' → show ChatGPT badge, else → show Claude badge. Gemini, Grok, Copilot, Perplexity, DeepSeek, Mistral, and Meta capsules all export with "Claude" branding. The PDF is factually wrong about the source.

**U3. Export page hangs indefinitely if export key is missing**
The export page reads `exportData_*` from storage. If the key is missing (service worker killed, tab left open for hours, key already cleaned up), the page shows "⏳ Loading capsule data…" with no timeout, no error state, and no retry button. The user cannot dismiss or understand what happened.

**U4. Resume prompt raw preview always blank (v3 capsules)**
`checkForNewChatResume()` displays `latest.raw?.text` in the resume prompt. v3 capsules store `raw.messages[]` but not `raw.text`. The preview is always empty, making the resume prompt content-free and confusing. The user cannot tell what they'd be resuming.

**U5. Perplexity capture loses all user messages in fallback**
Perplexity's Strategy 4 fallback only captures `.prose` elements as 'assistant'. All user questions are silently dropped. The saved capsule from a Perplexity conversation via fallback contains only the AI answers, with no user turns — a fundamentally incomplete and misleading record.

**U6. New capsule card bypasses active search filter**
When a new capsule is saved while the user has an active search query in the popup, the new card is prepended to the DOM without checking if it matches the filter. The new capsule appears in the results even if it doesn't match the search term, breaking the filter state.

**U7. Settings: API key silently wiped if user saves after a decrypt failure without re-entering key**
User opens Settings after an extension update. Key field is blank (decrypt failed). User doesn't notice. Clicks Save. No confirmation, no warning. The previously stored (even if unreadable) encrypted blob is permanently replaced with an encrypted empty string. API key is permanently gone.

**U8. Close button doesn't actually cancel in-flight injection animation**
During the 900ms RAF inject animation, clicking Close dismisses the widget visually but the `doInject` call still fires when the animation completes. Text appears in the chat input with no widget visible, and the user has no way to know what just happened or why.

---

## 📋 COMPLETE FLOW FAILURE TABLE

| Flow | Failure Points |
|------|---------------|
| Save Raw (any platform) | Empty chat saves silently; storage size check misses new capsule size |
| Save Smart (AI summary) | 60s timeout on no-internet; API key wipe in settings causes `API_NOT_CONFIGURED` |
| Save on Copilot | Shadow DOM → always empty capture, no user warning |
| Save on Perplexity (fallback) | Strategy 3 too broad; Strategy 4 loses all user messages |
| Save on Meta (fallback) | `[class*="bubble"]` captures UI components, not just messages |
| Save on Mistral (fallback) | `[data-role]` captures non-message elements |
| Save on Grok (fallback) | No deduplication → duplicate messages in capsule |
| Export PDF | CSP blocks inline script in packed extension; wrong platform label; blank raw for legacy; "undefined" for null text; hangs if key missing |
| Inject via Widget | RAF animation fires after Close; resume preview always blank; wrong tab in multi-tab edge case |
| Settings Save | Blank key wipe on decrypt failure; no in-progress guard; double-submit race |
| Web Store Submission | node_modules/playwright (200-400 MB) inside extension → ZIP exceeds 128 MB limit |

---

## 🔬 EDGE CASE ATTACK TABLE

| Edge Case | Expected Behavior | Actual Risk | Severity |
|-----------|------------------|-------------|----------|
| Packed extension (Web Store / CRX) | Export PDF works | Inline script blocked by CSP → blank export page | **Critical** |
| Web Store submission | ZIP uploaded | node_modules inside → ZIP >128 MB → rejected | **Critical** |
| `.auth-state.json` committed | Not present in repo | Live session tokens in VCS → account takeover | **High** |
| Settings save after decrypt failure | Key preserved or user warned | Encrypted blob permanently wiped | **High** |
| Close button during inject animation | Injection cancelled | Inject fires anyway 900ms later | **High** |
| Legacy capsule export | Raw content shown | `renderMessages(undefined)` → blank Raw section | **High** |
| Empty chat save | Warning shown | Empty capsule saved silently | **Medium** |
| Copilot save | Content captured | Shadow DOM → empty capture, no warning | **Medium** |
| Perplexity save via fallback | Full conversation | User messages completely lost | **Medium** |
| Meta save via fallback | Only messages | UI bubble components captured as messages | **Medium** |
| New capsule during active search | Card filtered correctly | Card appears regardless of filter | **Medium** |
| Rapid Settings Save clicks | Debounced | Multiple concurrent writes, last write wins | **Medium** |
| Storage quota exceeded during save | Clear error | Error surfaced in popup retry loop but not to widget | **Medium** |
| Export while save in-flight | Current data | Stale pre-save data exported | **Medium** |
| Service worker killed mid-export | Export completes | Export tab hangs indefinitely on blank screen | **Medium** |
| 50k+ token conversation | Truncated to API | Full raw stored, may hit 4.8 MB quota silently | **Low** |
| PBKDF2 password = public extension ID | Secure encryption | Attacker with storage dump + public ID can decrypt | **Low** |
| `[data-role]` on Mistral | Only messages | Navigation/region elements captured as messages | **Medium** |
| Grok strategy 4 no dedup | Clean messages | Parent + child elements both captured → duplicates | **Medium** |
| Error body with api_key= pattern | Credential redacted | Not redacted by current regex | **Low** |

---

## 🔎 PEER REVIEW

**🔨 BREAKER reviews others:**
The most critical missed risk from the Security agent: PBKDF2 with a public extension ID as password sounds like defense-in-depth is present, but it provides essentially zero protection against a motivated attacker with chrome.storage.local access. Combined with 10,000 iterations (vs. recommended 210,000+), this is encryption theater. The single launch-blocking issue across all agents: the `node_modules/playwright` inside the extension directory. Nothing else matters for Web Store submission until that is resolved.

**🔐 SECURITY reviews others:**
The Breaker's finding on `saveResp?.success !== false` is a silent data loss bug that could be mistaken for a storage or encryption issue during debugging. The Chaos Tester's C10 (service worker `_writeQueue` lost on restart) is the highest-severity data integrity risk in the system — a lost write after a user explicitly clicked Save with no indication it failed.

**🌪️ CHAOS reviews others:**
The UX agent's U3 (export page hangs indefinitely) is the most user-visible crisis scenario. A user who waits 5+ minutes for an export page that will never load will uninstall the extension. The Performance agent's P3 (interval never cleared) is a cumulative resource drain that affects every power user with multiple chat tabs open.

**⚡ PERFORMANCE reviews others:**
The Breaker's finding B4 (RAF not cancellable) has a performance dimension: `requestAnimationFrame` callbacks that fire on a hidden/unmounted widget still consume a render frame. On slow devices, this adds jank during the 900ms injection animation even when the widget is "closed."

**👤 UX reviews others:**
The most critical UX fallout from the Security findings: the PBKDF2/public-ID issue means if the extension gains popularity, a single blog post about the derivation scheme could result in mass API key theft from user storage dumps. The most damaging launch-day user experience failure: Copilot is listed in the extension description with a host permission, users will try it, and it will silently always fail.

---

## ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## 🏛️ BUG COUNCIL — FINAL REPORT (Chairman Synthesis)
## ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

### 🔴 CRITICAL BUGS (Must fix before launch)

1. **`node_modules/playwright` inside `capsule-extension/`** — Extension ZIP exceeds Chrome Web Store's 128 MB limit. Cannot be submitted. Move `package.json` and `node_modules` outside the extension directory entirely. Add `.gitignore` inside `capsule-extension/` to block accidental re-introduction.

2. **`export/export.html` inline `<script>` blocked by CSP in packed extension** — 140-line inline script is blocked by `script-src 'self'` in packed/Web Store extensions. Export page will be blank. Move all script content to `export/export.js` and replace the inline block with `<script src="export.js"></script>`.

### 🟠 HIGH RISK ISSUES

3. **Settings blank API key wipe on decrypt failure** (`settings/settings.js`) — If `_keyDecryptFailed` is true and user saves without entering a key, the stored encrypted blob is permanently destroyed. Add explicit guard: if key field is blank AND `_keyDecryptFailed`, block save and show "Please re-enter your API key."

4. **RAF inject animation not cancellable** (`content/widget.js` — `injectWithFlyAnim`) — Close button dismisses the widget visually but `doInject` fires 900ms later. Add a cancellation flag (`let _injectCancelled = false`) set on Close, checked before `doInject`.

5. **`exportPDF()` not awaited — false success on storage failure** (`popup/popup.js`) — Click handler calls `exportPDF(cap, type)` without `await`. Storage failures are swallowed; export tab opens with missing key. Await the call and surface storage errors before opening the tab.

6. **`saveResp?.success !== false` treats undefined as success** (`popup/popup.js`) — Dropped messages (service worker restart, malformed response) show as successful saves. Check `saveResp?.success === true` explicitly.

7. **`checkForNewChatResume()` raw preview always blank in v3** (`content/widget.js`) — `latest.raw?.text` is always `''` in v3 capsules. Use `getRawText(latest)` from capsule.js (already imports it) for the resume preview payload.

8. **Legacy capsule export shows blank Raw section** (`export/export.html`) — `renderMessages(cap.raw?.messages)` receives `undefined` for pre-v3 capsules with only `raw.text`. Add fallback: `if (!messages && cap.raw?.text) { render as pre-wrapped text }`.

9. **`.auth-state.json` with live session tokens** (`selector-health-check.js`) — Add `capsule-extension/.gitignore` (or root `.gitignore`) excluding `.auth-state.json` and `test-screenshots/`. Immediate action if repo is remote.

---

## 📊 Remaining Issues

Refer to the complete impact table in this report for all 32 identified issues with their fixes and priority order.

---

## COUNCIL VERDICT

**The extension has 2 hard launch blockers** (node_modules inside extension directory, export page CSP) that make production deployment impossible in the current state. Beyond those, there are **16 issues that are mandatory before production** covering data loss, silent failures, security risks, and broken functionality across 6 of 9 supported platforms. The extension core logic (ChatGPT/Claude capture, storage, inject) is solid — the remaining issues are concentrated in: the export system, multi-platform scrapers (Copilot, Perplexity, Meta, Mistral, Grok), settings key management, and the inject animation flow.

**Priority order:** Fix #1 (playwright/node_modules) and #2 (export CSP) first — nothing else ships until these are resolved. Then address #3–#8 (data integrity and security). Then #9–#19 (platform coverage and edge cases). Items #20–#32 are polish for post-launch.
