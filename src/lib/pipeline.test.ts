import { describe, expect, it } from "vitest";
import { deriveSettings, runPipeline } from "./pipeline";
import { parseGcode } from "../gcode/parser";

function rectangularArtwork(width: number, height: number): Uint8Array {
  const gray = new Uint8Array(width * height).fill(255);
  for (let y = 6; y < 14; y++) for (let x = 10; x < 30; x++) gray[y * width + x] = 0;
  return gray;
}

describe("runPipeline square frame cutout", () => {
  it("schedules one final square-frame operation with bridged pass routes", async () => {
    const settings = deriveSettings({
      finishedWidth: 100,
      maxDimension: 1000,
      thresholdMode: "manual",
      manualThreshold: 128,
      openRadius: 0,
      closeRadius: 0,
      minArea: 0,
      simplifyTolerance: 0,
      autoCrop: false,
      cropPadding: 0,
      invert: false,
      vAngle: 30,
      capThickness: 0.1,
      breakthrough: 0.02,
      stepoverFraction: 0.45,
      rasterDirection: "horizontal",
      originX: 0,
      originY: 0,
      surfaceZ: 0,
      safeZ: 3,
      approachZ: 2,
      hopZ: 2,
      hopMaxTravel: 5,
      feedXY: 1000,
      feedPlunge: 500,
      spindleRpm: 12000,
      emitSpindle: true,
      mirrorX: false,
      mirrorY: false,
      pocketStrategy: "contour",
      flatClearing: false,
      flatDiameter: 3.175,
      flatRpm: 10000,
      flatFeed: 800,
      flatPlunge: 200,
      cutoutEnable: true,
      cutoutUseUniformMargin: true,
      cutoutMargin: 2,
      cutoutMarginTop: 2,
      cutoutMarginRight: 2,
      cutoutMarginBottom: 2,
      cutoutMarginLeft: 2,
      cutoutCornerRadius: 3,
      stockThickness: 1.3,
      cutoutStepdown: 0.5,
      cutoutOvercut: 0.2,
      cutoutBridgeThickness: 0.8,
      cutoutBridgeSpan: 12.4
    });
    const result = await runPipeline({ width: 40, height: 20, gray: rectangularArtwork(40, 20) }, settings, "frame test");
    const cutout = result.operations.at(-1)!;
    const parsed = parseGcode(result.gcode);

    expect(result.operations.map((operation) => operation.name)).toEqual([
      "[T2]Engrave", "[T1]Flat Clearing", "[T1]Frame Cutout"
    ]);
    expect(cutout.passDepths).toEqual([-0.5, -1, -1.5]);
    expect(cutout.pathsByPass).toHaveLength(3);
    expect(cutout.pathsByPass?.flat()).toHaveLength(3);
    expect(cutout.pathsByPass?.[0][0].points.length).toBeGreaterThan(5);
    expect(cutout.pathsByPass?.[2][0].points.filter((point) => point.depth === 0.5)).toHaveLength(4);
    const frameToolpath = parsed.toolpaths.at(-1)!;
    const frameSegments = parsed.segments.filter((segment) => segment.toolpath === frameToolpath.index);
    expect(frameToolpath.name).toBe("[T1]Frame Cutout");
    expect(frameSegments.some((segment) =>
      !segment.rapid && segment.z1 !== segment.z2 &&
      (segment.x1 !== segment.x2 || segment.y1 !== segment.y2) && segment.z2 === -0.5
    )).toBe(true);
    expect(frameSegments.some((segment) => segment.z2 === -1.5)).toBe(true);
  });
});
