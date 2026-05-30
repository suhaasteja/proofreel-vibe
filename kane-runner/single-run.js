/**
 * single-run.js — Single-run mode: launch Chrome with CDP, attach both
 * Kane (for verification) and Playwright screencast (for recording) to
 * the SAME browser session. Records exactly what Kane does — no replay needed.
 *
 * This is the gold standard: verify AND record in one pass.
 */

import { spawn, execSync } from 'node:child_process';
import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';

const CDP_PORT = 9333;

/**
 * Run Kane verification while simultaneously recording via Playwright screencast.
 * Both attach to the same Chrome instance via CDP.
 *
 * @param {object} opts
 * @param {string} opts.objective - Kane objective string
 * @param {string} opts.targetUrl - The URL being tested
 * @param {string} opts.outputPath - Output video path (.webm)
 * @param {number} [opts.timeout] - Kane timeout in seconds
 * @param {object} [opts.viewport] - { width, height }
 * @returns {Promise<{passed: boolean, summary: string, videoPath: string}>}
 */
export async function singleRun({
  objective,
  targetUrl,
  outputPath,
  timeout = 120,
  viewport = { width: 1280, height: 720 }
}) {
  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  // Step 1: Launch Chrome with remote debugging
  const chromePath = findChrome();
  const userDataDir = path.join(outputDir, '.chrome-profile');

  const chromeProc = spawn(chromePath, [
    `--remote-debugging-port=${CDP_PORT}`,
    `--user-data-dir=${userDataDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    `--window-size=${viewport.width},${viewport.height}`,
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    targetUrl
  ], { stdio: 'ignore', detached: true });

  // Wait for Chrome to be ready
  await waitForCDP(CDP_PORT, 10000);

  let kaneResult = { passed: false, summary: '' };

  try {
    // Step 2: Attach Playwright to the same Chrome via CDP and start recording
    const browser = await chromium.connectOverCDP(`http://localhost:${CDP_PORT}`);
    const contexts = browser.contexts();
    const context = contexts[0];
    const pages = context.pages();
    const page = pages[0] || await context.newPage();

    // Start screencast recording
    await page.screencast.start({
      path: outputPath,
      size: viewport
    });
    await page.screencast.showActions({ position: 'bottom', duration: 800 });

    // Inject a visible cursor that tracks real mouse events (from Kane's CDP input)
    await page.evaluate(() => {
      const cursor = document.createElement('div');
      cursor.id = 'proofreel-cursor';
      cursor.style.cssText = `
        position: fixed; top: -50px; left: -50px; width: 20px; height: 20px;
        background: rgba(67, 97, 238, 0.9); border-radius: 50%;
        pointer-events: none; z-index: 2147483647;
        box-shadow: 0 0 0 4px rgba(67, 97, 238, 0.3), 0 2px 8px rgba(0,0,0,0.3);
        transform: translate(-50%, -50%);
        transition: left 0.1s ease-out, top 0.1s ease-out;
      `;
      document.body.appendChild(cursor);

      const ripple = document.createElement('div');
      ripple.id = 'proofreel-ripple';
      ripple.style.cssText = `
        position: fixed; top: -50px; left: -50px; width: 44px; height: 44px;
        border: 3px solid rgba(67, 97, 238, 0.7); border-radius: 50%;
        pointer-events: none; z-index: 2147483646; opacity: 0;
        transform: translate(-50%, -50%) scale(0);
      `;
      document.body.appendChild(ripple);

      document.addEventListener('mousemove', (e) => {
        cursor.style.left = e.clientX + 'px';
        cursor.style.top = e.clientY + 'px';
      }, true);

      document.addEventListener('mousedown', (e) => {
        ripple.style.left = e.clientX + 'px';
        ripple.style.top = e.clientY + 'px';
        ripple.style.transition = 'none';
        ripple.style.opacity = '1';
        ripple.style.transform = 'translate(-50%, -50%) scale(0.5)';
        ripple.offsetHeight;
        ripple.style.transition = 'all 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
        ripple.style.opacity = '0';
        ripple.style.transform = 'translate(-50%, -50%) scale(1.5)';
      }, true);
    });

    // Step 3: Run Kane against the same Chrome via CDP
    kaneResult = await runKaneWithCDP({ objective, timeout, cdpPort: CDP_PORT });

    // Step 4: Small pause to capture final state
    await page.waitForTimeout(1500);

    // Stop recording
    await page.screencast.stop();
    await browser.close();

  } catch (err) {
    console.error(`Single-run error: ${err.message}`);
  } finally {
    // Kill Chrome
    try { chromeProc.kill(); } catch {}
    // Cleanup profile
    try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch {}
  }

  return {
    passed: kaneResult.passed,
    summary: kaneResult.summary,
    videoPath: fs.existsSync(outputPath) ? outputPath : null
  };
}

/**
 * Run Kane CLI with --cdp-endpoint pointing to our Chrome.
 */
function runKaneWithCDP({ objective, timeout, cdpPort }) {
  return new Promise((resolve) => {
    const args = [
      'run', objective,
      '--agent',
      '--timeout', String(timeout),
      '--max-steps', '30',
      '--cdp-endpoint', `http://localhost:${cdpPort}`
    ];

    const proc = spawn('kane-cli', args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env }
    });

    let stdout = '';
    proc.stdout.on('data', (d) => { stdout += d.toString(); });
    proc.stderr.on('data', () => {});

    proc.on('close', (code) => {
      const passed = code === 0;
      let summary = '';

      // Parse run_end event
      const lines = stdout.split('\n');
      for (const line of lines) {
        try {
          const obj = JSON.parse(line);
          if (obj.type === 'run_end') {
            summary = obj.summary || obj.one_liner || '';
          }
        } catch {}
      }

      resolve({ passed, summary });
    });

    proc.on('error', () => {
      resolve({ passed: false, summary: 'Kane CLI failed to start' });
    });
  });
}

/**
 * Wait for Chrome's CDP endpoint to be ready.
 */
async function waitForCDP(port, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`http://localhost:${port}/json/version`);
      if (res.ok) return true;
    } catch {}
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error(`Chrome CDP not ready on port ${port} after ${timeoutMs}ms`);
}

/**
 * Find Chrome executable on macOS.
 */
function findChrome() {
  const candidates = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary'
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  throw new Error('Chrome not found. Install Google Chrome.');
}
