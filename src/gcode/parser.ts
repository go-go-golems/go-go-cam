/**
 * G-code parser tailored to the dialects this app actually meets:
 * - Makera Carvera/MakeraStudio output (`;@MKR|...` metadata, G0/G1, T# M6, S# M3)
 * - our own generator's GRBL-style output (G21/G90/G17/G94, G0/G1, M3/M5/M2)
 * Arcs (G2/G3 with I/J) are supported for general files even though the
 * Makera badge job is linear-only.
 */

export interface GcodeSegment {
  x1: number; y1: number; z1: number;
  x2: number; y2: number; z2: number;
  rapid: boolean;
  feed: number | null;
  tool: number | null;
  toolpath: number;
  line: number;
}

export interface ToolInfo {
  number: number;
  name?: string;
  type?: string;
  diameter?: number;
  tipDiameter?: number;
}

export interface ToolpathInfo {
  index: number;
  name?: string;
  tool: number | null;
  spindleRpm: number | null;
  segments: number;
  cutDistance: number;
  rapidDistance: number;
  minZ: number;
  maxZ: number;
  firstLine: number;
}

export interface GcodeEvent {
  line: number;
  kind: "tool-change" | "spindle-on" | "spindle-off" | "program-end" | "home" | "toolpath-marker";
  detail: string;
}

export interface ParsedGcode {
  segments: GcodeSegment[];
  tools: Map<number, ToolInfo>;
  toolpaths: ToolpathInfo[];
  events: GcodeEvent[];
  metadata: Record<string, string>;
  bounds: { minX: number; minY: number; maxX: number; maxY: number; minZ: number; maxZ: number } | null;
  lineCount: number;
  cutDistance: number;
  rapidDistance: number;
}

function parseMkrComment(
  body: string,
  tools: Map<number, ToolInfo>,
  metadata: Record<string, string>,
  namedToolpaths: Map<number, { name?: string; tool?: number }>
): void {
  const parts = body.split("|");
  const kind = parts[1];
  const fields: Record<string, string> = {};
  for (const part of parts.slice(2)) {
    const eq = part.indexOf("=");
    if (eq > 0) fields[part.slice(0, eq)] = part.slice(eq + 1);
  }
  switch (kind) {
    case "TOOL": {
      const number = Number(fields.number);
      if (Number.isFinite(number)) {
        tools.set(number, {
          number,
          name: fields.name,
          type: fields.type,
          diameter: fields.diameter ? Number(fields.diameter) : undefined,
          tipDiameter: fields.tipdiameter ? Number(fields.tipdiameter) : undefined
        });
      }
      break;
    }
    case "TOOLPATH": {
      const number = Number(fields.number);
      if (Number.isFinite(number)) {
        namedToolpaths.set(number, {
          name: fields.name,
          tool: fields.tool_number ? Number(fields.tool_number) : undefined
        });
      }
      break;
    }
    case "MACHINE":
      if (fields.name) metadata.machine = fields.name;
      break;
    case "MATERIAL":
      if (fields.name3) metadata.material = fields.name3;
      break;
    case "STOCK":
      metadata.stock = `${fields.length ?? "?"} × ${fields.width ?? "?"} × ${fields.height ?? "?"} mm`;
      break;
    case "TIME":
      if (fields.seconds) metadata.estimatedTime = `${Math.round(Number(fields.seconds) / 60)} min`;
      break;
    case "UNIT":
      if (fields.value) metadata.unit = fields.value;
      break;
  }
}

export function parseGcode(text: string): ParsedGcode {
  const lines = text.split(/\r?\n/);
  const segments: GcodeSegment[] = [];
  const tools = new Map<number, ToolInfo>();
  const events: GcodeEvent[] = [];
  const metadata: Record<string, string> = {};
  const namedToolpaths = new Map<number, { name?: string; tool?: number }>();
  const toolpathAccumulators: ToolpathInfo[] = [];

  let x = 0, y = 0, z = 0;
  let positioned = false;
  let absolute = true;
  let scale = 1; // 25.4 when G20 (inches) is active
  let motion: 0 | 1 | 2 | 3 | null = null;
  let feed: number | null = null;
  let tool: number | null = null;
  let spindle: number | null = null;
  let currentToolpath = -1;
  let cutDistance = 0;
  let rapidDistance = 0;

  const ensureToolpath = (firstLine: number): ToolpathInfo => {
    if (currentToolpath < 0) startToolpath(firstLine, undefined);
    return toolpathAccumulators[currentToolpath];
  };

  const startToolpath = (firstLine: number, markerNumber: number | undefined): void => {
    currentToolpath = toolpathAccumulators.length;
    const named = markerNumber !== undefined ? namedToolpaths.get(markerNumber) : undefined;
    toolpathAccumulators.push({
      index: currentToolpath,
      name: named?.name,
      tool: named?.tool ?? tool,
      // Filled in from the live spindle value at the first cutting move, so a
      // marker that precedes M3 S… doesn't freeze the previous toolpath's RPM.
      spindleRpm: null,
      segments: 0,
      cutDistance: 0,
      rapidDistance: 0,
      minZ: Infinity,
      maxZ: -Infinity,
      firstLine
    });
  };

  for (let lineNo = 0; lineNo < lines.length; lineNo++) {
    let line = lines[lineNo].trim();
    if (!line) continue;

    // Comments: whole-line `;...` (including MKR metadata) and inline `(...)`.
    if (line.startsWith(";")) {
      if (line.startsWith(";@MKR|")) {
        const body = line.slice(1);
        if (body.includes("TOOLPATH_START")) {
          const match = /toolpath_number=(\d+)/.exec(body);
          startToolpath(lineNo + 1, match ? Number(match[1]) : undefined);
          events.push({ line: lineNo + 1, kind: "toolpath-marker", detail: line.slice(1) });
        } else {
          parseMkrComment(body, tools, metadata, namedToolpaths);
        }
      }
      continue;
    }
    line = line.replace(/\([^)]*\)/g, "").replace(/;.*$/, "").trim();
    if (!line) continue;

    const words: Array<[string, number]> = [];
    const wordRe = /([A-Za-z])\s*([+-]?\d*\.?\d+)/g;
    let m: RegExpExecArray | null;
    while ((m = wordRe.exec(line)) !== null) {
      words.push([m[1].toUpperCase(), Number(m[2])]);
    }
    if (!words.length) continue;

    let targetX: number | null = null;
    let targetY: number | null = null;
    let targetZ: number | null = null;
    let arcI = 0, arcJ = 0;
    let hasArcCenter = false;
    let lineMotion: 0 | 1 | 2 | 3 | null = null;
    let toolWord: number | null = null;

    for (const [letter, value] of words) {
      switch (letter) {
        case "G": {
          const code = Math.floor(value);
          if (code === 0 || code === 1 || code === 2 || code === 3) {
            lineMotion = code as 0 | 1 | 2 | 3;
            motion = lineMotion;
          } else if (code === 20) scale = 25.4;
          else if (code === 21) scale = 1;
          else if (code === 90) absolute = true;
          else if (code === 91) absolute = false;
          else if (code === 28) {
            events.push({ line: lineNo + 1, kind: "home", detail: "G28 home" });
            x = 0; y = 0; z = 0;
          }
          break;
        }
        case "X": targetX = value * scale; break;
        case "Y": targetY = value * scale; break;
        case "Z": targetZ = value * scale; break;
        case "I": arcI = value * scale; hasArcCenter = true; break;
        case "J": arcJ = value * scale; hasArcCenter = true; break;
        case "F": feed = value * scale; break;
        case "S": spindle = value; break;
        case "T": toolWord = Math.floor(value); break;
        case "M": {
          const code = Math.floor(value);
          if (code === 6) {
            tool = toolWord ?? tool;
            // In files without MKR toolpath markers, a tool change is the
            // natural toolpath boundary. A freshly marker-started (empty)
            // toolpath keeps its identity instead.
            if (currentToolpath < 0 || toolpathAccumulators[currentToolpath].segments > 0) {
              startToolpath(lineNo + 1, undefined);
            }
            toolpathAccumulators[currentToolpath].tool = tool;
            events.push({
              line: lineNo + 1,
              kind: "tool-change",
              detail: `T${tool ?? "?"} M6${tool !== null && tools.get(tool)?.name ? ` — ${tools.get(tool)!.name}` : ""}`
            });
          } else if (code === 3 || code === 4) {
            events.push({ line: lineNo + 1, kind: "spindle-on", detail: `M${code} S${spindle ?? "?"}` });
          } else if (code === 5) {
            events.push({ line: lineNo + 1, kind: "spindle-off", detail: "M5" });
          } else if (code === 2 || code === 30) {
            events.push({ line: lineNo + 1, kind: "program-end", detail: `M${code}` });
          }
          break;
        }
      }
    }
    // A bare T word without M6 on the same line still selects the tool.
    if (toolWord !== null && tool !== toolWord) tool = toolWord;

    const effectiveMotion = lineMotion ?? motion;
    if (effectiveMotion === null) continue;
    if (targetX === null && targetY === null && targetZ === null) continue;

    const nx = targetX === null ? x : absolute ? targetX : x + targetX;
    const ny = targetY === null ? y : absolute ? targetY : y + targetY;
    const nz = targetZ === null ? z : absolute ? targetZ : z + targetZ;

    const emit = (px: number, py: number, pz: number, qx: number, qy: number, qz: number) => {
      const rapid = effectiveMotion === 0;
      const segment: GcodeSegment = {
        x1: px, y1: py, z1: pz, x2: qx, y2: qy, z2: qz,
        rapid,
        feed: rapid ? null : feed,
        tool,
        toolpath: ensureToolpath(lineNo + 1).index,
        line: lineNo + 1
      };
      segments.push(segment);
      const tp = toolpathAccumulators[segment.toolpath];
      const d = Math.hypot(qx - px, qy - py, qz - pz);
      tp.segments++;
      if (rapid) {
        tp.rapidDistance += d;
        rapidDistance += d;
      } else {
        tp.cutDistance += d;
        cutDistance += d;
      }
      tp.minZ = Math.min(tp.minZ, qz);
      tp.maxZ = Math.max(tp.maxZ, qz);
      if (tp.tool === null) tp.tool = tool;
      if (!rapid && tp.spindleRpm === null) tp.spindleRpm = spindle;
    };

    if (positioned && (effectiveMotion === 2 || effectiveMotion === 3) && hasArcCenter) {
      // Approximate an XY-plane arc with short chords.
      const cx = x + arcI;
      const cy = y + arcJ;
      const radius = Math.hypot(x - cx, y - cy);
      let startAngle = Math.atan2(y - cy, x - cx);
      let endAngle = Math.atan2(ny - cy, nx - cx);
      const clockwise = effectiveMotion === 2;
      if (clockwise && endAngle >= startAngle) endAngle -= Math.PI * 2;
      if (!clockwise && endAngle <= startAngle) endAngle += Math.PI * 2;
      const sweep = endAngle - startAngle;
      const steps = Math.max(2, Math.ceil((Math.abs(sweep) * Math.max(radius, 0.1)) / 0.2));
      let px = x, py = y, pz = z;
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const angle = startAngle + sweep * t;
        const qx = cx + radius * Math.cos(angle);
        const qy = cy + radius * Math.sin(angle);
        const qz = z + (nz - z) * t;
        emit(px, py, pz, qx, qy, qz);
        px = qx; py = qy; pz = qz;
      }
    } else if (positioned) {
      emit(x, y, z, nx, ny, nz);
    }

    x = nx; y = ny; z = nz;
    positioned = true;
  }

  let bounds: ParsedGcode["bounds"] = null;
  for (const s of segments) {
    // Rapids to/from clearance height distort Z bounds less than they help; include XY of everything, Z of cuts only.
    if (!bounds) {
      bounds = { minX: s.x2, maxX: s.x2, minY: s.y2, maxY: s.y2, minZ: Infinity, maxZ: -Infinity };
    }
    for (const [bx, by] of [[s.x1, s.y1], [s.x2, s.y2]] as const) {
      bounds.minX = Math.min(bounds.minX, bx);
      bounds.maxX = Math.max(bounds.maxX, bx);
      bounds.minY = Math.min(bounds.minY, by);
      bounds.maxY = Math.max(bounds.maxY, by);
    }
    if (!s.rapid) {
      bounds.minZ = Math.min(bounds.minZ, s.z1, s.z2);
      bounds.maxZ = Math.max(bounds.maxZ, s.z1, s.z2);
    }
  }
  if (bounds && bounds.minZ === Infinity) {
    bounds.minZ = 0;
    bounds.maxZ = 0;
  }

  return {
    segments,
    tools,
    toolpaths: toolpathAccumulators,
    events,
    metadata,
    bounds,
    lineCount: lines.length,
    cutDistance,
    rapidDistance
  };
}
