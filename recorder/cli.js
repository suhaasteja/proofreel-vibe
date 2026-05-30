#!/usr/bin/env node
/**
 * recorder CLI entry point.
 * Usage: node recorder/cli.js <kane-result.json> -o <output.webm>
 *
 * HARD CONSTRAINT: Exits non-zero if the Kane result shows passed=false.
 */

import { record } from './index.js';
import fs from 'node:fs';

const args = process.argv.slice(2);

if (args.length === 0 || args.includes('--help')) {
  console.log(`Usage: node recorder/cli.js <kane-result.json> -o <output.webm> [--url <target-url>]

  kane-result.json   Path to Kane runner output JSON (must have passed=true)
  -o                 Output video file path
  --url              Target URL to record (default: http://localhost:3456)
`);
  process.exit(0);
}

const resultFile = args[0];
const outIdx = args.indexOf('-o');
const outputPath = outIdx !== -1 ? args[outIdx + 1] : 'out.webm';
const urlIdx = args.indexOf('--url');
const targetUrl = urlIdx !== -1 ? args[urlIdx + 1] : undefined;

// Load Kane result
let kaneResult;
try {
  kaneResult = JSON.parse(fs.readFileSync(resultFile, 'utf-8'));
} catch (err) {
  console.error(`Error reading Kane result: ${err.message}`);
  process.exit(2);
}

// HARD CONSTRAINT: refuse if not passed
if (!kaneResult.passed) {
  console.error('REFUSED: Flow did not pass Kane verification. No recording produced.');
  process.exit(1);
}

try {
  const result = await record({ kaneResult, outputPath, targetUrl });
  console.log(`✓ Recorded: ${result}`);
} catch (err) {
  console.error(`Error recording: ${err.message}`);
  process.exit(2);
}
