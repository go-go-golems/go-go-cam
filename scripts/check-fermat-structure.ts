// Structural check: radius profile of the Fermat path on a disk must descend
// (even lanes), turn once at the center, and ascend (odd lanes).
import { chamferDistance } from "../src/lib/imaging";
import { makeFermatPocketPaths } from "../src/lib/fermat";
import type { Model, Settings } from "../src/lib/types";

const size = 200;
const mask = new Uint8Array(size * size);
const c = (size - 1) / 2;
for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
  if (Math.hypot(x - c, y - c) <= 80) mask[y * size + x] = 1;
}
const model = {
  settings: { simplifyTolerance: 0, originX: 0, originY: 0, mirrorX: false, mirrorY: false } as Settings,
  width: size, height: size, finishedWidth: size, finishedHeight: size,
  scaleX: 1, scaleY: 1, mmPerPx: 1,
  mask, rgba: new Uint8ClampedArray(0), toolpaths: []
} as Model;
const dist = chamferDistance(mask, size, size, false);
const paths = makeFermatPocketPaths(dist, model, 2, 4, 0.12);
console.log("paths:", paths.length);
const pts = paths[0].points;
const r = pts.map((p) => Math.hypot(p.x - c, p.y - (size - c)));
// sample radius at 40 checkpoints
const samples = Array.from({ length: 41 }, (_, i) => r[Math.floor((i / 40) * (r.length - 1))]);
console.log("radius profile:", samples.map((v) => v.toFixed(0)).join(" "));
const minIdx = r.indexOf(Math.min(...r));
console.log(`min radius ${Math.min(...r).toFixed(1)} at ${(100 * minIdx / r.length).toFixed(0)}% of path; start r=${r[0].toFixed(1)} end r=${r[r.length - 1].toFixed(1)}`);
console.log(`start-end distance: ${Math.hypot(pts[0].x - pts.at(-1)!.x, pts[0].y - pts.at(-1)!.y).toFixed(1)}px`);
// lane radii during descent: median radius of each third
