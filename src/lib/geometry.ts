import type { Point } from "./types";
import { clamp } from "./utils";

export function pointSegmentDistanceSquared(point: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (dx === 0 && dy === 0) return (point.x - a.x) ** 2 + (point.y - a.y) ** 2;
  const t = clamp(((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy), 0, 1);
  const px = a.x + t * dx;
  const py = a.y + t * dy;
  return (point.x - px) ** 2 + (point.y - py) ** 2;
}

export function simplifyRdp<T extends Point>(points: T[], tolerance: number): T[] {
  if (points.length <= 2 || tolerance <= 0) return points.slice();
  const sqTolerance = tolerance * tolerance;
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack: Array<[number, number]> = [[0, points.length - 1]];
  while (stack.length) {
    const [first, last] = stack.pop()!;
    let maxDistance = 0;
    let index = -1;
    for (let i = first + 1; i < last; i++) {
      const distance = pointSegmentDistanceSquared(points[i], points[first], points[last]);
      if (distance > maxDistance) {
        maxDistance = distance;
        index = i;
      }
    }
    if (index >= 0 && maxDistance > sqTolerance) {
      keep[index] = 1;
      stack.push([first, index], [index, last]);
    }
  }
  const simplified: T[] = [];
  for (let i = 0; i < points.length; i++) if (keep[i]) simplified.push(points[i]);
  return simplified;
}

function farthestPointIndex(points: Point[], sourceIndex: number): number {
  let best = sourceIndex;
  let bestDistance = -1;
  const source = points[sourceIndex];
  for (let i = 0; i < points.length; i++) {
    const d = (points[i].x - source.x) ** 2 + (points[i].y - source.y) ** 2;
    if (d > bestDistance) {
      bestDistance = d;
      best = i;
    }
  }
  return best;
}

function wrappedChain(points: Point[], start: number, end: number): Point[] {
  const chain = [points[start]];
  let i = start;
  while (i !== end) {
    i = (i + 1) % points.length;
    chain.push(points[i]);
  }
  return chain;
}

export function simplifyClosedLoop(loop: Point[], tolerance: number): Point[] {
  let points = loop;
  if (points.length > 1 && points[0].x === points[points.length - 1].x && points[0].y === points[points.length - 1].y) {
    points = points.slice(0, -1);
  }
  if (points.length < 4 || tolerance <= 0) {
    const out = points.slice();
    if (out.length) out.push(out[0]);
    return out;
  }
  let a = farthestPointIndex(points, 0);
  const b = farthestPointIndex(points, a);
  a = farthestPointIndex(points, b);
  const first = simplifyRdp(wrappedChain(points, a, b), tolerance);
  const second = simplifyRdp(wrappedChain(points, b, a), tolerance);
  const combined = first.slice(0, -1).concat(second.slice(0, -1));
  if (combined.length) combined.push(combined[0]);
  return combined;
}

export function traceBoundaryLoops(mask: Uint8Array, width: number, height: number): Point[][] {
  const vertexWidth = width + 1;
  const starts: number[] = [];
  const ends: number[] = [];
  const dirs: number[] = [];
  const outgoing = new Map<number, number[]>();

  const addEdge = (sx: number, sy: number, ex: number, ey: number, dir: number) => {
    const s = sy * vertexWidth + sx;
    const e = ey * vertexWidth + ex;
    const index = starts.length;
    starts.push(s);
    ends.push(e);
    dirs.push(dir);
    if (!outgoing.has(s)) outgoing.set(s, []);
    outgoing.get(s)!.push(index);
  };

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (!mask[i]) continue;
      if (y === 0 || !mask[i - width]) addEdge(x, y, x + 1, y, 0);
      if (x === width - 1 || !mask[i + 1]) addEdge(x + 1, y, x + 1, y + 1, 1);
      if (y === height - 1 || !mask[i + width]) addEdge(x + 1, y + 1, x, y + 1, 2);
      if (x === 0 || !mask[i - 1]) addEdge(x, y + 1, x, y, 3);
    }
  }

  const used = new Uint8Array(starts.length);
  const loops: Point[][] = [];
  const chooseEdge = (vertex: number, previousDir: number): number => {
    const candidates = outgoing.get(vertex) || [];
    const priority = [(previousDir + 1) % 4, previousDir, (previousDir + 3) % 4, (previousDir + 2) % 4];
    for (const desired of priority) {
      for (const edge of candidates) if (!used[edge] && dirs[edge] === desired) return edge;
    }
    for (const edge of candidates) if (!used[edge]) return edge;
    return -1;
  };

  for (let startEdge = 0; startEdge < starts.length; startEdge++) {
    if (used[startEdge]) continue;
    const startVertex = starts[startEdge];
    let edge = startEdge;
    let currentVertex = startVertex;
    let previousDir = dirs[edge];
    const vertices = [startVertex];
    let guard = 0;
    while (edge >= 0 && guard++ <= starts.length + 4) {
      used[edge] = 1;
      currentVertex = ends[edge];
      vertices.push(currentVertex);
      if (currentVertex === startVertex) break;
      previousDir = dirs[edge];
      edge = chooseEdge(currentVertex, previousDir);
    }
    if (vertices.length >= 4 && vertices[vertices.length - 1] === startVertex) {
      loops.push(vertices.map((vertex) => ({
        x: vertex % vertexWidth,
        y: Math.floor(vertex / vertexWidth)
      })));
    }
  }
  return loops;
}

const neighborDx = [-1, 0, 1, 1, 1, 0, -1, -1];
const neighborDy = [-1, -1, -1, 0, 1, 1, 1, 0];

export function traceSkeletonPolylines(skeleton: Uint8Array, width: number, height: number): number[][] {
  const degree = new Uint8Array(skeleton.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (!skeleton[i]) continue;
      let count = 0;
      for (let d = 0; d < 8; d++) {
        const nx = x + neighborDx[d];
        const ny = y + neighborDy[d];
        if (nx >= 0 && nx < width && ny >= 0 && ny < height && skeleton[ny * width + nx]) count++;
      }
      degree[i] = count;
    }
  }

  const visited = new Uint8Array(skeleton.length);
  const hasVisitedEdge = (index: number, dir: number) => (visited[index] & (1 << dir)) !== 0;
  const markEdge = (a: number, dir: number, b: number) => {
    visited[a] |= 1 << dir;
    visited[b] |= 1 << ((dir + 4) % 8);
  };
  const neighborIndex = (index: number, dir: number): number => {
    const x = index % width;
    const y = Math.floor(index / width);
    const nx = x + neighborDx[dir];
    const ny = y + neighborDy[dir];
    return nx >= 0 && nx < width && ny >= 0 && ny < height ? ny * width + nx : -1;
  };
  const activeDirections = (index: number): number[] => {
    const dirs: number[] = [];
    for (let d = 0; d < 8; d++) {
      const ni = neighborIndex(index, d);
      if (ni >= 0 && skeleton[ni]) dirs.push(d);
    }
    return dirs;
  };

  const walk = (start: number, firstDir: number): number[] => {
    const path = [start];
    let previous = start;
    let current = neighborIndex(start, firstDir);
    if (current < 0) return path;
    markEdge(start, firstDir, current);
    path.push(current);
    let guard = 0;
    while (degree[current] === 2 && guard++ < skeleton.length) {
      const dirs = activeDirections(current);
      let chosenDir = -1;
      for (const dir of dirs) {
        const ni = neighborIndex(current, dir);
        if (ni !== previous && !hasVisitedEdge(current, dir)) {
          chosenDir = dir;
          break;
        }
      }
      if (chosenDir < 0) break;
      const next = neighborIndex(current, chosenDir);
      markEdge(current, chosenDir, next);
      previous = current;
      current = next;
      path.push(current);
      if (current === start) break;
    }
    return path;
  };

  const paths: number[][] = [];
  for (let i = 0; i < skeleton.length; i++) {
    if (!skeleton[i] || degree[i] === 2) continue;
    if (degree[i] === 0) {
      paths.push([i]);
      continue;
    }
    for (const dir of activeDirections(i)) {
      if (!hasVisitedEdge(i, dir)) paths.push(walk(i, dir));
    }
  }
  for (let i = 0; i < skeleton.length; i++) {
    if (!skeleton[i] || degree[i] !== 2) continue;
    for (const dir of activeDirections(i)) {
      if (!hasVisitedEdge(i, dir)) paths.push(walk(i, dir));
    }
  }
  return paths;
}
