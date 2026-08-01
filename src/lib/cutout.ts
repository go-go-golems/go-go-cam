import { foregroundBounds } from "./imaging";
import { pixelToMachine } from "./toolpath";
import type { Bounds, DepthPoint, Model, Point, Toolpath } from "./types";

export interface FrameCutoutPlan {
  /** Tight artwork bounds in source-pixel coordinates. */
  artworkBounds: Bounds;
  /** Tool-center bounds in machine coordinates. */
  frameBounds: Bounds;
  frameWidth: number;
  frameHeight: number;
  /** Tool-center corner radius in mm. */
  cornerRadius: number;
  /** Positive distance below surface at each bridge midpoint. */
  retainedCutDepth: number;
  /** One closed frame route for every entry in the cut-through depth ladder. */
  pathsByPass: Toolpath[][];
}

const EPSILON = 1e-9;
const CORNER_SEGMENTS = 6;

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

function point(x: number, y: number, depth: number, pointwiseDepth: boolean): DepthPoint {
  return pointwiseDepth ? { x, y, depth } : { x, y };
}

function appendQuarterArc(
  points: DepthPoint[],
  center: Point,
  radius: number,
  startAngle: number,
  endAngle: number,
  end: Point,
  depth: number,
  pointwiseDepth: boolean
): void {
  if (radius <= EPSILON) return;
  for (let step = 1; step <= CORNER_SEGMENTS; step++) {
    if (step === CORNER_SEGMENTS) {
      points.push(point(end.x, end.y, depth, pointwiseDepth));
      continue;
    }
    const angle = startAngle + (endAngle - startAngle) * step / CORNER_SEGMENTS;
    points.push(point(center.x + radius * Math.cos(angle), center.y + radius * Math.sin(angle), depth, pointwiseDepth));
  }
}

function addBridgedSide(
  points: DepthPoint[],
  start: Point,
  end: Point,
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

function appendFramePath(
  frame: Bounds,
  cornerRadius: number,
  nominalDepth: number,
  bridge: { retainedCutDepth: number; span: number } | null
): Toolpath {
  const bottomLeft: Point = { x: frame.minX + cornerRadius, y: frame.minY };
  const bottomRight: Point = { x: frame.maxX - cornerRadius, y: frame.minY };
  const rightBottom: Point = { x: frame.maxX, y: frame.minY + cornerRadius };
  const rightTop: Point = { x: frame.maxX, y: frame.maxY - cornerRadius };
  const topRight: Point = { x: frame.maxX - cornerRadius, y: frame.maxY };
  const topLeft: Point = { x: frame.minX + cornerRadius, y: frame.maxY };
  const leftTop: Point = { x: frame.minX, y: frame.maxY - cornerRadius };
  const leftBottom: Point = { x: frame.minX, y: frame.minY + cornerRadius };
  const horizontalLength = frame.maxX - frame.minX - 2 * cornerRadius;
  const verticalLength = frame.maxY - frame.minY - 2 * cornerRadius;
  const pointwiseDepth = bridge !== null;
  const points: DepthPoint[] = [point(bottomLeft.x, bottomLeft.y, nominalDepth, pointwiseDepth)];
  const appendSide = (start: Point, end: Point, length: number) => {
    if (bridge) addBridgedSide(points, start, end, nominalDepth, bridge.retainedCutDepth, bridge.span, length);
    else points.push(point(end.x, end.y, nominalDepth, false));
  };

  appendSide(bottomLeft, bottomRight, horizontalLength);
  appendQuarterArc(points, { x: frame.maxX - cornerRadius, y: frame.minY + cornerRadius }, cornerRadius, -Math.PI / 2, 0, rightBottom, nominalDepth, pointwiseDepth);
  appendSide(rightBottom, rightTop, verticalLength);
  appendQuarterArc(points, { x: frame.maxX - cornerRadius, y: frame.maxY - cornerRadius }, cornerRadius, 0, Math.PI / 2, topRight, nominalDepth, pointwiseDepth);
  appendSide(topRight, topLeft, horizontalLength);
  appendQuarterArc(points, { x: frame.minX + cornerRadius, y: frame.maxY - cornerRadius }, cornerRadius, Math.PI / 2, Math.PI, leftTop, nominalDepth, pointwiseDepth);
  appendSide(leftTop, leftBottom, verticalLength);
  appendQuarterArc(points, { x: frame.minX + cornerRadius, y: frame.minY + cornerRadius }, cornerRadius, Math.PI, Math.PI * 1.5, bottomLeft, nominalDepth, pointwiseDepth);

  return pointwiseDepth
    ? { kind: "contour", points, closed: true }
    : { kind: "contour", points, depth: nominalDepth, closed: true };
}

function frameMargins(model: Model): { top: number; right: number; bottom: number; left: number } {
  const radius = model.settings.flatDiameter / 2;
  if (model.settings.cutoutUseUniformMargin) {
    const margin = model.settings.cutoutMargin + radius;
    return { top: margin, right: margin, bottom: margin, left: margin };
  }
  return {
    top: model.settings.cutoutMarginTop + radius,
    right: model.settings.cutoutMarginRight + radius,
    bottom: model.settings.cutoutMarginBottom + radius,
    left: model.settings.cutoutMarginLeft + radius
  };
}

/**
 * Plan a rounded tool-center frame around cleaned artwork. Uniform margin mode
 * produces equal finished clearance on each side; individual mode applies the
 * four machine-space margins independently. Deeper passes use Makera-style
 * ramped holding bridges at the midpoint of every straight side.
 */
export function planFrameCutout(model: Model, passDepths: number[]): FrameCutoutPlan {
  if (!passDepths.length) throw new Error("Frame cutout requires at least one depth pass.");
  if (passDepths.some((depth) => !Number.isFinite(depth) || depth >= 0)) {
    throw new Error("Frame cutout depth passes must be finite negative Z values.");
  }

  const artworkBounds = foregroundBounds(model.mask, model.width, model.height);
  if (!artworkBounds) throw new Error("Frame cutout requires non-empty artwork.");

  const artworkMachineBounds = machineBoundsForArtwork(model, artworkBounds);
  const margins = frameMargins(model);
  const frameBounds = {
    minX: artworkMachineBounds.minX - margins.left,
    minY: artworkMachineBounds.minY - margins.bottom,
    maxX: artworkMachineBounds.maxX + margins.right,
    maxY: artworkMachineBounds.maxY + margins.top
  };
  const frameWidth = frameBounds.maxX - frameBounds.minX;
  const frameHeight = frameBounds.maxY - frameBounds.minY;
  const cornerRadius = model.settings.cutoutCornerRadius;
  if (!(frameWidth > 0 && frameHeight > 0 && Number.isFinite(frameWidth) && Number.isFinite(frameHeight))) {
    throw new Error("Frame cutout has invalid dimensions.");
  }
  if (!(cornerRadius >= 0 && Number.isFinite(cornerRadius))) throw new Error("Frame corner radius must be a finite non-negative length.");
  if (cornerRadius > Math.min(frameWidth, frameHeight) / 2 - EPSILON) {
    throw new Error("Frame corner radius is too large for the selected margins.");
  }

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
  const shortestStraightSide = Math.min(frameWidth, frameHeight) - 2 * cornerRadius;
  const cornerClearance = model.settings.flatDiameter;
  if (model.settings.cutoutBridgeSpan >= shortestStraightSide - 2 * cornerClearance) {
    throw new Error("Bridge span is too wide for the frame after corner clearance.");
  }

  const pathsByPass = passDepths.map((passZ) => {
    const nominalDepth = -passZ;
    if (nominalDepth <= retainedCutDepth + EPSILON) {
      return [appendFramePath(frameBounds, cornerRadius, nominalDepth, null)];
    }
    const span = model.settings.cutoutBridgeSpan *
      (nominalDepth - retainedCutDepth) / (finalDepth - retainedCutDepth);
    return [appendFramePath(frameBounds, cornerRadius, nominalDepth, { retainedCutDepth, span })];
  });

  return { artworkBounds, frameBounds, frameWidth, frameHeight, cornerRadius, retainedCutDepth, pathsByPass };
}
