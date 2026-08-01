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
