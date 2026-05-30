#!/usr/bin/env node
/**
 * End-to-end test of the ProofReel pipeline WITHOUT requiring Kane CLI or Anthropic API.
 * Simulates: compile flow → kane verify (mocked pass) → record → gif → readme inject
 */

import { record } from './recorder/index.js';
import { videoToGif } from './post/index.js';
import { injectReadme } from './readme-injector/index.js';
import fs from 'node:fs';
import path from 'node:path';

const TARGET_URL = 'http://localhost:3456';
const REPO_PATH = './toy-app';
const OUTPUT_DIR = path.join(REPO_PATH, '.proofreel');

if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

console.log('🎬 ProofReel E2E Test — Verify first, record second.\n');

// Step 1: Simulated flow (short version for quick test)
const flowSpec = {
  feature: 'CRUD',
  startUrl: TARGET_URL,
  steps: [
    "Navigate to http://localhost:3456",
    "Type 'Hello ProofReel' in the input field",
    "Click the 'Add' button",
    "Verify that 'Hello ProofReel' appears in the list"
  ]
};
console.log(`📝 Flow compiled: ${flowSpec.steps.length} steps for "${flowSpec.feature}"`);

// Step 2: Simulated Kane result (pass)
const kaneResult = {
  passed: true,
  steps: flowSpec.steps.map(s => ({ label: s, action: 'step' })),
  rawOutput: 'SIMULATED PASS'
};
console.log('🔍 Kane verification: PASSED ✓\n');

// Step 3: Record
console.log('🎥 Recording verified flow...');
const videoPath = path.join(OUTPUT_DIR, 'crud.webm');
try {
  await record({ kaneResult, outputPath: videoPath, targetUrl: TARGET_URL });
  console.log(`   ✓ Video: ${videoPath}`);
} catch (err) {
  console.error(`   ✗ Recording failed: ${err.message}`);
  process.exit(1);
}

// Step 4: Convert to GIF
console.log('🖼️  Converting to GIF...');
const gifPath = path.join(OUTPUT_DIR, 'crud.gif');
try {
  await videoToGif({ inputPath: videoPath, outputPath: gifPath, width: 800, fps: 12 });
  const stats = fs.statSync(gifPath);
  console.log(`   ✓ GIF: ${gifPath} (${(stats.size / 1024).toFixed(0)} KB)`);
} catch (err) {
  console.error(`   ✗ GIF conversion failed: ${err.message}`);
}

// Step 5: Also test a "failed" feature
const flaggedFeature = {
  feature: 'Search',
  reason: 'Feature claimed in README but not implemented — Kane could not find a search input'
};

// Step 6: Inject into README
console.log('📄 Injecting into README...');
const readmePath = path.join(REPO_PATH, 'README.md');
const verified = fs.existsSync(gifPath)
  ? [{ feature: 'CRUD', gifPath }]
  : [{ feature: 'CRUD', gifPath: videoPath }];

injectReadme({ readmePath, verified, flagged: [flaggedFeature] });
console.log(`   ✓ README updated: ${readmePath}`);

// Summary
console.log('\n━━━ Summary ━━━');
console.log(`  ✅ Verified: 1 feature (CRUD) — GIF produced`);
console.log(`  🚩 Flagged:  1 feature (Search) — no GIF, claim flagged`);
if (fs.existsSync(gifPath)) {
  const stats = fs.statSync(gifPath);
  console.log(`\n  GIF: ${gifPath} (${(stats.size / 1024).toFixed(0)} KB)`);
}
console.log(`  README: ${readmePath}`);
console.log('\nDone. 🎬');
