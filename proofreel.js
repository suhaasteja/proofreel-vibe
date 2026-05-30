#!/usr/bin/env node
/**
 * proofreel.js — Top-level CLI orchestrator.
 *
 * Usage: node proofreel.js <repo-path> [--feature <name>] [--url <target-url>]
 *
 * Pipeline: flow-compiler -> kane-runner -> recorder -> post -> readme-injector
 */

import dotenv from 'dotenv';
dotenv.config();

import { compileFlow } from './flow-compiler/index.js';
import { runKane } from './kane-runner/index.js';
import { record } from './recorder/index.js';
import { videoToGif } from './post/index.js';
import { injectReadme } from './readme-injector/index.js';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const args = process.argv.slice(2);

if (args.length === 0 || args.includes('--help')) {
  console.log(`
ProofReel — Proof-of-work demos for any repo.
Verify first, record second.

Usage: node proofreel.js <repo-path> [options]

Options:
  --feature <name>   Feature to verify and record (default: all from README)
  --url <url>        Target app URL (default: http://localhost:3456)
  --kane-bin <path>  Path to kane binary (default: kane)
  --skip-record      Only verify, don't record
  --skip-gif         Record video but skip GIF conversion
`);
  process.exit(0);
}

const repoPath = path.resolve(args[0]);
const featureIdx = args.indexOf('--feature');
const features = featureIdx !== -1 ? [args[featureIdx + 1]] : ['CRUD'];
const urlIdx = args.indexOf('--url');
const targetUrl = urlIdx !== -1 ? args[urlIdx + 1] : 'http://localhost:3456';
const skipRecord = args.includes('--skip-record');
const skipGif = args.includes('--skip-gif');

const outputDir = path.join(repoPath, '.proofreel');
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

console.log('🎬 ProofReel — Verify first, record second.\n');
console.log(`Target: ${repoPath}`);
console.log(`URL: ${targetUrl}`);
console.log(`Features: ${features.join(', ')}\n`);

const verified = [];
const flagged = [];

for (const feature of features) {
  console.log(`━━━ Feature: ${feature} ━━━`);

  // Step 1: Compile flow
  console.log('  📝 Compiling flow spec...');
  let flowSpec;
  try {
    flowSpec = await compileFlow({ repoPath, feature, startUrl: targetUrl });
    console.log(`  ✓ Flow compiled: ${flowSpec.steps.length} steps`);
  } catch (err) {
    console.error(`  ✗ Flow compilation failed: ${err.message}`);
    flagged.push({ feature, reason: 'Could not compile flow from README' });
    continue;
  }

  // Step 2: Write flow to temp file for Kane
  const flowFile = path.join(outputDir, `${feature.toLowerCase().replace(/\s+/g, '-')}-flow.txt`);
  fs.writeFileSync(flowFile, flowSpec.steps.join('\n'), 'utf-8');

  // Step 3: Run Kane verification
  console.log('  🔍 Running Kane verification...');
  let kaneResult;
  try {
    kaneResult = await runKane({ flowFile, targetUrl });
    if (kaneResult.passed) {
      console.log('  ✓ Kane PASSED');
    } else {
      console.log('  ✗ Kane FAILED');
      flagged.push({ feature, reason: 'Feature failed Kane verification' });
      continue;
    }
  } catch (err) {
    console.error(`  ✗ Kane error: ${err.message}`);
    flagged.push({ feature, reason: `Kane error: ${err.message}` });
    continue;
  }

  if (skipRecord) {
    verified.push({ feature, gifPath: '' });
    continue;
  }

  // Step 4: Record the verified flow
  console.log('  🎥 Recording verified flow...');
  const videoPath = path.join(outputDir, `${feature.toLowerCase().replace(/\s+/g, '-')}.webm`);
  try {
    // Enrich kaneResult with flow steps if trace didn't provide them
    if (!kaneResult.steps || kaneResult.steps.length === 0) {
      kaneResult.steps = flowSpec.steps.map(s => ({ label: s, action: 'step' }));
    }
    await record({ kaneResult, outputPath: videoPath, targetUrl });
    console.log(`  ✓ Recorded: ${videoPath}`);
  } catch (err) {
    console.error(`  ✗ Recording failed: ${err.message}`);
    verified.push({ feature, gifPath: '' });
    continue;
  }

  if (skipGif) {
    verified.push({ feature, gifPath: videoPath });
    continue;
  }

  // Step 5: Convert to GIF
  console.log('  🖼️  Converting to GIF...');
  const gifPath = path.join(outputDir, `${feature.toLowerCase().replace(/\s+/g, '-')}.gif`);
  try {
    await videoToGif({ inputPath: videoPath, outputPath: gifPath });
    console.log(`  ✓ GIF: ${gifPath}`);
    verified.push({ feature, gifPath });
  } catch (err) {
    console.error(`  ✗ GIF conversion failed: ${err.message}`);
    verified.push({ feature, gifPath: videoPath });
  }
}

// Step 6: Inject into README
console.log('\n━━━ Injecting into README ━━━');
const readmePath = path.join(repoPath, 'README.md');
try {
  injectReadme({ readmePath, verified, flagged });
  console.log(`✓ README updated: ${readmePath}`);
} catch (err) {
  console.error(`✗ README injection failed: ${err.message}`);
}

// Summary
console.log('\n━━━ Summary ━━━');
console.log(`  ✅ Verified: ${verified.length} feature(s)`);
console.log(`  🚩 Flagged:  ${flagged.length} feature(s)`);
if (flagged.length > 0) {
  for (const f of flagged) {
    console.log(`     - ${f.feature}: ${f.reason}`);
  }
}
console.log('\nDone. 🎬');
