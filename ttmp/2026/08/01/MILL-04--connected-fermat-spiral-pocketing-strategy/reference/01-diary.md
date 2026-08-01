---
Title: Diary
Ticket: MILL-04
Status: active
Topics:
    - cnc
    - gcode
    - toolpath-generation
    - research
DocType: reference
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://scripts/check-fermat-structure.ts
      Note: Radius-profile verification
    - Path: repo://src/lib/fermat.test.ts
      Note: Structural unit tests
    - Path: repo://src/lib/fermat.ts
      Note: The strategy implementation
ExternalSources: []
Summary: Diary for the connected Fermat spiral pocketing implementation.
LastUpdated: 2026-08-01T02:11:34.6337786-04:00
WhatFor: ""
WhenToUse: ""
---


# Diary

## Goal

Chronological record of researching, designing, and implementing connected Fermat spiral pocketing (Zhao et al. 2016) as a third pocket strategy, including the visual build-up with screenshots.

## Step 1: Paper study and design

Downloaded the paper (22MB PDF into the ticket's sources/pdf) and read pages 1–5, which contain the complete algorithm; captured the project page and the ejbosia Python reimplementation with defuddle as secondary sources. The pivotal realization while reading Section 4: the paper's iso-contour set `c_{i,j}` with `d = (i−0.5)w` is *literally* the ring structure our `extractIsoContours` already produces, so the whole adaptation reduces to (a) organizing rings into a containment tree, (b) a per-chain in-and-back-out traversal, and (c) splicing child paths into parents. No gradient tracing is needed if alignment is done with nearest points on the dense pixel loops.

Designed a discrete "arc/gap/corridor" construction (design doc §3.2): anchors on successive loops form a radial corridor; each loop contributes its full circumference minus a 2-stepover gap at the corridor; the inward pass rides even loops and jumps two lanes at a time through the odd gaps; the outward pass rides odd loops through the even gaps; the center turn connects the two deepest opposite-parity loops. Start and exit land adjacent on the two outermost lanes — the Fermat property that makes regions splice-able and single-plunge.

### Prompt Context

**User prompt (verbatim):** "Ok, create a new ticket to implement fermat spirals. Here's the paper https://haisenzhao.github.io/CFS/files/fermat_spirals.pdf  but search for more resources if useful. Approach it systematically and build it up step by step ,if possible take screenshots and test patterns and such as you build it up, and keep a detailed diary as you work, and write up your work along with the images."

**Assistant interpretation:** Create MILL-04, study the CFS paper plus supplementary sources, design the adaptation to our ring infrastructure, implement incrementally with visual verification (screenshots of test patterns per stage), and produce a writeup document with the images plus this diary.

**Inferred user intent:** Get the retract-free clearing strategy identified as the "do it properly" upgrade in earlier discussion, implemented rigorously against the primary literature, with a visual record showing the algorithm working stage by stage.

### What I did
- Created MILL-04 with design doc, diary, writeup doc stubs and 9 tasks; `sources/pdf` + `sources/web` + `images/` dirs.
- Downloaded and read the paper (pages 1–5: abstract, spirallability, Fermat rerouting Fig. 5, spiral-contour tree + Type I/II nodes + bottom-up rerouting).
- Captured the CFS project page and ejbosia/connected-fermat-spirals with defuddle (frontmatter added).
- Wrote the design doc with the discrete construction and three decision records (containment tree over MST; no fairing pass; 2-stepover gaps).

### Why
- The arc/gap/corridor formulation avoids the paper's gradient-based inward/outward links entirely, replacing them with nearest-point alignment that is robust on pixel-derived loops and needs no new math.

### What worked
- The paper is self-contained in five pages for our purposes; the count of figures (4, 5, 6) maps one-to-one onto the three implementation stages planned (spiral, Fermat, connection).

### What didn't work
- A heredoc write of the design doc silently failed because the shell's working directory had persisted inside `sources/web` from a previous command — rewrote from the repo root. (Harness shells persist cwd across calls; relative ttmp paths are fragile.)

### What was tricky to build
- Nothing yet; the design-stage subtlety was convincing myself of the parity argument: every loop is traversed once minus its gap, every gap is crossed exactly once by the opposite-parity pass, so coverage is complete and the path is non-self-crossing so long as anchors stay aligned within a gap width.

### What warrants a second pair of eyes
- DR-3's claim that the gap sliver is covered by the crossing pass's tool width deserves scrutiny against a real cut; it holds arithmetically (lane spacing ≤ 45% of cut width) but corner cases at high curvature may differ.

### What should be done in the future
- Implementation Steps A–D per the task list, with screenshots at each stage.

### Code review instructions
- Read design doc §3 against the paper's §3–4 and Fig. 5; check the parity/coverage argument.

## Step 2: Implementation and visual verification

Implemented the full strategy in `src/lib/fermat.ts` (~230 lines) against the design: ring collection refactored into a shared `collectRings`; loop forest by nearest-previous-level parenting; chain decomposition; the arc/gap/corridor Fermat construction; recursive child splicing; and a proximity merge that unifies same-region root chains (the annulus case). Wired as `pocketStrategy: "fermat"` through types, UI select, and pipeline (start hint = machine origin mapped to pixels).

Verified in three escalating ways. First numerically: a structural check script (`scripts/check-fermat-structure.ts`) computes the radius profile of the disk path — descends 77→2 over 53% of arc length, single minimum at the center turn, ascends to 75, endpoints 6.7px apart. Second by unit tests: 5 new vitest cases (single open path with adjacent boundary endpoints; coverage length within ±15% of contour strategy; annulus merged to one path; dumbbell spliced across lobes; tool-center containment) — 18 total green. Third visually: viewer screenshots per pattern saved to the ticket's `images/` and narrated in the writeup doc.

### Prompt Context

**User prompt (verbatim):** (see Step 1)

**Assistant interpretation:** Execute implementation steps A–D with tests and screenshots at each stage.

**Inferred user intent:** A working, visually verified fermat strategy.

### What I did
- `collectRings` refactor in pocketing.ts; `fermat.ts` with buildLoopForest / decomposeChain / fermatChainPath / splice / makeFermatPocketPaths; strategy wiring in types/main/index.html/pipeline; 5 tests; structural check script; 6 screenshots.

### Why
- Verified numerically *before* trusting pictures: the first screenshots (real engraving parameters, 240 lanes in a 500px render) were pure moiré and momentarily looked like a lane-weaving bug; the radius profile settled it, and legibility screenshots were re-shot with deliberately fat lanes (90° V, 0.5mm cap, 90% stepover).

### What worked
- All five test cases passed on the second run; the dumbbell splice and annulus merge worked without iteration.

### What didn't work
- First test run: 1 failure in the tool-center containment test — ring vertices live on the vertex grid between pixels, so rounding a boundary vertex can land one pixel outside the level set. Fixed the test tolerance (−1.5px), not the geometry.
- tsc: unused `step` variable left behind by the collectRings refactor; and an initially-referenced `machineToPixelStart` helper that didn't exist (replaced with `machineToPixel` from toolpath.ts).
- First design-doc heredoc failed silently due to persisted shell cwd (recorded in Step 1).

### What I learned
- The chamfer 3-4 metric's ~6% anisotropy, invisible at engraving lane spacing, renders as clearly octagonal lanes at ~1mm spacing (fermat-03 image). Cosmetically fine for engraving; exact EDT (Felzenszwalb) is the upgrade path if wall quality demands it.
- Verifying continuous-path algorithms by radius profile is far more decisive than any static rendering.

### What was tricky to build
- The parity/coverage argument had to survive contact with hole boundaries: containment parenting breaks on annular pockets because inner-boundary loops are "contained" by the wrong predecessors; nearest-loop parenting (DR-1 adjustment made during design) handles both families correctly, confirmed by the annulus test.
- Endpoint preservation through simplification: the final open path is simplified with `simplifyRdp` (which pins endpoints) *after* assembly; simplifying per-ring before assembly would have destroyed anchor alignment.

### What warrants a second pair of eyes
- `loopDistance` subsampling (≤200 samples/loop) could theoretically mis-parent a loop in pathological geometry; fine for our masks, but worth revisiting if a future shape produces a visibly wrong corridor.
- The star's 30 detail paths are unchanged behavior (tips too narrow for lanes), but a reviewer should confirm the fermat body and detail tips overlap enough at their seam.

### What should be done in the future
- Machine test cut with fermat strategy; consider fermat for flat clearing; fairing pass (DR-2) if walls show staircase; exact EDT.

### Code review instructions
- Read `src/lib/fermat.ts` top to bottom against design doc §3 (they follow the same structure); `pnpm test` (18 green), `pnpm exec tsx scripts/check-fermat-structure.ts` for the radius profile; images in ticket `images/` with the narrative in `analysis/01-implementation-writeup-with-visual-progression.md`.

## Step 3: Fermat batch generation and delivery

The user approved generating the comparison batch. Added a strategy CLI argument to the batch generator (`pnpm gen:testgcode [contour|fermat|raster]`, output in `gcode-tests-<strategy>/` for non-default strategies) and generated the full series with `fermat`, then uploaded 21 files to `mimimi-2.local:~/Documents/GCODE/2026-08-01/z1-pattern-tests-fermat/` alongside the contour batch for on-machine comparison.

### Prompt Context

**User prompt (verbatim):** "yes" (approving: regenerate the batch with the fermat strategy and push to mimimi-2 alongside the contour batch)

### What I did / results
- Script gains argv strategy selection; sidecars record `pocketStrategy: "fermat"` so batches are distinguishable server-side.
- Estimates vs the contour batch: checkerboard 7m45s → 4m36s (17m40s originally), cat-30mm 10m40s → 6m58s, text 4m13s → 3m5s, star 1m39s → 1m0s, filled-square 1m1s → 52s.
- Plunge-count proof: checkerboard 513 plunges (contour) → 36 (fermat) = exactly one per cell pocket plus one per finish contour.

### What warrants a second pair of eyes
- On-machine comparison of the two batches is the real test: surface quality at corridor crossings (fermat) vs ring seams (contour), and wall finish differences.
