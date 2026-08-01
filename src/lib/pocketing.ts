import type { Model, Point, Toolpath } from "./types";
import { simplifyClosedLoop, traceBoundaryLoops } from "./geometry";
import { sortPathsNearest, pixelToMachine } from "./toolpath";

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
export function makeContourPocketPaths(
  dist: Float32Array,
  model: Model,
  toolRadiusPx: number,
  stepoverPx: number,
  depth: number
): Toolpath[] {
  const step = Math.max(0.5, stepoverPx);
  const rings: Point[][][] = [];
  // The 0.5px inset mirrors the centerMask definition in processAndGenerate.
  for (let level = toolRadiusPx + 0.5; ; level += step) {
    const { loops } = extractIsoContours(dist, model.width, model.height, level);
    if (!loops.length) break;
    rings.push(loops);
    if (rings.length > 10000) throw new Error("Contour pocketing exceeded 10,000 rings; check stepover.");
  }

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
  return paths;
}
