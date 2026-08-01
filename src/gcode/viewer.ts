import { parseGcode, type ParsedGcode } from "./parser";

type ColorMode = "toolpath" | "tool" | "depth";

const TOOLPATH_PALETTE = [
  "#c74646", "#286f9b", "#2f8f5b", "#b07b1f", "#7b4fa6", "#2b8f8f", "#b0508f", "#6b7f2a"
];
const RAPID_COLOR = "rgba(120, 132, 144, 0.55)";

interface ViewerState {
  parsed: ParsedGcode | null;
  name: string;
  colorMode: ColorMode;
  showRapids: boolean;
  progress: number; // 0..1 fraction of segments drawn
  hiddenToolpaths: Set<number>;
  // view transform: screen = world * scale + offset (y flipped)
  scale: number;
  offsetX: number;
  offsetY: number;
}

export interface GcodeViewerHandle {
  loadGcode(text: string, name: string): void;
}

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id}`);
  return el as T;
};

function depthColor(z: number, minZ: number, maxZ: number): string {
  const range = Math.max(1e-6, maxZ - minZ);
  const t = Math.min(1, Math.max(0, (maxZ - z) / range));
  // shallow = warm yellow, deep = dark red-purple
  const hue = 55 - t * 55;
  const light = 62 - t * 34;
  return `hsl(${hue}, 85%, ${light}%)`;
}

export function setupGcodeViewer(): GcodeViewerHandle {
  const canvas = $<HTMLCanvasElement>("gcodeViewerCanvas");
  const ctx = canvas.getContext("2d")!;

  const state: ViewerState = {
    parsed: null,
    name: "",
    colorMode: "toolpath",
    showRapids: true,
    progress: 1,
    hiddenToolpaths: new Set(),
    scale: 1,
    offsetX: 0,
    offsetY: 0
  };

  function worldToScreen(x: number, y: number): [number, number] {
    return [x * state.scale + state.offsetX, canvas.height - (y * state.scale + state.offsetY)];
  }

  function fitView(): void {
    const bounds = state.parsed?.bounds;
    if (!bounds) return;
    const spanX = Math.max(1e-6, bounds.maxX - bounds.minX);
    const spanY = Math.max(1e-6, bounds.maxY - bounds.minY);
    const margin = 30;
    state.scale = Math.min((canvas.width - margin * 2) / spanX, (canvas.height - margin * 2) / spanY);
    state.offsetX = margin - bounds.minX * state.scale + (canvas.width - margin * 2 - spanX * state.scale) / 2;
    state.offsetY = margin - bounds.minY * state.scale + (canvas.height - margin * 2 - spanY * state.scale) / 2;
  }

  function drawGrid(): void {
    const bounds = state.parsed?.bounds;
    ctx.fillStyle = "#fcfdfe";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (!bounds) return;
    // pick a grid step of 1/5/10/50... mm targeting ~60px spacing
    const targetPx = 60;
    const rawStep = targetPx / state.scale;
    const pow = Math.pow(10, Math.floor(Math.log10(rawStep)));
    const step = [1, 2, 5, 10].map((k) => k * pow).find((s) => s >= rawStep) ?? 10 * pow;
    const startX = Math.floor((-state.offsetX / state.scale) / step) * step;
    const endX = (canvas.width - state.offsetX) / state.scale;
    const startY = Math.floor((-state.offsetY / state.scale) / step) * step;
    const endY = (canvas.height - state.offsetY) / state.scale;
    ctx.lineWidth = 1;
    ctx.font = "10px ui-monospace, monospace";
    for (let gx = startX; gx <= endX; gx += step) {
      const [sx] = worldToScreen(gx, 0);
      ctx.strokeStyle = Math.abs(gx) < step / 2 ? "#b8c4ce" : "#eef2f5";
      ctx.beginPath();
      ctx.moveTo(sx, 0);
      ctx.lineTo(sx, canvas.height);
      ctx.stroke();
      ctx.fillStyle = "#9aa7b1";
      ctx.fillText(String(Math.round(gx * 100) / 100), sx + 2, canvas.height - 4);
    }
    for (let gy = startY; gy <= endY; gy += step) {
      const [, sy] = worldToScreen(0, gy);
      ctx.strokeStyle = Math.abs(gy) < step / 2 ? "#b8c4ce" : "#eef2f5";
      ctx.beginPath();
      ctx.moveTo(0, sy);
      ctx.lineTo(canvas.width, sy);
      ctx.stroke();
      ctx.fillStyle = "#9aa7b1";
      ctx.fillText(String(Math.round(gy * 100) / 100), 3, sy - 3);
    }
  }

  function segmentColor(segIndex: number): string | null {
    const parsed = state.parsed!;
    const s = parsed.segments[segIndex];
    if (state.hiddenToolpaths.has(s.toolpath)) return null;
    if (s.rapid) return state.showRapids ? RAPID_COLOR : null;
    switch (state.colorMode) {
      case "toolpath":
        return TOOLPATH_PALETTE[s.toolpath % TOOLPATH_PALETTE.length];
      case "tool": {
        const toolNumbers = [...parsed.tools.keys()].sort((a, b) => a - b);
        let idx = s.tool === null ? 0 : toolNumbers.indexOf(s.tool);
        if (idx < 0) idx = s.tool ?? 0;
        return TOOLPATH_PALETTE[idx % TOOLPATH_PALETTE.length];
      }
      case "depth": {
        const bounds = parsed.bounds!;
        return depthColor(Math.min(s.z1, s.z2), bounds.minZ, bounds.maxZ);
      }
    }
  }

  function redraw(): void {
    drawGrid();
    const parsed = state.parsed;
    if (!parsed) {
      ctx.fillStyle = "#8a97a2";
      ctx.font = "13px ui-sans-serif, system-ui";
      ctx.fillText("Load a .nc/.gcode file or view the generated program.", 20, 30);
      return;
    }
    const limit = Math.floor(parsed.segments.length * state.progress);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    let currentColor: string | null = null;
    let currentRapid = false;
    ctx.beginPath();
    for (let i = 0; i < limit; i++) {
      const s = parsed.segments[i];
      const color = segmentColor(i);
      if (color === null) continue;
      if (color !== currentColor || s.rapid !== currentRapid) {
        if (currentColor !== null) ctx.stroke();
        ctx.beginPath();
        currentColor = color;
        currentRapid = s.rapid;
        ctx.strokeStyle = color;
        ctx.lineWidth = s.rapid ? 0.8 : 1.4;
        ctx.setLineDash(s.rapid ? [4, 4] : []);
      }
      const [ax, ay] = worldToScreen(s.x1, s.y1);
      const [bx, by] = worldToScreen(s.x2, s.y2);
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
    }
    if (currentColor !== null) ctx.stroke();
    ctx.setLineDash([]);

    // current position marker at the scrub point
    if (limit > 0 && limit < parsed.segments.length) {
      const s = parsed.segments[limit - 1];
      const [px, py] = worldToScreen(s.x2, s.y2);
      ctx.fillStyle = "#111920";
      ctx.beginPath();
      ctx.arc(px, py, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function describeToolpaths(): void {
    const parsed = state.parsed;
    const list = $("gcodeToolpathList");
    list.replaceChildren();
    if (!parsed) return;
    parsed.toolpaths.forEach((tp) => {
      const li = document.createElement("li");
      const label = document.createElement("label");
      const box = document.createElement("input");
      box.type = "checkbox";
      box.checked = !state.hiddenToolpaths.has(tp.index);
      box.addEventListener("change", () => {
        if (box.checked) state.hiddenToolpaths.delete(tp.index);
        else state.hiddenToolpaths.add(tp.index);
        redraw();
      });
      const chip = document.createElement("span");
      chip.className = "tp-chip";
      chip.style.background = TOOLPATH_PALETTE[tp.index % TOOLPATH_PALETTE.length];
      const toolName = tp.tool !== null ? parsed.tools.get(tp.tool)?.name : undefined;
      const name = tp.name ?? `Toolpath ${tp.index + 1}`;
      const text = document.createElement("span");
      text.textContent =
        `${name} — T${tp.tool ?? "?"}${toolName ? ` (${toolName})` : ""}` +
        `${tp.spindleRpm ? `, S${tp.spindleRpm}` : ""}` +
        `, cut ${tp.cutDistance >= 1000 ? (tp.cutDistance / 1000).toFixed(2) + "m" : tp.cutDistance.toFixed(0) + "mm"}` +
        `, Z ${tp.minZ === Infinity ? "—" : tp.minZ.toFixed(2)}…${tp.maxZ === -Infinity ? "—" : tp.maxZ.toFixed(2)}`;
      label.append(box, chip, text);
      li.appendChild(label);
      list.appendChild(li);
    });

    const eventsList = $("gcodeEventList");
    eventsList.replaceChildren();
    for (const ev of parsed.events) {
      const li = document.createElement("li");
      li.textContent = `line ${ev.line}: ${ev.detail}`;
      li.dataset.kind = ev.kind;
      eventsList.appendChild(li);
    }
  }

  function describeSummary(): void {
    const parsed = state.parsed;
    const el = $("gcodeSummary");
    if (!parsed) {
      el.textContent = "No file loaded.";
      return;
    }
    const b = parsed.bounds;
    const meta = Object.entries(parsed.metadata).map(([k, v]) => `${k}: ${v}`).join(" · ");
    el.textContent =
      `${state.name} — ${parsed.lineCount.toLocaleString()} lines, ${parsed.segments.length.toLocaleString()} segments, ` +
      `${parsed.toolpaths.length} toolpaths, ${parsed.tools.size || "?"} tools. ` +
      `Cut ${(parsed.cutDistance / 1000).toFixed(2)}m, rapid ${(parsed.rapidDistance / 1000).toFixed(2)}m.` +
      (b ? ` XY ${(b.maxX - b.minX).toFixed(1)} × ${(b.maxY - b.minY).toFixed(1)}mm, Z ${b.minZ.toFixed(2)}…${b.maxZ.toFixed(2)}mm.` : "") +
      (meta ? ` ${meta}` : "");
  }

  function load(text: string, name: string): void {
    state.parsed = parseGcode(text);
    state.name = name;
    state.hiddenToolpaths.clear();
    state.progress = 1;
    $<HTMLInputElement>("gcodeProgress").value = "1000";
    fitView();
    describeSummary();
    describeToolpaths();
    redraw();
  }

  // --- interaction: pan (drag), zoom (wheel), fit ---
  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  canvas.addEventListener("pointerdown", (e) => {
    dragging = true;
    lastX = e.offsetX;
    lastY = e.offsetY;
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    state.offsetX += e.offsetX - lastX;
    state.offsetY -= e.offsetY - lastY;
    lastX = e.offsetX;
    lastY = e.offsetY;
    redraw();
  });
  canvas.addEventListener("pointerup", () => { dragging = false; });
  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    // zoom around cursor: keep the world point under the cursor fixed
    const wx = (e.offsetX - state.offsetX) / state.scale;
    const wy = (canvas.height - e.offsetY - state.offsetY) / state.scale;
    state.scale *= factor;
    state.offsetX = e.offsetX - wx * state.scale;
    state.offsetY = canvas.height - e.offsetY - wy * state.scale;
    redraw();
  }, { passive: false });

  $("gcodeFitBtn").addEventListener("click", () => { fitView(); redraw(); });
  $<HTMLSelectElement>("gcodeColorMode").addEventListener("change", (e) => {
    state.colorMode = (e.target as HTMLSelectElement).value as ColorMode;
    redraw();
  });
  $<HTMLInputElement>("gcodeShowRapids").addEventListener("change", (e) => {
    state.showRapids = (e.target as HTMLInputElement).checked;
    redraw();
  });
  $<HTMLInputElement>("gcodeProgress").addEventListener("input", (e) => {
    state.progress = Number((e.target as HTMLInputElement).value) / 1000;
    redraw();
  });
  $<HTMLInputElement>("gcodeFile").addEventListener("change", (event) => {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => load(reader.result as string, file.name);
    reader.readAsText(file);
  });

  redraw();

  return {
    loadGcode: load
  };
}
