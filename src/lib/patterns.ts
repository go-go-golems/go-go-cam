/**
 * Synthetic test patterns for exercising the toolpath strategies: simple
 * black-on-white shapes rendered to a canvas and returned as data URLs, so
 * they flow through the exact same image-loading path as user uploads.
 */

export interface TestPattern {
  id: string;
  label: string;
  draw: (ctx: CanvasRenderingContext2D, size: number) => void;
}

const line = (ctx: CanvasRenderingContext2D, width: number) => {
  ctx.strokeStyle = "black";
  ctx.lineWidth = width;
};

export const TEST_PATTERNS: TestPattern[] = [
  {
    id: "filled-square",
    label: "Filled square",
    draw: (ctx, s) => {
      ctx.fillRect(s * 0.25, s * 0.25, s * 0.5, s * 0.5);
    }
  },
  {
    id: "square-outline",
    label: "Square outline",
    draw: (ctx, s) => {
      line(ctx, s * 0.04);
      ctx.strokeRect(s * 0.25, s * 0.25, s * 0.5, s * 0.5);
    }
  },
  {
    id: "filled-circle",
    label: "Filled circle",
    draw: (ctx, s) => {
      ctx.beginPath();
      ctx.arc(s / 2, s / 2, s * 0.3, 0, Math.PI * 2);
      ctx.fill();
    }
  },
  {
    id: "ring",
    label: "Ring (island test)",
    draw: (ctx, s) => {
      line(ctx, s * 0.08);
      ctx.beginPath();
      ctx.arc(s / 2, s / 2, s * 0.28, 0, Math.PI * 2);
      ctx.stroke();
    }
  },
  {
    id: "dumbbell",
    label: "Dumbbell (neck split test)",
    draw: (ctx, s) => {
      ctx.beginPath();
      ctx.arc(s * 0.3, s * 0.5, s * 0.16, 0, Math.PI * 2);
      ctx.arc(s * 0.7, s * 0.5, s * 0.16, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(s * 0.3, s * 0.47, s * 0.4, s * 0.06);
    }
  },
  {
    id: "stripes",
    label: "Thin stripes (detail test)",
    draw: (ctx, s) => {
      line(ctx, s * 0.012);
      for (let i = 0; i < 6; i++) {
        const y = s * (0.25 + i * 0.1);
        ctx.beginPath();
        ctx.moveTo(s * 0.2, y);
        ctx.lineTo(s * 0.8, y);
        ctx.stroke();
      }
    }
  },
  {
    id: "checkerboard",
    label: "Checkerboard",
    draw: (ctx, s) => {
      const n = 6;
      const cell = (s * 0.6) / n;
      for (let y = 0; y < n; y++) {
        for (let x = 0; x < n; x++) {
          if ((x + y) % 2 === 0) ctx.fillRect(s * 0.2 + x * cell, s * 0.2 + y * cell, cell, cell);
        }
      }
    }
  },
  {
    id: "star",
    label: "Star (sharp corners)",
    draw: (ctx, s) => {
      const cx = s / 2;
      const cy = s / 2;
      const outer = s * 0.32;
      const inner = s * 0.13;
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const r = i % 2 === 0 ? outer : inner;
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const x = cx + r * Math.cos(a);
        const y = cy + r * Math.sin(a);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fill();
    }
  },
  {
    id: "text",
    label: "Text sample",
    draw: (ctx, s) => {
      ctx.font = `bold ${Math.round(s * 0.22)}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("CNC", s / 2, s * 0.4);
      ctx.font = `${Math.round(s * 0.1)}px sans-serif`;
      ctx.fillText("test 123", s / 2, s * 0.65);
    }
  }
];

export function renderTestPattern(id: string, size = 600): string {
  const pattern = TEST_PATTERNS.find((p) => p.id === id);
  if (!pattern) throw new Error(`Unknown test pattern: ${id}`);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = "black";
  pattern.draw(ctx, size);
  return canvas.toDataURL("image/png");
}
