# AIContext Saver — Chrome Extension

A Chrome Manifest V3 extension that captures AI conversations from **ChatGPT** and **Claude**, compresses them with an AI API, and injects the saved context into new chats.

Uses a dual-capsule system:
- 🔴 **Raw** — full conversation text
- 🔵 **Smart** — AI-compressed structured summary (6 sections: GOAL, DECISIONS, STACK, KEY DATA, OUTCOME, NEXT)

---

## Features

### Core
- One-click capture of any ChatGPT or Claude conversation
- AI summarization via any OpenAI-compatible API (NVIDIA Build, Groq, OpenRouter, OpenAI, Ollama, Claude via OpenRouter)
- Inject Raw or Smart capsule directly into the chat input with a single click
- Floating page widget (🫧 bubble) for drag-and-drop injection

### Popup UI
- **3-step save progress indicator** — Capturing → Summarizing → Saving (animated, color-coded)
- **Storage bar** — thin strip below header shows live MB used out of 5 MB with green → yellow → red fill
- **Auto-naming from GOAL** — capsule name is extracted from the AI summary's GOAL section automatically if you leave the name field blank
- **Source filter pills** — filter capsule list by All / ChatGPT / Claude
- **Collapsible export options** — export buttons (MD, PDF, Summary PDF) hidden behind a toggle to reduce card clutter
- **Smart summary structured preview** — sections (GOAL, DECISIONS, STACK, etc.) rendered as labeled cards inside the preview pane
- Full-text search across name, smart summary, and tags

### Widget (on chat pages)
- Appears as a compact 🫧 bubble (52px) — expands on click to show Inject Raw / Inject Smart buttons
- Draggable — drop onto the textarea to get a Raw/Smart choice popover
- Flying capsule animation with bezier arc, rotation, landing ring, and burst effect

### Settings
- Quick-fill presets for 6 providers (NVIDIA Build, Groq, OpenRouter, Ollama, OpenAI, Claude via OpenRouter)
- Test Connection before saving
- Free setup guide (collapsible — click to expand)

### Design
- Claymorphism / Neo-Brutalism — cream backgrounds, 2px ink borders, offset box-shadows, spring-easing transitions
- **Dark mode** — full `prefers-color-scheme: dark` support across popup, settings, and widget
- **Improved fonts** — `'Segoe UI Variable'` (Windows 11) → `system-ui` → `Inter` fallback chain

---

## Installation

1. Clone or download this repository
2. Open `chrome://extensions` in Chrome
3. Enable **Developer Mode** (top right toggle)
4. Click **Load unpacked** → select the `capsule-extension/` folder
5. The extension icon appears in your toolbar

### After code changes
Go to `chrome://extensions` → click the refresh icon on the extension card → reload the ChatGPT/Claude tab.

---

## Setup (API)

The extension requires an OpenAI-compatible API to generate Smart summaries.

**Recommended free option — NVIDIA Build:**
1. Sign up free at [build.nvidia.com](https://build.nvidia.com) (no credit card)
2. Get API key → copy the `nvapi-…` key
3. Open extension Settings → click **NVIDIA Build** preset → paste your key
4. Click **Test Connection** → **Save Settings**

**Other free options:**
- [Groq](https://console.groq.com) — very fast, generous free tier
- [OpenRouter](https://openrouter.ai) — access many models, some free
- [Ollama](https://ollama.com) — run locally, completely free

---

## Usage

### Save a capsule
1. Open any ChatGPT or Claude conversation
2. Click the extension icon → optionally name the capsule
3. Click **💾 Save** — watch the progress: Capturing → Summarizing → Saving
4. Both Raw (full) and Smart (summary) are saved

### Inject into a new chat
**From the popup:**
- Click **RAW** or **SMART** on any capsule card to inject directly
- Filter by source (All / ChatGPT / Claude) or search by name/content

**From the page widget:**
- Click **🚀 Activate** on a capsule → a 🫧 bubble appears on the chat page
- Click the bubble to expand → choose Inject Raw or Inject Smart
- Or drag the expanded widget onto the textarea and pick Raw/Smart from the drop menu

### Export
Click the **⬇** button on any card to reveal:
- 📄 **MD** — Markdown file download
- 📃 **PDF** — full conversation (opens print dialog)
- 🔵 **Sum PDF** — smart summary only

---

## Architecture

```
capsule-extension/
├── manifest.json              # MV3 config — permissions, host_permissions, content_scripts
├── background/
│   └── service-worker.js      # Message router + storage gatekeeper (GET/SAVE/DELETE_CAPSULE)
├── content/
│   ├── chatgpt.js             # DOM scraper for ChatGPT
│   ├── claude.js              # DOM scraper for Claude
│   ├── inject-capsule.js      # React-aware text injection (3 fallback strategies)
│   └── widget.js              # Floating bubble widget — collapsed 🫧 → expanded panel
├── popup/
│   ├── popup.html             # Extension popup (380px wide)
│   ├── popup.css              # Claymorphism design system + dark mode
│   └── popup.js              # Save flow, filter pills, card builder, inject logic
├── settings/
│   ├── settings.html          # API config page with collapsible guide
│   ├── settings.css           # Settings styles + dark mode
│   └── settings.js            # Preset fill, test connection, guide toggle
├── utils/
│   ├── capsule.js             # CapsulePair data model + auto-naming
│   ├── storage.js             # chrome.storage.local CRUD + quota enforcement
│   └── summarize.js           # OpenAI-compatible API caller + adaptive token budget
└── export/
    └── export.html            # PDF export page
```

### Message flow
1. User clicks **Save** in popup → popup sends `CAPTURE` to content script
2. Content script scrapes DOM → returns message array
3. Popup calls `summarize.js` → hits configured AI API → structured summary
4. Auto-names capsule from GOAL section if no name given
5. Popup sends `SAVE_CAPSULE` to service worker → persists to `chrome.storage.local`

### Text injection (React-aware)
`inject-capsule.js` uses three fallback strategies:
1. `document.execCommand('insertText')` — primary, works with React synthetic events
2. Selection API + text node insertion
3. `.innerText` assignment

Fires `input`, `change`, `keydown`, `keyup` after each attempt to trigger React state sync.

### Summarization
- Adaptive token budget: 50% of raw char count, clamped 300–1500 tokens
- Input truncated at 28,000 chars (first 10k + last 18k) before sending
- Structured 6-section output: GOAL, DECISIONS, STACK, KEY DATA, OUTCOME, NEXT
- 45-second fetch timeout
- Error codes: `API_NOT_CONFIGURED`, `API_AUTH_FAILED`, `API_RATE_LIMITED`, `API_TIMEOUT`

### Storage
- Backend: `chrome.storage.local` (5 MB browser limit)
- Soft warning at 4.5 MB (storage bar turns yellow), hard cap at 4.8 MB (bar turns red)
- Storage bar always visible — shows live usage as a thin colored strip below the header

---

## Constraints

- **MV3 service worker** — stateless, no DOM access, wakes on messages only
- **Host permissions** scoped to `https://chatgpt.com/*` and `https://claude.ai/*` only
- **No CDN, no eval(), no innerHTML from untrusted data** — strict CSP (`script-src 'self'`)
- **Zero external dependencies** — vanilla JS ES6 modules, no npm, no build step

---

## Design System

**Claymorphism / Neo-Brutalism:**

| Token | Value | Use |
|-------|-------|-----|
| Cream | `#F2F0E8` | Page background |
| White | `#FFFFFF` | Card surface |
| Ink | `#1A1527` | Borders + shadows |
| Green | `#22C55E` | Save, ChatGPT accent, storage bar |
| Orange | `#F97316` | Raw inject |
| Blue | `#3B82F6` | Smart inject |
| Purple | `#8B5CF6` | Claude accent, preview |
| Red | `#EF4444` | Delete, danger storage |

**Dark mode palette** (auto via `prefers-color-scheme: dark`):

| Token | Value |
|-------|-------|
| Background | `#16141f` |
| Surface | `#1e1c2b` |
| Ink (borders) | `#d4d0e8` |
| Text | `#ede9fd` |

Clay buttons: solid background + 2px dark border + offset `box-shadow` (no blur).  
Transitions: `cubic-bezier` spring easing, 0.08s base, 0.25–0.45s for widget/expand animations.

---

## Generating Icons

One-time setup using Python stdlib only:

```bash
cd capsule-extension
python generate-icons.py
```
