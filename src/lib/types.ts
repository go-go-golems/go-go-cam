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
  /** Rapid-descend-to height above surface before the feed plunge (full cycle). */
  approachZ: number;
  /** Retract height for short repositions (hop cycle). */
  hopZ: number;
  /** Max XY travel (mm) that still uses the hop cycle instead of full clearance. */
  hopMaxTravel: number;
  feedXY: number;
  feedPlunge: number;
  spindleRpm: number;
  emitSpindle: boolean;
  mirrorX: boolean;
  mirrorY: boolean;
  /** Pocket clearing strategy for the engraving operation. */
  pocketStrategy: "raster" | "contour" | "fermat";
  /** Clear wide areas with a flat end mill (T1) before engraving. */
  flatClearing: boolean;
  flatDiameter: number;
  flatRpm: number;
  flatFeed: number;
  flatPlunge: number;
  /** Cut a rounded frame around the artwork at the end of the job (T1). */
  cutoutEnable: boolean;
  /** Use one finished edge margin for every frame side. */
  cutoutUseUniformMargin: boolean;
  /** Finished edge clearance from artwork to every side in uniform mode (mm). */
  cutoutMargin: number;
  /** Individual finished edge clearances in machine-space directions (mm). */
  cutoutMarginTop: number;
  cutoutMarginRight: number;
  cutoutMarginBottom: number;
  cutoutMarginLeft: number;
  /** Tool-center corner radius for the frame (mm); zero makes sharp corners. */
  cutoutCornerRadius: number;
  stockThickness: number;
  cutoutStepdown: number;
  cutoutOvercut: number;
  /** Material intentionally left at each bridge midpoint (mm). */
  cutoutBridgeThickness: number;
  /** Total two-ramp span of each bridge on the deepest pass (mm). */
  cutoutBridgeSpan: number;
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
