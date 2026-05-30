/**
 * kane-runner — wraps Kane CLI invocation and parses its NDJSON output.
 *
 * Uses `kane-cli run` with --agent flag to get structured output.
 * Parses progress events and the terminal run_end event.
 */

import { spawn } from 'node:child_process';
import { parseTrace } from './trace-parser.js';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Run a Kane CLI verification against a target URL with plain-English steps.
 * @param {object} opts
 * @param {string[]} opts.steps - Array of plain-English steps to verify
 * @param {string} opts.targetUrl - The URL to test against
 * @param {string} [opts.feature] - Feature name (for the objective)
 * @param {number} [opts.timeout] - Timeout in seconds (default: 120)
 * @param {boolean} [opts.headless] - Run headless (default: true)
 * @returns {Promise<{passed: boolean, steps: Array, rawOutput: string, summary: string}>}
 */
export async function runKane({ steps, targetUrl, feature = 'the app', timeout = 120, headless = true }) {
  // Build the objective from the steps
  const objective = buildObjective(steps, targetUrl, feature);

  return new Promise((resolve, reject) => {
    const args = [
      'run', objective,
      '--agent',
      '--timeout', String(timeout),
      '--max-steps', '30'
    ];
    if (headless) args.push('--headless');

    const proc = spawn('kane-cli', args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env }
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (d) => { stdout += d.toString(); });
    proc.stderr.on('data', (d) => { stderr += d.toString(); });

    proc.on('close', (code) => {
      const result = parseKaneOutput(stdout, code);
      resolve(result);
    });

    proc.on('error', (err) => {
      reject(new Error(`Failed to spawn Kane CLI: ${err.message}`));
    });
  });
}

/**
 * Run Kane with a raw objective string (no step compilation).
 */
export async function runKaneRaw({ objective, timeout = 120, headless = true }) {
  return new Promise((resolve, reject) => {
    const args = [
      'run', objective,
      '--agent',
      '--timeout', String(timeout),
      '--max-steps', '30'
    ];
    if (headless) args.push('--headless');

    const proc = spawn('kane-cli', args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env }
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (d) => { stdout += d.toString(); });
    proc.stderr.on('data', (d) => { stderr += d.toString(); });

    proc.on('close', (code) => {
      const result = parseKaneOutput(stdout, code);
      resolve(result);
    });

    proc.on('error', (err) => {
      reject(new Error(`Failed to spawn Kane CLI: ${err.message}`));
    });
  });
}

/**
 * Build a Kane objective from flow steps.
 * Includes all action steps so Kane performs the complete flow.
 */
function buildObjective(steps, targetUrl, feature) {
  // Filter out navigation (Kane handles that via the URL) and keep all actions + verifications
  const actionSteps = steps.filter(s => {
    const l = s.toLowerCase();
    return !l.startsWith('navigate') && !l.startsWith('go to') && !l.startsWith('open');
  });

  if (actionSteps.length === 0) {
    return `Go to ${targetUrl} and verify the "${feature}" feature is working`;
  }

  // Join all steps into a single coherent objective
  const stepsText = actionSteps.join(', then ');
  return `Go to ${targetUrl}, then ${stepsText}`;
}

/**
 * Parse Kane CLI NDJSON output into our internal format.
 */
function parseKaneOutput(stdout, exitCode) {
  const passed = exitCode === 0;
  const lines = stdout.split('\n').filter(l => l.trim());
  const progressSteps = [];
  let runEnd = null;
  let summary = '';

  for (const line of lines) {
    try {
      const obj = JSON.parse(line);

      if (obj.type === 'run_end') {
        runEnd = obj;
        summary = obj.summary || obj.one_liner || '';
      } else if (obj.step !== undefined) {
        // Progress event
        progressSteps.push({
          label: obj.remark || `Step ${obj.step}`,
          action: 'step',
          passed: obj.status === 'passed',
          stepIndex: obj.step
        });
      }
    } catch {
      // Not JSON, skip
    }
  }

  return {
    passed,
    steps: progressSteps,
    rawOutput: stdout,
    summary: runEnd ? (runEnd.summary || runEnd.one_liner || '') : '',
    reason: runEnd ? (runEnd.reason || '') : '',
    duration: runEnd ? runEnd.duration : null,
    runEnd
  };
}
