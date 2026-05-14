# Privacy Policy — AIContext Saver Chrome Extension

**Last updated:** May 2026

## The Short Version

All your data stays on your device. AIContext Saver has **no servers**. We never collect, receive, or see your conversations or API keys.

---

## What the Extension Stores (Locally On Your Device Only)

| Data | Where | Purpose |
|------|-------|---------|
| AI conversation text | `chrome.storage.local` | Saved capsule content you explicitly chose to save |
| AI-generated summaries | `chrome.storage.local` | Smart capsule produced from your configured API |
| Your API key, URL, model | `chrome.storage.local` (AES-256-GCM encrypted) | Used to call the AI API you configured |
| Theme preference (light/dark) | `localStorage` | UI preference only |

## What We Do NOT Do

- We have **no servers**, no databases, no telemetry endpoints.
- We do **not** read your conversations without you clicking Save.
- We do **not** collect analytics, crash reports, or usage metrics.
- We do **not** sell, share, or transfer any data to any third party.
- We do **not** store anything outside your local browser storage.
- We do **not** access your AI platform passwords, cookies, or account credentials.

## Third-Party API Transmission

When you save a capsule, the extension sends conversation text directly from your browser to **the AI API you configure** (e.g., NVIDIA Build, Groq, OpenRouter, OpenAI, Ollama). This:

- Goes directly browser → your API. Never through our servers (we have none).
- Is governed by the privacy policy of your chosen provider.
- Only happens when you click **Save**.
- Can be skipped entirely using Ollama (local, no internet required).

## Permissions and Why They're Needed

| Permission | Why |
|-----------|-----|
| `storage` | Save and retrieve your capsules from `chrome.storage.local` |
| `activeTab` | Read the AI conversation from the tab you are on when you click Save |
| `scripting` | Inject the context text into the chat input field |
| Host permissions (chatgpt.com, claude.ai, etc.) | Read conversations and inject text on supported AI platforms only |

## Security

- API keys are encrypted with **AES-256-GCM** (PBKDF2, 100,000 iterations, SHA-256).
- Strict CSP: `script-src 'self'; object-src 'none'` — no external scripts, no eval().
- Storage limit enforced at 4.8 MB to prevent abuse.
- No `<all_urls>` or wildcard permissions — only the 9 specific AI platforms listed.

## Children's Privacy

This extension does not collect personal information from any user, including children under 13.

## Contact

For questions or concerns, open an issue at:  
[https://github.com/sharath2525/AIContextCapsule/issues](https://github.com/sharath2525/AIContextCapsule/issues)
