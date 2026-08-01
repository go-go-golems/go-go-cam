import { describe, expect, it } from "vitest";
import { chamferDistance } from "./imaging";
import { makeFermatPocketPaths } from "./fermat";
import { makeContourPocketPaths } from "./pocketing";
import { polylineLength } from "./utils";
import type { Model, Settings } from "./types";

function diskMask(size: number, radius: number): Uint8Array {
  const mask = new Uint8Array(size * size);
  const c = (size - 1) / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (Math.hypot(x - c, y - c) <= radius) mask[y * size + x] = 1;
    }
  }
  return mask;
}

function annulusMask(size: number, outer: number, inner: number): Uint8Array {
  const mask = new Uint8Array(size * size);
  const c = (size - 1) / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const r = Math.hypot(x - c, y - c);
      if (r <= outer && r >= inner) mask[y * size + x] = 1;
    }
  }
  return mask;
}

function dumbbellMask(width: number, height: number): Uint8Array {
  const mask = new Uint8Array(width * height);
  const set = (x0: number, y0: number, x1: number, y1: number) => {
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) mask[y * width + x] = 1;
  };
  set(4, 10, 24, 30);
  set(40, 10, 60, 30);
  set(24, 18, 40, 22);
  return mask;
}

function testModel(width: number, height: number): Model {
  const settings = {
    simplifyTolerance: 0,
    originX: 0,
    originY: 0,
    mirrorX: false,
    mirrorY: false
  } as Settings;
  return {
    settings,
    width,
    height,
    finishedWidth: width,
    finishedHeight: height,
    scaleX: 1,
    scaleY: 1,
    mmPerPx: 1,
    mask: new Uint8Array(width * height),
    rgba: new Uint8ClampedArray(width * height * 4),
    toolpaths: []
  };
}

describe("makeFermatPocketPaths", () => {
  it("fills a disk with exactly one open path, entry and exit adjacent on the boundary", () => {
    const size = 64;
    const model = testModel(size, size);
    const dist = chamferDistance(diskMask(size, 25), size, size, false);
    const paths = makeFermatPocketPaths(dist, model, 2, 3, 0.12);
    expect(paths.length).toBe(1);
    const p = paths[0];
    expect(p.closed).toBe(false);
    const first = p.points[0];
    const last = p.points[p.points.length - 1];
    // both endpoints near the outer lanes (radius ~22.5 from center 31.5)
    const c = (size - 1) / 2;
    // machine Y is flipped relative to pixels; radius is invariant
    const rFirst = Math.hypot(first.x - c, first.y - (size - c));
    const rLast = Math.hypot(last.x - c, last.y - (size - c));
    expect(rFirst).toBeGreaterThan(15);
    expect(rLast).toBeGreaterThan(15);
    // entry and exit within a few stepovers of each other
    expect(Math.hypot(first.x - last.x, first.y - last.y)).toBeLessThan(12);
  });

  it("covers the same lanes as the contour strategy (comparable total length)", () => {
    const size = 64;
    const model = testModel(size, size);
    const dist = chamferDistance(diskMask(size, 25), size, size, false);
    const fermat = makeFermatPocketPaths(dist, model, 2, 3, 0.12);
    const contour = makeContourPocketPaths(dist, model, 2, 3, 0.12, { link: false });
    const fermatLen = fermat.reduce((n, p) => n + polylineLength(p.points), 0);
    const contourLen = contour.reduce((n, p) => n + polylineLength(p.points), 0);
    // fermat skips one gap per lane and adds crossing jumps; lengths stay close
    expect(fermatLen).toBeGreaterThan(contourLen * 0.85);
    expect(fermatLen).toBeLessThan(contourLen * 1.15);
  });

  it("merges the two boundary chains of an annulus into one path", () => {
    const size = 80;
    const model = testModel(size, size);
    const dist = chamferDistance(annulusMask(size, 34, 18), size, size, false);
    const paths = makeFermatPocketPaths(dist, model, 2, 3, 0.12);
    expect(paths.length).toBe(1);
  });

  it("spans a branching region (dumbbell) with a single spliced path", () => {
    const w = 64, h = 40;
    const model = testModel(w, h);
    const dist = chamferDistance(dumbbellMask(w, h), w, h, false);
    const paths = makeFermatPocketPaths(dist, model, 1, 2, 0.12);
    expect(paths.length).toBe(1);
    // the path must reach into both lobes
    const xs = paths[0].points.map((p) => p.x);
    expect(Math.min(...xs)).toBeLessThan(20);
    expect(Math.max(...xs)).toBeGreaterThan(44);
  });

  it("keeps every path point inside the tool-center-legal region", () => {
    const size = 64;
    const model = testModel(size, size);
    const toolRadiusPx = 2;
    const dist = chamferDistance(diskMask(size, 25), size, size, false);
    const paths = makeFermatPocketPaths(dist, model, toolRadiusPx, 3, 0.12);
    for (const path of paths) {
      for (const pt of path.points) {
        // convert machine back to pixel (identity scale, Y flip)
        const px = Math.min(size - 1, Math.max(0, Math.round(pt.x)));
        const py = Math.min(size - 1, Math.max(0, Math.round(size - pt.y)));
        // ring vertices live on the vertex grid between pixels; rounding can
        // land one pixel outside the level set, so allow that much slack
        expect(dist[py * size + px]).toBeGreaterThanOrEqual(toolRadiusPx - 1.5);
      }
    }
  });
});
