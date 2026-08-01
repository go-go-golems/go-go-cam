import "./style.css";
import catSampleUrl from "./assets/cat-sample.png";
import type { Model, Settings, Statistics, Toolpath } from "./lib/types";
import { clamp, downloadText, formatDuration, nextFrame, sanitizeBaseName } from "./lib/utils";
import { countForeground, rasterizeImage } from "./lib/imaging";
import { runPipeline } from "./lib/pipeline";
import { clearCanvas, drawMask, drawRgba, drawSourceImage, drawToolpaths } from "./lib/render";
import { setupGcodeViewer } from "./gcode/viewer";
import { TEST_PATTERNS, renderTestPattern } from "./lib/patterns";
import { settingsStorageKeyForImage } from "./lib/settings-storage";
import {
  formatSettingsTransfer,
  parseSettingsTransfer,
  type SettingsTransfer,
  type SettingsTransferValues
} from "./lib/settings-transfer";

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id}`);
  return el as T;
};

interface AppState {
  image: HTMLImageElement | null;
  imageName: string;
  /** Content-derived localStorage key for the current source image. */
  imageSettingsKey: string | null;
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
  imageSettingsKey: null,
  processed: null,
  toolpaths: [],
  gcode: "",
  svg: "",
  settings: null,
  warnings: []
};

const SETTINGS_CONTROL_IDS = [
  "finishedWidth", "autoCrop", "cropPadding", "invertMask",
  "maxDimension", "thresholdMode", "manualThreshold", "openRadius", "closeRadius", "minArea", "simplifyTolerance",
  "vAngle", "capThickness", "breakthrough", "stepover", "rasterDirection",
  "pocketStrategy", "flatClearing", "flatDiameter", "flatRpm", "flatFeed", "flatPlunge",
  "cutoutEnable", "cutoutMargin", "stockThickness", "cutoutStepdown", "cutoutOvercut", "cutoutBridgeThickness", "cutoutBridgeSpan",
  "originX", "originY", "surfaceZ", "safeZ", "approachZ", "hopZ", "hopMaxTravel", "feedXY", "feedPlunge", "spindleRpm", "emitSpindle", "mirrorX", "mirrorY"
] as const;

const SETTINGS_CONTROL_ID_SET = new Set<string>(SETTINGS_CONTROL_IDS);

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

function settingControl(id: string): HTMLInputElement | HTMLSelectElement {
  const control = $(id);
  if (!(control instanceof HTMLInputElement) && !(control instanceof HTMLSelectElement)) {
    throw new Error(`Settings control #${id} is not an input or select.`);
  }
  return control;
}

function readSettingsTransferControls(): SettingsTransferValues {
  const settings: SettingsTransferValues = {};
  for (const id of SETTINGS_CONTROL_IDS) {
    const control = settingControl(id);
    if (control instanceof HTMLInputElement && control.type === "checkbox") {
      settings[id] = control.checked;
    } else if (control instanceof HTMLInputElement && control.type === "number") {
      if (!control.value.trim()) throw new Error(`Settings field ${id} is invalid.`);
      const value = Number(control.value);
      if (!Number.isFinite(value)) throw new Error(`Settings field ${id} is invalid.`);
      settings[id] = value;
    } else {
      settings[id] = control.value;
    }
  }
  return settings;
}

function validateSettingsTransfer(transfer: SettingsTransfer): void {
  const keys = Object.keys(transfer.settings);
  for (const id of SETTINGS_CONTROL_IDS) {
    if (!(id in transfer.settings)) throw new Error(`Settings payload is missing ${id}.`);
  }
  for (const id of keys) {
    if (!SETTINGS_CONTROL_ID_SET.has(id)) throw new Error(`Settings payload has an unknown field: ${id}.`);
  }
  for (const id of SETTINGS_CONTROL_IDS) {
    const control = settingControl(id);
    const value = transfer.settings[id];
    if (control instanceof HTMLInputElement && control.type === "checkbox") {
      if (typeof value !== "boolean") throw new Error(`Settings field ${id} must be true or false.`);
      continue;
    }
    if (control instanceof HTMLInputElement && control.type === "number") {
      if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`Settings field ${id} must be a finite number.`);
      const min = control.min ? Number(control.min) : -Infinity;
      const max = control.max ? Number(control.max) : Infinity;
      if (value < min || value > max) throw new Error(`Settings field ${id} is outside its allowed range.`);
      continue;
    }
    if (typeof value !== "string") throw new Error(`Settings field ${id} must be text.`);
    if (control instanceof HTMLSelectElement && !Array.from(control.options).some((option) => option.value === value)) {
      throw new Error(`Settings field ${id} has an unsupported option.`);
    }
  }
}

function applySettingsTransfer(transfer: SettingsTransfer): void {
  validateSettingsTransfer(transfer);
  for (const id of SETTINGS_CONTROL_IDS) {
    const control = settingControl(id);
    const value = transfer.settings[id];
    if (control instanceof HTMLInputElement && control.type === "checkbox") {
      control.checked = value as boolean;
    } else {
      control.value = String(value);
    }
  }
  $<HTMLInputElement>("manualThreshold").disabled = $<HTMLSelectElement>("thresholdMode").value !== "manual";
  updateDerivedHeight();
}

function saveSettingsForCurrentImage(): void {
  if (!state.imageSettingsKey) return;
  try {
    localStorage.setItem(state.imageSettingsKey, formatSettingsTransfer(readSettingsTransferControls()));
  } catch (error) {
    console.warn("Could not save image settings", error);
  }
}

function restoreSettingsForImage(storageKey: string): boolean {
  const text = localStorage.getItem(storageKey);
  if (!text) return false;
  try {
    applySettingsTransfer(parseSettingsTransfer(text));
    return true;
  } catch (error) {
    console.warn("Discarding invalid saved image settings", error);
    localStorage.removeItem(storageKey);
    return false;
  }
}

async function copySettings(): Promise<void> {
  try {
    const text = formatSettingsTransfer(readSettingsTransferControls());
    const transfer = $<HTMLTextAreaElement>("settingsTransfer");
    transfer.value = text;
    saveSettingsForCurrentImage();
    try {
      await navigator.clipboard.writeText(text);
      setStatus("Settings copied to the clipboard.", "ok");
    } catch {
      transfer.focus();
      transfer.select();
      const copied = document.execCommand("copy");
      setStatus(
        copied ? "Settings copied to the clipboard." : "Settings JSON is ready below; copy it manually.",
        copied ? "ok" : ""
      );
    }
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error), "error");
  }
}

async function pasteSettings(): Promise<void> {
  try {
    const transfer = $<HTMLTextAreaElement>("settingsTransfer");
    let text = transfer.value.trim();
    if (!text) {
      try {
        text = await navigator.clipboard.readText();
      } catch {
        throw new Error("Paste settings JSON into the text area, then choose Paste settings.");
      }
    }
    const parsed = parseSettingsTransfer(text);
    applySettingsTransfer(parsed);
    transfer.value = formatSettingsTransfer(parsed.settings);
    saveSettingsForCurrentImage();
    setStatus("Settings pasted. Process the image to apply them.", "ok");
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error), "error");
  }
}

function loadImageDataUrl(dataUrl: string, name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      state.image = img;
      state.imageName = name || "artwork.png";
      state.imageSettingsKey = settingsStorageKeyForImage(dataUrl);
      const restored = restoreSettingsForImage(state.imageSettingsKey);
      $("imageName").textContent = `${state.imageName} · ${img.naturalWidth} × ${img.naturalHeight}px`;
      updateDerivedHeight(img.naturalWidth, img.naturalHeight);
      drawSourceImage($<HTMLCanvasElement>("sourceCanvas"), img);
      clearGeneratedState();
      setStatus(restored
        ? "Image loaded. Restored settings previously saved for this image."
        : "Image loaded. Process to create the engraving mask and toolpaths.");
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
  const stockThickness = clamp(numberValue("stockThickness", 1.3), 0.05, 100);
  const cutoutBridgeThickness = clamp(
    numberValue("cutoutBridgeThickness", 0.8),
    0.01,
    Math.max(0.01, stockThickness - 0.01)
  );
  const cutoutBridgeSpan = clamp(numberValue("cutoutBridgeSpan", 12.4), 0.01, 10000);

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
    approachZ: clamp(numberValue("approachZ", 2), 0.1, clamp(numberValue("safeZ", 3), 0.01, 1000)),
    hopZ: clamp(numberValue("hopZ", 2), 0.1, clamp(numberValue("safeZ", 3), 0.01, 1000)),
    hopMaxTravel: clamp(numberValue("hopMaxTravel", 5), 0, 10000),
    feedXY: clamp(numberValue("feedXY", 600), 0.1, 1e6),
    feedPlunge: clamp(numberValue("feedPlunge", 150), 0.1, 1e6),
    spindleRpm: Math.round(clamp(numberValue("spindleRpm", 14000), 0, 1e6)),
    emitSpindle: checked("emitSpindle"),
    mirrorX: checked("mirrorX"),
    mirrorY: checked("mirrorY"),
    pocketStrategy: (["contour", "fermat"].includes($<HTMLSelectElement>("pocketStrategy").value)
      ? $<HTMLSelectElement>("pocketStrategy").value
      : "raster") as Settings["pocketStrategy"],
    flatClearing: checked("flatClearing"),
    flatDiameter: clamp(numberValue("flatDiameter", 3.175), 0.1, 25),
    flatRpm: Math.round(clamp(numberValue("flatRpm", 10000), 0, 1e6)),
    flatFeed: clamp(numberValue("flatFeed", 800), 1, 1e5),
    flatPlunge: clamp(numberValue("flatPlunge", 200), 1, 1e5),
    cutoutEnable: checked("cutoutEnable"),
    cutoutMargin: clamp(numberValue("cutoutMargin", 2), 0, 100),
    stockThickness,
    cutoutStepdown: clamp(numberValue("cutoutStepdown", 0.5), 0.05, 10),
    cutoutOvercut: clamp(numberValue("cutoutOvercut", 0.2), 0, 5),
    cutoutBridgeThickness,
    cutoutBridgeSpan
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
  stepPx: number,
  broadCount: number,
  residualCount: number
): void {
  const warnings = [
    "Measure the actual cap layer and cut a stepped depth test before running the artwork.",
    "Simulate the G-code, verify metric units and absolute positioning, then perform an air cut above the stock."
  ];
  if (model.settings.cutoutEnable) {
    warnings.push(
      `The final T1 operation cuts a square frame with four holding bridges (${model.settings.cutoutBridgeThickness.toFixed(2)}mm material retained). Do not remove the part until the spindle has stopped.`
    );
  }
  if (foregroundFraction < 0.002) warnings.push("Very little artwork was detected. Check threshold and inversion.");
  if (foregroundFraction > 0.80) warnings.push("Most of the image is marked for engraving. The mask may be inverted or the threshold may be unsuitable.");
  if (model.settings.targetDepth > 0.35) warnings.push("The selected depth is relatively large for a thin cap. Confirm it from a physical cross-section or test coupon.");
  if (model.mmPerPx > model.settings.cutWidth * 1.5) warnings.push("Image pixels are larger than the V-groove width. Increase processing resolution for cleaner boundaries and narrow details.");
  if (stepPx < 0.25) warnings.push("The stepover is below one quarter of a processed pixel. The output will be large; a wider bit, shallower artwork width, or larger stepover may be more efficient.");
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
    saveSettingsForCurrentImage();
    setStatus("Rasterizing and converting to luminance…");
    await nextFrame();
    const raster = rasterizeImage(state.image, settings.maxDimension);
    const result = await runPipeline(raster, settings, `${state.imageName} engraving job`, setStatus);
    const { model, gcode, svg, stats } = result;

    $<HTMLInputElement>("derivedHeight").value = model.finishedHeight.toFixed(2);
    drawRgba($<HTMLCanvasElement>("sourceCanvas"), model.rgba, model.width, model.height);
    drawMask($<HTMLCanvasElement>("maskCanvas"), model.mask, model.width, model.height);
    $("thresholdReadout").textContent = `T=${result.threshold}`;

    state.processed = model;
    state.toolpaths = model.toolpaths;
    state.gcode = gcode;
    state.svg = svg;

    drawToolpaths($<HTMLCanvasElement>("toolpathCanvas"), model.mask, model, model.toolpaths);
    updateMetrics(model, stats);
    updateWarnings(
      model,
      countForeground(model.mask) / model.mask.length,
      result.stepPx,
      result.broadCount,
      result.residualCount
    );
    $("gcodePreview").textContent = gcode.split("\n").slice(0, 180).join("\n") + (gcode.split("\n").length > 180 ? "\n…" : "");
    $<HTMLButtonElement>("downloadGcode").disabled = false;
    $<HTMLButtonElement>("downloadSvg").disabled = false;
    $<HTMLButtonElement>("downloadMask").disabled = false;
    $<HTMLButtonElement>("viewGeneratedGcode").disabled = false;
    setStatus(`Generated ${model.toolpaths.length.toLocaleString()} toolpaths. Review the preview and warnings before export.`, "ok");
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

{
  const select = $<HTMLSelectElement>("testPattern");
  for (const pattern of TEST_PATTERNS) {
    const option = document.createElement("option");
    option.value = pattern.id;
    option.textContent = pattern.label;
    select.appendChild(option);
  }
  select.addEventListener("change", () => {
    if (!select.value) return;
    loadImageDataUrl(renderTestPattern(select.value), `pattern_${select.value}.png`)
      .catch((error) => setStatus(error.message, "error"));
  });
}

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
for (const id of SETTINGS_CONTROL_IDS) {
  const control = settingControl(id);
  control.addEventListener("input", saveSettingsForCurrentImage);
  control.addEventListener("change", () => {
    if (id === "thresholdMode") {
      $<HTMLInputElement>("manualThreshold").disabled = $<HTMLSelectElement>("thresholdMode").value !== "manual";
    }
    saveSettingsForCurrentImage();
  });
}
$("copySettings").addEventListener("click", () => { void copySettings(); });
$("pasteSettings").addEventListener("click", () => { void pasteSettings(); });
$("processBtn").addEventListener("click", () => { void processAndGenerate(); });
$("downloadGcode").addEventListener("click", () => downloadText(state.gcode, "text/plain;charset=utf-8", `${sanitizeBaseName(state.imageName)}_abs_vcarve.nc`));
$("downloadSvg").addEventListener("click", () => downloadText(state.svg, "image/svg+xml;charset=utf-8", `${sanitizeBaseName(state.imageName)}_engraving.svg`));
$("downloadMask").addEventListener("click", downloadMaskPng);
$("viewGeneratedGcode").addEventListener("click", () => {
  if (state.gcode) viewer.loadGcode(state.gcode, `${sanitizeBaseName(state.imageName)}_abs_vcarve.nc (generated)`);
});

loadSample().catch((error) => setStatus(error.message, "error"));
