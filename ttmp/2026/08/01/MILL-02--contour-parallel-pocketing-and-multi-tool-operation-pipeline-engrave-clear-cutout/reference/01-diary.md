---
Title: Diary
Ticket: MILL-02
Status: active
Topics:
    - frontend
    - cnc
    - gcode
    - toolpath-generation
    - research
DocType: reference
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://src/lib/operations.ts
      Note: Multi-tool program generator
    - Path: repo://src/lib/patterns.ts
      Note: Built-in test pattern images
    - Path: repo://src/lib/pocketing.test.ts
      Note: Vitest suite covering rings and program structure
    - Path: repo://src/lib/pocketing.ts
      Note: Contour-parallel ring extraction
ExternalSources: []
Summary: 'Implementation diary for MILL-02: contour-parallel pocketing + multi-tool pipeline.'
LastUpdated: 2026-08-01T00:47:00.854279593-04:00
WhatFor: ""
WhenToUse: ""
---


# Diary

## Goal

Chronological record of researching contour-parallel pocketing, designing the multi-tool operation pipeline (engrave / flat-end clearing / cutout), and implementing both in the Vite/TS engraver app.

## Step 1: Research, source gathering, and design guide

Opened MILL-02 straight after finishing the MILL-01 visualizer, because the user's follow-up question ("so this rasters for the engraving? how can we make it do contour pockets?") is exactly the strategy gap the MakeraBadge analysis exposed: MakeraStudio cleared the badge pocket contour-parallel, our generator only rasters. Researched the two viable offset machineries (Clipper2 polygon offsetting vs distance-field iso-contours), collected sources with defuddle, and wrote the full intern guide with decision records. The pivotal realization: the app already contains both halves of the distance-field approach (`chamferDistance` + `traceBoundaryLoops`), so contour pocketing is a composition of existing verified primitives, not new geometry code.

### Prompt Context

**User prompt (verbatim):** "so this rasters for the engraving? how can we make it do contour pockets?

Create a new ticket, make sure to research the algorithms on the web and store interesting resources using defuddle in the sources/ directory of th enew ticket. Create  a detailed analysis / design / implementation guide that is for a new intern, explaining all the parts of the system needed to understand what it is, with prose paragraphs and bullet point sand pseudocode and diagrams and api references and file references. It should be very clear and technical. Store in the ticket and the nupload to remarkable.

then implement the new ticket, keeping a detailed diary, committing at appropriate intervals

Also analyze the non-path gcode in the MakeraBadge.nc and add support for engraving / flat end clearing / cutout / etc..."

**Assistant interpretation:** Confirm the current strategy is raster; create MILL-02; research contour-parallel pocketing algorithms on the web (sources saved via defuddle); write an intern-ready design/implementation guide; upload it to reMarkable; then implement contour pocketing plus a Makera-style multi-operation pipeline (engraving, flat-end clearing, cutout) with proper tool-change G-code.

**Inferred user intent:** Make the app generate jobs shaped like real MakeraStudio output — faster (flat tool clears bulk), prettier walls (contour-parallel), and complete (cutout at the end) — with the design captured well enough for future contributors.

### What I did
- Created MILL-02 with design-doc + diary + 7 tasks.
- Kagi searches: contour-parallel pocketing algorithms (Voronoi, fast-marching, MDPI multi-island paper), Clipper2 offsetting, JS/TS ports (clipper2-wasm, clipper2-ts), strategy comparisons (zigzag vs spiral).
- defuddle captures into `sources/web/`: Clipper2 overview + InflatePaths API, clipper2-ts README, Wikipedia marching squares + distance transform, LinuxCNC M-codes; PDF study (zigzag vs spiral surface finish/time) into `sources/pdf/` via curl.
- Added docmgr frontmatter to every capture so `docmgr doctor` stays clean.
- Wrote `design-doc/01-...md`: primer, current-state evidence table, architecture, APIs (`pocketing.ts`, `operations.ts`, `generateProgram` contract), 4 decision records, pseudocode flows, phased plan, tests, risks.

### Why
- DR-1 (distance-field over Clipper2): no new dependency, reuses verified code, handles topology changes; accuracy bound (mmPerPx ~0.1mm) matches what MakeraStudio itself emits as chorded G1s.

### What worked
- angusj.com, GitHub, Wikipedia, LinuxCNC all defuddle cleanly.

### What didn't work
- `defuddle parse https://www.mdpi.com/2075-1702/13/4/286` and npmjs.com -> `Error: Failed to fetch: 403 Forbidden`; MDPI also blocks plain curl (398-byte block page). Cited the paper in search notes but proceeded without the capture; the IJERMCE PDF covers the strategy-comparison ground.
- `defuddle parse <ijermce pdf>` -> "Error: Not an HTML page (content-type: application/pdf)" — downloaded with curl into `sources/pdf/` instead.

### What I learned
- Clipper2 `InflatePaths` with negative delta is the vector-exact equivalent of our planned mask-threshold offsets; keeping `makeContourPocketPaths`'s signature backend-agnostic keeps that door open.
- LinuxCNC M-code doc confirms M6 semantics (change to tool selected by T) — matches the badge file's `T2 M6` one-liners.

### What was tricky to build
- Nothing yet (design step). The subtle design point was rest-machining overlap (DR-3): flat-cleared and engraver regions must overlap by a small band (0.25mm) or chamfer error can leave uncut slivers at the seam.

### What warrants a second pair of eyes
- DR-2 ring ordering (innermost-first) and DR-4 (cutout from silhouette not bounding box) are conventions I chose; reviewer should confirm they match the user's expectations for their machine workflow.

### What should be done in the future
- Implementation (next steps), then reMarkable upload of the finished bundle.

### Code review instructions
- Read the design doc top to bottom; check section 6 API sketches against actual signatures once implemented.

### Technical details
- Search queries preserved in this step; captures numbered 01-07 in `sources/web/` (03 skipped: MDPI 403).

## Step 2: Implementation — pocketing module, operations pipeline, test patterns

Implemented the design end to end. `src/lib/pocketing.ts` composes `chamferDistance` + `traceBoundaryLoops` into `extractIsoContours` and `makeContourPocketPaths`; `src/lib/operations.ts` holds `ToolSpec`/`Operation`/`makePassLadder`/`generateProgram` (the multi-tool emitter); `main.ts` now plans up to three operations (T2 engrave, T1 flat clearing via rest machining, T1 cutout with Z ladder) and feeds the program to our own parser for the metrics display. The legacy single-tool `generateGcode` was deleted outright (no compatibility shim) — `generateProgram` is the only emitter now.

Mid-implementation the user asked for test-pattern sample images; implemented as `src/lib/patterns.ts` — nine canvas-rendered black-on-white patterns (filled square, square outline, circle, ring, dumbbell, stripes, checkerboard, star, text) selectable from a dropdown, flowing through the same data-URL loading path as uploads. The ring and dumbbell patterns double as topology regression cases matching the vitest suite.

### Prompt Context

**User prompt (verbatim):** "add a test set of sample images with like, square outline, filled square, etc... some test patterns basically." (mid-turn; main implementation prompt: see Step 1)

**Assistant interpretation:** Ship built-in test images exercising the strategies, selectable in the UI.

**Inferred user intent:** Quickly eyeball how each strategy behaves on canonical shapes without hunting for image files.

### What I did
- `src/lib/pocketing.ts`: iso-contour ring extraction (level = rTool+0.5 then +stepover), innermost-first emission with nearest-neighbor ordering *within* each level so the finish ring cuts last (DR-2).
- `src/lib/operations.ts`: MKR-style program emitter — TOOL/TOOLPATH header, TOOLPATH_START markers, M5-before-M6, per-tool S/M3, pass ladders, G28/M2 tail.
- `src/lib/imaging.ts`: added `fillHoles` (border BFS) for the cutout silhouette.
- `src/main.ts`: operations planner — rest-machining mask split (flat centers dilated by rFlat−0.25mm overlap via a second chamfer pass), strategy select, cutout mask from distance-to-artwork ≤ margin+rFlat, crop padding auto-expanded when cutout is on; metrics now come from parseGcode of our own output.
- `src/lib/patterns.ts` + UI dropdown; new Operations fieldset in index.html.
- Tests: `src/lib/pocketing.test.ts` (vitest, 8 tests): disk ring counts/ordering, dumbbell neck split, tool-too-big, pass ladders, program structure (M5 precedes T1 M6; ladder depths; empty ops skipped).
- Verified in browser: filled square with contour+clearing+cutout → 3 toolpaths/2 tools, event order identical to MakeraBadge.nc; ring pattern → annulus fully covered, island handled. Screenshots in ticket various/.

### Why
- Feeding our generated program through our own parser for metrics kills two birds: the display is truthful, and every generation is a round-trip parser test.

### What worked
- All 8 vitest tests passed on the first run; tsc caught only one typed-array generic issue.

### What didn't work
- `sortPathsNearest` across *all* rings would have destroyed innermost-first ordering (outer finish ring could cut early near the seam). Caught in self-review before running; fixed by sorting per level with a carried cursor.
- tsc: `Uint8Array<ArrayBufferLike>` vs `<ArrayBuffer>` assignment error again (cutMask); fixed with an explicit annotation.

### What I learned
- The rest-machining seam really does need the overlap band: with exact radius subtraction the chamfer's ±6% diagonal error left 1px slivers on the square test's corners in an early run of the mask math.

### What was tricky to build
- Rest machining without a polygon library: "what the flat tool actually cleared" = pixels within rFlat of any legal flat-tool center. Computed as a second chamfer distance *to* the flat-center region, thresholded at rFlat − overlap. Two distance transforms instead of any boolean polygon ops.
- Cutout region can exceed the cropped canvas: crop padding is auto-raised to (margin + rFlat + 0.5mm)/mmPerPx when cutout is enabled, estimated from pre-crop bounds.

### What warrants a second pair of eyes
- `generateProgram` detail-path depth capping uses `-Math.min(...op.passDepths)`; correct for single-pass engrave ops but worth checking if anyone ever puts detail paths in a laddered op.
- Duration for the engrave op fell from ~14min-equivalent to ~2m43s with clearing enabled on the square test — sane, but a real-stock test cut should confirm the seam quality before trusting it.

### What should be done in the future
- Spiralize rings (link adjacent levels) to cut plunge count; holding tabs for cutout; arc fitting on rings.

### Code review instructions
- Start: `src/lib/pocketing.ts` (ring loop), `src/lib/operations.ts` (generateProgram), then the operations block in `processAndGenerate` (main.ts).
- Validate: `pnpm exec vitest run` (8 tests), `pnpm build`, then in the app: pattern "Filled square", strategy contour, enable clearing+cutout, Process → View generated G-code → 3 labeled toolpaths, events M5→T1 M6→S10000, cutout Z −0.5/−1/−1.5.

### Technical details
- Emission order: engrave (T2) → flat clearing (T1) → cutout (T1): two tool changes total, matching the badge job's convention of engraving first.
- Test-pattern IDs: filled-square, square-outline, filled-circle, ring, dumbbell, stripes, checkerboard, star, text.
