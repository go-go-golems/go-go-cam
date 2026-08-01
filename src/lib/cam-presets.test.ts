import { describe, expect, it } from "vitest";
import { buildCamPreset, diffCamPreset, formatCamPreset, parseCamPreset, settingIdsForScope } from "./cam-presets";

const all = {
  capThickness: 0.1, breakthrough: 0.02, flatDiameter: 3.175, flatRpm: 10000, flatFeed: 800, flatPlunge: 200,
  flatClearing: true, flatClearingStepdown: 0.1, stepover: 45, originX: 0, originY: 0, safeZ: 3
};

describe("CAM scoped presets", () => {
  it("exports only controls belonging to the requested scope", () => {
    const preset = buildCamPreset("ABS", "t1-clearing", all);
    expect(Object.keys(preset.values).sort()).toEqual(settingIdsForScope("t1-clearing").sort());
    expect(preset.values).not.toHaveProperty("originX");
    expect(parseCamPreset(formatCamPreset(preset))).toEqual(preset);
  });

  it("reports changed values and rejects fields outside a recipe scope", () => {
    const preset = buildCamPreset("ABS", "t1-clearing", all);
    expect(diffCamPreset(preset, { ...all, flatFeed: 700 })).toContain("flatFeed");
    expect(() => parseCamPreset(JSON.stringify({ ...preset, values: { originX: 3 } }))).toThrow("not allowed");
  });
});
