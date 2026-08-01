export interface Point {
  x: number;
  y: number;
}

/** Machine-space point; `depth` is set on variable-depth detail paths. */
export interface DepthPoint extends Point {
  depth?: number;
}

export type PathKind = "raster" | "contour" | "detail";

export interface Toolpath {
  kind: PathKind;
  points: DepthPoint[];
  /** Constant cut depth for raster/contour paths (mm below surface). */
  depth?: number;
  closed?: boolean;
}

export interface Settings {
  finishedWidth: number;
  maxDimension: number;
  thresholdMode: string;
  manualThreshold: number;
  openRadius: number;
  closeRadius: number;
  minArea: number;
  simplifyTolerance: number;
  autoCrop: boolean;
  cropPadding: number;
  invert: boolean;
  vAngle: number;
  halfAngle: number;
  capThickness: number;
  breakthrough: number;
  targetDepth: number;
  cutWidth: number;
  toolRadius: number;
  stepoverFraction: number;
  rasterDirection: string;
  originX: number;
  originY: number;
  surfaceZ: number;
  safeZ: number;
  feedXY: number;
  feedPlunge: number;
  spindleRpm: number;
  emitSpindle: boolean;
  mirrorX: boolean;
  mirrorY: boolean;
}

export interface Model {
  settings: Settings;
  width: number;
  height: number;
  finishedWidth: number;
  finishedHeight: number;
  scaleX: number;
  scaleY: number;
  mmPerPx: number;
  mask: Uint8Array;
  rgba: Uint8ClampedArray;
  toolpaths: Toolpath[];
  centerMask?: Uint8Array;
  residual?: Uint8Array;
  threshold?: number;
}

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface RasterImage {
  width: number;
  height: number;
  rgba: Uint8ClampedArray;
  gray: Uint8Array;
}

export interface RasterPathsInfo {
  paths: Toolpath[];
  stepMm: number;
  stepPx: number;
  segmentCount: number;
}

export interface Statistics {
  cutDistance: number;
  estimatedMinutes: number;
  counts: Record<PathKind, number>;
  lineCount: number;
}
