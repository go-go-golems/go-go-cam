/**
 * Synthetic test patterns for exercising the toolpath strategies. Pure mask
 * math (no canvas), so the browser UI and the Node batch generator share the
 * exact same pixels. 1 = black (engraved), 0 = white.
 */

export interface TestPattern {
  id: string;
  label: string;
  render: (size: number) => Uint8Array;
}

type Mask = { data: Uint8Array; size: number };

const blank = (size: number): Mask => ({ data: new Uint8Array(size * size), size });

const fillRect = (m: Mask, x0: number, y0: number, x1: number, y1: number, value = 1) => {
  const ax = Math.max(0, Math.round(x0));
  const ay = Math.max(0, Math.round(y0));
  const bx = Math.min(m.size, Math.round(x1));
  const by = Math.min(m.size, Math.round(y1));
  for (let y = ay; y < by; y++) for (let x = ax; x < bx; x++) m.data[y * m.size + x] = value;
};

const fillDisk = (m: Mask, cx: number, cy: number, r: number, value = 1) => {
  const r2 = r * r;
  const ay = Math.max(0, Math.floor(cy - r));
  const by = Math.min(m.size, Math.ceil(cy + r) + 1);
  for (let y = ay; y < by; y++) {
    for (let x = Math.max(0, Math.floor(cx - r)); x < Math.min(m.size, Math.ceil(cx + r) + 1); x++) {
      if ((x - cx) ** 2 + (y - cy) ** 2 <= r2) m.data[y * m.size + x] = value;
    }
  }
};

/** Even-odd fill of a closed polygon (scanline point-in-polygon test). */
const fillPolygon = (m: Mask, points: Array<[number, number]>) => {
  const ys = points.map((p) => p[1]);
  const ay = Math.max(0, Math.floor(Math.min(...ys)));
  const by = Math.min(m.size, Math.ceil(Math.max(...ys)) + 1);
  for (let y = ay; y < by; y++) {
    const crossings: number[] = [];
    for (let i = 0; i < points.length; i++) {
      const [x1, y1] = points[i];
      const [x2, y2] = points[(i + 1) % points.length];
      if (y1 <= y !== y2 <= y) crossings.push(x1 + ((y - y1) / (y2 - y1)) * (x2 - x1));
    }
    crossings.sort((a, b) => a - b);
    for (let k = 0; k + 1 < crossings.length; k += 2) {
      for (let x = Math.max(0, Math.ceil(crossings[k])); x < Math.min(m.size, crossings[k + 1]); x++) {
        m.data[y * m.size + x] = 1;
      }
    }
  }
};

// 5x7 bitmap glyphs for the text pattern — blocky corners are a feature for a
// CNC test, not a limitation.
const FONT: Record<string, string[]> = {
  C: [".###.", "#...#", "#....", "#....", "#....", "#...#", ".###."],
  N: ["#...#", "##..#", "#.#.#", "#..##", "#...#", "#...#", "#...#"],
  "1": ["..#..", ".##..", "..#..", "..#..", "..#..", "..#..", ".###."],
  "2": [".###.", "#...#", "....#", "...#.", "..#..", ".#...", "#####"],
  "3": [".###.", "#...#", "....#", "..##.", "....#", "#...#", ".###."],
  " ": [".....", ".....", ".....", ".....", ".....", ".....", "....."]
};

const drawText = (m: Mask, text: string, centerX: number, topY: number, cell: number) => {
  const width = text.length * 6 * cell - cell;
  let penX = centerX - width / 2;
  for (const ch of text) {
    const glyph = FONT[ch] ?? FONT[" "];
    for (let row = 0; row < 7; row++) {
      for (let col = 0; col < 5; col++) {
        if (glyph[row][col] === "#") {
          fillRect(m, penX + col * cell, topY + row * cell, penX + (col + 1) * cell, topY + (row + 1) * cell);
        }
      }
    }
    penX += 6 * cell;
  }
};

export const TEST_PATTERNS: TestPattern[] = [
  {
    id: "filled-square",
    label: "Filled square",
    render: (s) => {
      const m = blank(s);
      fillRect(m, s * 0.25, s * 0.25, s * 0.75, s * 0.75);
      return m.data;
    }
  },
  {
    id: "square-outline",
    label: "Square outline",
    render: (s) => {
      const m = blank(s);
      const w = s * 0.04;
      fillRect(m, s * 0.25 - w / 2, s * 0.25 - w / 2, s * 0.75 + w / 2, s * 0.75 + w / 2);
      fillRect(m, s * 0.25 + w / 2, s * 0.25 + w / 2, s * 0.75 - w / 2, s * 0.75 - w / 2, 0);
      return m.data;
    }
  },
  {
    id: "filled-circle",
    label: "Filled circle",
    render: (s) => {
      const m = blank(s);
      fillDisk(m, s / 2, s / 2, s * 0.3);
      return m.data;
    }
  },
  {
    id: "ring",
    label: "Ring (island test)",
    render: (s) => {
      const m = blank(s);
      fillDisk(m, s / 2, s / 2, s * 0.28 + s * 0.04);
      fillDisk(m, s / 2, s / 2, s * 0.28 - s * 0.04, 0);
      return m.data;
    }
  },
  {
    id: "dumbbell",
    label: "Dumbbell (neck split test)",
    render: (s) => {
      const m = blank(s);
      fillDisk(m, s * 0.3, s * 0.5, s * 0.16);
      fillDisk(m, s * 0.7, s * 0.5, s * 0.16);
      fillRect(m, s * 0.3, s * 0.47, s * 0.7, s * 0.53);
      return m.data;
    }
  },
  {
    id: "stripes",
    label: "Thin stripes (detail test)",
    render: (s) => {
      const m = blank(s);
      const w = Math.max(1, s * 0.012);
      for (let i = 0; i < 6; i++) {
        const y = s * (0.25 + i * 0.1);
        fillRect(m, s * 0.2, y - w / 2, s * 0.8, y + w / 2);
      }
      return m.data;
    }
  },
  {
    id: "checkerboard",
    label: "Checkerboard",
    render: (s) => {
      const m = blank(s);
      const n = 6;
      const cell = (s * 0.6) / n;
      for (let y = 0; y < n; y++) {
        for (let x = 0; x < n; x++) {
          if ((x + y) % 2 === 0) {
            fillRect(m, s * 0.2 + x * cell, s * 0.2 + y * cell, s * 0.2 + (x + 1) * cell, s * 0.2 + (y + 1) * cell);
          }
        }
      }
      return m.data;
    }
  },
  {
    id: "star",
    label: "Star (sharp corners)",
    render: (s) => {
      const m = blank(s);
      const points: Array<[number, number]> = [];
      for (let i = 0; i < 10; i++) {
        const r = i % 2 === 0 ? s * 0.32 : s * 0.13;
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        points.push([s / 2 + r * Math.cos(a), s / 2 + r * Math.sin(a)]);
      }
      fillPolygon(m, points);
      return m.data;
    }
  },
  {
    id: "text",
    label: "Text sample (bitmap CNC / 123)",
    render: (s) => {
      const m = blank(s);
      const cell = s * 0.03;
      drawText(m, "CNC", s / 2, s * 0.25, cell);
      drawText(m, "123", s / 2, s * 0.55, cell);
      return m.data;
    }
  }
];

/** Grayscale raster (0 black / 255 white) for the shared pipeline. */
export function renderPatternGray(id: string, size = 600): { width: number; height: number; gray: Uint8Array } {
  const pattern = TEST_PATTERNS.find((p) => p.id === id);
  if (!pattern) throw new Error(`Unknown test pattern: ${id}`);
  const mask = pattern.render(size);
  const gray = new Uint8Array(mask.length);
  for (let i = 0; i < mask.length; i++) gray[i] = mask[i] ? 0 : 255;
  return { width: size, height: size, gray };
}

/** Browser-only helper: pattern as a PNG data URL for the image-load flow. */
export function renderTestPattern(id: string, size = 600): string {
  const { gray } = renderPatternGray(id, size);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const rgba = new Uint8ClampedArray(size * size * 4);
  for (let i = 0, p = 0; i < gray.length; i++, p += 4) {
    rgba[p] = rgba[p + 1] = rgba[p + 2] = gray[i];
    rgba[p + 3] = 255;
  }
  ctx.putImageData(new ImageData(rgba, size, size), 0, 0);
  return canvas.toDataURL("image/png");
}
