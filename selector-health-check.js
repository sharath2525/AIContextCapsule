/**
 * Selector Health Check — AIContext Saver Chrome Extension
 * Run with: node selector-health-check.js
 *
 * First run: opens browser → log in to ChatGPT + Claude.ai → press Enter in terminal
 * Every run after: cookies are loaded automatically, no login needed.
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const SCREENSHOT_DIR = path.join(__dirname, 'test-screenshots');
const AUTH_FILE      = path.join(__dirname, '.auth-state.json');

function prompt(question) {
  return new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, ans => { rl.close(); resolve(ans); });
  });
}

async function ensureAuth(browser) {
  if (fs.existsSync(AUTH_FILE)) {
    console.log('  🔑  Loaded saved login session from .auth-state.json\n');
    return await browser.newContext({ storageState: AUTH_FILE });
  }

  // First run — open browser and let user log in
  console.log('\n  🔐  FIRST-TIME SETUP: No saved session found.');
  console.log('      A browser window will open. Log in to both:');
  console.log('        1. https://chatgpt.com');
  console.log('        2. https://claude.ai');
  console.log('      Then come back here and press Enter.\n');

  const setupCtx = await browser.newContext();
  const p1 = await setupCtx.newPage();
  await p1.goto('https://chatgpt.com');
  const p2 = await setupCtx.newPage();
  await p2.goto('https://claude.ai');

  await prompt('  ⏳  Press Enter once you are logged in to both sites...');

  await setupCtx.storageState({ path: AUTH_FILE });
  console.log('  ✅  Session saved to .auth-state.json — future runs skip this step.\n');
  await p1.close();
  await p2.close();
  await setupCtx.close();

  return await browser.newContext({ storageState: AUTH_FILE });
}

async function run() {
  if (!fs.existsSync(SCREENSHOT_DIR)) fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

  const results = [];
  const browser = await chromium.launch({ headless: false });
  const context  = await ensureAuth(browser);

  function log(label, pass, detail = '') {
    const status = pass ? '✅ PASS' : '❌ FAIL';
    console.log(`  ${status}  ${label}${detail ? '  →  ' + detail : ''}`);
    results.push({ label, pass, detail });
  }

  function skip(label, reason = '') {
    console.log(`  ⏭️  SKIP  ${label}${reason ? '  →  ' + reason : ''}`);
    results.push({ label, pass: null, detail: reason });
  }

  // ── TEST 1: ChatGPT selectors ────────────────────────────────────────────
  console.log('📋  TEST 1 — ChatGPT selector audit (chatgpt.js)\n');
  const cgPage = await context.newPage();
  await cgPage.goto('https://chatgpt.com');
  await cgPage.waitForTimeout(2000);

  try {
    await cgPage.fill('#prompt-textarea', 'Hello, selector health check.');
    await cgPage.keyboard.press('Enter');
    await cgPage.waitForTimeout(6000);
  } catch {
    console.log('  ⚠️  Could not send test message on ChatGPT');
  }

  const cgResult = await cgPage.evaluate(() => {
    const sel = s => document.querySelectorAll(s).length;
    return {
      all:       sel('[data-message-author-role]'),
      user:      sel('[data-message-author-role="user"]'),
      assistant: sel('[data-message-author-role="assistant"]'),
      turns:     sel('[data-testid^="conversation-turn-"]'),
      input:     sel('#prompt-textarea'),
    };
  });

  log('[data-message-author-role]',             cgResult.all > 0,       `${cgResult.all} element(s)`);
  log('[data-message-author-role="user"]',      cgResult.user > 0,      `${cgResult.user} element(s)`);
  log('[data-message-author-role="assistant"]', cgResult.assistant > 0, `${cgResult.assistant} element(s)`);
  log('[data-testid^="conversation-turn-"]',    cgResult.turns > 0,     `${cgResult.turns} element(s) — fallback`);
  log('#prompt-textarea (input)',               cgResult.input > 0,     `${cgResult.input} element(s)`);

  await cgPage.screenshot({ path: path.join(SCREENSHOT_DIR, 'chatgpt.png') });
  console.log('  📸  Screenshot → test-screenshots/chatgpt.png\n');
  await cgPage.close();

  // ── TEST 2: Claude.ai selectors ──────────────────────────────────────────
  console.log('📋  TEST 2 — Claude.ai selector audit (claude.js)\n');
  const clPage = await context.newPage();
  await clPage.goto('https://claude.ai/new');
  await clPage.waitForTimeout(3000);

  const isLoggedIn = await clPage.evaluate(() => !window.location.href.includes('/login'));

  if (!isLoggedIn) {
    console.log('  ⚠️  Not logged in — delete .auth-state.json and re-run to log in again');
    skip('[data-testid="user-message"]',              'not logged in');
    skip('.font-claude-response (assistant)',          'not logged in');
    skip('div.ProseMirror[contenteditable] (input)',  'not logged in');
  } else {
    try {
      await clPage.click('div.ProseMirror[contenteditable="true"]');
      await clPage.fill('div.ProseMirror[contenteditable="true"]', 'Selector health check test.');
      await clPage.keyboard.press('Enter');
      await clPage.waitForTimeout(7000);
    } catch (e) {
      console.log('  ⚠️  Could not send test message on Claude.ai:', e.message);
    }

    const clResult = await clPage.evaluate(() => {
      const sel = s => document.querySelectorAll(s).length;
      return {
        userMessage:     sel('[data-testid="user-message"]'),
        fontClaudeResp:  sel('.font-claude-response'),
        proseMirror:     sel('div.ProseMirror[contenteditable="true"]'),
        chatInput:       sel('[data-testid="chat-input"]'),
      };
    });

    log('[data-testid="user-message"]',               clResult.userMessage > 0,    `${clResult.userMessage} element(s)`);
    log('.font-claude-response (assistant messages)',  clResult.fontClaudeResp > 0, `${clResult.fontClaudeResp} element(s)`);
    log('div.ProseMirror[contenteditable] (input)',   clResult.proseMirror > 0,    `${clResult.proseMirror} element(s)`);
    log('[data-testid="chat-input"] (input wrapper)', clResult.chatInput > 0,      `${clResult.chatInput} element(s)`);
  }

  await clPage.screenshot({ path: path.join(SCREENSHOT_DIR, 'claude-ai.png') });
  console.log('  📸  Screenshot → test-screenshots/claude-ai.png\n');
  await clPage.close();

  // ── TEST 3: Text injection ───────────────────────────────────────────────
  console.log('📋  TEST 3 — Text injection into ChatGPT (#prompt-textarea)\n');
  const injPage = await context.newPage();
  await injPage.goto('https://chatgpt.com');
  await injPage.waitForTimeout(2000);

  try {
    await injPage.click('#prompt-textarea');
    await injPage.fill('#prompt-textarea', 'INJECTION TEST - Hello World 123');
    const val = await injPage.evaluate(() => {
      const el = document.querySelector('#prompt-textarea');
      return el ? (el.value || el.innerText || el.textContent) : '';
    });
    const ok = val.includes('INJECTION TEST');
    log('Text injection via #prompt-textarea', ok, ok ? 'text appeared in input' : `got: "${val}"`);
  } catch (e) {
    log('Text injection via #prompt-textarea', false, e.message);
  }

  await injPage.screenshot({ path: path.join(SCREENSHOT_DIR, 'injection-test.png') });
  console.log('  📸  Screenshot → test-screenshots/injection-test.png\n');
  await injPage.close();

  // ── SUMMARY ──────────────────────────────────────────────────────────────
  console.log('══════════════════════════════════════════════');
  console.log('  SELECTOR HEALTH CHECK — SUMMARY');
  console.log('══════════════════════════════════════════════');
  const passed  = results.filter(r => r.pass === true).length;
  const failed  = results.filter(r => r.pass === false).length;
  const skipped = results.filter(r => r.pass === null).length;
  results.forEach(r => {
    const icon = r.pass === true ? '✅' : r.pass === false ? '❌' : '⏭️ ';
    console.log(`  ${icon}  ${r.label}`);
  });
  console.log(`\n  Total: ${passed} passed, ${failed} failed, ${skipped} skipped`);
  console.log('══════════════════════════════════════════════\n');

  await context.close();
  await browser.close();
  process.exit(failed > 0 ? 1 : 0);
}

run().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
