/**
 * Batch-generate test-pattern G-code for the Makera Z1 without a browser:
 *   pnpm gen:testgcode
 * Settings: 20mm artwork, 30deg V-bit, contour-parallel pocketing, flat-end
 * clearing, no cutout, Makera-example engraving parameters (S12000, F1000/500).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { deriveSettings, runPipeline } from "../src/lib/pipeline";
import { TEST_PATTERNS, renderPatternGray } from "../src/lib/patterns";
import { formatDuration } from "../src/lib/utils";

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
  feedXY: 1000,
  feedPlunge: 500,
  spindleRpm: 12000,
  emitSpindle: true,
  mirrorX: false,
  mirrorY: false,
  pocketStrategy: "contour",
  flatClearing: true,
  flatDiameter: 3.175,
  flatRpm: 10000,
  flatFeed: 800,
  flatPlunge: 200,
  cutoutEnable: false,
  cutoutMargin: 2,
  stockThickness: 1.3,
  cutoutStepdown: 0.5,
  cutoutOvercut: 0.2
});

const outDir = "gcode-tests";
mkdirSync(outDir, { recursive: true });

console.log("pattern            file                                    lines  toolpaths  cut      est");
for (const pattern of TEST_PATTERNS) {
  const raster = renderPatternGray(pattern.id, 600);
  const result = await runPipeline(raster, settings, `test pattern ${pattern.id} 20mm`);
  const file = join(outDir, `pattern-${pattern.id}-20mm.nc`);
  writeFileSync(file, result.gcode);
  const ops = result.operations.filter((op) => op.paths.length > 0).map((op) => op.name).join(" + ");
  console.log(
    `${pattern.id.padEnd(18)} ${file.padEnd(40)}` +
    `${String(result.stats.lineCount).padStart(5)}  ${ops.padEnd(28)}` +
    `${(result.stats.cutDistance / 1000).toFixed(2).padStart(5)}m  ${formatDuration(result.stats.estimatedMinutes)}`
  );
}
