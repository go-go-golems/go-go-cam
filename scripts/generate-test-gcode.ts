/**
 * Batch-generate test-pattern G-code for the Makera Z1 without a browser:
 *   pnpm gen:testgcode
 * Settings: 20mm artwork, 30deg V-bit, contour-parallel pocketing, flat-end
 * clearing, no cutout, Makera-example engraving parameters (S12000, F1000/500).
 */
import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PNG } from "pngjs";
import { deriveSettings, runPipeline, type PipelineInput } from "../src/lib/pipeline";
import { TEST_PATTERNS, renderPatternGray } from "../src/lib/patterns";
import { formatDuration } from "../src/lib/utils";

/** Decode a PNG to the pipeline's luminance raster (alpha over white). */
function loadPngRaster(path: string): PipelineInput {
  const png = PNG.sync.read(readFileSync(path));
  const gray = new Uint8Array(png.width * png.height);
  for (let i = 0, p = 0; p < gray.length; i += 4, p++) {
    const a = png.data[i + 3] / 255;
    const r = 255 - a * (255 - png.data[i]);
    const g = 255 - a * (255 - png.data[i + 1]);
    const b = 255 - a * (255 - png.data[i + 2]);
    gray[p] = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
  }
  return { width: png.width, height: png.height, gray };
}

// Optional CLI arg selects the pocket strategy: pnpm gen:testgcode [contour|fermat|raster]
const strategyArg = (process.argv[2] ?? "contour") as "raster" | "contour" | "fermat";
if (!["raster", "contour", "fermat"].includes(strategyArg)) {
  throw new Error(`Unknown strategy: ${strategyArg}`);
}

const settings = deriveSettings({
  finishedWidth: 20,
  maxDimension: 1000,
  thresholdMode: "otsu",
  manualThreshold: 128,
  openRadius: 1,
  closeRadius: 1,
  minArea: 12,
  simplifyTolerance: 0.05,
  autoCrop: true,
  cropPadding: 8,
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
  pocketStrategy: strategyArg,
  flatClearing: true,
  flatDiameter: 3.175,
  flatRpm: 10000,
  flatFeed: 800,
  flatPlunge: 200,
  cutoutEnable: false,
  cutoutMargin: 2,
  stockThickness: 1.3,
  cutoutStepdown: 0.5,
  cutoutOvercut: 0.2,
  cutoutBridgeThickness: 0.8,
  cutoutBridgeSpan: 12.4
});

const outDir = strategyArg === "contour" ? "gcode-tests" : `gcode-tests-${strategyArg}`;
mkdirSync(outDir, { recursive: true });

const commit = execSync("git rev-parse --short HEAD").toString().trim();
const generatedAt = new Date().toISOString();

interface BatchRow {
  pattern: string;
  label: string;
  file: string;
  lines: number;
  operations: string[];
  cutMeters: number;
  estimated: string;
}
const rows: BatchRow[] = [];

async function generateOne(
  id: string,
  label: string,
  raster: PipelineInput,
  jobSettings: typeof settings,
  fileName: string
): Promise<void> {
  const result = await runPipeline(raster, jobSettings, `${label} (${jobSettings.finishedWidth}mm)`);
  const file = join(outDir, fileName);
  writeFileSync(file, result.gcode);
  const activeOps = result.operations.filter((op) => op.paths.length > 0);
  const opNames = activeOps.map((op) => op.name);
  writeFileSync(`${file.replace(/\.nc$/, "")}.settings.json`, JSON.stringify({
    pattern: id,
    patternLabel: label,
    file: fileName,
    generatedAt,
    generatorCommit: commit,
    settings: jobSettings,
    operations: activeOps.map((op) => ({
      name: op.name,
      tool: op.tool,
      paths: op.paths.length,
      passDepths: op.passDepths
    })),
    stats: {
      lineCount: result.stats.lineCount,
      cutDistanceMm: Math.round(result.stats.cutDistance),
      estimatedMinutes: Number(result.stats.estimatedMinutes.toFixed(2))
    }
  }, null, 2) + "\n");
  rows.push({
    pattern: id,
    label,
    file: fileName,
    lines: result.stats.lineCount,
    operations: opNames,
    cutMeters: Number((result.stats.cutDistance / 1000).toFixed(2)),
    estimated: formatDuration(result.stats.estimatedMinutes)
  });
  console.log(
    `${id.padEnd(18)} ${file.padEnd(40)}` +
    `${String(result.stats.lineCount).padStart(5)}  ${opNames.join(" + ").padEnd(28)}` +
    `${(result.stats.cutDistance / 1000).toFixed(2).padStart(5)}m  ${formatDuration(result.stats.estimatedMinutes)}`
  );
}

console.log("pattern            file                                    lines  toolpaths  cut      est");
for (const pattern of TEST_PATTERNS) {
  await generateOne(pattern.id, pattern.label, renderPatternGray(pattern.id, 600), settings, `pattern-${pattern.id}-20mm.nc`);
}
await generateOne(
  "cat-sample",
  "Cat sample",
  loadPngRaster("src/assets/cat-sample.png"),
  { ...settings, finishedWidth: 30 },
  "cat-sample-30mm.nc"
);

const readme = `# Engraver test-pattern batch

Generated ${generatedAt} from abs-bicolor-v-engraver commit ${commit}
(\`pnpm gen:testgcode\`, scripts/generate-test-gcode.ts).

## Setup

- Machine: Makera Z1, stock: Bicolor ABS gold-on-black, 1.3mm (origin top-front-left, Z0 at stock top)
- Artwork width: ${settings.finishedWidth}mm, engraving depth: ${settings.targetDepth}mm (cap ${settings.capThickness} + breakthrough ${settings.breakthrough})
- T2: 30deg V-bit (S${settings.spindleRpm}, F${settings.feedXY}/F${settings.feedPlunge}), T1: ${settings.flatDiameter}mm flat end (S${settings.flatRpm}, F${settings.flatFeed}/F${settings.flatPlunge})
- Strategy: ${settings.pocketStrategy}-parallel pocketing, flat-end clearing ${settings.flatClearing ? "ON" : "OFF"}, cutout ${settings.cutoutEnable ? "ON" : "OFF"}
- Z scheme: clearance ${settings.safeZ} / approach ${settings.approachZ} / hop ${settings.hopZ} (hop for travels <= ${settings.hopMaxTravel}mm), Makera-style feed-engage and toolchange prologue
- Each .nc has a matching .settings.json sidecar with the full generator settings and stats.

## Files

| pattern | label | operations | cut | est. time |
|---|---|---|---|---|
${rows.map((r) => `| ${r.file} | ${r.label} | ${r.operations.join(" + ")} | ${r.cutMeters}m | ${r.estimated} |`).join("\n")}

Estimates are pure motion time (cut at programmed feed, rapids at 3000mm/min);
the machine adds acceleration and toolchange overhead.
`;
writeFileSync(join(outDir, "README.md"), readme);
console.log(`\nWrote ${rows.length} sidecars + README.md (commit ${commit})`);
