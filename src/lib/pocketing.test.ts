import { describe, expect, it } from "vitest";
import { chamferDistance } from "./imaging";
import { extractIsoContours, makeContourPocketPaths } from "./pocketing";
import { makePassLadder, generateProgram, type Operation, type ToolSpec } from "./operations";
import { parseGcode } from "../gcode/parser";
import type { Model, Settings } from "./types";

function diskMask(size: number, radius: number): Uint8Array {
  const mask = new Uint8Array(size * size);
  const c = (size - 1) / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (Math.hypot(x - c, y - c) <= radius) mask[y * size + x] = 1;
    }
  }
  return mask;
}

/** Two 20px-wide lobes joined by a 4px neck — splits under a >2px inset. */
function dumbbellMask(width: number, height: number): Uint8Array {
  const mask = new Uint8Array(width * height);
  const set = (x0: number, y0: number, x1: number, y1: number) => {
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) mask[y * width + x] = 1;
  };
  set(4, 10, 24, 30);
  set(40, 10, 60, 30);
  set(24, 18, 40, 22);
  return mask;
}

function testModel(width: number, height: number): Model {
  const settings = {
    simplifyTolerance: 0,
    originX: 0,
    originY: 0,
    mirrorX: false,
    mirrorY: false,
    surfaceZ: 0,
    safeZ: 3,
    approachZ: 2,
    hopZ: 2,
    hopMaxTravel: 5,
    emitSpindle: true,
    stockThickness: 1.3
  } as Settings;
  return {
    settings,
    width,
    height,
    finishedWidth: width, // 1mm per px for easy assertions
    finishedHeight: height,
    scaleX: 1,
    scaleY: 1,
    mmPerPx: 1,
    mask: new Uint8Array(width * height),
    rgba: new Uint8ClampedArray(width * height * 4),
    toolpaths: []
  };
}

describe("extractIsoContours", () => {
  it("returns one shrinking loop per level on a disk", () => {
    const size = 64;
    const mask = diskMask(size, 25);
    const dist = chamferDistance(mask, size, size, false);
    const outer = extractIsoContours(dist, size, size, 2);
    const inner = extractIsoContours(dist, size, size, 15);
    expect(outer.loops.length).toBe(1);
    expect(inner.loops.length).toBe(1);
    expect(inner.area).toBeLessThan(outer.area);
  });

  it("returns nothing past the incircle radius", () => {
    const size = 64;
    const dist = chamferDistance(diskMask(size, 20), size, size, false);
    expect(extractIsoContours(dist, size, size, 25).loops.length).toBe(0);
  });

  it("splits into two loops when a neck collapses", () => {
    const w = 64, h = 40;
    const dist = chamferDistance(dumbbellMask(w, h), w, h, false);
    const joined = extractIsoContours(dist, w, h, 1);
    const split = extractIsoContours(dist, w, h, 4);
    expect(joined.loops.length).toBe(1);
    expect(split.loops.length).toBe(2);
  });
});

describe("makeContourPocketPaths", () => {
  it("produces closed rings, innermost first, finish ring last", () => {
    const size = 64;
    const model = testModel(size, size);
    const dist = chamferDistance(diskMask(size, 25), size, size, false);
    const paths = makeContourPocketPaths(dist, model, 2, 4, 0.12, { link: false });
    expect(paths.length).toBeGreaterThan(3);
    for (const p of paths) {
      expect(p.closed).toBe(true);
      expect(p.depth).toBe(0.12);
      const first = p.points[0];
      const last = p.points[p.points.length - 1];
      expect(first.x).toBeCloseTo(last.x);
      expect(first.y).toBeCloseTo(last.y);
    }
    // ring extent should grow from first (innermost) to last (finish pass)
    const spanX = (points: { x: number }[]) =>
      Math.max(...points.map((p) => p.x)) - Math.min(...points.map((p) => p.x));
    expect(spanX(paths[0].points)).toBeLessThan(spanX(paths[paths.length - 1].points));
  });

  it("never emits duplicate rings at sub-pixel stepover", () => {
    const size = 64;
    const model = testModel(size, size);
    const dist = chamferDistance(diskMask(size, 20), size, size, false);
    const paths = makeContourPocketPaths(dist, model, 2, 0.3, 0.12, { link: false });
    const serialized = paths.map((p) => p.points.map((q) => `${q.x},${q.y}`).join(";"));
    expect(new Set(serialized).size).toBe(serialized.length);
  });

  it("links concentric rings into a stay-down pass on a convex pocket", () => {
    const size = 64;
    const model = testModel(size, size);
    const dist = chamferDistance(diskMask(size, 25), size, size, false);
    const unlinked = makeContourPocketPaths(dist, model, 2, 4, 0.12, { link: false });
    const linked = makeContourPocketPaths(dist, model, 2, 4, 0.12);
    expect(unlinked.length).toBeGreaterThan(3);
    expect(linked.length).toBe(1);
    // same total geometry, just merged
    const count = (paths: typeof linked) => paths.reduce((n, p) => n + p.points.length, 0);
    expect(count(linked)).toBe(count(unlinked));
  });

  it("returns no paths when the tool cannot fit", () => {
    const size = 32;
    const model = testModel(size, size);
    const dist = chamferDistance(diskMask(size, 5), size, size, false);
    expect(makeContourPocketPaths(dist, model, 10, 2, 0.1)).toEqual([]);
  });
});

describe("makePassLadder", () => {
  it("builds the Makera-style stepdown ladder", () => {
    expect(makePassLadder(1.5, 0.5)).toEqual([-0.5, -1, -1.5]);
    expect(makePassLadder(1.3, 0.5)).toEqual([-0.5, -1, -1.3]);
    expect(makePassLadder(0.3, 0.5)).toEqual([-0.3]);
  });
});

describe("generateProgram", () => {
  const engraver: ToolSpec = {
    number: 2, name: "0.3mm Engraver", type: "engraving",
    diameter: 3.175, tipDiameter: 0.3, spindleRpm: 12000, feedXY: 1000, feedPlunge: 500
  };
  const flat: ToolSpec = {
    number: 1, name: "3.175mm Flat", type: "flat",
    diameter: 3.175, spindleRpm: 10000, feedXY: 300, feedPlunge: 150
  };
  const square = (d: number) => ({
    kind: "raster" as const,
    depth: d,
    closed: true,
    points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }, { x: 0, y: 0 }]
  });

  it("emits tool changes with spindle stopped in between and MKR markers", () => {
    const model = testModel(32, 32);
    const ops: Operation[] = [
      { name: "[T2]Engrave", tool: engraver, paths: [square(0.12)], passDepths: [-0.12] },
      { name: "[T1]Cutout", tool: flat, paths: [square(1.5)], passDepths: makePassLadder(1.5, 0.5) }
    ];
    const gcode = generateProgram(ops, model, "test job");
    const lines = gcode.split("\n");

    expect(lines).toContain("T2 M6");
    expect(lines).toContain("T1 M6");
    expect(lines).toContain("S12000 M3");
    expect(lines).toContain("S10000 M3");
    expect(lines).toContain(";@MKR|TOOLPATH_START|toolpath_number=1");
    expect(lines).toContain(";@MKR|TOOLPATH_START|toolpath_number=2");
    // spindle must stop before the T1 change
    const m5Index = lines.indexOf("M5");
    const t1Index = lines.indexOf("T1 M6");
    expect(m5Index).toBeGreaterThan(-1);
    expect(m5Index).toBeLessThan(t1Index);
    // cutout runs its square at all three ladder depths
    expect(lines.filter((l) => l === "G1 Z-0.5 F150").length).toBe(1);
    expect(lines.filter((l) => l === "G1 Z-1 F150").length).toBe(1);
    expect(lines.filter((l) => l === "G1 Z-1.5 F150").length).toBe(1);
    expect(lines[lines.length - 3]).toBe("G28");
    expect(lines[lines.length - 2]).toBe("M2");
  });

  it("emits the full Makera-style prelude with example-file defaults", () => {
    const model = testModel(32, 32);
    const gcode = generateProgram(
      [{ name: "[T2]Engrave", tool: { ...engraver, halfAngle: 15 }, paths: [square(0.12)], passDepths: [-0.12] },
       { name: "[T1]Cutout", tool: flat, paths: [square(1.5)], passDepths: makePassLadder(1.5, 0.5) }],
      model, "test job"
    );
    const lines = gcode.split("\n");
    expect(lines[0]).toBe(";@MKR|BEGIN");
    expect(lines).toContain(";@MKR|SCHEMA|v=1.0.0");
    expect(lines).toContain(";@MKR|MACHINE|id=Z1|name=Makera Z1");
    expect(lines).toContain(
      ";@MKR|MATERIAL|id=1214321200100001|name3=Bicolor Stock - Gold on Black / 1.3mm(100mm*200mm)|name1=Plastic|name2=ABS"
    );
    expect(lines).toContain(";@MKR|STOCK|id=cuboid|length=100|width=100|height=1.3|diameter=1");
    expect(lines).toContain(";@MKR|ORIGIN|id=0|type_name=topFrontLeft|x=-50|y=-50|z=0.65");
    const time = lines.find((l) => l.startsWith(";@MKR|TIME|seconds="));
    expect(time).toBeDefined();
    expect(Number(time!.split("=")[1])).toBeGreaterThan(0);
    // tools sorted ascending with full geometry fields and default product ids
    const toolLines = lines.filter((l) => l.startsWith(";@MKR|TOOL|"));
    expect(toolLines[0]).toContain("number=1|id=112111313812");
    expect(toolLines[0]).toContain("shoulderlength=12|flutelength=12");
    expect(toolLines[1]).toContain("number=2|id=122111033830");
    expect(toolLines[1]).toContain("tipdiameter=0.3");
    expect(toolLines[1]).toContain("halfAngle=15");
    // round-trip: our own parser surfaces the metadata
    const parsed = parseGcode(gcode);
    expect(parsed.metadata.machine).toBe("Makera Z1");
    expect(parsed.metadata.stock).toBe("100 × 100 × 1.3 mm");
    expect(parsed.tools.get(1)?.name).toBe("3.175mm Flat");
  });

  it("uses hop cycle for short repositions and full cycle for long ones", () => {
    const model = testModel(32, 32);
    const near = (ox: number) => ({
      kind: "raster" as const,
      depth: 0.12,
      closed: true,
      points: [{ x: ox, y: 0 }, { x: ox + 1, y: 0 }, { x: ox + 1, y: 1 }, { x: ox, y: 1 }, { x: ox, y: 0 }]
    });
    const gcode = generateProgram(
      [{ name: "[T2]Engrave", tool: engraver, paths: [near(0), near(3), near(20)], passDepths: [-0.12] }],
      model, "cycles"
    );
    const lines = gcode.split("\n");
    // square 1 -> square 2: 3mm travel <= 5mm -> hop cycle with feed-engage
    const hopTravel = lines.indexOf("G0 X3 Y0");
    expect(hopTravel).toBeGreaterThan(-1);
    expect(lines[hopTravel - 1]).toBe("G0 Z2");
    expect(lines[hopTravel + 1]).toBe("G1 Z1.9 F1000");
    expect(lines[hopTravel + 2]).toBe("G1 Z-0.12 F500");
    // square 2 -> square 3: 16mm travel -> full cycle: clearance, travel, approach
    const fullAt = lines.indexOf("G0 X20 Y0");
    expect(lines[fullAt - 1]).toBe("G0 Z3");
    expect(lines[fullAt + 1]).toBe("G0 Z2");
    expect(lines[fullAt + 2]).toBe("G1 Z-0.12 F500");
  });

  it("emits the Makera toolchange prologue and direct ladder re-plunge", () => {
    const model = testModel(32, 32);
    const gcode = generateProgram(
      [{ name: "[T1]Cutout", tool: flat, paths: [square(1.5)], passDepths: makePassLadder(1.5, 0.5) }],
      model, "prologue"
    );
    const lines = gcode.split("\n");
    // prologue: T1 M6, XY, S M3, Z5, Z3, then approach + plunge
    const m6 = lines.indexOf("T1 M6");
    expect(lines[m6 + 1]).toBe("G0 X0 Y0");
    expect(lines[m6 + 2]).toBe("S10000 M3");
    expect(lines[m6 + 3]).toBe("G0 Z5");
    expect(lines[m6 + 4]).toBe("G0 Z3");
    expect(lines[m6 + 5]).toBe("G0 Z2");
    expect(lines[m6 + 6]).toBe("G1 Z-0.5 F150");
    // closed square: each ladder pass ends where the next begins -> straight
    // deepening with no lift between passes
    const secondPlunge = lines.indexOf("G1 Z-1 F150");
    expect(lines[secondPlunge - 1]).toBe("G1 X0 Y0");
    const thirdPlunge = lines.indexOf("G1 Z-1.5 F150");
    expect(lines[thirdPlunge - 1]).toBe("G1 X0 Y0");
  });

  it("skips empty operations entirely", () => {
    const model = testModel(32, 32);
    const gcode = generateProgram(
      [{ name: "[T1]Empty", tool: flat, paths: [], passDepths: [-1] },
       { name: "[T2]Engrave", tool: engraver, paths: [square(0.12)], passDepths: [-0.12] }],
      model, "test"
    );
    expect(gcode).not.toContain("T1 M6");
    expect(gcode).toContain(";@MKR|TOOLPATH_START|toolpath_number=1");
    expect(gcode).not.toContain("toolpath_number=2");
  });
});
