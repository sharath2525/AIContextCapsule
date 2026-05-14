# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**AIContext Saver** is a Chrome Manifest V3 extension that captures AI conversations from ChatGPT and Claude, compresses them with an AI API, and injects the saved context into new chats. It uses a dual-capsule system: **Raw** (full conversation) and **Smart** (AI-compressed summary).

## Development Commands

### Load Extension in Chrome
1. Open `chrome://extensions`
2. Enable Developer Mode
3. Click "Load unpacked" → select `capsule-extension/`

### After Code Changes
- Go to `chrome://extensions` → click the refresh icon on the extension card
- Reload the ChatGPT/Claude tab

### Generate Icons (one-time, stdlib only)
```bash
cd capsule-extension
python generate-icons.py
```

### No build step — vanilla JS ES6 modules, zero npm dependencies.

## Architecture

### Extension Structure
```
capsule-extension/
├── manifest.json          # MV3 config — permissions, host_permissions, content_scripts
├── background/
│   └── service-worker.js  # Message router + storage gatekeeper (GET/SAVE/DELETE_CAPSULE)
├── content/
│   ├── chatgpt.js         # DOM scraper for ChatGPT ([data-message-author-role])
│   ├── claude.js          # DOM scraper for Claude ([data-testid="user-message"])
│   ├── inject-capsule.js  # React-aware text injection into chat inputs
│   └── widget.js          # Floating draggable capsule picker widget
├── popup/                 # Extension icon popup — save flow, capsule list, search
├── settings/              # API config page — provider presets + connection test
└── utils/
    ├── capsule.js         # CapsulePair data model + auto-naming
    ├── storage.js         # chrome.storage.local CRUD + 4.8 MB quota enforcement
    └── summarize.js       # OpenAI-compatible API caller + adaptive token budget
```

### Message Flow
1. User clicks Save in popup → popup sends `CAPTURE` to content script
2. Content script scrapes DOM → returns raw conversation text
3. popup calls `summarize.js` → hits configured AI API → gets smart summary
4. popup sends `SAVE_CAPSULE` to service worker → persists CapsulePair in `chrome.storage.local`

### Text Injection (React-aware)
`inject-capsule.js` uses three fallback strategies to mutate React-controlled inputs:
1. `document.execCommand('insertText')` (primary — works with React synthetic events)
2. Selection API + text node insertion
3. `.innerText` assignment
After each attempt it dispatches `input`, `change`, `keydown`, `keyup` to trigger React state sync.

### Summarization
- `summarize.js` adaptively sizes the token budget: 30% of raw char count → 80–480 tokens
- Input is truncated at 28,000 chars before sending to the API
- Smart summary format: 6 sections — GOAL, DECISIONS, STACK, KEY DATA, OUTCOME, NEXT
- Error codes: `API_NOT_CONFIGURED`, `API_AUTH_FAILED`, `API_RATE_LIMITED`

### Storage
- Backend: `chrome.storage.local` (5 MB browser limit)
- Soft warning at 4.5 MB, hard cap enforced at 4.8 MB
- All capsules stored as a JSON array under the `capsules` key

## Key Constraints
- **MV3 service worker**: stateless, no DOM access, wakes on messages only
- **Host permissions**: scoped to `https://chatgpt.com/*` and `https://claude.ai/*` only
- **No CDN, no eval(), no innerHTML injection** — strict CSP (`script-src 'self'`)
- **Zero external dependencies**: no npm, no pip packages beyond Python stdlib
- AI provider is user-configured (NVIDIA Build, Groq, OpenRouter, Anthropic, OpenAI, Ollama) — never hardcoded

## Design System (Claymorphism)
- Colors: Ink `#1A1527`, Cream `#F2F0E8`, Green `#22C55E`, Blue `#3B82F6`, Orange `#F97316`
- Clay buttons: solid background + dark border + bottom box-shadow
- Transitions: `cubic-bezier` spring easing, 0.08s base



# Graphify Context Navigation Rules

## IMPORTANT

This project uses graphify knowledge graphs.

Before reading raw files or scanning the codebase:

1. ALWAYS use graphify first.

Commands:

/graphify query "question"
/graphify explain "function_or_file"
/graphify path "fileA" "fileB"

2. Use graphify-out/GRAPH_REPORT.md for architecture understanding.

3. Use graphify-out/wiki/index.md for project navigation.

4. Only read raw files when:
   - graphify lacks enough detail
   - exact implementation is needed
   - user explicitly asks to read the file

5. NEVER re-read the full codebase unnecessarily.

6. Prefer graph queries over recursive grep/search.

7. After project changes:
   run:
/graphify --update

## Workflow

For understanding architecture:
- use graphify query first

For debugging:
- use graphify path
- use graphify explain

For relationships:
- use graphify query before opening files

For implementation:
- read only targeted files after graph lookup

## Goal

Minimize token usage.
Avoid repeated full-project scans.
Use graph structure as primary navigation layer.

# gstack

**gstack** is an AI-powered engineering toolkit that provides specialized skills for planning, design, testing, security, and shipping.

## Skill Routing

When the user's request matches an available skill below, invoke it via the Skill tool. When in doubt, invoke the skill.

### Key Routing Rules for AIContext Saver

- **Testing the extension UI/flow** → invoke `/qa` — real browser testing of the popup, capsule picker, drag-and-drop, API configuration
- **Security audit (critical for extensions!)** → invoke `/cso` — checks for XSS in DOM injection (`inject-capsule.js`), CSP violations, storage leaks, API key exposure
- **Understanding architecture/data flow** → use `/graphify` first (see Graphify Context Navigation above), then `/plan-eng-review` if validation needed
- **Debugging broken behavior** → invoke `/investigate` — traces why capsules aren't saving, why text injection fails, why storage quota issues occur
- **Design the popup/settings UI** → invoke `/design-html` or `/design-consultation` — generates production-ready HTML/CSS for new UI components
- **Code review before PR** → invoke `/review` — pre-landing review of changes to core files (storage.js, inject-capsule.js, service-worker.js)
- **Ship a release** → invoke `/ship` — creates PR with changelog, version bump, release notes
- **General multi-step planning** → invoke `/autoplan` — auto-generates implementation plans for new features

### Available Skills

`/office-hours`, `/plan-ceo-review`, `/plan-eng-review`, `/plan-design-review`, `/design-consultation`, `/design-shotgun`, `/design-html`, `/review`, `/ship`, `/land-and-deploy`, `/canary`, `/benchmark`, `/browse`, `/qa`, `/qa-only`, `/cso`, `/investigate`, `/document-release`, `/codex`, `/autoplan`, `/careful`, `/freeze`, `/guard`, `/unfreeze`, `/gstack-upgrade`, `/learn`

## Setup

gstack is installed at `~/.claude/skills/gstack/`. No setup needed — skills are available immediately in Claude Code sessions.