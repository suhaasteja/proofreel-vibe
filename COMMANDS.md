# ProofReel — Commands Reference

## Setup (one-time)

```bash
# Install dependencies
npm install

# Install Playwright browser
npx playwright install chromium

# Set your Anthropic API key
echo "ANTHROPIC_API_KEY=sk-ant-..." > .env

# Verify Kane CLI is installed and authenticated
kane-cli --version
kane-cli whoami
```

---

## Web UI (paste a repo, get a GIF)

```bash
# Start the web UI
node web-ui/server.js

# Open in browser
open http://localhost:3457
```

Then paste a GitHub URL, set the feature name and port, and click generate.

---

## CLI (run the full pipeline from terminal)

```bash
# Run against any local repo
node proofreel.js <repo-path> --feature <name> --url <target-url>

# Example: run against the built-in toy app
node toy-app/server.js &                    # boot the app
node proofreel.js toy-app --feature CRUD --url http://localhost:3456
```

### CLI Options

```
node proofreel.js <repo-path> [options]

Options:
  --feature <name>   Feature to verify and record (default: CRUD)
  --url <url>        Target app URL (default: http://localhost:3456)
  --kane-bin <path>  Path to kane binary (default: kane)
  --skip-record      Only verify, don't record
  --skip-gif         Record video but skip GIF conversion
```

---

## Individual Modules

### Flow Compiler (README → steps)

```bash
node flow-compiler/cli.js <repo-path> --feature <name> --url <start-url>

# Example
node flow-compiler/cli.js toy-app --feature CRUD --url http://localhost:3456
```

### Kane Runner (verify a flow)

```bash
node kane-runner/cli.js <flow-file> --url <target-url>

# Example
node kane-runner/cli.js phase0-samples/flow.txt --url http://localhost:3456
```

### Recorder (film a verified flow)

```bash
node recorder/cli.js <kane-result.json> -o <output.webm> --url <target-url>

# Example (pass)
node recorder/cli.js phase0-samples/pass-result.json -o out.webm --url http://localhost:3456

# Example (fail — will be REFUSED)
node recorder/cli.js phase0-samples/fail-result.json -o out.webm
# → "REFUSED: Flow did not pass Kane verification."
```

### Kane CLI directly

```bash
# Simple verification
kane-cli run "Go to http://localhost:3456 and assert an Add button is visible" --agent --headless --timeout 60

# With interaction
kane-cli run "Go to http://localhost:3456, type 'Test' in the input, click Add, assert 'Test' appears in the list" --agent --headless --timeout 90
```

---

## Development

```bash
# Start the toy CRUD app (test target)
node toy-app/server.js
# → http://localhost:3456

# Start the web UI
node web-ui/server.js
# → http://localhost:3457

# Run trace parser tests
node kane-runner/test.js

# Run the E2E test (no Kane, no API key needed)
node toy-app/server.js &
node test-e2e.js
```

---

## Quick Demo Script (hackathon)

```bash
# Terminal 1: Start the toy app
node toy-app/server.js

# Terminal 2: Start the web UI
node web-ui/server.js

# Terminal 3: Or run CLI directly
node proofreel.js toy-app --feature CRUD --url http://localhost:3456

# Check output
open toy-app/.proofreel/crud.gif
cat toy-app/README.md
```
