import { describe, expect, it } from "vitest";
import { planSquareFrameCutout } from "./cutout";
import type { Model, Settings } from "./types";

function rectangleMask(width: number, height: number, x0: number, y0: number, x1: number, y1: number): Uint8Array {
  const mask = new Uint8Array(width * height);
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) mask[y * width + x] = 1;
  return mask;
}

function testModel(overrides: Partial<Settings> = {}): Model {
  const width = 100;
  const height = 80;
  const settings = {
    originX: 0,
    originY: 0,
    mirrorX: false,
    mirrorY: false,
    cutoutMargin: 2,
    flatDiameter: 2,
    stockThickness: 1.3,
    cutoutBridgeThickness: 0.8,
    cutoutBridgeSpan: 12.4,
    ...overrides
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
    mask: rectangleMask(width, height, 10, 20, 40, 30),
    rgba: new Uint8ClampedArray(width * height * 4),
    toolpaths: []
  };
}

function bridgeCenters(path: { points: Array<{ depth?: number }> }): number[] {
  return path.points.map((point, index) => point.depth === 0.5 ? index : -1).filter((index) => index >= 0);
}

describe("planSquareFrameCutout", () => {
  it("encloses non-square artwork in one square with tool-radius-adjusted clearance", () => {
    const plan = planSquareFrameCutout(testModel(), [-0.5, -1, -1.5]);

    expect(plan.sideLength).toBeCloseTo(36); // 30mm artwork + 2 * (2mm margin + 1mm radius)
    expect(plan.frameBounds).toEqual({ minX: 7, minY: 37, maxX: 43, maxY: 73 });
    expect(plan.pathsByPass).toHaveLength(3);
    expect(plan.pathsByPass[0]).toHaveLength(1);
    expect(plan.pathsByPass[0][0].kind).toBe("contour");
    expect(plan.pathsByPass[0][0].closed).toBe(true);
    expect(plan.pathsByPass[0][0].depth).toBe(0.5);
    expect(plan.pathsByPass[0][0].points).toHaveLength(5);
    expect(plan.pathsByPass[0][0].points.every((point) => point.depth === undefined)).toBe(true);
  });

  it("uses four midpoint bridges whose span scales across deeper passes", () => {
    const plan = planSquareFrameCutout(testModel(), [-0.5, -1, -1.5]);
    const middle = plan.pathsByPass[1][0];
    const final = plan.pathsByPass[2][0];

    expect(bridgeCenters(middle)).toEqual([2, 6, 10, 14]);
    expect(bridgeCenters(final)).toEqual([2, 6, 10, 14]);
    expect(middle.points[3].x - middle.points[1].x).toBeCloseTo(6.2);
    expect(final.points[3].x - final.points[1].x).toBeCloseTo(12.4);
    expect(final.points.filter((point) => point.depth === 0.5)).toHaveLength(4);
    expect(final.points[0].depth).toBe(1.5);
    expect(final.points[final.points.length - 1].depth).toBe(1.5);
  });

  it("derives the same square dimensions under mirrored machine transforms", () => {
    const plan = planSquareFrameCutout(testModel({ originX: 5, originY: -10, mirrorX: true, mirrorY: true }), [-0.5, -1.5]);
    const artwork = plan.artworkBounds;

    expect(artwork).toEqual({ minX: 10, minY: 20, maxX: 39, maxY: 29 });
    expect(plan.sideLength).toBeCloseTo(36);
    expect(plan.frameBounds.maxX - plan.frameBounds.minX).toBeCloseTo(plan.sideLength);
    expect(plan.frameBounds.maxY - plan.frameBounds.minY).toBeCloseTo(plan.sideLength);
    // With both axes mirrored, the converted artwork lies within this same
    // square and the 3mm tool-center clearance remains on its long axis.
    expect(plan.frameBounds).toEqual({ minX: 62, minY: -3, maxX: 98, maxY: 33 });
  });

  it("rejects unsafe bridge geometry instead of silently shrinking it", () => {
    expect(() => planSquareFrameCutout(testModel({ cutoutBridgeSpan: 32 }), [-0.5, -1.5]))
      .toThrow("Bridge span is too wide");
    expect(() => planSquareFrameCutout(testModel(), [-0.5]))
      .toThrow("Final cutout depth must be deeper");
  });
});
