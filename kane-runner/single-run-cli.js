#!/usr/bin/env node
/**
 * Single-run CLI — verify AND record in one Chrome session.
 *
 * Usage: node kane-runner/single-run-cli.js --url <target> --objective "<text>" -o <output.webm>
 */

import { singleRun } from './single-run.js';

const args = process.argv.slice(2);

if (args.includes('--help') || args.length === 0) {
  console.log(`
Single-Run Mode — Kane verifies while Playwright records the same browser.

Usage:
  node kane-runner/single-run-cli.js --url <target-url> --objective "<text>" -o <output.webm>

Options:
  --url          Target URL to test
  --objective    Kane objective (plain English)
  -o             Output video path
  --timeout      Kane timeout in seconds (default: 120)
`);
  process.exit(0);
}

const urlIdx = args.indexOf('--url');
const targetUrl = urlIdx !== -1 ? args[urlIdx + 1] : 'http://localhost:3456';

const objIdx = args.indexOf('--objective');
const objective = objIdx !== -1 ? args[objIdx + 1] : 'Verify the page loads correctly';

const outIdx = args.indexOf('-o');
const outputPath = outIdx !== -1 ? args[outIdx + 1] : 'single-run-output.webm';

const timeoutIdx = args.indexOf('--timeout');
const timeout = timeoutIdx !== -1 ? parseInt(args[timeoutIdx + 1]) : 120;

console.log('🎬 Single-Run Mode: Verify + Record in one browser session');
console.log(`   URL: ${targetUrl}`);
console.log(`   Objective: ${objective}`);
console.log(`   Output: ${outputPath}`);
console.log('');

const result = await singleRun({ objective, targetUrl, outputPath, timeout });

console.log('');
console.log(`${result.passed ? '✅' : '❌'} Kane: ${result.passed ? 'PASSED' : 'FAILED'}`);
console.log(`📝 ${result.summary}`);
if (result.videoPath) {
  console.log(`🎥 Video: ${result.videoPath}`);
} else {
  console.log('🎥 No video produced');
}

process.exit(result.passed ? 0 : 1);
