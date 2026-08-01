/**
 * The full image → multi-tool G-code pipeline, DOM-free so the browser UI and
 * the Node batch generator (scripts/generate-test-gcode.ts) share it.
 */
import type { Model, Settings, Statistics, Toolpath } from "./types";
import { nextFrame } from "./utils";
import {
  chamferDistance,
  countForeground,
  cropTypedArray,
  fillHoles,
  foregroundBounds,
  makeMask,
  morphologicalClose,
  morphologicalOpen,
  otsuThreshold,
  removeSmallComponents,
  zhangSuenThin
} from "./imaging";
import {
  machineToPixel,
  makeContourPaths,
  makeDetailPaths,
  makeRasterPaths,
  pixelToMachine,
  sortPathsNearest
} from "./toolpath";
import { makeFermatPocketPaths } from "./fermat";
import { simplifyClosedLoop, traceBoundaryLoops } from "./geometry";
import { makeContourPocketPaths } from "./pocketing";
import { generateProgram, makePassLadder, type Operation, type ToolSpec } from "./operations";
import { generateSvg } from "./gcode-gen";
import { parseGcode } from "../gcode/parser";

export interface PipelineInput {
  width: number;
  height: number;
  /** Luminance, 0 = black. */
  gray: Uint8Array;
  /** Optional source pixels for previews; synthesized from gray if absent. */
  rgba?: Uint8ClampedArray;
}

export interface PipelineResult {
  model: Model;
  operations: Operation[];
  gcode: string;
  svg: string;
  threshold: number;
  stepPx: number;
  broadCount: number;
  residualCount: number;
  stats: Statistics;
}

export async function runPipeline(
  input: PipelineInput,
  settings: Settings,
  jobName: string,
  onStatus: (message: string) => void = () => {}
): Promise<PipelineResult> {
  let { width, height, gray } = input;
  let rgba = input.rgba;
  if (!rgba) {
    rgba = new Uint8ClampedArray(width * height * 4);
    for (let i = 0, p = 0; i < gray.length; i++, p += 4) {
      rgba[p] = rgba[p + 1] = rgba[p + 2] = gray[i];
      rgba[p + 3] = 255;
    }
  }

  onStatus("Selecting threshold and cleaning the binary mask…");
  await nextFrame();
  const threshold = settings.thresholdMode === "otsu" ? otsuThreshold(gray) : settings.manualThreshold;
  let mask = makeMask(gray, threshold, settings.invert);
  mask = morphologicalOpen(mask, width, height, settings.openRadius);
  mask = morphologicalClose(mask, width, height, settings.closeRadius);
  mask = removeSmallComponents(mask, width, height, settings.minArea);

  if (!countForeground(mask)) {
    throw new Error("No engraved region remains after thresholding and cleanup. Adjust threshold, inversion, or cleanup values.");
  }

  if (settings.autoCrop) {
    const rawBounds = foregroundBounds(mask, width, height)!;
    // The cutout contour lives outside the artwork; keep enough border pixels
    // for margin + tool radius or the loop would clip at the canvas edge.
    let padding = settings.cropPadding;
    if (settings.cutoutEnable) {
      const mmPerPxEstimate = settings.finishedWidth / (rawBounds.maxX - rawBounds.minX + 1);
      padding = Math.max(
        padding,
        Math.ceil((settings.cutoutMargin + settings.flatDiameter / 2 + 0.5) / mmPerPxEstimate)
      );
    }
    const bounds = {
      minX: Math.max(0, rawBounds.minX - padding),
      minY: Math.max(0, rawBounds.minY - padding),
      maxX: Math.min(width - 1, rawBounds.maxX + padding),
      maxY: Math.min(height - 1, rawBounds.maxY + padding)
    };
    const croppedMask = cropTypedArray(mask, width, height, bounds, 1, Uint8Array);
    const croppedGray = cropTypedArray(gray, width, height, bounds, 1, Uint8Array);
    const croppedRgba = cropTypedArray(rgba, width, height, bounds, 4, Uint8ClampedArray);
    width = croppedMask.width;
    height = croppedMask.height;
    mask = croppedMask.data;
    gray = croppedGray.data;
    rgba = croppedRgba.data;
  }

  const finishedHeight = settings.finishedWidth * height / width;
  const model: Model = {
    settings,
    width,
    height,
    finishedWidth: settings.finishedWidth,
    finishedHeight,
    scaleX: settings.finishedWidth / width,
    scaleY: finishedHeight / height,
    mmPerPx: settings.finishedWidth / width,
    mask,
    rgba,
    toolpaths: []
  };

  onStatus("Computing the distance field…");
  await nextFrame();
  const distanceToBackground = chamferDistance(mask, model.width, model.height, false);

  const engraverTool: ToolSpec = {
    number: 2,
    name: `${settings.vAngle}deg V-bit (tip cut ${settings.cutWidth.toFixed(2)}mm)`,
    type: "engraving",
    diameter: 3.175,
    halfAngle: settings.vAngle / 2,
    spindleRpm: settings.spindleRpm,
    feedXY: settings.feedXY,
    feedPlunge: settings.feedPlunge
  };
  const flatTool: ToolSpec = {
    number: 1,
    name: `${settings.flatDiameter}mm Flat End`,
    type: "flat",
    diameter: settings.flatDiameter,
    spindleRpm: settings.flatRpm,
    feedXY: settings.flatFeed,
    feedPlunge: settings.flatPlunge
  };

  // --- optional flat-end clearing (rest machining, DR-3) ---
  const REST_OVERLAP_MM = 0.25;
  let engraveMask = mask;
  let engraveDist = distanceToBackground;
  let flatPaths: Toolpath[] = [];
  if (settings.flatClearing) {
    onStatus("Planning flat-end clearing of wide areas…");
    await nextFrame();
    const rFlatPx = settings.flatDiameter / 2 / model.mmPerPx;
    const flatStepPx = (settings.flatDiameter * settings.stepoverFraction) / model.mmPerPx;
    flatPaths = makeContourPocketPaths(distanceToBackground, model, rFlatPx, flatStepPx, settings.targetDepth);
    if (flatPaths.length) {
      const flatCenter = new Uint8Array(mask.length);
      for (let i = 0; i < mask.length; i++) flatCenter[i] = distanceToBackground[i] >= rFlatPx + 0.5 ? 1 : 0;
      const distToFlatCenter = chamferDistance(flatCenter, model.width, model.height, true);
      const clearedReach = rFlatPx - REST_OVERLAP_MM / model.mmPerPx;
      engraveMask = new Uint8Array(mask.length);
      for (let i = 0; i < mask.length; i++) {
        engraveMask[i] = mask[i] && distToFlatCenter[i] > clearedReach ? 1 : 0;
      }
      engraveDist = chamferDistance(engraveMask, model.width, model.height, false);
    }
  }

  // --- engraving pocket + finish + details on what remains ---
  onStatus("Computing the constant-depth tool-center region…");
  await nextFrame();
  const toolRadiusPx = settings.toolRadius / model.mmPerPx;
  const centerMask = new Uint8Array(mask.length);
  for (let i = 0; i < mask.length; i++) {
    const effectiveHalfWidth = Math.max(0, engraveDist[i] - 0.5);
    centerMask[i] = engraveMask[i] && effectiveHalfWidth >= toolRadiusPx ? 1 : 0;
  }
  const broadCount = countForeground(centerMask);

  onStatus("Generating pocket passes and boundary finish paths…");
  await nextFrame();
  const stepMm = Math.max(0.001, settings.cutWidth * settings.stepoverFraction);
  const stepPx = stepMm / model.mmPerPx;
  let pocketPaths: Toolpath[];
  if (settings.pocketStrategy === "contour") {
    pocketPaths = makeContourPocketPaths(engraveDist, model, toolRadiusPx, stepPx, settings.targetDepth);
  } else if (settings.pocketStrategy === "fermat") {
    const hint = machineToPixel(settings.originX, settings.originY, model);
    pocketPaths = makeFermatPocketPaths(engraveDist, model, toolRadiusPx, stepPx, settings.targetDepth, hint);
  } else {
    pocketPaths = makeRasterPaths(centerMask, model).paths;
  }
  const contourPaths = makeContourPaths(centerMask, model);

  onStatus("Isolating narrow details outside the pocket-pass coverage…");
  await nextFrame();
  let residual: Uint8Array = new Uint8Array(mask.length);
  if (broadCount) {
    const distanceToCenter = chamferDistance(centerMask, model.width, model.height, true);
    for (let i = 0; i < mask.length; i++) residual[i] = engraveMask[i] && distanceToCenter[i] > toolRadiusPx + 0.35 ? 1 : 0;
  } else {
    residual.set(engraveMask);
  }
  residual = removeSmallComponents(residual, model.width, model.height, Math.max(2, Math.floor(settings.minArea / 3)));
  const residualCount = countForeground(residual);

  let detailPaths: Toolpath[] = [];
  if (residualCount) {
    onStatus("Thinning narrow details…");
    const skeleton = await zhangSuenThin(residual, model.width, model.height, (iteration) => {
      onStatus(`Thinning narrow details… iteration ${iteration}`);
    });
    onStatus("Tracing and simplifying variable-depth detail paths…");
    await nextFrame();
    detailPaths = makeDetailPaths(skeleton, engraveDist, model);
  }

  const orderedContours = sortPathsNearest(contourPaths, settings.originX, settings.originY);
  const orderedDetails = sortPathsNearest(detailPaths, settings.originX, settings.originY);
  const engravePaths = [...pocketPaths, ...orderedContours, ...orderedDetails];

  // --- optional cutout contour around the artwork silhouette (DR-4) ---
  const cutoutPaths: Toolpath[] = [];
  if (settings.cutoutEnable) {
    onStatus("Tracing the cutout contour…");
    await nextFrame();
    const distToArtwork = chamferDistance(mask, model.width, model.height, true);
    const marginPx = (settings.cutoutMargin + settings.flatDiameter / 2) / model.mmPerPx;
    let cutMask: Uint8Array = new Uint8Array(mask.length);
    for (let i = 0; i < mask.length; i++) cutMask[i] = distToArtwork[i] <= marginPx ? 1 : 0;
    cutMask = fillHoles(cutMask, model.width, model.height);
    const tolerancePx = settings.simplifyTolerance / model.mmPerPx;
    for (const loop of traceBoundaryLoops(cutMask, model.width, model.height)) {
      const simplified = simplifyClosedLoop(loop, tolerancePx);
      if (simplified.length < 4) continue;
      cutoutPaths.push({
        kind: "contour",
        points: simplified.map((p) => pixelToMachine(p.x, p.y, model)),
        closed: true
      });
    }
  }

  const operations: Operation[] = [
    { name: "[T2]Engrave", tool: engraverTool, paths: engravePaths, passDepths: [-settings.targetDepth] },
    { name: "[T1]Flat Clearing", tool: flatTool, paths: flatPaths, passDepths: [-settings.targetDepth] },
    {
      name: "[T1]Cutout",
      tool: flatTool,
      paths: cutoutPaths,
      passDepths: makePassLadder(settings.stockThickness + settings.cutoutOvercut, settings.cutoutStepdown)
    }
  ];

  const toolpaths = [...flatPaths, ...engravePaths, ...cutoutPaths];
  if (!toolpaths.length) {
    throw new Error("No toolpaths were generated. Adjust the threshold, tool depth, or artwork dimensions.");
  }
  model.toolpaths = toolpaths;
  model.centerMask = centerMask;
  model.residual = residual;
  model.threshold = threshold;

  onStatus("Writing SVG and G-code…");
  await nextFrame();
  const gcode = generateProgram(operations, model, jobName);
  const svg = generateSvg(mask, model, jobName);
  const parsed = parseGcode(gcode);
  const stats: Statistics = {
    cutDistance: parsed.cutDistance,
    estimatedMinutes: parsed.estimatedMinutes,
    counts: {
      raster: pocketPaths.length + flatPaths.length,
      contour: orderedContours.length + cutoutPaths.length,
      detail: orderedDetails.length
    },
    lineCount: parsed.lineCount
  };

  return { model, operations, gcode, svg, threshold, stepPx, broadCount, residualCount, stats };
}

/** Fill in the derived V-bit fields readSettings computes in the browser. */
export function deriveSettings(
  base: Omit<Settings, "targetDepth" | "halfAngle" | "cutWidth" | "toolRadius">
): Settings {
  const targetDepth = base.capThickness + base.breakthrough;
  const halfAngle = base.vAngle * Math.PI / 360;
  const cutWidth = 2 * targetDepth * Math.tan(halfAngle);
  return {
    ...base,
    targetDepth,
    halfAngle,
    cutWidth,
    toolRadius: cutWidth / 2,
    // a hop or approach above travel clearance is meaningless (DR-3)
    approachZ: Math.min(base.approachZ, base.safeZ),
    hopZ: Math.min(base.hopZ, base.safeZ)
  };
}
