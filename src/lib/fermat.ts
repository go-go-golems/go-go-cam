/**
 * Connected Fermat spiral pocketing (Zhao et al., SIGGRAPH 2016), adapted to
 * the distance-field ring infrastructure: one continuous open path per pocket
 * region, entering and exiting on adjacent outer lanes, so each region needs
 * exactly one plunge and one retract. See the MILL-04 design doc for the
 * arc/gap/corridor construction and its decision records.
 */
import type { Model, Point, Toolpath } from "./types";
import { simplifyRdp } from "./geometry";
import { pixelToMachine } from "./toolpath";
import { collectRings } from "./pocketing";

// ---------- dense-loop utilities (pixel-space, unsimplified rings) ----------

/** Drop the duplicated closing vertex the boundary tracer emits. */
function normalizeLoop(loop: Point[]): Point[] {
  const n = loop.length;
  if (n > 1 && loop[0].x === loop[n - 1].x && loop[0].y === loop[n - 1].y) {
    return loop.slice(0, -1);
  }
  return loop;
}

/** Force counter-clockwise winding so gaps of adjacent lanes extend the same way. */
function forceCcw(loop: Point[]): Point[] {
  let area2 = 0;
  for (let i = 0; i < loop.length; i++) {
    const a = loop[i];
    const b = loop[(i + 1) % loop.length];
    area2 += a.x * b.y - b.x * a.y;
  }
  return area2 < 0 ? loop.slice().reverse() : loop;
}

function nearestVertexIndex(loop: Point[], p: Point): number {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < loop.length; i++) {
    const d = (loop[i].x - p.x) ** 2 + (loop[i].y - p.y) ** 2;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

/** Vertex index reached by walking `dist` forward from `from` (wrapping). */
function walkForward(loop: Point[], from: number, dist: number): number {
  let i = from;
  let traveled = 0;
  while (traveled < dist) {
    const next = (i + 1) % loop.length;
    traveled += Math.hypot(loop[next].x - loop[i].x, loop[next].y - loop[i].y);
    i = next;
    if (i === from) break; // tiny loop shorter than dist
  }
  return i;
}

/** Vertices from `from` to `to` inclusive, walking forward with wrap. */
function arcForward(loop: Point[], from: number, to: number): Point[] {
  const out: Point[] = [];
  let i = from;
  out.push(loop[i]);
  while (i !== to) {
    i = (i + 1) % loop.length;
    out.push(loop[i]);
  }
  return out;
}

/** Approximate minimum distance between two loops, on subsampled vertices. */
function loopDistance(a: Point[], b: Point[]): number {
  const stride = (loop: Point[]) => Math.max(1, Math.floor(loop.length / 200));
  const sa = stride(a);
  const sb = stride(b);
  let best = Infinity;
  for (let i = 0; i < a.length; i += sa) {
    for (let j = 0; j < b.length; j += sb) {
      const d = (a[i].x - b[j].x) ** 2 + (a[i].y - b[j].y) ** 2;
      if (d < best) best = d;
    }
  }
  return Math.sqrt(best);
}

// ---------- Step A: loop forest and chain decomposition ----------

interface LoopNode {
  loop: Point[];
  level: number;
  children: LoopNode[];
}

/**
 * Organize per-level loops into a forest by attaching each level-k+1 loop to
 * the nearest level-k loop. Level sets are nested, so every deeper loop lies
 * within one stepover of exactly one predecessor; nearest-loop parenting also
 * handles annular regions correctly, where containment parenting would not
 * (design DR-1).
 */
function buildLoopForest(rings: Point[][][]): LoopNode[] {
  const levels: LoopNode[][] = rings.map((loops, level) =>
    loops.map((loop) => ({ loop: forceCcw(normalizeLoop(loop)), level, children: [] }))
  );
  for (let level = 1; level < levels.length; level++) {
    for (const node of levels[level]) {
      let parent: LoopNode | null = null;
      let bestD = Infinity;
      for (const candidate of levels[level - 1]) {
        const d = loopDistance(node.loop, candidate.loop);
        if (d < bestD) {
          bestD = d;
          parent = candidate;
        }
      }
      parent?.children.push(node);
    }
  }
  return levels[0] ?? [];
}

/** A spirallable chain: nested single-child loops; children branch off the last loop. */
interface Chain {
  loops: Point[][];
  children: Chain[];
}

function decomposeChain(node: LoopNode): Chain {
  const loops: Point[][] = [node.loop];
  let current = node;
  while (current.children.length === 1) {
    current = current.children[0];
    loops.push(current.loop);
  }
  return { loops, children: current.children.map(decomposeChain) };
}

// ---------- Steps B+C: Fermat path for one chain ----------

/**
 * The arc/gap/corridor construction (design §3.2): anchors on successive
 * loops form a radial corridor; each loop contributes its circumference minus
 * a gap at the corridor; the inward pass rides even loops crossing odd gaps
 * two lanes at a time, the outward pass rides odd loops back out. Start and
 * exit land adjacent on the two outermost lanes.
 */
function fermatChainPath(loops: Point[][], stepPx: number, startHint: Point): Point[] {
  const n = loops.length;
  const gapLen = 2 * Math.max(1, stepPx);
  const anchors: number[] = [];
  const gapEnds: number[] = [];
  for (let i = 0; i < n; i++) {
    const hint = i === 0 ? startHint : loops[i - 1][anchors[i - 1]];
    const a = nearestVertexIndex(loops[i], hint);
    anchors.push(a);
    gapEnds.push(walkForward(loops[i], a, gapLen));
  }

  if (n === 1) {
    // Degenerate chain: the loop itself, opened at the anchor.
    const loop = loops[0];
    return arcForward(loop, gapEnds[0], anchors[0]);
  }

  const path: Point[] = [];
  for (let i = 0; i < n; i += 2) {
    path.push(...arcForward(loops[i], gapEnds[i], anchors[i]));
  }
  const lastOdd = n % 2 === 0 ? n - 1 : n - 2;
  for (let i = lastOdd; i >= 1; i -= 2) {
    path.push(...arcForward(loops[i], gapEnds[i], anchors[i]));
  }
  return path;
}

// ---------- Step D: splice child chains into their parent's path ----------

function splice(parent: Point[], child: Point[]): Point[] {
  if (!child.length) return parent;
  const at = nearestVertexIndex(parent, child[0]);
  return [...parent.slice(0, at + 1), ...child, ...parent.slice(at + 1)];
}

function buildChainPath(chain: Chain, stepPx: number, startHint: Point): Point[] {
  let path = fermatChainPath(chain.loops, stepPx, startHint);
  for (const child of chain.children) {
    // The child's corridor points toward its attachment: hint with the
    // deepest loop of the parent chain.
    const attachHint = chain.loops[chain.loops.length - 1][0];
    const childPath = buildChainPath(child, stepPx, attachHint);
    path = splice(path, childPath);
  }
  return path;
}

// ---------- entry point ----------

export function makeFermatPocketPaths(
  dist: Float32Array,
  model: Model,
  toolRadiusPx: number,
  stepoverPx: number,
  depth: number,
  startHint: Point = { x: 0, y: 0 }
): Toolpath[] {
  const rings = collectRings(dist, model.width, model.height, toolRadiusPx, stepoverPx);
  if (!rings.length) return [];
  const step = Math.max(1, stepoverPx);
  const roots = buildLoopForest(rings);

  let paths: Point[][] = roots.map((root) => buildChainPath(decomposeChain(root), step, startHint));

  // Same-region roots (e.g. the two boundaries of an annular pocket) end
  // within a few lanes of each other; merge them into one continuous path.
  const mergeThreshold = 4 * step;
  let merged = true;
  while (merged && paths.length > 1) {
    merged = false;
    outer: for (let i = 0; i < paths.length; i++) {
      for (let j = 0; j < paths.length; j++) {
        if (i === j) continue;
        const at = nearestVertexIndex(paths[i], paths[j][0]);
        const d = Math.hypot(paths[i][at].x - paths[j][0].x, paths[i][at].y - paths[j][0].y);
        if (d <= mergeThreshold) {
          paths[i] = splice(paths[i], paths[j]);
          paths.splice(j, 1);
          merged = true;
          break outer;
        }
      }
    }
  }

  const tolerancePx = model.settings.simplifyTolerance / model.mmPerPx;
  return paths
    .filter((p) => p.length >= 2)
    .map((p) => ({
      kind: "raster" as const,
      depth,
      closed: false,
      points: simplifyRdp(p, tolerancePx).map((q) => pixelToMachine(q.x, q.y, model))
    }));
}
