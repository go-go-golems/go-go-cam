import type { Model, Toolpath } from "./types";
import { clamp, fmt } from "./utils";
import { parseGcode } from "../gcode/parser";

export interface ToolSpec {
  /** T number emitted in the program. */
  number: number;
  name: string;
  type: "engraving" | "flat";
  /** Cutting diameter in mm (flat) or shank diameter (engraving). */
  diameter: number;
  tipDiameter?: number;
  /** V-bit half angle in degrees (engraving tools). */
  halfAngle?: number;
  /** Makera product id for the MKR TOOL line; defaults per type. */
  id?: string;
  spindleRpm: number;
  feedXY: number;
  feedPlunge: number;
}

/**
 * Header defaults copied from testdata/MakeraBadge.nc (a real MakeraStudio
 * export) so generated jobs look native to Makera tooling.
 */
const MKR_DEFAULTS = {
  schema: "v=1.0.0",
  machine: "id=Z1|name=Makera Z1",
  material: "id=1214321200100001|name3=Bicolor Stock - Gold on Black / 1.3mm(100mm*200mm)|name1=Plastic|name2=ABS",
  stockLength: 100,
  stockWidth: 100,
  stockDiameter: 1,
  originType: "topFrontLeft",
  toolIds: { flat: "112111313812", engraving: "122111033830" } as const
};

function mkrToolLine(tool: ToolSpec): string {
  const isFlat = tool.type === "flat";
  const tip = tool.tipDiameter ?? (isFlat ? tool.diameter : 0.3);
  return `;@MKR|TOOL|number=${tool.number}|id=${tool.id ?? MKR_DEFAULTS.toolIds[tool.type]}` +
    `|name=${tool.name}|type=${isFlat ? "Flat End" : "Engraving"}` +
    `|handlediameter=3.175|sticklength=0|shoulderlength=${isFlat ? 12 : 0}|flutelength=${isFlat ? 12 : 5}` +
    `|diameter=${fmt(tool.diameter)}|tipdiameter=${fmt(tip)}|cornerradius=0|angle=0|halfAngle=${fmt(tool.halfAngle ?? 0)}`;
}

export interface Operation {
  /** Display name, e.g. "[T1]Flat Clearing". Also emitted as MKR TOOLPATH name. */
  name: string;
  tool: ToolSpec;
  paths: Toolpath[];
  /**
   * Z cut levels relative to surface, shallow to deep, e.g. [-0.5, -1, -1.5]
   * for a cut-through ladder or [-0.12] for a single engraving pass. Detail
   * paths (variable depth) ignore this and use their own per-point depths.
   */
  passDepths: number[];
}

/** Build the Z ladder for a cut-through operation (cutout / deep pocket). */
export function makePassLadder(totalDepth: number, stepdown: number): number[] {
  const depths: number[] = [];
  const step = Math.max(0.05, stepdown);
  for (let z = step; z < totalDepth - 1e-9; z += step) depths.push(-z);
  depths.push(-totalDepth);
  return depths;
}

/**
 * Emit a complete multi-tool program in the Makera style verified against
 * testdata/MakeraBadge.nc: MKR metadata header, per-toolpath markers, spindle
 * stopped across tool changes, G28 + M2 at the end.
 */
export function generateProgram(ops: Operation[], model: Model, jobName: string): string {
  const s = model.settings;
  const safeAbsolute = s.surfaceZ + s.safeZ;
  const active = ops.filter((op) => op.paths.length > 0);
  // Body is built first so the header's TIME line can carry its actual
  // motion-time estimate (computed by round-tripping through our parser).
  const lines: string[] = [];

  lines.push(`(${jobName.replace(/[()]/g, "")})`);
  lines.push("G21", "G90", "G17", "G94");
  lines.push(`G0 Z${fmt(safeAbsolute)}`);

  let currentTool: number | null = null;
  let spindleOn = false;

  // Three-tier Z scheme (MILL-03, mirrors MakeraBadge.nc):
  //   clearance (safeZ)  — travel + op boundaries + toolchanges
  //   approach (approachZ) — rapid-descend-to height before a feed plunge
  //   hop (hopZ)          — retract height for short repositions, entered back
  //                         through a feed-engage step 0.1mm below hop height
  // Retracts are DEFERRED: the height is chosen when the next destination is
  // known (DR-4). A zero-distance reposition on a deeper ladder pass plunges
  // straight down with no lift at all.
  const clearanceAbs = safeAbsolute;
  const approachAbs = s.surfaceZ + s.approachZ;
  const hopAbs = s.surfaceZ + s.hopZ;
  const engageAbs = Math.max(s.surfaceZ + 0.05, hopAbs - 0.1);

  let atX = 0;
  let atY = 0;
  let atDepth = false;
  let positioned = false;

  active.forEach((op, i) => {
    lines.push(`;@MKR|TOOLPATH_START|toolpath_number=${i + 1}`);
    let skipFirstXY = false;
    if (currentTool !== op.tool.number) {
      if (spindleOn) {
        lines.push("M5");
        spindleOn = false;
      }
      lines.push(`; T${op.tool.number}-${op.tool.name}`);
      lines.push(`T${op.tool.number} M6`);
      currentTool = op.tool.number;
      // Makera prologue: XY first (machine sits at home Z after the change),
      // spindle on, then an extra-cautious descent from clearance + 2.
      const firstPath = op.paths.find((p) => p.points.length);
      if (firstPath) {
        const p0 = firstPath.points[0];
        lines.push(`G0 X${fmt(p0.x)} Y${fmt(p0.y)}`);
        atX = p0.x;
        atY = p0.y;
        positioned = true;
        skipFirstXY = true;
      }
      if (s.emitSpindle) {
        lines.push(`S${op.tool.spindleRpm} M3`);
        spindleOn = true;
      }
      lines.push(`G0 Z${fmt(clearanceAbs + 2)}`);
      lines.push(`G0 Z${fmt(clearanceAbs)}`);
      atDepth = false;
    } else if (!spindleOn && s.emitSpindle) {
      lines.push(`S${op.tool.spindleRpm} M3`);
      spindleOn = true;
    }

    /** Get the tool to (tx, ty) ready to plunge; returns feed used to engage. */
    const reposition = (tx: number, ty: number): void => {
      const travel = positioned ? Math.hypot(tx - atX, ty - atY) : Infinity;
      const emitXY = !skipFirstXY;
      skipFirstXY = false;
      if (atDepth && travel < 0.001) {
        // Same XY (deeper ladder pass): continue straight down, no lift.
        return;
      }
      if (atDepth && travel <= s.hopMaxTravel) {
        lines.push(`G0 Z${fmt(hopAbs)}`);
        if (emitXY) lines.push(`G0 X${fmt(tx)} Y${fmt(ty)}`);
        lines.push(`G1 Z${fmt(engageAbs)} F${fmt(op.tool.feedXY, 1)}`);
      } else {
        if (atDepth) lines.push(`G0 Z${fmt(clearanceAbs)}`);
        if (emitXY) lines.push(`G0 X${fmt(tx)} Y${fmt(ty)}`);
        lines.push(`G0 Z${fmt(approachAbs)}`);
      }
      atX = tx;
      atY = ty;
      positioned = true;
      atDepth = false;
    };

    for (const passZ of op.passDepths) {
      for (const path of op.paths) {
        if (!path.points.length) continue;
        if (path.kind === "detail" && passZ !== op.passDepths[0]) continue;
        const first = path.points[0];
        reposition(first.x, first.y);
        if (path.kind === "detail") {
          // Variable-depth V-details carry their own Z per point; they only
          // run once, on the shallowest (single) pass.
          const firstDepth = clamp(first.depth || 0, 0, -Math.min(...op.passDepths));
          lines.push(`G1 Z${fmt(s.surfaceZ - firstDepth)} F${fmt(op.tool.feedPlunge, 1)}`);
          for (let p = 1; p < path.points.length; p++) {
            const pt = path.points[p];
            const depth = clamp(pt.depth || 0, 0, -Math.min(...op.passDepths));
            lines.push(`G1 X${fmt(pt.x)} Y${fmt(pt.y)} Z${fmt(s.surfaceZ - depth)}${p === 1 ? ` F${fmt(op.tool.feedXY, 1)}` : ""}`);
          }
        } else {
          const constDepth = path.depth !== undefined ? Math.min(path.depth, -passZ) : -passZ;
          lines.push(`G1 Z${fmt(s.surfaceZ - constDepth)} F${fmt(op.tool.feedPlunge, 1)}`);
          for (let p = 1; p < path.points.length; p++) {
            const pt = path.points[p];
            lines.push(`G1 X${fmt(pt.x)} Y${fmt(pt.y)}${p === 1 ? ` F${fmt(op.tool.feedXY, 1)}` : ""}`);
          }
        }
        const last = path.points[path.points.length - 1];
        atX = last.x;
        atY = last.y;
        atDepth = true;
      }
    }

    // Op boundary: always return to full clearance.
    if (atDepth) {
      lines.push(`G0 Z${fmt(clearanceAbs)}`);
      atDepth = false;
    }
  });

  if (spindleOn) lines.push("M5");
  lines.push("G28", "M2", "");

  const body = lines.join("\n");
  const estimatedSeconds = Math.round(parseGcode(body).estimatedMinutes * 60);

  const header: string[] = [];
  header.push(";@MKR|BEGIN");
  header.push(`;@MKR|SCHEMA|${MKR_DEFAULTS.schema}`);
  header.push(`;@MKR|MACHINE|${MKR_DEFAULTS.machine}`);
  header.push(`;@MKR|MATERIAL|${MKR_DEFAULTS.material}`);
  header.push(
    `;@MKR|STOCK|id=cuboid|length=${fmt(MKR_DEFAULTS.stockLength)}|width=${fmt(MKR_DEFAULTS.stockWidth)}` +
    `|height=${fmt(s.stockThickness)}|diameter=${fmt(MKR_DEFAULTS.stockDiameter)}`
  );
  header.push(
    `;@MKR|ORIGIN|id=0|type_name=${MKR_DEFAULTS.originType}` +
    `|x=${fmt(-MKR_DEFAULTS.stockLength / 2)}|y=${fmt(-MKR_DEFAULTS.stockWidth / 2)}|z=${fmt(s.stockThickness / 2)}`
  );
  header.push(";@MKR|CAM|id=abs-bicolor-v-engraver|name=ABS Bicolor V-Engraver|v=0.1.0");
  header.push(";@MKR|UNIT|value=mm");
  const seenTools = new Map<number, ToolSpec>();
  for (const op of active) seenTools.set(op.tool.number, op.tool);
  for (const tool of [...seenTools.values()].sort((a, b) => a.number - b.number)) {
    header.push(mkrToolLine(tool));
  }
  header.push(`;@MKR|TIME|seconds=${estimatedSeconds}`);
  active.forEach((op, i) => {
    header.push(`;@MKR|TOOLPATH|number=${i + 1}|tool_number=${op.tool.number}|name=${op.name}`);
  });
  header.push(";@MKR|END");

  return header.join("\n") + "\n" + body;
}
