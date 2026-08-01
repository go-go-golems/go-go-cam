---
Title: Z Retract Scheme Design
Ticket: MILL-03
Status: active
Topics:
    - cnc
    - gcode
    - toolpath-generation
DocType: design-doc
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://src/lib/operations.ts
      Note: generateProgram - the emitter this redesigns
    - Path: repo://testdata/MakeraBadge.nc
      Note: Evidence source for the cycle grammar
ExternalSources: []
Summary: 'Evidence-based redesign of retract/plunge Z choreography to match MakeraStudio''s three-tier scheme: hop, approach, clearance, plus post-toolchange extra clearance.'
LastUpdated: 2026-08-01T02:00:00-04:00
WhatFor: Guide the implementation of the deferred-retract emitter in operations.ts.
WhenToUse: Before changing Z emission in generateProgram or tuning retract settings.
---


# Z Retract Scheme Design (MILL-03)

## 1. Problem

Our generator uses a single-tier scheme: every path retracts to full clearance (surfaceZ + safeZ, default 3mm) and feed-plunges the whole way back down at plunge feed. The MakeraStudio example (testdata/MakeraBadge.nc) shows the machine's native CAM does something smarter, and in the simulator our files look "jumpy" and waste plunge time (3.12mm of F500 feed per plunge vs Makera's 2.1mm, plus needless full lifts on short moves).

## 2. Evidence: the exact Makera choreography

Z-word tally over the whole example file:

```
296x G0 Z3      full clearance (travel)
245x G0 Z2      (see cycle analysis below)
245x G1 Z-0.1   engraving plunge, F500
 98x G1 Z1.9    feed-engage step, F1000
  4x G0 Z5      post-toolchange extra clearance
```

Line-level cycle analysis (grep contexts, lines 25-27, 70-73, 198-201, 17460-17466) shows TWO distinct reposition cycles plus a toolchange prologue:

**Full cycle (~147x):**
```
G0 Z3            retract to clearance
G0 X.. Y..       travel (rapid)
G0 Z2            rapid approach
G1 Z-0.1 F500    feed plunge (only 2.1mm at plunge feed)
```

**Hop cycle (98x, short moves):**
```
G0 Z2            retract only to hop height
G0 X.. Y..       travel (rapid)
G1 Z1.9 F1000    feed-engage: switch to feed motion 0.1mm below hop height
G1 Z-0.1 F500    feed plunge
```

**Toolchange prologue (per M6):**
```
T1 M6
G0 X50.09 Y84.2  XY travel first (machine is at home Z after the change)
S10000 M3
G0 Z5            extra-cautious first descent (clearance + 2)
G0 Z3            normal clearance
G1 Z-0.5 F300    plunge
```

Counts cross-check: plunges 245 = full 147 + hop 98; `G0 Z2` 245 = full-approach 147 + hop-retract 98. The engage step exists so rapids never go below the hop height; the 1.9-2.0 band is a transition buffer entered at feed.

## 3. Design

### 3.1 Cycle grammar (ours, mirroring Makera)

State machine in `generateProgram`, with **deferred retract**: after a path's last cut move we do NOT immediately retract; the retract height is chosen when we know where the next move goes.

- Let `clearance = surfaceZ + safeZ`, `approach = surfaceZ + approachZ`, `hop = surfaceZ + hopZ`, `engage = hop - 0.1`.
- Between consecutive paths in the same operation pass, with XY travel distance `d`:
  - `d <= hopMaxTravel`  -> hop cycle: `G0 Z{hop}` / `G0 XY` / `G1 Z{engage} F{feedXY}` / `G1 Z{depth} F{plunge}`
  - `d > hopMaxTravel`   -> full cycle: `G0 Z{clearance}` / `G0 XY` / `G0 Z{approach}` / `G1 Z{depth} F{plunge}`
- Operation start right after a toolchange -> prologue: `G0 XY` / (S/M3 already emitted) / `G0 Z{clearance + 2}` / `G0 Z{clearance}` / `G0 Z{approach}` / plunge.
- Operation end, before any toolchange, and program end -> full retract `G0 Z{clearance}`.
- Stay-down ring links (MILL-02) remain below cut depth and are unaffected; this scheme only governs what used to be unconditional full retracts.

### 3.2 New settings

| Setting | Default | Meaning |
|---|---|---|
| `approachZ` | 2.0mm | rapid-descend-to height before feed plunge (full cycle) |
| `hopZ` | 2.0mm | retract height for short repositions |
| `hopMaxTravel` | 5.0mm | max XY travel that still uses the hop cycle |

Defaults reproduce the Makera example exactly (hop 2.0 vs their 1.9-2.0 band; engage derived as hopZ - 0.1). Users wanting faster jobs on flat stock can lower `hopZ` to ~0.5-1mm; `safeZ` keeps its current meaning (travel clearance) and default (3).

### 3.3 Decision records

**DR-1: hop trigger = XY travel distance threshold.** Makera's criterion is unobservable from one file; distance is deterministic, explainable, and conservative (long moves always get full clearance). Default 5mm. Alternative rejected: "same-region" test via the distance field — costlier and op-masks aren't available in the emitter.

**DR-2: engage step reproduced verbatim.** `G1 Z{hop-0.1} F{feedXY}` before the plunge, exactly like Makera: guarantees the rapid never dips below hop height and the transition to feed motion happens above the work. Constant 0.1mm (not configurable) — it is a firmware-safety idiom, not a tuning knob.

**DR-3: sanity clamps.** `hopZ <= safeZ` and `approachZ <= safeZ` enforced in readSettings/deriveSettings by clamping (a hop above clearance is meaningless); `engage` floors at 0.05 above surface.

**DR-4: retract emission is deferred.** The emitter tracks the current XY and whether the spindle is at depth; retracts are emitted by the *next* path (or by op/program end), because the correct retract height depends on the next destination. This is the only structural change to `generateProgram`.

## 4. Validation

- Unit tests: hop cycle chosen for adjacent paths, full cycle for distant ones, toolchange prologue contains `Z5`-equivalent, ladder passes unaffected, engage line present with feedXY.
- Regenerate the 20mm series; run the ticket's Z-tally script: our files must contain the same grammar (G0 Zclearance / G0 Zapproach / G1 Zengage FfeedXY / plunge) and fewer full retracts than before.
- Simulate dumbbell in MakeraStudio (user-side) — the "jumps" should now be small hops.

## 5. Deliverables addendum (user request)

The batch generator also emits, per pattern, a `<name>.settings.json` sidecar (full Settings + stats + generator version/commit) and a `README.md` for the batch; the finished set is uploaded to `d.local:Documents/GCODE/YYYY-MM-DD/<batch>/`.
