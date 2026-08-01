import { foregroundBounds } from "./imaging";
import { pixelToMachine } from "./toolpath";
import type { Bounds, DepthPoint, Model, Toolpath } from "./types";

export interface SquareFrameCutoutPlan {
  /** Tight artwork bounds in source-pixel coordinates. */
  artworkBounds: Bounds;
  /** Tool-center bounds in machine coordinates. */
  frameBounds: Bounds;
  sideLength: number;
  /** Positive distance below surface at each bridge midpoint. */
  retainedCutDepth: number;
  /** One closed frame route for every entry in the cut-through depth ladder. */
  pathsByPass: Toolpath[][];
}

const EPSILON = 1e-9;

function machineBoundsForArtwork(model: Model, artworkBounds: Bounds): Bounds {
  // Bounds name occupied pixel cells, so include their far edges. This keeps
  // the finished margin outside the complete foreground raster, not its last
  // pixel centre. Convert every corner because mirroring can invert either
  // machine axis.
  const corners = [
    pixelToMachine(artworkBounds.minX, artworkBounds.minY, model),
    pixelToMachine(artworkBounds.maxX + 1, artworkBounds.minY, model),
    pixelToMachine(artworkBounds.maxX + 1, artworkBounds.maxY + 1, model),
    pixelToMachine(artworkBounds.minX, artworkBounds.maxY + 1, model)
  ];
  return {
    minX: Math.min(...corners.map((point) => point.x)),
    minY: Math.min(...corners.map((point) => point.y)),
    maxX: Math.max(...corners.map((point) => point.x)),
    maxY: Math.max(...corners.map((point) => point.y))
  };
}

function makeConstantFrame(frame: Bounds, depth: number): Toolpath {
  const points = [
    { x: frame.minX, y: frame.minY },
    { x: frame.maxX, y: frame.minY },
    { x: frame.maxX, y: frame.maxY },
    { x: frame.minX, y: frame.maxY },
    { x: frame.minX, y: frame.minY }
  ];
  return { kind: "contour", points, depth, closed: true };
}

function addBridgedSide(
  points: DepthPoint[],
  start: DepthPoint,
  end: DepthPoint,
  nominalDepth: number,
  retainedCutDepth: number,
  bridgeSpan: number,
  sideLength: number
): void {
  const halfFraction = bridgeSpan / (2 * sideLength);
  const pointAt = (fraction: number, depth: number): DepthPoint => ({
    x: start.x + (end.x - start.x) * fraction,
    y: start.y + (end.y - start.y) * fraction,
    depth
  });
  points.push(
    pointAt(0.5 - halfFraction, nominalDepth),
    pointAt(0.5, retainedCutDepth),
    pointAt(0.5 + halfFraction, nominalDepth),
    { ...end, depth: nominalDepth }
  );
}

function makeBridgedFrame(
  frame: Bounds,
  nominalDepth: number,
  retainedCutDepth: number,
  bridgeSpan: number,
  sideLength: number
): Toolpath {
  const corners: DepthPoint[] = [
    { x: frame.minX, y: frame.minY, depth: nominalDepth },
    { x: frame.maxX, y: frame.minY, depth: nominalDepth },
    { x: frame.maxX, y: frame.maxY, depth: nominalDepth },
    { x: frame.minX, y: frame.maxY, depth: nominalDepth },
    { x: frame.minX, y: frame.minY, depth: nominalDepth }
  ];
  const points: DepthPoint[] = [{ ...corners[0] }];
  for (let side = 0; side < 4; side++) {
    addBridgedSide(points, corners[side], corners[side + 1], nominalDepth, retainedCutDepth, bridgeSpan, sideLength);
  }
  return { kind: "contour", points, closed: true };
}

/**
 * Plan a single square, tool-center cutout around the cleaned artwork. The
 * bridge routes deliberately mirror the MakeraBadge pattern: every pass at
 * or above retained depth is complete, while deeper passes rise and descend
 * at the midpoint of every side with a span proportional to extra depth.
 */
export function planSquareFrameCutout(model: Model, passDepths: number[]): SquareFrameCutoutPlan {
  if (!passDepths.length) throw new Error("Square frame cutout requires at least one depth pass.");
  if (passDepths.some((depth) => !Number.isFinite(depth) || depth >= 0)) {
    throw new Error("Square frame cutout depth passes must be finite negative Z values.");
  }

  const artworkBounds = foregroundBounds(model.mask, model.width, model.height);
  if (!artworkBounds) throw new Error("Square frame cutout requires non-empty artwork.");

  const artworkMachineBounds = machineBoundsForArtwork(model, artworkBounds);
  const artworkWidth = artworkMachineBounds.maxX - artworkMachineBounds.minX;
  const artworkHeight = artworkMachineBounds.maxY - artworkMachineBounds.minY;
  const centerX = (artworkMachineBounds.minX + artworkMachineBounds.maxX) / 2;
  const centerY = (artworkMachineBounds.minY + artworkMachineBounds.maxY) / 2;
  const clearance = model.settings.cutoutMargin + model.settings.flatDiameter / 2;
  const sideLength = Math.max(artworkWidth, artworkHeight) + 2 * clearance;
  if (!(sideLength > 0) || !Number.isFinite(sideLength)) {
    throw new Error("Square frame cutout has an invalid side length.");
  }
  const halfSide = sideLength / 2;
  const frameBounds = {
    minX: centerX - halfSide,
    minY: centerY - halfSide,
    maxX: centerX + halfSide,
    maxY: centerY + halfSide
  };

  const retainedCutDepth = model.settings.stockThickness - model.settings.cutoutBridgeThickness;
  const finalDepth = -passDepths[passDepths.length - 1];
  if (!(retainedCutDepth > 0 && retainedCutDepth < model.settings.stockThickness)) {
    throw new Error("Bridge thickness must leave a positive cut depth and positive remaining stock.");
  }
  if (!(finalDepth > retainedCutDepth + EPSILON)) {
    throw new Error("Final cutout depth must be deeper than the bridge retained cut depth.");
  }
  if (!(model.settings.cutoutBridgeSpan > 0 && Number.isFinite(model.settings.cutoutBridgeSpan))) {
    throw new Error("Bridge span must be a positive finite length.");
  }
  const cornerClearance = model.settings.flatDiameter;
  if (model.settings.cutoutBridgeSpan >= sideLength - 2 * cornerClearance) {
    throw new Error("Bridge span is too wide for the square frame after corner clearance.");
  }

  const pathsByPass = passDepths.map((passZ) => {
    const nominalDepth = -passZ;
    if (nominalDepth <= retainedCutDepth + EPSILON) return [makeConstantFrame(frameBounds, nominalDepth)];
    const bridgeSpan = model.settings.cutoutBridgeSpan *
      (nominalDepth - retainedCutDepth) / (finalDepth - retainedCutDepth);
    return [makeBridgedFrame(frameBounds, nominalDepth, retainedCutDepth, bridgeSpan, sideLength)];
  });

  return { artworkBounds, frameBounds, sideLength, retainedCutDepth, pathsByPass };
}
