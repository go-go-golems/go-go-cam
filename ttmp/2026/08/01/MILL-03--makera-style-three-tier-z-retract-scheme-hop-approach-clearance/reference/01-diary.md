---
Title: Diary
Ticket: MILL-03
Status: active
Topics:
    - cnc
    - gcode
    - toolpath-generation
DocType: reference
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: "Diary for the three-tier Z retract scheme implementation."
LastUpdated: 2026-08-01T01:50:55.116574111-04:00
WhatFor: ""
WhenToUse: ""
---

# Diary

## Goal

Record the design and implementation of the Makera-style three-tier Z retract scheme (hop / approach / clearance + post-toolchange extra clearance) in the G-code emitter, and the batch delivery of regenerated test patterns to d.local.

## Step 1: Evidence extraction and design doc

Before designing, re-derived the exact choreography from testdata/MakeraBadge.nc at line level, which corrected my own earlier misreading: `G1 Z1.9 F1000` is not a "lift to 1.9" between strips — it is a *feed-engage step on the way down*. The file uses two reposition cycles: a full cycle (retract G0 Z3, travel, rapid approach G0 Z2, feed plunge, ~147x) and a hop cycle for short moves (retract only to G0 Z2, travel, feed-engage G1 Z1.9 F1000, plunge, 98x), plus a `G0 Z5` extra-cautious first descent after each toolchange. Counts cross-check: 245 plunges = 147 + 98; 245 `G0 Z2` = 147 approaches + 98 hop-retracts.

Wrote the design doc with the cycle grammar, three new settings (approachZ=2, hopZ=2, hopMaxTravel=5 — defaults reproduce Makera exactly), and four decision records (distance-threshold hop trigger; engage step as a fixed firmware-safety idiom; clamps hopZ/approachZ <= safeZ; deferred-retract emission since the retract height depends on the *next* destination).

### Prompt Context

**User prompt (verbatim):** "ok, create a new docmgr ticket for the improvements to the scheme, and a design doc for the first approach, and then implement it. keep a detailed diary as you work, according to the diary format, commit at appropriate intervals." (mid-turn addition: "when done upload all the patterns to d.local:Documents/GCODE/YYYY-MM-DD/XXX/... with a README.md explaining the setup and accompany each file  with a json with the settings or so, so we can track what it all is about")

**Assistant interpretation:** New ticket MILL-03; design doc for the Makera-matching three-tier Z scheme discussed in conversation ("the first approach"); implement it; then regenerate the test patterns and deliver them to d.local with a README and per-file settings JSON sidecars.

**Inferred user intent:** Faster, less jumpy files that behave like native MakeraStudio output, and a traceable archive of test batches on their server so cut results can be correlated with generator settings later.

### What I did
- Created MILL-03 (6 tasks), wrote `design-doc/01-z-retract-scheme-design.md`, related evidence files.
- Grep-level verification of both cycles and the toolchange prologue (lines 25-27, 198-201, 17460-17466 of the example).

### Why
- The single-tier scheme feed-plunges 3.12mm per plunge and fully lifts for every reposition; Makera's own files prove the machine is happy with 2mm hops and a 2.1mm feed plunge.

### What worked / What didn't work
- Worked: count cross-check (147+98=245) confirms the two-cycle model is exhaustive for this file.
- Didn't work: my initial tally-based reading in the previous conversation turn ("G1 Z1.9 is a short hop lift") was wrong — line-context analysis corrected it before it reached the design.

### What warrants a second pair of eyes
- DR-1's 5mm hop threshold is my choice, not observed fact — Makera's real trigger rule is unknown.

### What should be done in the future
- Implementation (next step).

### Code review instructions
- Read the design doc section 2 against `testdata/MakeraBadge.nc` lines cited.

## Step 2: Implementation, batch sidecars, 30mm cat, and delivery to mimimi-2.local

Implemented the deferred-retract emitter designed in Step 1. `generateProgram` now tracks current XY and an at-depth flag; the retract height is chosen by the *next* reposition: hop cycle (`G0 Z{hop}` → travel → `G1 Z{hop-0.1} F{feedXY}` engage → plunge) for travels ≤ hopMaxTravel, full cycle (clearance → travel → approach rapid → plunge) otherwise, and — a case Makera's ladder files imply — *direct deepening with no lift at all* when a closed path's next ladder pass starts exactly where the previous ended. The toolchange prologue now mirrors the example verbatim: `T# M6` → `G0 XY` → `S# M3` → `G0 Z{clearance+2}` → `G0 Z{clearance}`.

Alongside, per the user's delivery request: the batch generator writes a `.settings.json` sidecar per file (full settings, per-op tools/passes, stats, generator commit, timestamp) and a batch `README.md`; added a 3×3cm cat job by teaching the Node script PNG decoding via `pngjs` (pure JS — keeping the no-WASM property); uploaded everything to `mimimi-2.local:~/Documents/GCODE/2026-08-01/z1-pattern-tests/` (21 files).

### Prompt Context

**User prompt (verbatim):** (see Step 1; mid-turn additions: "also create a 3x3cm cat", "mimimi-2.local" [correcting the unresolvable d.local])

**Assistant interpretation:** Implement the designed scheme, add the cat sample at 30mm to the batch, deliver to the corrected host.

**Inferred user intent:** Run the whole test batch (patterns + a real artwork job) on the Z1 with traceable settings.

**Commit (code):** 2f66fdc — "Implement three-tier Z retract scheme; batch sidecars/README; 30mm cat job" (design/ticket in 035ba74)

### What I did
- `types.ts`/`main.ts`/`index.html`: settings `approachZ`, `hopZ`, `hopMaxTravel` (defaults 2/2/5, clamped ≤ safeZ; DR-3 clamps also in `deriveSettings`).
- `operations.ts`: deferred-retract state machine (~70 lines replacing the per-path unconditional retract).
- `scripts/generate-test-gcode.ts`: `generateOne` helper, sidecar JSON + README emission, `loadPngRaster` (pngjs, alpha-over-white luminance identical to the browser's rasterizer), cat-sample at finishedWidth 30.
- Tests: +2 (hop vs full cycle selection with exact line sequences; toolchange prologue + direct ladder re-plunge) — 13 passing.
- Regenerated batch; verified dumbbell Z-word tally shows the full grammar (2× G0 Z5, 14× G0 Z3, 13× G0 Z2, feed-engage present).
- Uploaded 10 .nc + 10 sidecars + README to mimimi-2.local.

### Why
- Deferred retracts are the only structural way to pick the right tier — the correct lift height is a property of the *next* move, not the finished path.

### What worked
- Estimated times dropped again on retract-heavy jobs: checkerboard 7m45s (was 10m33s post-linking, 17m40s originally), text 4m13s (was 7m8s / 10m37s).
- The 30mm cat generated in ~15s in Node: 19,828 lines, 7.5m cut, ~10m40s, engrave + flat clearing.

### What didn't work
- First test run failed: my assertion anchored on `lines.indexOf("G0 Z2")`, which matched the op-start *approach* rather than the hop retract — fixed the anchor (travel move), not the emitter.
- `ssh d.local` → "Could not resolve hostname"; avahi had no such host. User corrected the hostname mid-turn to mimimi-2.local, which authenticated non-interactively.

### What I learned
- The example's ladder toolpaths never lift between passes of the same closed contour — confirming the direct-deepening case was worth implementing rather than hopping between passes.

### What was tricky to build
- Toolchange prologue interacts with the reposition state machine: the prologue pre-positions XY (`skipFirstXY`) so the first reposition must not re-emit the travel move, and after `Z{clearance+2}`/`Z{clearance}` the state must read "at clearance, positioned" or the first plunge would double-travel. Solved with a one-shot flag consumed by the first `reposition` call of the op.

### What warrants a second pair of eyes
- The detector script (MILL-02 `02-find-cut-jumps.py`) now reports "OPEN RING" false positives because stay-down linking makes one plunge span many rings; the heuristic predates linking. Harmless but worth updating before trusting it in future reviews.
- `hopMaxTravel` default (5mm) is my DR-1 choice — the machine test will show whether hops between distant letters (text pattern) feel too aggressive.

### What should be done in the future
- Update `02-find-cut-jumps.py` for linked-path awareness; consider exposing the batch name/date for the upload as a script flag.

### Code review instructions
- `src/lib/operations.ts` — the `reposition` closure and prologue block; `pnpm test` (13 green), `pnpm gen:testgcode`, then `grep -o "G0 Z[0-9.]*" gcode-tests/pattern-dumbbell-20mm.nc | sort | uniq -c` → tiers 2/3/5 present.
- Delivery check: `ssh mimimi-2.local 'ls ~/Documents/GCODE/2026-08-01/z1-pattern-tests'` → 21 files.

### Technical details
- Batch table (post-scheme): filled-square 1m1s, square-outline 2m2s, filled-circle 1m0s, ring 2m56s, dumbbell 36s, stripes 1m26s, checkerboard 7m45s, star 1m39s, text 4m13s, cat-30mm 10m40s.
