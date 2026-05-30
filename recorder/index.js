/**
 * recorder — Playwright-based video recorder with native screencast cursor + captions.
 *
 * HARD CONSTRAINT: Refuses to run unless handed a passed=true result.
 * The recorder is a camera, not a brain. It replays verified flows.
 *
 * Uses Playwright 1.59+ screencast API which provides:
 * - Built-in animated cursor that moves between action points
 * - Action annotations showing what's happening
 * - Chapter overlays for step narration
 * - Direct video recording with start/stop control
 */

import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';

/**
 * Record a verified flow as a video.
 */
export async function record({ kaneResult, outputPath, targetUrl, viewport = { width: 1280, height: 720 } }) {
  // HARD CONSTRAINT: refuse if not passed
  if (!kaneResult || !kaneResult.passed) {
    throw new Error('REFUSED: Cannot record a flow that did not pass Kane verification. Verify first, record second.');
  }

  const url = targetUrl || 'http://localhost:3456';
  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();

  // Start screencast recording with the native cursor
  await page.screencast.start({
    path: outputPath,
    size: viewport
  });

  // Enable action annotations with animated cursor
  await page.screencast.showActions({
    position: 'bottom',
    duration: 1200,
    fontSize: 18
  });

  // Navigate to the target
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);

  // Replay steps from the Kane result
  const steps = kaneResult.steps || [];
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];

    // Show a descriptive overlay about what's happening in the app
    const description = makeAppDescription(step.label, i + 1, steps.length);
    if (description) {
      await page.screencast.showOverlay(
        `<div style="position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:rgba(15,15,26,0.88);color:#e8e8f0;padding:10px 24px;border-radius:8px;font-family:system-ui,sans-serif;font-size:15px;font-weight:500;pointer-events:none;max-width:70%;text-align:center;box-shadow:0 4px 16px rgba(0,0,0,0.4);border:1px solid rgba(67,97,238,0.3);">${description}</div>`,
        { duration: 2500 }
      );
    }
    await page.waitForTimeout(300);

    // Execute the step action — screencast cursor follows
    await Promise.race([
      executeStep(page, step),
      page.waitForTimeout(6000) // max 6s per step
    ]);
    await page.waitForTimeout(400);
  }

  // Final pause to show the end state
  await page.waitForTimeout(1000);

  // Stop recording
  await page.screencast.stop();
  await page.close();
  await context.close();
  await browser.close();

  return outputPath;
}

/**
 * Convert a raw step label into a user-friendly description about the app behavior.
 * Instead of "Click the Add button" → "Adding a new item to the list"
 */
function makeAppDescription(label, stepNum, totalSteps) {
  const l = (label || '').toLowerCase();

  if (l.includes('navigate') || l.includes('go to') || l.includes('open')) {
    return '🌐 Loading the application';
  }
  if (l.includes('type') || l.includes('enter') || l.includes('input')) {
    const textMatch = label.match(/['""']([^'""']+)['""']/);
    const text = textMatch ? textMatch[1] : 'data';
    return `✏️ Entering "${text}" into the form`;
  }
  if (l.includes('click') && (l.includes('add') || l.includes('create') || l.includes('submit'))) {
    return '➕ Creating a new item';
  }
  if (l.includes('press enter') || l.includes('hit enter') || l.includes('press return') || l.includes('submit')) {
    return '➕ Submitting the entry';
  }
  if (l.includes('click') && (l.includes('edit') || l.includes('update'))) {
    return '✏️ Editing the item';
  }
  if (l.includes('click') && (l.includes('delete') || l.includes('remove'))) {
    return '🗑️ Removing the item';
  }
  if (l.includes('click') && (l.includes('save'))) {
    return '💾 Saving changes';
  }
  if (l.includes('click')) {
    return '👆 Interacting with the UI';
  }
  if (l.includes('verify') || l.includes('confirm') || l.includes('check') || l.includes('see')) {
    const textMatch = label.match(/['""']([^'""']+)['""']/);
    if (textMatch) {
      return `✅ Confirmed: "${textMatch[1]}" is visible`;
    }
    return '✅ Verifying the result';
  }
  return null;
}

/**
 * Execute a single step on the page using standard Playwright actions.
 * The screencast API automatically renders the cursor for these actions.
 */
async function executeStep(page, step) {
  const label = (step.label || '').toLowerCase();

  try {
    if (label.includes('navigate') || label.includes('go to') || label.includes('open')) {
      const urlMatch = label.match(/https?:\/\/[^\s]+/);
      if (urlMatch) {
        await page.goto(urlMatch[0], { waitUntil: 'networkidle' });
        await page.waitForTimeout(300);
      }

    } else if (label.includes('press enter') || label.includes('hit enter') || label.includes('press return') || (label.includes('submit') && !label.includes('click'))) {
      await page.keyboard.press('Enter');
      await page.waitForTimeout(400);

    } else if (label.includes('type') || label.includes('enter') || label.includes('input')) {
      const textMatch = label.match(/['""']([^'""']+)['""']/);
      const text = textMatch ? textMatch[1] : 'Test Item';

      let selector = step.target;
      if (!selector) {
        const candidates = ['input[type="text"]', 'input:not([type])', 'textarea', 'input[placeholder]'];
        for (const sel of candidates) {
          const el = await page.$(sel);
          if (el && await el.isVisible()) {
            selector = sel;
            break;
          }
        }
      }

      if (selector) {
        // Click to focus (screencast will show cursor moving here)
        await page.click(selector);
        await page.waitForTimeout(200);
        // Clear and type with visible keystrokes
        await page.fill(selector, '');
        await page.type(selector, text, { delay: 60 });
        await page.waitForTimeout(200);
      }

    } else if (label.includes('click')) {
      let selector = step.target;
      if (!selector) {
        const btnMatch = label.match(/click\s+(?:the\s+)?['""']([^'""']+)['""']/i)
          || label.match(/click\s+(?:the\s+)?(.+?)(?:\s+button|\s+link|\s+tab)?$/i);
        if (btnMatch) {
          const btnText = btnMatch[1].replace(/\s*button\s*$/i, '').replace(/\s*link\s*$/i, '').trim();
          const candidates = [
            `button:has-text("${btnText}")`,
            `text="${btnText}"`,
            `[aria-label="${btnText}"]`,
            `a:has-text("${btnText}")`
          ];
          for (const sel of candidates) {
            try {
              const el = await page.$(sel);
              if (el && await el.isVisible()) {
                selector = sel;
                break;
              }
            } catch {}
          }
          if (!selector) selector = `text=${btnText}`;
        }
      }

      if (selector) {
        await page.click(selector);
        await page.waitForTimeout(400);
      }

    } else if (label.includes('verify') || label.includes('confirm') || label.includes('check') || label.includes('see')) {
      const textMatch = label.match(/['""']([^'""']+)['""']/);
      if (textMatch) {
        await page.waitForSelector(`text=${textMatch[1]}`, { timeout: 3000 }).catch(() => {});
      }
      await page.waitForTimeout(600);

    } else if (label.includes('wait')) {
      await page.waitForTimeout(1000);
    }
  } catch (err) {
    console.warn(`Recorder: step "${step.label}" encountered issue: ${err.message}`);
  }
}
