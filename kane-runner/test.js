/**
 * Basic unit tests for the trace parser.
 * Run: node kane-runner/test.js
 */

import { parseTrace } from './trace-parser.js';
import assert from 'node:assert';

// Test 1: NDJSON parsing (pass)
{
  const ndjson = [
    '{"type":"step","label":"Navigate to homepage","action":"navigate","target":"http://localhost:3456","timestamp":1700000000000,"status":"passed"}',
    '{"type":"step","label":"Click Add button","action":"click","target":"#add-btn","timestamp":1700000001000,"status":"passed"}',
    '{"type":"step","label":"Verify item appears","action":"assert","target":".item-name","timestamp":1700000002000,"status":"passed"}'
  ].join('\n');

  const result = parseTrace(ndjson, 0);
  assert.strictEqual(result.passed, true);
  assert.strictEqual(result.steps.length, 3);
  assert.strictEqual(result.steps[0].label, 'Navigate to homepage');
  assert.strictEqual(result.steps[0].action, 'navigate');
  assert.strictEqual(result.steps[1].target, '#add-btn');
  console.log('✓ Test 1: NDJSON parsing (pass)');
}

// Test 2: NDJSON parsing (fail)
{
  const ndjson = [
    '{"type":"step","label":"Navigate to homepage","action":"navigate","status":"passed"}',
    '{"type":"step","label":"Click missing button","action":"click","target":"#nonexistent","status":"failed"}'
  ].join('\n');

  const result = parseTrace(ndjson, 1);
  assert.strictEqual(result.passed, false);
  assert.strictEqual(result.steps.length, 2);
  console.log('✓ Test 2: NDJSON parsing (fail)');
}

// Test 3: Plain text parsing
{
  const text = `
✓ Step 1: Navigate to the app
✓ Step 2: Type "Test" in the input
✗ Step 3: Click the Add button
  `;

  const result = parseTrace(text, 1);
  assert.strictEqual(result.passed, false);
  assert.strictEqual(result.steps.length, 3);
  assert.strictEqual(result.steps[0].passed, true);
  assert.strictEqual(result.steps[2].passed, false);
  assert.strictEqual(result.steps[2].label, 'Click the Add button');
  console.log('✓ Test 3: Plain text parsing');
}

// Test 4: Exit code 0 = passed
{
  const result = parseTrace('', 0);
  assert.strictEqual(result.passed, true);
  assert.strictEqual(result.steps.length, 0);
  console.log('✓ Test 4: Exit code 0 = passed');
}

// Test 5: Exit code non-zero = failed
{
  const result = parseTrace('some error output', 1);
  assert.strictEqual(result.passed, false);
  console.log('✓ Test 5: Exit code non-zero = failed');
}

console.log('\nAll kane-runner tests passed ✓');
