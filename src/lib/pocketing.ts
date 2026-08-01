import type { Model, Point, Toolpath } from "./types";
import { simplifyClosedLoop, traceBoundaryLoops } from "./geometry";
import { machineToPixel, sortPathsNearest, pixelToMachine } from "./toolpath";

/**
 * Iso-contour loops of a distance field at `level` (pixels): the boundary of
 * the region that a tool center inset by `level` may still occupy.
 */
export function extractIsoContours(
  dist: Float32Array,
  width: number,
  height: number,
  level: number
): { loops: Point[][]; area: number } {
  const mask = new Uint8Array(dist.length);
  let area = 0;
  for (let i = 0; i < dist.length; i++) {
    if (dist[i] >= level) {
      mask[i] = 1;
      area++;
    }
  }
  if (!area) return { loops: [], area: 0 };
  return { loops: traceBoundaryLoops(mask, width, height), area };
}

/**
 * Contour-parallel pocket clearing: concentric inward offsets of the pocket
 * boundary spaced by the stepover, ordered innermost-first so the final ring
 * is the finish pass along the wall (design DR-2).
 */
/**
 * True when the straight tool-center move from `a` to `b` (machine coords)
 * stays inside the region the tool may occupy, so the bit can feed there at
 * pocket depth instead of retracting.
 */
function connectorInsidePocket(
  dist: Float32Array,
  model: Model,
  toolRadiusPx: number,
  a: Point,
  b: Point
): boolean {
  const pa = machineToPixel(a.x, a.y, model);
  const pb = machineToPixel(b.x, b.y, model);
  const lengthPx = Math.hypot(pb.x - pa.x, pb.y - pa.y);
  const samples = Math.max(2, Math.ceil(lengthPx * 2));
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const x = Math.min(model.width - 1, Math.max(0, Math.floor(pa.x + (pb.x - pa.x) * t)));
    const y = Math.min(model.height - 1, Math.max(0, Math.floor(pa.y + (pb.y - pa.y) * t)));
    if (dist[y * model.width + x] < toolRadiusPx + 0.5) return false;
  }
  return true;
}

/**
 * Raw (unsimplified) offset rings per level, innermost level last. Applies the
 * 1px step floor and the nested-level-set area dedupe (MILL-02). Shared by the
 * contour and fermat strategies so both fill identical lanes.
 */
export function collectRings(
  dist: Float32Array,
  width: number,
  height: number,
  toolRadiusPx: number,
  stepoverPx: number
): Point[][][] {
  // Sub-pixel steps are meaningless on the pixel grid: consecutive levels
  // quantize to the same contour and the tool re-cuts identical rings
  // (observed as "weird jumps" in the MakeraStudio simulator).
  const step = Math.max(1, stepoverPx);
  const rings: Point[][][] = [];
  let previousArea = -1;
  // The 0.5px inset mirrors the centerMask definition in the pipeline.
  for (let level = toolRadiusPx + 0.5; ; level += step) {
    const { loops, area } = extractIsoContours(dist, width, height, level);
    if (!loops.length) break;
    // Level sets are nested, so an unchanged area means an identical
    // contour — skip the duplicate ring.
    if (area !== previousArea) rings.push(loops);
    previousArea = area;
    if (rings.length > 10000) throw new Error("Contour pocketing exceeded 10,000 rings; check stepover.");
  }
  return rings;
}

export function makeContourPocketPaths(
  dist: Float32Array,
  model: Model,
  toolRadiusPx: number,
  stepoverPx: number,
  depth: number,
  options: { link?: boolean } = {}
): Toolpath[] {
  const rings = collectRings(dist, model.width, model.height, toolRadiusPx, stepoverPx);

  const tolerancePx = model.settings.simplifyTolerance / model.mmPerPx;
  const paths: Toolpath[] = [];
  // Innermost level first; nearest-neighbor ordering only *within* a level so
  // the outermost (finish) ring is always cut last (DR-2).
  let cursorX = model.settings.originX;
  let cursorY = model.settings.originY;
  for (let k = rings.length - 1; k >= 0; k--) {
    const levelPaths: Toolpath[] = [];
    for (const loop of rings[k]) {
      const simplified = simplifyClosedLoop(loop, tolerancePx);
      if (simplified.length < 4) continue;
      levelPaths.push({
        kind: "raster",
        depth,
        points: simplified.map((p) => pixelToMachine(p.x, p.y, model)),
        closed: true
      });
    }
    const ordered = sortPathsNearest(levelPaths, cursorX, cursorY);
    if (ordered.length) {
      const lastPoint = ordered[ordered.length - 1].points.at(-1);
      if (lastPoint) {
        cursorX = lastPoint.x;
        cursorY = lastPoint.y;
      }
    }
    paths.push(...ordered);
  }

  if (options.link === false) return paths;

  // Stay-down linking: feed to the next ring at depth when the connector
  // stays inside the pocket, instead of retract + rapid + plunge. Safe for a
  // constant-depth pocket — the connector crosses material that is being
  // cleared to this exact depth anyway.
  const linked: Toolpath[] = [];
  for (const path of paths) {
    const previous = linked[linked.length - 1];
    if (previous) {
      const from = previous.points[previous.points.length - 1];
      const to = path.points[0];
      if (connectorInsidePocket(dist, model, toolRadiusPx, from, to)) {
        previous.points.push(...path.points);
        previous.closed = false;
        continue;
      }
    }
    linked.push({ ...path, points: path.points.slice() });
  }
  return linked;
}
