# ProofReel — Architecture

## Why Kane Makes This Better

Without Kane, you have a **recorder** — it films whatever happens, broken or not. That's what PageBolt does. With Kane, you have a **verification gate** — a real AI agent that drives a real browser and decides pass/fail before any recording starts.

### The Problem Kane Solves

```
❌ Without Kane (what competitors do):
   README claims "CRUD works" → Record the app → Ship a GIF
   But what if CRUD is broken? You just shipped a polished video of a broken feature.

✅ With Kane (what ProofReel does):
   README claims "CRUD works" → Kane VERIFIES it in a real browser → 
   Pass? → Record & ship GIF
   Fail? → Flag the claim, NO GIF produced
```

Kane is the **source of truth**. It's not a test framework you configure with selectors — it reads plain English ("add an item, verify it appears") and figures out the page on its own using visual AI. This means:

1. **No brittle selectors** — Kane looks at the page like a human would
2. **Real verification** — it actually clicks, types, and asserts outcomes
3. **Honest demos** — if the feature is broken, you find out before filming
4. **Trust signal** — the GIF carries proof that the feature was independently verified

### The Closed Loop (Kiro + Kane)

The real power is when Kane feeds back into the development cycle:

```
Developer saves code
    → Kiro hook fires Kane against the app
    → Kane FAILS (found a bug)
    → Kiro reads the failure trace
    → Kiro fixes the code automatically
    → Save triggers Kane again
    → Kane PASSES
    → Recorder films the passing run
    → GIF lands in the README
```

The product demos itself using its own mechanism. The judges see this loop live.

---

## Complete Workflow Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         USER INPUT                                    │
│                                                                       │
│   Paste GitHub URL  ─────►  "https://github.com/user/repo"          │
│   Feature name      ─────►  "Todo"                                   │
│   Port              ─────►  3000                                     │
└───────────────────────────────────┬─────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│  PHASE 1: SETUP                                                      │
│                                                                       │
│   ┌──────────┐    ┌──────────────┐    ┌──────────────┐              │
│   │  Clone   │───►│   Install    │───►│    Boot      │              │
│   │  (git)   │    │  (npm)       │    │  (dev server)│              │
│   └──────────┘    └──────────────┘    └──────┬───────┘              │
│                                              │                       │
│                                    App live on localhost:PORT         │
└──────────────────────────────────────────────┬──────────────────────┘
                                               │
                                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│  PHASE 2: FLOW COMPILATION (Claude / Bedrock)                        │
│                                                                       │
│   ┌──────────────┐         ┌─────────────────────────────────┐      │
│   │  Read README │────────►│  LLM generates plain-English    │      │
│   │  from repo   │         │  browser steps from claims      │      │
│   └──────────────┘         └──────────────┬──────────────────┘      │
│                                           │                          │
│                              ┌────────────▼────────────────┐         │
│                              │  Flow Spec (single source   │         │
│                              │  of truth for Kane AND       │         │
│                              │  the recorder)               │         │
│                              │                              │         │
│                              │  1. Navigate to localhost     │         │
│                              │  2. Type 'Buy milk' in input │         │
│                              │  3. Click Add button          │         │
│                              │  4. Verify 'Buy milk' appears│         │
│                              └────────────┬─────────────────┘         │
│                                           │                          │
└───────────────────────────────────────────┼──────────────────────────┘
                                            │
                              ┌─────────────┴─────────────┐
                              │                           │
                              ▼                           ▼
┌──────────────────────────────────┐   ┌──────────────────────────────┐
│  PHASE 3: KANE VERIFICATION      │   │  (waits for Kane result)     │
│                                  │   │                              │
│  ┌────────────────────────────┐  │   │                              │
│  │  kane-cli run              │  │   │                              │
│  │  "Go to localhost:3000,    │  │   │                              │
│  │   add a todo, verify it    │  │   │                              │
│  │   appears"                 │  │   │                              │
│  │                            │  │   │                              │
│  │  • Launches real Chrome    │  │   │                              │
│  │  • AI agent drives the UI  │  │   │                              │
│  │  • Visually verifies       │  │   │                              │
│  │  • Returns PASS or FAIL    │  │   │                              │
│  └─────────────┬──────────────┘  │   │                              │
│                │                 │   │                              │
│         ┌──────┴──────┐          │   │                              │
│         │             │          │   │                              │
│      PASS ✅       FAIL ❌       │   │                              │
│         │             │          │   │                              │
└─────────┼─────────────┼──────────┘   └──────────────────────────────┘
          │             │
          │             ▼
          │   ┌──────────────────────┐
          │   │  FLAGGED             │
          │   │  • No GIF produced   │
          │   │  • Claim marked as   │
          │   │    broken in README  │
          │   │  • "Feature failed   │
          │   │    verification"     │
          │   └──────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────────────┐
│  PHASE 4: RECORDING (only if Kane passed)                            │
│                                                                       │
│   ┌─────────────────────────────────────────────────────────┐        │
│   │  Playwright Screencast                                   │        │
│   │                                                          │        │
│   │  • Replays the SAME flow that Kane verified             │        │
│   │  • Native animated cursor (moves between actions)        │        │
│   │  • App-descriptive overlays ("Adding a new item")        │        │
│   │  • Records to .webm                                      │        │
│   └──────────────────────────────┬──────────────────────────┘        │
│                                  │                                    │
│                                  ▼                                    │
│   ┌─────────────────────────────────────────────────────────┐        │
│   │  ffmpeg Post-Processing                                  │        │
│   │                                                          │        │
│   │  • Palette-optimized GIF (< 10MB)                        │        │
│   │  • 800px wide, 12fps                                     │        │
│   │  • High quality with dithering                           │        │
│   └──────────────────────────────┬──────────────────────────┘        │
│                                  │                                    │
└──────────────────────────────────┼───────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│  PHASE 5: OUTPUT                                                     │
│                                                                       │
│   ┌─────────────────────┐    ┌────────────────────────────────┐      │
│   │  README Injection   │    │  Web UI Display                │      │
│   │                     │    │                                │      │
│   │  ## Verified Demos  │    │  ┌────────────────────────┐   │      │
│   │  ✅ Todo            │    │  │  GIF rendered inline   │   │      │
│   │  ![gif](todo.gif)  │    │  │  with job status logs  │   │      │
│   │                     │    │  └────────────────────────┘   │      │
│   │  ## Flagged Claims  │    │                                │      │
│   │  ❌ Search: failed  │    │                                │      │
│   └─────────────────────┘    └────────────────────────────────┘      │
│                                                                       │
└─────────────────────────────────────────────────────────────────────┘


═══════════════════════════════════════════════════════════════════════
  THE CLOSED LOOP (Kiro Hook — self-healing, self-demoing)
═══════════════════════════════════════════════════════════════════════

    ┌─────────┐     save      ┌───────────┐    run     ┌──────────┐
    │  Kiro   │──────────────►│ Kiro Hook │───────────►│  Kane    │
    │  (IDE)  │               │ (on save) │            │  CLI     │
    └────┬────┘               └───────────┘            └────┬─────┘
         │                                                  │
         │                                           PASS or FAIL
         │                                                  │
         │◄─────────────────────────────────────────────────┘
         │
         │  if FAIL: Kiro reads trace, fixes code, saves again
         │           → loop repeats until PASS
         │
         │  if PASS: recorder films the green run
         │           → GIF becomes the README demo
         │
         ▼
    ┌─────────────────────────────────────────┐
    │  The product demos itself using its     │
    │  own verification mechanism.            │
    └─────────────────────────────────────────┘


═══════════════════════════════════════════════════════════════════════
  MODULE MAP
═══════════════════════════════════════════════════════════════════════

    proofreel-vibe/
    ├── flow-compiler/    Claude reads README → plain-English steps
    ├── kane-runner/      Wraps kane-cli, parses NDJSON pass/fail
    ├── recorder/         Playwright screencast (cursor + overlays)
    ├── post/             ffmpeg → palette GIF
    ├── readme-injector/  Injects verified/flagged blocks
    ├── web-ui/           Paste a repo URL, see the pipeline run
    ├── toy-app/          Built-in test target
    ├── proofreel.js      CLI orchestrator
    └── .kiro/
        ├── hooks/        Kane-verify-on-save
        └── steering/     Project rules for Kiro
