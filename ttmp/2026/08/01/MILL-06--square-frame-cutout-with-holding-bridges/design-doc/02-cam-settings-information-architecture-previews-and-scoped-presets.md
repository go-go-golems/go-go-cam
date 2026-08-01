---
Title: CAM settings information architecture, previews, and scoped presets
Ticket: MILL-06
Status: active
Topics:
    - cnc
    - frontend
    - gcode
    - toolpath-generation
DocType: design-doc
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://index.html
      Note: |-
        Current single scrolling settings sidebar and existing field group boundaries.
        Current single-page settings layout and parameter inventory
    - Path: repo://src/lib/operations.ts
      Note: |-
        makePassLadder and Operation already support repeated constant-depth paths across a pass ladder.
        Existing pass-ladder and repeated constant-depth emission enabling T1 multi-pass
    - Path: repo://src/lib/pipeline.ts
      Note: |-
        Current T1 flat clearing is one pass at targetDepth; the proposed clearing ladder belongs here.
        Current one-pass T1 clearing integration seam
    - Path: repo://src/lib/settings-transfer.ts
      Note: |-
        Current whole-settings v2 JSON transfer format; scoped preset format must not be confused with it.
        Whole-job v2 format distinct from proposed scoped presets
    - Path: repo://src/lib/types.ts
      Note: |-
        Current single Settings object and all persisted generated-job inputs.
        Flat Settings contract retained at the pipeline boundary
    - Path: repo://src/main.ts
      Note: |-
        Reads the DOM controls, owns image-content restoration, and is the UI integration seam.
        DOM settings registry and image-specific whole-job persistence
ExternalSources: []
Summary: Design for replacing the growing single settings sidebar with progressive, explainable CAM workspaces; adds reusable setting help, geometry explainers, scoped presets, and a multi-pass T1 clearing design.
LastUpdated: 2026-08-02T00:30:00-04:00
WhatFor: Plan an understandable parameter UI before adding detailed tooltips and deeper multi-pass T1 wide-area clearing.
WhenToUse: Read before changing CAM setting controls, persistence formats, operation-depth scheduling, or settings UI architecture.
---


# CAM settings information architecture, previews, and scoped presets

## Executive Summary

The current sidebar is already a long form: Artwork, Image processing, Material and V-bit, Operations, Settings transfer, and Machine/G-code are stacked in one sticky, scrollable panel (`index.html`). The current `Settings` type is also intentionally flat because `src/main.ts` reads every control into one generated-job input object and transfers/restores it as one v2 JSON payload. That is a sound *runtime* representation, but it is not a good mental model for an operator who wants to answer only “will I cut through?”, “how much will T1 take per pass?”, or “what will this frame look like?”

This proposal keeps the flat runtime contract but presents settings as five task-oriented, collapsible workspaces with a compact “job recipe” summary. Every control gets an accessible, reusable explanation; a small number of parameter families get live geometry explainers rather than misleading full-machine simulation. The next functional CAM setting should be `flatClearingStepdown`: it schedules the existing T1 wide-area routes through a depth ladder down to the existing `targetDepth`, rather than changing the intended final depth.

No production UI or cutting behavior is changed by this design document. It records the product decisions required before implementation.

## Problem Statement and Evidence

### Current state

| Evidence | Consequence |
|---|---|
| `index.html` exposes 50+ controls in one scrollable `<aside class="controls">`; the Operations fieldset alone combines pocket strategy, T1 clearing, tool data, frame geometry, stock, depth ladder, and holding bridges. | The operator must infer which values are coupled and scroll between distant concepts. |
| `src/main.ts` has one `SETTINGS_CONTROL_IDS` list and saves/restores every value for an image as a whole. | This correctly restores an image job but cannot express “reuse only my ABS material/tool recipe” without copying machine offsets too. |
| `src/lib/pipeline.ts` sends `flatPaths` to `[T1]Flat Clearing` with one `passDepths: [-settings.targetDepth]`. | Wide-area clearing reaches the target in one plunge regardless of material/tool preference. |
| `src/lib/operations.ts:makePassLadder` and `Operation.passDepths` already support shallow-to-deep ladders; constant-depth paths are capped at the current pass with `Math.min(path.depth, -passZ)`. | Multi-pass T1 clearing is a low-risk scheduling addition; it does not need a new pocket planner. |
| Frame controls now include mode, five possible margins, radius, stock, stepdown, overcut, bridge thickness, and span. | Each numeric field needs an explanation in physical terms, dependencies, and a visual relationship. |

### Design goals

1. Let a first-time operator start from a safe, understandable recipe without confronting every expert control.
2. Let an experienced operator reach every existing control without a “basic mode” hiding capability.
3. Show the actual geometric/depth consequence of coupled values, not a generic information icon alone.
4. Keep generated G-code deterministic: expanded UI/preset structure must resolve to the existing flat `Settings` object before `runPipeline`.
5. Separate *image-specific*, *material/tool*, *operation*, and *machine-safety* reuse so a copied recipe cannot quietly move an origin or weaken clearance.
6. Avoid claiming a browser drawing is a machine collision simulation. It is an explainer, not validation.

### Non-goals

- Replacing physical simulator, air-cut, probing, fixturing, or sacrificial-stock validation.
- Introducing browser-only “AI recommended” feed/depth values without a validated material/tool database.
- Changing the Makera-style T1/T2 order, bridge semantics, or G-code dialect as part of the information-architecture change.
- Breaking a user’s current v2 whole-job transfer merely to introduce scoped presets.

## Proposed Information Architecture

### Five workspaces, not one giant form

Use a left navigation rail or responsive top tabs. On small screens the same units become an accordion. Each workspace has: (1) a short sentence describing the decision, (2) a green/amber “recipe summary” chip, (3) a Basic panel, and (4) an Advanced disclosure. Keep the generate/review action visible outside the workspace content.

1. **Artwork & outcome** — image, finished size, auto-crop, threshold/cleanup, and the desired visual result.
2. **Engraving (T2)** — V-bit geometry, cap breakthrough target, engraving pocket strategy, and T2 feeds/spindle.
3. **Flat end mill (T1)** — wide-area clearing and final-frame sections, including independent depth planning for each operation.
4. **Stock & holding** — stock thickness, frame margin/radius, cut-through ladder, and bridge retention. This is visually separate from the optional T1 clearing checkbox even though both use T1.
5. **Machine & export** — origin/mirroring, surface/clearance/hop, spindle-code policy, G-code review/download.

“Settings transfer” becomes **Recipes & presets** in the workspace header or a dedicated drawer rather than a large text area between CAM fields. Keep the current textarea fallback available only after the user chooses Import/Export.

### Proposed desktop sketch

```text
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│ ABS Bicolor V-Engraver                                     [Recipe: ABS 1.3 / T1 3.175]     │
├───────────────┬─────────────────────────────────────────────────────┬───────────────────────┤
│ JOB SETUP     │ T1 · Flat end mill                                  │ JOB REVIEW            │
│ ● Artwork     │ ┌─ Wide-area clearing ─────────────────────────────┐ │ Artwork: cat.png     │
│   Engraving   │ │ [✓] Clear wide areas before V-bit      ( ? )     │ │ 100.0 × 72.0 mm      │
│   Flat end    │ │ Tool  [3.175 mm ▾]       Stepover [45 %]         │ │ T2 target: 0.12 mm   │
│   Stock/frame │ │ Target depth: 0.12 mm (from material recipe)     │ │ T1 clearing: 2 passes│
│   Machine     │ │ Per-pass depth [0.10 mm] ( ? )                   │ │ Frame: 2 mm / R3     │
│               │ │                                                     │ │ [View depth ladder]  │
│ PRESETS       │ │   material surface ────────────────  Z 0.00       │ │                       │
│ [Save scope ▾]│ │   pass 1        █████████████        Z -0.10      │ │ [Generate & review]  │
│ [Load…]       │ │   pass 2        ██████████████       Z -0.12      │ │                       │
│               │ └───────────────────────────────────────────────────┘ │                       │
│               │ ┌─ Final frame (optional) ──────────────────────────┐ │                       │
│               │ │ [✓] Cut out frame  Margin [uniform ▾] [2.0 mm]     │ │                       │
│               │ │ Corner radius [3.0 mm]  Bridges [0.80 mm retained]│ │                       │
│               │ │  ┌──────── selected frame / bridges preview ────┐ │                       │
│               │ │  │   ┌──────────── rounded frame ───────────┐   │ │                       │
│               │ │  │   │                artwork               │   │ │                       │
│               │ │  │   └───────╲ bridge ╱─────────────────────┘   │ │                       │
│               │ │  └─────────────────────────────────────────────┘ │ │                       │
│               │ └───────────────────────────────────────────────────┘ │                       │
└───────────────┴─────────────────────────────────────────────────────┴───────────────────────┘
```

The review card is not another set of editable controls. It derives values from the current settings and links back to the owning workspace. It should surface: finished dimensions, target depth, number of T1 clearing/frame passes, min bridge remaining thickness, operation order, and warnings/errors.

### Basic versus advanced

**Basic** controls are decision-level and immediately useful: finished width; material recipe; target breakthrough; T2/T1 enablement; flat tool; T1 clearing stepdown; frame enable/margin/radius; frame bridge thickness; machine origin preset; and Generate.

**Advanced** controls remain available under the correct owner: image morphology/vector tolerance; pocket strategy/stepover; T1 feeds/plunge/RPM; per-side margins; cutout overcut/span; approach/hop paths; raw mirroring/spindle commands. Expanded sections should be remembered per browser, but no advanced setting is discarded or reset when collapsed.

## Contextual Help and Geometry Explainers

### Reusable help contract

Do not use a browser-native `title` tooltip as the only explanation: it is inconsistent on touch and keyboard and cannot carry structured safety text. Create a typed help registry keyed by control id, for example:

```ts
interface SettingHelp {
  label: string;
  purpose: string;
  affects: string;
  safeStartingPoint?: string;
  dependencies?: string[];
  caution?: string;
  preview?: "v-bit" | "t1-clearing-depth" | "frame" | "bridges" | "machine-z";
}
```

Each visible setting label receives a keyboard-focusable `button` with `aria-expanded`, `aria-controls`, and an explicit accessible name such as “Explain T1 clearing stepdown”. On click/focus, a small popover shows `purpose`, `affects`, `starting point`, `depends on`, and `caution`; on touch it behaves as a pinned inline card. Reuse the same registry in the review card and import validation errors so definitions cannot drift.

### Required detailed help content

| Setting/family | Detailed operator description |
|---|---|
| **T1 wide-area clearing** | Removes material in regions wide enough for the flat cutter before T2 finishes narrow and sloped detail. It reduces V-bit time and avoids using the V-bit as a bulk end mill. It does not choose the final visual depth; the material recipe’s `targetDepth` does. |
| **T1 clearing depth per pass** *(proposed)* | The maximum additional Z depth T1 takes each time it repeats the same clearing routes. Smaller values create more passes and lower per-pass load; the final pass is shortened to land exactly at the target depth. It must be positive and should be chosen from the real tool, material, workholding, and machine—not assumed safe solely because the UI allows it. |
| **Flat diameter / stepover** | Diameter determines what is considered a wide area and the cutter-center boundary; stepover determines lateral overlap. These change coverage and time, not the final top-layer target depth. A smaller stepover increases overlap and time. |
| **Target depth / breakthrough** | `targetDepth = capThickness + breakthrough`. It is the total depth below the measured top surface used by T2 and (when enabled) T1 clearing. Breakthrough intentionally enters the lower layer; it is not stock cut-through. |
| **Frame margin modes** | In uniform mode, the finished edge clearance is the same on all four machine-space sides. Individual mode deliberately changes top/right/bottom/left clearance. The tool center is further out by the flat-tool radius, which the preview must show. |
| **Corner radius** | Radius is measured at the tool-center frame path. A value of zero produces sharp corners. Larger values consume straight-side length; the planner rejects values that cannot leave safe bridge geometry. |
| **Cutout stepdown / overcut** | Stepdown is the Z increment for the T1 through-cut ladder. Overcut goes below stock bottom to ensure separation, potentially into a spoilboard. These settings belong to final-frame cutting, not wide-area clearing. |
| **Bridge retained thickness / span** | Retained thickness is material intentionally left at each bridge midpoint. Span is the full length of the two-ramp bridge at final depth. Four bridges are placed at straight-side midpoints. The browser can draw the relationship but cannot tell whether a real part will stay held. |
| **Approach / hop / clearance Z** | Clearance is used for operation boundaries and long travel, approach is the rapid descent height before a feed plunge, and hop is for short repositioning. These are machine-safety motions, so they should be imported only through a machine-scope preset or an explicit whole-job import confirmation. |

### Four small explainers, not a fake simulator

1. **V-bit section:** cross-section showing cap thickness, breakthrough, target depth, included angle, and resulting cut width.
2. **T1 clearing depth ladder:** a vertical stock section with one band per scheduled pass, `targetDepth`, and calculated pass count. It updates on cap thickness, breakthrough, and `flatClearingStepdown`.
3. **Frame plan:** top-down artwork rectangle/mask bounds, selected margins, tool-center path, rounded corners, and four bridge positions. It labels selected individual values and warns if geometry is rejected.
4. **Machine Z motion:** a deliberately schematic 0/safe/approach/hop diagram. It says “Motion-height explainer — not collision simulation.”

Render explainers with SVG/canvas from the same derived values used by the pipeline; display no animation that implies tool/material deflection, chips, clamps, spindle load, or collision knowledge. The existing preview canvas remains the post-generation truth for toolpaths.

## T1 Wide-Area Clearing: Multi-Pass Design

### User-facing behavior

Add `T1 clearing depth per pass (mm)` under **T1 · Wide-area clearing**, defaulting to a conservative material recipe value (proposed initial app default: `0.10 mm`). If the final `targetDepth` is `0.12 mm`, the review/explainer reports two T1 passes: `-0.10`, `-0.12`. If the control is at or above target depth, it reports one pass. Changing this setting must not change `targetDepth`, cutter coverage, V-bit depth, or frame-cutout stepdown.

This is distinct from existing `cutoutStepdown`, which is only for the frame through-cut. The UI should avoid the bare word “stepdown” in the T1 card; “clearing depth per pass” is clearer.

### Runtime contract and pseudocode

```ts
// Settings: separate operation-specific depth schedules.
flatClearingStepdown: number; // mm, positive; default 0.10

const clearingPassDepths = settings.flatClearing
  ? makePassLadder(settings.targetDepth, settings.flatClearingStepdown)
  : [];

{
  name: "[T1]Flat Clearing",
  tool: flatTool,
  paths: flatPaths, // existing routes are authored with depth = targetDepth
  passDepths: clearingPassDepths
}
```

No `pathsByPass` is needed. `generateProgram` already emits the same constant-depth route at every pass; its `constDepth = Math.min(path.depth, -passZ)` gives exactly the desired shallow-to-deep schedule. The last ladder entry is always `-targetDepth`, so no rounding accumulation changes the final depth.

### Required validation and tests

- Validate `flatClearingStepdown` as finite and `>= 0.05 mm`, matching `makePassLadder`’s current lower clamp; show the actual effective value rather than silently accepting a smaller requested number.
- Unit test ladder examples: `0.12 / 0.10 → [-0.10, -0.12]`; `0.12 / 0.20 → [-0.12]`; an exact multiple has no duplicate final pass.
- Pipeline/parser test with flat clearing enabled: verify T1 clearing routes occur at every scheduled Z and never deeper than the final target.
- Regression test with flat clearing disabled: the operation remains inactive and no T1 clearing path is emitted.
- Browser test: help card describes the setting, depth explainer reports the same ladder the G-code uses, and copying/restoring the current whole job preserves it.

## Scoped Presets and Transfer

### Preserve the current whole-job feature

Current content-keyed v2 localStorage and Copy/Paste settings are valuable as **Image job state**: restore exactly the editable job for the same image on this browser. Keep that behavior and label it “This image’s full job”. Do not silently reinterpret old v2 payloads as a material or machine preset.

### Add explicitly scoped recipes

A new preset has a name, scope, schema version, values, and optional provenance/note. It must be reviewed before application.

```ts
type PresetScope = "material-and-tools" | "t1-clearing" | "frame-cutout" | "machine-safety" | "image-processing";
interface CamPreset {
  format: "abs-bicolor-v-engraver/cam-preset";
  version: 1;
  scope: PresetScope;
  name: string;
  values: Record<string, boolean | number | string>;
  note?: string;
}
```

| Scope | Includes | Explicitly excludes |
|---|---|---|
| **Material and tools** | V-bit angle, cap/breakthrough, T1/T2 tool geometry and feeds, stepover, proposed T1 clearing depth/pass. | Image cleanup, frame dimensions, origin and all motion safety coordinates. |
| **T1 clearing** | Enabled state, flat diameter, flat RPM/feed/plunge, stepover, proposed depth/pass. | Frame cutout and T2/V-bit geometry. |
| **Frame cutout** | Enablement, uniform/per-side margins, radius, stock thickness, cutout stepdown/overcut, bridge dimensions. | Artwork size, T1 clearing, machine origin. |
| **Machine safety** | Origin, surface, safe/approach/hop, mirrors, spindle command policy. | All image/material/operation settings. Requires an extra confirmation showing changed coordinates. |
| **Image processing** | Threshold, morphology, min area, vector tolerance, crop/invert. | Physical CAM and machine settings. |

When loading a preset, present a diff: “will change 6 values / leave 47 untouched.” Store named presets in a separate localStorage namespace, not under the content-derived image key. Start with export/import JSON and local named recipes; cloud sync and shared libraries are later product work.

## Decision Records

### ADR-1: Keep flat Settings at the pipeline boundary

- **Context:** The UI needs human-oriented groups, but pipeline/tests currently consume a single `Settings` object.
- **Options:** (a) nest all runtime settings by UI group; (b) keep the flat object and add a view model/preset mapping; (c) duplicate values in both forms.
- **Decision:** Keep the flat runtime object. UI group definitions and preset scopes map to/from it.
- **Rationale:** It minimizes G-code regression risk and keeps `runPipeline` independent of presentation, while still enabling scoped UI/persistence.
- **Consequences:** The help/preset registry must be exhaustively typed/tested so renamed settings cannot silently disappear from a scope.
- **Status:** proposed.

### ADR-2: Use explainers for parameter relationships, not a machine simulator

- **Context:** Operators need feedback, but a 2D browser cannot validate clamps, origin probing, machine limits, or cutting forces.
- **Options:** (a) no visuals; (b) call visual sketches simulation; (c) show bounded geometry/depth explainers with explicit limits.
- **Decision:** Use option (c).
- **Rationale:** Exact derived geometry helps comprehension without overclaiming CNC safety.
- **Consequences:** Copy in every explainer must state what it does not validate; physical/simulator workflow remains mandatory.
- **Status:** proposed.

### ADR-3: Give T1 clearing its own pass-depth parameter

- **Context:** Existing `[T1]Flat Clearing` is a single pass to `targetDepth`; existing `cutoutStepdown` is semantically unrelated.
- **Options:** (a) reuse cutout stepdown; (b) add `flatClearingStepdown`; (c) automatically choose depths from a hidden heuristic.
- **Decision:** Add `flatClearingStepdown` with an explicit visual ladder.
- **Rationale:** It states the physical trade-off and avoids coupling a shallow clearing operation to a through-cut.
- **Consequences:** Settings transfer moves to a new whole-job schema version when implemented; scoped T1 presets include this field.
- **Status:** proposed.

## Phased Implementation Plan

1. **Foundation:** inventory every `SETTINGS_CONTROL_IDS` field in a typed metadata registry: owner workspace, Basic/Advanced tier, help content, preset scopes, and any explainer dependencies. Add a coverage test requiring each control id exactly once.
2. **Information architecture:** turn current fieldsets into workspace/accordion components while retaining all element ids initially; add persistent expanded-state UI preferences outside generated job settings.
3. **Help system:** implement accessible popover/inline cards from the registry; add detailed content for all current fields, beginning with T1, frame, bridge, and Z-motion families.
4. **Explainers:** implement deterministic SVG renderers for V-bit, T1 depth, frame, and machine-Z diagrams. Unit-test derived labels/ladder values; browser-test keyboard/touch opening.
5. **T1 multi-pass:** add `flatClearingStepdown`, use `makePassLadder(settings.targetDepth, value)` for `[T1]Flat Clearing`, test parser depth behavior, then bump whole-job transfer/storage schema intentionally.
6. **Scoped presets:** add validated v1 preset envelope, scope-to-key registry, named local store, diff/confirmation screen, export/import, and tests proving excluded machine values remain unchanged.
7. **Operator validation:** rebuild, test, review visual explainers with representative sample images, and perform simulator/air-cut/sacrificial material checks before relying on any changed depth schedule.

## Alternatives Considered

- **Keep adding hints under every input in the existing sidebar:** cheaper initially, but worsens scrolling and hides cross-setting relationships.
- **A single global “expert mode”:** too coarse; an operator may need advanced frame margins while retaining simple machine setup.
- **One universal preset containing all settings:** convenient but unsafe because a material recipe can overwrite machine origin/clearance and image cleanup.
- **Automatically derive T1 stepdown from tool diameter:** potentially useful later, but lacks machine/material/workholding evidence; an explicit operator-controlled value is more honest now.
- **Full 3D CAM simulation in-browser:** out of scope and dangerous if perceived as collision or force validation.

## Open Questions

1. Should a material/tool recipe store nominal stock thickness, or should thickness always be measured per job and therefore remain in Frame cutout/job state?
2. What validated T1 clearing-per-pass defaults should ship for 1.3mm bicolor ABS with the actual Makera tool and workholding? The proposed `0.10 mm` is a UI seed, not physical validation.
3. Should frame cutout and wide-area clearing share one T1 tool selector initially, or should future tool-library support permit a distinct T1 end mill for each?
4. Is the desired default landing workspace “Artwork & outcome” or a compact Dashboard with the five decision summaries?
5. Which named local recipes should ship, if any, rather than requiring an operator to create the first one?

## References

- `index.html` — current single-page form and fieldset boundaries.
- `src/main.ts` — control inventory, DOM state, image keyed persistence, transfer wiring.
- `src/lib/types.ts` — flat `Settings` contract.
- `src/lib/pipeline.ts` — current single-pass `[T1]Flat Clearing` and independent cutout ladder.
- `src/lib/operations.ts` — existing `makePassLadder` and multi-pass emission behavior.
- `src/lib/settings-transfer.ts` — current strict whole-job v2 envelope.
- `reference/01-diary.md`, Step 13 — current rounded-frame operator behavior and validation evidence.
