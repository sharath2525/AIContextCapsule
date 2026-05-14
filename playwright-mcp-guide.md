# Playwright MCP Testing Guide
## For: AIContext Saver Chrome Extension

---

## What This Actually Is (Plain English)

You work in VS Code terminal. You type messages to Claude. Claude opens a real browser automatically and tests your extension. You watch it happen and Claude reports back what it found.

No writing test code yourself. Just talk to Claude.

---

## ONE-TIME SETUP (Do this once, never again)

Open your VS Code terminal and run these 3 commands:

```bash
# Step 1: Install Claude Code (the terminal version of Claude)
npm install -g @anthropic-ai/claude-code

# Step 2: Log in to your Anthropic account
claude login

# Step 3: Add Playwright as a tool Claude can use
claude mcp add playwright npx @playwright/mcp@latest
```

Done. Now Claude in your terminal can control a browser.

---

## HOW TO START (Every time you want to test)

```bash
# Go to your extension folder
cd path/to/capsule-extension

# Start Claude in your project
claude
```

You'll see a `>` prompt. Now type your requests.

---

## THE PROMPTS — Copy and paste these exactly

### TEST 1: Check if ChatGPT scraping still works

Paste this into the Claude terminal:

```
Open https://chatgpt.com in a browser and wait for it to fully load. 
Then check if elements matching the CSS selector [data-message-author-role] 
exist anywhere on the page. Also check for any elements that look like 
chat message containers. Take a screenshot. Tell me:
1. Does [data-message-author-role] exist? 
2. If not, what selector should I use instead in chatgpt.js?
```

**What Claude does:** Opens real Chrome → goes to ChatGPT → inspects the DOM → takes a screenshot → gives you a verdict.

---

### TEST 2: Check if Claude.ai scraping still works

```
Open https://claude.ai in a browser and wait for it to fully load.
Check if elements matching [data-testid="user-message"] exist on the page.
Also look for what selector could grab the main chat input textarea.
Take a screenshot. Tell me:
1. Does [data-testid="user-message"] exist?
2. What is the exact selector for the chat input box right now?
```

---

### TEST 3: Test text injection into Claude.ai input

```
Open https://claude.ai in a browser. Find the chat input box (the area 
where you type messages). Click on it, then try to type the text: 
"INJECTION TEST - Hello World 123"

Take a screenshot showing whether the text appeared in the input box.
Tell me:
1. Did the text appear successfully?
2. What selector did you use to find the input?
3. Did you need to click anything first to get to the input?
```

**This tests your inject-capsule.js logic directly.**

---

### TEST 4: Check if ChatGPT DOM changed (weekly maintenance check)

```
Open https://chatgpt.com and have a look at the page structure.
I need to know if these selectors from my content script still work:
- [data-message-author-role] — for finding messages
- [data-message-author-role="user"] — for user messages specifically  
- [data-message-author-role="assistant"] — for AI responses

Check all three. Screenshot the page. Tell me which ones work and 
which ones I need to update in chatgpt.js.
```

---

### TEST 5: Full flow check (both sites in one go)

```
I have a Chrome extension that scrapes conversations. 
Please do the following in order:

1. Open https://chatgpt.com — check if [data-message-author-role] selector works
2. Take a screenshot of ChatGPT
3. Open https://claude.ai — check if [data-testid="user-message"] works  
4. Try clicking the claude.ai input box and typing "test"
5. Take a screenshot of Claude.ai

Give me a full report:
- Which selectors are broken vs working
- What the current correct selectors should be
- Any notable UI changes I should know about
```

---

### TEST 6: Test your actual extension loaded in Chrome

This one loads your real extension into the browser:

```
I need to test my Chrome extension. The extension folder is at: 
[PASTE YOUR ACTUAL PATH HERE, e.g. C:\Users\yourname\projects\capsule-extension]

Please launch Chrome with this extension loaded (use --load-extension flag).
Then navigate to https://chatgpt.com.
Take a screenshot showing the page with the extension loaded.
Tell me if you can see any extension UI (like a floating widget) on the page.
```

---

## HOW TO RUN THESE AS AUTOMATED TESTS (No manual prompting)

Once you've confirmed the selectors work, you can ask Claude to write 
a test file you can run anytime:

```
Based on what we found, write me a Playwright test file called 
selector-health-check.js that:
1. Opens chatgpt.com and checks [data-message-author-role]
2. Opens claude.ai and checks [data-testid="user-message"]  
3. Tries to type into the claude.ai input
4. Prints PASS or FAIL for each check
5. Saves screenshots to a /test-screenshots folder

I want to run this with: node selector-health-check.js
```

After Claude writes the file, just run:
```bash
node selector-health-check.js
```

You'll get a report without opening Claude at all.

---

## WHAT TO DO WHEN CHATGPT/CLAUDE UPDATES THEIR UI

1. Run TEST 4 or TEST 5 above
2. Claude tells you which selectors broke
3. Ask: `Update chatgpt.js with the correct selectors you just found`
4. Claude edits your file directly

Done. No manual DOM inspection needed.

---

## QUICK REFERENCE: Your Extension's Current Selectors

| File | Selector | Tests On |
|------|----------|----------|
| chatgpt.js | `[data-message-author-role]` | chatgpt.com |
| claude.js | `[data-testid="user-message"]` | claude.ai |
| inject-capsule.js | React textarea input | Both sites |

---

## TROUBLESHOOTING

**"claude: command not found"** → Re-run `npm install -g @anthropic-ai/claude-code`

**"playwright not found"** → Run `npx playwright install chromium`

**Claude opens browser but it closes immediately** → Add "keep the browser open" to your prompt

**Selectors not found** → The site updated. Run TEST 4 to find new selectors.
