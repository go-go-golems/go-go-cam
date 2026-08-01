import type { Model, Toolpath } from "./types";
import { machineToPixel } from "./toolpath";

export function clearCanvas(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

export function drawSourceImage(canvas: HTMLCanvasElement, img: HTMLImageElement): void {
  const maxPreview = 1000;
  const ratio = Math.min(1, maxPreview / Math.max(img.naturalWidth, img.naturalHeight));
  const width = Math.max(1, Math.round(img.naturalWidth * ratio));
  const height = Math.max(1, Math.round(img.naturalHeight * ratio));
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, width, height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, width, height);
}

export function drawRgba(canvas: HTMLCanvasElement, rgba: Uint8ClampedArray, width: number, height: number): void {
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  ctx.putImageData(new ImageData(new Uint8ClampedArray(rgba), width, height), 0, 0);
}

export function drawMask(canvas: HTMLCanvasElement, mask: Uint8Array, width: number, height: number): void {
  canvas.width = width;
  canvas.height = height;
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let i = 0, p = 0; i < mask.length; i++, p += 4) {
    const value = mask[i] ? 0 : 255;
    rgba[p] = value;
    rgba[p + 1] = value;
    rgba[p + 2] = value;
    rgba[p + 3] = 255;
  }
  canvas.getContext("2d")!.putImageData(new ImageData(rgba, width, height), 0, 0);
}

export function drawToolpaths(canvas: HTMLCanvasElement, mask: Uint8Array, model: Model, paths: Toolpath[]): void {
  canvas.width = model.width;
  canvas.height = model.height;
  const ctx = canvas.getContext("2d")!;
  const rgba = new Uint8ClampedArray(model.width * model.height * 4);
  for (let i = 0, p = 0; i < mask.length; i++, p += 4) {
    const value = mask[i] ? 226 : 255;
    rgba[p] = value;
    rgba[p + 1] = value;
    rgba[p + 2] = value;
    rgba[p + 3] = 255;
  }
  ctx.putImageData(new ImageData(rgba, model.width, model.height), 0, 0);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = Math.max(0.6, model.width / 1400);
  const stride = Math.max(1, Math.ceil(paths.length / 18000));
  for (let k = 0; k < paths.length; k += stride) {
    const path = paths[k];
    if (!path.points.length) continue;
    ctx.strokeStyle = path.kind === "raster" ? "#286f9b" : path.kind === "contour" ? "#2f8f5b" : "#c74646";
    ctx.beginPath();
    const first = machineToPixel(path.points[0].x, path.points[0].y, model);
    ctx.moveTo(first.x, first.y);
    for (let i = 1; i < path.points.length; i++) {
      const p = machineToPixel(path.points[i].x, path.points[i].y, model);
      ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
  }
}
