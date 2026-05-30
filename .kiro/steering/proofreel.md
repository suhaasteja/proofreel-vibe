# ProofReel Steering

## Core Rule
A GIF is NEVER produced for a flow that did not pass Kane verification.
"Verify first, record second" is the spine of the product.

## Architecture
- **flow-compiler/**: README → plain-English flow specs (LLM-powered)
- **kane-runner/**: Invokes Kane CLI, parses trace output
- **recorder/**: Playwright video capture with cursor + captions (ONLY runs on passed flows)
- **post/**: ffmpeg GIF conversion with zoom-to-click
- **readme-injector/**: Injects verified demos + flagged claims into README
- **web-ui/**: Generator web UI (the self-demo target)
- **toy-app/**: Test CRUD app for development

## Closed Loop
1. Developer saves a file in web-ui/
2. Kiro hook fires Kane against the web UI
3. Kane fails → Kiro reads trace, fixes code, saves again
4. Kane passes → recorder renders the green run → GIF in README

## Kane CLI Usage
```bash
kane --url <target-url> --steps <flow-file.txt>
```
- Exit code 0 = pass, non-zero = fail
- Trace parser is isolated in kane-runner/trace-parser.js

## Recording Rules
- Recorder consumes the SAME flow spec that Kane verified
- Never build a second NL browser agent
- Inject synthetic cursor (pointer-events:none) + click ripple + captions
