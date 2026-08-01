---
Title: 'Connected Fermat Spirals: Algorithm and Implementation Design'
Ticket: MILL-04
Status: active
Topics:
    - cnc
    - gcode
    - toolpath-generation
    - research
DocType: design-doc
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://src/lib/pocketing.ts
      Note: Ring infrastructure the strategy builds on
    - Path: repo://ttmp/2026/08/01/MILL-04--connected-fermat-spiral-pocketing-strategy/sources/pdf/zhao2016-connected-fermat-spirals.pdf
      Note: The CFS paper (algorithm source)
ExternalSources:
    - https://haisenzhao.github.io/CFS/files/fermat_spirals.pdf
    - https://haisenzhao.github.io/CFS/
    - https://github.com/ejbosia/connected-fermat-spirals
Summary: 'Design for a Fermat-spiral pocketing strategy: Zhao et al. 2016 adapted to our distance-field ring infrastructure, with a discrete arc/gap/corridor construction and recursive chain splicing.'
LastUpdated: 2026-08-01T02:20:00-04:00
WhatFor: Guide src/lib/fermat.ts implementation and review.
WhenToUse: Before modifying the fermat pocketing strategy.
---


# Connected Fermat Spirals: Algorithm and Implementation Design

## 1. Goal

Replace per-ring plunge/retract (and even stay-down ring linking) with a **single continuous open path per pocket region** whose start and exit both lie on the outer boundary, adjacent to each other. This is the "connected Fermat spiral" (CFS) of Zhao et al., SIGGRAPH 2016 (`sources/pdf/zhao2016-connected-fermat-spirals.pdf`). One plunge and one retract per region is the theoretical minimum for a constant-depth pocket.

## 2. What the paper says (evidence)

Read from the paper (pages 3-5):

- Contour-parallel fills are iso-contours of the Euclidean distance transform, indexed c_{i,j} with d = (i-0.5)w — *exactly our existing ring structure* from `extractIsoContours`.
- A region is **spirallable** iff the distance field has a single local maximum inside it; then breaking each contour and rerouting to its neighbor yields one continuous spiral (their Fig. 4).
- A spiral converts to a **Fermat spiral** (in-and-back-out, Fig. 5) via inward/outward links; start and exit can be placed arbitrarily and adjacent on the outer contour.
- Arbitrary regions: build the **spiral-contour tree** (nodes = iso-contours, edges weighted by connecting-segment length), minimum-weight spanning tree rooted at the outer boundary; Type I nodes (degree <= 2) form chains = spirallable sub-regions; Type II nodes (degree > 2) are branching contours. Reroute bottom-up: convert each chain to a Fermat spiral, splice its adjacent start/exit into the parent contour at the closest points.
- Rerouting produces staircase artifacts; the paper removes them with Gauss-Newton curve optimization. We skip this (DR-2).

## 3. Discrete construction adapted to our rings

We already have rings[k] = raw pixel-space loops of the level set {dist >= rTool + 0.5 + k*step} (deduped, step >= 1px). The adaptation avoids gradient tracing entirely; alignment uses nearest points on dense (unsimplified) pixel loops, and the final open path is RDP-simplified once at the end, which preserves endpoints.

### 3.1 Loop tree and chains

Parent of a loop at level k+1 is the level-k loop containing it (even-odd point-in-polygon with any vertex; containment is unique because level sets are nested). A **chain** is a maximal lineage in which each loop has exactly one child; a loop with >= 2 children terminates its chain and each child starts a new chain attached to it. This is the paper's Type I / Type II distinction expressed on the containment tree instead of the adjacency MST — equivalent for nested level sets, and cheaper (DR-1).

### 3.2 Fermat path for one chain (arc/gap/corridor construction)

For a chain of nested loops L0 (outermost) .. L(n-1), all with the tracer's native winding:

1. **Corridor**: anchor a_0 = point on L0 nearest to a start hint (parent attachment point, or previous machine position for the root). For i > 0, a_i = point on L_i nearest to a_{i-1} — the anchors form an approximately radial corridor.
2. Each loop contributes one **arc**: the loop traversed from gapEnd_i (the point one gap-length past a_i along the loop) the long way around back to a_i. The uncovered piece between a_i and gapEnd_i is the loop's **gap** (length ~ 2*step, measured by walked arc length — vertices are dense pixel steps, so this is well-defined).
3. **Inward pass** rides the even loops: arc of L0, then a straight jump from a_0 to gapEnd_2, which crosses L1 inside its gap; arc of L2; jump to gapEnd_4; and so on.
4. **Center turn**: from the deepest even loop's arc end, a short link to the deepest odd loop's gapEnd.
5. **Outward pass** rides the odd loops in descending order, jumping outward by two each time, crossing the even gaps.
6. The path starts at gapEnd_0 and exits at a_1 — both on the two outermost lanes, within about one stepover of each other.

Every loop is traversed exactly once minus its gap; every gap is crossed exactly once by the opposite-parity pass; jumps are ~2*step long and stay strictly inside the pocket (a lane-i to lane-i+2 segment remains inside {dist >= level_i}, which is inside the tool-center-legal region). Degenerate chains: n=1 emits the loop itself; n=2 emits arc(L0) -> turn -> arc(L1).

### 3.3 Connecting chains (region tree splicing)

Each child chain's Fermat path has adjacent start/exit, and its corridor was chosen nearest to its parent loop. Bottom-up, the child path is **spliced** into the parent's polyline: find the parent's nearest vertex to the child's start, insert parent[0..k] -> child(entire) -> parent[k..end]. Both splice jumps are about one stepover long. The result is one open polyline per root loop; disjoint pockets produce separate polylines, which the three-tier Z emitter (MILL-03) links or hops between as usual.

## 4. Integration

- `src/lib/fermat.ts`: `makeFermatPocketPaths(dist, model, toolRadiusPx, stepoverPx, depth, startHint?) -> Toolpath[]` (kind raster, closed: false).
- Ring collection refactored out of `makeContourPocketPaths` into a shared `collectRings` helper so both strategies use identical level sets (1px floor + area dedupe from MILL-02).
- `Settings.pocketStrategy` gains "fermat"; UI select and batch script follow. Flat clearing keeps contour rings for now (fewer, fatter lanes benefit less).
- All geometry stays in pixel space until one `simplifyRdp` + `pixelToMachine` conversion at the end.

## 5. Validation plan

- Unit tests: disk -> exactly one open path with endpoints near each other on the boundary and total length comparable to the contour strategy; dumbbell -> one path spanning both lobes via splices; every path point inside the tool-center region.
- Visual: viewer screenshots per test pattern at each build stage, saved to the ticket's images/ and referenced in the writeup doc.
- Emitter-level: dumbbell/star engrave ops should show plunge counts equal to the number of disjoint pockets.

## 6. Decision records

**DR-1: containment tree instead of connecting-segment MST.** For nested level sets the containment tree *is* the adjacency structure; the MST matters when contours have multiple plausible parents, which cannot happen here. Consequence: corridor placement by nearest-point alignment rather than shortest connecting segment — near-equivalent in practice.

**DR-2: no curve-optimization pass.** The paper's fairing removes staircases and evens spacing. Our lanes come from pixel level sets and are RDP-simplified; residual jaggies are no worse than the existing contour strategy's, and a V-bit at 0.12mm depth is insensitive to them. Revisit only if machined walls show it.

**DR-3: gap length = 2*stepover.** Wide enough for the crossing jump; small enough that the gap sliver is covered by the crossing pass's tool width (lane spacing <= 45% of cut width by default). If uncut flecks appear at corridors in test cuts, widen to 2.5*step first.
