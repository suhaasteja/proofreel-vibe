/**
 * trace-parser.js — Isolated module that normalizes Kane CLI output into our internal shape.
 *
 * This is intentionally isolated so it's easy to adjust once we see the real Kane output format.
 * Current implementation handles:
 *   - NDJSON output (one JSON object per line)
 *   - Plain text output with step markers
 *   - Exit code based pass/fail
 */

/**
 * @typedef {Object} Step
 * @property {string} label - Human-readable step description
 * @property {string} action - The action type (click, type, navigate, assert, etc.)
 * @property {string} [target] - CSS selector or element description
 * @property {number} [timestamp] - Unix timestamp ms
 * @property {boolean} [passed] - Whether this individual step passed
 */

/**
 * Parse Kane CLI output into normalized steps.
 * @param {string} rawOutput - Combined stdout+stderr from Kane
 * @param {number} exitCode - Process exit code (0 = pass)
 * @returns {{ passed: boolean, steps: Step[] }}
 */
export function parseTrace(rawOutput, exitCode) {
  const passed = exitCode === 0;
  let steps = [];

  // Try NDJSON parsing first
  const lines = rawOutput.split('\n').filter(l => l.trim());
  const jsonLines = [];

  for (const line of lines) {
    try {
      const obj = JSON.parse(line);
      jsonLines.push(obj);
    } catch {
      // Not JSON, skip
    }
  }

  if (jsonLines.length > 0) {
    steps = parseNDJSON(jsonLines);
  } else {
    // Fallback: parse plain text output
    steps = parsePlainText(rawOutput);
  }

  return { passed, steps };
}

/**
 * Parse NDJSON trace lines into steps.
 */
function parseNDJSON(jsonLines) {
  return jsonLines
    .filter(obj => obj.type === 'step' || obj.step || obj.action || obj.label)
    .map((obj, idx) => ({
      label: obj.label || obj.step || obj.description || `Step ${idx + 1}`,
      action: obj.action || obj.type || 'unknown',
      target: obj.target || obj.selector || obj.element || undefined,
      timestamp: obj.timestamp || obj.ts || undefined,
      passed: obj.passed !== undefined ? obj.passed : obj.status === 'passed'
    }));
}

/**
 * Parse plain text Kane output.
 * Looks for patterns like:
 *   ✓ Step 1: description
 *   ✗ Step 2: description
 *   PASS: description
 *   FAIL: description
 */
function parsePlainText(output) {
  const steps = [];
  const lines = output.split('\n');

  for (const line of lines) {
    // Match: ✓ Step N: description or ✗ Step N: description
    const checkMatch = line.match(/([✓✗✔✘☑☒]|PASS|FAIL|pass|fail)\s*:?\s*(?:Step\s*\d+\s*:?\s*)?(.+)/);
    if (checkMatch) {
      const passMarker = checkMatch[1];
      const label = checkMatch[2].trim();
      const stepPassed = ['✓', '✔', '☑', 'PASS', 'pass'].includes(passMarker);
      steps.push({
        label,
        action: 'step',
        passed: stepPassed
      });
      continue;
    }

    // Match: [action] description or > description
    const actionMatch = line.match(/^\s*(?:\[(\w+)\]|>\s*)\s*(.+)/);
    if (actionMatch) {
      steps.push({
        label: actionMatch[2].trim(),
        action: actionMatch[1] || 'step'
      });
    }
  }

  return steps;
}
