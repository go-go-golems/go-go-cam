import type { Bounds, RasterImage } from "./types";
import { INF, SQRT2, nextFrame } from "./utils";

export function rasterizeImage(img: HTMLImageElement, maxDimension: number): RasterImage {
  const scale = Math.min(1, maxDimension / Math.max(img.naturalWidth, img.naturalHeight));
  const width = Math.max(2, Math.round(img.naturalWidth * scale));
  const height = Math.max(2, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, width, height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, width, height);
  const imageData = ctx.getImageData(0, 0, width, height);
  const rgba = imageData.data;
  const gray = new Uint8Array(width * height);
  for (let i = 0, p = 0; i < rgba.length; i += 4, p++) {
    const a = rgba[i + 3] / 255;
    const r = 255 - a * (255 - rgba[i]);
    const g = 255 - a * (255 - rgba[i + 1]);
    const b = 255 - a * (255 - rgba[i + 2]);
    gray[p] = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
  }
  return { width, height, rgba: new Uint8ClampedArray(rgba), gray };
}

export function otsuThreshold(gray: Uint8Array): number {
  const hist = new Uint32Array(256);
  for (let i = 0; i < gray.length; i++) hist[gray[i]]++;
  const total = gray.length;
  let sumAll = 0;
  for (let i = 0; i < 256; i++) sumAll += i * hist[i];
  let weightBackground = 0;
  let sumBackground = 0;
  let bestVariance = -1;
  let bestThreshold = 128;
  for (let t = 0; t < 256; t++) {
    weightBackground += hist[t];
    if (weightBackground === 0) continue;
    const weightForeground = total - weightBackground;
    if (weightForeground === 0) break;
    sumBackground += t * hist[t];
    const meanBackground = sumBackground / weightBackground;
    const meanForeground = (sumAll - sumBackground) / weightForeground;
    const between = weightBackground * weightForeground * (meanBackground - meanForeground) ** 2;
    if (between > bestVariance) {
      bestVariance = between;
      bestThreshold = t;
    }
  }
  return bestThreshold;
}

export function makeMask(gray: Uint8Array, threshold: number, invert: boolean): Uint8Array {
  const mask = new Uint8Array(gray.length);
  if (!invert) {
    for (let i = 0; i < gray.length; i++) mask[i] = gray[i] <= threshold ? 1 : 0;
  } else {
    for (let i = 0; i < gray.length; i++) mask[i] = gray[i] > threshold ? 1 : 0;
  }
  return mask;
}

function boxMorph(
  mask: Uint8Array,
  width: number,
  height: number,
  radius: number,
  operation: "dilate" | "erode"
): Uint8Array {
  if (radius <= 0) return new Uint8Array(mask);
  const stride = width + 1;
  const integral = new Uint32Array((width + 1) * (height + 1));
  for (let y = 0; y < height; y++) {
    let rowSum = 0;
    const src = y * width;
    const dst = (y + 1) * stride;
    const prev = y * stride;
    for (let x = 0; x < width; x++) {
      rowSum += mask[src + x];
      integral[dst + x + 1] = integral[prev + x + 1] + rowSum;
    }
  }
  const out = new Uint8Array(mask.length);
  const fullSide = radius * 2 + 1;
  const fullArea = fullSide * fullSide;
  for (let y = 0; y < height; y++) {
    const y0 = Math.max(0, y - radius);
    const y1 = Math.min(height, y + radius + 1);
    for (let x = 0; x < width; x++) {
      const x0 = Math.max(0, x - radius);
      const x1 = Math.min(width, x + radius + 1);
      const sum =
        integral[y1 * stride + x1] - integral[y0 * stride + x1] -
        integral[y1 * stride + x0] + integral[y0 * stride + x0];
      if (operation === "dilate") {
        out[y * width + x] = sum > 0 ? 1 : 0;
      } else {
        const fullyInside = x - radius >= 0 && x + radius < width && y - radius >= 0 && y + radius < height;
        out[y * width + x] = fullyInside && sum === fullArea ? 1 : 0;
      }
    }
  }
  return out;
}

export function morphologicalOpen(mask: Uint8Array, width: number, height: number, radius: number): Uint8Array {
  return radius > 0
    ? boxMorph(boxMorph(mask, width, height, radius, "erode"), width, height, radius, "dilate")
    : new Uint8Array(mask);
}

export function morphologicalClose(mask: Uint8Array, width: number, height: number, radius: number): Uint8Array {
  return radius > 0
    ? boxMorph(boxMorph(mask, width, height, radius, "dilate"), width, height, radius, "erode")
    : new Uint8Array(mask);
}

export function removeSmallComponents(mask: Uint8Array, width: number, height: number, minArea: number): Uint8Array {
  if (minArea <= 1) return new Uint8Array(mask);
  const out = new Uint8Array(mask);
  const seen = new Uint8Array(mask.length);
  const queue = new Int32Array(mask.length);
  const dx = [-1, 0, 1, -1, 1, -1, 0, 1];
  const dy = [-1, -1, -1, 0, 0, 1, 1, 1];

  for (let start = 0; start < out.length; start++) {
    if (!out[start] || seen[start]) continue;
    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    seen[start] = 1;
    while (head < tail) {
      const index = queue[head++];
      const x = index % width;
      const y = Math.floor(index / width);
      for (let k = 0; k < 8; k++) {
        const nx = x + dx[k];
        const ny = y + dy[k];
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
        const ni = ny * width + nx;
        if (out[ni] && !seen[ni]) {
          seen[ni] = 1;
          queue[tail++] = ni;
        }
      }
    }
    if (tail < minArea) {
      for (let i = 0; i < tail; i++) out[queue[i]] = 0;
    }
  }
  return out;
}

export function foregroundBounds(mask: Uint8Array, width: number, height: number): Bounds | null {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      if (!mask[row + x]) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  return maxX >= minX ? { minX, minY, maxX, maxY } : null;
}

interface TypedArrayLike<T> {
  length: number;
  subarray(begin: number, end?: number): T;
}

export function cropTypedArray<T extends Uint8Array | Uint8ClampedArray>(
  source: T & TypedArrayLike<T>,
  width: number,
  _height: number,
  bounds: Bounds,
  channels: number,
  ArrayType: new (length: number) => T
): { data: T; width: number; height: number } {
  const cropWidth = bounds.maxX - bounds.minX + 1;
  const cropHeight = bounds.maxY - bounds.minY + 1;
  const out = new ArrayType(cropWidth * cropHeight * channels);
  for (let y = 0; y < cropHeight; y++) {
    const srcStart = ((bounds.minY + y) * width + bounds.minX) * channels;
    const dstStart = y * cropWidth * channels;
    (out as Uint8Array).set(source.subarray(srcStart, srcStart + cropWidth * channels) as Uint8Array, dstStart);
  }
  return { data: out, width: cropWidth, height: cropHeight };
}

export function countForeground(mask: Uint8Array): number {
  let count = 0;
  for (let i = 0; i < mask.length; i++) count += mask[i];
  return count;
}

export function chamferDistance(
  mask: Uint8Array,
  width: number,
  height: number,
  zeroAtForeground: boolean
): Float32Array {
  const dist = new Float32Array(mask.length);
  for (let i = 0; i < mask.length; i++) {
    const isSeed = zeroAtForeground ? mask[i] === 1 : mask[i] === 0;
    dist[i] = isSeed ? 0 : INF;
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      let d = dist[i];
      if (x > 0) d = Math.min(d, dist[i - 1] + 1);
      if (y > 0) d = Math.min(d, dist[i - width] + 1);
      if (x > 0 && y > 0) d = Math.min(d, dist[i - width - 1] + SQRT2);
      if (x + 1 < width && y > 0) d = Math.min(d, dist[i - width + 1] + SQRT2);
      dist[i] = d;
    }
  }
  for (let y = height - 1; y >= 0; y--) {
    for (let x = width - 1; x >= 0; x--) {
      const i = y * width + x;
      let d = dist[i];
      if (x + 1 < width) d = Math.min(d, dist[i + 1] + 1);
      if (y + 1 < height) d = Math.min(d, dist[i + width] + 1);
      if (x + 1 < width && y + 1 < height) d = Math.min(d, dist[i + width + 1] + SQRT2);
      if (x > 0 && y + 1 < height) d = Math.min(d, dist[i + width - 1] + SQRT2);
      dist[i] = d;
    }
  }
  return dist;
}

export async function zhangSuenThin(
  mask: Uint8Array,
  width: number,
  height: number,
  progressCallback?: (iteration: number) => void
): Promise<Uint8Array> {
  const image = new Uint8Array(mask);
  const marks = new Int32Array(mask.length);
  const bounds = foregroundBounds(image, width, height);
  if (!bounds) return image;
  const minX = Math.max(1, bounds.minX - 1);
  const maxX = Math.min(width - 2, bounds.maxX + 1);
  const minY = Math.max(1, bounds.minY - 1);
  const maxY = Math.min(height - 2, bounds.maxY + 1);
  let changed = true;
  let iteration = 0;

  while (changed && iteration < 300) {
    changed = false;
    iteration++;
    for (let pass = 0; pass < 2; pass++) {
      let deleteCount = 0;
      for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
          const i = y * width + x;
          if (!image[i]) continue;
          const p2 = image[i - width];
          const p3 = image[i - width + 1];
          const p4 = image[i + 1];
          const p5 = image[i + width + 1];
          const p6 = image[i + width];
          const p7 = image[i + width - 1];
          const p8 = image[i - 1];
          const p9 = image[i - width - 1];
          const neighbors = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9;
          if (neighbors < 2 || neighbors > 6) continue;
          const transitions =
            Number(!p2 && p3) + Number(!p3 && p4) + Number(!p4 && p5) + Number(!p5 && p6) +
            Number(!p6 && p7) + Number(!p7 && p8) + Number(!p8 && p9) + Number(!p9 && p2);
          if (transitions !== 1) continue;
          if (pass === 0) {
            if (p2 && p4 && p6) continue;
            if (p4 && p6 && p8) continue;
          } else {
            if (p2 && p4 && p8) continue;
            if (p2 && p6 && p8) continue;
          }
          marks[deleteCount++] = i;
        }
      }
      if (deleteCount) {
        changed = true;
        for (let i = 0; i < deleteCount; i++) image[marks[i]] = 0;
      }
    }
    if (iteration % 4 === 0) {
      progressCallback?.(iteration);
      await nextFrame();
    }
  }
  return image;
}
