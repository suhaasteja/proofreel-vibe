/**
 * flow-compiler — Reads a repo's README and produces plain-English flow specs
 * that serve as the single source of truth for both Kane verification and the recorder.
 *
 * Uses Anthropic API (or AWS Bedrock) to analyze README claims and emit concrete,
 * runnable English flows.
 */

import Anthropic from '@anthropic-ai/sdk';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Load .env from project root if not already set
if (!process.env.ANTHROPIC_API_KEY) {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const envPath = path.join(__dirname, '..', '.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf-8');
    for (const line of envContent.split('\n')) {
      const [key, ...vals] = line.split('=');
      if (key && vals.length) process.env[key.trim()] = vals.join('=').trim();
    }
  }
}

const SYSTEM_PROMPT = `You are a senior QA engineer who writes browser test flows in plain English.
Given a README file and a feature name, produce concrete, imperative steps that an AI browser
agent (Kane CLI) can execute. The agent sees the page visually and understands natural language —
you do NOT need to provide CSS selectors or XPaths. Describe actions the way a human would.

The AI agent will:
- Find elements by their visible text, labels, placeholders, and visual appearance
- Understand context ("the first item in the list", "the search input at the top")
- Press keys, click buttons, fill forms, and verify visible content

Your job is to describe WHAT to do, not HOW to find elements.

Rules:
- Start with navigation to the app URL
- Use imperative, concrete language: "Type 'hello' in the input field", "Click the Submit button"
- Include at least one verification step: "Verify that 'hello' appears in the list"
- Keep flows to 3-8 steps, focused on proving ONE feature works
- Never use "should", "maybe", or conditional language — every step is a definite action

Form submission patterns (important — do NOT assume buttons exist):
- If the README mentions pressing Enter to submit, use "Press Enter to submit"
- If there's clearly a submit/add button mentioned, use "Click the [button name] button"
- If unclear, prefer "Press Enter to submit" — it works in most form inputs
- For search: "Type 'query' in the search field and press Enter"
- For todo/note apps: almost always Enter to submit, rarely a button

Interaction patterns by app type:
- Todo/task apps: type in input → press Enter → item appears in list
- E-commerce: browse products → click product → add to cart → verify cart
- Auth/login: fill email → fill password → click Sign In → verify dashboard
- Search: type query → press Enter or click Search → verify results appear
- CRUD apps: may have explicit Add/Create buttons — look for them in the README
- Chat apps: type message → press Enter → message appears
- Forms: fill fields → click Submit/Save button → verify confirmation

Verification patterns:
- "Verify that 'text' appears on the page" — for checking content exists
- "Verify that the item list is not empty" — for checking state
- "Verify that a success message appears" — for checking feedback
- Do NOT verify CSS styles (strikethrough, colors, opacity) — only verify visible text/content

Edge cases and robustness:
- If the README is vague about how a feature works, write the most common/obvious flow for that type of app
- If the app likely requires authentication, start with "Look for a login form" — if none exists, proceed with the feature directly
- For SPAs with client-side routing: navigate to the base URL, don't guess route paths unless the README lists them
- If a feature involves modals/popups: "Click [trigger], then verify the modal/popup appears, then interact with it"
- For apps with loading states: the agent handles waits automatically — don't add explicit "wait" steps
- For drag-and-drop features: describe the intent ("Move the first card to the Done column") — the agent will figure out the mechanics
- If the README mentions keyboard shortcuts, prefer them over clicking when they're the primary interaction
- Never generate more than 8 steps — if the feature is complex, focus on the happy path only
- If you're unsure about the exact UI, write steps that describe the GOAL not the exact element:
  BAD: "Click the button with class .submit-btn"
  GOOD: "Click the Submit button"
  BAD: "Find the div with id todo-list and check it has children"
  GOOD: "Verify that at least one item appears in the list"

Output JSON with this exact schema:
{
  "feature": "string — the feature name",
  "startUrl": "string — the URL to start at",
  "steps": ["string — each step in plain English"]
}`;

/**
 * Compile a flow spec from a repo's README.
 * @param {object} opts
 * @param {string} opts.repoPath - Path to the repo root
 * @param {string} opts.feature - Feature name to generate flows for
 * @param {string} [opts.startUrl] - Override start URL (default: http://localhost:3456)
 * @param {string} [opts.model] - Anthropic model to use
 * @returns {Promise<{feature: string, startUrl: string, steps: string[]}>}
 */
export async function compileFlow({ repoPath, feature, startUrl = 'http://localhost:3456', model = 'claude-sonnet-4-20250514' }) {
  // Read README
  const readmePath = findReadme(repoPath);
  if (!readmePath) {
    throw new Error(`No README found in ${repoPath}`);
  }
  const readme = fs.readFileSync(readmePath, 'utf-8');

  // Scan source code for UI context
  const uiContext = scanSourceCode(repoPath);

  const client = new Anthropic();

  const userMessage = `README content:\n\n${readme}\n\n${uiContext ? `Source code analysis (actual UI elements found in the codebase):\n\n${uiContext}\n\n` : ''}Feature to test: "${feature}"\nStart URL: ${startUrl}\n\nGenerate the flow spec JSON. Use the source code analysis to understand the REAL UI — what buttons exist, what inputs are available, how forms submit.`;

  const response = await client.messages.create({
    model,
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [{
      role: 'user',
      content: userMessage
    }]
  });

  const text = response.content[0].text;

  // Extract JSON from response (handle markdown code blocks)
  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, text];
  const parsed = JSON.parse(jsonMatch[1].trim());

  return parsed;
}

/**
 * Find README file in a repo (case-insensitive).
 */
function findReadme(repoPath) {
  const candidates = ['README.md', 'readme.md', 'Readme.md', 'README.MD', 'README'];
  for (const name of candidates) {
    const full = path.join(repoPath, name);
    if (fs.existsSync(full)) return full;
  }
  return null;
}

/**
 * Scan source code to extract UI context — buttons, inputs, forms, routes.
 * Gives Claude real knowledge of what the UI actually contains.
 */
function scanSourceCode(repoPath) {
  const findings = [];
  const extensions = ['.html', '.jsx', '.tsx', '.vue', '.svelte'];
  const files = findSourceFiles(repoPath, extensions, 10); // max 10 files

  for (const file of files) {
    try {
      const content = fs.readFileSync(file, 'utf-8');
      const relativePath = path.relative(repoPath, file);

      // Extract buttons
      const buttons = [...content.matchAll(/<button[^>]*>(.*?)<\/button>/gs)]
        .map(m => m[1].replace(/<[^>]+>/g, '').trim())
        .filter(t => t.length > 0 && t.length < 50);

      // Extract input fields (placeholders and labels)
      const inputs = [...content.matchAll(/placeholder=["']([^"']+)["']/g)]
        .map(m => m[1]);

      // Extract form submission patterns
      const hasOnSubmit = /onSubmit|handleSubmit|@submit/i.test(content);
      const hasKeyDown = /onKeyDown|onKeyPress|@keydown|@keypress/i.test(content);
      const hasEnterKey = /Enter|enter|13/.test(content) && hasKeyDown;

      // Extract links/navigation
      const links = [...content.matchAll(/(?:to|href)=["']\/([^"']+)["']/g)]
        .map(m => '/' + m[1])
        .filter(l => !l.includes('.css') && !l.includes('.js'));

      // Extract headings/titles
      const headings = [...content.matchAll(/<h[1-3][^>]*>(.*?)<\/h[1-3]>/gs)]
        .map(m => m[1].replace(/<[^>]+>/g, '').trim())
        .filter(t => t.length > 0 && t.length < 80);

      if (buttons.length || inputs.length || hasOnSubmit || links.length) {
        const info = [`File: ${relativePath}`];
        if (buttons.length) info.push(`  Buttons: ${[...new Set(buttons)].slice(0, 8).join(', ')}`);
        if (inputs.length) info.push(`  Input placeholders: ${[...new Set(inputs)].slice(0, 6).join(', ')}`);
        if (hasOnSubmit) info.push(`  Form submission: ${hasEnterKey ? 'Enter key handler detected' : 'onSubmit handler detected'}`);
        if (hasEnterKey) info.push(`  Enter key: used for submission`);
        if (links.length) info.push(`  Routes/links: ${[...new Set(links)].slice(0, 6).join(', ')}`);
        if (headings.length) info.push(`  Headings: ${[...new Set(headings)].slice(0, 4).join(', ')}`);
        findings.push(info.join('\n'));
      }
    } catch {}
  }

  if (findings.length === 0) return '';
  return findings.join('\n\n');
}

/**
 * Recursively find source files with given extensions.
 */
function findSourceFiles(dir, extensions, maxFiles, found = []) {
  if (found.length >= maxFiles) return found;

  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (found.length >= maxFiles) break;
      if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'build') continue;

      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        findSourceFiles(fullPath, extensions, maxFiles, found);
      } else if (extensions.some(ext => entry.name.endsWith(ext))) {
        found.push(fullPath);
      }
    }
  } catch {}

  return found;
}
