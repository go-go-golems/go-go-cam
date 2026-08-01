import "./style.css";
import catSampleUrl from "./assets/cat-sample.png";
import type { Model, RasterPathsInfo, Settings, Statistics, Toolpath } from "./lib/types";
import { clamp, downloadText, formatDuration, nextFrame, sanitizeBaseName } from "./lib/utils";
import {
  chamferDistance,
  countForeground,
  cropTypedArray,
  foregroundBounds,
  makeMask,
  morphologicalClose,
  morphologicalOpen,
  otsuThreshold,
  rasterizeImage,
  removeSmallComponents,
  zhangSuenThin
} from "./lib/imaging";
import {
  calculateStatistics,
  makeContourPaths,
  makeDetailPaths,
  makeRasterPaths,
  sortPathsNearest
} from "./lib/toolpath";
import { generateGcode, generateSvg } from "./lib/gcode-gen";
import { clearCanvas, drawMask, drawRgba, drawSourceImage, drawToolpaths } from "./lib/render";
import { setupGcodeViewer } from "./gcode/viewer";

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id}`);
  return el as T;
};

interface AppState {
  image: HTMLImageElement | null;
  imageName: string;
  processed: Model | null;
  toolpaths: Toolpath[];
  gcode: string;
  svg: string;
  settings: Settings | null;
  warnings: string[];
}

const state: AppState = {
  image: null,
  imageName: "cat_sample.png",
  processed: null,
  toolpaths: [],
  gcode: "",
  svg: "",
  settings: null,
  warnings: []
};

function numberValue(id: string, fallback: number): number {
  const value = Number($<HTMLInputElement>(id).value);
  return Number.isFinite(value) ? value : fallback;
}

function checked(id: string): boolean {
  return $<HTMLInputElement>(id).checked;
}

function setStatus(message: string, kind = ""): void {
  const el = $("status");
  el.textContent = message;
  el.className = `status ${kind}`.trim();
}

function setBusy(busy: boolean): void {
  $<HTMLButtonElement>("processBtn").disabled = busy;
  $<HTMLButtonElement>("sampleBtn").disabled = busy;
  $<HTMLInputElement>("imageFile").disabled = busy;
  if (busy) {
    $<HTMLButtonElement>("downloadGcode").disabled = true;
    $<HTMLButtonElement>("downloadSvg").disabled = true;
    $<HTMLButtonElement>("downloadMask").disabled = true;
  }
}

function loadImageDataUrl(dataUrl: string, name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      state.image = img;
      state.imageName = name || "artwork.png";
      $("imageName").textContent = `${state.imageName} · ${img.naturalWidth} × ${img.naturalHeight}px`;
      updateDerivedHeight(img.naturalWidth, img.naturalHeight);
      drawSourceImage($<HTMLCanvasElement>("sourceCanvas"), img);
      clearGeneratedState();
      setStatus("Image loaded. Process to create the engraving mask and toolpaths.");
      resolve();
    };
    img.onerror = () => reject(new Error("The image could not be decoded."));
    img.src = dataUrl;
  });
}

function loadSample(): Promise<void> {
  return loadImageDataUrl(catSampleUrl, "cat_sample.png");
}

function updateDerivedHeight(pixelWidth?: number, pixelHeight?: number): void {
  const width = Math.max(0.001, numberValue("finishedWidth", 100));
  const w = pixelWidth || state.processed?.width || state.image?.naturalWidth;
  const h = pixelHeight || state.processed?.height || state.image?.naturalHeight;
  if (w && h) $<HTMLInputElement>("derivedHeight").value = (width * h / w).toFixed(2);
}

function clearGeneratedState(): void {
  state.processed = null;
  state.toolpaths = [];
  state.gcode = "";
  state.svg = "";
  $<HTMLButtonElement>("downloadGcode").disabled = true;
  $<HTMLButtonElement>("downloadSvg").disabled = true;
  $<HTMLButtonElement>("downloadMask").disabled = true;
  $<HTMLButtonElement>("viewGeneratedGcode").disabled = true;
  $("gcodePreview").textContent = "No toolpath generated.";
  $("thresholdReadout").textContent = "";
  for (const id of ["metricPixels", "metricSize", "metricDepth", "metricWidth", "metricPaths", "metricDistance", "metricTime", "metricLines"]) {
    $(id).textContent = "—";
  }
  $("warnings").replaceChildren();
  clearCanvas($<HTMLCanvasElement>("maskCanvas"));
  clearCanvas($<HTMLCanvasElement>("toolpathCanvas"));
}

function readSettings(): Settings {
  const finishedWidth = clamp(numberValue("finishedWidth", 100), 1, 10000);
  const vAngle = clamp(numberValue("vAngle", 45), 1, 179);
  const capThickness = clamp(numberValue("capThickness", 0.1), 0.001, 100);
  const breakthrough = clamp(numberValue("breakthrough", 0.02), 0, 100);
  const targetDepth = capThickness + breakthrough;
  const halfAngle = vAngle * Math.PI / 360;
  const cutWidth = 2 * targetDepth * Math.tan(halfAngle);

  return {
    finishedWidth,
    maxDimension: Math.round(clamp(numberValue("maxDimension", 1000), 100, 2400)),
    thresholdMode: $<HTMLSelectElement>("thresholdMode").value,
    manualThreshold: Math.round(clamp(numberValue("manualThreshold", 128), 0, 255)),
    openRadius: Math.round(clamp(numberValue("openRadius", 1), 0, 10)),
    closeRadius: Math.round(clamp(numberValue("closeRadius", 1), 0, 10)),
    minArea: Math.round(clamp(numberValue("minArea", 12), 0, 1e7)),
    simplifyTolerance: clamp(numberValue("simplifyTolerance", 0.05), 0, 100),
    autoCrop: checked("autoCrop"),
    cropPadding: Math.round(clamp(numberValue("cropPadding", 8), 0, 500)),
    invert: checked("invertMask"),
    vAngle,
    halfAngle,
    capThickness,
    breakthrough,
    targetDepth,
    cutWidth,
    toolRadius: cutWidth / 2,
    stepoverFraction: clamp(numberValue("stepover", 45) / 100, 0.05, 0.99),
    rasterDirection: $<HTMLSelectElement>("rasterDirection").value,
    originX: numberValue("originX", 0),
    originY: numberValue("originY", 0),
    surfaceZ: numberValue("surfaceZ", 0),
    safeZ: clamp(numberValue("safeZ", 3), 0.01, 1000),
    feedXY: clamp(numberValue("feedXY", 600), 0.1, 1e6),
    feedPlunge: clamp(numberValue("feedPlunge", 150), 0.1, 1e6),
    spindleRpm: Math.round(clamp(numberValue("spindleRpm", 14000), 0, 1e6)),
    emitSpindle: checked("emitSpindle"),
    mirrorX: checked("mirrorX"),
    mirrorY: checked("mirrorY")
  };
}

function updateMetrics(model: Model, stats: Statistics): void {
  $("metricPixels").textContent = `${model.width} × ${model.height}px`;
  $("metricSize").textContent = `${model.finishedWidth.toFixed(2)} × ${model.finishedHeight.toFixed(2)}mm`;
  $("metricDepth").textContent = `${model.settings.targetDepth.toFixed(3)}mm`;
  $("metricWidth").textContent = `${model.settings.cutWidth.toFixed(3)}mm`;
  $("metricPaths").textContent = `${model.toolpaths.length.toLocaleString()} (${stats.counts.raster.toLocaleString()} / ${stats.counts.contour.toLocaleString()} / ${stats.counts.detail.toLocaleString()})`;
  $("metricDistance").textContent = stats.cutDistance >= 1000 ? `${(stats.cutDistance / 1000).toFixed(2)}m` : `${stats.cutDistance.toFixed(1)}mm`;
  $("metricTime").textContent = formatDuration(stats.estimatedMinutes);
  $("metricLines").textContent = stats.lineCount.toLocaleString();
}

function updateWarnings(
  model: Model,
  foregroundFraction: number,
  rasterInfo: RasterPathsInfo,
  broadCount: number,
  residualCount: number
): void {
  const warnings = [
    "Measure the actual cap layer and cut a stepped depth test before running the artwork.",
    "Simulate the G-code, verify metric units and absolute positioning, then perform an air cut above the stock."
  ];
  if (foregroundFraction < 0.002) warnings.push("Very little artwork was detected. Check threshold and inversion.");
  if (foregroundFraction > 0.80) warnings.push("Most of the image is marked for engraving. The mask may be inverted or the threshold may be unsuitable.");
  if (model.settings.targetDepth > 0.35) warnings.push("The selected depth is relatively large for a thin cap. Confirm it from a physical cross-section or test coupon.");
  if (model.mmPerPx > model.settings.cutWidth * 1.5) warnings.push("Image pixels are larger than the V-groove width. Increase processing resolution for cleaner boundaries and narrow details.");
  if (rasterInfo.stepPx < 0.25) warnings.push("The stepover is below one quarter of a processed pixel. The output will be large; a wider bit, shallower artwork width, or larger stepover may be more efficient.");
  if (broadCount === 0) warnings.push("No constant-depth pocket centerline region remained after the tool-radius offset. The result consists primarily of variable-depth detail paths.");
  if (residualCount > model.width * model.height * 0.25) warnings.push("A large residual region required thinning. Consider a wider V-bit angle, a slightly deeper tested cap cut, or smaller artwork dimensions.");
  if (model.toolpaths.length > 1000) warnings.push("The job contains more than 1,000 retracting toolpaths. Keep clearance Z only as high as safely necessary, or clear broad regions with a small flat end mill and reserve the V-bit for edges and details.");
  const list = $("warnings");
  list.replaceChildren(...warnings.map((text) => {
    const li = document.createElement("li");
    li.textContent = text;
    return li;
  }));
  state.warnings = warnings;
}

function downloadMaskPng(): void {
  if (!state.processed) return;
  const canvas = document.createElement("canvas");
  drawMask(canvas, state.processed.mask, state.processed.width, state.processed.height);
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${sanitizeBaseName(state.imageName)}_mask.png`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }, "image/png");
}

async function processAndGenerate(): Promise<void> {
  if (!state.image) {
    setStatus("Load an image first.", "error");
    return;
  }
  setBusy(true);
  state.processed = null;
  state.toolpaths = [];
  state.gcode = "";
  state.svg = "";
  try {
    const settings = readSettings();
    state.settings = settings;
    setStatus("Rasterizing and converting to luminance…");
    await nextFrame();
    const raster = rasterizeImage(state.image, settings.maxDimension);
    let { width, height, rgba, gray } = raster;

    setStatus("Selecting threshold and cleaning the binary mask…");
    await nextFrame();
    const threshold = settings.thresholdMode === "otsu" ? otsuThreshold(gray) : settings.manualThreshold;
    let mask = makeMask(gray, threshold, settings.invert);
    mask = morphologicalOpen(mask, width, height, settings.openRadius);
    mask = morphologicalClose(mask, width, height, settings.closeRadius);
    mask = removeSmallComponents(mask, width, height, settings.minArea);

    if (!countForeground(mask)) throw new Error("No engraved region remains after thresholding and cleanup. Adjust threshold, inversion, or cleanup values.");

    if (settings.autoCrop) {
      const rawBounds = foregroundBounds(mask, width, height)!;
      const bounds = {
        minX: Math.max(0, rawBounds.minX - settings.cropPadding),
        minY: Math.max(0, rawBounds.minY - settings.cropPadding),
        maxX: Math.min(width - 1, rawBounds.maxX + settings.cropPadding),
        maxY: Math.min(height - 1, rawBounds.maxY + settings.cropPadding)
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
    $<HTMLInputElement>("derivedHeight").value = finishedHeight.toFixed(2);
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

    drawRgba($<HTMLCanvasElement>("sourceCanvas"), rgba, width, height);
    drawMask($<HTMLCanvasElement>("maskCanvas"), mask, width, height);
    $("thresholdReadout").textContent = `T=${threshold}`;

    setStatus("Computing the distance field and constant-depth tool-center region…");
    await nextFrame();
    const distanceToBackground = chamferDistance(mask, model.width, model.height, false);
    const toolRadiusPx = settings.toolRadius / model.mmPerPx;
    const centerMask = new Uint8Array(mask.length);
    for (let i = 0; i < mask.length; i++) {
      const effectiveHalfWidth = Math.max(0, distanceToBackground[i] - 0.5);
      centerMask[i] = mask[i] && effectiveHalfWidth >= toolRadiusPx ? 1 : 0;
    }
    const broadCount = countForeground(centerMask);

    setStatus("Generating scanline pocket passes and boundary finish paths…");
    await nextFrame();
    const rasterInfo = makeRasterPaths(centerMask, model);
    const contourPaths = makeContourPaths(centerMask, model);

    setStatus("Isolating narrow details outside the pocket-pass coverage…");
    await nextFrame();
    let residual: Uint8Array = new Uint8Array(mask.length);
    if (broadCount) {
      const distanceToCenter = chamferDistance(centerMask, model.width, model.height, true);
      for (let i = 0; i < mask.length; i++) residual[i] = mask[i] && distanceToCenter[i] > toolRadiusPx + 0.35 ? 1 : 0;
    } else {
      residual.set(mask);
    }
    residual = removeSmallComponents(residual, model.width, model.height, Math.max(2, Math.floor(settings.minArea / 3)));
    const residualCount = countForeground(residual);

    let detailPaths: Toolpath[] = [];
    if (residualCount) {
      setStatus("Thinning narrow details…");
      const skeleton = await zhangSuenThin(residual, model.width, model.height, (iteration) => {
        setStatus(`Thinning narrow details… iteration ${iteration}`);
      });
      setStatus("Tracing and simplifying variable-depth detail paths…");
      await nextFrame();
      detailPaths = makeDetailPaths(skeleton, distanceToBackground, model);
    }

    const orderedContours = sortPathsNearest(contourPaths, settings.originX, settings.originY);
    const orderedDetails = sortPathsNearest(detailPaths, settings.originX, settings.originY);
    const toolpaths = [...rasterInfo.paths, ...orderedContours, ...orderedDetails];
    if (!toolpaths.length) throw new Error("No toolpaths were generated. Adjust the threshold, tool depth, or artwork dimensions.");
    model.toolpaths = toolpaths;
    model.centerMask = centerMask;
    model.residual = residual;
    model.threshold = threshold;

    setStatus("Writing SVG and G-code…");
    await nextFrame();
    const gcode = generateGcode(toolpaths, model, state.imageName);
    const svg = generateSvg(mask, model, state.imageName);
    const stats = calculateStatistics(toolpaths, model, gcode.split("\n").length);

    state.processed = model;
    state.toolpaths = toolpaths;
    state.gcode = gcode;
    state.svg = svg;

    drawToolpaths($<HTMLCanvasElement>("toolpathCanvas"), mask, model, toolpaths);
    updateMetrics(model, stats);
    updateWarnings(model, countForeground(mask) / mask.length, rasterInfo, broadCount, residualCount);
    $("gcodePreview").textContent = gcode.split("\n").slice(0, 180).join("\n") + (gcode.split("\n").length > 180 ? "\n…" : "");
    $<HTMLButtonElement>("downloadGcode").disabled = false;
    $<HTMLButtonElement>("downloadSvg").disabled = false;
    $<HTMLButtonElement>("downloadMask").disabled = false;
    $<HTMLButtonElement>("viewGeneratedGcode").disabled = false;
    setStatus(`Generated ${toolpaths.length.toLocaleString()} toolpaths. Review the preview and warnings before export.`, "ok");
  } catch (error) {
    console.error(error);
    setStatus(error instanceof Error ? error.message : String(error), "error");
  } finally {
    setBusy(false);
    if (state.gcode) {
      $<HTMLButtonElement>("downloadGcode").disabled = false;
      $<HTMLButtonElement>("downloadSvg").disabled = false;
      $<HTMLButtonElement>("downloadMask").disabled = false;
      $<HTMLButtonElement>("viewGeneratedGcode").disabled = false;
    }
  }
}

const viewer = setupGcodeViewer();

$("sampleBtn").addEventListener("click", () => loadSample().catch((error) => setStatus(error.message, "error")));
$<HTMLInputElement>("imageFile").addEventListener("change", (event) => {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => loadImageDataUrl(reader.result as string, file.name).catch((error) => setStatus(error.message, "error"));
  reader.onerror = () => setStatus("The selected file could not be read.", "error");
  reader.readAsDataURL(file);
});
$("finishedWidth").addEventListener("input", () => updateDerivedHeight());
$("thresholdMode").addEventListener("change", () => {
  $<HTMLInputElement>("manualThreshold").disabled = $<HTMLSelectElement>("thresholdMode").value !== "manual";
});
$("processBtn").addEventListener("click", () => { void processAndGenerate(); });
$("downloadGcode").addEventListener("click", () => downloadText(state.gcode, "text/plain;charset=utf-8", `${sanitizeBaseName(state.imageName)}_abs_vcarve.nc`));
$("downloadSvg").addEventListener("click", () => downloadText(state.svg, "image/svg+xml;charset=utf-8", `${sanitizeBaseName(state.imageName)}_engraving.svg`));
$("downloadMask").addEventListener("click", downloadMaskPng);
$("viewGeneratedGcode").addEventListener("click", () => {
  if (state.gcode) viewer.loadGcode(state.gcode, `${sanitizeBaseName(state.imageName)}_abs_vcarve.nc (generated)`);
});

loadSample().catch((error) => setStatus(error.message, "error"));
