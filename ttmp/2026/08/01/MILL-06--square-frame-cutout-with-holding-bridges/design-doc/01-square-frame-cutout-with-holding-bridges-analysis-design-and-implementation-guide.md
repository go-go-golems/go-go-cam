---
Title: 'Square frame cutout with holding bridges: analysis, design, and implementation guide'
Ticket: MILL-06
Status: review
Topics:
    - cnc
    - gcode
    - frontend
    - toolpath-generation
DocType: design-doc
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://src/lib/cutout.test.ts
      Note: Geometry, mirroring, span, and guard regression tests (commit 801096a)
    - Path: repo://src/lib/cutout.ts
      Note: Pure square frame and bridge-pass geometry implementation (commit 801096a)
    - Path: repo://src/lib/operations.ts
      Note: Depth-ladder and G-code emission contract to generalize
    - Path: repo://src/lib/pipeline.ts
      Note: Current profile-cutout planning and final operation integration seam
    - Path: repo://src/lib/toolpath.ts
      Note: Pixel-to-machine transformation required for the square
    - Path: repo://src/lib/types.ts
      Note: Shared settings and path depth contracts
    - Path: repo://src/main.ts
      Note: Browser settings reader requiring new bridge fields
    - Path: repo://testdata/MakeraBadge.nc
      Note: Primary G-code evidence for the four ramped holding bridges
    - Path: repo://ttmp/2026/08/01/MILL-06--square-frame-cutout-with-holding-bridges/scripts/01-analyze-makera-contour-bridges.py
      Note: Reproducible modal-motion bridge analysis
ExternalSources: []
Summary: Evidence-backed implementation guide for replacing the artwork-profile cutout with a square frame and Makera-style four holding bridges.
LastUpdated: 2026-08-01T20:20:00-04:00
WhatFor: Enable an intern to safely implement and validate a square final cutout with bridge ramps in the ABS Bicolor V-Engraver.
WhenToUse: Read before changing cutout settings, geometry planning, G-code emission, generated fixtures, or CNC validation.
---



# Square frame cutout with holding bridges: analysis, design, and implementation guide

## Executive summary

The application turns a raster image into a Makera-style, multi-tool G-code job for engraving bicolor ABS. Its existing final operation, `[T1]Cutout`, does run at the end of the job, but it traces an offset of the artwork silhouette rather than producing a square workpiece. It also repeats a constant-depth contour at each stepdown, so it cannot intentionally leave material to hold the part in the stock.

This ticket proposes replacing that silhouette cutout with exactly one **square frame** centered on the cleaned artwork bounds. The cut line lies outside the artwork by the configured finishing margin plus the flat tool radius. The first cut-through-ladder pass cuts the complete frame at its nominal depth. Each later pass leaves four symmetric, side-midpoint bridges. A bridge is represented as two continuous, sloped G1 moves that rise from the nominal depth to a configured retained cut depth and descend again. This is the mechanism actually found in `testdata/MakeraBadge.nc`, not an inference from its visual output.

The work is deliberately split into a pure geometry planner, a small operation-emitter generalization, settings/UI wiring, and tests. The plan preserves the existing operation order—engrave, optional flat clearing, then cutout—and does **not** add a compatibility switch for the old profile shape. The requested behavior is a semantic replacement: a checked cutout is now a square-frame cutout with bridges.

## 1. Problem statement and scope

### 1.1 User-visible problem

A profile-following cutout makes the finished stock follow every concavity, island, and contour of the bitmap. That is unsuitable when the desired deliverable is a square badge, plaque, or frame around an engraved object. More importantly, a complete final cut through thin stock can release the workpiece while the spindle is still moving. The released part can chatter, shift, be damaged, or strike the cutter.

The requested result is a final square boundary around the object. The square should include a configurable clear margin. It should remain joined to surrounding stock by small bridges until the operator removes it after the program ends.

### 1.2 In scope

- Replace the final artwork-profile loop with one square, axis-aligned T1 cutout loop.
- Derive the square from the cleaned foreground/artwork bounds after optional crop.
- Keep one bridge at the midpoint of each of the four square sides.
- Make bridge ramps follow the observed Makera form: no bridge on a pass at or shallower than the retained cut depth; increasingly wider deep-to-shallow-to-deep ramps on later passes.
- Add explicit configuration for physical bridge thickness and final bridge span.
- Generalize the G-code emitter so a contour can carry pointwise depth, without mislabeling it as a V-bit `detail` path.
- Add unit/integration tests and update the batch G-code generator defaults/fixtures.

### 1.3 Explicitly out of scope

- Arbitrary rectangle aspect ratios, rounded corners, multiple bridges per side, user-draggable bridge placement, dogbones, onion-skin finishing, or automatic workholding selection.
- Changing the Makera header stock dimensions (currently fixed defaults in `src/lib/operations.ts:18-35`). The planner must warn/validate its own geometry but cannot prove it fits a user’s physical stock without an explicit stock-size model.
- A visual depth heat map. `src/lib/render.ts:47-76` presently renders only XY linework; it will show the square but not whether a segment is shallow.
- Maintaining a UI option for the old silhouette cutout. The feature request changes what “cutout” means.

## 2. Terminology and machining model

The code uses **machine space** in millimetres. The surface is normally Z=0, and cutting below it uses negative emitted Z values. The type-level convention is the easier-to-reason-about inverse: `DepthPoint.depth` is a positive distance below surface (`src/lib/types.ts:6-9`). `generateProgram` converts a positive depth `d` to `surfaceZ - d` (`src/lib/operations.ts:173-178`).

- **Artwork bounds:** the smallest pixel-aligned rectangle containing foreground pixels in the cleaned bitmap (`foregroundBounds`, `src/lib/imaging.ts:158-175`).
- **Finishing margin:** clear material from the artwork edge to the *finished inside edge* of the cut. Existing `cutoutMargin` intends this semantic.
- **Tool-center frame:** the square path driven by the center of the flat-end mill. It is farther from the artwork than the finishing margin by `flatDiameter / 2`.
- **Cut ladder:** increasing depths returned by `makePassLadder(totalDepth, stepdown)` as negative emitted-Z-relative values—e.g. `[-0.5, -1, -1.5]` (`src/lib/operations.ts:59-65`).
- **Bridge thickness:** the material deliberately left between the bridge’s shallowest cut and the stock bottom. It is a physical material quantity, not a coordinate.
- **Retained cut depth:** `stockThickness - bridgeThickness`. With 1.3mm stock and 0.8mm bridges, the tool may cut bridge centers only to 0.5mm below the top.
- **Bridge span:** the total XY distance over which the tool ramps upward and downward on the final cut pass. It consists of two equal halves; this document does not call it a plateau because the Makera reference does not have a plateau.

### 2.1 Geometry diagram

The outline below is a top view. `C` is a bridge center, and each side gets exactly one.

```text
                    square tool-center frame
       +-------------------------- C --------------------------+
       |                                                       |
       |                                                       |
       C                engraved artwork                      C
       |                   (any silhouette)                   |
       |                                                       |
       +-------------------------- C --------------------------+

  finished clear margin = distance from artwork bound to tool's inside edge
  tool-center clearance = cutoutMargin + flatDiameter / 2
```

A side’s final deep pass is a continuous path, not a skipped segment:

```text
XY direction  --->
nominal depth D    _________/-----------------\_________
retained depth R            R                 R
                           ramp up          ramp down

in G-code, the two diagonal moves include X/Y and Z on the same G1 line.
```

## 3. Evidence: what `MakeraBadge.nc` really does

### 3.1 Prior conclusion corrected

An older analysis says the badge has no holding tabs. Direct inspection disproves that. The final toolpath begins at `testdata/MakeraBadge.nc:17652`; it makes a full first pass at Z-0.5 (`17656-17849`). In the next two passes it includes inline XY+Z transitions at these line pairs:

- Z-1.0 pass: `17898-17899`, `17950-17951`, `18001-18002`, `18053-18054`.
- Z-1.5 pass: `18104-18105`, `18156-18157`, `18207-18208`, `18259-18260`.

For example, the right-side Z-1.5 bridge is emitted as:

```gcode
G1 X91.39 Y33.76             ; normal final-depth contour arrives here
G1 X91.39 Y39.95 Z-0.5 F1000 ; ramp upward while moving 6.19mm
G1 X91.39 Y46.13 Z-1.5 F300  ; ramp downward while moving 6.18mm
G1 X91.39 Y50 F1000          ; resume final-depth contour
```

This sequence is an intentional bridge: its center is cut only to Z-0.5, leaving roughly 0.8mm in a 1.3mm blank, while the surrounding contour reaches Z-1.5.

### 3.2 Reproducible analysis

Ticket-local script:

```sh
python3 ttmp/2026/08/01/MILL-06--square-frame-cutout-with-holding-bridges/scripts/01-analyze-makera-contour-bridges.py \
  testdata/MakeraBadge.nc
```

It reconstructs modal position, selects toolpath 3, and pairs a G1 deep-to-shallow ramp with the next shallow-to-same-deep ramp. Its verified output is:

```text
Z-1:   4 bridges, retained at Z-0.5, width 6.18..6.19mm
Z-1.5: 4 bridges, retained at Z-0.5, width 12.37..12.38mm
```

The four bridges are at side midpoints. Their span scales with the amount of cut below Z-0.5: about 6.19mm for 0.5mm extra depth and 12.37mm for 1.0mm extra depth. That is the reference behavior this design reproduces mathematically.

### 3.3 What not to copy

Do not copy literal coordinates, tool feeds, or dimensions from the 100mm Makera badge. Those describe that one job. Copy the **algorithmic behavior**: complete shallow pass; four side-midpoint bridges; bridge center held at a shallow cut; linear ramp lengths proportional to the current depth beyond retained depth.

## 4. Current-state architecture for an intern

### 4.1 Repository map

| Area | Files | Responsibility relevant to this change |
|---|---|---|
| Browser inputs and lifecycle | `index.html`, `src/main.ts` | Cutout controls are markup at `index.html:147-165`; `readSettings` clamps DOM values in `src/main.ts:113-180`; button handling calls the pipeline. |
| Shared contracts | `src/lib/types.ts` | `Settings`, `Model`, `Toolpath`, and positive `DepthPoint.depth` define cross-module data. |
| Image processing | `src/lib/imaging.ts` | Thresholds, cleans, crops, finds foreground bounds, computes distance fields, and fills holes. |
| Pixel/machine mapping | `src/lib/toolpath.ts:5-24` | `pixelToMachine` and `machineToPixel` account for origin, finished dimensions, vertical image flip, and mirroring. |
| Pipeline/orchestration | `src/lib/pipeline.ts` | Builds the cleaned mask/model, engraving paths, optional flat clearing, final cutout paths, operations, SVG, and G-code. |
| Program writer | `src/lib/operations.ts` | Builds the depth ladder, emits tool changes/repositioning/plunges/path moves, and constructs the MKR metadata header. |
| G-code parser | `src/gcode/parser.ts` | Round-trips generated output for time/statistics and supports visualizer import. It preserves every XYZ segment. |
| Tests and batch outputs | `src/lib/pocketing.test.ts`, `src/lib/fermat.test.ts`, `scripts/generate-test-gcode.ts`, `gcode-tests/` | Existing test style, G-code writer assertions, and checked example jobs. |

### 4.2 Runtime data flow

```text
image file/sample
      |
      v
rasterizeImage (browser) ------> PipelineInput { gray, rgba, width, height }
                                      |
                                      v
threshold + morphology + crop ----> Model { mask, scale, dimensions, settings }
                                      |
                +---------------------+----------------------+
                |                     |                      |
                v                     v                      v
          engrave paths         flat clearing       square-frame cutout plan
                |                     |                      |
                +---------------------+----------------------+
                                      v
                         Operation[] ordered by machining stage
                                      |
                                      v
                       generateProgram -> MKR header + G0/G1 program
                                      |
                       +--------------+--------------+
                       v                             v
                parseGcode -> metrics          download/viewer
```

`runPipeline` is DOM-free (`src/lib/pipeline.ts:1-3`) so the browser and `scripts/generate-test-gcode.ts` share its behavior. This is why frame geometry must live under `src/lib/`, not in `src/main.ts`.

### 4.3 Current cutout behavior and its gap

The present cutout block (`src/lib/pipeline.ts:228-248`) does the following:

1. Computes each background pixel’s distance to artwork (`chamferDistance(mask, ..., true)`).
2. Marks pixels within `cutoutMargin + flatDiameter / 2` of any artwork pixel.
3. Fills holes to avoid interior cutouts.
4. Traces and simplifies the resulting mask boundary.
5. Converts the traced loops to machine coordinates and labels them contours.

This correctly compensates the flat cutter radius for a profile cut, but it necessarily inherits the bitmap silhouette. An irregular mask can produce multiple outer loops; it cannot guarantee one square frame. The final `Operation` merely repeats its `paths` at every `passDepths` value (`src/lib/operations.ts:164-193`), so every existing cutout segment always cuts to the current pass depth.

## 5. Proposed design

### 5.1 Settings/API contract

Replace the profile-cutout wording and add two settings. Keep `cutoutEnable`, `cutoutMargin`, `stockThickness`, `cutoutStepdown`, and `cutoutOvercut`; their roles are still valid. Add:

```ts
// src/lib/types.ts
interface Settings {
  // existing cutout fields...
  cutoutEnable: boolean;
  cutoutMargin: number;            // finished edge clearance from artwork (mm)
  stockThickness: number;          // actual blank thickness (mm)
  cutoutStepdown: number;          // maximum ladder increment (mm)
  cutoutOvercut: number;           // past stock bottom (mm)

  /** Material left at each bridge's shallowest point (mm). */
  cutoutBridgeThickness: number;
  /** Total two-ramp span on the deepest pass (mm). */
  cutoutBridgeSpan: number;
}
```

Suggested initial defaults deliberately reproduce the reference’s physical behavior for 1.3mm stock and 1.5mm final depth:

```text
cutoutMargin          2.0 mm  (existing default)
stockThickness         1.3 mm  (existing default)
cutoutStepdown         0.5 mm  (existing default)
cutoutOvercut          0.2 mm  (existing default)
cutoutBridgeThickness  0.8 mm  (so retained cut depth = 0.5mm)
cutoutBridgeSpan      12.4 mm  (final-pass Makera-like total span)
```

Use **thickness**, not `bridgeZ`, in the UI. Operators can measure stock and reason about remaining material, while an emitted Z depends on `surfaceZ` and the current stock configuration.

`readSettings` must read `stockThickness` before clamping bridge thickness:

```ts
const stockThickness = clamp(numberValue("stockThickness", 1.3), 0.05, 100);
const cutoutBridgeThickness = clamp(
  numberValue("cutoutBridgeThickness", 0.8),
  0.01,
  stockThickness - 0.01,
);
```

The planner, rather than DOM coercion alone, must reject geometrically impossible bridge spans. This protects batch/Node callers that build `Settings` without the browser.

### 5.2 Proposed pure geometry module

Create `src/lib/cutout.ts`. It should not manipulate DOM, write G-code strings, or duplicate image filtering. It accepts a fully constructed `Model` plus already computed pass depths and returns the per-pass routes to execute.

```ts
// src/lib/cutout.ts
export interface SquareFrameCutoutPlan {
  artworkBounds: Bounds;           // pixel coordinates, evidence/debugging
  frameBounds: Bounds;             // machine coordinates
  sideLength: number;              // mm
  retainedCutDepth: number;        // positive mm below surface
  pathsByPass: Toolpath[][];       // exactly one closed path per ladder pass
}

export function planSquareFrameCutout(
  model: Model,
  passDepths: number[],            // negative values from makePassLadder
): SquareFrameCutoutPlan;
```

It returns a `Toolpath` whose points use positive `depth` only for bridge ramps. The first/shallow pass can remain a constant-depth contour. Later paths set `depth` on every point so their emitted depth is unambiguous.

### 5.3 Square construction

The square must enclose the artwork in **machine space**, not assume pixel Y points upward or ignore mirrors. The simplest robust process is:

1. Call `foregroundBounds(model.mask, model.width, model.height)`. The pipeline already guarantees a nonempty foreground region before model construction (`src/lib/pipeline.ts:80-82`).
2. Convert all four pixel-bounds corners with `pixelToMachine`.
3. Reduce those converted corners to `minX`, `maxX`, `minY`, `maxY` in machine space.
4. Let `artWidth = maxX - minX`, `artHeight = maxY - minY`.
5. Let `toolCenterClearance = cutoutMargin + flatDiameter / 2`.
6. Let `side = max(artWidth, artHeight) + 2 * toolCenterClearance`.
7. Center that side on `(minX + maxX)/2, (minY + maxY)/2`.
8. Emit a closed, clockwise or counter-clockwise sequence of its four corners. Direction does not change a symmetric flat-end cut, but choose one direction consistently for deterministic tests.

```text
artwork bbox:  width=31mm, height=20mm
margin=2mm, tool radius=1.5875mm
side = max(31, 20) + 2 * (2 + 1.5875) = 38.175mm
```

This calculation preserves at least the requested 2mm finished margin on the long sides and produces a larger, symmetric clear area on the short sides.

### 5.4 Bridge routing algorithm

Let positive values mean depth below surface:

```text
finalDepth          = -passDepths[passDepths.length - 1]
retainedCutDepth    = stockThickness - cutoutBridgeThickness
extraFinalDepth     = finalDepth - retainedCutDepth
```

Validate the following before writing a path:

- `0 < retainedCutDepth < stockThickness`.
- `finalDepth > retainedCutDepth`. If this is false, a bridge cannot differ from the shallow/full pass; report a user-facing configuration error.
- `cutoutBridgeSpan > 0`.
- On every pass requiring bridges, `spanForPass < side - 2 * cornerClearance`, where `cornerClearance` is a named conservative constant (start with `flatDiameter`). This prevents a bridge from reaching a corner or overlapping another feature.

For each nominal ladder depth `D = -passZ`:

```text
if D <= retainedCutDepth:
    span = 0                    # full, constant-depth square
else:
    span = cutoutBridgeSpan * (D - retainedCutDepth) / extraFinalDepth
```

For each side, locate its midpoint. At a depth requiring bridges, add three points while traveling that side: the point `span/2` before center at `D`, the center at `retainedCutDepth`, and the point `span/2` after center at `D`. The preceding and following points remain at `D`. Thus two ordinary linear moves form a continuous up-ramp and down-ramp.

```text
function makePass(sideSquare, D, retained, span):
    path = []
    for each directed side from corner A to corner B:
        mid = midpoint(A, B)
        if span == 0:
            append B at depth D
        else:
            before = pointAlong(A, B, 0.5 - span/(2*sideLength))
            after  = pointAlong(A, B, 0.5 + span/(2*sideLength))
            append before at depth D
            append mid at depth retained
            append after at depth D
            append B at depth D
    close path at its first point with depth D
    return contour path
```

A square path needs no bitmap boundary tracer, `fillHoles`, or simplifier. This is intentional; it makes the output stable even for disconnected artwork or narrow image artifacts.

### 5.5 Operation contract needed for per-pass paths

The current operation contract has one `paths` array shared by every ladder value. Add an optional `pathsByPass` to make the planned route explicit and preserve existing callers:

```ts
// src/lib/operations.ts
export interface Operation {
  name: string;
  tool: ToolSpec;
  paths: Toolpath[];              // legacy/default path list
  passDepths: number[];
  /** When present, entry i is used only for passDepths[i]. */
  pathsByPass?: Toolpath[][];
}
```

The final operation becomes:

```ts
const passDepths = makePassLadder(
  settings.stockThickness + settings.cutoutOvercut,
  settings.cutoutStepdown,
);
const plan = planSquareFrameCutout(model, passDepths);

{
  name: "[T1]Square Frame Cutout",
  tool: flatTool,
  paths: plan.pathsByPass.flat(),  // keeps active-operation filtering simple
  passDepths,
  pathsByPass: plan.pathsByPass,
}
```

In the emitter, pick the actual pass route by index and distinguish any pointwise-depth path from a constant one by data, not `kind === "detail"`:

```text
for each (passIndex, passZ) in operation.passDepths:
    paths = operation.pathsByPass?.[passIndex] ?? operation.paths
    for each path in paths:
        reposition to path.points[0]
        if any path point has a depth:
            plunge to first.depth
            emit every next point as G1 X... Y... Z(surfaceZ - point.depth)
        else:
            depth = min(path.depth ?? -passZ, -passZ)
            plunge to depth
            emit remaining points at constant Z
```

This removes the accidental semantic coupling between “variable depth” and `PathKind.detail`. Existing detail paths still work because their engraving operation has one pass; the test suite must explicitly prove that behavior remains unchanged.

### 5.6 Integration edits by file

1. **`src/lib/types.ts`** — add two settings and update the old comment from “artwork silhouette” to “square frame around artwork.” Do not add a `cutoutShape` selector.
2. **`index.html`** — replace label “Cut out around the artwork at the end (T1)” with “Cut out a square frame around the artwork at the end (T1).” Add bridge-thickness and bridge-span numeric controls beside the cutout depth controls, with concise physical-unit hints.
3. **`src/main.ts`** — parse and clamp the two fields. Extend warnings with the safety message that a bridge is intentional and requires manual separation after the spindle stops.
4. **`src/lib/cutout.ts`** — new pure module described above.
5. **`src/lib/pipeline.ts`** — delete the distance-transform/profile-tracing cutout block (`228-248`); compute the ladder once, call the new planner, and use its `pathsByPass`. Remove imports used only by the deleted block (`fillHoles`, `simplifyClosedLoop`, `traceBoundaryLoops`) only after confirming they have no other use in the file.
6. **`src/lib/operations.ts`** — add `pathsByPass` and data-driven variable-depth emission. Preserve toolchange/reposition/header behavior.
7. **`src/lib/cutout.test.ts`** — new planner-level tests.
8. **`src/lib/pocketing.test.ts`** (or a focused new `operations.test.ts`) — writer tests for a variable-depth contour, pass-specific routing, direct re-plunge continuity, and unchanged V-detail behavior.
9. **`scripts/generate-test-gcode.ts`** — add the two default fields and turn on the frame feature for one intentionally named fixture set. Regenerate only the documented expected G-code files after tests pass.
10. **`gcode-tests/README.md` / sidecars** — describe the square-frame/bridge settings so generated artifacts remain auditable.

## 6. Decision records

### Decision: replace, rather than retain, the silhouette cutout

- **Context:** The user explicitly asks for a square frame “not just around the profile.”
- **Options considered:** (a) Keep profile as a selectable shape; (b) silently change the existing cutout to square; (c) add an arbitrary frame-shape model.
- **Decision:** Change the existing cutout semantics to a square frame and update its label/documentation.
- **Rationale:** It directly implements the requested behavior, keeps the UI small, and avoids a compatibility shim that no stated requirement needs.
- **Consequences:** Existing generated output changes when cutout is enabled; batch sidecars and user-facing label must make that visible.
- **Status:** proposed.

### Decision: four side-midpoint, ramped bridges

- **Context:** A fully cut final contour can release the part. The local Makera file is the only concrete reference supplied.
- **Options considered:** (a) Skip fixed XY sections; (b) add constant shallow plateaus; (c) use four pass-proportional, deep-to-shallow-to-deep ramps.
- **Decision:** Use four side-midpoint ramps, whose final span is configurable and whose intermediate span is proportional to depth beyond the retained cut.
- **Rationale:** This exactly matches the observed four-side pattern and scaling in `MakeraBadge.nc` while keeping output continuous and deterministic.
- **Consequences:** G-code must support X/Y/Z on contour moves; visual preview remains XY-only initially; a physical test coupon is mandatory before production use.
- **Status:** proposed.

### Decision: describe bridges by thickness and final span

- **Context:** Coordinate Z changes with surface origin and stock thickness, and Makera’s bridge has no constant shallow plateau.
- **Options considered:** (a) Expose a shallow Z coordinate; (b) expose ramp slope; (c) expose remaining material thickness and final two-ramp span.
- **Decision:** Use `cutoutBridgeThickness` and `cutoutBridgeSpan`.
- **Rationale:** Both units are inspectable by an operator and allow direct reproduction of the sample’s 0.8mm remaining material / 12.4mm final span.
- **Consequences:** Planner derives the retained cut depth and intermediate spans; validation messages must explain invalid stock/overcut combinations.
- **Status:** proposed.

### Decision: generalize `Operation`, not `PathKind`

- **Context:** A bridge is a contour with varying depth, but current G-code writer reserves pointwise depth for `kind === "detail"`.
- **Options considered:** (a) misclassify bridge contours as `detail`; (b) add a `bridge` path kind; (c) add pass-specific routes and detect pointwise depth from point data.
- **Decision:** Add `Operation.pathsByPass` and data-driven variable-depth emission.
- **Rationale:** It expresses the actual scheduling dimension (different route per pass) and leaves rendering/path color semantics alone.
- **Consequences:** The writer loop changes and needs regression tests for both old details and ordinary constant contours.
- **Status:** proposed.

## 7. Detailed implementation sequence

### Phase 1: establish contracts and pure geometry

1. Add the settings fields and settings-reader defaults.
2. Write `src/lib/cutout.ts` with square-bound construction before integrating it.
3. Write unit tests for non-square artwork bounds, mirror transforms, constant shallow pass, and depth-profiled later passes.
4. Make invalid input throw descriptive `Error`s (not silently clamp a too-wide bridge into a corner).

Acceptance checks:

- A 30×10mm artwork with 2mm margin and 3.175mm tool creates a 37.175mm square tool-center loop.
- A 1.3mm stock / 0.2mm overcut / 0.8mm bridge ladder `[-0.5, -1, -1.5]` has no shallow bridge points at -0.5, 6.2mm spans at -1.0, and 12.4mm spans at -1.5.
- Each non-first bridge pass has exactly four points at retained depth, one at each side midpoint.

### Phase 2: wire per-pass paths into G-code emission

1. Add `pathsByPass?: Toolpath[][]` to `Operation`.
2. Iterate the ladder with `passIndex`.
3. Use `pathsByPass[passIndex]` when supplied; otherwise retain the existing shared `paths` behavior.
4. Detect variable depth via `path.points.some((point) => point.depth !== undefined)`.
5. Emit the first point’s plunge and every subsequent path point with its own Z for variable paths.
6. Keep current direct deeper re-plunge only when a pass ends and the next pass begins at the same XY coordinate. The planned square remains closed and therefore exercises this behavior.

Acceptance checks:

- Generated last toolpath is `[T1]Square Frame Cutout` after engraving/flat clearing.
- It has one T1 tool change, no extra tool change between ladder passes, and ends with `M5`, `G28`, `M2` as today.
- The output contains G1 lines that combine X/Y/Z for bridge ramps, as Makera does.
- Existing `generateProgram` expectations for toolchange order, MKR metadata, hop/full repositioning, and simple depth ladders still pass.

### Phase 3: pipeline/UI integration

1. Replace the existing `cutoutPaths` profile block with `planSquareFrameCutout`.
2. Ensure auto-crop has enough padding for the **square frame’s corner**, not merely an offset contour. The current padding formula at `src/lib/pipeline.ts:84-101` protects only the former margin/tool-radius condition. Either calculate a diagonal-safe pad from the square expansion or build the frame from original (pre-crop) geometry.
3. Update the UI labels, settings reader, and warning copy.
4. Change generated fixture defaults deliberately; do not accidentally enable cutout for every large test fixture without reviewing output size and time.

Acceptance checks:

- The canvas preview shows a single square outside the artwork rather than its silhouette.
- User-visible warning says bridges leave material intentionally and the part must not be pried out until the job ends.
- Disconnected mask components still yield one enclosing square.

### Phase 4: structural and physical validation

1. Run `pnpm test` and `pnpm build`.
2. Run `pnpm gen:testgcode` only after reviewing the default fixture decision.
3. Parse a generated frame program using `parseGcode` and verify one final toolpath, all expected nominal depths, and eight paired XY+Z ramps for the sample ladder.
4. Use the ticket analyzer (or extend it to accept the generated file) to compare counts, shallow depth, and spans with Makera semantics.
5. In a simulator, verify units, absolute mode, tool selection, bounds, and no travel through clamps.
6. On a sacrificial blank, air-cut first, then cut at conservative feeds. Confirm all four bridges hold during machining and that manual separation does not fracture the artwork.

## 8. Test strategy and test matrix

| Layer | Test | Evidence / expected invariant |
|---|---|---|
| `cutout.ts` geometry | Non-square bounds produce a square | Frame X/Y spans are equal and enclose tool-radius-adjusted artwork bounds. |
| `cutout.ts` coordinate mapping | Mirrored X/Y | Frame remains enclosing after `pixelToMachine` transformation; no assumption that image Y is machine Y. |
| `cutout.ts` bridge scheduling | 1.3/0.2/0.5/0.8/12.4 settings | Ladder routes have 0, 4, 4 retained-depth centers; spans are 0, 6.2, 12.4mm. |
| `cutout.ts` guards | Bridge too wide / no final depth beyond retained depth | Throws useful configuration errors. |
| `operations.ts` | Variable-depth contour | Emitted G1 records include X/Y/Z and correct `surfaceZ - point.depth`. |
| `operations.ts` | `pathsByPass` | Each pass consumes only its planned route; no repeated bridge geometry across wrong depths. |
| `operations.ts` regression | V-bit detail path | Existing single-pass pointwise-depth engraving still emits correctly. |
| `pipeline.ts` | Cutout integration | Final operation name/order is correct and contains one square route per ladder pass. |
| end-to-end | Parser/analyzer | Generated job has MKR marker/header, four final bridges, correct shallow value, and program end. |
| manual CNC | Air-cut + sacrificial stock | No clamp collision; all bridges retain workpiece until manual removal. |

Do not assert only line counts. Formatting and metadata changes can alter line counts without changing geometry. Assert topology, positions, depths, operation order, and selected command substrings.

## 9. Risks, alternatives, and open questions

### 9.1 Safety risks

- **Insufficient bridges:** a 0.8mm remaining thickness may be appropriate for the supplied 1.3mm ABS sample but may not hold larger parts, brittle material, or aggressive feeds. Begin with a coupon.
- **Excessive bridges:** oversized/too-thick bridges make manual separation difficult and can tear the finished edge.
- **Stock boundary unknown:** the current program header always claims a 100×100mm stock and UI does not model usable clamping area. A square can extend into a clamp even if it is inside the nominal header stock.
- **Preview ambiguity:** the canvas does not encode depth, so a green square alone does not prove bridge routing.
- **Tool direction/cut quality:** conventional versus climb direction is not represented as a user choice. A square makes this more visible on edge finish; validate against the material/tool setup.

### 9.2 Alternatives rejected for this ticket

- **Contour profile with tabs:** retains the existing product shape, contrary to the requested square frame.
- **Omitted XY gaps:** simpler output but introduces non-cut transitions, different workholding mechanics, and does not match Makera’s observed continuous-ramp approach.
- **Tabs only in the final pass with fixed width:** easier but fails to preserve the evidence-backed proportional ramp behavior in intermediate stepdowns.
- **A new `bridge` `PathKind`:** makes renderer color/API vocabulary more complex without solving per-pass scheduling.
- **Fixed physical Z=-0.5:** unsafe for any stock thickness or surface origin other than the sample’s configuration.

### 9.3 Open questions requiring human confirmation

1. Is a **square**, rather than a rectangle matching the source aspect ratio, always intended? This guide implements square because that is the explicit request.
2. Should 0.8mm thick / 12.4mm span be defaults for all jobs, or should defaults be scaled down for small workpieces? The proposed guards reject impossible spans but do not auto-scale a user’s physical workholding choice.
3. Should the app introduce explicit stock width/height and clamp-clearance inputs before enabling automatic frame cutouts on large work? This is recommended as a separate safety ticket.
4. Does the chosen Makera controller accept simultaneous XYZ G1 moves at the feeds supplied for all target machines? The reference proves this dialect accepts them; simulation and an air cut must confirm the specific machine.

## 10. Implementation checklist

- [ ] Add `cutoutBridgeThickness` and `cutoutBridgeSpan` to `Settings`, UI, browser reader, and batch defaults.
- [ ] Create and unit-test `src/lib/cutout.ts`.
- [ ] Replace profile geometry in `runPipeline` with a square-frame plan.
- [ ] Add `Operation.pathsByPass` and generic pointwise-depth emission.
- [ ] Add writer regression tests for details, constant contours, and bridge contours.
- [ ] Update preview/warnings and generated fixture documentation.
- [ ] Run tests/build and structural generated-G-code analysis.
- [ ] Simulate, air-cut, and cut a sacrificial physical test.

## 11. References

### Primary local evidence

- `testdata/MakeraBadge.nc:17652-18262` — final T1 contour, full shallow pass, and four bridge-ramp locations on subsequent passes.
- `ttmp/2026/08/01/MILL-06--square-frame-cutout-with-holding-bridges/scripts/01-analyze-makera-contour-bridges.py` — reproducible bridge reconstruction script.
- `ttmp/2026/08/01/MILL-01--split-mill-app-into-vite-ts-modules-and-add-g-code-visualizer/analysis/01-makerabadge-nc-g-code-analysis.md:102-105` — prior conclusion superseded by this ticket’s line-level analysis.

### Implementation source references

- `src/lib/types.ts:6-72` — geometry and settings contracts.
- `src/main.ts:113-180` and `index.html:147-165` — current cutout settings UI/read path.
- `src/lib/pipeline.ts:84-105` — auto-crop logic that needs square-frame padding review.
- `src/lib/pipeline.ts:228-259` — existing profile-cutout creation and final operation.
- `src/lib/toolpath.ts:5-24` — canonical pixel/machine coordinate transformation.
- `src/lib/imaging.ts:158-175`, `200-238`, `240-280` — artwork bounds, hole fill, and distance field behavior.
- `src/lib/operations.ts:46-65`, `88-203` — `Operation`, depth ladder, and G-code emitter loop.
- `src/gcode/parser.ts:119-295` — parser used for output statistics and structural inspection.
- `src/lib/pocketing.test.ts:140-285` — existing writer/ladder test patterns.
- `scripts/generate-test-gcode.ts:41-86` — Node defaults that must compile after the settings change.
