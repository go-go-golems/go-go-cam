---
Title: 'Contour Pocketing and Multi-Tool Pipeline: Research and Implementation Guide'
Ticket: MILL-02
Status: active
Topics:
    - frontend
    - cnc
    - gcode
    - toolpath-generation
    - research
DocType: design-doc
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://src/lib/geometry.ts
      Note: traceBoundaryLoops used as the iso-contour tracer
    - Path: repo://src/lib/imaging.ts
      Note: chamferDistance underpins the iso-contour offsets
    - Path: repo://src/lib/toolpath.ts
      Note: Current raster strategy the design extends
    - Path: repo://testdata/MakeraBadge.nc
      Note: Reference job the pipeline mirrors
ExternalSources:
    - https://www.angusj.com/clipper2/Docs/Overview.htm
    - https://github.com/countertype/clipper2-ts
    - https://en.wikipedia.org/wiki/Marching_squares
    - https://en.wikipedia.org/wiki/Distance_transform
    - https://linuxcnc.org/docs/html/gcode/m-code.html
Summary: 'Intern-ready guide: how the engraver app generates toolpaths today, why/how to add contour-parallel pocketing, and how to build a Makera-style multi-tool pipeline (engrave, flat-end clearing, cutout).'
LastUpdated: 2026-08-01T01:00:00-04:00
WhatFor: Teach a new engineer the system and guide the MILL-02 implementation.
WhenToUse: Before touching src/lib/toolpath.ts, src/lib/pocketing.ts, or the G-code generator.
---


# Contour Pocketing and Multi-Tool Pipeline: Research and Implementation Guide

## 1. Executive summary

The ABS Bicolor V-Engraver (this repo) turns a bitmap into engraving G-code. Today it clears engraved areas with a **direction-parallel ("raster"/zigzag) strategy**: parallel serpentine scanlines across the pocket interior. This works, but produces many short disconnected tracks on organic shapes, leaves visible directional lay lines, and cannot express the "peel the shape from its boundary inward" pattern that commercial CAM (including MakeraStudio, which produced `testdata/MakeraBadge.nc`) uses for pockets.

This ticket adds:

1. **Contour-parallel pocketing** — concentric inward offsets of the pocket boundary, spaced by the tool stepover. We implement it by extracting **iso-contours of the chamfer distance field** the app already computes, which needs no new dependencies and handles islands and disconnected regions for free. Polygon-offsetting via a Clipper2 port is documented as the vector-exact alternative (decision record DR-1).
2. **A multi-operation, multi-tool pipeline** modeled on the real Makera badge job: *engrave* (fine bit, shallow), *flat-end clearing* (big flat tool clears wide areas first — rest machining), and *cutout* (contour around the artwork, multi-pass Z ladder through the stock, tool changes with `T# M6`, per-tool spindle RPM).
3. **Generator upgrades** — emit tool changes, per-toolpath `S`/`M3`/`M5`, and `;@MKR|`-style toolpath markers so our own visualizer (built in MILL-01) segments and labels the output exactly like a real Makera file.

Risk posture: all algorithms are pixel-grid based on infrastructure that already exists and is verified; the main risks are geometric edge cases (ring linking across narrow necks) and correct Z-ladder ordering in the generator, both covered by unit tests and visualizer inspection.

## 2. Problem statement and scope

**In scope**

- Contour-parallel clearing strategy for the engraving pocket, selectable next to the existing raster strategy.
- Rest-machining split: regions wide enough for a flat end mill are cleared by it; the engraving bit only cuts the remainder.
- Cutout operation: closed contour offset outward from the artwork silhouette (or its bounding rounded-rect), cut in multiple Z passes through the stock.
- G-code emission for multiple tools: `T# M6`, `S#### M3`, `M5` between tools, MKR-style metadata comments.
- Duration estimates per operation (model from MILL-01).

**Out of scope**

- Trochoidal/adaptive-clearing strategies, holding tabs, arc fitting (G2/G3 output), 3D relief carving, tool-radius compensation via G41/G42.

## 3. Technology primer (read before coding)

### 3.1 Pocketing strategies

A 2.5D "pocket" is a region to be cleared to a fixed depth. The two classical families (see `sources/pdf/toolpath-strategy-pocket-milling-ijermce.pdf` and the ResearchGate comparisons cited in sources):

- **Direction-parallel (zigzag/raster)** — parallel lines across the interior, alternating direction, linked at the ends. Easy to compute; constant chip load along lines; but each boundary interaction creates short segments, and lay lines follow one direction. This is `makeRasterPaths` in `src/lib/toolpath.ts` today.
- **Contour-parallel (offset/spiral)** — successively offset the boundary inward by the stepover; machine rings from the inside out (or outside in). The final ring equals the finish contour, so the wall finish is uniform; fewer retracts on organic shapes. This is what MakeraStudio produced for the badge's `[T2]2D Pocket` toolpath.

### 3.2 Getting offsets: two roads

**(a) Vector polygon offsetting.** Compute the boundary polygon, then shrink it by `k * stepover` for k = 1, 2, ... using a polygon-offset library. The canonical implementation is Angus Johnson's **Clipper2** (`sources/web/01-clipper2-overview.md`): `InflatePaths(paths, delta, JoinType, EndType)` with negative `delta` shrinks; it handles self-intersection collapse and returns possibly-multiple output polygons per input. TypeScript port: `clipper2-ts` (`sources/web/04-clipper2-ts-github.md`). Exact, resolution-independent — but a new dependency, and we must marshal between our pixel masks and its polygon world.

**(b) Distance-field iso-contours.** Compute for every pixel the distance to the pocket boundary (the app already does this: `chamferDistance` in `src/lib/imaging.ts`, a two-pass 3-4 chamfer approximation of the Euclidean distance transform — see `sources/web/06-wikipedia-distance-transform.md`). The set `{p : dist(p) >= d}` is exactly the pocket shrunk by `d`. Tracing the boundary of that set (our `traceBoundaryLoops`, a marching-squares-family edge follower — see `sources/web/05-wikipedia-marching-squares.md`) yields the offset ring. Repeat for d = r_tool, r_tool + step, r_tool + 2*step, ... until the set is empty. Topology changes (a pocket splitting into two lobes) fall out automatically: the thresholded mask just has two components and the tracer emits two loops.

We choose **(b)** — decision record DR-1 explains why.

### 3.3 Rest machining (flat-end clearing before engraving)

The badge engraving toolpath ran 14m21s with a 0.3mm bit because *the entire* black area was cleared with it. A 3.175mm flat end mill removes area ~100x faster. Rest machining splits the job:

- Flat tool clears every pixel whose distance-to-background >= r_flat (it physically fits there without gouging the boundary).
- The engraving bit then cuts only the *residual*: `mask AND NOT dilate(flatCleared, r_flat - r_engraver_effective)`.

Both masks come from the same distance field; no new math is needed.

### 3.4 The Makera multi-tool G-code shape (evidence: MILL-01 analysis)

From `ttmp/2026/08/01/MILL-01--*/analysis/01-makerabadge-nc-g-code-analysis.md`:

```
G90 G21
;@MKR|TOOLPATH_START|toolpath_number=1
T2 M6            <- tool change (engraving bit)
S12000 M3        <- spindle on at RPM
...G0/G1 moves, cut Z=-0.1 single pass...
;@MKR|TOOLPATH_START|toolpath_number=2
M5               <- spindle off BEFORE the change
T1 M6
S10000 M3
...pocket, Z ladder -0.5/-1.0/-1.5...
;@MKR|TOOLPATH_START|toolpath_number=3
...contour cutout, same Z ladder...
M05, G28, M02
```

Key semantics (cross-checked against `sources/web/07-linuxcnc-m-codes.md`): `M6` performs the change of the tool selected by `T#`; `M3 S####` starts the spindle clockwise; `M5` stops it; cut-through operations use fixed 0.5mm stepdowns ending 0.2mm past stock bottom.

## 4. Current-state evidence (what exists, file by file)

| File | Role | Key symbols |
|---|---|---|
| `src/main.ts` | orchestration, settings, DOM | `processAndGenerate`, `readSettings` |
| `src/lib/types.ts` | shared types | `Settings`, `Model`, `Toolpath { kind, points, depth }` |
| `src/lib/imaging.ts` | pixel algorithms | `chamferDistance` (two-pass 3-4 chamfer), `zhangSuenThin`, morphology |
| `src/lib/geometry.ts` | polyline/loop tools | `traceBoundaryLoops` (edge-following loop tracer over a binary mask), `simplifyClosedLoop`, `simplifyRdp` |
| `src/lib/toolpath.ts` | machine-space paths | `makeRasterPaths` (serpentine), `makeContourPaths` (boundary finish), `makeDetailPaths` (V-depth from skeleton), `pixelToMachine` |
| `src/lib/gcode-gen.ts` | output | `generateGcode` (single-tool!), `generateSvg` |
| `src/gcode/parser.ts` | visualizer input | `parseGcode` — already understands MKR markers, M6, S/M3/M5, duration model |
| `src/gcode/viewer.ts` | canvas viewer | color by toolpath/tool/depth, per-toolpath toggles, event list |

Important existing invariants:

- Everything geometric happens on a pixel grid of `model.width x model.height`; `model.mmPerPx` converts to machine mm; `pixelToMachine` flips Y (image Y down, machine Y up) and applies origin/mirroring.
- `centerMask` (in `processAndGenerate`) = pixels where the tool center may go: `dist_to_background - 0.5 >= toolRadiusPx`. Contour rings must start at this same inset.
- `Toolpath.kind` drives drawing colors and G-code emission style (`raster`/`contour` constant depth; `detail` variable depth).

## 5. System overview after this ticket

```
                     +--------------------------------------------------+
 image -> mask ->    |               operation planner                  |
 distance field      |                                                  |
        |            |  Op A: flat clearing (optional, T_flat)          |
        v            |    contour rings over flatMask, depth=cap        |
   +---------+       |  Op B: engrave (T_engraver)                      |
   | pocketing|  ->  |    raster OR contour rings over residualMask     |
   | strategies|     |    + boundary finish + V-details (unchanged)     |
   +---------+       |  Op C: cutout (optional, T_flat)                 |
                     |    outward offset silhouette, Z ladder           |
                     +--------------------------------------------------+
                                        |
                                        v
                     generateProgram(ops) -> G-code with T#/M6/S/M3/M5
                                        |
                                        v
                     visualizer (parses our own MKR-style markers)
```

New module: `src/lib/pocketing.ts` (pure, no DOM):

## 6. Data & API design

```ts
// src/lib/pocketing.ts
/** One concentric clearing ring in machine space. */
export interface OffsetRing { level: number /* px inset */; loops: Point[][] }

/** Extract iso-contour loops of `dist` at threshold `level` (px). */
export function extractIsoContours(
  dist: Float32Array, width: number, height: number, level: number
): Point[][]                    // pixel-space closed loops

/** Contour-parallel pocket paths for one mask/tool. */
export function makeContourPocketPaths(
  dist: Float32Array,           // distance-to-background of the op's mask
  model: Model,
  toolRadiusPx: number,
  stepoverPx: number,
  depth: number
): Toolpath[]                   // kind: "raster" (reuses constant-depth semantics)
```

```ts
// src/lib/operations.ts — the multi-op pipeline
export interface ToolSpec {
  number: number;               // T number emitted
  name: string;                 // for MKR TOOL comment
  type: "engraving" | "flat";
  diameter: number;             // mm (flat: cutting dia; engraving: shank)
  tipDiameter?: number;         // engraving tip
  spindleRpm: number;
  feedXY: number;
  feedPlunge: number;
}

export interface Operation {
  name: string;                 // "[T2]Engrave", "[T1]Clear", "[T1]Cutout"
  tool: ToolSpec;
  paths: Toolpath[];
  passDepths: number[];         // Z levels, e.g. [-0.5,-1.0,-1.5] for cutout;
                                // single [-cap] for engrave/clear
}

export function generateProgram(ops: Operation[], model: Model, jobName: string): string
```

`generateProgram` emission contract (mirrors Makera; parser-verified):

```
;@MKR|TOOL|number=..|name=..|...        for each distinct tool
;@MKR|TOOLPATH|number=i|tool_number=..|name=..
G21 / G90 / G17 / G94
for each op i:
  ;@MKR|TOOLPATH_START|toolpath_number=i
  if tool != current: [M5 if spindle on] ; comment ; T# M6 ; G0 safe
  S#### M3
  for each passDepth (shallow -> deep):
    for each path: G0 to start ; G1 plunge F_plunge ; G1 moves F_xy ; G0 safe
M5 ; G28 ; M2
```

## 7. Decision records

**DR-1: distance-field iso-contours vs Clipper2 polygon offsetting — chose distance field.**
*Context:* need inward offsets of arbitrary bitmap-derived regions with islands. *Options:* (a) `clipper2-ts`/`clipper2-wasm` `InflatePaths` on vectorized boundaries; (b) threshold the existing chamfer distance field per ring and trace with existing `traceBoundaryLoops`. *Decision:* (b). *Rationale:* zero new dependencies; reuses two battle-tested functions; automatically correct across topology changes (necks splitting a region); accuracy bounded by `mmPerPx` (0.1mm at default settings) which is far below the 0.06mm chamfer error of the engraving use-case and comparable to what MakeraStudio itself emits (chorded G1s at ~0.1mm). *Consequences:* rings are polygons with pixel-scale jitter -> must run `simplifyClosedLoop` with the user's tolerance; if we later need exact arcs or sub-pixel walls, revisit (a) — the API of `makeContourPocketPaths` hides the backend so a swap is local. *Status:* accepted.

**DR-2: ring ordering — innermost first, outermost last.**
The last ring cut is the one touching the finished wall, so cutting inside-out leaves the boundary pass for last (best finish, matches CAM convention). Within one ring set, loops are ordered by nearest-neighbor (`sortPathsNearest`).

**DR-3: rest-machining boundary margin.**
Flat-cleared area is `dist >= r_flat + 0.5px`; the engraver's residual mask keeps a `0.25mm` overlap band so no un-cut sliver survives between the two tools (chamfer error + linking jitter). Tunable constant `REST_OVERLAP_MM` in `operations.ts`.

**DR-4: cutout path source — offset silhouette, not bounding box.**
The badge cutout follows a rounded-rect because that *was* the designed badge outline. For arbitrary artwork we offset the artwork silhouette (mask dilated by `cutoutMargin + r_tool`) and take the *outer* boundary loops only. A user can still get a rounded-rect by engraving artwork that fills one. Simpler, no extra UI geometry editor.

## 8. Core flows (pseudocode)

### 8.1 Contour-parallel pocketing

```
function makeContourPocketPaths(dist, model, rTool, step, depth):
    rings = []
    level = rTool + 0.5              # first ring: tool center inset
    while true:
        loops = extractIsoContours(dist, W, H, level)
        if loops empty: break
        rings.append((level, loops))
        level += step
    paths = []
    for (level, loops) in reversed(rings):        # innermost first (DR-2)
        for loop in loops:
            simplified = simplifyClosedLoop(loop, tolerancePx)
            paths.push(Toolpath(kind="raster", depth=depth,
                                points=map(pixelToMachine, simplified), closed=true))
    return sortPathsNearest(paths)
```

`extractIsoContours(dist, W, H, level)` = `traceBoundaryLoops(mask_level, W, H)` where `mask_level[i] = dist[i] >= level`. (One allocation per ring; a 1000x1000 field with 20 rings is ~20M pixel tests — fine, the existing raster path does comparable work.)

### 8.2 Operation planning (in `processAndGenerate`)

```
dist = chamferDistance(mask, ...)                      # exists
if flatClearing enabled:
    rFlatPx = (flatDiameter/2) / mmPerPx
    flatDist = dist                                     # same field!
    flatPaths = makeContourPocketPaths(flatDist, model, rFlatPx, flatStepPx, cap)
    clearedMask = { dist >= rFlatPx + 0.5 } dilated by (rFlatPx - overlapPx)
    residualMask = mask AND NOT clearedMask
else:
    residualMask = mask
# engrave op runs the existing pipeline (raster or contour strategy) on residualMask
# cutout op:
if cutout enabled:
    cutMask = dilate(mask, (cutoutMargin + rFlat) / mmPerPx)
    loops = outermost loops of traceBoundaryLoops(cutMask)
    ladder = [-stepdown, -2*stepdown, ..., -(stock + overcut)]
    cutoutOp = Operation(tool=flat, paths=loops, passDepths=ladder)
```

### 8.3 Multi-pass Z emission

For an op with `passDepths=[-0.5,-1.0,-1.5]` and closed paths, each pass re-runs all paths at that Z (matches the badge file: toolpath 3 traces the outline three times). Plunge feed for Z, cut feed for XY, retract to `surfaceZ + safeZ` between paths, `G0` clearance hop `surfaceZ + 2` between passes of the same path is unnecessary — Makera retracts fully; we retract fully too (simpler, safer).

## 9. Implementation plan (file-level, in order)

1. **`src/lib/pocketing.ts`** — `extractIsoContours` + `makeContourPocketPaths` (pure; ~80 lines). Unit-testable without DOM.
2. **Tests** — add `vitest` devDep; `src/lib/pocketing.test.ts`: synthetic 64x64 disk mask -> expect ring count = floor((R - rTool)/step) + 1, all loops closed, innermost-first ordering; L-shaped mask -> ring splits into 2 loops at the neck.
3. **`src/lib/operations.ts`** — `ToolSpec`, `Operation`, `generateProgram` (MKR-style emission), duration per op via existing model.
4. **`src/main.ts` + `index.html`** — settings: pocket strategy select (raster | contour), "flat-end clearing" checkbox + tool diameter/RPM/feeds, "cutout" checkbox + margin/stepdown/stock thickness/overcut; wire ops into `processAndGenerate`; "View generated G-code" already feeds the visualizer.
5. **Visualizer check** — generated program must parse into N labeled toolpaths with tool changes at the right lines (the MILL-01 parser is the acceptance test).
6. **`src/lib/gcode-gen.ts`** — keep `generateGcode` for single-tool back-compat initially; switch `main.ts` to `generateProgram`; delete the old path once parity confirmed (no shims kept).

## 10. Testing & validation

- `pnpm exec vitest run` — pocketing unit tests (disk/L-shape/empty/tool-too-big cases).
- `pnpm build` — strict tsc + Vite.
- Manual: process cat sample with contour strategy -> toolpath canvas shows concentric rings; enable clearing + cutout -> visualizer summary shows 3 toolpaths / 2 tools; per-toolpath durations sane (clearing should slash the engrave time).
- Cross-check: load `testdata/MakeraBadge.nc` side by side; our generated structure should mirror its event sequence (M5 -> T M6 -> S M3).

## 11. Risks, alternatives, open questions

- **Ring linking without retracts** (spiralization — morphing ring k into k+1 to avoid per-ring plunge) is deliberately deferred; every ring plunges and retracts. For 0.1mm-deep engraving the cost is small; revisit if plunge count dominates duration.
- **Chamfer anisotropy**: the 3-4 chamfer overestimates diagonal distances by up to ~6%; stepover therefore effectively shrinks slightly on diagonals — harmless (denser coverage), never gouges.
- **Flat tool in tight inside corners** leaves fillets of radius r_flat; the residual mask math automatically routes those to the engraver. Verify visually on the cat sample's ears.
- **Open question**: should cutout support holding tabs? The badge file has none (tape/vacuum holding); deferred until the user needs it.

## 12. Intern onboarding checklist

1. Read this doc, then `ttmp/.../MILL-01--*/analysis/01-makerabadge-nc-g-code-analysis.md`.
2. Run `pnpm install && pnpm dev`, process the cat sample, load `testdata/MakeraBadge.nc` in the visualizer.
3. Read `src/lib/toolpath.ts` (`makeRasterPaths`, `makeContourPaths`) and `src/lib/geometry.ts` (`traceBoundaryLoops`) — everything new composes these ideas.
4. Implement in the order of section 9; run `pnpm exec vitest run` after each step.

## 13. References

- Sources (this ticket, `sources/web/`): 01 Clipper2 overview, 02 InflatePaths API, 04 clipper2-ts, 05 marching squares, 06 distance transform, 07 LinuxCNC M-codes; `sources/pdf/toolpath-strategy-pocket-milling-ijermce.pdf` (zigzag vs spiral study).
- MILL-01 analysis: MakeraBadge.nc structure, durations, non-path commands.
- Code: `src/lib/{imaging,geometry,toolpath,gcode-gen}.ts`, `src/gcode/{parser,viewer}.ts`, `testdata/MakeraBadge.nc`.
