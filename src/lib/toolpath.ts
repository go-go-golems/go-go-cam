import type { DepthPoint, Model, PathKind, Point, RasterPathsInfo, Statistics, Toolpath } from "./types";
import { simplifyClosedLoop, simplifyRdp, traceBoundaryLoops, traceSkeletonPolylines } from "./geometry";
import { clamp, polylineLength } from "./utils";

export function pixelToMachine(x: number, y: number, model: Model): Point {
  let nx = x / model.width;
  let ny = (model.height - y) / model.height;
  if (model.settings.mirrorX) nx = 1 - nx;
  if (model.settings.mirrorY) ny = 1 - ny;
  return {
    x: model.settings.originX + nx * model.finishedWidth,
    y: model.settings.originY + ny * model.finishedHeight
  };
}

export function machineToPixel(x: number, y: number, model: Model): Point {
  let nx = (x - model.settings.originX) / model.finishedWidth;
  let ny = (y - model.settings.originY) / model.finishedHeight;
  if (model.settings.mirrorX) nx = 1 - nx;
  if (model.settings.mirrorY) ny = 1 - ny;
  return {
    x: nx * model.width,
    y: model.height - ny * model.height
  };
}

function rasterConnectorIsInside(
  centerMask: Uint8Array,
  width: number,
  height: number,
  a: Point,
  b: Point
): boolean {
  const distance = Math.hypot(b.x - a.x, b.y - a.y);
  const samples = Math.max(2, Math.ceil(distance * 2));
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const x = clamp(Math.floor(a.x + (b.x - a.x) * t), 0, width - 1);
    const y = clamp(Math.floor(a.y + (b.y - a.y) * t), 0, height - 1);
    if (!centerMask[y * width + x]) return false;
  }
  return true;
}

interface RunEnd {
  pixel: Point;
  machine: Point;
}

interface Run {
  a: RunEnd;
  b: RunEnd;
}

interface Track {
  path: Toolpath;
  endPixel: Point;
}

export function makeRasterPaths(centerMask: Uint8Array, model: Model): RasterPathsInfo {
  const { width, height, settings } = model;
  const stepMm = Math.max(0.001, settings.cutWidth * settings.stepoverFraction);
  const stepPx = stepMm / model.mmPerPx;
  const finished: Toolpath[] = [];
  let active: Track[] = [];
  let stripe = 0;
  let segmentCount = 0;
  const maxLinkPx = Math.max(1.5, stepPx * 1.75 + 0.5);

  const finishUnmatched = (used: Uint8Array) => {
    for (let i = 0; i < active.length; i++) if (!used[i]) finished.push(active[i].path);
  };

  const connectRuns = (runs: Run[]) => {
    const used = new Uint8Array(active.length);
    const nextActive: Track[] = [];
    const orderedRuns = stripe % 2 ? runs.slice().reverse() : runs;

    for (let runIndex = 0; runIndex < orderedRuns.length; runIndex++) {
      const run = orderedRuns[runIndex];
      let bestTrack = -1;
      let bestStart: "a" | "b" = "a";
      let bestDistance = Infinity;

      for (let i = 0; i < active.length; i++) {
        if (used[i]) continue;
        const track = active[i];
        for (const side of ["a", "b"] as const) {
          const candidate = run[side];
          const distance = Math.hypot(candidate.pixel.x - track.endPixel.x, candidate.pixel.y - track.endPixel.y);
          if (distance >= bestDistance || distance > maxLinkPx) continue;
          if (!rasterConnectorIsInside(centerMask, width, height, track.endPixel, candidate.pixel)) continue;
          bestDistance = distance;
          bestTrack = i;
          bestStart = side;
        }
      }

      let track: Track;
      const start = run[bestStart];
      const end = run[bestStart === "a" ? "b" : "a"];
      if (bestTrack >= 0) {
        track = active[bestTrack];
        used[bestTrack] = 1;
        track.path.points.push(start.machine, end.machine);
        track.endPixel = end.pixel;
      } else {
        let first = start;
        let second = end;
        if ((stripe + runIndex) % 2 === 1) [first, second] = [second, first];
        track = {
          path: { kind: "raster", depth: settings.targetDepth, points: [first.machine, second.machine] },
          endPixel: second.pixel
        };
      }
      nextActive.push(track);
      segmentCount++;
      if (segmentCount > 75000) {
        throw new Error(
          "The requested stepover creates more than 75,000 pocket segments. Increase stepover, reduce artwork size, or use a wider V-bit."
        );
      }
    }

    finishUnmatched(used);
    active = nextActive;
    stripe++;
  };

  if (settings.rasterDirection === "horizontal") {
    for (let yFloat = stepPx / 2; yFloat < height; yFloat += stepPx) {
      const y = clamp(Math.floor(yFloat), 0, height - 1);
      const runs: Run[] = [];
      let x = 0;
      while (x < width) {
        while (x < width && !centerMask[y * width + x]) x++;
        if (x >= width) break;
        const start = x;
        while (x < width && centerMask[y * width + x]) x++;
        const end = x;
        const aPixel = { x: start + 0.5, y: yFloat };
        const bPixel = { x: Math.max(start + 0.5, end - 0.5), y: yFloat };
        runs.push({
          a: { pixel: aPixel, machine: pixelToMachine(aPixel.x, aPixel.y, model) },
          b: { pixel: bPixel, machine: pixelToMachine(bPixel.x, bPixel.y, model) }
        });
      }
      connectRuns(runs);
    }
  } else {
    for (let xFloat = stepPx / 2; xFloat < width; xFloat += stepPx) {
      const x = clamp(Math.floor(xFloat), 0, width - 1);
      const runs: Run[] = [];
      let y = 0;
      while (y < height) {
        while (y < height && !centerMask[y * width + x]) y++;
        if (y >= height) break;
        const start = y;
        while (y < height && centerMask[y * width + x]) y++;
        const end = y;
        const aPixel = { x: xFloat, y: start + 0.5 };
        const bPixel = { x: xFloat, y: Math.max(start + 0.5, end - 0.5) };
        runs.push({
          a: { pixel: aPixel, machine: pixelToMachine(aPixel.x, aPixel.y, model) },
          b: { pixel: bPixel, machine: pixelToMachine(bPixel.x, bPixel.y, model) }
        });
      }
      connectRuns(runs);
    }
  }

  for (const track of active) finished.push(track.path);
  return { paths: finished, stepMm, stepPx, segmentCount };
}

export function makeContourPaths(centerMask: Uint8Array, model: Model): Toolpath[] {
  const loops = traceBoundaryLoops(centerMask, model.width, model.height);
  const tolerancePx = model.settings.simplifyTolerance / model.mmPerPx;
  const paths: Toolpath[] = [];
  for (const loop of loops) {
    const simplified = simplifyClosedLoop(loop, tolerancePx);
    if (simplified.length < 4) continue;
    const points = simplified.map((p) => pixelToMachine(p.x, p.y, model));
    paths.push({ kind: "contour", depth: model.settings.targetDepth, points, closed: true });
  }
  return paths;
}

export function makeDetailPaths(skeleton: Uint8Array, originalDistance: Float32Array, model: Model): Toolpath[] {
  const pixelPaths = traceSkeletonPolylines(skeleton, model.width, model.height);
  const tolerancePx = model.settings.simplifyTolerance / model.mmPerPx;
  const paths: Toolpath[] = [];
  for (const indices of pixelPaths) {
    let pointsPx = indices.map((index) => ({
      x: index % model.width + 0.5,
      y: Math.floor(index / model.width) + 0.5,
      index
    }));
    pointsPx = simplifyRdp(pointsPx, tolerancePx);
    const points: DepthPoint[] = pointsPx.map((p) => {
      const machine = pixelToMachine(p.x, p.y, model);
      const halfWidthMm = Math.max(0.5, originalDistance[p.index] - 0.5) * model.mmPerPx;
      const depth = clamp(halfWidthMm / Math.tan(model.settings.halfAngle), 0.005, model.settings.targetDepth);
      return { ...machine, depth };
    });
    const length = polylineLength(points);
    if (points.length === 1 || length >= Math.max(0.05, model.mmPerPx * 0.75)) {
      paths.push({ kind: "detail", points });
    }
  }
  return paths;
}

function reversePath(path: Toolpath): Toolpath {
  return { ...path, points: path.points.slice().reverse() };
}

export function sortPathsNearest(paths: Toolpath[], startX: number, startY: number): Toolpath[] {
  if (paths.length > 1800) return paths;
  const remaining = paths.slice();
  const result: Toolpath[] = [];
  let current: Point = { x: startX, y: startY };
  while (remaining.length) {
    let bestIndex = 0;
    let reverse = false;
    let bestDistance = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const path = remaining[i];
      const first = path.points[0];
      const last = path.points[path.points.length - 1];
      const dFirst = Math.hypot(first.x - current.x, first.y - current.y);
      const dLast = Math.hypot(last.x - current.x, last.y - current.y);
      if (dFirst < bestDistance) {
        bestDistance = dFirst;
        bestIndex = i;
        reverse = false;
      }
      if (!path.closed && dLast < bestDistance) {
        bestDistance = dLast;
        bestIndex = i;
        reverse = true;
      }
    }
    let selected = remaining.splice(bestIndex, 1)[0];
    if (reverse) selected = reversePath(selected);
    result.push(selected);
    current = selected.points[selected.points.length - 1];
  }
  return result;
}

export function calculateStatistics(paths: Toolpath[], model: Model, lineCount: number): Statistics {
  let cutDistance = 0;
  let rapidDistance = 0;
  let previous: Point = { x: model.settings.originX, y: model.settings.originY };
  const counts: Record<PathKind, number> = { raster: 0, contour: 0, detail: 0 };
  for (const path of paths) {
    counts[path.kind]++;
    cutDistance += polylineLength(path.points);
    const first = path.points[0];
    rapidDistance += Math.hypot(first.x - previous.x, first.y - previous.y);
    previous = path.points[path.points.length - 1];
  }
  const cutMinutes = cutDistance / model.settings.feedXY;
  const plungeMinutes = paths.length * model.settings.safeZ / model.settings.feedPlunge;
  const retractMinutes = paths.length * model.settings.safeZ / 3000;
  const rapidMinutes = rapidDistance / 3000;
  return {
    cutDistance,
    estimatedMinutes: cutMinutes + plungeMinutes + retractMinutes + rapidMinutes,
    counts,
    lineCount
  };
}
