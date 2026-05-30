# ProofReel — Project Context (Kiro steering)

> Steering file. Treat everything here as persistent context for every spec, task, and
> code generation in this project. If a generated approach conflicts with this file,
> this file wins.

## One-line identity

**Proof-of-work demos for any repo.** We run a repo's claimed features in a real
browser, verify each one with Kane CLI, and ship a demo GIF **only for the features
that actually pass**. Broken claims get flagged, not filmed. The GIF is the *reward*
for a passing verification — never a standalone artifact.

Working name: ProofReel (placeholder, rename freely).

## The non-negotiable rule

A GIF is never produced for a flow that did not pass Kane verification. "Verify first,
record second" is the spine of the product. Any code path that records without a prior
green Kane result is a bug.

## Why this exists (and what we are NOT)

Repos are hard to evaluate: READMEs lack demos, and even live demo sites are confusing.
Two tools already occupy the obvious ground — **do not rebuild either**:

- **RepoClip**: repo URL -> *synthetic* AI video (static code analysis -> LLM script ->
  AI-generated images + TTS -> rendered). It **never runs the app**, so it can confidently
  show features that are broken or don't exist. We are the opposite: we run the real app.
- **PageBolt**: real browser recording from hand-written selector steps, agent/MCP
  friendly, records-on-PR. But it **records whatever happens** — no pass/fail gate, no
  repo awareness. Hand it a broken flow and it produces a polished video of a broken flow.

Our wedge is the gap both leave open: **verification-gated demos** ("does this repo's
demo actually work?"). That is also exactly what this hackathon rewards. Lead every
description with verification, not with pretty GIFs.

## The hackathon we're building for

- **Event**: Kane CLI Hack Day. **Host**: TestMu AI (formerly LambdaTest). **Sponsor**: AWS.
- **Hard requirements**: build the app in **AWS Kiro**; **verify it with Kane CLI**; it
  runs and demos live.
- **Judging (equal weight)**:
  - *Ships* — a working app with a real end-to-end flow, not slides.
  - *Verified* — Kane actually exercised the app and caught or confirmed something real.
  - *Closed loop* — Kiro built -> Kane verified -> result fed back into Kiro. Tighter = higher.
  - *Craft* — something a developer would want to install tonight.
- The judges explicitly want the scrappy thing where a **Kiro hook fires Kane and Kiro
  re-prompts itself based on what Kane finds**, over a polished app with a tacked-on flow.
- Format: 3-min demo + 2-min Q&A, in person, ship by 6 PM, solo or teams up to 4.

## Tool roles (keep these straight)

- **Kiro** (AWS agentic IDE): where we build. Uses specs (EARS-style), **agent hooks**
  that fire on IDE events (save/create/commit), and **steering files** (this file). Hooks
  run inside the IDE during the edit loop. Native MCP support.
- **Kane CLI**: plain-English browser automation from the terminal. Describe a flow in
  English; it opens a real browser, runs it, returns pass/fail plus a trace. Agent-callable.
  It is the **verification layer** and the single source of truth for "did it work."
- **Playwright**: our **recorder** (the camera). It does NOT decide what to do — it
  replays the already-verified flow and produces the polished video.
- **ffmpeg**: post-processing (zoom-to-click, crop/frame, mp4 -> gif).
- **HyperExecute: intentionally NOT used.** It's TestMu's test orchestrator and can record
  scenario video, but its output is a debug-grade screen capture (it lives in the docs under
  "How to Debug a Failed Job") and automated-browser captures typically don't even show the
  cursor. We get higher demo quality from Playwright because we can inject a cursor overlay
  into the page and record in one process. Optional one-liner for goodwill: keep the recorder
  output "HyperExecute-compatible" as a future backend. Do not spend build time on it.

## Locked architecture

Two loops. Keep them distinct.

### Runtime pipeline (what the product does)

1. **Trigger**: a feature request, e.g. "record the CRUD feature."
2. **Flow compiler**: turn that into one or more plain-English flow specs. This spec is the
   **single source of truth** — it feeds both Kane and the recorder. (LLM step; prefer AWS
   Bedrock to align with the sponsor, Anthropic API as fallback.)
3. **Kane CLI verify**: run each flow. Returns pass/fail + trace.
4. **Branch**:
   - *Fail* -> flag the claim, produce **no** video.
   - *Pass* -> hand the verified flow to the recorder.
5. **Playwright recorder**: replay the verified flow, inject a synthetic cursor
   (pointer-events: none DOM element that follows the mouse) + click ripple, burn in
   captions from the plain-English step labels, record the context video.
6. **ffmpeg post**: zoom-to-click on each action, optional window frame, export GIF.
7. **Assemble**: inject a verified-demo block into the README; broken claims listed as flagged.

### Build-time closed loop (the Kiro story for judges — self-demoing)

The generator has a small web UI. A **Kiro hook on save** fires Kane against our *own* UI.
Kane fails -> Kiro reads the trace (NDJSON) -> Kiro fixes the generator -> save fires Kane
again -> passes -> the recorder renders the passing run, which becomes the GIF in our own
README. The product demos itself using its own mechanism.

## Design rules / guardrails for code generation

- **Recorder is a camera, not a brain.** It must consume the same flow spec (or Kane's
  emitted trace) that was verified. Never build a second natural-language browser agent —
  that just reimplements Kane and invites the judge's question "why not record Kane's run?"
- **One flow spec, two consumers** (Kane + recorder). Keep them reading the same artifact.
- **Verified run vs recorded run**: if the recorder replays rather than recording Kane's
  exact session, replay *immediately*, against the *same running instance*, driven by Kane's
  trace, so the recording reproduces Kane's path. Stretch: if Kane can attach to a browser we
  launch (CDP / remote-debugging), record Kane's actual session for a single-run guarantee.
- **Don't promise "any repo."** Support repos that boot with a standard command
  (e.g. npm install && npm run dev on a known port). Curate 1-2 target repos for the live
  demo. Auto-detecting run commands is a stretch goal.
- **Kane specifics are unconfirmed.** Do not hardcode Kane CLI flags or assume the NDJSON
  schema. Treat both as "confirm in smoke test" until we have a real run. Keep the trace
  parser in one isolated module so it's easy to adjust once we see the real format.
- **No browser storage / no localStorage** in any web UI we build for demos.

## Suggested stack

- Node + TypeScript end to end (Kane is a CLI; Playwright is JS-native; ffmpeg via CLI).
- Playwright for capture (recordVideo context option, or CDP screencast).
- A minimal generator web UI (plain HTML + a small server, or a light React app) — it must
  exist so Kane can verify it for the closed-loop self-demo.
- Bedrock (preferred) or Anthropic API for the flow compiler.
- Keep modules decoupled: flow-compiler/, kane-runner/ (+ trace parser), recorder/,
  post/ (ffmpeg), readme-injector/, web-ui/.
