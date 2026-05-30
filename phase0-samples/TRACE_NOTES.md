# Kane CLI Trace Notes

## Installation

```bash
npm install -g kane-cli
# or: npx kane-cli
```

## Invocation

```bash
kane --url http://localhost:3456 --steps phase0-samples/flow.txt
```

## Trace Format (to be confirmed after first real run)

Expected: NDJSON (one JSON object per line) with fields:
- `type`: "step" | "result"
- `label`: human-readable step description
- `action`: navigate | click | type | assert
- `target`: CSS selector or element description
- `timestamp`: Unix timestamp in ms
- `status`: "passed" | "failed"
- `screenshot`: base64 or file path (if available)

## Decision Gate

**Does the trace contain per-step targets + timestamps?**

- [ ] Yes → recorder replays deterministically off the trace
- [ ] No → recorder re-runs the same plain-English steps; trace used only for pass/fail

> Update this after the first real Kane run.

## CDP / Remote Debug Option

- [ ] Kane supports connecting to an existing browser (CDP)
- [ ] Kane launches its own browser (no attach option)

> Check Kane docs for `--remote-debugging-port` or `--cdp` flags.

## Sample Pass Output

```
(paste real output here after first run)
```

## Sample Fail Output

```
(paste real output here after first run)
```
