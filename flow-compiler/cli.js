#!/usr/bin/env node
/**
 * flow-compiler CLI entry point.
 * Usage: node flow-compiler/cli.js <repo-path> --feature <name> [--url <start-url>]
 */

import { compileFlow } from './index.js';

const args = process.argv.slice(2);

if (args.length === 0 || args.includes('--help')) {
  console.log(`Usage: node flow-compiler/cli.js <repo-path> --feature <name> [--url <start-url>]

  repo-path   Path to the target repo
  --feature   Feature name to compile flows for
  --url       Start URL (default: http://localhost:3456)
`);
  process.exit(0);
}

const repoPath = args[0];
const featureIdx = args.indexOf('--feature');
const feature = featureIdx !== -1 ? args[featureIdx + 1] : 'CRUD';
const urlIdx = args.indexOf('--url');
const startUrl = urlIdx !== -1 ? args[urlIdx + 1] : 'http://localhost:3456';

try {
  const result = await compileFlow({ repoPath, feature, startUrl });
  console.log(JSON.stringify(result, null, 2));
} catch (err) {
  console.error(`Error: ${err.message}`);
  process.exit(1);
}
