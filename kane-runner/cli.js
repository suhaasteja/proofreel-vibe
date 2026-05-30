#!/usr/bin/env node
/**
 * kane-runner CLI entry point.
 * Usage: node kane-runner/cli.js <flow-file> [--url <target-url>]
 */

import { runKane } from './index.js';
import { readFileSync } from 'node:fs';

const args = process.argv.slice(2);

if (args.length === 0 || args.includes('--help')) {
  console.log(`Usage: node kane-runner/cli.js <flow-file> [--url <target-url>]

  flow-file   Path to a plain-English flow spec file
  --url       Target URL (default: http://localhost:3456)
  --kane-bin  Path to kane binary (default: kane)
`);
  process.exit(0);
}

const flowFile = args[0];
const urlIdx = args.indexOf('--url');
const targetUrl = urlIdx !== -1 ? args[urlIdx + 1] : 'http://localhost:3456';
const binIdx = args.indexOf('--kane-bin');
const kaneBin = binIdx !== -1 ? args[binIdx + 1] : 'kane';

try {
  const result = await runKane({ flowFile, targetUrl, kaneBin });
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.passed ? 0 : 1);
} catch (err) {
  console.error(`Error: ${err.message}`);
  process.exit(2);
}
