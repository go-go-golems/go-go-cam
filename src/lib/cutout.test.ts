import { describe, expect, it } from "vitest";
import { planFrameCutout } from "./cutout";
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
    cutoutUseUniformMargin: true,
    cutoutMargin: 2,
    cutoutMarginTop: 2,
    cutoutMarginRight: 2,
    cutoutMarginBottom: 2,
    cutoutMarginLeft: 2,
    cutoutCornerRadius: 3,
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
    mask: rectangleMask(width, height, 10, 20, 40, 40),
    rgba: new Uint8ClampedArray(width * height * 4),
    toolpaths: []
  };
}

function bridgeCenters(path: { points: Array<{ depth?: number }> }): number[] {
  return path.points.map((point, index) => point.depth === 0.5 ? index : -1).filter((index) => index >= 0);
}

function distance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

describe("planFrameCutout", () => {
  it("uses one exact margin on all sides and rounds corners by default", () => {
    const plan = planFrameCutout(testModel(), [-0.5, -1, -1.5]);

    // 30 × 20mm artwork + 2 * (2mm finished margin + 1mm tool radius).
    expect(plan.frameWidth).toBeCloseTo(36);
    expect(plan.frameHeight).toBeCloseTo(26);
    expect(plan.frameBounds).toEqual({ minX: 7, minY: 37, maxX: 43, maxY: 63 });
    expect(plan.cornerRadius).toBe(3);
    expect(plan.pathsByPass).toHaveLength(3);
    expect(plan.pathsByPass[0]).toHaveLength(1);
    expect(plan.pathsByPass[0][0].kind).toBe("contour");
    expect(plan.pathsByPass[0][0].closed).toBe(true);
    expect(plan.pathsByPass[0][0].depth).toBe(0.5);
    expect(plan.pathsByPass[0][0].points.length).toBeGreaterThan(5);
    expect(plan.pathsByPass[0][0].points.every((point) => point.depth === undefined)).toBe(true);
  });

  it("uses four midpoint bridges whose span scales across deeper passes", () => {
    const plan = planFrameCutout(testModel(), [-0.5, -1, -1.5]);
    const middle = plan.pathsByPass[1][0];
    const final = plan.pathsByPass[2][0];
    const middleCenters = bridgeCenters(middle);
    const finalCenters = bridgeCenters(final);

    expect(middleCenters).toHaveLength(4);
    expect(finalCenters).toHaveLength(4);
    expect(distance(middle.points[middleCenters[0] - 1], middle.points[middleCenters[0] + 1])).toBeCloseTo(6.2);
    expect(distance(final.points[finalCenters[0] - 1], final.points[finalCenters[0] + 1])).toBeCloseTo(12.4);
    expect(final.points.filter((point) => point.depth === 0.5)).toHaveLength(4);
    expect(final.points[0].depth).toBe(1.5);
    expect(final.points[final.points.length - 1].depth).toBe(1.5);
  });

  it("applies individual machine-space margins when uniform mode is disabled", () => {
    const plan = planFrameCutout(testModel({
      cutoutUseUniformMargin: false,
      cutoutMarginTop: 4,
      cutoutMarginRight: 2,
      cutoutMarginBottom: 3,
      cutoutMarginLeft: 1,
      cutoutBridgeSpan: 8
    }), [-0.5, -1.5]);

    // Artwork bounds are X 10..40 and Y 40..60. Flat-tool radius is 1mm.
    expect(plan.frameBounds).toEqual({ minX: 8, minY: 36, maxX: 43, maxY: 65 });
    expect(plan.frameWidth).toBe(35);
    expect(plan.frameHeight).toBe(29);
  });

  it("derives the same margins under mirrored machine transforms", () => {
    const plan = planFrameCutout(testModel({ originX: 5, originY: -10, mirrorX: true, mirrorY: true }), [-0.5, -1.5]);
    const artwork = plan.artworkBounds;

    expect(artwork).toEqual({ minX: 10, minY: 20, maxX: 39, maxY: 39 });
    expect(plan.frameWidth).toBeCloseTo(36);
    expect(plan.frameHeight).toBeCloseTo(26);
    expect(plan.frameBounds).toEqual({ minX: 62, minY: 7, maxX: 98, maxY: 33 });
  });

  it("rejects unsafe bridge or corner geometry instead of silently shrinking it", () => {
    expect(() => planFrameCutout(testModel({ cutoutBridgeSpan: 32 }), [-0.5, -1.5]))
      .toThrow("Bridge span is too wide");
    expect(() => planFrameCutout(testModel({ cutoutCornerRadius: 14 }), [-0.5, -1.5]))
      .toThrow("corner radius is too large");
    expect(() => planFrameCutout(testModel(), [-0.5]))
      .toThrow("Final cutout depth must be deeper");
  });
});
