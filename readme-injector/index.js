/**
 * readme-injector — Injects "Verified demos" and "Flagged claims" blocks into a README.
 * Idempotent: re-running replaces the block, never duplicates it.
 */

import fs from 'node:fs';
import path from 'node:path';

const START_MARKER = '<!-- proofreel:start -->';
const END_MARKER = '<!-- proofreel:end -->';

/**
 * Inject ProofReel results into a README.
 * @param {object} opts
 * @param {string} opts.readmePath - Path to the README file
 * @param {Array<{feature: string, gifPath: string}>} opts.verified - Features that passed
 * @param {Array<{feature: string, reason: string}>} opts.flagged - Features that failed
 * @returns {string} Updated README content
 */
export function injectReadme({ readmePath, verified = [], flagged = [] }) {
  let content = '';
  if (fs.existsSync(readmePath)) {
    content = fs.readFileSync(readmePath, 'utf-8');
  }

  // Build the ProofReel block
  const block = buildBlock({ verified, flagged, readmePath });

  // Replace existing block or append
  if (content.includes(START_MARKER) && content.includes(END_MARKER)) {
    const regex = new RegExp(
      `${escapeRegex(START_MARKER)}[\\s\\S]*?${escapeRegex(END_MARKER)}`,
      'g'
    );
    content = content.replace(regex, block);
  } else {
    // Append after the first heading, or at the end
    const headingMatch = content.match(/^#\s+.+$/m);
    if (headingMatch) {
      const insertIdx = headingMatch.index + headingMatch[0].length;
      content = content.slice(0, insertIdx) + '\n\n' + block + '\n' + content.slice(insertIdx);
    } else {
      content = content + '\n\n' + block;
    }
  }

  fs.writeFileSync(readmePath, content, 'utf-8');
  return content;
}

/**
 * Build the markdown block.
 */
function buildBlock({ verified, flagged, readmePath }) {
  const lines = [START_MARKER, '', '## 🎬 Verified Demos', ''];

  if (verified.length > 0) {
    for (const { feature, gifPath } of verified) {
      const relativePath = path.relative(path.dirname(readmePath), gifPath);
      lines.push(`### ✅ ${feature}`);
      lines.push('');
      lines.push(`![${feature} demo](${relativePath})`);
      lines.push('');
    }
  } else {
    lines.push('_No features verified yet._');
    lines.push('');
  }

  if (flagged.length > 0) {
    lines.push('## 🚩 Flagged Claims');
    lines.push('');
    lines.push('The following features were claimed but **failed verification**:');
    lines.push('');
    for (const { feature, reason } of flagged) {
      lines.push(`- ❌ **${feature}**: ${reason}`);
    }
    lines.push('');
  }

  lines.push(END_MARKER);
  return lines.join('\n');
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
