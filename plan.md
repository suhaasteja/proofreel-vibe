# ProofReel — Build Plan (Kiro spec)

> One-day hackathon plan. Read context.md first. Phases are ordered to de-risk the two
> unknowns (Kane's behavior + recording quality) before building anything expensive.
> Check off tasks as you go. MVP = Phases 0-4. Everything in Phase 6 is optional.
>
> **Workflow rules (apply to every phase below):**
>
> - Each phase ends with a single `git commit` titled `phase N: <summary>`. Don't mix
>   phases in one commit. Don't commit halfway through a phase — finish the verify step
>   first.
> - Each phase has a **Verify** block: the exact commands the user runs to confirm the
>   thing actually works before we move on. If verification fails, fix it inside the
>   same phase — don't roll the failure into the next one.
> - Repo is initialised once at the start of Phase 0 (`git init` if not already a repo).

## Definition of done (map to the rubric)

- [ ] **Ships**: a curated repo (or our own UI) loads and a real flow runs end to end.
- [ ] **Verified**: Kane caught at least one genuinely broken/false README claim, and
  confirmed at least one true one. Show both on stage.
- [ ] **Closed loop**: a Kiro hook fires Kane on save; on failure Kiro reads the trace and
  fixes the code; next save re-runs Kane green. Demo this moment live.
- [ ] **Craft**: passing flows render as polished GIFs (cursor + caption + zoom) injected
  into a README; failing claims are flagged, not filmed.

## Phase 0 — Smoke test (do this FIRST, ~45 min)

Goal: learn how Kane actually behaves before designing anything around it.

- [ ] `git init` (if not already) and commit context.md + plan.md as the seed.
- [ ] Install Kane CLI. Record the exact install + invocation commands (do not assume).
- [ ] Build a throwaway toy CRUD page (single HTML page + tiny server: create/list/edit/
  delete an in-memory item). Serve on a fixed localhost port. Put it under `toy-app/`.
- [ ] Write ONE plain-English Kane flow against it (e.g. "create an item called Test,
  confirm it appears in the list"). Save under `phase0-samples/flow.txt`.
- [ ] Run it. Capture into `phase0-samples/`: (a) `pass.log`, (b) `fail.log` (break the app
  on purpose), (c) the trace artifact and a `TRACE_NOTES.md` documenting its format
  (NDJSON? what fields — step labels? coordinates? timestamps? screenshots?).
- [ ] Decision gate (write the answer in `TRACE_NOTES.md`): does the trace contain per-step
  targets + timestamps?
  - Yes -> recorder replays deterministically off the trace.
  - No  -> recorder re-runs the same plain-English steps; trace used only for pass/fail.
- [ ] Check Kane docs for a "connect to existing browser" / CDP / remote-debug option
  (would enable single-run record-the-verified-session; otherwise we replay).

**Verify (user runs):**

```bash
cd toy-app && <start-command>          # boots toy app on the fixed port
# in another shell:
<kane-invoke> phase0-samples/flow.txt  # should print PASS
# then break the app (e.g. comment out the create handler) and re-run:
<kane-invoke> phase0-samples/flow.txt  # should print FAIL
cat phase0-samples/TRACE_NOTES.md      # confirms trace shape + decision gate answer
```

**Commit:** `phase 0: kane smoke test + toy app + trace notes`

## Phase 1 — kane-runner module

- [ ] Wrapper that takes a flow spec, invokes Kane, returns { passed: bool, trace }.
- [ ] Isolated trace parser (one file) that normalizes Kane output into our internal
  shape: ordered steps with { label, action, target?, timestamp? }.
- [ ] Unit-confirm against the Phase 0 samples (one passing, one failing).
- [ ] Tiny CLI entry: `node kane-runner/cli.js <flow.txt>` -> prints JSON
  `{passed, steps:[...]}` so it's inspectable without a test runner.

**Verify (user runs):**

```bash
npm test --workspace kane-runner       # unit tests against phase0-samples pass
# toy app still running from phase 0:
node kane-runner/cli.js phase0-samples/flow.txt | jq .   # {passed:true, steps:[...]}
```

**Commit:** `phase 1: kane-runner + trace parser`

## Phase 2 — flow-compiler module

- [ ] Input: repo path/URL + README + a feature name (e.g. "CRUD"). Output: 1-3 plain-
  English flow specs (the single source of truth for Kane AND the recorder).
- [ ] Use Bedrock (preferred) or Anthropic API. Prompt it to read the README's claims and
  emit concrete, runnable English flows, one per claimed feature.
- [ ] Keep the output schema tiny and explicit: { feature, steps: [string], startUrl }.
- [ ] CLI entry: `node flow-compiler/cli.js <repo-path> --feature CRUD` -> prints JSON.

**Verify (user runs):**

```bash
node flow-compiler/cli.js toy-app --feature CRUD | tee phase2-out.json
# eyeball: each step is a concrete, imperative English line (no "should", no "maybe").
# round-trip: feed the compiled flow back through kane-runner against the toy app:
node kane-runner/cli.js <(jq -r '.steps[]' phase2-out.json)   # passed:true
```

**Commit:** `phase 2: flow-compiler (README -> flow specs)`

## Phase 3 — recorder module (the camera)

- [ ] Playwright launches the target app's URL and records the context video.
- [ ] Inject a synthetic cursor: a pointer-events:none DOM element that follows mouse
  moves, plus a click-ripple animation on each click.
- [ ] Drive actions from the verified flow (trace if available, else replay the steps).
- [ ] Burn in step-label captions (the plain-English step text is the caption).
- [ ] HARD CONSTRAINT: recorder refuses to run unless handed a passed=true result.
- [ ] CLI entry: `node recorder/cli.js <kane-result.json> -o out.webm`.

**Verify (user runs):**

```bash
# refuses on failure:
node kane-runner/cli.js phase0-samples/flow.txt > result.json   # against broken app
node recorder/cli.js result.json -o out.webm                    # exits non-zero, no file
# records on pass:
# (fix toy app first)
node kane-runner/cli.js phase0-samples/flow.txt > result.json
node recorder/cli.js result.json -o out.webm && open out.webm
# eyeball: cursor visible, ripple on each click, captions match the step text.
```

**Commit:** `phase 3: playwright recorder + cursor/caption overlay`

## Phase 4 — post + assembly

- [ ] ffmpeg pass: zoom-to-click per action (use step coordinates/timestamps), optional
  browser/window frame, export GIF (keep under ~10MB for inline GitHub rendering).
- [ ] readme-injector: write a "Verified demos" block — a GIF per passing feature, and a
  "Flagged claims" list for features that failed Kane. Idempotent (re-runnable).
- [ ] One top-level CLI: `node proofreel.js <repo-path>` runs compiler -> Kane -> recorder
  -> post -> injector.

**Verify (user runs):**

```bash
node proofreel.js toy-app
open toy-app/README.md            # "Verified demos" block + GIF present
ls -lh toy-app/.proofreel/*.gif   # each GIF < 10MB
# idempotency: re-run, README block should be replaced not duplicated
node proofreel.js toy-app && grep -c "Verified demos" toy-app/README.md   # -> 1
# break a feature, re-run -> that feature moves to "Flagged claims", no GIF for it
```

**Commit:** `phase 4: ffmpeg post + readme injector + e2e cli`

## Phase 5 — the Kiro closed loop (the headline demo)

- [ ] Build the minimal generator web UI (paste/select target -> see generated GIFs).
- [ ] Kiro agent hook on save: fire Kane against our OWN web UI's primary flow.
- [ ] On Kane fail: Kiro reads the trace and fixes the generator; next save re-runs Kane.
- [ ] On pass: recorder renders the passing run -> becomes the GIF in OUR OWN README.
- [ ] Rehearse the 30-second on-stage moment: hook fires -> Kane catches a broken flow ->
  Kiro fixes -> green -> "that green run is now the GIF in our README."
- [ ] Add steering notes/specs in Kiro so the hook + fix behavior is reproducible.

**Verify (user runs):**

```bash
npm run dev --workspace web-ui     # boots the generator UI
# in Kiro: introduce a deliberate break in a UI handler, save.
#   -> hook fires Kane -> Kane fails -> Kiro reads trace, edits the file, saves again
#   -> Kane passes -> recorder renders -> README GIF refreshes.
# user watches this loop in Kiro's activity panel end-to-end without intervening.
git log --oneline -5               # shows Kiro's fix commit between two Kane runs
cat README.md                      # the new GIF is the most recent green run
```

**Commit:** `phase 5: kiro hook + self-healing closed loop`

## Phase 6 — stretch (only if time remains)

- [ ] Accept arbitrary public repo URL; clone + boot via standard command on a port.
- [ ] Auto-detect run command from package.json / README.
- [ ] Auto-zoom easing, chapter cards between features, gradient background frame.
- [ ] MP4 variant with AI voice narration from step labels.
- [ ] Multiple aspect ratios (16:9 README, 9:16 / 1:1 social).
- [ ] One-line "HyperExecute-compatible backend" nod for host goodwill.

**Verify (user runs):** each stretch item gets its own ad-hoc check; commit each as a
separate `phase 6: <item>` commit so they can be cherry-picked or reverted independently.

## Demo script (3 min) — rehearse this

1. 20s: the problem (repos with no/unreliable demos; RepoClip fakes it, PageBolt can't
   tell pass from fail).
2. 60s: run ProofReel on a curated repo with one true feature and one broken claim. Show
   Kane pass the real one, fail the fake one. Only the real one becomes a GIF; the fake
   one is flagged.
3. 60s: the closed loop on our own app — Kiro hook fires Kane, Kane catches a break, Kiro
   fixes it, re-run green, the green run is our README GIF.
4. 20s: pre-empt "isn't this PageBolt + Kane?" -> PageBolt records; it doesn't verify or
   fix. We gate every GIF on a real Kane pass, and Kiro self-heals before re-recording.

## Risk register

- Recording quality / cursor: de-risked in Phase 0/3 (Playwright + injected cursor).
- Kane flags & trace schema: unknown -> Phase 0 confirms; parser isolated in one module.
- "Any repo" scope creep: curate 1-2 repos for the demo; arbitrary-repo is Phase 6.
- Redundancy critique: recorder consumes the verified spec/trace; never a 2nd NL agent.
- Free-tier / time: no HyperExecute dependency; everything runs locally.
