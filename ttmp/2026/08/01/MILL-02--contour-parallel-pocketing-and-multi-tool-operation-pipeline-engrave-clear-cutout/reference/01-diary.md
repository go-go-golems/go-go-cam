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
RelatedFiles: []
ExternalSources: []
Summary: "Implementation diary for MILL-02: contour-parallel pocketing + multi-tool pipeline."
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
