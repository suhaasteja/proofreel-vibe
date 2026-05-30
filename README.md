# 🎬 ProofReel

**Proof-of-work demos for any repo.** We run a repo's claimed features in a real browser, verify each one with Kane CLI, and ship a demo GIF **only for the features that actually pass**. Broken claims get flagged, not filmed.

> A GIF is never produced for a flow that did not pass Kane verification.

## How It Works

```
📝 Compile Flow → 🔍 Kane Verify → 🎥 Record → 🖼️ GIF → 📄 README
```

1. **Flow Compiler** reads a repo's README and generates plain-English browser flows
2. **Kane CLI** runs each flow in a real browser — pass or fail
3. **Recorder** (Playwright) replays only the verified flows with a synthetic cursor + captions
4. **Post** (ffmpeg) converts to polished GIFs
5. **README Injector** adds verified demos and flags broken claims

## The Closed Loop

ProofReel demos itself using its own mechanism:

1. Developer saves a file in the web UI
2. Kiro hook fires Kane against the UI
3. Kane fails → Kiro reads the trace, fixes the code
4. Kane passes → recorder renders the green run → GIF in this README

## Quick Start

```bash
# Install dependencies
npm install

# Start the toy CRUD app (target for testing)
npm start --workspace toy-app

# Run ProofReel against it
node proofreel.js toy-app --feature CRUD

# Or start the web UI
npm start --workspace web-ui
```

## Architecture

```
proofreel-vibe/
├── flow-compiler/     # README → plain-English flow specs (LLM)
├── kane-runner/       # Kane CLI wrapper + trace parser
├── recorder/          # Playwright video capture + cursor/captions
├── post/              # ffmpeg GIF conversion
├── readme-injector/   # Injects verified demos into README
├── web-ui/            # Generator web UI (self-demo target)
├── toy-app/           # Test CRUD app
├── proofreel.js       # Top-level orchestrator CLI
└── .kiro/
    ├── hooks/         # Kane verify on save
    └── steering/      # Project context for Kiro
```

## What We Are NOT

- **Not RepoClip**: They generate synthetic AI videos from static code analysis. They never run the app. We run the real app.
- **Not PageBolt**: They record whatever happens — no pass/fail gate. Hand it a broken flow and it produces a polished video of a broken flow.

Our wedge: **verification-gated demos**. Does this repo's demo actually work?

## Stack

- Node + TypeScript (ESM)
- Kane CLI for verification
- Playwright for recording
- ffmpeg for post-processing
- Anthropic API for flow compilation

## License

MIT
